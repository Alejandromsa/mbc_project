// Ficha de Proceso: el documento lo arma @processiq/exportar; aquí se valida,
// se muestra la vista previa y se descarga.
import { cuerpoFicha, documentoFicha, estilosFicha } from '@processiq/exportar';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { openModal } from '../ui/modal.js';
import { download, filename, serializeCanvasSvg } from './archivos.js';

function exportFicha() {
  if (state.nodes.length === 0) { alert('No hay proceso para generar la ficha.'); return; }
  download('﻿' + documentoFicha(state, serializeCanvasSvg), filename('doc').replace(/\.doc$/, '_ficha.doc'), 'application/msword');
}

function openFichaPreview() {
  if (state.nodes.length === 0) { alert('No hay proceso para generar la ficha.'); return; }
  const body = cuerpoFicha(state, { embedDiagram: true, svgDiagrama: serializeCanvasSvg });
  const html = `<div class="ficha-preview"><style>${estilosFicha(false)}
      .ficha-preview { background:#fff; color:#232323; max-height:70vh; overflow:auto; padding:22px 26px; border-radius:8px; box-shadow: inset 0 0 0 1px #eee; }
    </style>${body}</div>`;
  openModal('📋 Ficha de Proceso · vista previa', html, () => exportFicha());
  // Ensancha el modal para la ficha y renombra el botón OK a "Descargar Word"
  const card = document.querySelector('#modal .modal-card');
  if (card) card.classList.add('modal-card-lg');
  const ok = $('#modalOk'); if (ok) ok.innerHTML = '⬇️ Descargar Word';
  const cancel = $('#modalCancel'); if (cancel) cancel.textContent = 'Cerrar';
  const restore = () => { if (card) card.classList.remove('modal-card-lg'); if (ok) ok.textContent = 'Aceptar'; if (cancel) cancel.textContent = 'Cancelar'; };
  if (ok) { const prev = ok.onclick; ok.onclick = (e) => { restore(); if (prev) prev(e); }; }
  if (cancel) { const prevc = cancel.onclick; cancel.onclick = (e) => { restore(); if (prevc) prevc(e); }; }
}

export { exportFicha, openFichaPreview };
