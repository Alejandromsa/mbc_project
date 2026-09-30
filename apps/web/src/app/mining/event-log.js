// Ingesta de event logs: la lectura y el descubrimiento están en @processiq/mining.
import { EVENT_LOG_MUESTRA, descubrirProceso, parseCsv } from '@processiq/mining';
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { tr } from '../i18n.js';
import { autoLayout } from '../layout/auto-layout.js';
import { maybeFitOnLoad } from '../lienzo/zoom.js';
import { activateTab } from '../paneles/cajon.js';
import { persist } from '../persistencia.js';

// ----------- CSV Event Log → Process Discovery ligero -----------
function handleCsvFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseCsv(reader.result);
    previewCsv(parsed);
  };
  reader.readAsText(f);
}

function loadCsvSample() {
  const parsed = parseCsv(EVENT_LOG_MUESTRA);
  previewCsv(parsed);
}

function previewCsv(parsed) {
  window._csvData = parsed;
  const preview = $('#csvPreview');
  preview.hidden = false;
  const sample = parsed.rows.slice(0, 6);
  let txt = parsed.headers.join(' | ') + '\n' + '-'.repeat(60) + '\n';
  sample.forEach(r => { txt += parsed.headers.map(h => r[h]).join(' | ') + '\n'; });
  txt += tr('mineria.filas', { n: parsed.rows.length });
  preview.textContent = txt;

  // Llena mapping selects
  const guess = (kw) => parsed.headers.find(h => kw.some(k => h.toLowerCase().includes(k))) || parsed.headers[0];
  ['mapCase', 'mapAct', 'mapTs', 'mapRes'].forEach(id => {
    const sel = $('#' + id);
    sel.innerHTML = '';
    if (id === 'mapRes') sel.insertAdjacentHTML('beforeend', '<option value="">' + tr('mineria.ninguna') + '</option>');
    parsed.headers.forEach(h => sel.insertAdjacentHTML('beforeend', `<option value="${h}">${h}</option>`));
  });
  $('#mapCase').value = guess(['case', 'id']);
  $('#mapAct').value  = guess(['act', 'task', 'event', 'step']);
  $('#mapTs').value   = guess(['time', 'date', 'fecha', 'ts']);
  const resGuess = parsed.headers.find(h => ['user','res','owner','role','rol','responsab'].some(k => h.toLowerCase().includes(k)));
  $('#mapRes').value = resGuess || '';

  $('#csvMapping').hidden = false;
  $('#btnIngestCsv').disabled = false;
}

function buildProcessFromEventLog(parsed, map) {
  if (!parsed) return;
  const r = descubrirProceso(parsed, map, { siguienteId: state.nextId, formas: SHAPE_DEFAULTS });
  state._variants = r.variantes;
  state._variantsTotalCases = r.totalCasos;
  state.nodes = r.nodos;
  state.edges = r.aristas;
  state.selectedNodeId = null;
  state.nextId = r.siguienteId;

  persist();
  autoLayout();
  maybeFitOnLoad();   // encuadra el proceso descubierto si desborda la pantalla

  activateTab('copilot');
  copilotPost('ai', tr('mineria.completado', {
    casos: r.totalCasos, actividades: r.actividades, transiciones: r.transiciones,
    inicio: r.topInicio || '—', fin: r.topFin || '—'
  }));
}

export { buildProcessFromEventLog, handleCsvFile, loadCsvSample };
