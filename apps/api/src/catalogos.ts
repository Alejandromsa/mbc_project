// Catálogos administrables (fase 2.4): siembra inicial con los del MVP y la
// forma en que los recibe el editor (la misma que en @processiq/dominio).
import { and, asc, eq, sql } from 'drizzle-orm';
import { kpis, temasPptx, verbosPlaybook, type BaseDeDatos } from '@processiq/db';
import { KPI_LIBRARY, VERBS_ALLOWED, VERBS_FORBIDDEN } from '@processiq/dominio';

/** Si la organización no tiene catálogos, los crea con los del MVP. Idempotente. */
export async function asegurarCatalogos(db: BaseDeDatos, organizacionId: string): Promise<void> {
  const [k] = await db.select({ n: sql<number>`count(*)::int` }).from(kpis).where(eq(kpis.organizacionId, organizacionId));
  if (!k?.n) {
    await db.insert(kpis).values(KPI_LIBRARY.map((x) => ({
      organizacionId, codigo: x.id, industria: x.industry, macroproceso: x.macroprocess, nombre: x.name,
      unidad: x.unit, benchmark: x.benchmark, descripcion: x.description
    }))).onConflictDoNothing();
  }
  const [v] = await db.select({ n: sql<number>`count(*)::int` }).from(verbosPlaybook).where(eq(verbosPlaybook.organizacionId, organizacionId));
  if (!v?.n) {
    await db.insert(verbosPlaybook).values([
      ...VERBS_ALLOWED.map((verbo) => ({ organizacionId, verbo, tipo: 'permitido' as const })),
      ...Object.entries(VERBS_FORBIDDEN).map(([verbo, motivo]) => ({ organizacionId, verbo, tipo: 'prohibido' as const, motivo }))
    ]).onConflictDoNothing();
  }
}

/** Catálogos activos de la organización, con la forma de @processiq/dominio (para el editor). */
export async function catalogosParaEditor(db: BaseDeDatos, organizacionId: string) {
  const listaKpis = await db.select().from(kpis)
    .where(and(eq(kpis.organizacionId, organizacionId), eq(kpis.activo, true)))
    .orderBy(asc(kpis.industria), asc(kpis.codigo));
  const verbos = await db.select().from(verbosPlaybook).where(eq(verbosPlaybook.organizacionId, organizacionId)).orderBy(asc(verbosPlaybook.verbo));
  const temas = await db.select({ clave: temasPptx.clave, nombre: temasPptx.nombre, definicion: temasPptx.definicion })
    .from(temasPptx).where(and(eq(temasPptx.organizacionId, organizacionId), eq(temasPptx.activo, true)))
    .orderBy(asc(temasPptx.nombre));
  return {
    kpis: listaKpis.map((x) => ({
      id: x.codigo, industry: x.industria, macroprocess: x.macroproceso, name: x.nombre,
      unit: x.unidad, benchmark: x.benchmark, description: x.descripcion
    })),
    verbos: {
      permitidos: verbos.filter((x) => x.tipo === 'permitido').map((x) => x.verbo),
      prohibidos: Object.fromEntries(verbos.filter((x) => x.tipo === 'prohibido').map((x) => [x.verbo, x.motivo]))
    },
    temas
  };
}
