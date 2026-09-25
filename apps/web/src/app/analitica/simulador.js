// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { simularCarga } from '@processiq/analitica';
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { getNode } from '../lienzo/interaccion.js';
import { render } from '../lienzo/render.js';
import { persist } from '../persistencia.js';
import { openModal } from '../ui/modal.js';
import { escapeHtml } from '../util.js';

// ============================================================
// SIMULADOR de carga (FTE, lead time, costo)
// ============================================================
function attachSimulatorListeners() {
  $('#btnSimRun').addEventListener('click', runSimulation);
  $('#btnSimWizard').addEventListener('click', openSimWizard);
}

function openSimWizard() {
  const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
  if (tasks.length === 0) { alert('Necesito actividades en el diagrama primero.'); return; }

  let html = `<p style="font-size:13px;margin:0 0 8px 0">Captura tiempo y volumen para cada actividad. Los verdes ya tienen datos, los amarillos están vacíos. Tab/Enter para avanzar rápido.</p>
      <div style="max-height:50vh;overflow:auto"><table class="sim-wizard-table">
        <thead><tr><th>#</th><th>Actividad</th><th>Responsable</th><th>Tiempo (min)</th><th>Volumen/mes</th></tr></thead>
        <tbody>`;
  tasks.forEach((t, i) => {
    const hasData = t.time && t.volume;
    html += `<tr class="${hasData ? 'has-data' : 'no-data'}">
        <td>${i + 1}</td>
        <td>${escapeHtml(t.label)}</td>
        <td>${escapeHtml(t.owner || '—')}</td>
        <td><input type="number" min="0" step="0.5" data-wid="${t.id}" data-wfield="time" value="${escapeHtml(t.time || '')}" placeholder="ej. 15" /></td>
        <td><input type="number" min="0" step="1" data-wid="${t.id}" data-wfield="volume" value="${escapeHtml(t.volume || '')}" placeholder="ej. 500" /></td>
      </tr>`;
  });
  html += '</tbody></table></div>';

  openModal(`⚡ Wizard de tiempos · ${tasks.length} actividades`, html, () => {
    document.querySelectorAll('.sim-wizard-table input').forEach(inp => {
      const n = getNode(inp.dataset.wid);
      if (n) n[inp.dataset.wfield] = inp.value;
    });
    persist();
    render();
    runSimulation();
    copilotPost('ai', `Capturé tiempos/volúmenes en ${tasks.length} actividades. Simulación actualizada automáticamente.`);
  });
}

function runSimulation() {
  if (state.nodes.length === 0) {
    $('#simResults').hidden = false;
    $('#simResults').innerHTML = '<div class="empty-state">Sin proceso. Genera o dibuja uno primero.</div>';
    return;
  }
  const cost = parseFloat($('#simCostFte').value) || 0;
  const hours = parseFloat($('#simHours').value) || 160;
  const reduction = (parseFloat($('#simReduction').value) || 0) / 100;

  // Cálculo: @processiq/analitica. Aquí solo se presenta.
  const { resultado, totalMinutes } = simularCarga(state.nodes, { costoFte: cost, horasMes: hours, reduccion: reduction });
  const { fteCurrent, fteToBe, monthlyCost, annualSavings, leadTimeChain, activitiesWithData } = resultado;

  const fmtN = (n) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 1 }) : '—';
  const fmtCur = (n) => isFinite(n) ? n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) : '—';

  state._simResults = resultado;

  $('#simResults').hidden = false;
  $('#simResults').innerHTML = `
      ${activitiesWithData === 0 ? '<div class="empty-state" style="color:#C62828">⚠ Ninguna actividad tiene tiempo y volumen. Completa esos campos en Props.</div>' : ''}
      <div class="sim-metric"><span class="label">Actividades con datos</span><span class="value">${activitiesWithData} / ${state.nodes.length}</span></div>
      <div class="sim-metric"><span class="label">Esfuerzo total / mes</span><span class="value">${fmtN(totalMinutes / 60)} h</span></div>
      <div class="sim-metric highlight"><span class="label">FTE actual</span><span class="value">${fmtN(fteCurrent)}</span></div>
      <div class="sim-metric"><span class="label">Lead time del flujo (suma)</span><span class="value">${fmtN(leadTimeChain)} min</span></div>
      <div class="sim-metric"><span class="label">Costo mensual de operación</span><span class="value">${fmtCur(monthlyCost)}</span></div>
      <div class="sim-metric"><span class="label">FTE to-be (-${Math.round(reduction*100)}%)</span><span class="value">${fmtN(fteToBe)}</span></div>
      <div class="sim-savings">
        Ahorro anual estimado
        <span class="big">${fmtCur(annualSavings)}</span>
        <span style="font-size:11px;opacity:0.9">${fmtN((fteCurrent - fteToBe))} FTE liberados</span>
      </div>`;
}

export { attachSimulatorListeners, runSimulation };
