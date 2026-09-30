import { describe, expect, it } from 'vitest';
import { FORMAS_POR_DEFECTO, type Arista, type Nodo } from '@processiq/dominio';
import {
  EJEC_MAX_CAJAS, asegurarRamasDeDecision, asignarCodigosActividad, calcularLayout, caminoRedondeado, corredoresDeRetorno,
  esConvergencia, inferirResponsables, insertarCompuertasConvergencia, medirCalidad, normalizarGeometria, proyectarNivel,
  rutaArista, segmentosDePath, segmentosSeCruzan
} from './index.js';

const n = (id: string, type: Nodo['type'], extra: Partial<Nodo> = {}): Nodo => ({
  id, type, x: 0, y: 0, w: FORMAS_POR_DEFECTO[type].w, h: FORMAS_POR_DEFECTO[type].h, label: id, ...extra
});
const e = (id: string, from: string, to: string, label = ''): Arista => ({ id, from, to, label });

// Inicio -> A (Ventas) -> decisión -> B (Crédito) -> Fin, con reproceso B -> A
function proceso() {
  const nodes = [
    n('s', 'start'), n('a', 'task', { owner: 'Ventas', executionType: 'system' }),
    n('d', 'decision', { owner: 'Ventas' }), n('b', 'task', { owner: 'Crédito', executionType: 'manual' }),
    n('f', 'end')
  ];
  const edges = [e('e1', 's', 'a'), e('e2', 'a', 'd'), e('e3', 'd', 'b'), e('e4', 'b', 'f'), e('e5', 'b', 'a', 'Reproceso')];
  return { nodes, edges };
}

describe('operaciones sobre el grafo', () => {
  it('una decisión con una salida recibe la rama "No" a un fin nuevo en su carril', () => {
    const { nodes, edges } = proceso();
    const sig = asegurarRamasDeDecision(nodes, edges, 10);
    expect(sig).toBe(12);
    expect(edges.find((x) => x.id === 'e3')!.label).toBe('Sí');
    expect(nodes.at(-1)).toMatchObject({ id: 'n10', type: 'end', label: 'Caso no procede', owner: 'Ventas', _autoGen: true });
    expect(edges.at(-1)).toEqual({ id: 'e11', from: 'd', to: 'n10', label: 'No' });
  });

  it('una compuerta de convergencia (varias entradas, una salida) no es una decisión: ni rama "No" ni rótulo (D11)', () => {
    const nodes = [n('a', 'task'), n('b', 'task'), n('m', 'decision', { gatewayType: 'exclusive' }), n('z', 'task')];
    const edges = [e('1', 'a', 'm'), e('2', 'b', 'm'), e('3', 'm', 'z')];
    expect(esConvergencia(nodes[2]!, edges)).toBe(true);
    expect(asegurarRamasDeDecision(nodes, edges, 10)).toBe(10);
    expect(nodes).toHaveLength(4);
    expect(edges.map((x) => x.label)).toEqual(['', '', '']);
  });

  it('la que marcó insertarCompuertasConvergencia (_merge) tampoco, aunque le quede una sola entrada', () => {
    const nodes = [n('a', 'task'), n('m', 'decision', { _merge: true }), n('z', 'task')];
    const edges = [e('1', 'a', 'm'), e('2', 'm', 'z')];
    expect(asegurarRamasDeDecision(nodes, edges, 10)).toBe(10);
    expect(nodes.some((x) => x.label === 'Caso no procede')).toBe(false);
    // Sin la marca, con una entrada y una salida, sigue siendo una decisión a medias
    delete nodes[1]!._merge;
    expect(esConvergencia(nodes[1]!, edges)).toBe(false);
    expect(asegurarRamasDeDecision(nodes, edges, 10)).toBe(12);
    expect(nodes.at(-1)).toMatchObject({ label: 'Caso no procede', _autoGen: true });
  });

  it('una convergencia con dos salidas se rotula Sí/No como cualquier decisión', () => {
    const nodes = [n('a', 'task'), n('b', 'task'), n('m', 'decision'), n('y', 'task'), n('z', 'task')];
    const edges = [e('1', 'a', 'm'), e('2', 'b', 'm'), e('3', 'm', 'y'), e('4', 'm', 'z')];
    expect(esConvergencia(nodes[2]!, edges)).toBe(false);
    expect(asegurarRamasDeDecision(nodes, edges, 10)).toBe(10);
    expect(edges.slice(2).map((x) => x.label)).toEqual(['Sí', 'No']);
  });

  it('«Insertar compuertas de convergencia» y después el auto-layout: sin fines «Caso no procede»', () => {
    const nodes = [n('s', 'start'), n('d', 'decision'), n('x', 'task'), n('y', 'task'), n('z', 'task'), n('f', 'end')];
    const edges = [e('1', 's', 'd'), e('2', 'd', 'x', 'Sí'), e('3', 'd', 'y', 'No'), e('4', 'x', 'z'), e('5', 'y', 'z'), e('6', 'z', 'f')];
    const r = insertarCompuertasConvergencia(nodes, edges, 50);
    expect(r.insertadas).toBe(1);
    expect(asegurarRamasDeDecision(nodes, edges, r.siguienteId)).toBe(r.siguienteId);
    expect(nodes.filter((x) => x.label === 'Caso no procede')).toEqual([]);
    expect(edges.find((x) => x.from === 'n50')).toEqual({ id: 'e51', from: 'n50', to: 'z', label: '' });
  });

  it('las compuertas paralelas no reciben ramas Sí/No', () => {
    const nodes = [n('d', 'decision', { gatewayType: 'parallel' }), n('x', 'task')];
    const edges = [e('e', 'd', 'x')];
    expect(asegurarRamasDeDecision(nodes, edges, 1)).toBe(1);
    expect(edges[0]!.label).toBe('');
  });

  it('infiere responsables por vecindad y marca los inferidos', () => {
    const { nodes, edges } = proceso();
    const m = inferirResponsables(nodes, edges);
    expect(m).toEqual({ s: 'Ventas', a: 'Ventas', d: 'Ventas', b: 'Crédito', f: 'Crédito' });
    expect(nodes.filter((x) => x._inferredOwner).map((x) => x.id)).toEqual(['s', 'f']);
  });

  it('códigos de actividad por prefijo y rank, respetando los existentes', () => {
    const nodes = [n('b', 'task', { executionType: 'manual' }), n('a', 'task', { executionType: 'manual', activityCode: 'MAN-07' }),
                   n('c', 'system', { executionType: 'system' })];
    asignarCodigosActividad(nodes, { a: 0, b: 1, c: 2 });
    expect(nodes.map((x) => x.activityCode)).toEqual(['MAN-08', 'MAN-07', 'USR-01']);
  });

  it('inserta una compuerta de cierre donde convergen ramas de una decisión', () => {
    const nodes = [n('d', 'decision'), n('x', 'task'), n('y', 'task'), n('z', 'task')];
    const edges = [e('1', 'd', 'x'), e('2', 'd', 'y'), e('3', 'x', 'z'), e('4', 'y', 'z')];
    const r = insertarCompuertasConvergencia(nodes, edges, 50);
    expect(r).toEqual({ insertadas: 1, siguienteId: 52 });
    expect(edges.filter((x) => x.to === 'n50').map((x) => x.from)).toEqual(['x', 'y']);
    expect(edges.at(-1)).toEqual({ id: 'e51', from: 'n50', to: 'z', label: '' });
  });
});

describe('layout', () => {
  it('ranks sin inflar por el reproceso, un carril por responsable y posiciones finitas', () => {
    const { nodes, edges } = proceso();
    const L = calcularLayout(nodes, edges, { ownerMap: inferirResponsables(nodes, edges), wrap: false });
    expect(L.ranks).toEqual({ s: 0, a: 1, d: 2, b: 3, f: 4 });
    expect(L.list).toEqual(['Ventas', 'Crédito']);
    expect(nodes.every((x) => isFinite(x.x) && isFinite(x.y))).toBe(true);
    // x crece con el rank; Crédito va por debajo de Ventas
    expect(nodes.map((x) => x.x)).toEqual([...nodes.map((x) => x.x)].sort((p, q) => p - q));
    expect(nodes.find((x) => x.id === 'b')!.y).toBeGreaterThan(nodes.find((x) => x.id === 'a')!.y);
  });

  it('las cajas apiladas en la misma columna y carril no se solapan', () => {
    const nodes = [n('s', 'start', { owner: 'R' }), n('a', 'task', { owner: 'R' }), n('b', 'task', { owner: 'R' }), n('c', 'task', { owner: 'R' })];
    const edges = [e('1', 's', 'a'), e('2', 's', 'b'), e('3', 's', 'c')];
    const L = calcularLayout(nodes, edges, { ownerMap: inferirResponsables(nodes, edges), wrap: false });
    const pila = nodes.slice(1).sort((p, q) => p.y - q.y);
    for (let i = 1; i < pila.length; i++) expect(pila[i]!.y).toBeGreaterThanOrEqual(pila[i - 1]!.y + pila[i - 1]!.h);
    expect(L.laneHs[0]).toBeGreaterThan(170);
  });

  it('normalizarGeometria repara tamaños y posiciones no finitos', () => {
    const x = { ...n('a', 'task'), w: NaN, h: 0, x: Infinity };
    normalizarGeometria([x]);
    expect([x.w, x.h, x.x]).toEqual([158, 76, 0]);
  });
});

describe('ruteo y calidad', () => {
  const nodes = [
    { ...n('a', 'task'), x: 0, y: 0 }, { ...n('b', 'task'), x: 300, y: 0 }, { ...n('c', 'task'), x: 300, y: 200 }
  ];
  const ctx = { nodes, lanes: null, corredores: () => ({}), canales: null };

  it('misma altura: recta de borde a borde', () => {
    expect(rutaArista(nodes[0]!, nodes[1]!, undefined, ctx)).toBe('M 158 38 L 300 38');
  });

  it('distinta altura: codo redondeado en el hueco entre columnas', () => {
    const d = rutaArista(nodes[0]!, nodes[2]!, undefined, ctx);
    expect(d.startsWith('M 158 38 L')).toBe(true);
    expect(d).toContain('Q 229 38');
    expect(segmentosDePath(d).at(-1)![1]).toEqual({ x: 300, y: 238 });
  });

  it('retornos por un corredor bajo la banda, los más cortos más cerca', () => {
    const ns = [{ ...n('a', 'task'), x: 0 }, { ...n('b', 'task'), x: 300 }, { ...n('c', 'task'), x: 600 }];
    const c = corredoresDeRetorno(ns, [e('largo', 'c', 'a'), e('corto', 'c', 'b')]);
    expect(c).toEqual({ corto: 76 + 26, largo: 76 + 26 + 16 });
  });

  it('camino redondeado y cruces ortogonales', () => {
    expect(caminoRedondeado([{ x: 0, y: 0 }, { x: 10, y: 0 }], 10)).toBe('M 0 0 L 10 0');
    expect(segmentosSeCruzan([{ x: 0, y: 5 }, { x: 10, y: 5 }], [{ x: 5, y: 0 }, { x: 5, y: 10 }])).toBe(true);
    expect(segmentosSeCruzan([{ x: 0, y: 5 }, { x: 10, y: 5 }], [{ x: 0, y: 6 }, { x: 10, y: 6 }])).toBe(false);
  });

  it('calidad: cuenta flechas que pisan cajas', () => {
    const ns = [{ ...n('a', 'task'), x: 0 }, { ...n('m', 'task'), x: 200 }, { ...n('b', 'task'), x: 400 }];
    const q = medirCalidad(ns, [e('1', 'a', 'b')], (a, b) => `M ${a.x + a.w} 38 L ${b.x} 38`);
    expect(q.sobreCajas).toBe(1);
    expect(q.cruces).toBe(0);
    expect(q.ancho).toBe(558);
  });
});

describe('niveles de detalle', () => {
  const carrilDe = (x: Nodo) => x.owner || 'Sin asignar';

  it('nivel 3 devuelve copias exactas', () => {
    const full = proceso();
    const p = proyectarNivel(full, 3, { carrilDe, macroproceso: 'O2C' });
    expect(p.nodes).toEqual(full.nodes);
    expect(p.nodes[0]).not.toBe(full.nodes[0]);
  });

  it('nivel 2 agrupa tareas consecutivas del mismo carril', () => {
    const nodes = [n('s', 'start'), n('a', 'task', { owner: 'R' }), n('b', 'task', { owner: 'R' }), n('f', 'end')];
    const edges = [e('1', 's', 'a'), e('2', 'a', 'b'), e('3', 'b', 'f')];
    const p = proyectarNivel({ nodes, edges }, 2, { carrilDe, macroproceso: 'O2C' });
    expect(p.nodes.map((x) => x.id)).toEqual(['s', 'grp_a', 'f']);
    expect(p.nodes[1]).toMatchObject({ label: '2 pasos · R', marker: 'subprocess', _hijos: ['a', 'b'] });
    expect(p.edges.map((x) => [x.id, x.from, x.to])).toEqual([['v_1', 's', 'grp_a'], ['v_3', 'grp_a', 'f']]);
  });

  it('con jerarquía de la IA, los hijos se funden en su padre visible', () => {
    const nodes = [n('s', 'start', { nivel: 1 }), n('a', 'task', { nivel: 2 }), n('a1', 'task', { nivel: 3, padre: 'a' }), n('f', 'end', { nivel: 1 })];
    const edges = [e('1', 's', 'a1'), e('2', 'a1', 'f')];
    const p = proyectarNivel({ nodes, edges }, 2, { carrilDe, macroproceso: 'O2C' });
    expect(p.nodes.map((x) => x.id)).toEqual(['s', 'a', 'f']);
    expect(p.edges.map((x) => [x.from, x.to])).toEqual([['s', 'a'], ['a', 'f']]);
  });

  it('nivel 1 va en un solo carril, el del macroproceso', () => {
    const p = proyectarNivel(proceso(), 1, { carrilDe, macroproceso: 'O2C' });
    expect(new Set(p.nodes.map((x) => x.owner))).toEqual(new Set(['O2C']));
  });

  // Como un BPMN importado con subprocesos: 14 pasos en el nivel superior (nivel 1),
  // dos de ellos subprocesos con su contenido (nivel 3, padre = el subproceso).
  function importadoLargo() {
    const nodes: Nodo[] = [n('s', 'start', { nivel: 1, owner: 'A' })];
    const edges: Arista[] = [];
    let prev = 's';
    for (let i = 1; i <= 14; i++) {
      const id = 't' + i;
      nodes.push(n(id, 'task', { nivel: 1, owner: i % 2 ? 'A' : 'B', ...(i === 4 || i === 9 ? { marker: 'subprocess' } : {}) }));
      edges.push(e('e' + id, prev, id));
      prev = id;
      if (i === 4 || i === 9) {
        // Contenido del subproceso: la caja enlaza con lo primero de dentro
        for (const k of ['a', 'b']) {
          nodes.push(n(id + k, 'task', { nivel: 3, padre: id, owner: 'B' }));
          edges.push(e('e' + id + k, prev, id + k));
          prev = id + k;
        }
      }
    }
    nodes.push(n('f', 'end', { nivel: 1, owner: 'A' }));
    edges.push(e('ef', prev, 'f'));
    return { nodes, edges };
  }

  it('con jerarquía explícita, el Ejecutivo también tiene el techo de 10 cajas (D12)', () => {
    const full = importadoLargo();
    // Actividad: la jerarquía explícita tal cual (sin techo): 14 pasos + inicio y fin
    expect(proyectarNivel(full, 2, { carrilDe, macroproceso: 'O2C' }).nodes).toHaveLength(16);
    const p = proyectarNivel(full, 1, { carrilDe, macroproceso: 'O2C' });
    expect(p.nodes.length).toBeLessThanOrEqual(EJEC_MAX_CAJAS);
    expect(p.nodes.length).toBeGreaterThanOrEqual(5);           // al menos 3 etapas, más inicio y fin
    expect(p.nodes[0]!.id).toBe('s');
    expect(p.nodes.at(-1)!.id).toBe('f');
    expect(new Set(p.nodes.map((x) => x.owner))).toEqual(new Set(['O2C']));
    // Etapas como las deducidas: subproceso con el nombre del primer paso
    const etapas = p.nodes.filter((x) => String(x.id).startsWith('eta_'));
    expect(etapas.length).toBeGreaterThan(0);
    expect(etapas[0]).toMatchObject({ id: 'eta_t1', label: 't1 (+1 pasos)', marker: 'subprocess', _hijos: ['t1', 't2'] });
    // Un flujo continuo de inicio a fin, sin aristas colgando
    const ids = new Set(p.nodes.map((x) => x.id));
    expect(p.edges.every((x) => ids.has(x.from) && ids.has(x.to))).toBe(true);
    let cur = 's', pasos = 0;
    while (cur !== 'f' && pasos++ < 20) cur = p.edges.find((x) => x.from === cur)!.to;
    expect(cur).toBe('f');
    // El modelo no se toca y el Detalle vuelve entero
    expect(full.nodes).toHaveLength(20);
    expect(proyectarNivel(full, 3, { carrilDe, macroproceso: 'O2C' }).nodes).toEqual(full.nodes);
  });

  it('con jerarquía explícita y 10 cajas o menos, el Ejecutivo es el de siempre', () => {
    const nodes = [n('s', 'start', { nivel: 1 }), n('a', 'task', { nivel: 1 }), n('a1', 'task', { nivel: 3, padre: 'a' }),
                   n('b', 'task', { nivel: 1 }), n('f', 'end', { nivel: 1 })];
    const edges = [e('1', 's', 'a'), e('2', 'a', 'a1'), e('3', 'a1', 'b'), e('4', 'b', 'f')];
    const p = proyectarNivel({ nodes, edges }, 1, { carrilDe, macroproceso: 'O2C' });
    expect(p.nodes.map((x) => x.id)).toEqual(['s', 'a', 'b', 'f']);
    expect(p.edges.map((x) => [x.id, x.from, x.to])).toEqual([['v_1', 's', 'a'], ['v_3', 'a', 'b'], ['v_4', 'b', 'f']]);
  });
});
