// La cola de IA es la propia tabla ejecuciones_ia (docs/arquitectura.md §8):
// tomar = pasar una fila «en_cola» a «ejecutando» con SKIP LOCKED, así dos
// workers nunca toman la misma.
import { eq, sql } from 'drizzle-orm';
import { ejecucionesIa, type BaseDeDatos } from '@processiq/db';

export type EjecucionIa = typeof ejecucionesIa.$inferSelect;

export async function tomarSiguiente(db: BaseDeDatos): Promise<EjecucionIa | null> {
  const r = await db.execute<{ id: string }>(sql`
    update ejecuciones_ia
       set estado = 'ejecutando', intentos = intentos + 1, progreso = 0,
           iniciado_en = coalesce(iniciado_en, now()), actualizado_en = now()
     where id = (
       select id from ejecuciones_ia
        where estado = 'en_cola' and disponible_en <= now() and not cancelar
        order by creado_en
        for update skip locked
        limit 1)
    returning id`);
  const id = r.rows[0]?.id;
  if (!id) return null;
  const [e] = await db.select().from(ejecucionesIa).where(eq(ejecucionesIa.id, id)).limit(1);
  return e ?? null;
}

/**
 * Ejecuciones que quedaron «ejecutando» sin latido (worker caído o reiniciado):
 * vuelven a la cola sin contar el intento.
 */
export async function reencolarHuerfanas(db: BaseDeDatos, segundosSinLatido = 120): Promise<number> {
  const r = await db.execute(sql`
    update ejecuciones_ia
       set estado = 'en_cola', intentos = greatest(intentos - 1, 0), progreso = 0, disponible_en = now()
     where estado = 'ejecutando' and actualizado_en < now() - make_interval(secs => ${segundosSinLatido})`);
  return r.rowCount ?? 0;
}
