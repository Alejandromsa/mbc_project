// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
// El cálculo vive en @processiq/analitica; aquí se presenta (mensajes y modales).
import {
  PALANCAS_WHATIF, backlogCsv, compararWhatIf, cuelloDeBotella, generarBacklog, mapaDeValor, oportunidadesAutomatizacion
} from '@processiq/analitica';
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { download, filename } from '../exportar/archivos.js';
import { getNode } from '../lienzo/interaccion.js';
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
  if (tasks.length === 0) { copilotPost('ai', 'No hay actividades para analizar.'); return; }

  // Carga por actividad = tiempo × volumen (minutos/mes); ruta crítica = mayor suma de tiempos
  const r = cuelloDeBotella(state.nodes, state.edges);
  if (!r) {
    copilotPost('ai', 'Captura **tiempo** y **volumen** en las actividades (pestaña Props o wizard del simulador) para detectar el cuello de botella.');
    return;
  }
  const bottleneck = r.cuello, withLoad = r.porCarga, critical = r.rutaCritica;
  state._bottleneckId = bottleneck.n.id;
  const critLabels = critical.path.map(id => getNode(id)?.label).filter(Boolean);

  render(); // re-render para mostrar el badge de cuello

  const fmt = (n) => n.toLocaleString('es-PE', { maximumFractionDigits: 0 });
  let msg = `**🔴 Análisis de cuello de botella y ruta crítica**\n\n`;
  msg += `**Cuello de botella:** "${bottleneck.n.label}" — carga de **${fmt(bottleneck.load / 60)} h/mes** (${bottleneck.time} min × ${parseFloat(bottleneck.n.volume) || 0} casos). Es la actividad que más capacidad consume; cualquier mejora aquí tiene el mayor impacto en throughput.\n\n`;
  msg += `**Top 3 por carga:**\n` + withLoad.slice(0, 3).map((x, i) => `${i + 1}. ${x.n.label} — ${fmt(x.load / 60)} h/mes`).join('\n') + '\n\n';
  msg += `**Ruta crítica** (${fmt(critical.t)} min de lead time): ${critLabels.join(' → ')}.\n\n`;
  msg += `Recomendación: ataca primero el cuello (automatizar, paralelizar o redistribuir carga) y acorta la ruta crítica eliminando esperas/handoffs.`;
  copilotPost('ai', msg);
}

// F2 — Scoring de oportunidades de automatización
function analyzeAutomation() {
  const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
  if (tasks.length === 0) { copilotPost('ai', 'No hay actividades para analizar.'); return; }

  const cands = oportunidadesAutomatizacion(state.nodes, parametrosCosto());
  if (cands.length === 0) { copilotPost('ai', 'No detecté tareas claramente automatizables. Asegúrate de tener actividades manuales con tiempo y volumen capturados.'); return; }

  const fmtCur = (n) => n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
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

  const html = `<p class="panel-hint">${cands.length} actividad(es) con potencial de automatización, ordenadas por ahorro anual estimado.</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#232323;color:#fff"><th style="padding:5px">#</th><th style="padding:5px;text-align:left">Actividad</th><th style="padding:5px">Tecnología</th><th style="padding:5px">% auto</th><th style="padding:5px">FTE</th><th style="padding:5px">Ahorro/año</th><th style="padding:5px">Esfuerzo</th></tr>
        ${rows}
      </table>
      <div style="margin-top:12px;padding:10px;background:#E8F5E9;border-radius:6px;text-align:center">
        <b>Potencial total:</b> ${totalFte.toFixed(1)} FTE liberados · <b style="color:#1E7E34">${fmtCur(totalSaving)}/año</b>
      </div>`;
  openModal('🤖 Oportunidades de automatización', html, () => {
    copilotPost('ai', `Detecté **${cands.length} oportunidades de automatización** con potencial de **${totalFte.toFixed(1)} FTE** y **${fmtCur(totalSaving)}/año**. Top candidato: "${cands[0].n.label}" (${cands[0].tech}). Úsalo para priorizar el roadmap de RPA/IDP/IA.`);
  });
}

// F4 — Análisis de variantes (desde event log)
function analyzeVariants() {
  if (!state._variants || state._variants.length === 0) {
    copilotPost('ai', 'No hay variantes para analizar. Ingresa un **event log CSV** (📥 Ingestar → Event Log) — las variantes se calculan de los casos reales.');
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
  const html = `<p class="panel-hint"><b>${state._variants.length} variantes</b> en ${total} casos. La variante #1 es el "happy path"; las demás son excepciones/reprocesos — fuente directa de pains.</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#232323;color:#fff"><th style="padding:5px">#</th><th style="padding:5px;text-align:left">Secuencia</th><th style="padding:5px">Pasos</th><th style="padding:5px">Casos</th><th style="padding:5px">%</th></tr>
        ${rows}
      </table>
      <div style="margin-top:12px;padding:10px;background:#FEF3C7;border-radius:6px">
        <b>Happy path:</b> ${happyPath.pct}% de los casos (${happyPath.count}). <b>Excepciones:</b> ${exceptions} variantes cubren el ${Math.round(exceptionCases / total * 100)}% restante — revisar para estandarizar y reducir reprocesos.
      </div>`;
  openModal('🔀 Análisis de variantes', html, () => {
    copilotPost('ai', `**${state._variants.length} variantes** detectadas. El happy path cubre ${happyPath.pct}% de los casos; el resto son excepciones (candidatas a estandarización). Mientras más variantes, mayor variabilidad e indisciplina del proceso.`);
  });
}

// F5 — Mapa de valor Lean (VA / BVA / NVA)
function toggleValueMap() {
  const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
  if (tasks.length === 0) { copilotPost('ai', 'No hay actividades para mapear.'); return; }
  state._valueMode = !state._valueMode;
  render();
  if (!state._valueMode) { copilotPost('ai', 'Mapa de valor desactivado — vuelve a colores por tipo de tarea.'); return; }

  // Reparto de tiempo por categoría de valor
  const { tVA, tBVA, tNVA, tNA, total, nvaCount, unclass } = mapaDeValor(state.nodes);
  const pct = (x) => total ? Math.round(x / total * 100) : 0;

  let msg = `**♻ Mapa de valor Lean activado** (verde=VA · amarillo=BVA · rojo=NVA · gris=sin clasificar)\n\n`;
  msg += `**Reparto de carga por valor:**\n`;
  msg += `• 🟢 Valor Añadido (VA): **${pct(tVA)}%**\n`;
  msg += `• 🟡 Necesario sin valor (BVA): **${pct(tBVA)}%**\n`;
  msg += `• 🔴 Desperdicio (NVA): **${pct(tNVA)}%** — ${nvaCount} actividad(es)\n`;
  if (unclass) msg += `• ⚪ Sin clasificar: ${pct(tNA)}% (${unclass} actividades — asigna VA/BVA/NVA en Props)\n`;
  msg += `\n**Diagnóstico Lean:** ${pct(tNVA) >= 30 ? 'Alto desperdicio — prioriza eliminar/automatizar las actividades NVA.' : (pct(tNVA) > 0 ? 'Desperdicio moderado — revisa las actividades NVA.' : 'Sin desperdicio clasificado. Asigna VA/BVA/NVA para el análisis Lean.')}\n\nVuelve a pulsar para desactivar el mapa.`;
  copilotPost('ai', msg);
}

// F6 — Backlog de iniciativas auto-generado (consolida pains + automatización + gaps KPI)
function generateBacklog() {
  const items = generarBacklog(state.nodes, state._kpiValues, parametrosCosto());

  if (items.length === 0) { copilotPost('ai', 'No hay insumos para el backlog. Captura pains, ten actividades manuales o KPIs con gap.'); return; }

  state._backlog = items;

  const fuenteColor = { 'Pain': '#B91C1C', 'Automatización': '#1E7E34', 'KPI': '#1E5BAA' };
  const rows = items.map(it => `<tr>
      <td style="text-align:center">${it.prioridad}</td>
      <td><span style="color:${fuenteColor[it.fuente]};font-weight:600">${it.fuente}</span></td>
      <td>${escapeHtml(it.iniciativa.length > 60 ? it.iniciativa.slice(0, 58) + '…' : it.iniciativa)}</td>
      <td style="text-align:center">${it.impacto}</td>
      <td style="text-align:center">${it.esfuerzo}</td>
      <td style="text-align:center"><b>${it.horizonte}</b></td>
      <td>${escapeHtml(it.owner)}</td>
      <td style="font-size:11px">${escapeHtml(String(it.beneficio))}</td>
    </tr>`).join('');
  const html = `<p class="panel-hint">${items.length} iniciativas consolidadas de pains, automatización y gaps de KPI, priorizadas por ratio impacto/esfuerzo.</p>
      <div style="max-height:50vh;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#232323;color:#fff;position:sticky;top:0"><th style="padding:5px">#</th><th style="padding:5px">Fuente</th><th style="padding:5px;text-align:left">Iniciativa</th><th style="padding:5px">Imp</th><th style="padding:5px">Esf</th><th style="padding:5px">Horizonte</th><th style="padding:5px">Owner</th><th style="padding:5px">Beneficio</th></tr>
        ${rows}
      </table></div>
      <div style="margin-top:10px;text-align:right"><button id="blExportBtn" class="btn btn-ghost btn-mini">⤓ Exportar backlog (CSV)</button></div>`;
  openModal(`📋 Backlog de iniciativas · ${items.length}`, html, () => {
    copilotPost('ai', `**Backlog de ${items.length} iniciativas** generado y priorizado. ${items.filter(i => i.horizonte === '0-3m').length} quick wins (0-3m). Fuentes: ${items.filter(i => i.fuente === 'Pain').length} pains, ${items.filter(i => i.fuente === 'Automatización').length} automatización, ${items.filter(i => i.fuente === 'KPI').length} KPI. Úsalo como roadmap de transformación.`);
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
  if (tasks.length === 0) { copilotPost('ai', 'Genera un proceso primero.'); return; }
  const withData = tasks.filter(n => parseFloat(n.time) > 0 && parseFloat(n.volume) > 0).length;
  const dataWarn = withData === 0 ? '<div class="field-hint warn" style="margin-bottom:10px">⚠ Ninguna actividad tiene tiempo y volumen. Captura datos (wizard del simulador) para que la comparación tenga cifras.</div>' : '';
  const leverChecks = Object.entries(WHATIF_LEVERS).map(([k, l]) =>
    `<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-weight:400;font-size:13px;text-transform:none">
        <input type="checkbox" class="wi-lever" value="${k}" style="width:auto"> ${l.label}</label>`).join('');
  const html = `${dataWarn}
      <p class="panel-hint">Selecciona las palancas para construir un <b>escenario To-Be</b> y compáralo contra el As-Is actual.</p>
      <div style="margin-bottom:12px">${leverChecks}</div>
      <label style="display:block;font-size:12px;font-weight:600">Reducción adicional de lead time esperada (%)
        <input type="number" id="wiReduction" value="0" min="0" max="80" step="5" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:6px;margin-top:3px">
      </label>`;
  openModal('🔬 Comparador de escenarios What-If', html, () => {
    const levers = [...document.querySelectorAll('.wi-lever:checked')].map(c => c.value);
    const extraRed = parseFloat($('#wiReduction')?.value) || 0;
    runWhatIfComparison(levers, extraRed);
  });
}

function runWhatIfComparison(levers, extraReduction) {
  const { asis, tobe, fteSaved, annual } = compararWhatIf(state.nodes, levers, extraReduction, parametrosCosto());

  const fmt = (n) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 1 }) : '—';
  const cur = (n) => isFinite(n) ? n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) : '—';
  const delta = (a, b, inv) => { const d = b - a; const good = inv ? d < 0 : d > 0; return `<span style="color:${good ? '#1E7E34' : (d === 0 ? '#888' : '#B91C1C')}">${d > 0 ? '+' : ''}${fmt(d)}</span>`; };

  const html = `<p class="panel-hint">${levers.length} palanca(s) aplicada(s). Comparación As-Is vs escenario To-Be:</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#232323;color:#fff"><th style="padding:6px;text-align:left">Métrica</th><th style="padding:6px">As-Is</th><th style="padding:6px">To-Be</th><th style="padding:6px">Δ</th></tr>
        <tr><td style="padding:6px;border:1px solid #eee">FTE</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(asis.fte)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(tobe.fteToBe)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${delta(asis.fte, tobe.fteToBe, true)}</td></tr>
        <tr><td style="padding:6px;border:1px solid #eee">Lead time (min)</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(asis.leadTime)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(tobe.leadTime)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${delta(asis.leadTime, tobe.leadTime, true)}</td></tr>
        <tr><td style="padding:6px;border:1px solid #eee">Costo mensual</td><td style="padding:6px;border:1px solid #eee;text-align:center">${cur(asis.monthlyCost)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${cur(tobe.fteToBe * (parseFloat($('#simCostFte')?.value) || 5000))}</td><td style="padding:6px;border:1px solid #eee;text-align:center">—</td></tr>
      </table>
      <div style="margin-top:12px;padding:12px;background:linear-gradient(135deg,#ff0054,#b2a5ff);color:#fff;border-radius:8px;text-align:center">
        Ahorro anual del escenario<br><span style="font-size:24px;font-weight:700">${cur(annual)}</span><br>
        <span style="font-size:11px;opacity:.9">${fmt(fteSaved)} FTE liberados · lead time −${Math.round((1 - tobe.leadTime / Math.max(asis.leadTime, 0.01)) * 100)}%</span>
      </div>`;
  openModal('🔬 Resultado What-If', html, () => {
    copilotPost('ai', `**Escenario What-If:** con ${levers.length} palanca(s), el proceso pasa de ${fmt(asis.fte)} a ${fmt(tobe.fteToBe)} FTE (ahorro ${cur(annual)}/año) y reduce lead time ~${Math.round((1 - tobe.leadTime / Math.max(asis.leadTime, 0.01)) * 100)}%. Compara varios escenarios para elegir el de mejor relación impacto/esfuerzo.`);
  });
}

export { analyzeAutomation, analyzeBottleneck, analyzeVariants, generateBacklog, openWhatIfModal, toggleValueMap };
