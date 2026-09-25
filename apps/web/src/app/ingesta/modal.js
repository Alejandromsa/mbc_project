// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $, $$ } from '../dom.js';
import { openExamplesModal } from '../ejemplos/galeria.js';
import { buildProcessFromEventLog, handleCsvFile, loadCsvSample } from '../mining/event-log.js';
import { runIngest } from './flujo.js';
import { addFilesAsSources, addSource, sourcesList } from './fuentes.js';

// ============================================================
// INGEST MODAL — Audio, Notas, Event Log
// ============================================================
let speechRecognition = null;
let ingestInProgress = false;

function guardIngest(fn) {
  return function (...args) {
    if (ingestInProgress) return;
    ingestInProgress = true;
    try { fn.apply(this, args); }
    finally { setTimeout(() => { ingestInProgress = false; }, 1500); }
  };
}

function openIngestModal() {
  $('#ingestModal').hidden = false;
  activateIngestTab('notes');   // v3.8.4: documento/texto es el camino principal (antes abria en Audio)
}

function closeIngestModal() {
  $('#ingestModal').hidden = true;
  stopSpeechRecognition();
}

function attachIngestListeners() {
  $('#ingestClose').addEventListener('click', closeIngestModal);
  $('#ingestModal').addEventListener('click', e => {
    if (e.target.id === 'ingestModal') closeIngestModal();
  });

  $$('.itab').forEach(t => t.addEventListener('click', () => activateIngestTab(t.dataset.itab)));

  // Audio
  $('#btnRecStart').addEventListener('click', startSpeechRecognition);
  $('#btnRecStop').addEventListener('click', stopSpeechRecognition);
  $('#btnIngestAudio').addEventListener('click', () => {
    const txt = $('#audioTranscript').value.trim();
    if (!txt) { alert('No hay transcripción.'); return; }
    // v3.8.4: la transcripcion va por el MISMO camino que los documentos (IA con
    // la clave del equipo). Antes llamaba al extractor por palabras clave y
    // generaba al instante sin IA aunque la clave estuviera configurada.
    if (!sourcesList().some(x => x.texto === txt)) addSource('transcripcion', 'Transcripción de audio', txt);
    activateIngestTab('notes');   // ahi viven la barra de progreso y el cronometro
    runIngest(null);
  });

  // Selección de archivo (desde la zona de arrastrar) → flujo único
  const docInput = $('#docFileInput');
  if (docInput) {
    docInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);   // copiar ANTES de vaciar el input
      e.target.value = '';
      addFilesAsSources(files);
    });
  }

  // Cargar ejemplo demo → proceso completo pre-poblado (para demostraciones a cliente)
  const sampleBtn = $('#btnLoadSample');
  if (sampleBtn) sampleBtn.addEventListener('click', () => {
    // Abre la galería completa de ejemplos (12 demos) — accesible también con un proceso ya cargado
    closeIngestModal();
    openExamplesModal();
  });

  // CSV event log
  $('#csvFile').addEventListener('change', handleCsvFile);
  $('#btnCsvSample').addEventListener('click', loadCsvSample);
  $('#btnIngestCsv').addEventListener('click', guardIngest(() => {
    const map = {
      case: $('#mapCase').value,
      act:  $('#mapAct').value,
      ts:   $('#mapTs').value,
      res:  $('#mapRes').value
    };
    buildProcessFromEventLog(window._csvData, map);
    closeIngestModal();
  }));
}

function activateIngestTab(name) {
  $$('.itab').forEach(t => t.classList.toggle('active', t.dataset.itab === name));
  $$('.ipanel').forEach(p => p.classList.toggle('active', p.dataset.ipanel === name));
}

// ----------- Speech recognition (Web Speech API) -----------
function startSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge. También puedes pegar la transcripción manualmente.');
    return;
  }
  speechRecognition = new SR();
  speechRecognition.lang = 'es-PE';
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;

  const ta = $('#audioTranscript');
  let finalText = ta.value;

  speechRecognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + ' ';
      else interim += r[0].transcript;
    }
    ta.value = finalText + interim;
  };

  speechRecognition.onerror = (e) => {
    $('#recStatus').textContent = 'Error: ' + e.error;
    $('#recStatus').classList.remove('recording');
  };

  speechRecognition.onend = () => {
    $('#recStatus').textContent = 'detenido';
    $('#recStatus').classList.remove('recording');
    $('#btnRecStart').disabled = false;
    $('#btnRecStop').disabled = true;
  };

  speechRecognition.start();
  $('#recStatus').textContent = 'grabando…';
  $('#recStatus').classList.add('recording');
  $('#btnRecStart').disabled = true;
  $('#btnRecStop').disabled = false;
}

function stopSpeechRecognition() {
  if (speechRecognition) { try { speechRecognition.stop(); } catch (e) {} speechRecognition = null; }
  $('#recStatus').textContent = 'listo';
  $('#recStatus').classList.remove('recording');
  $('#btnRecStart').disabled = false;
  $('#btnRecStop').disabled = true;
}

export { attachIngestListeners, closeIngestModal, openIngestModal };
