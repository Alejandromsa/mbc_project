// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { analyzeAutomation, analyzeBottleneck, analyzeVariants, generateBacklog, openWhatIfModal, toggleValueMap } from '../analitica/avanzada.js';
import { generateImpactEffort } from '../analitica/impacto-esfuerzo.js';
import { generateRaci } from '../analitica/raci.js';
import { generateSipoc } from '../analitica/sipoc.js';
import { $, $$ } from '../dom.js';
import { state } from '../estado.js';
import { alCambiarIdioma, etiquetaTarea, tr } from '../i18n.js';
import { aiReady } from '../ia/motor.js';
import { aiAnalyzePains } from '../ia/pains.js';
import { AI_TASKS, runAiTask } from '../ia/tareas.js';
import { ingestarDescripcion } from '../ingesta/flujo.js';
import { autoLayout } from '../layout/auto-layout.js';
import { autoFitDiagram } from '../lienzo/calidad.js';
import { maybeFitOnLoad } from '../lienzo/zoom.js';
import { activateTab } from '../paneles/cajon.js';
import { insertMergeGateways } from '../proceso/operaciones.js';
import { openModal } from '../ui/modal.js';
import { escapeHtml } from '../util.js';
import { detectPainsMock, execSummaryMock, mockCopilotResponse, proposeToBeMock, suggestKpisMock } from './heuristicas.js';

// =================== COPILOT (mock) ===================
function attachCopilotListeners() {
  $$('.copilot-action').forEach(b => {
    b.addEventListener('click', () => handleCopilotAction(b.dataset.action));
  });
  $('#btnCopilotSend').addEventListener('click', () => {
    const txt = $('#copilotPrompt').value.trim();
    if (!txt) return;
    copilotPost('user', txt);
    $('#copilotPrompt').value = '';
    setTimeout(() => copilotPost('ai', mockCopilotResponse(txt)), 350);
  });
  saludo = copilotPost('ai', tr('copiloto.saludo'));
}

// El saludo se vuelve a escribir al cambiar de idioma; los demás mensajes son la
// conversación y se quedan en el idioma en que se escribieron.
let saludo = null;
alCambiarIdioma(() => {
  const burbuja = saludo && saludo.isConnected && saludo.querySelector('.bubble');
  if (burbuja) {
    burbuja.innerHTML = formatMd(tr('copiloto.saludo'));
    saludo.querySelector('.author').textContent = tr('copiloto.autor');
  }
});

// Lo que se escribe en el chat como pedido de la persona, por acción rápida
const PEDIDOS = {
  'detect-pains': 'copiloto.pedido.detectPains', 'suggest-kpis': 'copiloto.pedido.suggestKpis',
  'propose-tobe': 'copiloto.pedido.proposeTobe', 'raci': 'copiloto.pedido.raci', 'sipoc': 'copiloto.pedido.sipoc',
  'impact-effort': 'copiloto.pedido.impactEffort', 'whatif': 'copiloto.pedido.whatif',
  'automation': 'copiloto.pedido.automation', 'bottleneck': 'copiloto.pedido.bottleneck',
  'variants': 'copiloto.pedido.variants', 'value-map': 'copiloto.pedido.valueMap', 'backlog': 'copiloto.pedido.backlog',
  'exec-summary': 'copiloto.pedido.execSummary', 'merge-gateways': 'copiloto.pedido.mergeGateways',
  'ai-pains': 'copiloto.pedido.aiPains', 'autofit': 'copiloto.pedido.autofit', 'relayout': 'copiloto.pedido.relayout'
};

function handleCopilotAction(action) {
  if (aiReady() && AI_TASKS[action]) { copilotPost('user', tr('copiloto.tareaIa', { tarea: etiquetaTarea(action, AI_TASKS[action]) })); runAiTask(action); return; }

  activateTab('copilot');
  switch (action) {
    case 'generate':
      openModal(tr('copiloto.generarTitulo'),
        '<textarea id="modalInput" placeholder="' + tr('copiloto.generarEjemplo') + '"></textarea>',
        () => {
          const desc = $('#modalInput').value.trim();
          if (!desc) return;
          copilotPost('user', tr('copiloto.generarPedido', { desc }));
          ingestarDescripcion(desc);
        });
      break;
    case 'detect-pains':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(detectPainsMock, 300);
      break;
    case 'suggest-kpis':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(suggestKpisMock, 300);
      break;
    case 'propose-tobe':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(proposeToBeMock, 300);
      break;
    case 'raci':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(generateRaci, 250);
      break;
    case 'sipoc':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(generateSipoc, 250);
      break;
    case 'impact-effort':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(generateImpactEffort, 250);
      break;
    case 'whatif':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(openWhatIfModal, 250);
      break;
    case 'automation':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(analyzeAutomation, 250);
      break;
    case 'bottleneck':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(analyzeBottleneck, 250);
      break;
    case 'variants':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(analyzeVariants, 250);
      break;
    case 'value-map':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(toggleValueMap, 250);
      break;
    case 'backlog':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(generateBacklog, 250);
      break;
    case 'exec-summary':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(execSummaryMock, 300);
      break;
    case 'merge-gateways':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(insertMergeGateways, 250);
      break;
    case 'ai-pains':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(aiAnalyzePains, 200);
      break;
    case 'autofit':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(() => autoFitDiagram(), 220);
      break;
    case 'relayout':
      copilotPost('user', tr(PEDIDOS[action]));
      setTimeout(() => {
        state._wrap = undefined;          // vuelve a decidir automáticamente
        autoLayout();
        maybeFitOnLoad();
        const L = state._lanes || {};
        copilotPost('ai', tr('copiloto.reorganizado', { disposicion: L.wrap ? tr('copiloto.envolvente', { bandas: L.bands, columnas: L.wrapAt }) : tr('copiloto.unaBanda') }));
      }, 200);
      break;
  }
}

function copilotPost(who, text) {
  const wrap = $('#copilotMessages');
  const div = document.createElement('div');
  div.className = 'copilot-msg ' + who;
  if (who === 'ai') {
    div.innerHTML = `<div class="author">${tr('copiloto.autor')}</div><div class="bubble">${formatMd(text)}</div>`;
  } else {
    div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  }
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
  return div;
}

function formatMd(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

export { attachCopilotListeners, copilotPost };
