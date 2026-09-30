// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1. RACI y SIPOC
// piden además la matriz editable (divergencia D11).
import { ROL_ANALISTA, TAREAS_IA, actividadesRaci, matrizDeTarea, pedirMatrizIa, promptTarea } from '@processiq/ia';
import { cargarRaciIa } from '../analitica/raci.js';
import { cargarSipocIa } from '../analitica/sipoc.js';
import { copilotPost } from '../copiloto/copiloto.js';
import { state } from '../estado.js';
import { etiquetaTarea, traducirError, tr } from '../i18n.js';
import { callClaude } from './motor.js';
import { processDigestForAi } from './pains.js';
import { iaRemota } from './remota.js';

// ============================================================
// COPILOTO REAL — enruta las acciones analiticas al API de Anthropic
// Antes eran plantillas/reglas fijas. Ahora, si hay API key configurada,
// cada accion analiza ESTE proceso con Claude; sin key cae al heuristico.
// ============================================================
const AI_ROLE = ROL_ANALISTA;

const AI_TASKS = TAREAS_IA;

async function runAiTask(kind) {
  const t = AI_TASKS[kind];
  if (!t) return false;
  if (state.nodes.length === 0) { alert(tr('ia.sinProceso')); return true; }
  // D11: RACI y SIPOC llegan como matriz editable; el informe en texto queda de respaldo
  const matriz = matrizDeTarea(kind);
  if (matriz && (matriz !== 'matriz-raci' || actividadesRaci(state.nodes).length)) return matrizIa(kind, t, matriz);
  return informeIa(kind, t);
}

// Informe en Markdown en el chat (lo que hace el MVP con todas las tareas)
async function informeIa(kind, t) {
  copilotPost('ai', tr('tareas.analizando', { tarea: etiquetaTarea(kind, t) }));
  try {
    // Proceso de un proyecto: el análisis lo hace el servidor con el proceso actual
    const remota = iaRemota();
    const md = remota
      ? (await remota.analizar(kind)).markdown
      : await callClaude(
        promptTarea(t.prompt, processDigestForAi()),
        { system: AI_ROLE, effort: 'high', maxTokens: 8000 });
    copilotPost('ai', md);
  } catch (e) {
    copilotPost('ai', tr('ia.analisisFallido', { error: traducirError(e.message) }) +
      String.fromCharCode(10) + String.fromCharCode(10) + tr('tareas.reintentar'));
  }
  return true;
}

// La matriz (state._raci o state._sipoc) validada, con una reparación: en el
// servidor si el proceso es de un proyecto, desde el navegador si no. Si no se
// consigue, se avisa y se pide el informe en texto, como antes.
async function matrizIa(kind, t, tipo) {
  copilotPost('ai', tr('matriz.armando', { tarea: etiquetaTarea(kind, t) }));
  let matriz;
  try {
    const remota = iaRemota();
    matriz = remota
      ? (await remota.analizar(tipo)).matriz
      : await pedirMatrizIa(tipo, { resumen: processDigestForAi(), actividades: actividadesRaci(state.nodes) }, callClaude);
    if (!matriz || typeof matriz !== 'object') throw new Error(tr('matriz.sinResultado'));
  } catch (e) {
    copilotPost('ai', tr('matriz.alInforme', { error: traducirError(e.message) }));
    return informeIa(kind, t);
  }
  if (tipo === 'matriz-raci') cargarRaciIa(matriz);
  else cargarSipocIa(matriz);
  return true;
}

export { AI_TASKS, runAiTask };
