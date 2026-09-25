// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';

// ============================================================
// INGESTA MULTI-FORMATO — Word / PDF / PowerPoint / texto / BPMN
// Los formatos habituales de un proyecto de procesos. Word/PDF/PPTX se
// extraen a texto (para revisar antes de generar); BPMN/XML se importan
// como diagrama directo. Las librerías pesadas (mammoth/pdf.js/JSZip) se
// cargan bajo demanda desde CDN sólo cuando el usuario sube ese formato.
// ============================================================
// Librerías servidas desde la propia app (npm -> public/vendor/, ver
// scripts/copiar-vendor.mjs), con las mismas versiones que el MVP cargaba por
// CDN: mammoth 1.8.0, pdf.js 4.7.76, JSZip 3.10.1. Se cargan bajo demanda.
const CDN = {
  mammoth: '/vendor/mammoth.browser.min.js',
  pdfjs:   '/vendor/pdf.min.mjs',
  pdfWorker:'/vendor/pdf.worker.min.mjs',
  jszip:   '/vendor/jszip.min.js'
};
const _loadedScripts = {};
function lazyLoadScript(url) {
  if (_loadedScripts[url]) return _loadedScripts[url];
  _loadedScripts[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar ' + url + ' (¿sin conexión o CDN bloqueado?)'));
    document.head.appendChild(s);
  });
  return _loadedScripts[url];
}
function ingestStatus(msg, ok) {
  const el = $('#docFileName');
  if (el) el.textContent = msg;
}

// ---- Progreso visible + cancelación (evita que la app "parezca muerta") ----
let ingestAbort = null;             // { cancelled: bool, controller: AbortController }
// Topes de tamaño de archivo y de páginas de PDF: @processiq/documentos (MAX_ARCHIVO_MB, MAX_PAGINAS_PDF)
// Lo que enviamos al modelo (~45-50K tokens). v3.8.5: de 60K a 180K para que
// quepa un levantamiento con varios documentos; el otro limite es la
// RESPUESTA (64K tokens), no la entrada.
const MAX_AI_CHARS = 180000;
function ingestBusy(on) {
  const box = $('#ingestProgress');
  if (box) {
    box.hidden = !on;
    // La barra vive mas arriba que el boton: se trae a la vista para que el
    // usuario vea que la app esta trabajando sin tener que desplazarse.
    if (on) { try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {} }
  }
  const btn = $('#btnIngestGo');
  if (btn) {
    btn.disabled = !!on;
    // Feedback en el mismo boton que se pulso: spinner + "Generando…". Se
    // guarda la etiqueta anterior porque renderSources la cambia
    // ("Combinar N fuentes y generar").
    const lbl = btn.querySelector('.go-label');
    if (on && !btn.classList.contains('is-busy')) {
      btn.classList.add('is-busy');
      if (lbl) { btn.dataset.labelPrevia = lbl.textContent; lbl.textContent = 'Generando…'; }
    } else if (!on && btn.classList.contains('is-busy')) {
      btn.classList.remove('is-busy');
      if (lbl && btn.dataset.labelPrevia) lbl.textContent = btn.dataset.labelPrevia;
    }
  }
}
function ingestProgress(msg, pct) {
  const t = $('#ingestProgressText');
  if (t) t.textContent = msg;
  const bar = $('#ingestProgressBar');
  if (bar) {
    const indeterminate = (pct == null);
    bar.classList.toggle('indeterminate', indeterminate);
    bar.style.width = indeterminate ? '100%' : Math.max(2, Math.min(100, pct)) + '%';
  }
}
// Cede el hilo para que el navegador repinte (si no, la UI se congela)
const uiTick = () => new Promise(r => setTimeout(r, 0));
function throwIfCancelled() {
  if (ingestAbort && ingestAbort.cancelled) throw new Error('CANCELLED');
}
// Cronometro del trabajo: con documentos largos la IA tarda uno o dos
// minutos, y un contador que avanza distingue "trabajando" de "colgada".
let ingestReloj = null;
function startIngestJob() {
  ingestAbort = { cancelled: false, controller: new AbortController() };
  ingestBusy(true);
  const t0 = Date.now(), el = $('#ingestElapsed');
  clearInterval(ingestReloj);
  if (el) el.textContent = '0:00';
  ingestReloj = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    if (el) el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
  return ingestAbort;
}
function endIngestJob() {
  ingestAbort = null;
  ingestBusy(false);
  clearInterval(ingestReloj); ingestReloj = null;
  const el = $('#ingestElapsed'); if (el) el.textContent = '';
}
function cancelIngestJob() {
  if (!ingestAbort) return;
  ingestAbort.cancelled = true;
  try { ingestAbort.controller.abort(); } catch (_) {}
  ingestProgress('Cancelando…', null);
}

function readFileAs(file, how) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    if (how === 'arraybuffer') r.readAsArrayBuffer(file); else r.readAsText(file, 'utf-8');
  });
}

export { CDN, MAX_AI_CHARS, cancelIngestJob, endIngestJob, ingestAbort, ingestBusy, ingestProgress, lazyLoadScript, readFileAs, startIngestJob, throwIfCancelled, uiTick };
