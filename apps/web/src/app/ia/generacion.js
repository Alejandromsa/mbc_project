// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { promptGeneracion, timeoutGeneracion } from '@processiq/ia';
import { runSimulation } from '../analitica/simulador.js';
import { $ } from '../dom.js';
import { SHAPE_DEFAULTS, normalizeFicha, state } from '../estado.js';
import { resetState } from '../historial.js';
import { locale, tr } from '../i18n.js';
import { MAX_AI_CHARS, ingestAbort } from '../ingesta/formatos.js';
import { sourcesList } from '../ingesta/fuentes.js';
import { autoLayout } from '../layout/auto-layout.js';
import { _esHito, actualizarSelectorNivel, fijarModeloCompleto } from '../layout/niveles.js';
import { persist } from '../persistencia.js';
import { ensureDecisionBranches } from '../proceso/operaciones.js';
import { AI_SYSTEM, GEN_MAX_TOKENS, aiConfig, callClaude, parseJsonLoose, registrarCoste, usd } from './motor.js';
import { iaRemota } from './remota.js';

async function aiBuildProcess(sourceText, sourceLabel, statusFn, opts) {
  const setStatus = statusFn || (() => {});
  // Proceso de un proyecto: la genera el servidor (job con progreso, reintentos y coste)
  const remota = iaRemota();
  if (remota) {
    const vista = (opts && opts.vista) || 2;
    const r = await remota.generar({
      texto: sourceText, etiqueta: sourceLabel, roles: (opts && opts.roles) || null, vista,
      variasFuentes: sourcesList().length > 1,
      fuentes: sourcesList().map(s => ({ nombre: s.nombre, tipo: s.tipo, caracteres: s.chars })),
      modelo: aiConfig().model, onEstado: setStatus,
      senal: ingestAbort ? ingestAbort.controller.signal : null
    });
    const coste = { fecha: new Date().toISOString(), modelo: r.modelo, nivel: vista,
      chars: sourceText.length + AI_SYSTEM.length, entrada: r.tokensEntrada, salida: r.tokensSalida, usd: r.costeUsd };
    registrarCoste(coste);   // calibra las estimaciones de este navegador, como en el MVP
    state._ultimoCosteIa = coste;
    buildProcessFromAiSpec(r.spec, sourceLabel);
    remota.alGenerar(r.ejecucionId, sourceLabel, vista);
    return r.spec;
  }
  setStatus(tr('ia.interpretando'));
  const prompt = promptGeneracion(sourceText, sourceLabel, {
    roles: opts && opts.roles, vista: opts && opts.vista,
    variasFuentes: sourcesList().length > 1, maxChars: MAX_AI_CHARS
  });
  // Con un documento grande la IA tarda más en soltar el primer dato: el límite
  // de inactividad crece con el largo del prompt (techo 3 min).
  const timeoutMs = timeoutGeneracion(prompt);
  const raw = await callClaude(prompt, { system: AI_SYSTEM, effort: 'medium', maxTokens: GEN_MAX_TOKENS, timeoutMs,
    onProgress: (n) => setStatus(tr('ia.recibiendo', { n: n.toLocaleString(locale()) })),
    onUsage: (u) => {
      const coste = { fecha: new Date().toISOString(), modelo: u.modelo, nivel: (opts && opts.vista) || 2,
        chars: prompt.length + AI_SYSTEM.length, entrada: u.entrada, salida: u.salida, usd: usd(u.entrada, u.salida, u.modelo) };
      registrarCoste(coste);
      state._ultimoCosteIa = coste;
    } });
  const spec = parseJsonLoose(raw);
  buildProcessFromAiSpec(spec, sourceLabel);
  return spec;
}

function buildProcessFromAiSpec(spec, sourceLabel) {
  if (!spec || !Array.isArray(spec.nodes) || !spec.nodes.length) throw new Error(tr('ia.sinActividades'));
  resetState();
  const m = spec.meta || {};
  state.meta = { name: m.name || sourceLabel || 'Proceso (IA)', industry: m.industry || '', macroprocess: m.macroprocess || '', client: m.client || '', owner: '' };
  $('#processName').value = state.meta.name;
  if (m.industry) $('#processIndustry').value = m.industry;
  if (m.macroprocess) $('#processMacro').value = m.macroprocess;
  if (spec.ficha) state.ficha = normalizeFicha(spec.ficha);
  const idMap = {};
  spec.nodes.forEach(t => {
    const type = SHAPE_DEFAULTS[t.type] ? t.type : 'task';
    const def = SHAPE_DEFAULTS[type];
    const node = {
      id: 'n' + (state.nextId++), type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label || '(sin título)', executionType: t.exec || (type === 'task' ? 'manual' : ''),
      gatewayType: (type === 'decision' ? (t.gateway || 'exclusive') : undefined),
      activityCode: '', owner: t.owner || '', system: t.system || '',
      time: '', volume: '', va: '', sla: '', docsIn: '', docsOut: '', rules: '', notes: t.notes || '', pains: [],
      nivel: (t.nivel >= 1 && t.nivel <= 3) ? +t.nivel : undefined, _padreK: t.padre || null
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  (spec.edges || []).forEach(e => {
    const f = idMap[e.from], to = idMap[e.to];
    if (f && to) state.edges.push({ id: 'e' + (state.nextId++), from: f, to, label: e.label || '' });
  });
  // La IA referencia al padre por su id corto (a3); aquí se traduce al id real.
  // Los hitos (start/end/decision) se fuerzan a nivel 1: son los que sostienen
  // la vista ejecutiva y la IA a veces los deja en 2.
  state.nodes.forEach(n => {
    if (n._padreK && idMap[n._padreK]) n.padre = idMap[n._padreK];
    delete n._padreK;
    if (_esHito(n)) n.nivel = 1;
  });
  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  state.meta.nivelVista = 3;
  fijarModeloCompleto();
  actualizarSelectorNivel();
  persist();
}

export { aiBuildProcess, buildProcessFromAiSpec };
