// Ficha de Proceso: el documento lo arma @processiq/exportar; aquí se valida,
// se muestra la vista previa y se descarga.
import { cuerpoFicha, documentoFicha, estilosFicha } from '@processiq/exportar';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { tr } from '../i18n.js';
import { openModal } from '../ui/modal.js';
import { download, filename, serializeCanvasSvg } from './archivos.js';

// La ficha (vista previa y descarga) es un entregable: no se traduce. Solo el diálogo.
function exportFicha() {
  if (state.nodes.length === 0) { alert(tr('exportar.sinProcesoFicha')); return; }
  download('﻿' + documentoFicha(state, serializeCanvasSvg), filename('doc').replace(/\.doc$/, '_ficha.doc'), 'application/msword');
}

function openFichaPreview() {
  if (state.nodes.length === 0) { alert(tr('exportar.sinProcesoFicha')); return; }
  const body = cuerpoFicha(state, { embedDiagram: true, svgDiagrama: serializeCanvasSvg });
  const html = `<div class="ficha-preview"><style>${estilosFicha(false)}
      .ficha-preview { background:#fff; color:#232323; max-height:70vh; overflow:auto; padding:22px 26px; border-radius:8px; box-shadow: inset 0 0 0 1px #eee; }
    </style>${body}</div>`;
  openModal(tr('exportar.fichaTitulo'), html, () => exportFicha());
  // Ensancha el modal para la ficha y renombra el botón OK a "Descargar Word"
  const card = document.querySelector('#modal .modal-card');
  if (card) card.classList.add('modal-card-lg');
  const ok = $('#modalOk'); if (ok) ok.innerHTML = tr('exportar.descargarWord');
  const cancel = $('#modalCancel'); if (cancel) cancel.textContent = tr('comun.cerrar');
  const restore = () => { if (card) card.classList.remove('modal-card-lg'); if (ok) ok.textContent = tr('comun.aceptar'); if (cancel) cancel.textContent = tr('comun.cancelar'); };
  if (ok) { const prev = ok.onclick; ok.onclick = (e) => { restore(); if (prev) prev(e); }; }
  if (cancel) { const prevc = cancel.onclick; cancel.onclick = (e) => { restore(); if (prevc) prevc(e); }; }
}

export { exportFicha, openFichaPreview };
