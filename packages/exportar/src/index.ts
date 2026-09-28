// @processiq/exportar — PPTX editable (temas mbc y bbva), informe Word y Ficha de Proceso.
export {
  construirPptx, posprocesarPptx, TEMAS_PPTX, anclarConectoresEnXml, computeDeltas,
  painImplication, painRecommendation, renderMiniDiagram
} from './pptx.js';
export { derivarFicha, construirInformeWord } from './word.js';
export { cuerpoFicha, estilosFicha, documentoFicha } from './ficha.js';
export type { EntornoPptx, JSZipPptx, PresentacionPptx, TemaPptx } from './pptx.js';
export type { OpcionesFicha } from './ficha.js';
export type {
  CarrilesExportar, EstadoExportable, EstadoPptx, MatrizRaci, ResultadoSimulador, Sipoc, VistaProceso
} from './tipos.js';
