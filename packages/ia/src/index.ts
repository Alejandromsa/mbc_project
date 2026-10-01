// @processiq/ia — prompts, cliente de Claude, costes y lectura de respuestas.
export { PROMPT_GENERACION, ROL_ANALISTA, TAREAS_IA, PROMPT_PAINS, REGLAS_FUSION, type TareaIa } from './prompts.js';
export {
  MODELOS_IA, PRECIOS_IA, GEN_MAX_TOKENS, CAR_POR_TOKEN_INICIAL, SALIDA_INICIAL,
  precioModelo, usd, fmtUsd, mediana, estimarCosteGeneracion,
  type PrecioModelo, type TokensCache, type CosteEjecucion, type EstimacionCoste
} from './costes.js';
export { llamarClaude, extraerJson, marcarErrorIa, type ConfigIa, type UsoIa, type OpcionesLlamada, type Entorno, type ClaseErrorIa } from './cliente.js';
export {
  EspecGeneracionEsquema, MAX_CHARS_REPARACION, PROMPT_REPARACION, clasificarErrorIa, promptReparacion, validarEspecGeneracion,
  type EspecGeneracion
} from './especificacion.js';
export {
  promptGeneracion, timeoutGeneracion, resumenProcesoParaIa, promptTarea, combinarFuentes, interpretarPains,
  type OpcionesGeneracion, type ProcesoParaIa, type Fuente, type PainIa, type HipotesisSector, type PainsInterpretados
} from './construccion.js';
export {
  LETRAS_RACI, LLAMADA_MATRIZ, MATRICES_IA, MAX_ROLES_RACI, MAX_TOKENS_MATRIZ, PROMPT_MATRICES, TIPOS_ACTIVIDAD_RACI, TIPOS_MATRIZ_IA,
  actividadesRaci, esTipoMatrizIa, llamadaReparacionMatriz, matrizDeTarea, pedirMatrizIa, promptMatriz, promptReparacionMatriz, sistemaReparacionMatriz, validarMatrizIa,
  type ContextoMatriz, type LetraRaci, type LlamarIa, type MatrizDef, type MatrizIa, type MatrizRaciIa, type SipocIa, type TipoMatrizIa,
  type ValidacionMatriz
} from './matrices.js';
export { LLAMADAS_IA, huellaTexto, versionPrompt, type ParametrosLlamada } from './version.js';
