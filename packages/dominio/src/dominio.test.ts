import { describe, expect, it } from 'vitest';
import {
  EXECUTION_TYPES, FORMAS_POR_DEFECTO, INDUSTRIES, KPI_LIBRARY, PAIN_CATEGORIES,
  VERBS_ALLOWED, VERBS_FORBIDDEN, fichaVacia, normalizarFicha
} from './index.js';

describe('ficha', () => {
  it('fichaVacia crea arrays nuevos en cada llamada', () => {
    const a = fichaVacia(), b = fichaVacia();
    a.gobernanza.push({ rol: 'Dueño', cargo: '', nombre: '', fecha: '' });
    expect(b.gobernanza).toEqual([]);
  });

  it('normalizarFicha completa claves faltantes y respeta las presentes', () => {
    const f = normalizarFicha({ code: 'PR-01', objetivo: 'x' });
    expect(f.code).toBe('PR-01');
    expect(f.objetivo).toBe('x');
    expect(f.cambios).toEqual([]);
    expect(Object.keys(f).sort()).toEqual(Object.keys(fichaVacia()).sort());
  });

  it('normalizarFicha acepta null o undefined', () => {
    expect(normalizarFicha(null)).toEqual(fichaVacia());
    expect(normalizarFicha(undefined)).toEqual(fichaVacia());
  });
});

describe('catálogos', () => {
  const unicos = (xs: readonly string[]) => new Set(xs).size === xs.length;

  it('ids de KPI únicos y con industria del catálogo', () => {
    expect(unicos(KPI_LIBRARY.map((k) => k.id))).toBe(true);
    const fuera = KPI_LIBRARY.filter((k) => !INDUSTRIES.includes(k.industry)).map((k) => k.id);
    expect(fuera).toEqual([]);
  });

  it('tipos de ejecución con id único y prefijo de código', () => {
    expect(unicos(EXECUTION_TYPES.map((t) => t.id))).toBe(true);
    for (const t of EXECUTION_TYPES) expect(t.codePrefix).toMatch(/^[A-Z]{2,3}$/);
  });

  it('categorías de pain con id único', () => {
    expect(unicos(PAIN_CATEGORIES.map((c) => c.id))).toBe(true);
  });

  it('ningún verbo es a la vez permitido y prohibido', () => {
    expect(VERBS_ALLOWED.filter((v) => v in VERBS_FORBIDDEN)).toEqual([]);
  });

  it('todas las formas tienen tamaño positivo', () => {
    for (const f of Object.values(FORMAS_POR_DEFECTO)) {
      expect(f.w).toBeGreaterThan(0);
      expect(f.h).toBeGreaterThan(0);
    }
  });
});
