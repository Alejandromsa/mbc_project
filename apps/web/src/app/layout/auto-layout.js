// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { calcularLayout, normalizarGeometria } from '@processiq/motor';
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { render } from '../lienzo/render.js';
import { invalidarRutas } from '../lienzo/ruteo.js';
import { persist } from '../persistencia.js';
import { assignActivityCodes, computeOwners, ensureDecisionBranches } from '../proceso/operaciones.js';

// Auto-layout por carriles: el cálculo está en @processiq/motor (calcularLayout).
// Si el proceso trae un orden de carriles propio (`meta.ordenCarriles`, el del
// archivo de un BPMN importado), se respeta en lugar de reordenar por baricentro.
function autoLayout() {
  invalidarRutas();
  if (state.nodes.length === 0) return;
  normalizarGeometria(state.nodes, SHAPE_DEFAULTS);
  ensureDecisionBranches();
  const ownerMap = computeOwners();
  const orden = state.meta && Array.isArray(state.meta.ordenCarriles) ? state.meta.ordenCarriles : null;
  state._lanes = calcularLayout(state.nodes, state.edges, { ownerMap, wrap: state._wrap === true, ...(orden ? { ordenCarriles: orden } : {}) });
  state._loopSlots = null;   // invalida corredores de retorno tras recolocar
  // Códigos de actividad ahora que existen ranks (orden izq -> der)
  assignActivityCodes();
  persist();
  render();
}

export { autoLayout };
