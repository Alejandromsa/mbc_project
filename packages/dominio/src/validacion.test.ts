import { describe, expect, it } from 'vitest';
import { validarProceso, type Arista, type Nodo } from './index.js';

const n = (id: string, type: Nodo['type'], label: string, extra: Partial<Nodo> = {}): Nodo =>
  ({ id, type, x: 0, y: 0, w: 10, h: 10, label, ...extra });
const e = (from: string, to: string, label = ''): Arista => ({ id: `e-${from}-${to}`, from, to, label });

const titulos = (nodes: Nodo[], edges: Arista[]) => validarProceso(nodes, edges).map((h) => h.title);

describe('validarProceso', () => {
  it('un proceso vacío no tiene hallazgos', () => {
    expect(validarProceso([], [])).toEqual([]);
  });

  it('un proceso bien formado solo avisa lo que corresponde', () => {
    const nodes = [
      n('s', 'start', 'Solicitud recibida'),
      n('a', 'task', 'Registrar solicitud', { owner: 'Ejecutivo', executionType: 'system' }),
      n('d', 'decision', '¿Aprobada?'),
      n('b', 'task', 'Desembolsar crédito', { owner: 'Operaciones', executionType: 'manual' }),
      n('f1', 'end', 'Crédito desembolsado'),
      n('f2', 'end', 'Solicitud rechazada')
    ];
    const edges = [e('s', 'a'), e('a', 'd'), e('d', 'b', 'Sí'), e('d', 'f2', 'No'), e('b', 'f1')];
    expect(validarProceso(nodes, edges)).toEqual([]);
  });

  it('detecta inicio, fin, etiquetas, verbos, responsables y conexiones', () => {
    const nodes = [
      n('a', 'task', 'Gestionar el caso'),                                         // prohibido, sin owner/exec, sin entrada
      n('b', 'task', 'Mirar algo muy largo que describe demasiadas cosas a la vez', { owner: 'X', executionType: 'manual', time: '130' }),
      n('c', 'task', 'Calcular monto', { owner: 'Ana', executionType: 'automatic' }),
      n('d', 'decision', 'Aprobado'),
      n('f', 'end', 'Fin')
    ];
    const edges = [e('a', 'b'), e('b', 'c'), e('c', 'd'), e('d', 'f'), e('d', 'a'), e('d', 'b')];
    const t = titulos(nodes, edges);
    expect(t).toContain('Falta evento Start');
    expect(t).toContain('End event genérico');
    expect(t).toContain('Verbo prohibido: "gestionar"');
    expect(t).toContain('Verbo fuera de catálogo: "mirar"');
    expect(t).toContain('Etiqueta demasiado larga');
    expect(t).toContain('Actividad sin responsable');
    expect(t).toContain('Actividad sin tipo de ejecución');
    expect(t).toContain('Actividad manual >120 min');
    expect(t).toContain('Automático con responsable humano');
    expect(t).toContain('Gateway sin pregunta');
    expect(t).toContain('Gateway con 3 salida(s) sin etiquetar');
    expect(t).not.toContain('Falta evento End');
  });

  it('marca nodos huérfanos y procesos muy simples', () => {
    const t = titulos([n('s', 'start', 'Inicio'), n('x', 'task', 'Revisar', { owner: 'A', executionType: 'manual' })], []);
    expect(t).toContain('Nodo sin salida');
    expect(t).toContain('Nodo sin entrada');
    expect(t).toContain('Proceso muy simple');
  });

  it('el hallazgo apunta al nodo afectado', () => {
    const h = validarProceso([n('s', 'start', 'Inicio'), n('f', 'end', 'Fin')], [e('s', 'f')]);
    expect(h.find((x) => x.title === 'End event genérico')?.target).toBe('f');
  });
});
