// Sesión: entrar, quién soy, salir y cambiar la contraseña.
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { eq, and, ne } from 'drizzle-orm';
import { z } from 'zod';
import { sesiones, usuarios } from '@processiq/db';
import { registrar } from '../auditoria.js';
import { ErrorHttp, type Entorno } from '../contexto.js';
import {
  COOKIE_SESION, hashParaUsuarioInexistente, hashearClave, nuevoToken, problemaConClave, verificarClave
} from '../seguridad.js';
import { cuerpo } from '../validar.js';

/**
 * Frena la fuerza bruta: más de 10 fallos en 15 minutos por correo o por IP
 * bloquean ese correo o IP hasta que pase la ventana. En memoria: hay una
 * sola instancia de la API.
 */
export class LimitadorAccesos {
  private fallos = new Map<string, { n: number; desde: number }>();
  constructor(private max = 10, private ventanaMs = 15 * 60 * 1000) {}

  private vigente(clave: string) {
    const f = this.fallos.get(clave);
    if (f && Date.now() - f.desde > this.ventanaMs) { this.fallos.delete(clave); return undefined; }
    return f;
  }
  bloqueado(...claves: string[]): boolean {
    return claves.some((k) => (this.vigente(k)?.n ?? 0) >= this.max);
  }
  fallo(...claves: string[]): void {
    for (const k of claves) {
      const f = this.vigente(k) ?? { n: 0, desde: Date.now() };
      f.n++;
      this.fallos.set(k, f);
    }
  }
  exito(clave: string): void { this.fallos.delete(clave); }
}

const EntrarEsquema = z.object({ email: z.string().trim().toLowerCase().email().max(200), clave: z.string().min(1).max(200) });
const CambioEsquema = z.object({ actual: z.string().min(1).max(200), nueva: z.string().max(200) });

const publico = (u: { id: string; email: string; nombre: string; rol: string; debeCambiarClave: boolean }) =>
  ({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, debeCambiarClave: u.debeCambiarClave });

export function rutasSesion(limitador: LimitadorAccesos) {
  const r = new Hono<Entorno>();

  r.post('/', async (c) => {
    const db = c.get('db'), config = c.get('config');
    const { email, clave } = await cuerpo(c, EntrarEsquema);
    const kEmail = 'email:' + email, kIp = 'ip:' + c.get('ip');
    if (limitador.bloqueado(kEmail, kIp)) {
      throw new ErrorHttp(429, 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a intentarlo.', 'BLOQUEADO');
    }
    const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
    // Se verifica siempre (también sin usuario) para no delatar qué correos existen
    const valida = await verificarClave(clave, u?.hashClave ?? await hashParaUsuarioInexistente());
    if (!u || !valida || !u.activo) {
      limitador.fallo(kEmail, kIp);
      await registrar(c, 'sesion.fallida', 'usuario', u?.id ?? null, { email }, null);
      throw new ErrorHttp(401, 'Correo o contraseña incorrectos.', 'CREDENCIALES');
    }
    limitador.exito(kEmail);
    const { token, hash } = nuevoToken();
    const expiraEn = new Date(Date.now() + config.horasSesion * 3600 * 1000);
    await db.insert(sesiones).values({ usuarioId: u.id, tokenHash: hash, expiraEn, ip: c.get('ip'), agente: c.req.header('user-agent') ?? null });
    await db.update(usuarios).set({ ultimoAcceso: new Date() }).where(eq(usuarios.id, u.id));
    setCookie(c, COOKIE_SESION, token, {
      httpOnly: true, sameSite: 'Lax', path: '/', expires: expiraEn,
      secure: config.origenPublico.startsWith('https://')
    });
    await registrar(c, 'sesion.inicio', 'usuario', u.id, {}, u.id);
    return c.json({ usuario: publico(u) });
  });

  r.get('/', (c) => c.json({ usuario: publico(c.get('usuario')) }));

  r.delete('/', async (c) => {
    await c.get('db').delete(sesiones).where(eq(sesiones.id, c.get('sesionId')));
    deleteCookie(c, COOKIE_SESION, { path: '/' });
    await registrar(c, 'sesion.cierre', 'usuario', c.get('usuario').id);
    return c.body(null, 204);
  });

  // Cambiar la contraseña cierra las demás sesiones del usuario
  r.post('/clave', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    const { actual, nueva } = await cuerpo(c, CambioEsquema);
    const [u] = await db.select().from(usuarios).where(eq(usuarios.id, yo.id)).limit(1);
    if (!u || !(await verificarClave(actual, u.hashClave))) throw new ErrorHttp(400, 'La contraseña actual no es correcta.', 'CLAVE_ACTUAL');
    const problema = problemaConClave(nueva, u.email);
    if (problema) throw new ErrorHttp(400, problema, 'CLAVE_DEBIL');
    if (nueva === actual) throw new ErrorHttp(400, 'La nueva contraseña debe ser distinta de la actual.', 'CLAVE_DEBIL');
    await db.update(usuarios).set({ hashClave: await hashearClave(nueva), debeCambiarClave: false }).where(eq(usuarios.id, u.id));
    await db.delete(sesiones).where(and(eq(sesiones.usuarioId, u.id), ne(sesiones.id, c.get('sesionId'))));
    await registrar(c, 'usuario.cambio_clave', 'usuario', u.id);
    return c.body(null, 204);
  });

  return r;
}
