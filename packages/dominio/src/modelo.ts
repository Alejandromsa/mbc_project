// Modelo de proceso de ProcessIQ.
// Los nombres de los campos son los del MVP 3.8.9 (y de su export JSON): son el
// contrato con los datos que ya existen en los navegadores de los consultores.
// Los tipos llevan nombre en español; los campos, no se renombran.

/** Forma BPMN del nodo. `system` es una actividad soportada por sistema (forma propia). */
export type TipoNodo = 'start' | 'intermediate' | 'end' | 'task' | 'system' | 'decision' | 'document' | 'data';

/** Tipo de ejecución de una tarea (Playbook MBB §10). Vacío en eventos y compuertas. */
export type TipoEjecucion =
  | 'manual' | 'system' | 'automatic' | 'ai' | 'email' | 'send' | 'phone' | 'document' | 'rpa' | '';

export type TipoGateway = 'exclusive' | 'parallel' | 'inclusive';

/** Subtipo de evento BPMN (inicio, intermedio o fin). */
export type TipoEvento = 'none' | 'message' | 'timer' | 'error' | 'signal';

/** Marcador de actividad BPMN en la base de la tarea. */
export type MarcadorActividad = 'subprocess' | 'loop' | 'multiinstance' | 'multiinstance-seq';

/** Clasificación Lean de valor: valor añadido, necesario para el negocio, sin valor. */
export type ValorLean = 'VA' | 'BVA' | 'NVA' | '';

/** Nivel de detalle: 1 Ejecutivo · 2 Actividad · 3 Detalle. */
export type NivelDetalle = 1 | 2 | 3;

export interface EventoBorde {
  type: 'timer' | 'error' | 'message';
  /** true = interrumpe la actividad (anillo simple); false = no interrumpe (punteado). */
  interrupting: boolean;
}

export interface Pain {
  id: string;
  /** Id de CategoriaPain (handoff, rework, wait, control, system, regulatory, manual, data). */
  category: string;
  description: string;
  /** 1 a 5 */
  severity: number;
  /** 1 a 5 */
  frequency: number;
}

export interface Nodo {
  id: string;
  type: TipoNodo;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  executionType?: TipoEjecucion;
  /** Código estilo MBC, p. ej. USR-01 */
  activityCode?: string;
  /** Responsable: define el carril (swimlane). */
  owner?: string;
  system?: string;
  /** Minutos por ejecución (texto en el MVP). */
  time?: string;
  /** Volumen mensual (texto en el MVP). */
  volume?: string;
  va?: ValorLean;
  sla?: string;
  docsIn?: string;
  docsOut?: string;
  rules?: string;
  notes?: string;
  pains?: Pain[];
  gatewayType?: TipoGateway;
  eventType?: TipoEvento;
  /** Evento intermedio que lanza (relleno) en vez de esperar (contorno). */
  throw?: boolean;
  /** Evento de fin de terminación. */
  terminate?: boolean;
  marker?: MarcadorActividad | '';
  boundary?: EventoBorde | null;
  /** Nivel de detalle al que pertenece (lo asigna la IA o la heurística de niveles). */
  nivel?: NivelDetalle;
  /** Id del nodo de nivel superior del que forma parte (jerarquía de la IA). */
  padre?: string;
  /** Rol (campo antiguo; el carril sale de owner). */
  role?: string;
  // Campos internos del MVP (prefijo _): no forman parte del contrato estable.
  [interno: `_${string}`]: unknown;
}

export interface Arista {
  id: string;
  from: string;
  to: string;
  label: string;
  [interno: `_${string}`]: unknown;
}

export interface MetaProceso {
  name: string;
  industry: string;
  macroprocess: string;
  client: string;
  owner: string;
}

export interface FilaGobernanza { rol: string; cargo: string; nombre: string; fecha: string }
export interface SistemaProceso { nombre: string; uso: string }
export interface Termino { termino: string; definicion: string }
export interface Anexo { codigo: string; nombre: string }
export interface CambioVersion { version: string; fecha: string; descripcion: string }

/** Ficha de Proceso corporativa (12 bloques, formato PR-DU-COM-*). */
export interface Ficha {
  code: string;
  version: string;
  objetivo: string;
  alcanceAreas: string;
  alcanceDesde: string;
  alcanceHasta: string;
  alcanceIncluye: string;
  descripcion: string;
  gobernanza: FilaGobernanza[];
  sistemas: SistemaProceso[];
  terminos: Termino[];
  anexos: Anexo[];
  cambios: CambioVersion[];
}

/** Valor capturado de un KPI del catálogo (gap frente al benchmark). */
export interface ValorKpi {
  name: string;
  unit: string;
  benchmark: string;
  value: string;
  gap: string;
  source: string;
}
