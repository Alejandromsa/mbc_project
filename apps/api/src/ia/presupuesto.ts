// Presupuesto de IA: gasto del mes y topes de la organización y de la persona.
// Lo comprueban la API al encolar (rutas/ia.ts) y el worker justo antes de
// cada llamada a Claude, reintentos incluidos (ejecutar.ts).
import { and, eq, gte, sql } from 'drizzle-orm';
import { ejecucionesIa, type BaseDeDatos } from '@processiq/db';
import type { TopesIa } from '../config.js';

const ZONA = 'America/Lima';

/** Inicio del mes calendario en hora de Lima. */
export const inicioDelMes = () => sql`(date_trunc('month', now() at time zone ${ZONA}) at time zone ${ZONA})`;

/** Gasto del mes calendario (hora de Lima) de la organización y de la persona. */
export async function gastoDelMes(db: BaseDeDatos, organizacionId: string, usuarioId: string) {
  const [r] = await db.select({
    organizacion: sql<number>`coalesce(sum(${ejecucionesIa.costeUsd}), 0)::float8`,
    usuario: sql<number>`coalesce(sum(${ejecucionesIa.costeUsd}) filter (where ${ejecucionesIa.usuarioId} = ${usuarioId}), 0)::float8`
  }).from(ejecucionesIa).where(and(eq(ejecucionesIa.organizacionId, organizacionId), gte(ejecucionesIa.creadoEn, inicioDelMes())));
  return { organizacion: Number(r?.organizacion ?? 0), usuario: Number(r?.usuario ?? 0) };
}

export interface SinPresupuesto { codigo: 'PRESUPUESTO' | 'LIMITE_USUARIO'; mensaje: string }

/**
 * ¿Se alcanzó el presupuesto mensual de la organización o el límite de la
 * persona? `enCursoUsd` es lo que la ejecución en marcha ya gastó y aún no
 * está en la base (el worker lo guarda al terminar).
 */
export async function sinPresupuesto(
  db: BaseDeDatos, topes: TopesIa, organizacionId: string, usuarioId: string, enCursoUsd = 0
): Promise<SinPresupuesto | null> {
  const gasto = await gastoDelMes(db, organizacionId, usuarioId);
  if (gasto.organizacion + enCursoUsd >= topes.presupuestoMensualUsd) {
    return { codigo: 'PRESUPUESTO', mensaje: `Se alcanzó el presupuesto mensual de IA de la organización (US$ ${topes.presupuestoMensualUsd}). Un administrador puede ampliarlo.` };
  }
  if (gasto.usuario + enCursoUsd >= topes.limiteUsuarioMensualUsd) {
    return { codigo: 'LIMITE_USUARIO', mensaje: `Alcanzaste tu límite mensual de IA (US$ ${topes.limiteUsuarioMensualUsd}). Un administrador puede ampliarlo.` };
  }
  return null;
}
