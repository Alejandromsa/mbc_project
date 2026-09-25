// @processiq/dominio — modelo de proceso, catálogos y reglas sin dependencias.
export type * from './modelo.js';
export { FORMAS_POR_DEFECTO, type FormaPorDefecto } from './formas.js';
export { fichaVacia, normalizarFicha } from './ficha.js';
export { centroNodo, contarTraspasos, ordenDeFlujo } from './recorrido.js';
export { crearNodo } from './fabrica.js';
export { validarProceso, PESO_SEVERIDAD, type Hallazgo, type Severidad, type CatalogoVerbos } from './validacion.js';
export {
  KPI_LIBRARY, PAIN_CATEGORIES, INDUSTRIES, EXECUTION_TYPES,
  VERBS_ALLOWED, VERBS_FORBIDDEN, MACROPROCESSES,
  type Kpi, type CategoriaPain, type DefinicionTipoEjecucion
} from './catalogos.js';
export { migrarProyecto, ProyectoV1Esquema, VERSION_ESQUEMA, type ProyectoV1, type ResultadoMigracion } from './esquema.js';
