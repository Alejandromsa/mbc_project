// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { tr } from '../i18n.js';
import { persist } from '../persistencia.js';
import { openModal } from '../ui/modal.js';
import { escapeHtml } from '../util.js';

// =================== KPI LIBRARY ===================
function attachKpiListeners() {
  $('#kpiSearch').addEventListener('input', renderKpiLibrary);
  $('#kpiFilterIndustry').addEventListener('change', renderKpiLibrary);
}

function populateKpiLibrary() { renderKpiLibrary(); }

function renderKpiLibrary() {
  const q = ($('#kpiSearch').value || '').toLowerCase();
  const ind = $('#kpiFilterIndustry').value || state.meta.industry || '';
  const list = $('#kpiList');
  list.innerHTML = '';
  const filtered = window.KPI_LIBRARY.filter(k => {
    const okInd = !ind || k.industry === ind || k.industry === 'Transversal';
    const okQ = !q || k.name.toLowerCase().includes(q) || k.description.toLowerCase().includes(q);
    return okInd && okQ;
  });
  if (filtered.length === 0) {
    list.innerHTML = '<div class="panel-hint">' + tr('kpis.sinCoincidencias') + '</div>';
    return;
  }
  filtered.forEach(k => {
    const card = document.createElement('div');
    card.className = 'kpi-card';
    card.innerHTML = `
        <div class="kpi-name">${escapeHtml(k.name)} <span style="color:#7A7A7A;font-weight:400">(${escapeHtml(k.unit)})</span></div>
        <div class="kpi-tags">
          <span class="kpi-tag">${escapeHtml(k.industry)}</span>
          <span class="kpi-tag">${escapeHtml(k.macroprocess)}</span>
        </div>
        <div class="kpi-bench">${tr('kpis.benchmark', { valor: escapeHtml(k.benchmark) })}</div>
        <div class="kpi-desc">${escapeHtml(k.description)}</div>`;
    // KPI status badge si ya fue capturado
    state._kpiValues = state._kpiValues || {};
    const captured = state._kpiValues[k.id];
    if (captured) {
      card.innerHTML += `<div style="margin-top:6px;padding:4px 8px;background:#FFF3E0;border-radius:3px;font-size:11px;color:#E65100"><strong>${tr('kpis.valorActual')}</strong> ${escapeHtml(captured.value)} · <strong>${tr('kpis.gap')}</strong> ${escapeHtml(captured.gap || '—')}</div>`;
    }
    card.addEventListener('click', () => {
      openKpiCaptureModal(k);
    });
    list.appendChild(card);
  });
}

// Modal: capturar valor actual del cliente + calcular gap
function openKpiCaptureModal(k) {
  state._kpiValues = state._kpiValues || {};
  const current = state._kpiValues[k.id] || {};
  const html = `
      <div style="margin-bottom:10px"><strong>${escapeHtml(k.name)}</strong> <span style="color:#7A7A7A">(${escapeHtml(k.unit)})</span></div>
      <div style="background:#F8F8F8;padding:10px;border-radius:4px;margin-bottom:12px;font-size:12px">
        ${escapeHtml(k.description)}
        <div style="margin-top:6px;color:#5B4FCF;font-weight:600">${tr('kpis.benchmarkSectorial', { valor: escapeHtml(k.benchmark) })}</div>
      </div>
      <label style="display:block;margin-bottom:8px;font-size:12px;font-weight:600">${tr('kpis.valorCliente')}
        <input type="text" id="kpiActualValue" value="${escapeHtml(current.value || '')}" placeholder="${tr('kpis.valorEjemplo')}" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:3px;margin-top:3px" />
      </label>
      <label style="display:block;margin-bottom:8px;font-size:12px;font-weight:600">${tr('kpis.gapBenchmark')}
        <input type="text" id="kpiGap" value="${escapeHtml(current.gap || '')}" placeholder="${tr('kpis.gapEjemplo')}" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:3px;margin-top:3px" />
      </label>
      <label style="display:block;font-size:12px;font-weight:600">${tr('kpis.fuente')}
        <input type="text" id="kpiSource" value="${escapeHtml(current.source || '')}" placeholder="${tr('kpis.fuenteEjemplo')}" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:3px;margin-top:3px" />
      </label>
      <p class="panel-hint" style="margin-top:10px">${tr('kpis.capturadosPista')}</p>`;

  openModal(tr('kpis.capturarTitulo'), html, () => {
    const v = $('#kpiActualValue').value.trim();
    let g = $('#kpiGap').value.trim();
    const src = $('#kpiSource').value.trim();
    // Auto-calcular gap si ambos son números
    if (!g && v) {
      const numActual = parseFloat(v.replace(/[^\d.\-]/g, ''));
      const numBench = parseFloat(k.benchmark.replace(/[^\d.\-]/g, ''));
      if (!isNaN(numActual) && !isNaN(numBench)) {
        const diff = numActual - numBench;
        const sign = diff >= 0 ? '+' : '';
        g = `${sign}${diff.toFixed(2)} ${k.unit}`;
      }
    }
    if (v) {
      state._kpiValues[k.id] = { name: k.name, unit: k.unit, benchmark: k.benchmark, value: v, gap: g, source: src };
    } else {
      delete state._kpiValues[k.id];
    }
    persist();
    renderKpiLibrary();
    copilotPost('ai', tr('kpis.capturado', { kpi: k.name, valor: v || '—', gap: g || '—' }));
  });
}

export { attachKpiListeners, populateKpiLibrary, renderKpiLibrary };
