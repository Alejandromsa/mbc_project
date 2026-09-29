// Canal LISTEN/NOTIFY de la colaboración (ADR 21): algo cambió en un proceso
// (su presencia o una revisión nueva). El aviso solo lleva el id del proceso:
// cada SSE vuelve a leer lo que su usuario puede ver. Lo escucha la Escucha de
// la API (servidor.ts), la misma conexión que el progreso de la IA.
import { sql } from 'drizzle-orm';
import type { BaseDeDatos } from '@processiq/db';

export const CANAL_PROCESOS = 'procesos_evento';

/** Dentro de una transacción, el aviso sale al confirmarla (y no sale si se deshace). */
export async function avisarProceso(db: Pick<BaseDeDatos, 'execute'>, procesoId: string): Promise<void> {
  await db.execute(sql`select pg_notify(${CANAL_PROCESOS}, ${procesoId})`);
}
