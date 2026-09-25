// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { render } from '../lienzo/render.js';
import { activateTab } from '../paneles/cajon.js';
import { persist } from '../persistencia.js';

// ============================================================
// COMPARADOR As-Is / To-Be
// ============================================================
function setView(view) {
  if (view === state.activeView) return;
  // Snapshot del view activo antes de cambiar
  state._views[state.activeView] = {
    nodes: JSON.parse(JSON.stringify(state.nodes)),
    edges: JSON.parse(JSON.stringify(state.edges))
  };
  state.activeView = view;
  const target = state._views[view];
  if (target) {
    state.nodes = target.nodes;
    state.edges = target.edges;
  } else {
    state.nodes = [];
    state.edges = [];
  }
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  updateViewUi();
  persist();
  render();
}

function updateViewUi() {
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.activeView));
  let ind = document.getElementById('tobeIndicator');
  if (state.activeView === 'tobe') {
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'tobeIndicator';
      ind.className = 'tobe-indicator';
      ind.textContent = 'TO-BE · REINGENIERÍA';
      $('#canvasWrapper').appendChild(ind);
    }
  } else if (ind) ind.remove();
}

function cloneAsIsToToBe() {
  if (state.nodes.length === 0 && state.activeView === 'asis') {
    alert('Genera o dibuja un proceso As-Is primero.');
    return;
  }
  // Garantiza que el as-is actual esté guardado
  if (state.activeView === 'asis') {
    state._views.asis = {
      nodes: JSON.parse(JSON.stringify(state.nodes)),
      edges: JSON.parse(JSON.stringify(state.edges))
    };
  } else if (!state._views.asis) {
    alert('No hay un As-Is que clonar.');
    return;
  }
  // Clona profundo
  state._views.tobe = JSON.parse(JSON.stringify(state._views.asis));
  setView('tobe');
  activateTab('copilot');
  copilotPost('ai',
    `Cloné el As-Is al To-Be. Ahora puedes editar el flujo sin afectar el original.\n\n` +
    `**Sugerencias de reingeniería rápidas:**\n` +
    `• Elimina nodos de control duplicado.\n` +
    `• Marca actividades manuales como **sistema** (automatización).\n` +
    `• Une handoffs en una célula multifuncional.\n` +
    `• Mueve decisiones a reglas codificadas (DMN).\n\n` +
    `Cuando termines, exporta a PPTX — incluiré un slide comparativo lado a lado.`);
}

export { cloneAsIsToToBe, setView, updateViewUi };
