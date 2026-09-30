// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { REGLAS_FUSION, combinarFuentes } from '@processiq/ia';
import { flowOrderNodes } from '../proceso/operaciones.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { locale, traducirError, tr } from '../i18n.js';
import { getNode } from '../lienzo/interaccion.js';
import { escapeHtml } from '../util.js';
import { extractFileText, runIngest } from './flujo.js';
import { MAX_AI_CHARS, endIngestJob, ingestAbort, ingestProgress, startIngestJob, throwIfCancelled, uiTick } from './formatos.js';

// ============================================================
// FUENTES MULTIPLES
// Un AS-IS real casi nunca sale de un solo documento: hay un flujo antiguo,
// la grabacion del levantamiento y algun manual. Se acumulan aqui y la IA
// las fusiona en UN proceso, reconciliando lo que se contradiga.
// ============================================================
function sourcesList() { state._sources = state._sources || []; return state._sources; }

function addSource(tipo, nombre, texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  const src = { id: 's' + (state.nextId++), tipo: tipo, nombre: nombre, texto: t, chars: t.length };
  sourcesList().push(src);
  renderSources();
  return src;
}

function removeSource(id) {
  state._sources = sourcesList().filter(s => s.id !== id);
  renderSources();
}

// v3.8.5: varios documentos a la vez para el levantamiento. Elegir o soltar
// archivos ya NO genera el proceso: los lee y los deja en la lista de fuentes;
// se genera con el boton cuando el usuario termino de reunir el material.
// Excepcion: un unico .bpmn sin otras fuentes se importa directo, como antes.
async function addFilesAsSources(fileList) {
  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length || ingestAbort) return;
  if (files.length === 1 && /\.(bpmn|xml)$/i.test(files[0].name || '') && !sourcesList().length) {
    const n = $('#docFileName'); if (n) n.textContent = files[0].name;
    return runIngest({ file: files[0] });
  }
  startIngestJob();
  const lbl = $('#btnIngestGo .go-label');
  if (lbl) lbl.textContent = tr('fuentes.leyendoDocumentos');
  const fallos = [];
  let nuevos = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      throwIfCancelled();
      const f = files[i];
      ingestProgress(tr('fuentes.leyendo', { i: i + 1, n: files.length, nombre: f.name }), Math.round((i / files.length) * 100));
      await uiTick();
      try {
        const r = await extractFileText(f);
        if (r.kind === 'bpmn') {
          const desc = describeCurrentProcessAsText();
          if (desc && addSource('diagrama', r.name, 'Diagrama existente del proceso:' + String.fromCharCode(10) + desc)) nuevos++;
          continue;
        }
        const texto = String(r.text || '').trim();
        if (sourcesList().some(s => s.nombre === r.name && s.chars === texto.length)) continue;   // ya estaba
        const tipo = /transcrip|audio|reunion|llamada|teams|zoom/i.test(r.name) ? 'transcripcion' : 'documento';
        if (addSource(tipo, r.name, texto)) nuevos++;
        else fallos.push(tr('fuentes.sinTexto', { nombre: f.name }));
      } catch (err) {
        if (String(err.message) === 'CANCELLED' || err.name === 'AbortError') throw err;
        fallos.push(f.name + ': ' + traducirError(err.message || err));
      }
    }
  } catch (err) {
    // Cancelado: se conserva lo que ya se leyo
  } finally {
    endIngestJob();
    renderSources();   // endIngestJob restaura una etiqueta vieja del boton
  }
  const n = sourcesList().length, aviso = $('#docFileName');
  if (aviso) aviso.textContent = !nuevos ? '' : tr('fuentes.anadidos', {
    que: nuevos === 1 ? tr('fuentes.unoAnadido') : tr('fuentes.variosAnadidos', { n: nuevos }),
    boton: n > 1 ? tr('fuentes.combinarYGenerar') : tr('ingesta.generarProceso')
  });
  if (fallos.length) alert(tr('fuentes.noLeidos', { n: fallos.length, lista: fallos.join('\n') }));
}

const SRC_ICON = { documento: 'DOC', transcripcion: 'AUDIO', diagrama: 'BPMN', texto: 'TEXTO', eventlog: 'CSV' };
const etiquetaFuente = (tipo) => (tipo === 'texto' ? tr('fuentes.tagTexto') : (SRC_ICON[tipo] || 'DOC'));

function renderSources() {
  const box = $('#sourcesBox'), list = $('#sourcesList');
  if (!box || !list) return;
  const arr = sourcesList();
  box.hidden = arr.length === 0;
  list.innerHTML = arr.map(s =>
    '<li class="src-item" data-id="' + s.id + '">' +
      '<span class="src-tag">' + etiquetaFuente(s.tipo) + '</span>' +
      '<span class="src-name">' + escapeHtml(s.nombre) + '</span>' +
      '<span class="src-chars">' + tr('fuentes.caracteres', { n: s.chars.toLocaleString(locale()) }) + '</span>' +
      '<button class="src-del" data-id="' + s.id + '" title="' + tr('fuentes.quitar') + '" type="button">x</button>' +
    '</li>').join('');
  list.querySelectorAll('.src-del').forEach(b =>
    b.addEventListener('click', () => removeSource(b.dataset.id)));
  const n = arr.length;
  const lbl = $('#sourcesCount');
  if (lbl) lbl.textContent = n === 1 ? tr('fuentes.unaLista') : tr('fuentes.variasListas', { n });
  const total = arr.reduce((a, s) => a + s.chars, 0);
  if (lbl && n > 1) lbl.textContent += ' · ' + tr('fuentes.caracteres', { n: total.toLocaleString(locale()) });
  const warn = $('#sourcesWarn');
  if (warn) {
    const excede = total > MAX_AI_CHARS;
    warn.hidden = !excede;
    warn.textContent = excede
      ? tr('fuentes.excede', { total: total.toLocaleString(locale()), max: MAX_AI_CHARS.toLocaleString(locale()) })
      : '';
  }
  const go = $('#btnIngestGo');
  if (go) {
    const span = go.querySelector('.go-label');
    if (span) span.textContent = n > 1 ? tr('fuentes.combinarN', { n }) : tr('ingesta.generarProceso');
  }
}

// Describe un diagrama BPMN importado como texto, para poder fusionarlo con las demas fuentes
function describeCurrentProcessAsText() {
  if (!state.nodes.length) return '';
  const lane = (state._lanes && state._lanes.laneOf) || {};
  const NL = String.fromCharCode(10);
  return flowOrderNodes().map(n => {
    const outs = state.edges.filter(e => e.from === n.id)
      .map(e => { const t = getNode(e.to); return (e.label ? e.label + ' -> ' : '-> ') + (t ? t.label : '?'); });
    return '- [' + n.type + '] ' + (n.label || '') +
           ' (rol: ' + (lane[n.id] || n.owner || 'sin asignar') + ')' +
           (n.system ? ' [sistema: ' + n.system + ']' : '') +
           (outs.length ? ' | ' + outs.join(' ; ') : '');
  }).join(NL);
}

// Une todas las fuentes en un solo texto etiquetado para la IA
function combinedSourceText() {
  return combinarFuentes(sourcesList(), MAX_AI_CHARS);
}

const MERGE_RULES = REGLAS_FUSION;

export { MERGE_RULES, addFilesAsSources, addSource, combinedSourceText, describeCurrentProcessAsText, renderSources, sourcesList };
