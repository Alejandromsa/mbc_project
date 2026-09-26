// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from './dom.js';
import { avisarCambio } from './cambios.js';
import { STORAGE_KEY, normalizeFicha, state } from './estado.js';
import { recordHistory } from './historial.js';
import { updateViewUi } from './vistas/comparador.js';

// =================== PERSISTENCE ===================
// Feedback visual de auto-save (estado "Guardando" → "Guardado")
let _saveTimer = null;
function showSaving() {
  const el = $('#statusSaved');
  if (!el) return;
  el.classList.add('saving');
  el.innerHTML = '<span class="dot"></span>Guardando';
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    el.classList.remove('saving');
    el.innerHTML = '<span class="dot"></span>Guardado';
  }, 350);
}

function persist() {
  try {
    // Commit del view activo a _views antes de serializar
    state._views[state.activeView] = {
      nodes: state.nodes,
      edges: state.edges
    };
    const snapshot = {
      meta: state.meta,
      ficha: state.ficha,
      nodes: state.nodes,
      edges: state.edges,
      activeView: state.activeView,
      views: state._views,
      nextId: state.nextId,
      raci: state._raci || null,
      sipoc: state._sipoc || null,
      simResults: state._simResults || null,
      kpiValues: state._kpiValues || null,
      lanes: state._lanes || null,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    showSaving();
  } catch (e) {
    $('#statusSaved').innerHTML = '<span class="dot" style="background:var(--danger)"></span>Error al guardar';
  }
  recordHistory();
  avisarCambio();
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.meta = data.meta || state.meta;
    state.ficha = normalizeFicha(data.ficha);
    state.nodes = data.nodes || [];
    state.edges = data.edges || [];
    state.activeView = data.activeView || 'asis';
    state._views = data.views || { asis: null, tobe: null };
    state.nextId = data.nextId || 1;
    state._raci = data.raci || null;
    state._sipoc = data.sipoc || null;
    state._simResults = data.simResults || null;
    state._kpiValues = data.kpiValues || {};
    state._lanes = data.lanes || null;
    $('#processName').value = state.meta.name || '';
    $('#processIndustry').value = state.meta.industry || '';
    $('#processMacro').value = state.meta.macroprocess || '';
    updateViewUi();
  } catch (e) { /* ignore */ }
}

export { loadFromStorage, persist };
