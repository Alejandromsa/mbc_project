// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { analyzeAutomation, analyzeBottleneck, analyzeVariants, generateBacklog, openWhatIfModal, toggleValueMap } from '../analitica/avanzada.js';
import { generateImpactEffort } from '../analitica/impacto-esfuerzo.js';
import { generateRaci } from '../analitica/raci.js';
import { generateSipoc } from '../analitica/sipoc.js';
import { $, $$ } from '../dom.js';
import { state } from '../estado.js';
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
  copilotPost('ai',
    '¡Hola! Soy tu copiloto **ProcessIQ**.\n\n' +
    'Estoy aquí para ayudarte a levantar, diagnosticar y reingenierizar procesos más rápido.\n' +
    'Empieza completando el **nombre, industria y macroproceso** arriba, y luego usa las acciones rápidas o pídeme algo en lenguaje natural.\n\n' +
    'Ejemplo: *"Levanta el proceso de gestión de reclamos para un banco minorista peruano."*');
}

function handleCopilotAction(action) {
  if (aiReady() && AI_TASKS[action]) { copilotPost('user', AI_TASKS[action].etiqueta + ' (IA).'); runAiTask(action); return; }

  activateTab('copilot');
  switch (action) {
    case 'generate':
      openModal('Generar proceso desde descripción',
        '<textarea id="modalInput" placeholder="Describe el proceso a levantar..."></textarea>',
        () => {
          const desc = $('#modalInput').value.trim();
          if (!desc) return;
          copilotPost('user', 'Generar proceso: ' + desc);
          ingestarDescripcion(desc);
        });
      break;
    case 'detect-pains':
      copilotPost('user', 'Detecta pains en el diagrama actual.');
      setTimeout(detectPainsMock, 300);
      break;
    case 'suggest-kpis':
      copilotPost('user', 'Sugiere KPIs aplicables.');
      setTimeout(suggestKpisMock, 300);
      break;
    case 'propose-tobe':
      copilotPost('user', 'Propón reingeniería to-be.');
      setTimeout(proposeToBeMock, 300);
      break;
    case 'raci':
      copilotPost('user', 'Generar matriz RACI.');
      setTimeout(generateRaci, 250);
      break;
    case 'sipoc':
      copilotPost('user', 'Generar SIPOC del proceso.');
      setTimeout(generateSipoc, 250);
      break;
    case 'impact-effort':
      copilotPost('user', 'Generar matriz impacto-esfuerzo.');
      setTimeout(generateImpactEffort, 250);
      break;
    case 'whatif':
      copilotPost('user', 'Comparar escenarios What-If.');
      setTimeout(openWhatIfModal, 250);
      break;
    case 'automation':
      copilotPost('user', 'Detectar oportunidades de automatización.');
      setTimeout(analyzeAutomation, 250);
      break;
    case 'bottleneck':
      copilotPost('user', 'Identificar cuello de botella y ruta crítica.');
      setTimeout(analyzeBottleneck, 250);
      break;
    case 'variants':
      copilotPost('user', 'Analizar variantes del proceso.');
      setTimeout(analyzeVariants, 250);
      break;
    case 'value-map':
      copilotPost('user', 'Mostrar mapa de valor Lean (VA/NVA).');
      setTimeout(toggleValueMap, 250);
      break;
    case 'backlog':
      copilotPost('user', 'Generar backlog de iniciativas.');
      setTimeout(generateBacklog, 250);
      break;
    case 'exec-summary':
      copilotPost('user', 'Resumen ejecutivo del diagnóstico.');
      setTimeout(execSummaryMock, 300);
      break;
    case 'merge-gateways':
      copilotPost('user', 'Insertar compuertas de convergencia.');
      setTimeout(insertMergeGateways, 250);
      break;
    case 'ai-pains':
      copilotPost('user', 'Análisis profundo de dolores (IA).');
      setTimeout(aiAnalyzePains, 200);
      break;
    case 'autofit':
      copilotPost('user', 'Autoajustar el diagrama.');
      setTimeout(() => autoFitDiagram(), 220);
      break;
    case 'relayout':
      copilotPost('user', 'Reorganizar el diagrama.');
      setTimeout(() => {
        state._wrap = undefined;          // vuelve a decidir automáticamente
        autoLayout();
        maybeFitOnLoad();
        const L = state._lanes || {};
        copilotPost('ai', `**Diagrama reorganizado.** ${L.wrap ? `Modo envolvente activo: ${L.bands} bandas de hasta ${L.wrapAt} columnas (evita el diagrama kilométrico).` : 'Disposición en una sola banda.'} Carriles ordenados para minimizar cruces y retornos de reproceso por corredor inferior.`);
      }, 200);
      break;
  }
}

function copilotPost(who, text) {
  const wrap = $('#copilotMessages');
  const div = document.createElement('div');
  div.className = 'copilot-msg ' + who;
  if (who === 'ai') {
    div.innerHTML = `<div class="author">ProcessIQ · IA</div><div class="bubble">${formatMd(text)}</div>`;
  } else {
    div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  }
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function formatMd(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

export { attachCopilotListeners, copilotPost };
