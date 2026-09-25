// Modo básico (sin IA): la interpretación está en @processiq/documentos.
import { construirProcesoBasico, interpretarTexto } from '@processiq/documentos';
import { copilotPost } from '../copiloto/copiloto.js';
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { autoLayout } from '../layout/auto-layout.js';
import { render } from '../lienzo/render.js';
import { maybeFitOnLoad } from '../lienzo/zoom.js';
import { activateTab } from '../paneles/cajon.js';
import { persist } from '../persistencia.js';
import { ensureDecisionBranches } from '../proceso/operaciones.js';

function buildProcessFromText(text, source) {
  const detectadas = interpretarTexto(text);
  if (detectadas.length === 0) {
    alert('No pude extraer actividades del texto. Intenta separar por puntos o bullets.');
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
    `He construido el flujograma desde la fuente **${source}**.\n\n` +
    `Detecté **${r.actividades} actividades** (+ inicio/fin).\n` +
    `Patrones aplicados: actividades con verbos en infinitivo/imperativo, gateways de decisión por condicionales ("si", "cuando", "en caso").\n\n` +
    `Revisa, ajusta etiquetas y completa responsables. Cuando termines pídeme: *"detecta pains"* o *"sugiere KPIs"*.` +
    (truncatedAt ? `\n\n⚠️ **El documento era muy largo** (${truncatedAt} actividades detectadas). Me quedé con las primeras ${r.actividades} para que el diagrama siga siendo legible.\n\n**Recomendación:** configura la **IA (⚙ en la cabecera)** — interpreta el documento completo y arma el flujo real con roles y decisiones, en vez de esta extracción por palabras clave.` : ''));
}

export { buildProcessFromText };
