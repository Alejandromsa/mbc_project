import { FORMAS_POR_DEFECTO, type FormaPorDefecto } from './formas.js';
import type { Nodo, TipoNodo } from './modelo.js';

/**
 * Nodo nuevo con los campos editables vacíos (makeNode del MVP). El orden de
 * las claves es el del MVP: se nota en el JSON exportado.
 */
export function crearNodo(
  id: string, type: TipoNodo, x: number, y: number, label: string,
  formas: Readonly<Record<string, FormaPorDefecto>> = FORMAS_POR_DEFECTO
): Nodo {
  const def = formas[type]!;
  const defaultExec = type === 'system' ? 'system' : (type === 'task' ? 'manual' : '');
  return {
    id, type,
    x, y, w: def.w, h: def.h,
    label, executionType: defaultExec,
    owner: '', system: '', time: '', volume: '', va: '',
    sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: []
  };
}
