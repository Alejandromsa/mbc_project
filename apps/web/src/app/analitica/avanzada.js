// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
// El cálculo vive en @processiq/analitica; aquí se presenta (mensajes y modales).
import {
  PALANCAS_WHATIF, backlogCsv, compararWhatIf, cuelloDeBotella, generarBacklog, mapaDeValor, oportunidadesAutomatizacion
} from '@processiq/analitica';
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { download, filename } from '../exportar/archivos.js';
import { locale, traducirDe, tr } from '../i18n.js';
import { getNode } from '../lienzo/interaccion.js';
import { PALANCAS_EN } from '../textos/en.js';
import { render } from '../lienzo/render.js';
import { openModal } from '../ui/modal.js';
import { escapeHtml } from '../util.js';

// ============================================================
// ANALÍTICA AVANZADA (F1-F4) — benchmark 2026
// ============================================================

// Parámetros de costo del panel Simulador (con los valores por defecto del MVP)
function parametrosCosto() {
  return { costoFte: parseFloat($('#simCostFte')?.value) || 5000, horasMes: parseFloat($('#simHours')?.value) || 160 };
}

// F3 — Cuello de botella + ruta crítica
function analyzeBottleneck() {
  const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
  if (tasks.length === 0) { copilotPost('ai', tr('analitica.sinActividades')); return; }

  // Carga por actividad = tiempo × volumen (minutos/mes); ruta crítica = mayor suma de tiempos
  const r = cuelloDeBotella(state.nodes, state.edges);
  if (!r) {
    copilotPost('ai', tr('cuello.sinDatos'));
    return;
  }
  const bottleneck = r.cuello, withLoad = r.porCarga, critical = r.rutaCritica;
  state._bottleneckId = bottleneck.n.id;
  const critLabels = critical.path.map(id => getNode(id)?.label).filter(Boolean);

  render(); // re-render para mostrar el badge de cuello

  const fmt = (n) => n.toLocaleString(locale(), { maximumFractionDigits: 0 });
  let msg = tr('cuello.titulo');
  msg += tr('cuello.cuello', { etiqueta: bottleneck.n.label, horas: fmt(bottleneck.load / 60), min: bottleneck.time, casos: parseFloat(bottleneck.n.volume) || 0 });
  msg += tr('cuello.top') + withLoad.slice(0, 3).map((x, i) => tr('cuello.topFila', { i: i + 1, etiqueta: x.n.label, horas: fmt(x.load / 60) })).join('\n') + '\n\n';
  msg += tr('cuello.ruta', { min: fmt(critical.t), ruta: critLabels.join(' → ') });
  msg += tr('cuello.recomendacion');
  copilotPost('ai', msg);
}

// F2 — Scoring de oportunidades de automatización
function analyzeAutomation() {
  const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
  if (tasks.length === 0) { copilotPost('ai', tr('analitica.sinActividades')); return; }

  const cands = oportunidadesAutomatizacion(state.nodes, parametrosCosto());
  if (cands.length === 0) { copilotPost('ai', tr('autom.nada')); return; }

  const fmtCur = (n) => n.toLocaleString(locale(), { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
  const rows = cands.map((c, i) => `<tr>
      <td>${i + 1}</td><td>${escapeHtml(c.n.label)}</td>
      <td><b>${c.tech}</b></td>
      <td style="text-align:center">${Math.round(c.autoPct * 100)}%</td>
      <td style="text-align:center">${c.fteSaved.toFixed(2)}</td>
      <td style="text-align:right;color:#1E7E34"><b>${c.annualSaving ? fmtCur(c.annualSaving) : '—'}</b></td>
      <td style="text-align:center">${c.effort}</td>
    </tr>`).join('');
  const totalSaving = cands.reduce((a, c) => a + (c.annualSaving || 0), 0);
  const totalFte = cands.reduce((a, c) => a + c.fteSaved, 0);

  const html = `<p class="panel-hint">${tr('autom.intro', { n: cands.length })}</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#232323;color:#fff"><th style="padding:5px">#</th><th style="padding:5px;text-align:left">${tr('sim.colActividad')}</th><th style="padding:5px">${tr('autom.tecnologia')}</th><th style="padding:5px">% auto</th><th style="padding:5px">FTE</th><th style="padding:5px">${tr('autom.ahorroAnio')}</th><th style="padding:5px">${tr('autom.esfuerzo')}</th></tr>
        ${rows}
      </table>
      <div style="margin-top:12px;padding:10px;background:#E8F5E9;border-radius:6px;text-align:center">
        ${tr('autom.potencial', { fte: totalFte.toFixed(1), ahorro: fmtCur(totalSaving) })}
      </div>`;
  openModal(tr('autom.titulo'), html, () => {
    copilotPost('ai', tr('autom.mensaje', { n: cands.length, fte: totalFte.toFixed(1), ahorro: fmtCur(totalSaving), etiqueta: cands[0].n.label, tecnologia: cands[0].tech }));
  });
}

// F4 — Análisis de variantes (desde event log)
function analyzeVariants() {
  if (!state._variants || state._variants.length === 0) {
    copilotPost('ai', tr('variantes.sinVariantes'));
    return;
  }
  const total = state._variantsTotalCases || state._variants.reduce((a, v) => a + v.count, 0);
  const top = state._variants.slice(0, 10);
  const happyPath = state._variants[0];
  const exceptions = state._variants.length - 1;
  const exceptionCases = total - happyPath.count;

  const rows = top.map((v, i) => `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="font-size:11px">${escapeHtml(v.seq.length > 90 ? v.seq.slice(0, 88) + '…' : v.seq)}</td>
      <td style="text-align:center">${v.steps}</td>
      <td style="text-align:center"><b>${v.count}</b></td>
      <td style="text-align:center;color:#b2a5ff"><b>${v.pct}%</b></td>
    </tr>`).join('');
  const html = `<p class="panel-hint">${tr('variantes.intro', { n: state._variants.length, total })}</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#232323;color:#fff"><th style="padding:5px">#</th><th style="padding:5px;text-align:left">${tr('variantes.secuencia')}</th><th style="padding:5px">${tr('variantes.pasos')}</th><th style="padding:5px">${tr('variantes.casos')}</th><th style="padding:5px">%</th></tr>
        ${rows}
      </table>
      <div style="margin-top:12px;padding:10px;background:#FEF3C7;border-radius:6px">
        ${tr('variantes.resumen', { pct: happyPath.pct, n: happyPath.count, excepciones: exceptions, resto: Math.round(exceptionCases / total * 100) })}
      </div>`;
  openModal(tr('variantes.titulo'), html, () => {
    copilotPost('ai', tr('variantes.mensaje', { n: state._variants.length, pct: happyPath.pct }));
  });
}

// F5 — Mapa de valor Lean (VA / BVA / NVA)
function toggleValueMap() {
  const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
  if (tasks.length === 0) { copilotPost('ai', tr('valor.sinActividades')); return; }
  state._valueMode = !state._valueMode;
  render();
  if (!state._valueMode) { copilotPost('ai', tr('valor.desactivado')); return; }

  // Reparto de tiempo por categoría de valor
  const { tVA, tBVA, tNVA, tNA, total, nvaCount, unclass } = mapaDeValor(state.nodes);
  const pct = (x) => total ? Math.round(x / total * 100) : 0;

  let msg = tr('valor.activado', { va: pct(tVA), bva: pct(tBVA), nva: pct(tNVA), n: nvaCount });
  if (unclass) msg += tr('valor.sinClasificar', { pct: pct(tNA), n: unclass });
  msg += tr('valor.diagnostico', { texto: pct(tNVA) >= 30 ? tr('valor.alto') : (pct(tNVA) > 0 ? tr('valor.moderado') : tr('valor.nada')) });
  copilotPost('ai', msg);
}

// F6 — Backlog de iniciativas auto-generado (consolida pains + automatización + gaps KPI)
function generateBacklog() {
  const items = generarBacklog(state.nodes, state._kpiValues, parametrosCosto());

  if (items.length === 0) { copilotPost('ai', tr('backlog.sinInsumos')); return; }

  state._backlog = items;

  const fuenteColor = { 'Pain': '#B91C1C', 'Automatización': '#1E7E34', 'KPI': '#1E5BAA' };
  const rows = items.map(it => `<tr>
      <td style="text-align:center">${it.prioridad}</td>
      <td><span style="color:${fuenteColor[it.fuente]};font-weight:600">${it.fuente === 'Automatización' ? tr('backlog.fuenteAutomatizacion') : it.fuente}</span></td>
      <td>${escapeHtml(it.iniciativa.length > 60 ? it.iniciativa.slice(0, 58) + '…' : it.iniciativa)}</td>
      <td style="text-align:center">${it.impacto}</td>
      <td style="text-align:center">${it.esfuerzo}</td>
      <td style="text-align:center"><b>${it.horizonte}</b></td>
      <td>${escapeHtml(it.owner)}</td>
      <td style="font-size:11px">${escapeHtml(String(it.beneficio))}</td>
    </tr>`).join('');
  const html = `<p class="panel-hint">${tr('backlog.intro', { n: items.length })}</p>
      <div style="max-height:50vh;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#232323;color:#fff;position:sticky;top:0"><th style="padding:5px">#</th><th style="padding:5px">${tr('backlog.fuente')}</th><th style="padding:5px;text-align:left">${tr('backlog.iniciativa')}</th><th style="padding:5px">Imp</th><th style="padding:5px">${tr('backlog.esf')}</th><th style="padding:5px">${tr('backlog.horizonte')}</th><th style="padding:5px">Owner</th><th style="padding:5px">${tr('backlog.beneficio')}</th></tr>
        ${rows}
      </table></div>
      <div style="margin-top:10px;text-align:right"><button id="blExportBtn" class="btn btn-ghost btn-mini">${tr('backlog.exportar')}</button></div>`;
  openModal(tr('backlog.titulo', { n: items.length }), html, () => {
    copilotPost('ai', tr('backlog.mensaje', { n: items.length, rapidos: items.filter(i => i.horizonte === '0-3m').length, pains: items.filter(i => i.fuente === 'Pain').length, autom: items.filter(i => i.fuente === 'Automatización').length, kpi: items.filter(i => i.fuente === 'KPI').length }));
  });
  // Botón de export CSV dentro del modal
  setTimeout(() => {
    const b = $('#blExportBtn');
    if (b) b.addEventListener('click', exportBacklogCsv);
  }, 50);
}

function exportBacklogCsv() {
  if (!state._backlog) return;
  download(backlogCsv(state._backlog), filename('csv').replace('.csv', '_backlog.csv'), 'text/csv;charset=utf-8');
}

// F1 — Comparador de escenarios What-If
const WHATIF_LEVERS = PALANCAS_WHATIF;

function openWhatIfModal() {
  const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
  if (tasks.length === 0) { copilotPost('ai', tr('whatif.sinProceso')); return; }
  const withData = tasks.filter(n => parseFloat(n.time) > 0 && parseFloat(n.volume) > 0).length;
  const dataWarn = withData === 0 ? '<div class="field-hint warn" style="margin-bottom:10px">' + tr('whatif.sinDatos') + '</div>' : '';
  const leverChecks = Object.entries(WHATIF_LEVERS).map(([k, l]) =>
    `<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-weight:400;font-size:13px;text-transform:none">
        <input type="checkbox" class="wi-lever" value="${k}" style="width:auto"> ${traducirDe(PALANCAS_EN, l.label, k)}</label>`).join('');
  const html = `${dataWarn}
      <p class="panel-hint">${tr('whatif.intro')}</p>
      <div style="margin-bottom:12px">${leverChecks}</div>
      <label style="display:block;font-size:12px;font-weight:600">${tr('whatif.reduccion')}
        <input type="number" id="wiReduction" value="0" min="0" max="80" step="5" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:6px;margin-top:3px">
      </label>`;
  openModal(tr('whatif.titulo'), html, () => {
    const levers = [...document.querySelectorAll('.wi-lever:checked')].map(c => c.value);
    const extraRed = parseFloat($('#wiReduction')?.value) || 0;
    runWhatIfComparison(levers, extraRed);
  });
}

function runWhatIfComparison(levers, extraReduction) {
  const { asis, tobe, fteSaved, annual } = compararWhatIf(state.nodes, levers, extraReduction, parametrosCosto());

  const fmt = (n) => isFinite(n) ? n.toLocaleString(locale(), { maximumFractionDigits: 1 }) : '—';
  const cur = (n) => isFinite(n) ? n.toLocaleString(locale(), { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) : '—';
  const delta = (a, b, inv) => { const d = b - a; const good = inv ? d < 0 : d > 0; return `<span style="color:${good ? '#1E7E34' : (d === 0 ? '#888' : '#B91C1C')}">${d > 0 ? '+' : ''}${fmt(d)}</span>`; };

  const html = `<p class="panel-hint">${tr('whatif.aplicadas', { n: levers.length })}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#232323;color:#fff"><th style="padding:6px;text-align:left">${tr('whatif.metrica')}</th><th style="padding:6px">As-Is</th><th style="padding:6px">To-Be</th><th style="padding:6px">Δ</th></tr>
        <tr><td style="padding:6px;border:1px solid #eee">FTE</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(asis.fte)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(tobe.fteToBe)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${delta(asis.fte, tobe.fteToBe, true)}</td></tr>
        <tr><td style="padding:6px;border:1px solid #eee">${tr('whatif.leadTime')}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(asis.leadTime)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(tobe.leadTime)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${delta(asis.leadTime, tobe.leadTime, true)}</td></tr>
        <tr><td style="padding:6px;border:1px solid #eee">${tr('whatif.costoMensual')}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${cur(asis.monthlyCost)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${cur(tobe.fteToBe * (parseFloat($('#simCostFte')?.value) || 5000))}</td><td style="padding:6px;border:1px solid #eee;text-align:center">—</td></tr>
      </table>
      <div style="margin-top:12px;padding:12px;background:linear-gradient(135deg,#ff0054,#b2a5ff);color:#fff;border-radius:8px;text-align:center">
        ${tr('whatif.ahorro')}<br><span style="font-size:24px;font-weight:700">${cur(annual)}</span><br>
        <span style="font-size:11px;opacity:.9">${tr('whatif.liberados', { fte: fmt(fteSaved), pct: Math.round((1 - tobe.leadTime / Math.max(asis.leadTime, 0.01)) * 100) })}</span>
      </div>`;
  openModal(tr('whatif.resultado'), html, () => {
    copilotPost('ai', tr('whatif.mensaje', { n: levers.length, de: fmt(asis.fte), a: fmt(tobe.fteToBe), ahorro: cur(annual), pct: Math.round((1 - tobe.leadTime / Math.max(asis.leadTime, 0.01)) * 100) }));
  });
}

export { analyzeAutomation, analyzeBottleneck, analyzeVariants, generateBacklog, openWhatIfModal, toggleValueMap };
