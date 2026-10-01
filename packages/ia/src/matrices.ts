// Matrices del copiloto con IA (divergencia D12, docs/fase1-divergencias.md).
//
// La RACI y el SIPOC llegan como JSON con la forma exacta de las matrices
// editables del editor (state._raci y state._sipoc), las mismas que usan el
// PPTX, el informe Word y la Ficha. El MVP pedía un informe en Markdown
// (TAREAS_IA.raci y TAREAS_IA.sipoc) y las matrices solo se llenaban con las
// heurísticas sin IA.
//
// Lo usan igual el editor libre (callClaude) y el worker de la API (su `llamar`
// con presupuesto y coste): una llamada, validación con Zod y, si falla, una
// reparación. Si tampoco vale, lanza un error definitivo y quien llama cae al
// informe en texto de siempre.
import { z } from 'zod';
import { extraerJson, marcarErrorIa, type OpcionesLlamada } from './cliente.js';
import { promptTarea } from './construccion.js';
import { MAX_CHARS_REPARACION, promptReparacion } from './especificacion.js';

const NL = '\n';

// ------------------------------------------------------------------ tipos
/** Análisis que devuelven una matriz: `tipo` de POST /api/ia/analisis y columna `tarea` de la cola. */
export const TIPOS_MATRIZ_IA = ['matriz-raci', 'matriz-sipoc'] as const;
export type TipoMatrizIa = typeof TIPOS_MATRIZ_IA[number];
export const esTipoMatrizIa = (t: unknown): t is TipoMatrizIa => (TIPOS_MATRIZ_IA as readonly unknown[]).includes(t);

/** La matriz que la IA devuelve en lugar del informe de una tarea del copiloto (TAREAS_IA), si la hay. */
export function matrizDeTarea(tarea: string): TipoMatrizIa | undefined {
  if (tarea === 'raci') return 'matriz-raci';
  if (tarea === 'sipoc') return 'matriz-sipoc';
  return undefined;
}

/** Letras de una celda RACI: las mismas que ofrece la matriz del editor ('' = no participa). */
export const LETRAS_RACI = ['R', 'A', 'R/A', 'C', 'I', ''] as const;
export type LetraRaci = typeof LETRAS_RACI[number];
/** RACI del editor (state._raci): id de actividad -> rol -> letra. */
export type MatrizRaciIa = Record<string, Record<string, LetraRaci>>;
/** SIPOC del editor (state._sipoc): un texto por columna, con los elementos separados por comas. */
export interface SipocIa { suppliers: string; inputs: string; process: string; outputs: string; customers: string }
export type MatrizIa = MatrizRaciIa | SipocIa;

/** Tipos de nodo que llevan fila en la RACI: los mismos que la matriz del editor (analitica/raci.js). */
export const TIPOS_ACTIVIDAD_RACI: readonly string[] = ['task', 'system', 'decision'];
export function actividadesRaci(nodos: readonly { id: string; type: string }[]): string[] {
  return nodos.filter((n) => TIPOS_ACTIVIDAD_RACI.includes(n.type)).map((n) => n.id);
}

/** Máximo de roles distintos (columnas de la lámina RACI). */
export const MAX_ROLES_RACI = 20;
/** Salida de una matriz, reparación incluida: como las tareas del copiloto. */
export const MAX_TOKENS_MATRIZ = 8000;

// ---------------------------------------------------------------- prompts
/** Sistema de las matrices: el analista de las tareas, pero responde solo JSON. */
export const PROMPT_MATRICES =
  'Eres un consultor senior de procesos de negocio (estilo MBB) trabajando para MBC Business Consulting Perú. ' +
  'Analizas el proceso concreto que se te entrega y devuelves una matriz que el consultor revisará y editará antes de presentarla. ' +
  'Devuelves EXCLUSIVAMENTE un objeto JSON válido, con la forma exacta que pide la tarea: sin texto adicional, sin Markdown y sin bloques de código. ' +
  'Usas solo lo que el proceso dice: nunca inventes actividades, identificadores ni roles.';

const FORMA_RACI = '{ "<id de la actividad>": { "<rol>": "R" | "A" | "R/A" | "C" | "I" } }';
const FORMA_SIPOC = '{ "suppliers": string, "inputs": string, "process": string, "outputs": string, "customers": string }';

export interface MatrizDef {
  /** Tarea del copiloto (TAREAS_IA) a la que sustituye. */
  tarea: string;
  /** Instrucción: va delante del resumen del proceso, como en las tareas (promptTarea). */
  instruccion: string;
  /** Forma del JSON, para la reparación. */
  forma: string;
}

export const MATRICES_IA: Readonly<Record<TipoMatrizIa, MatrizDef>> = {
  'matriz-raci': {
    tarea: 'raci',
    forma: FORMA_RACI,
    instruccion: [
      'Construye la matriz RACI del proceso. Devuelve un objeto JSON con esta forma exacta:',
      FORMA_RACI,
      '',
      'Reglas:',
      '- Una entrada por cada actividad de tipo task, system o decision, con su id exacto tal como aparece tras "id=" (por ejemplo "n4"). Los eventos de inicio, fin e intermedios no llevan fila.',
      '- Los roles son los de ROLES/CARRILES, escritos exactamente igual. Añade otro rol solo si el proceso lo nombra y no es un carril (por ejemplo, el cliente).',
      '- Exactamente un A por actividad y R para quien la ejecuta. Si el mismo rol ejecuta y rinde cuentas, usa "R/A".',
      '- C e I solo cuando el flujo lo justifique (traspasos, aprobaciones, avisos). Un rol que no participa en una actividad no aparece en ella.'
    ].join(NL)
  },
  'matriz-sipoc': {
    tarea: 'sipoc',
    forma: FORMA_SIPOC,
    instruccion: [
      'Construye el SIPOC del proceso. Devuelve un objeto JSON con esta forma exacta:',
      FORMA_SIPOC,
      '',
      'Reglas:',
      '- Cada valor es un texto con sus elementos separados por comas, concretos de este proceso y no genéricos: roles, áreas, sistemas, documentos y datos que el proceso nombra.',
      '- "process" resume el proceso en sus 4 a 7 pasos de alto nivel, en orden.',
      '- Ninguna columna queda vacía.'
    ].join(NL)
  }
};

/** Mensaje de usuario de una matriz: la instrucción y el resumen del proceso (resumenProcesoParaIa). */
export function promptMatriz(tipo: TipoMatrizIa, resumen: string): string {
  return promptTarea(MATRICES_IA[tipo].instruccion, resumen);
}

/** Sistema de la reparación de una matriz. */
export function sistemaReparacionMatriz(tipo: TipoMatrizIa): string {
  return 'Eres un validador de JSON. Recibes una respuesta que debía ser un único objeto JSON con la forma ' + MATRICES_IA[tipo].forma +
    ', el problema detectado y el proceso del que sale. Devuelve SOLO el objeto JSON corregido, sin explicaciones ni bloques de código. ' +
    'No inventes nada: corrige la sintaxis o la forma con lo que ya trae la respuesta y con los id y los roles del proceso.';
}

/** Pedido de reparación: la respuesta, el problema y el proceso (para los id y los roles). */
export function promptReparacionMatriz(respuesta: string, problema: string, resumen: string): string {
  return promptReparacion(respuesta, problema) + NL + NL + '=== PROCESO ===' + NL + resumen;
}

/** Parámetros de la petición de una matriz (entran en su versión del prompt, version.ts). */
export const LLAMADA_MATRIZ = { system: PROMPT_MATRICES, effort: 'high', maxTokens: MAX_TOKENS_MATRIZ } as const;

/** Parámetros de la reparación de una matriz. `reparacion` no viaja en la petición: lo cuenta el worker. */
export function llamadaReparacionMatriz(tipo: TipoMatrizIa) {
  return { system: sistemaReparacionMatriz(tipo), effort: 'low', maxTokens: MAX_TOKENS_MATRIZ, timeoutMs: 120_000, reparacion: true } as const;
}

// ------------------------------------------------------------- validación
/** 'r' -> 'R', 'A/R' o 'R, A' -> 'R/A', '-' o null -> ''. Lo demás llega tal cual al esquema. */
function normalizarLetra(v: unknown): unknown {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  const s = v.toUpperCase().replace(/\s+/g, '').replace(/[,;+&|]/g, '/');
  if (s === '-' || s === '—' || s === '–' || s === 'N/A') return '';
  if (s === 'A/R' || s === 'RA' || s === 'AR') return 'R/A';
  return s;
}

const LetraEsquema = z.preprocess(normalizarLetra, z.enum(LETRAS_RACI, { error: 'la letra debe ser R, A, R/A, C o I' }));
const RaciEsquema = z.record(
  z.string(),
  z.record(z.string().max(80, 'el nombre del rol supera 80 caracteres'), LetraEsquema, { error: 'cada actividad debe ser un objeto { "<rol>": "<letra>" }' }),
  { error: 'debe ser un objeto { "<id de la actividad>": { "<rol>": "<letra>" } }' }
);

// Una lista en lugar de un texto se une con comas, como las escribe el editor
const Columna = z.preprocess(
  (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).join(', ') : v),
  z.string({ error: 'debe ser un texto' }).trim().min(1, 'está vacía').max(2000, 'supera 2000 caracteres')
);
const SipocEsquema = z.object({ suppliers: Columna, inputs: Columna, process: Columna, outputs: Columna, customers: Columna },
  { error: 'debe ser un objeto con suppliers, inputs, process, outputs y customers' });

export type ValidacionMatriz<M> = { ok: true; matriz: M } | { ok: false; errores: string[] };

const mensajes = (e: z.ZodError) => e.issues.slice(0, 10).map((i) => `${i.path.map(String).join('.') || '(raíz)'}: ${i.message}`);

/**
 * Valida la RACI de la IA contra el proceso: la forma con Zod y, después, que
 * las filas sean actividades reales (`actividades`, sus id). Las filas con id
 * desconocido (inventadas o de eventos) se descartan; si no queda ninguna, o
 * no hay ni una letra, es un error. Los nombres de rol se recortan.
 */
function validarRaci(datos: unknown, actividades: readonly string[]): ValidacionMatriz<MatrizRaciIa> {
  const r = RaciEsquema.safeParse(datos);
  if (!r.success) return { ok: false, errores: mensajes(r.error) };
  const validas = new Set(actividades);
  const matriz: MatrizRaciIa = {};
  const roles = new Set<string>();
  let letras = 0;
  for (const [id, fila] of Object.entries(r.data)) {
    if (!validas.has(id)) continue;
    const f: Record<string, LetraRaci> = {};
    for (const [rol, letra] of Object.entries(fila)) {
      const k = rol.trim();
      if (!k || k === '__proto__') continue;
      f[k] = letra;
      roles.add(k);
      if (letra) letras++;
    }
    matriz[id] = f;
  }
  const errores: string[] = [];
  if (!Object.keys(matriz).length) {
    const ids = [...validas];
    errores.push('ninguna clave es el id de una actividad del proceso; usa estos id: ' +
      ids.slice(0, 40).join(', ') + (ids.length > 40 ? '…' : ''));
  } else if (!letras) {
    errores.push('la matriz no asigna ninguna letra');
  }
  if (roles.size > MAX_ROLES_RACI) errores.push(`tiene ${roles.size} roles y el máximo es ${MAX_ROLES_RACI}: usa los carriles del proceso`);
  return errores.length ? { ok: false, errores } : { ok: true, matriz };
}

function validarSipoc(datos: unknown): ValidacionMatriz<SipocIa> {
  const r = SipocEsquema.safeParse(datos);
  return r.success ? { ok: true, matriz: r.data } : { ok: false, errores: mensajes(r.error) };
}

/** Valida el JSON de una matriz. `actividades`: los id de las actividades del proceso (actividadesRaci); el SIPOC no los usa. */
export function validarMatrizIa(tipo: 'matriz-raci', datos: unknown, actividades: readonly string[]): ValidacionMatriz<MatrizRaciIa>;
export function validarMatrizIa(tipo: 'matriz-sipoc', datos: unknown, actividades?: readonly string[]): ValidacionMatriz<SipocIa>;
export function validarMatrizIa(tipo: TipoMatrizIa, datos: unknown, actividades?: readonly string[]): ValidacionMatriz<MatrizIa>;
export function validarMatrizIa(tipo: TipoMatrizIa, datos: unknown, actividades: readonly string[] = []): ValidacionMatriz<MatrizIa> {
  return tipo === 'matriz-raci' ? validarRaci(datos, actividades) : validarSipoc(datos);
}

/** El JSON de la respuesta (extraerJson) y su validación; un JSON que no se puede leer es un error más. */
function leerRespuesta(tipo: TipoMatrizIa, respuesta: string, actividades: readonly string[]): ValidacionMatriz<MatrizIa> {
  let datos: unknown;
  try { datos = extraerJson(respuesta); } catch (err) { return { ok: false, errores: [(err as Error).message] }; }
  return validarMatrizIa(tipo, datos, actividades);
}

// ------------------------------------------------------------ la llamada
/** Cómo llama a Claude quien pide la matriz: callClaude en el editor, `llamar` en el worker. */
export type LlamarIa = (prompt: string, opts: OpcionesLlamada) => Promise<string>;

export interface ContextoMatriz {
  /** El proceso tal como lo reciben las tareas (resumenProcesoParaIa). */
  resumen: string;
  /** Id de las actividades del proceso (actividadesRaci). */
  actividades: readonly string[];
}

/**
 * Pide una matriz a la IA: una llamada y, si la respuesta no es válida, una
 * reparación (solo si no es enorme). Si tampoco vale, lanza un error marcado
 * como definitivo: repetir no lo arregla, y quien llama cae al informe en texto.
 */
export async function pedirMatrizIa(tipo: 'matriz-raci', ctx: ContextoMatriz, llamar: LlamarIa): Promise<MatrizRaciIa>;
export async function pedirMatrizIa(tipo: 'matriz-sipoc', ctx: ContextoMatriz, llamar: LlamarIa): Promise<SipocIa>;
export async function pedirMatrizIa(tipo: TipoMatrizIa, ctx: ContextoMatriz, llamar: LlamarIa): Promise<MatrizIa>;
export async function pedirMatrizIa(tipo: TipoMatrizIa, ctx: ContextoMatriz, llamar: LlamarIa): Promise<MatrizIa> {
  const respuesta = await llamar(promptMatriz(tipo, ctx.resumen), { ...LLAMADA_MATRIZ });
  const v = leerRespuesta(tipo, respuesta, ctx.actividades);
  if (v.ok) return v.matriz;
  const problema = v.errores.join('; ');
  if (respuesta.length > MAX_CHARS_REPARACION) {
    throw marcarErrorIa(new Error(`La IA devolvió una matriz que no se pudo interpretar (${problema}).`), 'definitivo');
  }
  const reparada = await llamar(promptReparacionMatriz(respuesta, problema, ctx.resumen), llamadaReparacionMatriz(tipo));
  const v2 = leerRespuesta(tipo, reparada, ctx.actividades);
  if (v2.ok) return v2.matriz;
  throw marcarErrorIa(new Error(`La IA devolvió una matriz que no se pudo interpretar ni reparar: ${v2.errores.join('; ')}`), 'definitivo');
}
