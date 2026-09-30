// Modo básico (sin IA): la interpretación está en @processiq/documentos.
import { construirProcesoBasico, interpretarTexto } from '@processiq/documentos';
import { copilotPost } from '../copiloto/copiloto.js';
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { traducirDe, tr } from '../i18n.js';
import { autoLayout } from '../layout/auto-layout.js';
import { render } from '../lienzo/render.js';
import { maybeFitOnLoad } from '../lienzo/zoom.js';
import { activateTab } from '../paneles/cajon.js';
import { persist } from '../persistencia.js';
import { ensureDecisionBranches } from '../proceso/operaciones.js';
import { ETIQUETAS_FUENTE_EN } from '../textos/en.js';

function buildProcessFromText(text, source) {
  const detectadas = interpretarTexto(text);
  if (detectadas.length === 0) {
    alert(tr('basico.sinActividades'));
    return;
  }
  // Sin IA, un documento largo generaría cientos de nodos: se recorta a 60 y se avisa.
  const r = construirProcesoBasico(detectadas, { siguienteId: state.nextId, formas: SHAPE_DEFAULTS });
  const truncatedAt = r.recortadoDe;
  state.nodes = r.nodos;
  state.edges = r.aristas;
  state.selectedNodeId = null;
  state.nextId = r.siguienteId;

  ensureDecisionBranches();
  persist();
  autoLayout();  // top-to-bottom MBB
  render();
  maybeFitOnLoad();   // encuadra el proceso generado desde notas/audio si desborda
  activateTab('copilot');
  copilotPost('ai',
    tr('basico.construido', { fuente: traducirDe(ETIQUETAS_FUENTE_EN, source), n: r.actividades }) +
    (truncatedAt ? tr('basico.recortado', { total: truncatedAt, n: r.actividades }) : ''));
}

export { buildProcessFromText };
