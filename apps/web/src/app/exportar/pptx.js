// Export PPTX: la presentación la construye @processiq/exportar; aquí se
// valida, se descarga y se guarda el resultado para las pruebas (ProcessIQ.ultimoPptx()).
import { construirPptx, painImplication, posprocesarPptx } from '@processiq/exportar';
import { state } from '../estado.js';
import { CDN, lazyLoadScript } from '../ingesta/formatos.js';
import { filename } from './archivos.js';

function exportPptx(tema) {
  if (typeof PptxGenJS === 'undefined') {
    alert('La librería PPTX no se cargó (¿estás offline?). Conecta a internet o usa export SVG/PNG.');
    return;
  }
  if (state.nodes.length === 0) { alert('No hay proceso para exportar.'); return; }
  const { pres, nombresPorNodo } = construirPptx(state, tema, {
    PptxGenJS,
    alNombresPorNodo: (m) => { state._nombresPorNodo = m; }
  });
  anclarConectoresYDescargar(pres, filename('pptx'), nombresPorNodo);
}

async function anclarConectoresYDescargar(pres, fileName, nombresPorNodo) {
  const { blob, conectores } = await posprocesarPptx(pres, nombresPorNodo, async () => {
    await lazyLoadScript(CDN.jszip);
    return window.JSZip;
  });
  state._ultimoPptx = { blob, conectores };
  if (state._sinDescarga) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fileName;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export { exportPptx, painImplication };
