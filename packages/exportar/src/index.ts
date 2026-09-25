// @processiq/exportar — PPTX editable (temas mbc y bbva), informe Word y Ficha de Proceso.
export {
  construirPptx, posprocesarPptx, TEMAS_PPTX, anclarConectoresEnXml, computeDeltas,
  painImplication, painRecommendation, renderMiniDiagram
} from './pptx.js';
export { derivarFicha, construirInformeWord } from './word.js';
export { cuerpoFicha, estilosFicha, documentoFicha } from './ficha.js';
