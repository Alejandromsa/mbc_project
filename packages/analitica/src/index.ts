// @processiq/analitica — simulación, diagnóstico, backlog y What-If.
export {
  simularCarga, simularEscenario,
  type ParametrosCosto, type ResultadoSimulacion, type SimulacionDetallada, type Escenario
} from './simulacion.js';
export {
  cuelloDeBotella, oportunidadesAutomatizacion, mapaDeValor, painsDelProceso, posicionImpactoEsfuerzo,
  ESFUERZO_POR_CATEGORIA,
  type CuelloDeBotella, type CargaActividad, type OportunidadAutomatizacion, type MapaDeValor, type PainConActividad
} from './diagnostico.js';
export {
  generarBacklog, backlogCsv, compararWhatIf, PALANCAS_WHATIF,
  type Iniciativa, type Palanca, type ComparacionWhatIf
} from './backlog.js';
