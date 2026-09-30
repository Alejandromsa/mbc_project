// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { simularCarga } from '@processiq/analitica';
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { locale, tr } from '../i18n.js';
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
  if (tasks.length === 0) { alert(tr('sim.sinActividades')); return; }

  let html = `<p style="font-size:13px;margin:0 0 8px 0">${tr('sim.wizardIntro')}</p>
      <div style="max-height:50vh;overflow:auto"><table class="sim-wizard-table">
        <thead><tr><th>#</th><th>${tr('sim.colActividad')}</th><th>${tr('sim.colResponsable')}</th><th>${tr('sim.colTiempo')}</th><th>${tr('sim.colVolumen')}</th></tr></thead>
        <tbody>`;
  tasks.forEach((t, i) => {
    const hasData = t.time && t.volume;
    html += `<tr class="${hasData ? 'has-data' : 'no-data'}">
        <td>${i + 1}</td>
        <td>${escapeHtml(t.label)}</td>
        <td>${escapeHtml(t.owner || '—')}</td>
        <td><input type="number" min="0" step="0.5" data-wid="${t.id}" data-wfield="time" value="${escapeHtml(t.time || '')}" placeholder="${tr('sim.ejemplo', { n: 15 })}" /></td>
        <td><input type="number" min="0" step="1" data-wid="${t.id}" data-wfield="volume" value="${escapeHtml(t.volume || '')}" placeholder="${tr('sim.ejemplo', { n: 500 })}" /></td>
      </tr>`;
  });
  html += '</tbody></table></div>';

  openModal(tr('sim.wizardTitulo', { n: tasks.length }), html, () => {
    document.querySelectorAll('.sim-wizard-table input').forEach(inp => {
      const n = getNode(inp.dataset.wid);
      if (n) n[inp.dataset.wfield] = inp.value;
    });
    persist();
    render();
    runSimulation();
    copilotPost('ai', tr('sim.capturados', { n: tasks.length }));
  });
}

function runSimulation() {
  if (state.nodes.length === 0) {
    $('#simResults').hidden = false;
    $('#simResults').innerHTML = '<div class="empty-state">' + tr('sim.sinProceso') + '</div>';
    return;
  }
  const cost = parseFloat($('#simCostFte').value) || 0;
  const hours = parseFloat($('#simHours').value) || 160;
  const reduction = (parseFloat($('#simReduction').value) || 0) / 100;

  // Cálculo: @processiq/analitica. Aquí solo se presenta.
  const { resultado, totalMinutes } = simularCarga(state.nodes, { costoFte: cost, horasMes: hours, reduccion: reduction });
  const { fteCurrent, fteToBe, monthlyCost, annualSavings, leadTimeChain, activitiesWithData } = resultado;

  const fmtN = (n) => isFinite(n) ? n.toLocaleString(locale(), { maximumFractionDigits: 1 }) : '—';
  const fmtCur = (n) => isFinite(n) ? n.toLocaleString(locale(), { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) : '—';

  state._simResults = resultado;

  $('#simResults').hidden = false;
  $('#simResults').innerHTML = `
      ${activitiesWithData === 0 ? '<div class="empty-state" style="color:#C62828">' + tr('sim.sinDatos') + '</div>' : ''}
      <div class="sim-metric"><span class="label">${tr('sim.conDatos')}</span><span class="value">${activitiesWithData} / ${state.nodes.length}</span></div>
      <div class="sim-metric"><span class="label">${tr('sim.esfuerzo')}</span><span class="value">${fmtN(totalMinutes / 60)} h</span></div>
      <div class="sim-metric highlight"><span class="label">${tr('sim.fteActual')}</span><span class="value">${fmtN(fteCurrent)}</span></div>
      <div class="sim-metric"><span class="label">${tr('sim.leadTime')}</span><span class="value">${fmtN(leadTimeChain)} min</span></div>
      <div class="sim-metric"><span class="label">${tr('sim.costoMensual')}</span><span class="value">${fmtCur(monthlyCost)}</span></div>
      <div class="sim-metric"><span class="label">${tr('sim.fteToBe', { pct: Math.round(reduction*100) })}</span><span class="value">${fmtN(fteToBe)}</span></div>
      <div class="sim-savings">
        ${tr('sim.ahorro')}
        <span class="big">${fmtCur(annualSavings)}</span>
        <span style="font-size:11px;opacity:0.9">${tr('sim.liberados', { n: fmtN((fteCurrent - fteToBe)) })}</span>
      </div>`;
}

export { attachSimulatorListeners, runSimulation };
