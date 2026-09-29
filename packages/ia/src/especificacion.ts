// Respuesta de la generación de procesos: validación, reparación y errores.
// Lo usa el worker de la API (fase 2.3); el editor sigue interpretando la
// especificación con buildProcessFromAiSpec, igual que en el MVP.
import { z } from 'zod';
import type { ClaseErrorIa } from './cliente.js';

const Clave = z.union([z.string(), z.number()]);

/** Forma mínima que necesita el editor para dibujar el proceso. */
export const EspecGeneracionEsquema = z.object({
  meta: z.object({}).loose().optional(),
  ficha: z.object({}).loose().optional(),
  nodes: z.array(z.object({ k: Clave, label: z.string().optional(), type: z.string().optional() }).loose())
    .min(1, 'la IA no devolvió actividades'),
  edges: z.array(z.object({ from: Clave, to: Clave }).loose()).optional()
}).loose();

export type EspecGeneracion = z.infer<typeof EspecGeneracionEsquema>;

export function validarEspecGeneracion(spec: unknown):
  { ok: true; spec: EspecGeneracion } | { ok: false; errores: string[] } {
  const r = EspecGeneracionEsquema.safeParse(spec);
  if (r.success) return { ok: true, spec: r.data };
  return { ok: false, errores: r.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) };
}

/** Pedido de reparación: la respuesta anterior y lo que falló. Una sola vez por generación. */
export const PROMPT_REPARACION =
  'Eres un validador de JSON. Recibes una respuesta que debía ser un único objeto JSON con la forma ' +
  '{ "meta": {...}, "ficha": {...}, "nodes": [{ "k": ..., "type": ..., "label": ... }], "edges": [{ "from": ..., "to": ... }] } ' +
  'y un problema detectado. Devuelve SOLO el objeto JSON corregido, sin explicaciones ni bloques de código. ' +
  'No inventes actividades nuevas: corrige la sintaxis o completa lo mínimo para que sea válido.';

export function promptReparacion(respuesta: string, problema: string): string {
  return 'Problema detectado: ' + problema + '\n\n=== RESPUESTA A CORREGIR ===\n' + respuesta;
}

/** Tamaño máximo de una respuesta que merece la pena reparar (más grande: se falla sin gastar otra llamada). */
export const MAX_CHARS_REPARACION = 200_000;

/**
 * ¿Merece la pena reintentar? Cortes de red, 429, sobrecarga (5xx/529) e
 * inactividad son pasajeros; clave inválida, rechazo o respuesta demasiado
 * larga no cambian al repetir.
 *
 * Manda la clase que marcó quien lanzó el error (`marcarErrorIa`, en
 * llamarClaude y en el worker). Solo si no la trae se decide por el texto.
 */
export function clasificarErrorIa(error: unknown): ClaseErrorIa {
  const marcada = typeof error === 'object' && error !== null ? (error as { claseIa?: unknown }).claseIa : undefined;
  if (marcada === 'cancelado' || marcada === 'transitorio' || marcada === 'definitivo') return marcada;
  const mensaje = error instanceof Error ? error.message : String(error);
  if (mensaje === 'CANCELLED') return 'cancelado';
  if (/^Error (5\d\d|529)|overloaded|Límite de uso alcanzado \(429\)|No se pudo conectar|Se cortó la conexión|dejó de responder|tardó más de/i.test(mensaje)) {
    return 'transitorio';
  }
  return 'definitivo';
}
