import type { Ficha } from './modelo.js';

/** Ficha vacía nueva (sin referencias compartidas: cada llamada crea arrays nuevos). */
export function fichaVacia(): Ficha {
  return {
    code: '', version: '', objetivo: '',
    alcanceAreas: '', alcanceDesde: '', alcanceHasta: '', alcanceIncluye: '',
    descripcion: '', gobernanza: [], sistemas: [], terminos: [], anexos: [], cambios: []
  };
}

/**
 * Completa una ficha parcial (de localStorage o de un JSON importado) con las
 * claves que falten. Las claves presentes se conservan tal cual.
 */
export function normalizarFicha(f?: Partial<Ficha> | null): Ficha {
  return Object.assign(fichaVacia(), f || {});
}
