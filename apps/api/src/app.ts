// API de ProcessIQ (fase 2): cuentas locales, proyectos, procesos y revisiones.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie } from 'hono/cookie';
import { and, eq, gt } from 'drizzle-orm';
import { sesiones, usuarios, type BaseDeDatos } from '@processiq/db';
import type { Config } from './config.js';
import { ErrorHttp, type Entorno } from './contexto.js';
import { COOKIE_SESION, hashToken } from './seguridad.js';
import { LimitadorAccesos, rutasSesion } from './rutas/sesion.js';
import { rutasUsuarios } from './rutas/usuarios.js';
import { rutasProyectos } from './rutas/proyectos.js';
import { rutasProcesos } from './rutas/procesos.js';
import { rutasAuditoria } from './rutas/auditoria.js';
import { rutasDirectorio } from './rutas/directorio.js';
import { rutasIa } from './rutas/ia.js';
import { rutasCatalogos } from './rutas/catalogos.js';
import { rutasSistema } from './rutas/sistema.js';
import { registrarError } from './observabilidad.js';
import type { Escucha } from './ia/avisos.js';
import { rutasPortafolio } from './modulos/portafolio/index.js';
import { rutasInvitados, rutasPublicasInvitados } from './modulos/invitados/index.js';

/** Rutas que no exigen sesión. */
const PUBLICAS = new Set(['GET /api/salud', 'POST /api/sesion', 'POST /api/errores']);
/** Rutas permitidas con contraseña temporal pendiente de cambio. */
const CON_CLAVE_TEMPORAL = new Set(['GET /api/sesion', 'DELETE /api/sesion', 'POST /api/sesion/clave']);
/**
 * Prefijo de las rutas sin sesión que validan su propio token (ADR 20): no se
 * lee la cookie, así que no ven a ningún usuario. Tienen límite de uso por IP
 * y las escrituras siguen exigiendo el Origin de la web.
 */
const PREFIJO_PUBLICO = '/api/publico/';
/** Peticiones por IP y minuto a las rutas de PREFIJO_PUBLICO. */
const USOS_PUBLICOS_POR_MINUTO = 120;

export interface OpcionesApp {
  /** Avisos de Postgres (LISTEN) para el progreso en vivo de la IA; sin ella, el SSE sondea. */
  escucha?: Escucha;
  /** Cada cuánto re-lee el SSE si no llega ningún aviso (ms). */
  sondeoMs?: number;
}

export function crearApp(db: BaseDeDatos, config: Config, opciones: OpcionesApp = {}) {
  const app = new Hono<Entorno>();
  const limitador = new LimitadorAccesos();
  // Cuenta cada uso de una ruta pública como si fuera un fallo: pasado el máximo, 429 hasta que acabe el minuto
  const usosPublicos = new LimitadorAccesos(USOS_PUBLICOS_POR_MINUTO, 60_000);

  app.onError(async (err, c) => {
    if (err instanceof ErrorHttp) {
      return c.json({ error: { mensaje: err.message, codigo: err.codigo, detalles: err.detalles } }, err.estado);
    }
    // Inesperado: queda en «Sistema» y el usuario recibe una referencia para citarla
    const referencia = c.get('peticionId');
    const e = err as Error;
    console.error(JSON.stringify({ evento: 'error', id: referencia, ruta: c.req.path, mensaje: String(e && e.message) }));
    await registrarError(db, {
      origen: 'api', mensaje: String(e && e.message), pila: e && e.stack, ruta: `${c.req.method} ${c.req.path}`,
      usuarioId: c.get('usuario')?.id ?? null, agente: c.req.header('user-agent') ?? null, detalle: { referencia }
    });
    return c.json({ error: { mensaje: `Error interno del servidor (referencia ${referencia}).`, codigo: 'INTERNO', referencia } }, 500);
  });
  app.notFound((c) => c.json({ error: { mensaje: 'Ruta no encontrada.' } }, 404));

  // Identificador de petición y registro de acceso (escrituras, errores y lo lento)
  app.use('/api/*', async (c, next) => {
    const id = crypto.randomUUID().slice(0, 8);
    c.set('peticionId', id);
    c.header('X-Request-Id', id);
    const t0 = performance.now();
    await next();
    const ms = Math.round(performance.now() - t0);
    if (!['GET', 'HEAD'].includes(c.req.method) || c.res.status >= 500 || ms > 2000) {
      console.info(JSON.stringify({ evento: 'peticion', id, metodo: c.req.method, ruta: c.req.path, estado: c.res.status, ms, usuario: c.get('usuario')?.email }));
    }
  });

  // Contexto y protecciones comunes
  app.use('/api/*', async (c, next) => {
    c.set('db', db);
    c.set('config', config);
    c.set('escucha', opciones.escucha);
    c.set('ip', (c.req.header('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'local');
    // CSRF: toda escritura debe venir de la propia web (además de SameSite=Lax en la cookie)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('origin') !== config.origenPublico) {
      throw new ErrorHttp(403, 'Origen no permitido.', 'ORIGEN');
    }
    await next();
  });
  app.use('/api/*', bodyLimit({
    maxSize: 8 * 1024 * 1024,
    onError: () => { throw new ErrorHttp(413, 'La petición es demasiado grande (máximo 8 MB).'); }
  }));

  // Sesión: resuelve el usuario a partir de la cookie
  app.use('/api/*', async (c, next) => {
    const clave = `${c.req.method} ${c.req.path}`;
    if (PUBLICAS.has(clave)) return next();
    if (c.req.path.startsWith(PREFIJO_PUBLICO)) {
      const ip = 'ip:' + c.get('ip');
      if (usosPublicos.bloqueado(ip)) throw new ErrorHttp(429, 'Demasiadas peticiones seguidas. Espera un minuto y vuelve a intentarlo.', 'LIMITE');
      usosPublicos.fallo(ip);
      return next();
    }
    const token = getCookie(c, COOKIE_SESION);
    if (!token) throw new ErrorHttp(401, 'Inicia sesión para continuar.', 'SIN_SESION');
    const [fila] = await db.select({
      sesionId: sesiones.id, id: usuarios.id, organizacionId: usuarios.organizacionId, email: usuarios.email,
      nombre: usuarios.nombre, rol: usuarios.rol, debeCambiarClave: usuarios.debeCambiarClave
    }).from(sesiones).innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
      .where(and(eq(sesiones.tokenHash, hashToken(token)), gt(sesiones.expiraEn, new Date()), eq(usuarios.activo, true)))
      .limit(1);
    if (!fila) throw new ErrorHttp(401, 'La sesión caducó. Vuelve a iniciar sesión.', 'SIN_SESION');
    const { sesionId, ...usuario } = fila;
    c.set('usuario', usuario);
    c.set('sesionId', sesionId);
    if (usuario.debeCambiarClave && !CON_CLAVE_TEMPORAL.has(clave)) {
      throw new ErrorHttp(403, 'Debes cambiar tu contraseña temporal antes de continuar.', 'CAMBIAR_CLAVE');
    }
    await next();
  });

  app.get('/api/salud', async (c) => {
    await db.execute('select 1');
    return c.json({ ok: true, servicio: 'processiq-api' });
  });
  app.route('/api/sesion', rutasSesion(limitador));
  app.route('/api/usuarios', rutasUsuarios());
  app.route('/api/directorio', rutasDirectorio());
  app.route('/api/proyectos', rutasProyectos());
  app.route('/api', rutasProcesos());
  app.route('/api/auditoria', rutasAuditoria());
  app.route('/api/ia', rutasIa({ sondeoMs: opciones.sondeoMs }));
  app.route('/api/catalogos', rutasCatalogos());
  app.route('/api', rutasSistema());
  app.route('/api/portafolio', rutasPortafolio());
  app.route('/api/invitados', rutasInvitados());
  app.route('/api/publico/invitados', rutasPublicasInvitados());
  return app;
}
