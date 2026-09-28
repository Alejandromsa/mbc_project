// Consulta de la auditoría (solo administradores), limitada a la organización
// de quien consulta. Las filas sin organización (entradas fallidas con un correo
// que no existe) no las ve nadie aquí: quedan en la base y en el registro de
// acceso. «Sistema» (rutas/sistema.ts), en cambio, es del servidor entero.
import { Hono } from 'hono';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { auditoria, usuarios } from '@processiq/db';
import type { Entorno } from '../contexto.js';
import { exigirAdmin } from '../permisos.js';

export function rutasAuditoria() {
  const r = new Hono<Entorno>();
  r.get('/', async (c) => {
    exigirAdmin(c.get('usuario'));
    const entidad = c.req.query('entidad'), entidadId = c.req.query('entidadId');
    const limite = Math.min(500, Math.max(1, Number(c.req.query('limite') ?? 100)));
    const filtros: SQL[] = [];
    if (entidad) filtros.push(eq(auditoria.entidad, entidad));
    if (entidadId) filtros.push(eq(auditoria.entidadId, entidadId));
    filtros.push(eq(auditoria.organizacionId, c.get('usuario').organizacionId));
    const filas = await c.get('db').select({
      id: auditoria.id, accion: auditoria.accion, entidad: auditoria.entidad, entidadId: auditoria.entidadId,
      detalle: auditoria.detalle, ip: auditoria.ip, creadoEn: auditoria.creadoEn, usuario: usuarios.email
    }).from(auditoria).leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
      .where(filtros.length ? and(...filtros) : undefined).orderBy(desc(auditoria.id)).limit(limite);
    return c.json({ eventos: filas });
  });
  return r;
}
