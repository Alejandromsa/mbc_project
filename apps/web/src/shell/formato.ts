// Textos y formatos de la interfaz del shell.
import type { EstadoRevision, RolOrganizacion, RolProyecto } from './api';

export const ESTADOS: Record<EstadoRevision, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  aprobada: 'Aprobada'
};

export const ROLES_PROYECTO: Record<RolProyecto, string> = {
  propietario: 'Propietario',
  editor: 'Editor',
  revisor: 'Revisor',
  lector: 'Lector'
};

export const ROLES_ORGANIZACION: Record<RolOrganizacion, string> = {
  admin: 'Administrador',
  consultor: 'Consultor',
  lector: 'Lector'
};

const fechaHora = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' });

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : fechaHora.format(d);
}

/** Dirección del editor para abrir una revisión concreta o la última de un proceso. */
export const enEditor = {
  revision: (id: string) => `/?revision=${encodeURIComponent(id)}`,
  proceso: (id: string) => `/?proceso=${encodeURIComponent(id)}`
};

/**
 * Destino seguro tras entrar: solo rutas del mismo sitio ("/algo"), nunca
 * "//otro-sitio" ni URLs absolutas (evita redirecciones abiertas).
 */
export function destinoSeguro(volver: string | null | undefined): string {
  return volver && /^\/(?![\/\\])/.test(volver) && !/[\\\s]/.test(volver) ? volver : '/proyectos/';
}
