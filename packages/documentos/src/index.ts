// @processiq/documentos — lectura de documentos, interpretación básica de texto y participantes.
export { interpretarTexto, type ActividadDetectada } from './texto.js';
export { construirProcesoBasico, MAX_NODOS_BASICO, type ProcesoBasico } from './basico.js';
export { detectarParticipantes, type Participante } from './participantes.js';
export { extraerTexto, textoDePdf, textoDePptx, MAX_ARCHIVO_MB, MAX_PAGINAS_PDF } from './extraccion.js';
export type { ArchivoEntrada, EntornoExtraccion, TextoExtraido } from './extraccion-tipos.js';
