// Tipos de lo que leen los exports (PPTX, informe Word y Ficha de Proceso).
// Es el `state` del editor (solo lectura): el proceso más los resultados de los
// paneles de análisis que se guardan con prefijo _ (carriles, RACI, SIPOC,
// simulador y KPIs capturados). Solo tipos: este archivo no genera JavaScript.
import type { Arista, Ficha, MetaProceso, Nodo, ValorKpi } from '@processiq/dominio';

/** Carriles que calcula el auto-layout (state._lanes). El PPTX usa además ranks, totalRanks y colW. */
export interface CarrilesExportar {
  list?: string[];
  laneOf?: Record<string, string>;
  /** Columna (rango) de cada nodo, por id. */
  ranks?: Record<string, number>;
  totalRanks?: number;
  colW?: number;
}

/** Matriz RACI: id de actividad -> rol -> letra ('R', 'A', 'C', 'I', 'R/A'…). */
export type MatrizRaci = Record<string, Record<string, string>>;

/** SIPOC del panel de análisis (texto libre por columna). */
export interface Sipoc {
  suppliers: string;
  inputs: string;
  process: string;
  outputs: string;
  customers: string;
}

/** Lo que el PPTX y el informe leen del resultado del Simulador (ResultadoSimulacion de @processiq/analitica). */
export interface ResultadoSimulador {
  activitiesWithData: number;
  fteCurrent: number;
  fteToBe: number;
  monthlyCost: number;
  annualSavings: number;
  leadTimeChain: number;
}

/** Nodos y aristas de una vista (As-Is o To-Be). */
export interface VistaProceso {
  nodes: readonly Nodo[];
  edges: readonly Arista[];
}

/** Estado del proceso que leen el informe Word y la Ficha de Proceso. */
export interface EstadoExportable {
  meta: MetaProceso;
  ficha?: Ficha | null;
  nodes: readonly Nodo[];
  edges: readonly Arista[];
  _lanes?: CarrilesExportar | null;
  _raci?: MatrizRaci | null;
  _sipoc?: Sipoc | null;
  _simResults?: ResultadoSimulador | null;
  _kpiValues?: Record<string, ValorKpi> | null;
}

/** Estado que lee el PPTX: además, la vista activa y la instantánea de la otra (lámina As-Is vs To-Be). */
export interface EstadoPptx extends EstadoExportable {
  activeView: string;
  _views: { asis: VistaProceso | null; tobe: VistaProceso | null };
}
