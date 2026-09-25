// @ts-nocheck — portado tal cual del MVP 3.8.9 (deriveFicha, exportWord).
// Pendiente: tiparlo. Las pruebas de fidelidad comparan el informe y la ficha de los 14 ejemplos.
import {
  EXECUTION_TYPES, KPI_LIBRARY, PAIN_CATEGORIES, contarTraspasos, fichaVacia, ordenDeFlujo, validarProceso
} from '@processiq/dominio';
import { painImplication } from './pptx.js';

// ============================================================
// DERIVACIÓN DE FICHA DE PROCESO
// Reconstruye, a partir del grafo (nodos + edges + compuertas + lanes),
// el "Detalle de actividades" con numeración y ruteo real, la unión de
// sistemas, responsables y sugerencias de alcance (desde/hasta).
// Es el motor que alimenta exportFicha() y la vista previa.
// ============================================================
/** Ficha derivada del grafo: actividades numeradas con su ruteo real, sistemas, responsables y alcance. */
export function derivarFicha(state) {
  const f = state.ficha || fichaVacia();
  const ordered = ordenDeFlujo(state.nodes, state.edges);
  const lane = state._lanes?.laneOf || {};
  const bpmnName = (n) => {
    const e = EXECUTION_TYPES.find(t => t.id === n.executionType);
    return e ? e.bpmn : (n.type === 'system' ? 'User Task' : (n.type === 'decision' ? 'Exclusive Gateway' : 'Task'));
  };

  // Numeración: solo actividades ejecutables (task/system/decision) reciben N°
  const isStep = (n) => n.type === 'task' || n.type === 'system' || n.type === 'decision';
  const stepNum = {};
  let k = 0;
  ordered.forEach(n => { if (isStep(n)) stepNum[n.id] = ++k; });

  const targetLabel = (toId) => {
    const t = state.nodes.find(x => x.id === toId);
    if (!t) return '';
    if (t.type === 'end') return t.label ? `Fin del proceso (${t.label})` : 'Fin del proceso';
    if (stepNum[t.id]) return `continuar en la actividad ${stepNum[t.id]}`;
    return `continuar (${t.label || t.type})`;
  };

  const activities = ordered.filter(isStep).map(n => {
    const outs = state.edges.filter(e => e.from === n.id);
    // Ruteo: para compuertas o cuando hay bifurcación / salto no lineal
    let ruteo = [];
    const next = ordered[ordered.indexOf(n) + 1];
    const isLinear = outs.length === 1 && next && outs[0].to === next.id && next.type !== 'end';
    if (n.type === 'decision' || outs.length > 1) {
      ruteo = outs.map(e => `${e.label ? e.label + ': ' : ''}${targetLabel(e.to)}`);
    } else if (outs.length === 1 && !isLinear) {
      ruteo = [targetLabel(outs[0].to)];
    }
    return {
      num: stepNum[n.id],
      label: n.label || '(sin título)',
      responsable: lane[n.id] || n.owner || '',
      bpmn: bpmnName(n),
      sistema: n.system || '',
      descripcion: (n.notes || n.rules || '').trim(),
      ruteo,
      va: n.va || '',
      time: n.time || ''
    };
  });

  // Sistemas: unión de los declarados por nodo + los de nivel proceso (ficha.sistemas)
  const nodeSys = new Set();
  state.nodes.forEach(n => { if (n.system) String(n.system).split(/[,/;]+/).forEach(s => { const t = s.trim(); if (t) nodeSys.add(t); }); });
  const manualSys = (f.sistemas || []);
  const manualNames = new Set(manualSys.map(s => (s.nombre || '').trim().toLowerCase()));
  const sistemas = [
    ...manualSys.filter(s => (s.nombre || '').trim()),
    ...[...nodeSys].filter(s => !manualNames.has(s.toLowerCase())).map(s => ({ nombre: s, uso: '' }))
  ];

  // Responsables (para sección "Responsabilidades")
  const responsables = (state._lanes?.list || [...new Set(state.nodes.map(n => n.owner).filter(Boolean))]);

  // Alcance: sugerencias desde/hasta si el usuario no las escribió
  const startN = state.nodes.find(n => n.type === 'start');
  const endNs = state.nodes.filter(n => n.type === 'end');
  const alcanceDesde = f.alcanceDesde || (startN ? startN.label : '');
  const alcanceHasta = f.alcanceHasta || (endNs.length ? endNs.map(e => e.label).filter(Boolean).join(' / ') : '');

  return { f, activities, sistemas, responsables, alcanceDesde, alcanceHasta, stepCount: k };
}

/** Informe consultivo del proceso en HTML compatible con Word (.doc). */
export function construirInformeWord(state) {
  const meta = state.meta;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const MAGENTA = '#147AFF', DARK = '#003478', GRAY = '#7A93B5';   // paleta MBC (catalogo): acento, azul marino, secundario
  const fechaLarga = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });

  const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
  const decisions = state.nodes.filter(n => n.type === 'decision');
  const ownerMap = state._lanes?.laneOf || {};
  const bpmnName = (n) => {
    const e = EXECUTION_TYPES.find(t => t.id === n.executionType);
    return e ? e.bpmn : (n.type === 'system' ? 'User Task' : 'Task');
  };

  // ── Tabla de actividades ──
  const actRows = tasks.map((n, i) => {
    const va = n.va === 'NVA' ? '<span style="color:#B91C1C">NVA</span>' : (n.va === 'VA' ? '<span style="color:#1E7E34">VA</span>' : (n.va || '—'));
    return `<tr>
        <td style="font-family:Consolas;font-size:9pt;color:${MAGENTA}"><b>${esc(n.activityCode || '—')}</b></td>
        <td>${esc(n.label)}</td>
        <td style="font-size:9pt">${esc(bpmnName(n))}</td>
        <td>${esc(ownerMap[n.id] || n.owner || '—')}</td>
        <td>${esc(n.system || '—')}</td>
        <td style="text-align:center">${esc(n.time || '—')}</td>
        <td style="text-align:center">${va}</td>
      </tr>`;
  }).join('');

  // ── Pain points priorizados ──
  const allPains = [];
  state.nodes.forEach(n => (n.pains || []).forEach(p => allPains.push({ ...p, activity: n.label })));
  allPains.sort((a, b) => (b.severity * b.frequency) - (a.severity * a.frequency));
  const painRows = allPains.map(p => {
    const cat = PAIN_CATEGORIES.find(c => c.id === p.category);
    return `<tr>
        <td>${esc(p.activity)}</td>
        <td>${esc(cat ? cat.label : p.category)}</td>
        <td>${esc(p.description)}</td>
        <td style="text-align:center">${p.severity}</td>
        <td style="text-align:center">${p.frequency}</td>
        <td style="text-align:center"><b>${p.severity * p.frequency}</b></td>
        <td style="font-size:9pt">${esc(typeof painImplication === 'function' ? painImplication(p) : '')}</td>
      </tr>`;
  }).join('');

  // ── KPIs sugeridos ──
  const kpis = KPI_LIBRARY
    .filter(k => !meta.industry || k.industry === meta.industry || k.industry === 'Transversal')
    .slice(0, 10);
  const kpiRows = kpis.map(k => `<tr>
      <td>${esc(k.name)}</td><td style="text-align:center">${esc(k.unit)}</td>
      <td>${esc(k.benchmark)}</td><td style="font-size:9pt">${esc(k.description)}</td>
    </tr>`).join('');

  // ── RACI (si existe) ──
  let raciSection = '';
  if (state._raci && Object.keys(state._raci).length > 0) {
    const roles = [...new Set(Object.values(state._raci).flatMap(r => Object.keys(r)))];
    const rtasks = state.nodes.filter(n => state._raci[n.id]);
    const head = '<th>Actividad</th>' + roles.map(r => `<th style="text-align:center">${esc(r)}</th>`).join('');
    const body = rtasks.map(t => '<tr><td>' + esc(t.label) + '</td>' +
      roles.map(r => `<td style="text-align:center"><b>${esc(state._raci[t.id][r] || '')}</b></td>`).join('') + '</tr>').join('');
    raciSection = `<h2>6. Matriz RACI</h2><table><tr>${head}</tr>${body}</table>
        <p style="font-size:9pt;color:${GRAY}">R = Responsable · A = Accountable · C = Consultado · I = Informado</p>`;
  }

  // ── SIPOC (si existe) ──
  let sipocSection = '';
  if (state._sipoc) {
    const s = state._sipoc;
    sipocSection = `<h2>7. SIPOC</h2><table>
        <tr><th>Supplier</th><th>Input</th><th>Process</th><th>Output</th><th>Customer</th></tr>
        <tr><td>${esc(s.suppliers)}</td><td>${esc(s.inputs)}</td><td>${esc(s.process)}</td><td>${esc(s.outputs)}</td><td>${esc(s.customers)}</td></tr>
      </table>`;
  }

  // ── Simulador (si existe) ──
  let simSection = '';
  if (state._simResults && state._simResults.activitiesWithData > 0) {
    const r = state._simResults;
    const fmt = (n) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 1 }) : '—';
    const cur = (n) => isFinite(n) ? n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) : '—';
    simSection = `<h2>8. Cuantificación (simulador)</h2>
        <table>
          <tr><td><b>FTE actual</b></td><td>${fmt(r.fteCurrent)}</td><td><b>FTE to-be</b></td><td>${fmt(r.fteToBe)}</td></tr>
          <tr><td><b>Costo mensual</b></td><td>${cur(r.monthlyCost)}</td><td><b>Ahorro anual estimado</b></td><td style="color:${MAGENTA}"><b>${cur(r.annualSavings)}</b></td></tr>
        </table>`;
  }

  // ── Linter / hallazgos de calidad ──
  const issues = validarProceso(state.nodes, state.edges);
  const handoffs = contarTraspasos(state.nodes, state.edges);
  const manualCount = tasks.filter(n => n.executionType === 'manual').length;

  // ── Resumen ejecutivo ──
  const resumen = `El proceso <b>${esc(meta.name || 'analizado')}</b> comprende <b>${tasks.length} actividades</b> y <b>${decisions.length} punto(s) de decisión</b>, distribuidas en <b>${(state._lanes?.list || []).length} responsable(s)</b>. ` +
    `Se identificaron <b>${allPains.length} pain point(s)</b>${allPains.filter(p => p.severity >= 4).length ? ` (${allPains.filter(p => p.severity >= 4).length} críticos)` : ''} y <b>${handoffs} handoff(s)</b> inter-rol. ` +
    `<b>${manualCount}</b> actividad(es) son manuales — candidatas a automatización.`;

  const guiaImpl = `<h2>10. Guía de implementación sugerida</h2>
      <p><b>Fase 0-3 meses (Quick wins):</b> estandarizar criterios de decisión, eliminar controles duplicados, automatizar tareas manuales rule-based con RPA.</p>
      <p><b>Fase 3-9 meses (Táctico):</b> eliminar handoffs mediante célula multifuncional o workflow orquestado; codificar reglas de decisión (DMN).</p>
      <p><b>Fase 9-18 meses (Estratégico):</b> self-service digital en captura, KPIs en tiempo real, rediseño organizacional.</p>`;

  // ── Documento HTML compatible con Word ──
  const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(meta.name || 'Proceso')}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: 'ForFuture Sans', Calibri, Arial, sans-serif; font-size: 11pt; color: ${DARK}; line-height: 1.4; }
  h1 { font-size: 24pt; color: ${DARK}; margin: 0 0 4pt 0; }
  h2 { font-size: 14pt; color: ${MAGENTA}; border-bottom: 2px solid ${MAGENTA}; padding-bottom: 3pt; margin-top: 22pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 10pt; }
  th { background: ${DARK}; color: #fff; padding: 5pt 7pt; text-align: left; font-size: 9pt; }
  td { border: 1px solid #ccc; padding: 4pt 7pt; vertical-align: top; }
  tr:nth-child(even) td { background: #f7f7f7; }
  .cover { border-left: 6px solid ${MAGENTA}; padding-left: 16pt; margin-bottom: 30pt; }
  .muted { color: ${GRAY}; font-size: 10pt; }
  .tag { display:inline-block; background:${MAGENTA}; color:#fff; padding:1pt 6pt; font-size:9pt; border-radius:3pt; }
</style></head>
<body>
  <div class="cover">
    <p class="tag">MBC BUSINESS CONSULTING · PERÚ</p>
    <h1>${esc(meta.name || 'Diagnóstico de Proceso')}</h1>
    <p class="muted">Industria: <b>${esc(meta.industry || '—')}</b> &nbsp;·&nbsp; Macroproceso: <b>${esc(meta.macroprocess || '—')}</b> &nbsp;·&nbsp; ${esc(fechaLarga)}</p>
    <p class="muted">Informe generado por <b>ProcessIQ</b> · Documento confidencial — uso interno</p>
  </div>

  <h2>1. Resumen ejecutivo</h2>
  <p>${resumen}</p>

  <h2>2. Ficha del proceso</h2>
  <table>
    <tr><td style="width:30%"><b>Proceso</b></td><td>${esc(meta.name || '—')}</td></tr>
    <tr><td><b>Industria</b></td><td>${esc(meta.industry || '—')}</td></tr>
    <tr><td><b>Macroproceso</b></td><td>${esc(meta.macroprocess || '—')}</td></tr>
    <tr><td><b>Actividades</b></td><td>${tasks.length} (${manualCount} manuales)</td></tr>
    <tr><td><b>Decisiones</b></td><td>${decisions.length}</td></tr>
    <tr><td><b>Responsables (swimlanes)</b></td><td>${esc((state._lanes?.list || []).join(', ') || '—')}</td></tr>
    <tr><td><b>Handoffs inter-rol</b></td><td>${handoffs}</td></tr>
    <tr><td><b>Score de calidad MBB</b></td><td>${Math.max(0, 100 - issues.reduce((a, i) => a + ({critical:15,high:8,medium:3,low:1}[i.sev] || 0), 0))} / 100</td></tr>
  </table>

  <h2>3. Actividades del proceso (BPMN)</h2>
  <table>
    <tr><th>Código</th><th>Actividad</th><th>Tipo BPMN</th><th>Responsable</th><th>Sistema</th><th>Min</th><th>VA</th></tr>
    ${actRows}
  </table>

  <h2>4. Pain points identificados</h2>
  ${allPains.length ? `<table>
    <tr><th>Actividad</th><th>Categoría</th><th>Descripción</th><th>Sev</th><th>Frec</th><th>Score</th><th>Implicancia</th></tr>
    ${painRows}
  </table>` : '<p class="muted">No se capturaron pain points en este levantamiento.</p>'}

  <h2>5. KPIs sugeridos (benchmark de industria)</h2>
  <table>
    <tr><th>KPI</th><th>Unidad</th><th>Benchmark</th><th>Descripción</th></tr>
    ${kpiRows}
  </table>

  ${raciSection}
  ${sipocSection}
  ${simSection}

  <h2>9. Diagnóstico y recomendaciones</h2>
  <p><b>Hallazgos clave:</b></p>
  <ul>
    <li>${tasks.length} actividades, ${handoffs} handoffs inter-rol, ${manualCount} actividades manuales.</li>
    <li>${allPains.length} pain points capturados${allPains.filter(p => p.severity >= 4).length ? `, ${allPains.filter(p => p.severity >= 4).length} críticos` : ''}.</li>
    <li>${issues.filter(i => i.sev === 'critical' || i.sev === 'high').length} issue(s) de calidad de modelado a resolver (ver linter).</li>
  </ul>
  <p><b>Recomendaciones priorizadas:</b></p>
  <ul>
    <li><b>Quick wins (0-3m):</b> automatizar las ${manualCount} actividades manuales rule-based; eliminar controles duplicados.</li>
    <li><b>Mediano plazo (3-9m):</b> eliminar handoffs con workflow orquestado; codificar decisiones como reglas (DMN).</li>
    <li><b>Estructural (9-18m):</b> self-service digital, dashboard de KPIs en tiempo real.</li>
  </ul>

  ${guiaImpl}

  <p class="muted" style="margin-top:30pt;border-top:1px solid #ccc;padding-top:8pt">Generado con ProcessIQ · MBC Business Consulting · ${esc(fechaLarga)}</p>
</body></html>`;

  return html;
}

