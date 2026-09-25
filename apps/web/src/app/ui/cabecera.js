// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { exportBpmn } from '../bpmn/exportar.js';
import { copilotPost } from '../copiloto/copiloto.js';
import { $, $$, canvas } from '../dom.js';
import { state } from '../estado.js';
import { exportJson, exportPng, exportSvg, importJson } from '../exportar/archivos.js';
import { openFichaPreview } from '../exportar/ficha.js';
import { exportPptx } from '../exportar/pptx.js';
import { exportWord } from '../exportar/word.js';
import { resetState } from '../historial.js';
import { aiReady } from '../ia/motor.js';
import { runAiTask } from '../ia/tareas.js';
import { openIngestModal } from '../ingesta/modal.js';
import { autoLayout } from '../layout/auto-layout.js';
import { cablearSelectorNivel } from '../layout/niveles.js';
import { deleteSelection } from '../lienzo/interaccion.js';
import { render } from '../lienzo/render.js';
import { activateTab } from '../paneles/cajon.js';
import { renderKpiLibrary } from '../paneles/kpis.js';
import { persist } from '../persistencia.js';
import { cloneAsIsToToBe, setView } from '../vistas/comparador.js';
import { openTransformToBeModal } from '../vistas/to-be.js';

// =================== HEADER ===================
function attachHeaderListeners() {
  $('#processName').addEventListener('input', e => { state.meta.name = e.target.value; persist(); });
  $('#processIndustry').addEventListener('change', e => { state.meta.industry = e.target.value; persist(); renderKpiLibrary(); });
  $('#processMacro').addEventListener('change', e => { state.meta.macroprocess = e.target.value; persist(); });

  $('#btnNew').addEventListener('click', () => {
    if (confirm('¿Crear un nuevo proceso? Se perderá el actual si no fue exportado.')) resetState();
  });

  // View toggle as-is / to-be
  $('#btnViewAsIs').addEventListener('click', () => setView('asis'));
  $('#btnViewToBe').addEventListener('click', () => setView('tobe'));
  $('#btnCloneToBe').addEventListener('click', cloneAsIsToToBe);
  $('#btnTransformToBe').addEventListener('click', () => {
    // Con API key el To-Be lo disena Claude sobre ESTE proceso; sin key, reglas fijas
    if (aiReady() && state.nodes.length) {
      activateTab('copilot');
      copilotPost('user', 'Disenar el proceso To-Be (IA).');
      runAiTask('propose-tobe');
      return;
    }
    (openTransformToBeModal)();
  });

  $('#btnIngest').addEventListener('click', openIngestModal);
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', importJson);

  // Export dropdown
  const dd = $('#exportDropdown');
  const ddBtn = $('#btnExportMenu');
  const setDdOpen = (open) => {
    ddBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    const ch = ddBtn.querySelector('.chevron');
    if (ch) ch.style.transform = open ? 'rotate(180deg)' : 'rotate(0)';
    if (open) {
      dd.classList.remove('closing');
      dd.hidden = false;
    } else if (!dd.hidden) {
      dd.classList.add('closing');
      setTimeout(() => { dd.hidden = true; dd.classList.remove('closing'); }, 120);
    }
  };
  ddBtn.addEventListener('click', e => {
    e.stopPropagation();
    setDdOpen(dd.hidden);
  });
  document.addEventListener('click', () => setDdOpen(false));
  dd.addEventListener('click', e => e.stopPropagation());
  dd.querySelectorAll('button[data-export]').forEach(b => {
    b.addEventListener('click', () => {
      setDdOpen(false);
      switch (b.dataset.export) {
        case 'json': exportJson(); break;
        case 'svg':  exportSvg();  break;
        case 'png':  exportPng();  break;
        case 'bpmn': exportBpmn(); break;
        case 'pptx': exportPptx(b.dataset.tema || 'mbc'); break;
        case 'word': exportWord(); break;
        case 'ficha': openFichaPreview(); break;
      }
    });
  });
}

// =================== TOOLBAR ===================
function attachToolbarListeners() {
  $$('.shape-btn[data-shape]').forEach(btn => {
    btn.addEventListener('dragstart', e => {
      e.dataTransfer.setData('shape', btn.dataset.shape);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  $('#btnConnect').addEventListener('click', toggleConnectMode);
  $('#btnDelete').addEventListener('click', deleteSelection);
  $('#btnAutoLayout').addEventListener('click', autoLayout);
  cablearSelectorNivel();
}

function toggleConnectMode() {
  state.mode = state.mode === 'connect' ? 'edit' : 'connect';
  state.connectSourceId = null;
  $('#btnConnect').classList.toggle('active', state.mode === 'connect');
  canvas.classList.toggle('connect-mode', state.mode === 'connect');
  $('#statusMode').textContent = `Modo: ${state.mode === 'connect' ? 'conexión (click origen y destino)' : 'edición'}`;
  render();
}

export { attachHeaderListeners, attachToolbarListeners, toggleConnectMode };
