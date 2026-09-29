// Textos y formatos de la interfaz del shell: estados, roles, fechas y números
// según el idioma (i18n.ts). El editor (src/app/plataforma) usa ESTADOS,
// ROLES_PROYECTO y fecha() sin idioma: siempre en español, como el resto del editor.
// Este archivo no importa React ni i18n.ts, para no llevarlos al editor.
import type { EstadoRevision, RolOrganizacion, RolProyecto } from './api';

export type Idioma = 'es' | 'en';

/** Configuración regional de Intl para cada idioma. */
export const LOCALES: Record<Idioma, string> = { es: 'es-PE', en: 'en-US' };

interface TextosDominio {
  estados: Record<EstadoRevision, string>;
  rolesProyecto: Record<RolProyecto, string>;
  rolesOrganizacion: Record<RolOrganizacion, string>;
}

const TEXTOS: Record<Idioma, TextosDominio> = {
  es: {
    estados: { borrador: 'Borrador', en_revision: 'En revisión', aprobada: 'Aprobada' },
    rolesProyecto: { propietario: 'Propietario', editor: 'Editor', revisor: 'Revisor', lector: 'Lector' },
    rolesOrganizacion: { admin: 'Administrador', consultor: 'Consultor', lector: 'Lector' }
  },
  en: {
    estados: { borrador: 'Draft', en_revision: 'In review', aprobada: 'Approved' },
    rolesProyecto: { propietario: 'Owner', editor: 'Editor', revisor: 'Reviewer', lector: 'Viewer' },
    rolesOrganizacion: { admin: 'Administrator', consultor: 'Consultant', lector: 'Viewer' }
  }
};

/** Estados, roles de proyecto y roles de organización en el idioma pedido. */
export const textosDominio = (idioma: Idioma): TextosDominio => TEXTOS[idioma];

// En español: los usa el editor en modo proyecto, que no se traduce.
export const ESTADOS = TEXTOS.es.estados;
export const ROLES_PROYECTO = TEXTOS.es.rolesProyecto;
export const ROLES_ORGANIZACION = TEXTOS.es.rolesOrganizacion;

const fechasHora = new Map<Idioma, Intl.DateTimeFormat>();
const numeros = new Map<Idioma, Intl.NumberFormat>();

/** Fecha y hora de un ISO; «—» si no hay o no es válida. Sin idioma, en español (el editor). */
export function fecha(iso: string | null | undefined, idioma: Idioma = 'es'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  let f = fechasHora.get(idioma);
  if (!f) fechasHora.set(idioma, (f = new Intl.DateTimeFormat(LOCALES[idioma], { dateStyle: 'medium', timeStyle: 'short' })));
  return f.format(d);
}

/** Número con los separadores del idioma; con `opciones`, cualquier formato de Intl (porcentajes…). */
export function numero(n: number, idioma: Idioma = 'es', opciones?: Intl.NumberFormatOptions): string {
  if (opciones) return new Intl.NumberFormat(LOCALES[idioma], opciones).format(n);
  let f = numeros.get(idioma);
  if (!f) numeros.set(idioma, (f = new Intl.NumberFormat(LOCALES[idioma])));
  return f.format(n);
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
