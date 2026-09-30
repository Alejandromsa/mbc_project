// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { PROMPT_PAINS, interpretarPains, resumenProcesoParaIa } from '@processiq/ia';
import { copilotPost } from '../copiloto/copiloto.js';
import { state } from '../estado.js';
import { traducirError, tr } from '../i18n.js';
import { getNode } from '../lienzo/interaccion.js';
import { render } from '../lienzo/render.js';
import { activateTab } from '../paneles/cajon.js';
import { persist } from '../persistencia.js';
import { escapeHtml } from '../util.js';
import { runLinter } from '../validacion/lint.js';
import { openAiSettings } from './ajustes.js';
import { aiReady, callClaude, parseJsonLoose } from './motor.js';
import { iaRemota } from './remota.js';

// ============================================================
// ANALISIS DE PAINS CON IA
// Dos salidas separadas a proposito:
//  (a) dolores EVIDENCIADOS en el flujo -> se anclan a su actividad
//  (b) dolores TIPICOS del sector -> hipotesis a validar, nunca se mezclan
// ============================================================
const PAINS_SYSTEM = PROMPT_PAINS;

function processDigestForAi() {
  return resumenProcesoParaIa({ meta: state.meta, nodes: state.nodes, edges: state.edges, lanes: state._lanes });
}

async function aiAnalyzePains() {
  if (state.nodes.length === 0) { alert(tr('ia.sinProceso')); return; }
  if (!aiReady()) {
    if (iaRemota()) { iaRemota().avisarNoDisponible(); return; }
    if (confirm(tr('painsIa.sinIa'))) openAiSettings();
    return;
  }
  copilotPost('ai', tr('painsIa.analizando'));
  let data;
  try {
    // Proceso de un proyecto: el análisis lo hace el servidor con el proceso actual
    const remota = iaRemota();
    if (remota) {
      data = (await remota.analizar('pains')).datos;
    } else {
      const raw = await callClaude(processDigestForAi(), { system: PAINS_SYSTEM, effort: 'high', maxTokens: 8000 });
      data = parseJsonLoose(raw);
    }
  } catch (e) {
    copilotPost('ai', tr('ia.analisisFallido', { error: traducirError(e.message) }));
    return;
  }
  const r = interpretarPains(data, state.nodes, state.nextId);
  r.agregados.forEach(({ nodoId, pain }) => {
    const n = getNode(nodoId);
    n.pains = n.pains || [];
    n.pains.push(pain);
  });
  const nuevos = r.agregados.length;
  state.nextId = r.siguienteId;
  state._sectorPains = r.sectoriales;
  persist(); render(); runLinter();

  const top = [];
  state.nodes.forEach(n => (n.pains || []).forEach(x => top.push({ n: n, x: x })));
  top.sort((a, b) => (b.x.severity * b.x.frequency) - (a.x.severity * a.x.frequency));
  const NL = String.fromCharCode(10);
  // El marco del mensaje se traduce; lo que escribió la IA (dolores, evidencias, hipótesis) no
  let msg = tr('painsIa.detectados', { n: nuevos }) + NL + NL;
  top.slice(0, 8).forEach(t => {
    msg += '- **' + escapeHtml(t.n.label) + '** - ' + escapeHtml(t.x.description) +
           tr('painsIa.puntaje', { sev: t.x.severity, frec: t.x.frequency, total: t.x.severity * t.x.frequency }) + NL +
           (t.x.evidence ? tr('painsIa.evidencia', { texto: escapeHtml(t.x.evidence) }) + NL : '') +
           (t.x.impact ? tr('painsIa.impacto', { texto: escapeHtml(t.x.impact) }) + NL : '');
  });
  if (state._sectorPains.length) {
    msg += NL + '---' + NL + NL + tr('painsIa.hipotesis') + NL + NL;
    state._sectorPains.forEach((h, i) => {
      msg += (i + 1) + '. **' + escapeHtml(h.titulo || '') + '** - ' + escapeHtml(h.descripcion || '') + NL +
             (h.donde ? tr('painsIa.donde', { texto: escapeHtml(h.donde) }) + NL : '') +
             (h.senal ? tr('painsIa.senal', { texto: escapeHtml(h.senal) }) + NL : '');
    });
    msg += NL + tr('painsIa.noAgregadas');
  }
  copilotPost('ai', msg);
  activateTab('pains');
}

export { aiAnalyzePains, processDigestForAi };
