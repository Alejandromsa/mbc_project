// Invitados: enlaces de solo lectura con caducidad y comentarios de quien los
// abre (docs/iniciativas/invitados.md, ADR 20). Lee las tablas del núcleo
// (proyectos, procesos, revisiones) sin escribirlas nunca (regla 5).
import { and, eq, gt, isNull } from 'drizzle-orm';
import { invitadosComentarios, invitadosEnlaces, procesos, proyectos, type BaseDeDatos } from '@processiq/db';
import { ErrorHttp } from '../../contexto.js';
import { hashToken } from '../../seguridad.js';

/** Caducidad de un enlace, en días. */
export const DIAS_POR_DEFECTO = 14;
export const DIAS_MAXIMO = 90;

export type Enlace = typeof invitadosEnlaces.$inferSelect;
export type Comentario = typeof invitadosComentarios.$inferSelect;
export type EstadoEnlace = 'activo' | 'caducado' | 'revocado';

export function estadoEnlace(e: Pick<Enlace, 'caducaEn' | 'revocadoEn'>, ahora = new Date()): EstadoEnlace {
  if (e.revocadoEn) return 'revocado';
  return e.caducaEn.getTime() > ahora.getTime() ? 'activo' : 'caducado';
}

export type Vista = 'asis' | 'tobe';

/**
 * Elementos del diagrama de una revisión (id -> etiqueta). Un comentario solo
 * puede anclarse a uno de ellos. Con `vista`, solo los de esa vista (la que
 * estaba abierta al guardar está en `nodes`; la otra, en `views`); sin ella,
 * los de todas. As-Is y To-Be pueden repetir ids: el To-Be nace clonando el As-Is.
 */
export function elementosDe(contenido: unknown, vista: Vista | null = null): Map<string, string> {
  const mapa = new Map<string, string>();
  const agregar = (nodos: unknown) => {
    if (!Array.isArray(nodos)) return;
    for (const n of nodos) {
      if (n && typeof n === 'object' && typeof n.id === 'string' && n.id && !mapa.has(n.id)) {
        mapa.set(n.id, typeof n.label === 'string' ? n.label : '');
      }
    }
  };
  const c = contenido as { nodes?: unknown; activeView?: unknown; views?: Record<string, { nodes?: unknown } | null> } | null;
  if (vista) {
    agregar((c?.activeView === 'tobe' ? 'tobe' : 'asis') === vista ? c?.nodes : c?.views?.[vista]?.nodes);
    return mapa;
  }
  agregar(c?.nodes);
  if (c?.views && typeof c.views === 'object') for (const v of Object.values(c.views)) agregar(v?.nodes);
  return mapa;
}

/** Formato del token (32 bytes en base64url, como las sesiones): lo demás ni se busca. */
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Error único para un token inventado, caducado, revocado o de un proyecto
 * archivado: la respuesta no distingue los casos (no delata qué enlaces existen).
 */
export const enlaceNoValido = () =>
  new ErrorHttp(404, 'Este enlace no existe o ya no está disponible. Pide uno nuevo a quien te lo envió.', 'INVITADOS_ENLACE_NO_VALIDO');

/** El enlace vigente de un token, con el nombre del proceso; null si no sirve. */
export async function enlaceVigente(db: BaseDeDatos, token: string) {
  if (!FORMATO_TOKEN.test(token)) return null;
  const [fila] = await db.select({ enlace: invitadosEnlaces, proceso: procesos.nombre })
    .from(invitadosEnlaces)
    .innerJoin(procesos, eq(procesos.id, invitadosEnlaces.procesoId))
    .innerJoin(proyectos, eq(proyectos.id, invitadosEnlaces.proyectoId))
    .where(and(
      eq(invitadosEnlaces.tokenHash, hashToken(token)),
      isNull(invitadosEnlaces.revocadoEn),
      gt(invitadosEnlaces.caducaEn, new Date()),
      // Un proyecto archivado está cerrado: nadie del equipo podría responder
      eq(proyectos.archivado, false)
    ))
    .limit(1);
  return fila ?? null;
}

/** Lo que ve el invitado de un comentario: ni quién lo resolvió ni nada del equipo. */
export function comentarioParaInvitado(c: Comentario) {
  return {
    id: c.id, nombre: c.nombre, texto: c.texto, elementoId: c.elementoId, elementoEtiqueta: c.elementoEtiqueta,
    creadoEn: c.creadoEn, resuelto: !!c.resueltoEn
  };
}
