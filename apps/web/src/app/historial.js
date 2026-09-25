// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from './dom.js';
import { emptyFicha, normalizeFicha, state } from './estado.js';
import { renderSources } from './ingesta/fuentes.js';
import { autoFitDiagram } from './lienzo/calidad.js';
import { render } from './lienzo/render.js';
import { renderProperties } from './paneles/propiedades.js';
import { persist } from './persistencia.js';
import { runLinter } from './validacion/lint.js';
import { updateViewUi } from './vistas/comparador.js';

// =================== HISTORIAL (DESHACER / REHACER) ===================
let historyPaused = false;
const HISTORY_CAP = 60;
function buildHistorySnapshot() {
  return JSON.stringify({
    meta: state.meta, ficha: state.ficha, nodes: state.nodes, edges: state.edges,
    activeView: state.activeView, views: state._views, nextId: state.nextId,
    raci: state._raci || null, sipoc: state._sipoc || null,
    kpiValues: state._kpiValues || null, lanes: state._lanes || null
  });
}
function recordHistory() {
  if (historyPaused || state._restoringHistory) return;
  if (!state._history) { state._history = []; state._histIdx = -1; }
  const snap = buildHistorySnapshot();
  if (state._history[state._histIdx] === snap) return;   // dedupe estados idénticos
  state._history = state._history.slice(0, state._histIdx + 1);   // descarta rama de rehacer
  state._history.push(snap);
  if (state._history.length > HISTORY_CAP) state._history.shift();
  state._histIdx = state._history.length - 1;
  updateUndoRedoUi();
}
function resetHistory() {
  state._history = []; state._histIdx = -1;
  recordHistory();   // captura el estado actual como línea base
}
function applyHistorySnapshot(snap) {
  const data = JSON.parse(snap);
  state.nodes = data.nodes || [];
  state.edges = data.edges || [];
  state.meta = data.meta || state.meta;
  state.ficha = normalizeFicha(data.ficha);
  state.activeView = data.activeView || 'asis';
  state._views = data.views || { asis: null, tobe: null };
  state.nextId = data.nextId || 1;
  state._raci = data.raci || null;
  state._sipoc = data.sipoc || null;
  state._kpiValues = data.kpiValues || {};
  state._lanes = data.lanes || null;
  state.selectedNodeId = null; state.selectedEdgeId = null;
  state._restoringHistory = true;
  $('#processName').value = state.meta.name || '';
  $('#processIndustry').value = state.meta.industry || '';
  $('#processMacro').value = state.meta.macroprocess || '';
  updateViewUi();
  render();
  renderProperties();
  runLinter();
  persist();   // persiste el estado restaurado (recordHistory queda neutralizado por la bandera)
  state._restoringHistory = false;
  updateUndoRedoUi();
}
function undo() {
  if (!state._history || state._histIdx <= 0) return;
  state._histIdx--;
  applyHistorySnapshot(state._history[state._histIdx]);
}
function redo() {
  if (!state._history || state._histIdx >= state._history.length - 1) return;
  state._histIdx++;
  applyHistorySnapshot(state._history[state._histIdx]);
}
function updateUndoRedoUi() {
  const u = $('#btnUndo'), r = $('#btnRedo');
  if (u) u.disabled = !state._history || state._histIdx <= 0;
  if (r) r.disabled = !state._history || state._histIdx >= state._history.length - 1;
}
function attachUndoRedoListeners() {
  const u = $('#btnUndo'), r = $('#btnRedo');
  if (u) u.addEventListener('click', undo);
  if (r) r.addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' || e.key === 'Z') && e.shiftKey || e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
  });
  updateUndoRedoUi();

  // Panel de atajos de teclado
  const panel = $('#shortcutsPanel');
  const setShortcuts = (show) => {
    if (!panel) return;
    panel.hidden = !show;
    const b = $('#btnShortcuts');
    if (b) b.classList.toggle('active', show);
  };
  const afb = $('#btnAutoFit');
  if (afb) afb.addEventListener('click', () => autoFitDiagram());

  const sbtn = $('#btnShortcuts');
  if (sbtn) sbtn.addEventListener('click', () => setShortcuts(panel.hidden));
  const sclose = $('#btnShortcutsClose');
  if (sclose) sclose.addEventListener('click', () => setShortcuts(false));
  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (typing) return;
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShortcuts(panel && panel.hidden); }
    else if (e.key === 'Escape' && panel && !panel.hidden) { setShortcuts(false); }
  });
}

function resetState() {
  // Pausa el historial durante la carga (demo/Nuevo) y captura UNA línea base al terminar (microtask)
  historyPaused = true;
  Promise.resolve().then(() => { historyPaused = false; resetHistory(); });
  state.meta = { name: '', industry: '', macroprocess: '', client: '', owner: '' };
  state.ficha = emptyFicha();
  state._sources = [];
  if (typeof renderSources === 'function') renderSources();
  state.nodes = [];
  state.edges = [];
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.nextId = 1;
  state.activeView = 'asis';
  state._views = { asis: null, tobe: null };
  state._raci = null;
  state._sipoc = null;
  state._simResults = null;
  state._kpiValues = {};
  state._bottleneckId = null;
  state._variants = null;
  state._valueMode = false;
  state._backlog = null;
  updateViewUi();
  $('#processName').value = '';
  $('#processIndustry').value = '';
  $('#processMacro').value = '';
  persist();
  render();
}

export { attachUndoRedoListeners, recordHistory, resetHistory, resetState };
