// Observabilidad sin servicios externos (fase 2.4b): errores y latidos en la
// base; los muestra la pantalla «Sistema» del administrador.
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { errores, latidos, type BaseDeDatos } from '@processiq/db';

export type OrigenError = 'api' | 'web' | 'editor' | 'worker';

/**
 * Misma huella para el mismo error aunque cambien ids, números o la línea
 * exacta en la que ocurrió: así se agrupan las repeticiones.
 */
export function huellaError(origen: OrigenError, mensaje: string, pila?: string | null): string {
  const normal = mensaje
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d+/g, '<n>')
    .slice(0, 300);
  const marco = (pila ?? '').split('\n').map((l) => l.trim()).find((l) => l.startsWith('at ') || l.includes('@')) ?? '';
  const marcoNormal = marco.replace(/:\d+:\d+\)?$/, '').replace(/\?[^)\s]*/, '');
  return createHash('sha1').update(`${origen}|${normal}|${marcoNormal}`).digest('hex').slice(0, 16);
}

export interface ErrorARegistrar {
  origen: OrigenError;
  mensaje: string;
  pila?: string | null;
  ruta?: string | null;
  usuarioId?: string | null;
  agente?: string | null;
  detalle?: Record<string, unknown>;
}

/** Registra un error. Nunca lanza: registrar un error no debe provocar otro. */
export async function registrarError(db: BaseDeDatos, e: ErrorARegistrar): Promise<void> {
  try {
    const mensaje = (e.mensaje || 'Error sin mensaje').slice(0, 2000);
    await db.insert(errores).values({
      origen: e.origen, mensaje, pila: e.pila ? e.pila.slice(0, 8000) : null, ruta: e.ruta ? e.ruta.slice(0, 500) : null,
      huella: huellaError(e.origen, mensaje, e.pila), usuarioId: e.usuarioId ?? null,
      agente: e.agente ? e.agente.slice(0, 300) : null, detalle: e.detalle ?? {}
    });
  } catch (err) {
    console.error(JSON.stringify({ evento: 'error_al_registrar_error', mensaje: String((err as Error).message) }));
  }
}

/** Latido de un servicio sin HTTP (el worker). */
export async function latido(db: BaseDeDatos, servicio: string, detalle: Record<string, unknown> = {}): Promise<void> {
  const en = new Date();
  await db.insert(latidos).values({ servicio, detalle, en }).onConflictDoUpdate({ target: latidos.servicio, set: { detalle, en } });
}

/** Borra los errores de más de `dias` días. */
export async function purgarErrores(db: BaseDeDatos, dias = 30): Promise<number> {
  const r = await db.execute(sql`delete from errores where creado_en < now() - make_interval(days => ${dias})`);
  return r.rowCount ?? 0;
}
