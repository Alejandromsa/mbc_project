// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { ordenDeFlujo } from '@processiq/dominio';
import {
  asegurarRamasDeDecision, asignarCodigosActividad, inferirResponsables, insertarCompuertasConvergencia
} from '@processiq/motor';
import { copilotPost } from '../copiloto/copiloto.js';
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { autoLayout } from '../layout/auto-layout.js';
import { persist } from '../persistencia.js';

// ============================================================
// COMPUERTAS DE CONVERGENCIA (merge)
// BPMN riguroso: cuando 2+ ramas abiertas por una compuerta vuelven a
// juntarse, se dibuja la compuerta de cierre en vez de un merge implícito.
// Es opt-in (acción del copiloto) porque cambia el número de nodos.
// ============================================================
function insertMergeGateways() {
  const before = state.nodes.length;
  const r = insertarCompuertasConvergencia(state.nodes, state.edges, state.nextId, SHAPE_DEFAULTS);
  state.nextId = r.siguienteId;
  const added = r.insertadas;
  if (!added) {
    copilotPost('ai', 'No encontré convergencias que necesiten compuerta de cierre: las ramas de este proceso terminan en fines distintos o ya convergen en una compuerta.');
    return 0;
  }
  persist();
  autoLayout();
  copilotPost('ai',
    `**${added} compuerta(s) de convergencia insertada(s).**\n\n` +
    `Donde varias ramas volvían a juntarse en una actividad, ahora se dibuja la compuerta de cierre (✕) — es lo que exige el BPMN riguroso y lo que esperan ver los comités.\n\n` +
    `Nodos: ${before} → ${state.nodes.length}. Si prefieres el merge implícito, usa **deshacer** (Ctrl+Z).`);
  return added;
}

// Cada decisión exclusiva con 2 salidas rotuladas Sí/No; si solo tiene una,
// se le crea un fin "Caso no procede" en su carril (@processiq/motor).
function ensureDecisionBranches() {
  state.nextId = asegurarRamasDeDecision(state.nodes, state.edges, state.nextId, SHAPE_DEFAULTS);
}

// Códigos de actividad estilo MBC ([USR-27]…), numerados por rank
function assignActivityCodes() {
  asignarCodigosActividad(state.nodes, state._lanes?.ranks);
}

// Responsable final de cada nodo (explícito -> inferido -> más frecuente)
function computeOwners() {
  return inferirResponsables(state.nodes, state.edges);
}

function makeNode(type, x, y, label) {
  const def = SHAPE_DEFAULTS[type];
  const defaultExec = type === 'system' ? 'system' : (type === 'task' ? 'manual' : '');
  return {
    id: 'n' + (state.nextId++), type,
    x, y, w: def.w, h: def.h,
    label, executionType: defaultExec,
    owner: '', system: '', time: '', volume: '', va: '',
    sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: []
  };
}

// Orden de recorrido del flujo (Ficha, informe Word, textos para la IA).
function flowOrderNodes() {
  return ordenDeFlujo(state.nodes, state.edges);
}

export { assignActivityCodes, computeOwners, ensureDecisionBranches, flowOrderNodes, insertMergeGateways, makeNode };
