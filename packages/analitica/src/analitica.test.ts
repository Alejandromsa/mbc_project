import { describe, expect, it } from 'vitest';
import type { Arista, Nodo } from '@processiq/dominio';
import {
  backlogCsv, compararWhatIf, cuelloDeBotella, generarBacklog, mapaDeValor,
  oportunidadesAutomatizacion, posicionImpactoEsfuerzo, simularCarga, simularEscenario
} from './index.js';

const n = (id: string, type: Nodo['type'], label: string, extra: Partial<Nodo> = {}): Nodo =>
  ({ id, type, x: 0, y: 0, w: 10, h: 10, label, ...extra });
const e = (from: string, to: string): Arista => ({ id: `${from}-${to}`, from, to, label: '' });
const costo = { costoFte: 5000, horasMes: 160 };

const nodes: Nodo[] = [
  n('s', 'start', 'Inicio'),
  n('a', 'task', 'Registrar solicitud', { time: '10', volume: '960', executionType: 'manual', va: 'BVA', owner: 'Ejecutivo',
    pains: [{ id: 'p1', category: 'handoff', description: 'Traspaso lento', severity: 4, frequency: 4 }] }),
  n('b', 'task', 'Evaluar riesgo', { time: '30', volume: '480', executionType: 'manual', va: 'VA', owner: 'Analista' }),
  n('c', 'system', 'Notificar cliente', { time: '5', volume: '960', executionType: 'automatic', va: 'NVA' }),
  n('f', 'end', 'Fin')
];
const edges = [e('s', 'a'), e('a', 'b'), e('b', 'c'), e('c', 'f'), e('a', 'c')];

describe('simulación', () => {
  it('calcula FTE, costo y ahorro', () => {
    const { resultado, totalMinutes } = simularCarga(nodes, { ...costo, reduccion: 0.25 });
    // 10×960 + 30×480 + 5×960 = 28 800 min/mes; 160 h = 9 600 min por FTE
    expect(totalMinutes).toBe(28800);
    expect(resultado.fteCurrent).toBe(3);
    expect(resultado.monthlyCost).toBe(15000);
    expect(resultado.fteToBe).toBe(2.25);
    expect(resultado.annualSavings).toBe(45000);
    expect(resultado.leadTimeChain).toBe(45);
    expect(resultado.activitiesWithData).toBe(3);
  });

  it('las claves del resultado van en el orden del MVP (se guardan en el proyecto)', () => {
    expect(Object.keys(simularCarga(nodes, { ...costo, reduccion: 0 }).resultado))
      .toEqual(['fteCurrent', 'fteToBe', 'monthlyCost', 'monthlySavings', 'annualSavings', 'leadTimeChain', 'activitiesWithData']);
  });

  it('simularEscenario aplica la reducción en porcentaje', () => {
    const r = simularEscenario(nodes, 50, costo);
    expect(r.fte).toBe(3);
    expect(r.fteToBe).toBe(1.5);
  });
});

describe('diagnóstico', () => {
  it('cuello de botella por carga y ruta crítica por tiempo', () => {
    const r = cuelloDeBotella(nodes, edges)!;
    expect(r.cuello.n.id).toBe('b');             // 30 × 480 = 14 400
    expect(r.porCarga.map((x) => x.n.id)).toEqual(['b', 'a', 'c']);
    // Como en el MVP, un nodo que no suma tiempo al final (el Fin) no se agrega (comparación estricta)
    expect(r.rutaCritica).toEqual({ t: 45, path: ['s', 'a', 'b', 'c'] });
  });

  it('sin tiempos ni volúmenes no hay cuello', () => {
    expect(cuelloDeBotella([n('s', 'start', 'I'), n('a', 'task', 'X')], [])).toBeNull();
  });

  it('automatización: excluye lo ya automático y ordena por ahorro', () => {
    const r = oportunidadesAutomatizacion(nodes, costo);
    expect(r.map((c) => [c.n.id, c.tech])).toEqual([['a', 'RPA'], ['b', 'IA / ML']]);
    expect(r[0]!.annualSaving).toBeCloseTo(0.9 * 9600 / 9600 * 5000 * 12);
  });

  it('mapa de valor reparte la carga por clasificación', () => {
    const m = mapaDeValor(nodes);
    expect([m.tVA, m.tBVA, m.tNVA, m.tNA]).toEqual([14400, 9600, 4800, 0]);
    expect(m.nvaCount).toBe(1);
  });

  it('posición en la matriz impacto-esfuerzo', () => {
    expect(posicionImpactoEsfuerzo({ severity: 5, frequency: 5, category: 'regulatory' })).toEqual({ impacto: 1, esfuerzo: 1 });
    expect(posicionImpactoEsfuerzo({ severity: 1, frequency: 5, category: 'desconocida' })).toEqual({ impacto: 0.2, esfuerzo: 0.6 });
  });
});

describe('backlog y What-If', () => {
  const kpis = { k1: { name: 'FCR', unit: '%', benchmark: '> 75%', value: '60', gap: '-15 pp', source: 'CRM' } };

  it('consolida pains, automatización y KPIs, priorizados por impacto/esfuerzo', () => {
    const b = generarBacklog(nodes, kpis, costo);
    expect(b.map((i) => i.fuente)).toEqual(['Pain', 'Automatización', 'KPI', 'Automatización']);
    expect(b.map((i) => i.prioridad)).toEqual([1, 2, 3, 4]);
    expect(b[0]).toMatchObject({ horizonte: '0-3m', beneficio: 'Alto', owner: 'Ejecutivo' });
  });

  it('CSV con BOM y comillas escapadas', () => {
    const csv = backlogCsv([{ fuente: 'Pain', iniciativa: 'Dice "hola"', actividad: 'x', impacto: 1, esfuerzo: 1, horizonte: '0-3m', owner: 'o', beneficio: 'b', prioridad: 1 }]);
    expect(csv.startsWith('﻿Prioridad,Fuente')).toBe(true);
    expect(csv).toContain('"Dice ""hola"""');
  });

  it('What-If no modifica los nodos originales', () => {
    const antes = JSON.stringify(nodes);
    const r = compararWhatIf(nodes, ['autom_manual', 'elim_handoff'], 10, costo);
    expect(JSON.stringify(nodes)).toBe(antes);
    expect(r.asis.fte).toBe(3);
    // "Registrar solicitud" pasa a RPA y "Notificar cliente" ya era automática:
    // en el To-Be solo cuenta "Evaluar riesgo" (14 400 min = 1,5 FTE)
    expect(r.tobe.fte).toBe(1.5);
    expect(r.tobe.fteToBe).toBeCloseTo(1.35);
    expect(r.tobe.leadTime).toBeCloseTo(45 * 0.8 * 0.9);
    expect(r.annual).toBeCloseTo((3 - 1.35) * 5000 * 12);
  });
});
