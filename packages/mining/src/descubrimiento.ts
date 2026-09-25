// Process discovery ligero (alpha-miner simplificado) desde un event log.
// Portado del MVP 3.8.9 (buildProcessFromEventLog): mismos nodos, ids, posiciones
// y etiquetas; aplicar el resultado al proceso abierto es cosa de la app.
import { crearNodo, FORMAS_POR_DEFECTO, type Arista, type FormaPorDefecto, type Nodo } from '@processiq/dominio';
import type { MapeoColumnas, TablaCsv } from './csv.js';

export interface Variante {
  /** Secuencia de actividades unida por ' → '. */
  seq: string;
  count: number;
  /** Porcentaje de casos, redondeado. */
  pct: number;
  steps: number;
}

export interface ProcesoDescubierto {
  nodos: Nodo[];
  aristas: Arista[];
  siguienteId: number;
  variantes: Variante[];
  totalCasos: number;
  actividades: number;
  transiciones: number;
  topInicio: string | undefined;
  topFin: string | undefined;
}

interface Evento { activity: string | undefined; ts: string | undefined; resource: string | undefined }

/**
 * Descubre el proceso: una tarea por actividad (frecuencia como volumen), el
 * recurso más temprano como responsable, las 2 actividades iniciales y finales
 * más frecuentes enlazadas a Inicio/Fin y las transiciones directly-follows con
 * frecuencia ≥ 10 % de la más frecuente.
 */
export function descubrirProceso(
  parsed: TablaCsv, map: MapeoColumnas,
  opciones: { siguienteId: number; formas?: Readonly<Record<string, FormaPorDefecto>> }
): ProcesoDescubierto {
  const formas = opciones.formas ?? FORMAS_POR_DEFECTO;
  let siguienteId = opciones.siguienteId;
  const { rows } = parsed;

  // Agrupa por caso
  const cases: Record<string, Evento[]> = {};
  rows.forEach((r) => {
    const id = r[map.case];
    if (!id) return;
    (cases[id] = cases[id] || []).push({
      activity: r[map.act],
      ts: r[map.ts],
      resource: map.res ? r[map.res] : ''
    });
  });
  // Ordena por timestamp dentro de cada caso
  Object.values(cases).forEach((events) => {
    events.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  });

  // Variantes: casos agrupados por su secuencia de actividades
  const variantMap: Record<string, number> = {};
  const totalCasos = Object.keys(cases).length;
  Object.values(cases).forEach((events) => {
    const seq = events.map((e) => e.activity).filter(Boolean).join(' → ');
    if (!seq) return;
    variantMap[seq] = (variantMap[seq] || 0) + 1;
  });
  const variantes = Object.entries(variantMap)
    .map(([seq, count]) => ({ seq, count, pct: Math.round(count / totalCasos * 100), steps: seq.split(' → ').length }))
    .sort((a, b) => b.count - a.count);

  // Frecuencia de actividades y de transiciones (directly-follows)
  const actFreq: Record<string, number> = {};
  const actResource: Record<string, string> = {};
  const transFreq: Record<string, number> = {};
  Object.values(cases).forEach((events) => {
    events.forEach((e, i) => {
      if (!e.activity) return;
      actFreq[e.activity] = (actFreq[e.activity] || 0) + 1;
      if (e.resource && !actResource[e.activity]) actResource[e.activity] = e.resource;
      const prev = events[i - 1];
      if (i > 0 && prev?.activity) {
        const key = prev.activity + '→' + e.activity;
        transFreq[key] = (transFreq[key] || 0) + 1;
      }
    });
  });
  const allActs = Object.entries(actFreq).sort((a, b) => b[1] - a[1]).map(([n]) => n);

  // Actividades más frecuentes como primera y última de su caso
  const startActs: Record<string, number> = {};
  const endActs: Record<string, number> = {};
  Object.values(cases).forEach((events) => {
    if (events.length === 0) return;
    const first = events[0]!.activity, last = events[events.length - 1]!.activity;
    if (first) startActs[first] = (startActs[first] || 0) + 1;
    if (last) endActs[last] = (endActs[last] || 0) + 1;
  });

  // Diagrama. Ids en el orden del MVP: Inicio, Fin, actividades y luego aristas.
  const nodos: Nodo[] = [], aristas: Arista[] = [];
  const startNode = crearNodo('n' + (siguienteId++), 'start', 80, 100, 'Inicio', formas);
  const endNode = crearNodo('n' + (siguienteId++), 'end', 80, 100, 'Fin', formas);
  nodos.push(startNode);

  const nodeMap: Record<string, Nodo> = {};
  let x = 220, y = 100;
  const cols = 4;
  allActs.forEach((act, idx) => {
    const isSystem = /(sistema|sap|crm|erp|core|portal)/i.test(act);
    const def = formas[isSystem ? 'system' : 'task']!;
    // Sin executionType: así lo crea el MVP (y así sale en el JSON exportado).
    const node = {
      id: 'n' + (siguienteId++),
      type: isSystem ? 'system' : 'task',
      x, y, w: def.w, h: def.h,
      label: act,
      owner: actResource[act] || '',
      system: '', time: '',
      volume: String(actFreq[act]),
      va: '', notes: `Frecuencia observada: ${actFreq[act]}`, pains: []
    } as Nodo;
    nodos.push(node);
    nodeMap[act] = node;
    x += def.w + 60;
    if ((idx + 1) % cols === 0) { x = 220; y += 140; }
  });
  nodos.push(endNode);

  const porFrecuencia = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);

  // Inicio -> 2 actividades iniciales más frecuentes
  porFrecuencia(startActs).slice(0, 2).forEach(([act, freq]) => {
    if (nodeMap[act]) aristas.push({ id: 'e' + (siguienteId++), from: startNode.id, to: nodeMap[act]!.id, label: `${freq} cases` });
  });

  // Transiciones: solo las que ocurren ≥ 10 % de la más frecuente (filtra ruido).
  // Como en el MVP, un log sin transiciones lanza aquí (no hay "más frecuente").
  const transitions = porFrecuencia(transFreq);
  const threshold = Math.max(1, Math.floor(transitions[0]![1] * 0.1));
  transitions.forEach(([key, freq]) => {
    if (freq < threshold) return;
    const [from, to] = key.split('→') as [string, string];
    if (nodeMap[from] && nodeMap[to]) {
      aristas.push({ id: 'e' + (siguienteId++), from: nodeMap[from]!.id, to: nodeMap[to]!.id, label: String(freq) });
    }
  });

  // 2 actividades finales más frecuentes -> Fin
  porFrecuencia(endActs).slice(0, 2).forEach(([act, freq]) => {
    if (nodeMap[act]) aristas.push({ id: 'e' + (siguienteId++), from: nodeMap[act]!.id, to: endNode.id, label: `${freq} cases` });
  });

  // Fin al final de la rejilla
  endNode.x = x + 100;
  endNode.y = y;

  return {
    nodos, aristas, siguienteId, variantes, totalCasos,
    actividades: allActs.length,
    transiciones: transitions.length,
    topInicio: porFrecuencia(startActs)[0]?.[0],
    topFin: porFrecuencia(endActs)[0]?.[0]
  };
}
