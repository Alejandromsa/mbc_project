// Presencia por proceso (ADR 21): quién tiene abierto un proceso y si está editando.
//
// Es efímera. Cada pestaña (el editor o la página del proceso en el shell) da un
// latido cada LATIDO_S; sin latido durante CADUCIDAD_S, deja de contar y se borra
// en el siguiente latido de cualquiera. No hay histórico ni auditoría.
import { and, desc, eq, sql } from 'drizzle-orm';
import { presencias, revisiones, usuarios, type BaseDeDatos } from '@processiq/db';
import { avisarProceso } from './avisos.js';

/** Cada cuánto da su latido una pestaña abierta (la web usa el mismo valor). */
export const LATIDO_S = 20;
/** Sin latido durante este tiempo, la presencia caduca. */
export const CADUCIDAD_S = 60;

export type Lugar = 'editor' | 'shell';
export type EstadoPresencia = 'viendo' | 'editando';

/** Una persona que tiene abierto el proceso (junta todas sus pestañas). */
export interface Presente {
  usuarioId: string;
  nombre: string;
  /** 'editando' si alguna de sus pestañas tiene cambios sin guardar. */
  estado: EstadoPresencia;
  lugares: Lugar[];
  desde: string;
  /** Es quien pregunta (el editor y el shell no se muestran a sí mismos). */
  yo: boolean;
}

export interface ResumenRevisionNueva {
  id: string; numero: number; autorId: string; autor: string; mensaje: string; estado: string; creadaEn: Date;
}

interface Pestana { procesoId: string; usuarioId: string; pestana: string }

/** Borra las presencias caducadas y avisa a los procesos en los que estaban. */
export async function caducar(db: BaseDeDatos): Promise<number> {
  const r = await db.execute<{ proceso_id: string }>(sql`
    delete from presencias where ultimo_latido < now() - make_interval(secs => ${CADUCIDAD_S}) returning proceso_id`);
  for (const id of new Set(r.rows.map((f) => f.proceso_id))) await avisarProceso(db, id);
  return r.rows.length;
}

/** Registra o renueva la presencia de una pestaña. Avisa si es nueva o si cambió su estado. */
export async function latir(db: BaseDeDatos, p: Pestana & { lugar: Lugar; estado: EstadoPresencia }): Promise<void> {
  await caducar(db);
  // La subconsulta ve la fila de antes del insert (misma instantánea de la sentencia)
  const r = await db.execute<{ cambio: boolean }>(sql`
    with anterior as (
      select estado from presencias where proceso_id = ${p.procesoId} and usuario_id = ${p.usuarioId} and pestana = ${p.pestana}
    )
    insert into presencias (proceso_id, usuario_id, pestana, lugar, estado)
    values (${p.procesoId}, ${p.usuarioId}, ${p.pestana}, ${p.lugar}, ${p.estado})
    on conflict (proceso_id, usuario_id, pestana)
      do update set estado = excluded.estado, lugar = excluded.lugar, ultimo_latido = now()
    returning not exists (select 1 from anterior where estado = ${p.estado}) as cambio`);
  if (r.rows[0]?.cambio) await avisarProceso(db, p.procesoId);
}

/** Renueva el latido sin cambiar el estado (la pestaña sigue conectada al SSE). No crea la fila. */
export async function renovar(db: BaseDeDatos, p: Pestana): Promise<void> {
  await db.update(presencias).set({ ultimoLatido: sql`now()` }).where(and(
    eq(presencias.procesoId, p.procesoId), eq(presencias.usuarioId, p.usuarioId), eq(presencias.pestana, p.pestana)));
}

/** Quita la presencia de una pestaña (al cerrarla o salir de la página). */
export async function salir(db: BaseDeDatos, p: Pestana): Promise<void> {
  const r = await db.delete(presencias).where(and(
    eq(presencias.procesoId, p.procesoId), eq(presencias.usuarioId, p.usuarioId), eq(presencias.pestana, p.pestana)))
    .returning({ procesoId: presencias.procesoId });
  if (r.length) await avisarProceso(db, p.procesoId);
}

/** Quién tiene abierto el proceso ahora: una entrada por persona, por orden de llegada. */
export async function presentes(db: BaseDeDatos, procesoId: string, yoId: string): Promise<Presente[]> {
  const r = await db.execute<{ usuario_id: string; nombre: string; editando: boolean; lugares: Lugar[]; desde: Date | string }>(sql`
    select p.usuario_id, u.nombre, bool_or(p.estado = 'editando') as editando,
           array_agg(distinct p.lugar order by p.lugar) as lugares, min(p.desde) as desde
      from presencias p join usuarios u on u.id = p.usuario_id
     where p.proceso_id = ${procesoId} and u.activo
       and p.ultimo_latido >= now() - make_interval(secs => ${CADUCIDAD_S})
     group by p.usuario_id, u.nombre
     order by min(p.desde), u.nombre`);
  return r.rows.map((f) => ({
    usuarioId: f.usuario_id, nombre: f.nombre, estado: f.editando ? 'editando' : 'viendo',
    lugares: f.lugares, desde: new Date(f.desde).toISOString(), yo: f.usuario_id === yoId
  }));
}

/** La última revisión del proceso (lo que avisa de que alguien guardó). */
export async function ultimaRevision(db: BaseDeDatos, procesoId: string): Promise<ResumenRevisionNueva | null> {
  const [r] = await db.select({
    id: revisiones.id, numero: revisiones.numero, autorId: revisiones.autorId, autor: usuarios.nombre,
    mensaje: revisiones.mensaje, estado: revisiones.estado, creadaEn: revisiones.creadaEn
  }).from(revisiones).innerJoin(usuarios, eq(usuarios.id, revisiones.autorId))
    .where(eq(revisiones.procesoId, procesoId)).orderBy(desc(revisiones.numero)).limit(1);
  return r ?? null;
}
