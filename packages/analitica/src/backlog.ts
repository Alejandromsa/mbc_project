// Backlog de iniciativas (F6) y comparador What-If (F1).
// Portado del MVP 3.8.9 sin cambios de cálculo ni de textos.
import type { Nodo, ValorKpi } from '@processiq/dominio';
import { ESFUERZO_POR_CATEGORIA } from './diagnostico.js';
import { simularEscenario, type Escenario, type ParametrosCosto } from './simulacion.js';

const num = (s: unknown) => parseFloat(s as string) || 0;

export interface Iniciativa {
  fuente: 'Pain' | 'Automatización' | 'KPI';
  iniciativa: string;
  actividad: string;
  impacto: number;
  esfuerzo: number;
  horizonte: '0-3m' | '3-9m' | '9-18m';
  owner: string;
  beneficio: string;
  prioridad?: number;
}

/** Consolida pains, automatización de tareas manuales y gaps de KPI; prioriza por impacto/esfuerzo. */
export function generarBacklog(nodes: readonly Nodo[], kpiValues: Readonly<Record<string, ValorKpi>> | null | undefined, p: ParametrosCosto): Iniciativa[] {
  const items: Iniciativa[] = [];
  const minPerMonth = p.horasMes * 60;

  // 1) Pains
  nodes.forEach((n) => (n.pains || []).forEach((pain) => {
    const impact = pain.severity * pain.frequency; // 1..25
    const effort = ESFUERZO_POR_CATEGORIA[pain.category] || 3; // 1..5
    items.push({
      fuente: 'Pain', iniciativa: `Resolver: ${pain.description}`, actividad: n.label,
      impacto: impact, esfuerzo: effort,
      horizonte: (impact >= 12 && effort <= 2) ? '0-3m' : (effort >= 4 ? '9-18m' : '3-9m'),
      owner: n.owner || 'Por asignar',
      beneficio: impact >= 16 ? 'Alto' : (impact >= 9 ? 'Medio' : 'Bajo')
    });
  }));

  // 2) Automatización de tareas manuales
  nodes.filter((n) => n.type === 'task' && n.executionType === 'manual').forEach((n) => {
    const lbl = (n.label || '').toLowerCase();
    let tech: string | null = null, autoPct = 0;
    if (/registr|ingres|carg|consolid|calcul/.test(lbl)) { tech = 'RPA'; autoPct = 0.9; }
    else if (/valid|verific|concili|comparar/.test(lbl)) { tech = 'RPA+reglas'; autoPct = 0.7; }
    else if (/escane|adjunt|clasific/.test(lbl)) { tech = 'IDP'; autoPct = 0.8; }
    else if (/evalu|analiz|scoring/.test(lbl)) { tech = 'IA'; autoPct = 0.5; }
    else if (/notific|enviar|correo/.test(lbl)) { tech = 'Workflow'; autoPct = 0.95; }
    if (!tech) return;
    const saved = num(n.time) * num(n.volume) * autoPct;
    const annual = (saved / minPerMonth) * p.costoFte * 12;
    items.push({
      fuente: 'Automatización', iniciativa: `Automatizar "${n.label}" con ${tech}`, actividad: n.label,
      impacto: Math.min(25, Math.round(annual / 5000)), esfuerzo: tech.startsWith('IA') ? 4 : (tech === 'IDP' ? 3 : 2),
      horizonte: tech.startsWith('IA') ? '9-18m' : '0-3m', owner: n.owner || 'TI / RPA',
      beneficio: annual ? annual.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) + '/año' : 'Medio'
    });
  });

  // 3) Gaps de KPI
  Object.values(kpiValues || {}).forEach((k) => {
    if (k.gap && k.gap !== '—') items.push({
      fuente: 'KPI', iniciativa: `Cerrar gap de ${k.name} (${k.value} vs ${k.benchmark})`, actividad: '—',
      impacto: 14, esfuerzo: 3, horizonte: '3-9m', owner: 'Dueño del KPI', beneficio: 'Gap: ' + k.gap
    });
  });

  items.sort((a, b) => (b.impacto / b.esfuerzo) - (a.impacto / a.esfuerzo));
  items.forEach((it, i) => it.prioridad = i + 1);
  return items;
}

/** CSV del backlog (con BOM para que Excel respete los acentos). */
export function backlogCsv(items: readonly Iniciativa[]): string {
  const head = ['Prioridad', 'Fuente', 'Iniciativa', 'Impacto', 'Esfuerzo', 'Horizonte', 'Owner', 'Beneficio'];
  const esc = (s: unknown) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const lines = [head.join(',')].concat(items.map((it) =>
    [it.prioridad, it.fuente, it.iniciativa, it.impacto, it.esfuerzo, it.horizonte, it.owner, it.beneficio].map(esc).join(',')));
  return '﻿' + lines.join('\n');
}

// ------------------------------------------------------------- What-If
export interface Palanca {
  label: string;
  /** Modifica la copia de los nodos (tipo de ejecución, volumen). */
  apply?: (nodes: Nodo[]) => void;
  /** Factor sobre el lead time. */
  factor?: number;
}

export const PALANCAS_WHATIF: Readonly<Record<string, Palanca>> = {
  autom_manual: { label: 'Automatizar tareas manuales rule-based', apply: (nodes) => nodes.forEach((n) => { if (n.type === 'task' && n.executionType === 'manual' && /registr|ingres|valid|calcul|consult|verific|notific/.test((n.label || '').toLowerCase())) { n.executionType = 'rpa'; } }) },
  elim_handoff: { label: 'Eliminar handoffs (−20% lead time)', factor: 0.8 },
  parallel: { label: 'Paralelizar pasos (−25% lead time)', factor: 0.75 },
  selfservice: { label: 'Self-service en captura (−40% tareas de captura)', apply: (nodes) => nodes.forEach((n) => { if (n.type === 'task' && /solicit|captur|ingres|registr|complet/.test((n.label || '').toLowerCase())) { n.executionType = 'automatic'; n.volume = String(Math.round((parseFloat(n.volume as string) || 0) * 0.6)); } }) }
};

export interface ComparacionWhatIf {
  asis: Escenario;
  tobe: Escenario;
  fteSaved: number;
  annual: number;
}

/** As-Is frente a un To-Be construido con las palancas elegidas (no toca los nodos recibidos). */
export function compararWhatIf(nodes: readonly Nodo[], levers: readonly string[], extraReduction: number, p: ParametrosCosto): ComparacionWhatIf {
  const asis = simularEscenario(nodes, 0, p);
  const clone: Nodo[] = JSON.parse(JSON.stringify(nodes));
  let leadFactor = 1;
  levers.forEach((k) => {
    const lever = PALANCAS_WHATIF[k]!;
    if (lever.apply) lever.apply(clone);
    if (lever.factor) leadFactor *= lever.factor;
  });
  // Las tareas que pasan a rpa/automatic dejan de consumir tiempo humano
  const tobe = simularEscenario(clone.map((n) => {
    if (n.executionType === 'rpa' || n.executionType === 'automatic') return { ...n, time: '0' };
    return n;
  }), extraReduction, p);
  tobe.leadTime = asis.leadTime * leadFactor * (1 - extraReduction / 100);
  const fteSaved = asis.fte - tobe.fteToBe;
  const annual = fteSaved * p.costoFte * 12;
  return { asis, tobe, fteSaved, annual };
}
