import { describe, expect, it } from 'vitest';
import { FORMAS_POR_DEFECTO, fichaVacia, type Arista, type Nodo } from '@processiq/dominio';
import {
  TEMAS_PPTX, anclarConectoresEnXml, computeDeltas, construirInformeWord, cuerpoFicha, derivarFicha,
  documentoFicha, painImplication
} from './index.js';

const n = (id: string, type: Nodo['type'], label: string, extra: Partial<Nodo> = {}): Nodo =>
  ({ id, type, x: 0, y: 0, w: FORMAS_POR_DEFECTO[type].w, h: FORMAS_POR_DEFECTO[type].h, label, ...extra });
const e = (id: string, from: string, to: string, label = ''): Arista => ({ id, from, to, label });

function estado() {
  return {
    meta: { name: 'Reclamos', industry: 'Banca', macroprocess: 'Servicio', client: '', owner: '' },
    ficha: { ...fichaVacia(), code: 'PR-01', objetivo: 'Resolver reclamos en 48 h' },
    nodes: [
      n('n1', 'start', 'Reclamo recibido', { owner: 'Cliente' }),
      n('n2', 'task', 'Registrar reclamo', { owner: 'Asesor', system: 'CRM', executionType: 'system', activityCode: 'USR-01',
        pains: [{ id: 'p1', category: 'handoff', description: 'Pérdida de contexto', severity: 5, frequency: 4 }] }),
      n('n3', 'decision', '¿Procede?', { owner: 'Asesor' }),
      n('n4', 'task', 'Abonar monto', { owner: 'Tesorería', system: 'Core', executionType: 'automatic', activityCode: 'SRV-01' }),
      n('n5', 'end', 'Reclamo resuelto', { owner: 'Cliente' }),
      n('n6', 'end', 'Reclamo rechazado', { owner: 'Asesor' })
    ],
    edges: [e('e1', 'n1', 'n2'), e('e2', 'n2', 'n3'), e('e3', 'n3', 'n4', 'Sí'), e('e4', 'n3', 'n6', 'No'), e('e5', 'n4', 'n5')],
    _lanes: { list: ['Cliente', 'Asesor', 'Tesorería'], laneOf: { n1: 'Cliente', n2: 'Asesor', n3: 'Asesor', n4: 'Tesorería', n5: 'Cliente', n6: 'Asesor' } },
    _kpiValues: {}, _raci: null, _sipoc: null, _simResults: null
  };
}

describe('Ficha de Proceso', () => {
  it('numera las actividades en orden de flujo y deriva el ruteo desde las compuertas', () => {
    const d = derivarFicha(estado());
    expect(d.f.code).toBe('PR-01');
    const html = cuerpoFicha(estado(), { embedDiagram: false });
    expect(html).toContain('Registrar reclamo');
    expect(html).toContain('Abonar monto');
    expect(html.indexOf('Registrar reclamo')).toBeLessThan(html.indexOf('Abonar monto'));
    expect(html).toContain('CRM');
  });

  it('el diagrama solo se pide si hay que incrustarlo', () => {
    let pedidas = 0;
    const svg = () => { pedidas++; return '<svg id="diag"></svg>'; };
    cuerpoFicha(estado(), { embedDiagram: false, svgDiagrama: svg });
    expect(pedidas).toBe(0);
    expect(documentoFicha(estado(), svg)).toContain('<svg id="diag"></svg>');
    expect(pedidas).toBe(1);
  });
});

describe('informe Word', () => {
  it('HTML completo con actividades, pains y el pie de MBC', () => {
    const html = construirInformeWord(estado());
    expect(html.startsWith('<!DOCTYPE html>') || html.startsWith('<html')).toBe(true);
    expect(html).toContain('Registrar reclamo');
    expect(html).toContain('Pérdida de contexto');
    expect(html).toContain('Generado con ProcessIQ · MBC Business Consulting');
  });
});

describe('PPTX', () => {
  it('hay temas mbc y bbva', () => {
    expect(Object.keys(TEMAS_PPTX)).toEqual(expect.arrayContaining(['mbc', 'bbva']));
  });

  it('convierte las líneas "Flujo|…" en conectores anclados a las formas', () => {
    const forma = (id: number, nombre: string, prst: string) =>
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${nombre}"/></p:nvSpPr><p:spPr><a:prstGeom prst="${prst}"/></p:spPr></p:sp>`;
    const linea = `<p:sp><p:nvSpPr><p:cNvPr id="9" name="Flujo|n1|n2|right|left|35000"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1" y="2"/></a:xfrm><a:ln w="6350"></a:ln></p:spPr></p:sp>`;
    const xml = forma(4, 'Inicio', 'ellipse') + forma(5, 'Tarea A', 'roundRect') + linea;
    const r = anclarConectoresEnXml(xml, { n1: 'Inicio', n2: 'Tarea A' });
    expect(r.n).toBe(1);
    expect(r.xml).toContain('<a:stCxn id="4" idx="6"/><a:endCxn id="5" idx="1"/>');
    expect(r.xml).toContain('<a:gd name="adj1" fmla="val 35000"/>');
    expect(r.xml).toContain('name="Flujo Inicio → Tarea A"');
  });

  it('una línea cuyo nodo no existe se deja como está', () => {
    const linea = '<p:sp><p:nvSpPr><p:cNvPr id="9" name="Flujo|x|y|right|left"/></p:nvSpPr></p:sp>';
    expect(anclarConectoresEnXml(linea, {})).toEqual({ xml: linea, n: 0 });
  });

  it('deltas As-Is vs To-Be e implicación de un pain', () => {
    const asis = { nodes: [n('a', 'task', 'Revisar'), n('b', 'task', 'Firmar')], edges: [] };
    const tobe = { nodes: [n('a', 'task', 'Revisar'), n('c', 'task', 'Aprobar en línea')], edges: [] };
    expect(computeDeltas(asis, tobe)).toMatchObject({ removed: 1, added: 1 });
    expect(typeof painImplication({ category: 'handoff', severity: 5, frequency: 4 })).toBe('string');
  });
});
