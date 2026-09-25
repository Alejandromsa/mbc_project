// Ruteo de flechas del lienzo: la geometría está en @processiq/motor; aquí
// viven las cachés (path por arista, corredores de retorno, canales del A*).
import { LOOP_GAP, corredoresDeRetorno, rutaArista } from '@processiq/motor';
import { state } from '../estado.js';

// ── A* APAGADO POR DEFECTO (docs/mvp/HANDOFF.md, pendiente #3): a la densidad
//   actual no hay canales libres y va 6-13 veces más lento sin mejorar.
//   Activar con ProcessIQ.astar(true).
let _astCanales = null;   // 'H:y' | 'V:x' -> nº de aristas que lo usan (null = A* apagado)
let _rutaSerie = 0;       // sube con cada relayout: invalida los paths cacheados

function astReset() { _astCanales = new Map(); }
function invalidarRutas() { _rutaSerie++; _astCanales = null; }

// Un corredor de retorno por arista, recalculado solo si cambian las aristas
function loopCorridors() {
  if (state._loopSlots && state._loopSlotsFor === state.edges.length) return state._loopSlots;
  const slots = corredoresDeRetorno(state.nodes, state.edges);
  state._loopSlots = slots;
  state._loopSlotsFor = state.edges.length;
  return slots;
}

// Path entre dos nodos, cacheado por layout: repintar (zoom, scroll,
// selección) no debe volver a rutear.
function smartEdgePath(a, b, edge) {
  if (edge && edge._dSerie === _rutaSerie && edge._d) return edge._d;
  const d = rutaArista(a, b, edge, {
    nodes: state.nodes, lanes: state._lanes, corredores: loopCorridors, canales: _astCanales
  });
  if (edge) { edge._d = d; edge._dSerie = _rutaSerie; }
  return d;
}

export { LOOP_GAP, astReset, invalidarRutas, loopCorridors, smartEdgePath };
