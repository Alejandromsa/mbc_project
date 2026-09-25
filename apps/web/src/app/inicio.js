// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { attachSimulatorListeners } from './analitica/simulador.js';
import { generateBpmnXml } from './bpmn/exportar.js';
import { importBpmnXml } from './bpmn/importar.js';
import { attachCopilotListeners } from './copiloto/copiloto.js';
import { $ } from './dom.js';
import { loadComplexDemo, loadComplexDemo10, loadComplexDemo11, loadComplexDemo12, loadComplexDemo2, loadComplexDemo3, loadComplexDemo4, loadComplexDemo5, loadComplexDemo6, loadComplexDemo7, loadComplexDemo8, loadComplexDemo9, loadDemoProcess } from './ejemplos/ejemplos.js';
import { loadFichaVentaLotes } from './ejemplos/venta-lotes.js';
import { state } from './estado.js';
import { serializeCanvasSvg } from './exportar/archivos.js';
import { exportFicha, openFichaPreview } from './exportar/ficha.js';
import { deriveFicha } from './exportar/word.js';
import { attachUndoRedoListeners, resetHistory } from './historial.js';
import { attachAiListeners, openAiSettings, updateAiUi } from './ia/ajustes.js';
import { askProfundidad } from './ia/dialogos.js';
import { buildProcessFromAiSpec } from './ia/generacion.js';
import { aiReady } from './ia/motor.js';
import { aiAnalyzePains } from './ia/pains.js';
import { AI_TASKS, runAiTask } from './ia/tareas.js';
import { runIngest } from './ingesta/flujo.js';
import { cancelIngestJob } from './ingesta/formatos.js';
import { addSource, sourcesList } from './ingesta/fuentes.js';
import { attachIngestListeners } from './ingesta/modal.js';
import { detectParticipants } from './ingesta/participantes.js';
import { autoLayout } from './layout/auto-layout.js';
import { NIVELES, aplicarNivel } from './layout/niveles.js';
import { autoFitDiagram, diagramQuality } from './lienzo/calidad.js';
import { attachCanvasListeners } from './lienzo/interaccion.js';
import { render } from './lienzo/render.js';
import { invalidarRutas } from './lienzo/ruteo.js';
import { attachZoomInteractions } from './lienzo/zoom.js';
import { attachTabListeners } from './paneles/cajon.js';
import { attachFichaListeners } from './paneles/ficha.js';
import { attachKpiListeners, populateKpiLibrary } from './paneles/kpis.js';
import { attachPainListeners } from './paneles/pains.js';
import { attachPropertyListeners } from './paneles/propiedades.js';
import { loadFromStorage } from './persistencia.js';
import { attachHeaderListeners, attachToolbarListeners } from './ui/cabecera.js';
import { attachMobileNotice } from './ui/movil.js';
import { attachOnboardListeners } from './ui/onboarding.js';
import { restoreUiState } from './ui/preferencias.js';
import { attachPresentListeners } from './ui/presentacion.js';
import { attachKeyboardShortcuts } from './ui/teclado.js';

// =================== INIT ===================
function init() {
  populateSelects();
  populateKpiLibrary();
  populatePainCategories();
  populateExecutionTypes();
  attachHeaderListeners();
  attachToolbarListeners();
  attachCanvasListeners();
  attachTabListeners();
  attachPropertyListeners();
  attachPainListeners();
  attachCopilotListeners();
  attachKpiListeners();
  attachSimulatorListeners();
  attachKeyboardShortcuts();
  attachOnboardListeners();
  attachZoomInteractions();
  attachPresentListeners();
  attachMobileNotice();
  restoreUiState();   // restaura paneles colapsados antes del primer render
  loadFromStorage();
  // Si hay nodos pero faltan lanes (versión vieja en localStorage), genera layout
  if (state.nodes.length > 0 && !state._lanes) {
    autoLayout();
  } else {
    render();
  }
  resetHistory();   // línea base del historial (estado al abrir)
  attachUndoRedoListeners();
  attachFichaListeners();
  attachAiListeners();
  updateAiUi();
  // Hook para demos/pruebas (cargadores de ejemplo)
  window.ProcessIQ = { loadDemo: loadDemoProcess, loadComplex: loadComplexDemo, loadComplex2: loadComplexDemo2, loadComplex3: loadComplexDemo3, loadComplex4: loadComplexDemo4, loadComplex5: loadComplexDemo5, loadComplex6: loadComplexDemo6, loadComplex7: loadComplexDemo7, loadComplex8: loadComplexDemo8, loadComplex9: loadComplexDemo9, loadComplex10: loadComplexDemo10, loadComplex11: loadComplexDemo11, loadComplex12: loadComplexDemo12, loadFichaVentaLotes: loadFichaVentaLotes, exportFicha: exportFicha, openFichaPreview: openFichaPreview, deriveFicha: deriveFicha, importBpmnXml: (xml) => importBpmnXml(xml), generateBpmnXml: () => generateBpmnXml(), snapshot: () => ({ nodes: state.nodes.length, edges: state.edges.length, tasks: state.nodes.filter(n => n.type==='task'||n.type==='system').length, decisions: state.nodes.filter(n => n.type==='decision').length, name: state.meta.name }), aiReady: () => aiReady(), openAiSettings: openAiSettings, buildProcessFromAiSpec: (s) => buildProcessFromAiSpec(s, 'test'), addSource: (t,n,x) => addSource(t,n,x), sources: () => sourcesList(), runAiTask: (k) => runAiTask(k), aiTasks: () => Object.keys(AI_TASKS), aiAnalyzePains: () => aiAnalyzePains(), detectParticipants: (t) => detectParticipants(t), autoFit: (o) => autoFitDiagram(o), quality: () => diagramQuality(), runIngest: (src) => runIngest(src), cancelIngest: () => cancelIngestJob(), astar: (on) => { state._astar = !!on; invalidarRutas(); return !!on; }, nivel: (n) => aplicarNivel(n), niveles: () => NIVELES, askProfundidad: () => askProfundidad(), sinDescarga: (on) => { state._sinDescarga = !!on; }, ultimoPptx: () => state._ultimoPptx, nombresPptx: () => state._nombresPorNodo, modeloCompleto: () => state._modeloCompleto ? state._modeloCompleto.nodes.length : 0, svg: () => serializeCanvasSvg() };
}

function populateSelects() {
  const ind = $('#processIndustry');
  const mac = $('#processMacro');
  const filt = $('#kpiFilterIndustry');
  window.INDUSTRIES.forEach(i => {
    ind.insertAdjacentHTML('beforeend', `<option value="${i}">${i}</option>`);
    filt.insertAdjacentHTML('beforeend', `<option value="${i}">${i}</option>`);
  });
  window.MACROPROCESSES.forEach(m => {
    mac.insertAdjacentHTML('beforeend', `<option value="${m}">${m}</option>`);
  });
}

function populatePainCategories() {
  const sel = $('#painCategory');
  window.PAIN_CATEGORIES.forEach(c => {
    sel.insertAdjacentHTML('beforeend', `<option value="${c.id}">${c.icon} ${c.label}</option>`);
  });
}

function populateExecutionTypes() {
  const sel = $('#propExecType');
  if (!sel) return;
  (window.EXECUTION_TYPES || []).forEach(t => {
    sel.insertAdjacentHTML('beforeend', `<option value="${t.id}">${t.label}</option>`);
  });
}

// =================== BOOT ===================
document.addEventListener('DOMContentLoaded', () => {
  init();
  attachIngestListeners();
});
