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
const CLAVES_EFIMERAS = ['_d', '_dSerie', '_band', '_inferredOwner', '_sello'];

const sinEfimeras = <T extends Record<string, unknown>>(o: T): T => {
  const r = { ...o };
  for (const k of CLAVES_EFIMERAS) delete r[k];
  return r;
};

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
  const r = ProyectoV1Esquema.safeParse(datos);
  if (!r.success) {
    return { ok: false, versionOrigen, errores: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) };
  }
  // El esquema ya validó la forma; el tipo inferido por Zod es más laxo que ProyectoV1
  return { ok: true, proyecto: r.data as unknown as ProyectoV1, versionOrigen };
}
