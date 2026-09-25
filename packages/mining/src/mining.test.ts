import { describe, expect, it } from 'vitest';
import { EVENT_LOG_MUESTRA, adivinarMapeo, descubrirProceso, parseCsv, parseCsvLine } from './index.js';

describe('CSV', () => {
  it('respeta comillas, comillas escapadas y separadores entre comillas', () => {
    expect(parseCsvLine('a,"b,c","d ""e""",', ',')).toEqual(['a', 'b,c', 'd "e"', '']);
  });

  it('detecta tabulador solo si no hay comas', () => {
    expect(parseCsv('x\ty\n1\t2').rows).toEqual([{ x: '1', y: '2' }]);
    expect(parseCsv('x,y\n"1\t",2').rows).toEqual([{ x: '1', y: '2' }]);
  });

  it('ignora líneas vacías y rellena celdas faltantes', () => {
    expect(parseCsv('a,b\n\n1\n').rows).toEqual([{ a: '1', b: '' }]);
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });

  it('propone el mapeo de columnas por nombre', () => {
    expect(adivinarMapeo(['case_id', 'activity', 'timestamp', 'resource']))
      .toEqual({ case: 'case_id', act: 'activity', ts: 'timestamp', res: 'resource' });
    expect(adivinarMapeo(['caso', 'paso', 'fecha']).res).toBe('');
  });
});

describe('descubrirProceso con la muestra', () => {
  const tabla = parseCsv(EVENT_LOG_MUESTRA);
  const r = descubrirProceso(tabla, adivinarMapeo(tabla.headers), { siguienteId: 1 });

  it('cuenta casos, actividades y variantes', () => {
    expect(r.totalCasos).toBe(15);
    expect(r.actividades).toBe(8);
    expect(r.variantes.map((v) => [v.count, v.pct])).toEqual([[8, 53], [3, 20], [2, 13], [2, 13]]);
    expect(r.topInicio).toBe('Recibir solicitud');
    expect(r.topFin).toBe('Notificar cliente');
  });

  it('crea Inicio, una tarea por actividad y Fin, con ids en el orden del MVP', () => {
    expect(r.nodos[0]).toMatchObject({ id: 'n1', type: 'start', label: 'Inicio' });
    expect(r.nodos.at(-1)).toMatchObject({ id: 'n2', type: 'end', label: 'Fin' });
    expect(r.nodos.slice(1, -1).map((n) => n.id)).toEqual(['n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10']);
    // "Procesar en core" contiene "core": forma de sistema
    expect(r.nodos.find((n) => n.label === 'Procesar en core')?.type).toBe('system');
    expect(r.nodos.find((n) => n.label === 'Validar datos')).toMatchObject({ owner: 'Analista', volume: '17' });
  });

  it('marca las frecuencias en las aristas y filtra el ruido', () => {
    const inicio = r.aristas.filter((a) => a.from === 'n1');
    expect(inicio.map((a) => a.label)).toEqual(['15 cases']);
    expect(r.aristas.every((a) => a.id.startsWith('e'))).toBe(true);
    expect(r.siguienteId).toBe(11 + r.aristas.length);
  });

  it('un log sin transiciones lanza, como el MVP', () => {
    const t = parseCsv('case_id,activity,timestamp\n1,A,2026-01-01');
    expect(() => descubrirProceso(t, adivinarMapeo(t.headers), { siguienteId: 1 })).toThrow();
  });
});
