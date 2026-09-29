// @processiq/bpmn — import y export BPMN 2.0.
export { generarBpmnXml, type ProcesoBpmn, type CarrilesBpmn } from './exportar.js';
export { leerBpmn, type ConteoLectura, type LectorXml, type OpcionesLectura, type ResultadoLectura } from './importar.js';
export { EJECUCION_DE_TAREA } from './importar-externo.js';
export type { DocumentoXml, ElementoXml, NodoXml } from './xml.js';
