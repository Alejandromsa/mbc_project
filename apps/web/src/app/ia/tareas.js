// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { ROL_ANALISTA, TAREAS_IA, promptTarea } from '@processiq/ia';
import { copilotPost } from '../copiloto/copiloto.js';
import { state } from '../estado.js';
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
  if (state.nodes.length === 0) { alert('No hay proceso que analizar.'); return true; }
  copilotPost('ai', '_' + t.etiqueta + ': analizando el proceso con IA…_');
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
    copilotPost('ai', '**No se pudo completar el analisis:** ' + e.message +
      String.fromCharCode(10) + String.fromCharCode(10) + '_Puedes reintentar o usar el modo basico._');
  }
  return true;
}

export { AI_TASKS, runAiTask };
