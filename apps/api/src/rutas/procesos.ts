// Procesos de un proyecto y sus revisiones (docs/arquitectura.md §7).
import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { migrarProyecto } from '@processiq/dominio';
import { procesos, revisiones, usuarios, type BaseDeDatos } from '@processiq/db';
import { registrar } from '../auditoria.js';
import { ErrorHttp, type Entorno, type UsuarioSesion } from '../contexto.js';
import { accesoProyecto, type Capacidad } from '../permisos.js';
import { cuerpo, esUuid } from '../validar.js';

const NuevoProcesoEsquema = z.object({
  nombre: z.string().trim().min(1).max(200),
  /** Proceso inicial (export JSON del editor o v1); si falta, el proceso nace sin revisiones. */
  contenido: z.unknown().optional(),
  mensaje: z.string().trim().max(500).default('')
});
const RenombrarEsquema = z.object({ nombre: z.string().trim().min(1).max(200) });
const RevisionEsquema = z.object({
  contenido: z.unknown(),
  mensaje: z.string().trim().max(500).default(''),
  /** Revisión sobre la que se trabajó (null si se partió de un proceso sin revisiones). */
  padreId: z.string().uuid().nullable().default(null)
});
const EstadoEsquema = z.object({ estado: z.enum(['borrador', 'en_revision', 'aprobada']) });

// Transiciones permitidas y capacidad que exige cada una
const TRANSICIONES: Record<string, Capacidad> = {
  'borrador>en_revision': 'escribir',
  'en_revision>aprobada': 'aprobar',
  'en_revision>borrador': 'aprobar'
};

const columnasRevision = {
  id: revisiones.id, procesoId: revisiones.procesoId, numero: revisiones.numero, padreId: revisiones.padreId,
  autorId: revisiones.autorId, autor: usuarios.nombre, mensaje: revisiones.mensaje, estado: revisiones.estado,
  schemaVersion: revisiones.schemaVersion, creadaEn: revisiones.creadaEn
};

async function accesoProceso(db: BaseDeDatos, u: UsuarioSesion, procesoId: string, capacidad: Capacidad) {
  if (!esUuid(procesoId)) throw new ErrorHttp(404, 'Proceso no encontrado.');
  const [p] = await db.select().from(procesos).where(eq(procesos.id, procesoId)).limit(1);
  if (!p) throw new ErrorHttp(404, 'Proceso no encontrado.');
  const acceso = await accesoProyecto(db, u, p.proyectoId, capacidad);
  return { proceso: p, ...acceso };
}

/** Valida y lleva a v1 el contenido enviado por el editor. */
function contenidoV1(contenido: unknown) {
  const r = migrarProyecto(contenido);
  if (!r.ok) throw new ErrorHttp(400, 'El proceso no es válido.', 'PROCESO_INVALIDO', r.errores);
  return r.proyecto;
}

export function rutasProcesos() {
  const r = new Hono<Entorno>();

  r.post('/proyectos/:id/procesos', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    const proyectoId = c.req.param('id');
    if (!esUuid(proyectoId)) throw new ErrorHttp(404, 'Proyecto no encontrado.');
    const { proyecto } = await accesoProyecto(db, yo, proyectoId, 'escribir');
    const datos = await cuerpo(c, NuevoProcesoEsquema);
    const v1 = datos.contenido === undefined ? null : contenidoV1(datos.contenido);
    const res = await db.transaction(async (tx) => {
      const [p] = await tx.insert(procesos).values({ proyectoId: proyecto.id, nombre: datos.nombre, creadoPor: yo.id }).returning();
      let revision = null;
      if (v1) {
        [revision] = await tx.insert(revisiones).values({
          procesoId: p!.id, numero: 1, autorId: yo.id, mensaje: datos.mensaje || 'Versión inicial', schemaVersion: v1.schemaVersion, contenido: v1
        }).returning({ id: revisiones.id, numero: revisiones.numero, estado: revisiones.estado });
      }
      return { proceso: p!, revision };
    });
    await registrar(c, 'proceso.alta', 'proceso', res.proceso.id, { proyectoId: proyecto.id, nombre: datos.nombre, conRevision: !!res.revision });
    return c.json(res, 201);
  });

  r.get('/procesos/:id', async (c) => {
    const db = c.get('db');
    const { proceso, rol } = await accesoProceso(db, c.get('usuario'), c.req.param('id'), 'leer');
    const lista = await db.select(columnasRevision).from(revisiones).innerJoin(usuarios, eq(usuarios.id, revisiones.autorId))
      .where(eq(revisiones.procesoId, proceso.id)).orderBy(desc(revisiones.numero));
    return c.json({ proceso, rol, revisiones: lista });
  });

  r.patch('/procesos/:id', async (c) => {
    const db = c.get('db');
    const { proceso } = await accesoProceso(db, c.get('usuario'), c.req.param('id'), 'escribir');
    const { nombre } = await cuerpo(c, RenombrarEsquema);
    const [act] = await db.update(procesos).set({ nombre, actualizadoEn: new Date() }).where(eq(procesos.id, proceso.id)).returning();
    await registrar(c, 'proceso.cambio', 'proceso', proceso.id, { nombre });
    return c.json({ proceso: act });
  });

  // Guardar revisión. Si el editor partió de una revisión que ya no es la última
  // (alguien guardó en paralelo), se guarda igual y se avisa: no se pierde nada.
  r.post('/procesos/:id/revisiones', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    const { proceso } = await accesoProceso(db, yo, c.req.param('id'), 'escribir');
    const datos = await cuerpo(c, RevisionEsquema);
    const v1 = contenidoV1(datos.contenido);
    const res = await db.transaction(async (tx) => {
      // Bloquea el proceso: dos guardados simultáneos no pueden tomar el mismo número
      await tx.execute(sql`select id from procesos where id = ${proceso.id} for update`);
      const [ultima] = await tx.select({ id: revisiones.id, numero: revisiones.numero }).from(revisiones)
        .where(eq(revisiones.procesoId, proceso.id)).orderBy(desc(revisiones.numero)).limit(1);
      if (datos.padreId) {
        const [padre] = await tx.select({ id: revisiones.id }).from(revisiones)
          .where(and(eq(revisiones.id, datos.padreId), eq(revisiones.procesoId, proceso.id))).limit(1);
        if (!padre) throw new ErrorHttp(400, 'La revisión de partida no pertenece a este proceso.', 'PADRE_INVALIDO');
      }
      const conflicto = (ultima?.id ?? null) !== datos.padreId;
      const [nueva] = await tx.insert(revisiones).values({
        procesoId: proceso.id, numero: (ultima?.numero ?? 0) + 1, padreId: datos.padreId, autorId: yo.id,
        mensaje: datos.mensaje, schemaVersion: v1.schemaVersion, contenido: v1
      }).returning({ id: revisiones.id, numero: revisiones.numero, estado: revisiones.estado, padreId: revisiones.padreId, creadaEn: revisiones.creadaEn });
      await tx.update(procesos).set({ actualizadoEn: new Date() }).where(eq(procesos.id, proceso.id));
      return { revision: nueva!, conflicto, ultimaAnterior: ultima ?? null };
    });
    await registrar(c, 'revision.alta', 'revision', res.revision.id, { procesoId: proceso.id, numero: res.revision.numero, conflicto: res.conflicto });
    return c.json(res, 201);
  });

  r.get('/revisiones/:id', async (c) => {
    const db = c.get('db'), id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'Revisión no encontrada.');
    const [rev] = await db.select({ ...columnasRevision, contenido: revisiones.contenido }).from(revisiones)
      .innerJoin(usuarios, eq(usuarios.id, revisiones.autorId)).where(eq(revisiones.id, id)).limit(1);
    if (!rev) throw new ErrorHttp(404, 'Revisión no encontrada.');
    await accesoProceso(db, c.get('usuario'), rev.procesoId, 'leer');
    return c.json({ revision: rev });
  });

  r.post('/revisiones/:id/estado', async (c) => {
    const db = c.get('db'), id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'Revisión no encontrada.');
    const { estado } = await cuerpo(c, EstadoEsquema);
    const [rev] = await db.select({ id: revisiones.id, procesoId: revisiones.procesoId, estado: revisiones.estado })
      .from(revisiones).where(eq(revisiones.id, id)).limit(1);
    if (!rev) throw new ErrorHttp(404, 'Revisión no encontrada.');
    if (rev.estado === 'aprobada') throw new ErrorHttp(409, 'Una revisión aprobada no se modifica: guarda una nueva.', 'INMUTABLE');
    const capacidad = TRANSICIONES[`${rev.estado}>${estado}`];
    if (!capacidad) throw new ErrorHttp(409, `No se puede pasar de "${rev.estado}" a "${estado}".`, 'TRANSICION');
    await accesoProceso(db, c.get('usuario'), rev.procesoId, capacidad);
    // La condición sobre el estado evita carreras (dos aprobaciones simultáneas)
    const [act] = await db.update(revisiones).set({ estado })
      .where(and(eq(revisiones.id, id), eq(revisiones.estado, rev.estado))).returning({ id: revisiones.id, estado: revisiones.estado });
    if (!act) throw new ErrorHttp(409, 'La revisión cambió mientras tanto. Recarga y vuelve a intentarlo.', 'CONCURRENCIA');
    await registrar(c, 'revision.estado', 'revision', id, { de: rev.estado, a: estado });
    return c.json({ revision: act });
  });

  return r;
}
