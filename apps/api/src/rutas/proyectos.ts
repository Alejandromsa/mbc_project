// Proyectos de cliente y sus miembros.
import { Hono } from 'hono';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { miembrosProyecto, procesos, proyectos, revisiones, usuarios } from '@processiq/db';
import { registrar } from '../auditoria.js';
import { ErrorHttp, type Entorno } from '../contexto.js';
import { accesoProyecto } from '../permisos.js';
import { cuerpo, esUuid } from '../validar.js';

const ProyectoEsquema = z.object({
  nombre: z.string().trim().min(1).max(160),
  cliente: z.string().trim().max(160).default(''),
  descripcion: z.string().trim().max(2000).default('')
});
const CambioProyectoEsquema = z.object({
  nombre: z.string().trim().min(1).max(160).optional(),
  cliente: z.string().trim().max(160).optional(),
  descripcion: z.string().trim().max(2000).optional(),
  archivado: z.boolean().optional()
}).refine((v) => Object.keys(v).length > 0, 'Nada que cambiar');
const MiembroEsquema = z.object({ rol: z.enum(['propietario', 'editor', 'revisor', 'lector']) });

const idValido = (id: string) => { if (!esUuid(id)) throw new ErrorHttp(404, 'Proyecto no encontrado.'); return id; };

/** Archivado = solo lectura: lo único que admite es reactivarlo. */
function exigirActivo(p: { archivado: boolean }) {
  if (p.archivado) throw new ErrorHttp(409, 'El proyecto está archivado: reactívalo antes de cambiarlo.', 'ARCHIVADO');
}

export function rutasProyectos() {
  const r = new Hono<Entorno>();

  // Mis proyectos (todos los de la organización si soy administrador), con mi rol
  r.get('/', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    const base = db.select({
      id: proyectos.id, nombre: proyectos.nombre, cliente: proyectos.cliente, descripcion: proyectos.descripcion,
      archivado: proyectos.archivado, creadoEn: proyectos.creadoEn
    }).from(proyectos);
    const lista = yo.rol === 'admin'
      ? (await base.where(eq(proyectos.organizacionId, yo.organizacionId)).orderBy(desc(proyectos.creadoEn))).map((p) => ({ ...p, rol: 'propietario' }))
      : await db.select({
          id: proyectos.id, nombre: proyectos.nombre, cliente: proyectos.cliente, descripcion: proyectos.descripcion,
          archivado: proyectos.archivado, creadoEn: proyectos.creadoEn, rol: miembrosProyecto.rol
        }).from(proyectos).innerJoin(miembrosProyecto, eq(miembrosProyecto.proyectoId, proyectos.id))
          .where(eq(miembrosProyecto.usuarioId, yo.id)).orderBy(desc(proyectos.creadoEn));
    return c.json({ proyectos: lista });
  });

  // Quien crea el proyecto queda como propietario. Los lectores de la organización no crean proyectos.
  r.post('/', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    if (yo.rol === 'lector') throw new ErrorHttp(403, 'Tu rol no permite crear proyectos.', 'PERMISO');
    const datos = await cuerpo(c, ProyectoEsquema);
    const [p] = await db.insert(proyectos).values({ ...datos, organizacionId: yo.organizacionId, creadoPor: yo.id }).returning();
    await db.insert(miembrosProyecto).values({ proyectoId: p!.id, usuarioId: yo.id, rol: 'propietario' });
    await registrar(c, 'proyecto.alta', 'proyecto', p!.id, { nombre: datos.nombre });
    return c.json({ proyecto: { ...p, rol: 'propietario' } }, 201);
  });

  r.get('/:id', async (c) => {
    const db = c.get('db');
    const { proyecto, rol } = await accesoProyecto(db, c.get('usuario'), idValido(c.req.param('id')), 'leer');
    const miembros = await db.select({ usuarioId: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, rol: miembrosProyecto.rol })
      .from(miembrosProyecto).innerJoin(usuarios, eq(usuarios.id, miembrosProyecto.usuarioId))
      .where(eq(miembrosProyecto.proyectoId, proyecto.id)).orderBy(asc(usuarios.nombre));
    const lista = await db.select().from(procesos).where(eq(procesos.proyectoId, proyecto.id)).orderBy(desc(procesos.actualizadoEn));
    // Última revisión de cada proceso (número y estado), para la lista del proyecto
    const ultimas = lista.length === 0 ? [] : await db.selectDistinctOn([revisiones.procesoId], {
      procesoId: revisiones.procesoId, id: revisiones.id, numero: revisiones.numero, estado: revisiones.estado
    }).from(revisiones).where(inArray(revisiones.procesoId, lista.map((p) => p.id)))
      .orderBy(revisiones.procesoId, desc(revisiones.numero));
    const porProceso = new Map(ultimas.map(({ procesoId, ...u }) => [procesoId, u]));
    return c.json({
      proyecto: { ...proyecto, rol }, miembros,
      procesos: lista.map((p) => ({ ...p, ultimaRevision: porProceso.get(p.id) ?? null }))
    });
  });

  r.patch('/:id', async (c) => {
    const db = c.get('db');
    const { proyecto } = await accesoProyecto(db, c.get('usuario'), idValido(c.req.param('id')), 'administrar');
    const cambios = await cuerpo(c, CambioProyectoEsquema);
    if (Object.keys(cambios).some((k) => k !== 'archivado')) exigirActivo(proyecto);
    const [act] = await db.update(proyectos).set(cambios).where(eq(proyectos.id, proyecto.id)).returning();
    await registrar(c, 'proyecto.cambio', 'proyecto', proyecto.id, cambios);
    return c.json({ proyecto: act });
  });

  // Alta o cambio de rol de un miembro (debe ser de la misma organización)
  r.put('/:id/miembros/:usuarioId', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    const { proyecto } = await accesoProyecto(db, yo, idValido(c.req.param('id')), 'administrar');
    exigirActivo(proyecto);
    const usuarioId = c.req.param('usuarioId');
    const { rol } = await cuerpo(c, MiembroEsquema);
    const [u] = esUuid(usuarioId)
      ? await db.select({ id: usuarios.id }).from(usuarios)
          .where(and(eq(usuarios.id, usuarioId), eq(usuarios.organizacionId, yo.organizacionId), eq(usuarios.activo, true))).limit(1)
      : [];
    if (!u) throw new ErrorHttp(404, 'Usuario no encontrado.');
    await db.insert(miembrosProyecto).values({ proyectoId: proyecto.id, usuarioId, rol })
      .onConflictDoUpdate({ target: [miembrosProyecto.proyectoId, miembrosProyecto.usuarioId], set: { rol } });
    await registrar(c, 'proyecto.miembro', 'proyecto', proyecto.id, { usuarioId, rol });
    return c.json({ ok: true });
  });

  r.delete('/:id/miembros/:usuarioId', async (c) => {
    const db = c.get('db');
    const { proyecto } = await accesoProyecto(db, c.get('usuario'), idValido(c.req.param('id')), 'administrar');
    exigirActivo(proyecto);
    const usuarioId = c.req.param('usuarioId');
    if (!esUuid(usuarioId)) throw new ErrorHttp(404, 'Usuario no encontrado.');
    const propietarios = await db.select({ id: miembrosProyecto.usuarioId }).from(miembrosProyecto)
      .where(and(eq(miembrosProyecto.proyectoId, proyecto.id), eq(miembrosProyecto.rol, 'propietario')));
    if (propietarios.length === 1 && propietarios[0]!.id === usuarioId) {
      throw new ErrorHttp(409, 'El proyecto debe conservar al menos un propietario.', 'ULTIMO_PROPIETARIO');
    }
    await db.delete(miembrosProyecto).where(and(eq(miembrosProyecto.proyectoId, proyecto.id), inArray(miembrosProyecto.usuarioId, [usuarioId])));
    await registrar(c, 'proyecto.baja_miembro', 'proyecto', proyecto.id, { usuarioId });
    return c.body(null, 204);
  });

  return r;
}
