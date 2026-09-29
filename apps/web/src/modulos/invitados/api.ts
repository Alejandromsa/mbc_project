// Cliente de /api/invitados (con sesión: el equipo) y de /api/publico/invitados
// (sin sesión: la vista del invitado en el editor). Usa pedir() del shell:
// errores y red se tratan igual que en el resto de la plataforma.
import { pedir } from '../../shell/api';

export type EstadoEnlace = 'activo' | 'caducado' | 'revocado';

/** Un enlace, tal como lo ve el equipo (nunca lleva el token). */
export interface EnlaceInvitado {
  id: string;
  revisionId: string;
  destinatario: string;
  admiteComentarios: boolean;
  caducaEn: string;
  revocadoEn: string | null;
  creadoEn: string;
  ultimoAcceso: string | null;
  /** Nombre de quien lo creó. */
  creadoPor: string | null;
  comentarios: number;
  estado: EstadoEnlace;
}

/** Un comentario de invitado, tal como lo ve el equipo. */
export interface ComentarioInvitado {
  id: string;
  enlaceId: string;
  revisionId: string;
  /** Destinatario del enlace por el que llegó. */
  destinatario: string;
  nombre: string;
  texto: string;
  elementoId: string | null;
  elementoEtiqueta: string | null;
  creadoEn: string;
  resueltoEn: string | null;
  /** Nombre de quien lo marcó como resuelto. */
  resueltoPor: string | null;
}

export interface NuevoEnlace { destinatario: string; dias: number; admiteComentarios: boolean }

const q = (v: string) => encodeURIComponent(v);

export const apiInvitados = {
  enlaces: (procesoId: string) => pedir<{ enlaces: EnlaceInvitado[] }>('GET', `/invitados/procesos/${q(procesoId)}/enlaces`),
  comentarios: (procesoId: string) => pedir<{ comentarios: ComentarioInvitado[] }>('GET', `/invitados/procesos/${q(procesoId)}/comentarios`),
  /** El token (y la URL) solo llegan en esta respuesta. */
  crearEnlace: (revisionId: string, datos: NuevoEnlace) =>
    pedir<{ enlace: EnlaceInvitado; token: string; url: string }>('POST', `/invitados/revisiones/${q(revisionId)}/enlaces`, datos),
  revocar: (id: string) => pedir<{ enlace: EnlaceInvitado }>('POST', `/invitados/enlaces/${q(id)}/revocar`),
  resolver: (id: string, resuelto: boolean) =>
    pedir<{ comentario: ComentarioInvitado }>('POST', `/invitados/comentarios/${q(id)}/resolver`, { resuelto })
};

// ---------- Lo que usa el invitado (sin sesión) ----------

/** Un comentario, tal como lo ve el invitado: sin nada del equipo. */
export interface ComentarioPublico {
  id: string;
  nombre: string;
  texto: string;
  elementoId: string | null;
  elementoEtiqueta: string | null;
  creadoEn: string;
  resuelto: boolean;
}

export interface VistaInvitado {
  proceso: { nombre: string };
  revision: { numero: number; creadaEn: string; contenido: any };
  enlace: { destinatario: string; caducaEn: string; admiteComentarios: boolean };
  comentarios: ComentarioPublico[];
}

export const apiPublicaInvitados = {
  vista: (token: string) => pedir<VistaInvitado>('GET', `/publico/invitados/${q(token)}`),
  /** `vista`: en qué vista (As-Is o To-Be) está el elemento anclado. */
  comentar: (token: string, datos: { nombre: string; texto: string; elementoId: string | null; vista?: 'asis' | 'tobe' | null }) =>
    pedir<{ comentario: ComentarioPublico }>('POST', `/publico/invitados/${q(token)}/comentarios`, datos)
};
