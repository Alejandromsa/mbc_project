// Esquema JSON versionado del proyecto y migraciones (docs/arquitectura.md §6).
//
// v0 = formato del MVP 3.8.9: el export JSON ({ meta, ficha, nodes, edges,
//      exportedAt }) y lo que guarda localStorage. Sin número de versión.
// v1 = formato canónico: `schemaVersion: 1`, sin cachés de renderizado y con
//      referencias validadas. Es el contrato entre navegador, servidor e IA.
//
// Cada versión nueva añade UNA función de migración a MIGRACIONES; migrarProyecto
// las encadena desde la versión de entrada hasta la actual.
import { z } from 'zod';
import { normalizarFicha } from './ficha.js';
import { FORMAS_POR_DEFECTO } from './formas.js';
import type { Arista, Ficha, MetaProceso, Nodo, ValorKpi } from './modelo.js';

export const VERSION_ESQUEMA = 1;

const TIPOS_NODO = ['start', 'intermediate', 'end', 'task', 'system', 'decision', 'document', 'data'] as const;

const PainZ = z.object({
  id: z.string(),
  category: z.string(),
  description: z.string(),
  severity: z.number().min(1).max(5),
  frequency: z.number().min(1).max(5)
}).loose();

const NodoZ = z.object({
  id: z.string().min(1),
  type: z.enum(TIPOS_NODO),
  x: z.number().refine(Number.isFinite, 'coordenada no finita'),
  y: z.number().refine(Number.isFinite, 'coordenada no finita'),
  w: z.number().positive(),
  h: z.number().positive(),
  label: z.string(),
  pains: z.array(PainZ).optional()
}).loose();

const AristaZ = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string()
}).loose();

const MetaZ = z.object({
  name: z.string(),
  industry: z.string(),
  macroprocess: z.string(),
  client: z.string(),
  owner: z.string()
}).loose();

// Vistas As-Is / To-Be (`views`). Tienen la misma forma que el primer nivel,
// pero se validan de forma TOLERANTE: hasta 2026-09 no se revisaban, así que
// puede haber revisiones guardadas con cualquier cosa dentro. migrarProyecto
// las normaliza antes (normalizarVistas) y aquí solo se exige lo que esa
// normalización garantiza: lo que el editor necesita para dibujar una vista.
// No se exigen ids únicos, tipos conocidos, pains válidos ni aristas con
// extremos existentes: eso sigue siendo solo del primer nivel (la vista activa).
const NodoVistaZ = z.object({
  x: z.number().refine(Number.isFinite, 'coordenada no finita'),
  y: z.number().refine(Number.isFinite, 'coordenada no finita'),
  w: z.number().positive(),
  h: z.number().positive(),
  label: z.string()
}).loose();

const AristaVistaZ = z.object({ label: z.string() }).loose();

const VistaZ = z.object({ nodes: z.array(NodoVistaZ), edges: z.array(AristaVistaZ) }).loose().nullable();

const VistasZ = z.object({ asis: VistaZ.optional(), tobe: VistaZ.optional() }).loose();

const FichaZ = z.object({
  code: z.string(), version: z.string(), objetivo: z.string(),
  alcanceAreas: z.string(), alcanceDesde: z.string(), alcanceHasta: z.string(), alcanceIncluye: z.string(),
  descripcion: z.string(),
  gobernanza: z.array(z.object({}).loose()),
  sistemas: z.array(z.object({}).loose()),
  terminos: z.array(z.object({}).loose()),
  anexos: z.array(z.object({}).loose()),
  cambios: z.array(z.object({}).loose())
}).loose();

export const ProyectoV1Esquema = z.object({
  schemaVersion: z.literal(1),
  meta: MetaZ,
  ficha: FichaZ,
  nodes: z.array(NodoZ),
  edges: z.array(AristaZ),
  kpiValues: z.record(z.string(), z.object({}).loose()).optional()
}).loose().superRefine((p, ctx) => {
  const ids = new Set<string>();
  p.nodes.forEach((n, i) => {
    if (ids.has(n.id)) ctx.addIssue({ code: 'custom', path: ['nodes', i, 'id'], message: `id de nodo repetido: ${n.id}` });
    ids.add(n.id);
  });
  p.edges.forEach((e, i) => {
    if (!ids.has(e.from)) ctx.addIssue({ code: 'custom', path: ['edges', i, 'from'], message: `la arista ${e.id} sale de un nodo inexistente: ${e.from}` });
    if (!ids.has(e.to)) ctx.addIssue({ code: 'custom', path: ['edges', i, 'to'], message: `la arista ${e.id} llega a un nodo inexistente: ${e.to}` });
  });
  // Las vistas se validan aparte y sin transformar: si fueran parte de la forma,
  // Zod reordenaría las claves de sus nodos y cambiaría la huella de los
  // borradores guardados en los navegadores (plataforma/proyecto.js).
  const views = (p as Record<string, unknown>).views;
  if (views !== undefined) {
    const r = VistasZ.safeParse(views);
    if (!r.success) for (const i of r.error.issues) ctx.addIssue({ code: 'custom', path: ['views', ...i.path], message: i.message });
  }
});

/** Proyecto en el formato canónico (v1). */
export interface ProyectoV1 {
  schemaVersion: 1;
  meta: MetaProceso;
  ficha: Ficha;
  nodes: Nodo[];
  edges: Arista[];
  kpiValues?: Record<string, ValorKpi>;
  [extra: string]: unknown;
}

/** Cachés de renderizado que no forman parte del proceso (se regeneran al pintar). */
export const CLAVES_EFIMERAS: readonly string[] = ['_d', '_dSerie', '_band', '_inferredOwner', '_sello'];

/** Copia de un nodo o arista sin las cachés de renderizado. */
export const sinEfimeras = <T extends Record<string, unknown>>(o: T): T => {
  const r = { ...o };
  for (const k of CLAVES_EFIMERAS) delete r[k];
  return r;
};

const esObjeto = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Tamaño por defecto del tipo de un nodo (tipo desconocido: el de una actividad). */
function formaDe(tipo: unknown): { w: number; h: number } {
  const formas = FORMAS_POR_DEFECTO as Record<string, { w: number; h: number }>;
  return typeof tipo === 'string' && Object.hasOwn(formas, tipo) ? formas[tipo]! : FORMAS_POR_DEFECTO.task;
}

/**
 * Nodo de una vista con lo que el editor necesita para dibujarlo: como la
 * migración desde el MVP (coordenadas, tamaño, etiqueta y sin cachés), y
 * además una etiqueta que no sea texto se convierte en texto. Conserva el orden
 * de las claves y todo lo demás tal cual.
 */
function normalizarNodoDeVista(n: Record<string, any>): Record<string, any> {
  const forma = formaDe(n.type);
  return sinEfimeras({
    ...n,
    x: Number.isFinite(n.x) ? n.x : 0,
    y: Number.isFinite(n.y) ? n.y : 0,
    w: Number.isFinite(n.w) && n.w > 0 ? n.w : forma.w,
    h: Number.isFinite(n.h) && n.h > 0 ? n.h : forma.h,
    label: typeof n.label === 'string' ? n.label : n.label == null ? '' : String(n.label)
  });
}

function normalizarAristaDeVista(e: Record<string, any>): Record<string, any> {
  return sinEfimeras({ ...e, label: typeof e.label === 'string' ? e.label : e.label == null ? '' : String(e.label) });
}

/**
 * Normaliza `views` en lugar de rechazarla (ver VistasZ). Devuelve undefined si
 * no es un objeto (el editor la trata como si no hubiera vistas).
 * - `asis` / `tobe`: null si no son un objeto; `nodes` y `edges`, listas (si no, vacías)
 *   sin las entradas que no son objetos, que el editor no puede dibujar.
 * - Cualquier otra clave se conserva tal cual.
 */
function normalizarVistas(views: unknown): Record<string, any> | undefined {
  if (!esObjeto(views)) return undefined;
  const r: Record<string, any> = {};
  for (const [clave, v] of Object.entries(views)) {
    if (clave !== 'asis' && clave !== 'tobe') { r[clave] = v; continue; }
    r[clave] = esObjeto(v)
      ? {
          ...v,
          nodes: Array.isArray(v.nodes) ? v.nodes.filter(esObjeto).map(normalizarNodoDeVista) : [],
          edges: Array.isArray(v.edges) ? v.edges.filter(esObjeto).map(normalizarAristaDeVista) : []
        }
      : null;
  }
  return r;
}

/**
 * Lo que vale para todo contenido v1, venga de la versión que venga (también
 * si ya era v1): sin cachés de pintado en nodos, aristas y vistas, y con las
 * vistas normalizadas. Modifica y devuelve `d` (una copia).
 */
function normalizarV1(d: Record<string, any>): Record<string, any> {
  const limpiar = (lista: unknown[]) => lista.map((o) => (esObjeto(o) ? sinEfimeras(o) : o));
  if (Array.isArray(d.nodes)) d.nodes = limpiar(d.nodes);
  if (Array.isArray(d.edges)) d.edges = limpiar(d.edges);
  if ('views' in d) {
    const views = normalizarVistas(d.views);
    if (views === undefined) delete d.views; else d.views = views;
  }
  return d;
}

type Migracion = (entrada: Record<string, any>) => Record<string, any>;

/** MIGRACIONES[v] lleva de la versión v a la v+1. */
const MIGRACIONES: Record<number, Migracion> = {
  // v0 (MVP 3.8.9) -> v1
  0: (d) => {
    const meta = d.meta || {};
    const nodes = Array.isArray(d.nodes) ? d.nodes : [];
    const edges = Array.isArray(d.edges) ? d.edges : [];
    const resultado: Record<string, any> = {
      schemaVersion: 1,
      meta: {
        ...meta,
        name: meta.name ?? '', industry: meta.industry ?? '', macroprocess: meta.macroprocess ?? '',
        client: meta.client ?? '', owner: meta.owner ?? ''
      },
      ficha: normalizarFicha(d.ficha),
      nodes: nodes.map((n: Record<string, any>) => {
        const forma = (FORMAS_POR_DEFECTO as Record<string, { w: number; h: number }>)[n.type] ?? FORMAS_POR_DEFECTO.task;
        return sinEfimeras({
          ...n,
          x: Number.isFinite(n.x) ? n.x : 0,
          y: Number.isFinite(n.y) ? n.y : 0,
          w: Number.isFinite(n.w) && n.w > 0 ? n.w : forma.w,
          h: Number.isFinite(n.h) && n.h > 0 ? n.h : forma.h,
          label: n.label ?? ''
        });
      }),
      edges: edges.map((e: Record<string, any>) => sinEfimeras({ ...e, label: e.label ?? '' }))
    };
    // Datos de análisis que el MVP guarda en localStorage (no en el export JSON)
    for (const k of ['kpiValues', 'raci', 'sipoc', 'simResults', 'views', 'activeView', 'lanes']) {
      if (d[k] !== undefined && d[k] !== null) resultado[k] = d[k];
    }
    return resultado;
  }
};

export type ResultadoMigracion =
  | { ok: true; proyecto: ProyectoV1; versionOrigen: number }
  | { ok: false; errores: string[]; versionOrigen: number | null };

/**
 * Lleva un proyecto de cualquier versión conocida a la actual y lo valida.
 * No modifica la entrada.
 */
export function migrarProyecto(entrada: unknown): ResultadoMigracion {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { ok: false, errores: ['El proyecto no es un objeto JSON.'], versionOrigen: null };
  }
  const original = entrada as Record<string, any>;
  const versionOrigen = original.schemaVersion === undefined ? 0 : original.schemaVersion;
  if (!Number.isInteger(versionOrigen) || versionOrigen < 0) {
    return { ok: false, errores: [`schemaVersion inválido: ${String(original.schemaVersion)}`], versionOrigen: null };
  }
  if (versionOrigen > VERSION_ESQUEMA) {
    return { ok: false, errores: [`El proyecto es de una versión más nueva (${versionOrigen}) que esta aplicación (${VERSION_ESQUEMA}).`], versionOrigen };
  }
  // Copia JSON: un proyecto es JSON por definición, y así el dominio no depende de DOM ni de Node
  let datos: Record<string, any> = JSON.parse(JSON.stringify(original));
  for (let v = versionOrigen; v < VERSION_ESQUEMA; v++) datos = MIGRACIONES[v]!(datos);
  datos = normalizarV1(datos);
  const r = ProyectoV1Esquema.safeParse(datos);
  if (!r.success) {
    return { ok: false, versionOrigen, errores: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) };
  }
  // El esquema ya validó la forma; el tipo inferido por Zod es más laxo que ProyectoV1
  return { ok: true, proyecto: r.data as unknown as ProyectoV1, versionOrigen };
}
