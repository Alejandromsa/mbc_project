// Proceso a partir de las actividades detectadas en un texto (modo básico).
// Portado del MVP 3.8.9 (buildProcessFromText): mismos ids, posiciones y
// campos; aplicarlo al proceso abierto es cosa de la app.
import { crearNodo, FORMAS_POR_DEFECTO, type Arista, type FormaPorDefecto, type Nodo } from '@processiq/dominio';
import type { ActividadDetectada } from './texto.js';

/** Sin IA, un documento largo generaría cientos de nodos ilegibles. */
export const MAX_NODOS_BASICO = 60;

export interface ProcesoBasico {
  nodos: Nodo[];
  aristas: Arista[];
  siguienteId: number;
  /** Actividades usadas (tras el recorte). */
  actividades: number;
  /** Actividades detectadas si hubo recorte; 0 si no. */
  recortadoDe: number;
}

/** Inicio, una caja por actividad en rejilla de 5 columnas, "Caso completado" y conexión lineal. */
export function construirProcesoBasico(
  detectadas: readonly ActividadDetectada[],
  opciones: { siguienteId: number; formas?: Readonly<Record<string, FormaPorDefecto>> }
): ProcesoBasico {
  const formas = opciones.formas ?? FORMAS_POR_DEFECTO;
  let siguienteId = opciones.siguienteId;
  let activities = detectadas;
  let recortadoDe = 0;
  if (activities.length > MAX_NODOS_BASICO) {
    recortadoDe = activities.length;
    activities = activities.slice(0, MAX_NODOS_BASICO);
  }

  const nodos: Nodo[] = [], aristas: Arista[] = [];
  let x = 80, y = 100;
  const cols = 5;
  const created: Nodo[] = [];
  const startNode = crearNodo('n' + (siguienteId++), 'start', x, y, 'Inicio', formas);
  created.push(startNode); nodos.push(startNode);
  x += formas.start!.w + 60;

  activities.forEach((a) => {
    const def = formas[a.type]!;
    const defaultExec = a.type === 'system' ? 'system' : (a.type === 'task' ? 'manual' : '');
    const node: Nodo = {
      id: 'n' + (siguienteId++),
      type: a.type,
      x, y, w: def.w, h: def.h,
      label: a.label,
      executionType: a.executionType || defaultExec,
      owner: a.owner || '', system: a.system || '',
      time: '', volume: '', va: '',
      sla: '', docsIn: '', docsOut: '', rules: '',
      notes: a.note || '', pains: []
    };
    nodos.push(node);
    created.push(node);
    x += def.w + 60;
    if ((created.length % cols) === 0) { x = 80; y += 150; }
  });

  const endNode = crearNodo('n' + (siguienteId++), 'end', x, y, 'Caso completado', formas);
  created.push(endNode); nodos.push(endNode);

  for (let i = 0; i < created.length - 1; i++) {
    aristas.push({ id: 'e' + (siguienteId++), from: created[i]!.id, to: created[i + 1]!.id, label: '' });
  }
  return { nodos, aristas, siguienteId, actividades: activities.length, recortadoDe };
}
