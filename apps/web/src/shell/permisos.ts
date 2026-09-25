// Capacidades por rol de proyecto: copia de apps/api/src/permisos.ts, solo para
// mostrar u ocultar acciones. Quien decide es la API.
import type { RolProyecto } from './api';

export type Capacidad = 'leer' | 'escribir' | 'aprobar' | 'administrar';

const CAPACIDADES: Record<RolProyecto, Capacidad[]> = {
  propietario: ['leer', 'escribir', 'aprobar', 'administrar'],
  editor: ['leer', 'escribir'],
  revisor: ['leer', 'aprobar'],
  lector: ['leer']
};

export function puede(rol: RolProyecto | null | undefined, capacidad: Capacidad): boolean {
  return !!rol && CAPACIDADES[rol].includes(capacidad);
}
