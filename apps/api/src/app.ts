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

/** Rutas que no exigen sesión. */
const PUBLICAS = new Set(['GET /api/salud', 'POST /api/sesion']);
/** Rutas permitidas con contraseña temporal pendiente de cambio. */
const CON_CLAVE_TEMPORAL = new Set(['GET /api/sesion', 'DELETE /api/sesion', 'POST /api/sesion/clave']);

export function crearApp(db: BaseDeDatos, config: Config) {
  const app = new Hono<Entorno>();
  const limitador = new LimitadorAccesos();

  app.onError((err, c) => {
    if (err instanceof ErrorHttp) {
      return c.json({ error: { mensaje: err.message, codigo: err.codigo, detalles: err.detalles } }, err.estado);
    }
    console.error(JSON.stringify({ evento: 'error', ruta: c.req.path, mensaje: String(err && (err as Error).message) }));
    return c.json({ error: { mensaje: 'Error interno del servidor.' } }, 500);
  });
  app.notFound((c) => c.json({ error: { mensaje: 'Ruta no encontrada.' } }, 404));

  // Contexto y protecciones comunes
  app.use('/api/*', async (c, next) => {
    c.set('db', db);
    c.set('config', config);
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
  return app;
}
