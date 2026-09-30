// Sesión: entrar, quién soy, salir y cambiar la contraseña; las sesiones abiertas
// de cada uno (verlas y cerrarlas) y, para el administrador, cerrar las de otra cuenta.
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { eq, and, desc, gt, ne } from 'drizzle-orm';
import { z } from 'zod';
import { sesiones, usuarios, type BaseDeDatos } from '@processiq/db';
import { registrar } from '../auditoria.js';
import { ErrorHttp, type Entorno } from '../contexto.js';
import { exigirAdmin } from '../permisos.js';
import {
  COOKIE_SESION, hashParaUsuarioInexistente, hashearClave, nuevoToken, problemaConClave, verificarClave
} from '../seguridad.js';
import { cuerpo, esUuid } from '../validar.js';

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

/** Navegador y sistema de una sesión, sin versiones: lo justo para reconocerla («Chrome en Windows»). */
export interface AgenteResumido { navegador: string | null; sistema: string | null }

// El orden importa: Edge y Opera también dicen «Chrome», y Chrome también dice «Safari»
const NAVEGADORES: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'], [/\b(OPR|Opera)\//, 'Opera'], [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(Firefox|FxiOS)\//, 'Firefox'], [/\b(Chrome|CriOS|HeadlessChrome|Chromium)\//, 'Chrome'], [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari']
];
// Android e iOS antes que Linux y macOS: sus agentes también los mencionan
const SISTEMAS: [RegExp, string][] = [
  [/\bWindows\b/, 'Windows'], [/\bAndroid\b/, 'Android'], [/\b(iPhone|iPad|iPod)\b/, 'iOS'], [/\bCrOS\b/, 'ChromeOS'],
  [/\b(Macintosh|Mac OS X)\b/, 'macOS'], [/\bLinux\b/, 'Linux']
];

export function resumirAgente(agente: string | null | undefined): AgenteResumido {
  const ua = agente ?? '';
  return {
    navegador: NAVEGADORES.find(([re]) => re.test(ua))?.[1] ?? null,
    sistema: SISTEMAS.find(([re]) => re.test(ua))?.[1] ?? null
  };
}

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
    const cerradas = await cerrarSesiones(db, u.id, c.get('sesionId'));
    await registrar(c, 'usuario.cambio_clave', 'usuario', u.id, { sesionesCerradas: cerradas });
    return c.body(null, 204);
  });

  // Mis sesiones vigentes (esta y las de otros navegadores o equipos). Nunca el token ni su hash.
  r.get('/lista', async (c) => {
    const yo = c.get('usuario'), actual = c.get('sesionId');
    const filas = await c.get('db').select({
      id: sesiones.id, creadaEn: sesiones.creadaEn, expiraEn: sesiones.expiraEn, ip: sesiones.ip, agente: sesiones.agente
    }).from(sesiones).where(and(eq(sesiones.usuarioId, yo.id), gt(sesiones.expiraEn, new Date()))).orderBy(desc(sesiones.creadaEn));
    const lista = filas.map(({ agente, ...s }) => ({ ...s, ...resumirAgente(agente), actual: s.id === actual }));
    // La actual primero; después, de la más reciente a la más antigua
    lista.sort((a, b) => Number(b.actual) - Number(a.actual));
    return c.json({ sesiones: lista });
  });

  // Cierra una sesión propia. La de otra persona no existe para quien pregunta: 404.
  r.delete('/lista/:id', async (c) => {
    const db = c.get('db'), yo = c.get('usuario'), id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'Sesión no encontrada.');
    const [borrada] = await db.delete(sesiones).where(and(eq(sesiones.id, id), eq(sesiones.usuarioId, yo.id))).returning({ id: sesiones.id });
    if (!borrada) throw new ErrorHttp(404, 'Sesión no encontrada.');
    if (id === c.get('sesionId')) {
      // Cerrar la propia es salir
      deleteCookie(c, COOKIE_SESION, { path: '/' });
      await registrar(c, 'sesion.cierre', 'usuario', yo.id);
    } else {
      await registrar(c, 'sesion.cierre_otra', 'usuario', yo.id, { sesionId: id });
    }
    return c.body(null, 204);
  });

  // Cierra todas mis sesiones menos esta (p. ej. me dejé la cuenta abierta en otro equipo)
  r.post('/cerrar-otras', async (c) => {
    const yo = c.get('usuario');
    const cerradas = await cerrarSesiones(c.get('db'), yo.id, c.get('sesionId'));
    await registrar(c, 'sesion.cierre_otras', 'usuario', yo.id, { cerradas });
    return c.json({ cerradas });
  });

  // Administración: cierra todas las sesiones de una cuenta de la organización (perdió un equipo, sospecha…).
  // Si el administrador se lo hace a sí mismo, conserva la sesión desde la que lo pide.
  r.post('/usuarios/:id/cerrar', async (c) => {
    const db = c.get('db'), yo = c.get('usuario'), id = c.req.param('id');
    exigirAdmin(yo);
    if (!esUuid(id)) throw new ErrorHttp(404, 'Usuario no encontrado.');
    const [u] = await db.select({ id: usuarios.id }).from(usuarios)
      .where(and(eq(usuarios.id, id), eq(usuarios.organizacionId, yo.organizacionId))).limit(1);
    if (!u) throw new ErrorHttp(404, 'Usuario no encontrado.');
    const cerradas = await cerrarSesiones(db, u.id, id === yo.id ? c.get('sesionId') : null);
    await registrar(c, 'sesion.cierre_admin', 'usuario', u.id, { cerradas });
    return c.json({ cerradas });
  });

  return r;
}

/**
 * Borra las sesiones de un usuario, salvo `conservar`. Devuelve cuántas seguían
 * vigentes (las caducadas también se borran, pero ya no contaban).
 */
async function cerrarSesiones(db: BaseDeDatos, usuarioId: string, conservar: string | null): Promise<number> {
  const borradas = await db.delete(sesiones)
    .where(conservar ? and(eq(sesiones.usuarioId, usuarioId), ne(sesiones.id, conservar)) : eq(sesiones.usuarioId, usuarioId))
    .returning({ expiraEn: sesiones.expiraEn });
  const ahora = Date.now();
  return borradas.filter((s) => s.expiraEn.getTime() > ahora).length;
}
