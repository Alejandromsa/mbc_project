// Simulador de carga: FTE, lead time, costo y ahorro.
// Portado del MVP 3.8.9 (runSimulation y computeSimOn) con el mismo orden de
// operaciones: los redondeos se ven en el panel, el PPTX y el informe.
import type { Nodo } from '@processiq/dominio';

export interface ParametrosCosto {
  /** Costo mensual de un FTE (S/). */
  costoFte: number;
  /** Horas productivas por FTE al mes. */
  horasMes: number;
}

const esActividad = (n: Pick<Nodo, 'type'>) => n.type === 'task' || n.type === 'system';
const num = (s: unknown) => parseFloat(s as string) || 0;

/** Resultado del panel Simulador (se guarda en el proyecto y lo usa el PPTX). */
export interface ResultadoSimulacion {
  fteCurrent: number;
  fteToBe: number;
  monthlyCost: number;
  monthlySavings: number;
  annualSavings: number;
  leadTimeChain: number;
  activitiesWithData: number;
}

export interface SimulacionDetallada {
  resultado: ResultadoSimulacion;
  /** Σ tiempo × volumen mensual, en minutos. */
  totalMinutes: number;
  totalVolume: number;
}

/**
 * Carga del proceso: Σ tiempo × volumen de las actividades con ambos datos.
 * El lead time es la suma lineal de tiempos (aproximación del MVP).
 * @param reduccion fracción 0..1 que se espera reducir en el To-Be
 */
export function simularCarga(nodes: readonly Nodo[], p: ParametrosCosto & { reduccion: number }): SimulacionDetallada {
  const minPerMonth = p.horasMes * 60;
  let totalMinutes = 0, leadTimeChain = 0, activitiesWithData = 0, totalVolume = 0;
  nodes.forEach((n) => {
    if (esActividad(n)) {
      const t = num(n.time);
      const v = num(n.volume);
      if (t > 0 && v > 0) { activitiesWithData++; totalMinutes += t * v; totalVolume += v; }
      leadTimeChain += t;
    }
  });
  const fteCurrent = totalMinutes / minPerMonth;
  const monthlyCost = fteCurrent * p.costoFte;
  const fteToBe = fteCurrent * (1 - p.reduccion);
  const monthlySavings = (fteCurrent - fteToBe) * p.costoFte;
  const annualSavings = monthlySavings * 12;
  return {
    resultado: { fteCurrent, fteToBe, monthlyCost, monthlySavings, annualSavings, leadTimeChain, activitiesWithData },
    totalMinutes, totalVolume
  };
}

export interface Escenario {
  fte: number;
  fteToBe: number;
  leadTime: number;
  withData: number;
  monthlyCost: number;
  annualSavings: number;
}

/** Simulación compacta sobre un conjunto de nodos (comparador What-If). */
export function simularEscenario(nodes: readonly Pick<Nodo, 'type' | 'time' | 'volume'>[], reduccionPct: number, p: ParametrosCosto): Escenario {
  const minPerMonth = p.horasMes * 60;
  let totalMin = 0, leadTime = 0, withData = 0;
  nodes.forEach((n) => {
    if (esActividad(n)) {
      const t = num(n.time), v = num(n.volume);
      if (t > 0 && v > 0) { withData++; totalMin += t * v; }
      leadTime += t;
    }
  });
  const fte = totalMin / minPerMonth;
  const fteToBe = fte * (1 - (reduccionPct || 0) / 100);
  return {
    fte, fteToBe, leadTime, withData,
    monthlyCost: fte * p.costoFte,
    annualSavings: (fte - fteToBe) * p.costoFte * 12
  };
}
