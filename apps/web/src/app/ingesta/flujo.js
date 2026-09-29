// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { extraerTexto } from '@processiq/documentos';
import { detalleImportBpmn, importBpmnXml } from '../bpmn/importar.js';
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { updateAiUi } from '../ia/ajustes.js';
import { askProfundidad, pedirCodigoEquipo } from '../ia/dialogos.js';
import { aiBuildProcess } from '../ia/generacion.js';
import { PROXY_POR_DEFECTO, aiConfig, aiReady, fmtUsd, lineaCosteIa, saveAiConfig } from '../ia/motor.js';
import { aplicarNivel } from '../layout/niveles.js';
import { maybeFitOnLoad } from '../lienzo/zoom.js';
import { activateTab } from '../paneles/cajon.js';
import { renderFichaTab } from '../paneles/ficha.js';
import { escapeHtml } from '../util.js';
import { CDN, MAX_AI_CHARS, endIngestJob, ingestAbort, ingestBusy, ingestProgress, lazyLoadScript, readFileAs, startIngestJob, throwIfCancelled, uiTick } from './formatos.js';
import { addSource, combinedSourceText, describeCurrentProcessAsText, sourcesList } from './fuentes.js';
import { closeIngestModal, openIngestModal } from './modal.js';
import { askParticipantRoles, detectParticipants } from './participantes.js';
import { buildProcessFromText } from './texto.js';

// v3.8.4: una descripcion escrita en el copiloto se interpreta con Claude por
// la misma ingesta que un documento (codigo del equipo, nivel, progreso).
// Antes elegia una PLANTILLA de ejemplo por palabras clave y parecia IA sin
// serlo. setTimeout: openModal cierra su ventana DESPUES del callback y la
// ingesta reutiliza esa misma ventana para pedir el codigo o el nivel.
function ingestarDescripcion(desc) {
  const notas = $('#notesInput');
  if (notas) notas.value = desc;
  openIngestModal();
  const mas = document.querySelector('#ingestModal .ingest-more');
  if (mas) mas.open = true;
  setTimeout(() => runIngest(null), 0);
}

// ============================================================
// FLUJO ÚNICO DE INGESTA — "suelta el archivo y listo"
// Extrae -> interpreta (IA si hay key, si no heurístico) -> dibuja.
// Todo con progreso visible y botón Cancelar, cediendo el hilo para
// que la UI nunca parezca congelada.
// ============================================================
async function runIngest(source) {
  if (ingestAbort) return;                       // ya hay un trabajo corriendo
  state._ultimoCosteIa = null;
  startIngestJob();
  const t0 = Date.now();
  try {
    let text = '', label = 'documento';

    if (source && source.file) {
      ingestProgress('Abriendo ' + source.file.name + '...', 2);
      await uiTick();
      const r = await extractFileText(source.file);
      if (r.kind === 'bpmn' && sourcesList().length > 0) {
        const desc = describeCurrentProcessAsText();
        if (desc) addSource('diagrama', r.name, 'Diagrama existente del proceso:' + String.fromCharCode(10) + desc);
        ingestProgress('Diagrama añadido como fuente', 100);
        endIngestJob();
        return;
      }
      if (r.kind === 'bpmn') {
        ingestProgress('Diagrama importado', 100);
        closeIngestModal();
        maybeFitOnLoad();
        activateTab('ficha');
        copilotPost('ai', '**BPMN importado desde ' + escapeHtml(r.name) + ':** ' + r.result.count + ' elementos (' + r.result.tasks + ' actividades, ' + r.result.gateways + ' compuertas, ' + r.result.events + ' eventos) y ' + r.result.flows + ' flujos.' + detalleImportBpmn(r.result));
        return;
      }
      const tipo = /transcrip|audio|reunion|llamada|teams|zoom/i.test(r.name) ? 'transcripcion' : 'documento';
      addSource(tipo, r.name, r.text);
      if (source.addOnly) {
        ingestProgress('Fuente añadida: ' + r.name, 100);
        endIngestJob();
        return;
      }
      text = combinedSourceText();
      label = sourcesList().length > 1 ? (sourcesList().length + ' fuentes combinadas') : r.name;
    } else {
      const pegado = ($('#notesInput').value || '').trim();
      if (pegado && !sourcesList().some(x => x.texto === pegado)) addSource('texto', 'Texto pegado', pegado);
      text = sourcesList().length ? combinedSourceText() : pegado;
      label = sourcesList().length > 1 ? (sourcesList().length + ' fuentes combinadas') : 'texto pegado';
    }
    throwIfCancelled();
    if (!text) throw new Error('No hay texto que interpretar. Carga un archivo o pega el texto del proceso.');

    // La IA es el camino por defecto. Si este navegador aun no tiene el codigo
    // del equipo (ni clave propia) se pide AHORA, en vez de caer en silencio al
    // modo basico; quien no lo tenga sigue en modo basico a sabiendas.
    if (!aiReady()) {
      ingestBusy(false);
      const codigo = await pedirCodigoEquipo();
      ingestBusy(true);
      if (codigo) {
        const c = aiConfig();
        saveAiConfig(Object.assign({}, c, { modo: 'equipo', codigo: codigo,
          proxyUrl: c.proxyUrl || PROXY_POR_DEFECTO, model: c.model || 'claude-opus-5' }));
        updateAiUi();
      }
    }
    const useAi = aiReady();
    ingestProgress(
      useAi ? 'Interpretando con IA ' + text.length.toLocaleString('es-PE') + ' caracteres... (puede tardar hasta 1 min)'
            : 'Analizando ' + text.length.toLocaleString('es-PE') + ' caracteres...',
      useAi ? null : 80);
    await uiTick();

    if (useAi) {
      let roles = null;
      const personas = detectParticipants(text);
      if (personas.length) {
        ingestProgress('Participantes detectados: ' + personas.length + '. Definiendo roles...', null);
        ingestBusy(false);
        roles = await askParticipantRoles(personas);
        ingestBusy(true);
        ingestProgress('Interpretando con IA...', null);
      }
      ingestBusy(false);
      const vista = await askProfundidad({ chars: text.length });
      ingestBusy(true);
      ingestProgress('Interpretando con IA...', null);
      const spec = await aiBuildProcess(text, label, (m) => ingestProgress(m, null), { roles, vista });
      throwIfCancelled();
      if (vista < 3) aplicarNivel(vista, { silent: true });
      ingestProgress('Proceso generado con IA', 100);
      closeIngestModal();
      maybeFitOnLoad();
      activateTab('ficha');
      renderFichaTab();
      const n = (spec.nodes || []).length;
      copilotPost('ai', `**Proceso interpretado con IA desde ${escapeHtml(label)}.** ${n} elementos con roles, sistemas y decisiones. Revisa el diagrama y completa la pestaña **Ficha**; luego exporta a **Ficha de Proceso**.` +
        (text.length > MAX_AI_CHARS ? `\n\nNota: el documento excedía ${(MAX_AI_CHARS / 1000) | 0}K caracteres, interpreté la primera parte. Si falta el final del proceso, pega esa sección y vuelve a generar.` : '') + lineaCosteIa());
    } else {
      buildProcessFromText(text, label);
      ingestProgress('Proceso generado', 100);
      closeIngestModal();
      maybeFitOnLoad();
      // Que nunca se confunda con una interpretacion por IA
      copilotPost('ai', '**Proceso generado en modo básico (sin IA)** desde ' + escapeHtml(label) +
        '. Las actividades se extrajeron por palabras clave: revisa roles y decisiones. ' +
        'Para interpretarlo con Claude, pon el código del equipo en Ajustes de IA (✨) y vuelve a generar.');
    }
    console.info('[ProcessIQ] ingesta OK en', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  } catch (err) {
    if (String(err.message) === 'CANCELLED' || err.name === 'AbortError') {
      ingestProgress('Cancelado.', 0);
      setTimeout(() => ingestBusy(false), 900);
    } else {
      console.error('[ProcessIQ] ingesta:', err);
      // Aunque falle (p. ej. respuesta cortada), lo consumido se cobra: se dice
      if (state._ultimoCosteIa) err = new Error((err.message || err) + '\n\nEsta ejecución igual consumió ' + fmtUsd(state._ultimoCosteIa.usd) + ' a precio de lista.');
      ingestProgress('', 0);
      ingestBusy(false);
      alert('No se pudo completar:\n\n' + (err.message || err));
    }
  } finally {
    if (ingestAbort) endIngestJob();
  }
}

// Compatibilidad: el input de archivo entra por aquí
async function ingestDocFile(file) { return runIngest({ file }); }

// D6 (docs/fase1-divergencias.md): mammoth 1.13 convierte las casillas de Word
// (w14:checkbox) en casillas sin texto, y el texto extraído perdía si estaban
// marcadas (☒) o no (☐). Antes de leer, se quita esa marca de casilla del
// documento: su contenido, el símbolo, se lee como texto, igual que con
// mammoth 1.8.0. Sin casillas, o si algo falla, se lee el archivo tal cual.
const NS_WORD_2010 = 'http://schemas.microsoft.com/office/word/2010/wordml';

function quitarMarcasDeCasilla(xml) {
  const decl = new RegExp('xmlns:([A-Za-z_][\\w.-]*)="' + NS_WORD_2010.replace(/[.]/g, '[.]') + '"').exec(xml);
  if (!decl) return xml;
  const p = decl[1].replace(/[.-]/g, (c) => '\\' + c);
  return xml
    .replace(new RegExp('<' + p + ':checkbox\\b[^>]*/>', 'g'), '')
    .replace(new RegExp('<' + p + ':checkbox\\b[^>]*>[\\s\\S]*?</' + p + ':checkbox>', 'g'), '');
}

async function casillasComoTexto(buf) {
  try {
    await lazyLoadScript(CDN.jszip);
    const zip = await window.JSZip.loadAsync(buf);
    const rels = zip.file('_rels/.rels') ? await zip.file('_rels/.rels').async('string') : '';
    // El documento principal es el destino de la relación officeDocument (casi siempre word/document.xml)
    const rel = /<Relationship\b[^>]*Type="[^"]*\/officeDocument"[^>]*>/.exec(rels);
    const target = rel && /Target="([^"]+)"/.exec(rel[0]);
    const destino = target ? target[1].replace(/^\//, '') : 'word/document.xml';
    const doc = zip.file(destino);
    if (!doc) return buf;
    const xml = await doc.async('string');
    const limpio = quitarMarcasDeCasilla(xml);
    if (limpio === xml) return buf;
    zip.file(destino, limpio);
    return await zip.generateAsync({ type: 'arraybuffer' });
  } catch (_) {
    return buf;
  }
}

// Lectura de documentos: @processiq/documentos (extraerTexto). Aquí va el
// entorno del navegador: progreso, cancelación y carga diferida de librerías.
const entornoExtraccion = {
  progreso: (mensaje, porcentaje) => ingestProgress(mensaje, porcentaje),
  ceder: uiTick,
  comprobarCancelado: throwIfCancelled,
  leer: readFileAs,
  mammoth: async () => {
    await lazyLoadScript(CDN.mammoth);
    const mammoth = window.mammoth;
    return { extractRawText: async (o) => mammoth.extractRawText({ arrayBuffer: await casillasComoTexto(o.arrayBuffer) }) };
  },
  // pdf.js se importa como módulo ESM (la primera vez tarda unos segundos: avisamos)
  pdfjs: async () => {
    if (!window._pdfjsLib) {
      ingestProgress('Cargando el lector de PDF (solo la primera vez)…', null);
      await uiTick();
      window._pdfjsLib = await import(/* @vite-ignore */ CDN.pdfjs);
      try { window._pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker; } catch (_) {}
    }
    return window._pdfjsLib;
  },
  jszip: async () => { await lazyLoadScript(CDN.jszip); return window.JSZip; },
  importarBpmn: (xml) => importBpmnXml(xml)
};

// Devuelve { kind:'bpmn', result } cuando el archivo es un diagrama importable.
function extractFileText(file) {
  return extraerTexto(file, entornoExtraccion);
}

export { extractFileText, ingestarDescripcion, runIngest };
