// Diagnóstico: cuello de botella y ruta crítica, automatización, mapa de valor
// Lean y matriz impacto-esfuerzo. Portado del MVP 3.8.9 sin cambios de cálculo.
import type { Arista, Nodo, Pain } from '@processiq/dominio';
import type { ParametrosCosto } from './simulacion.js';

const num = (s: unknown) => parseFloat(s as string) || 0;
const actividades = (nodes: readonly Nodo[]) => nodes.filter((n) => n.type === 'task' || n.type === 'system');

/** Esfuerzo estimado (1..5) para resolver un pain según su categoría. */
export const ESFUERZO_POR_CATEGORIA: Readonly<Record<string, number>> = {
  system: 4, regulatory: 5, control: 3, data: 3, handoff: 2, manual: 2, wait: 2, rework: 2
};

// ------------------------------------------------ cuello de botella (F3)
export interface CargaActividad { n: Nodo; load: number; time: number }
export interface CuelloDeBotella {
  cuello: CargaActividad;
  /** Actividades con carga o tiempo, de mayor a menor carga. */
  porCarga: CargaActividad[];
  rutaCritica: { t: number; path: string[] };
}

/**
 * El cuello es la actividad de mayor carga (tiempo × volumen, min/mes). La ruta
 * crítica es el camino de mayor suma de tiempos desde un Inicio.
 * @returns null si no hay actividades con tiempo o volumen
 */
export function cuelloDeBotella(nodes: readonly Nodo[], edges: readonly Arista[]): CuelloDeBotella | null {
  const tasks = actividades(nodes);
  const withLoad = tasks.map((n) => ({
    n, load: num(n.time) * num(n.volume), time: num(n.time)
  })).filter((x) => x.load > 0 || x.time > 0);
  if (withLoad.length === 0) return null;
  withLoad.sort((a, b) => b.load - a.load);

  const outMap: Record<string, string[]> = {};
  edges.forEach((e) => { (outMap[e.from] = outMap[e.from] || []).push(e.to); });
  const timeOf = (id: string) => { const n = nodes.find((x) => x.id === id); return n ? num(n.time) : 0; };
  const memo: Record<string, { t: number; path: string[] }> = {};
  function longest(id: string, visited: Set<string>): { t: number; path: string[] } {
    if (memo[id]) return memo[id]!;
    if (visited.has(id)) return { t: 0, path: [] };
    visited.add(id);
    let best = { t: timeOf(id), path: [id] };
    (outMap[id] || []).forEach((to) => {
      const sub = longest(to, new Set(visited));
      if (timeOf(id) + sub.t > best.t) best = { t: timeOf(id) + sub.t, path: [id, ...sub.path] };
    });
    memo[id] = best;
    return best;
  }
  const starts = nodes.filter((n) => n.type === 'start');
  let rutaCritica = { t: 0, path: [] as string[] };
  (starts.length ? starts : [nodes[0]!]).forEach((s) => {
    const r = longest(s.id, new Set());
    if (r.t > rutaCritica.t) rutaCritica = r;
  });
  return { cuello: withLoad[0]!, porCarga: withLoad, rutaCritica };
}

// --------------------------------------------------- automatización (F2)
export interface OportunidadAutomatizacion {
  n: Nodo;
  tech: string;
  autoPct: number;
  fteSaved: number;
  annualSaving: number;
  effort: string;
}

/** Tareas automatizables por su etiqueta y tipo de ejecución, por ahorro anual descendente. */
export function oportunidadesAutomatizacion(nodes: readonly Nodo[], p: ParametrosCosto): OportunidadAutomatizacion[] {
  const minPerMonth = p.horasMes * 60;
  const candidata = (n: Nodo): OportunidadAutomatizacion | null => {
    const lbl = (n.label || '').toLowerCase();
    const ex = n.executionType;
    if (ex === 'automatic' || ex === 'rpa') return null; // ya automatizada
    let tech: string | null = null, autoPct = 0;
    if (/registr|ingres|carg|copiar|trasl|consolid|calcul/.test(lbl)) { tech = 'RPA'; autoPct = 0.9; }
    else if (/valid|verific|concili|comparar|revisar/.test(lbl)) { tech = 'RPA + reglas'; autoPct = 0.7; }
    else if (/escane|adjunt|extraer|leer doc|clasific/.test(lbl)) { tech = 'IDP (doc AI)'; autoPct = 0.8; }
    else if (/evalu|analiz|diagnostic|scoring|priorizar|recomend/.test(lbl)) { tech = 'IA / ML'; autoPct = 0.5; }
    else if (/notific|enviar|comunicar|email|correo/.test(lbl)) { tech = 'Workflow/email auto'; autoPct = 0.95; }
    else if (ex === 'manual') { tech = 'Workflow'; autoPct = 0.4; }
    if (!tech) return null;
    const t = num(n.time), v = num(n.volume);
    const minSaved = t * v * autoPct;
    const fteSaved = minSaved / minPerMonth;
    const annualSaving = fteSaved * p.costoFte * 12;
    const effort = tech.startsWith('IA') ? 'Alto' : (tech.startsWith('IDP') ? 'Medio-alto' : 'Bajo-medio');
    return { n, tech, autoPct, fteSaved, annualSaving, effort };
  };
  return actividades(nodes).map(candidata)
    .filter((c): c is OportunidadAutomatizacion => !!c)
    .sort((a, b) => b.annualSaving - a.annualSaving);
}

// ----------------------------------------------- mapa de valor Lean (F5)
export interface MapaDeValor {
  tVA: number; tBVA: number; tNVA: number; tNA: number; total: number;
  nvaCount: number;
  /** Actividades sin clasificar. */
  unclass: number;
}

/** Reparto de carga (tiempo × volumen; 1 si falta) entre VA, BVA, NVA y sin clasificar. */
export function mapaDeValor(nodes: readonly Nodo[]): MapaDeValor {
  const tasks = actividades(nodes);
  let tVA = 0, tBVA = 0, tNVA = 0, tNA = 0, total = 0;
  tasks.forEach((n) => {
    const t = num(n.time) * (parseFloat(n.volume as string) || 1);
    total += t || 1;
    if (n.va === 'VA') tVA += t || 1;
    else if (n.va === 'BVA') tBVA += t || 1;
    else if (n.va === 'NVA') tNVA += t || 1;
    else tNA += t || 1;
  });
  return {
    tVA, tBVA, tNVA, tNA, total,
    nvaCount: tasks.filter((n) => n.va === 'NVA').length,
    unclass: tasks.filter((n) => !n.va).length
  };
}

// ---------------------------------------------- matriz impacto-esfuerzo
export interface PainConActividad extends Pain { activity: string }

/** Todos los pains del proceso con la actividad donde ocurren. */
export function painsDelProceso(nodes: readonly Nodo[]): PainConActividad[] {
  const all: PainConActividad[] = [];
  nodes.forEach((n) => (n.pains || []).forEach((p) => all.push({ ...p, activity: n.label })));
  return all;
}

/** Posición 0..1 de un pain en la matriz: impacto = sev × frec / 25; esfuerzo por categoría / 5. */
export function posicionImpactoEsfuerzo(p: Pick<Pain, 'severity' | 'frequency' | 'category'>): { impacto: number; esfuerzo: number } {
  return {
    impacto: (p.severity * p.frequency) / 25,
    esfuerzo: (ESFUERZO_POR_CATEGORIA[p.category] || 3) / 5
  };
}
