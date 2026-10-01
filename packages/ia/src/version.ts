// Versión de los prompts de una ejecución de IA (ejecuciones_ia.version_prompt).
//
// Es una huella corta y estable de todo lo que decide CÓMO se pregunta en ese
// tipo de ejecución, para poder comparar resultados y costes cuando cambie:
//   - el prompt de sistema, el esfuerzo y el tope de tokens de cada llamada
//     (también los de su reparación, si la tiene);
//   - la plantilla del mensaje: el texto fijo que rodea los datos (instrucción
//     de la tarea, reglas de fusión, profundidad, separadores…) y el formato
//     del resumen del proceso que reciben dolores, tareas y matrices.
// Los datos de cada ejecución (documentos, proceso) no entran: la plantilla se
// pinta con marcadores fijos. El modelo tampoco: tiene su propia columna.
//
// Por qué una huella y no un número de versión escrito a mano: no se puede
// olvidar subirla, cambia con cualquier byte del prompt (la fidelidad ya los
// trata así) y es la misma en el navegador y en el servidor. Para que un cambio
// no pase desapercibido, version.test.ts fija las huellas actuales: quien cambie
// un prompt ve fallar esa prueba y la actualiza en el mismo PR.
import type { Arista, Nodo } from '@processiq/dominio';
import { resumenProcesoParaIa, promptGeneracion, promptTarea } from './construccion.js';
import { GEN_MAX_TOKENS } from './costes.js';
import { PROMPT_REPARACION, promptReparacion } from './especificacion.js';
import {
  LLAMADA_MATRIZ, esTipoMatrizIa, llamadaReparacionMatriz, promptMatriz, promptReparacionMatriz, type TipoMatrizIa
} from './matrices.js';
import { PROMPT_GENERACION, PROMPT_PAINS, ROL_ANALISTA, TAREAS_IA } from './prompts.js';

/** Parámetros de una llamada que entran en la versión (los mismos que recibe llamarClaude). */
export interface ParametrosLlamada {
  system: string;
  effort: string;
  maxTokens: number;
  timeoutMs?: number;
  reparacion?: boolean;
}

/**
 * Parámetros de las llamadas del worker de la API (apps/api/src/ia/ejecutar.ts
 * los usa tal cual). Son los mismos que usa el editor libre, que los escribe
 * en su código portado del MVP. Los de las matrices están en matrices.ts.
 */
export const LLAMADAS_IA = {
  generacion: { system: PROMPT_GENERACION, effort: 'medium', maxTokens: GEN_MAX_TOKENS },
  reparacion: { system: PROMPT_REPARACION, effort: 'low', maxTokens: GEN_MAX_TOKENS, timeoutMs: 120_000, reparacion: true },
  pains: { system: PROMPT_PAINS, effort: 'high', maxTokens: 8000 },
  tarea: { system: ROL_ANALISTA, effort: 'high', maxTokens: 8000 }
} as const satisfies Record<string, ParametrosLlamada>;

/**
 * Huella de 48 bits de un texto, en 12 caracteres hexadecimales. Es cyrb53
 * (bryc, dominio público) recortado a 48 bits: rápida, síncrona y sin
 * dependencias, igual en el navegador y en Node. No es criptográfica ni hace
 * falta: identifica versiones.
 */
export function huellaTexto(texto: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (0xffff & h2) + (h1 >>> 0)).toString(16).padStart(12, '0');
}

// Marcadores con los que se pintan las plantillas: ningún prompt los contiene
const M = (nombre: string) => '{{' + nombre + '}}';

/** Proceso de muestra que usa todos los campos del resumen (resumenProcesoParaIa). */
const PROCESO_MUESTRA = {
  meta: { name: M('PROCESO'), industry: M('INDUSTRIA'), macroprocess: M('MACROPROCESO') },
  nodes: [
    { id: 'a', type: 'start', label: M('INICIO'), owner: M('ROL') },
    {
      id: 'b', type: 'decision', gatewayType: 'exclusive', label: M('ACTIVIDAD'), owner: M('ROL'), system: M('SISTEMA'),
      executionType: 'manual', time: M('MIN'), volume: M('VOLUMEN'), notes: M('DETALLE')
    },
    { id: 'c', type: 'end', label: M('FIN') }
  ] as unknown as Nodo[],
  edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: M('RAMA') }] as unknown as Arista[],
  lanes: { list: [M('ROL')], laneOf: { a: M('CARRIL') } }
};
const plantillaResumen = () => resumenProcesoParaIa(PROCESO_MUESTRA);

function plantillasGeneracion(): string[] {
  return [1, 2, 3].map((vista) => promptGeneracion(M('CONTENIDO'), M('ETIQUETA'), {
    roles: { [M('PERSONA')]: M('ROL') }, vista, variasFuentes: true, maxChars: Number.MAX_SAFE_INTEGER
  }));
}

/** Todo lo que define una ejecución de ese tipo, en el orden en que se usa. Null si no se conoce. */
function receta(tipo: string, tarea?: string | null): unknown[] | null {
  if (tipo === 'generacion') {
    return [LLAMADAS_IA.generacion, plantillasGeneracion(), LLAMADAS_IA.reparacion, promptReparacion(M('RESPUESTA'), M('PROBLEMA'))];
  }
  if (tipo === 'pains') return [LLAMADAS_IA.pains, plantillaResumen()];
  if (tipo !== 'tarea' || !tarea) return null;
  if (esTipoMatrizIa(tarea)) {
    const t: TipoMatrizIa = tarea;
    return [LLAMADA_MATRIZ, promptMatriz(t, M('RESUMEN')), llamadaReparacionMatriz(t),
      promptReparacionMatriz(M('RESPUESTA'), M('PROBLEMA'), M('RESUMEN')), plantillaResumen()];
  }
  if (!Object.hasOwn(TAREAS_IA, tarea)) return null;
  return [LLAMADAS_IA.tarea, promptTarea(TAREAS_IA[tarea]!.prompt, M('RESUMEN')), plantillaResumen()];
}

/**
 * Versión de los prompts de una ejecución: `tipo` y `tarea` como en
 * ejecuciones_ia (generacion, pains, o tarea con una clave de TAREAS_IA o una
 * matriz). Null si la tarea no existe.
 */
export function versionPrompt(tipo: string, tarea?: string | null): string | null {
  const r = receta(tipo, tarea);
  return r ? huellaTexto(JSON.stringify(r)) : null;
}
