// Usuarios de la organización (cuentas locales). Solo administradores.
// Con Entra ID (cuando TI registre la aplicación) el alta pasa al directorio;
// estas rutas quedan para roles y bajas.
import { Hono } from 'hono';
import { asc, eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { sesiones, usuarios } from '@processiq/db';
import { registrar } from '../auditoria.js';
import { ErrorHttp, type Entorno } from '../contexto.js';
import { exigirAdmin } from '../permisos.js';
import { claveTemporal, hashearClave } from '../seguridad.js';
import { cuerpo, esUuid } from '../validar.js';

const Rol = z.enum(['admin', 'consultor', 'lector']);
const AltaEsquema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  nombre: z.string().trim().min(1).max(120),
  rol: Rol.default('consultor')
});
const CambioEsquema = z.object({
  nombre: z.string().trim().min(1).max(120).optional(),
  rol: Rol.optional(),
  activo: z.boolean().optional()
}).refine((v) => Object.keys(v).length > 0, 'Nada que cambiar');

const columnas = {
  id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, rol: usuarios.rol, activo: usuarios.activo,
  debeCambiarClave: usuarios.debeCambiarClave, creadoEn: usuarios.creadoEn, ultimoAcceso: usuarios.ultimoAcceso
};

export function rutasUsuarios() {
  const r = new Hono<Entorno>();
  r.use('*', async (c, next) => { exigirAdmin(c.get('usuario')); await next(); });

  r.get('/', async (c) => {
    const lista = await c.get('db').select(columnas).from(usuarios)
      .where(eq(usuarios.organizacionId, c.get('usuario').organizacionId)).orderBy(asc(usuarios.nombre));
    return c.json({ usuarios: lista });
  });

  // Alta con contraseña temporal: se muestra UNA vez y debe cambiarse al entrar
  r.post('/', async (c) => {
    const db = c.get('db');
    const datos = await cuerpo(c, AltaEsquema);
    const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, datos.email)).limit(1);
    if (existe) throw new ErrorHttp(409, 'Ya existe un usuario con ese correo.', 'DUPLICADO');
    const temporal = claveTemporal();
    const [nuevo] = await db.insert(usuarios).values({
      ...datos, organizacionId: c.get('usuario').organizacionId, hashClave: await hashearClave(temporal), debeCambiarClave: true
    }).returning(columnas);
    await registrar(c, 'usuario.alta', 'usuario', nuevo!.id, { email: datos.email, rol: datos.rol });
    return c.json({ usuario: nuevo, claveTemporal: temporal }, 201);
  });

  r.patch('/:id', async (c) => {
    const db = c.get('db'), yo = c.get('usuario'), id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'Usuario no encontrado.');
    const cambios = await cuerpo(c, CambioEsquema);
    if (id === yo.id && ((cambios.rol !== undefined && cambios.rol !== 'admin') || cambios.activo === false)) {
      throw new ErrorHttp(409, 'No puedes quitarte el rol de administrador ni desactivarte a ti mismo.', 'AUTOBLOQUEO');
    }
    const [act] = await db.update(usuarios).set(cambios)
      .where(and(eq(usuarios.id, id), eq(usuarios.organizacionId, yo.organizacionId))).returning(columnas);
    if (!act) throw new ErrorHttp(404, 'Usuario no encontrado.');
    // Desactivar corta sus sesiones en el acto
    if (cambios.activo === false) await db.delete(sesiones).where(eq(sesiones.usuarioId, id));
    await registrar(c, 'usuario.cambio', 'usuario', id, cambios);
    return c.json({ usuario: act });
  });

  r.post('/:id/restablecer-clave', async (c) => {
    const db = c.get('db'), id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'Usuario no encontrado.');
    const temporal = claveTemporal();
    const [act] = await db.update(usuarios).set({ hashClave: await hashearClave(temporal), debeCambiarClave: true })
      .where(and(eq(usuarios.id, id), eq(usuarios.organizacionId, c.get('usuario').organizacionId))).returning({ id: usuarios.id });
    if (!act) throw new ErrorHttp(404, 'Usuario no encontrado.');
    await db.delete(sesiones).where(eq(sesiones.usuarioId, id));
    await registrar(c, 'usuario.restablecer_clave', 'usuario', id);
    return c.json({ claveTemporal: temporal });
  });

  return r;
}
