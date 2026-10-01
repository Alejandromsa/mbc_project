// @processiq/motor — layout, ruteo, calidad, niveles y operaciones sobre el grafo.
export { caminoRedondeado, segmentosDePath, segmentoPisaCaja, segmentosSeCruzan, type Punto, type Caja, type Segmento } from './geometria.js';
export { medirCalidad, type CalidadDiagrama } from './calidad.js';
export {
  rutaArista, rutaHeuristica, rutaAStar, corredoresDeRetorno, RADIO_CODO, LOOP_GAP, LOOP_LANE_H,
  type ContextoRuteo, type CarrilesRuteo
} from './ruteo.js';
export {
  asegurarRamasDeDecision, asignarCodigosActividad, esConvergencia, inferirResponsables, insertarCompuertasConvergencia
} from './operaciones.js';
export { calcularLayout, normalizarGeometria, type Carriles } from './layout.js';
export {
  NIVELES, EJEC_MAX_CAJAS, esHito, gruposPorCadena, ranksLocales, etapasEjecutivas,
  colapsarGatewaysDegenerados, proyectarNivel, type ModeloProceso, type ContextoNivel
} from './niveles.js';
