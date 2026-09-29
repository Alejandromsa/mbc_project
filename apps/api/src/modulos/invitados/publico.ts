// Invitados, sin sesión (ADR 20): lo que usa quien abre el enlace, bajo
// /api/publico/invitados/:token. El token es la única credencial: aquí no hay
// usuario (app.ts no lee la cookie en /api/publico/) y nunca se lee c.get('usuario').
//   GET  /:token               la revisión (contenido v1), el nombre del proceso y los comentarios de ESTE enlace
//   POST /:token/comentarios   comenta la revisión o un elemento de su diagrama
// Token inventado, caducado, revocado o de un proyecto archivado: siempre el mismo 404.
import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { invitadosComentarios, invitadosEnlaces, revisiones } from '@processiq/db';
import { registrarEvento } from '../../auditoria.js';
import { ErrorHttp, type Entorno } from '../../contexto.js';
import { LimitadorAccesos } from '../../rutas/sesion.js';
import { cuerpo } from '../../validar.js';
import { comentarioParaInvitado, elementosDe, enlaceNoValido, enlaceVigente } from './servicio.js';

/** Comentarios por enlace: 20 cada 10 minutos. Frena el abuso de un enlace válido. */
const MAX_COMENTARIOS = 20;
const VENTANA_COMENTARIOS_MS = 10 * 60 * 1000;

const ComentarioEsquema = z.object({
  nombre: z.string().trim().min(1, 'Escribe tu nombre.').max(120),
  texto: z.string().trim().min(1, 'Escribe el comentario.').max(4000),
  /** Elemento del diagrama (id del nodo); null = la revisión en general. */
  elementoId: z.string().trim().min(1).max(200).nullable().default(null),
  /** Vista en la que está el elemento; sin ella se busca en todas. */
  vista: z.enum(['asis', 'tobe']).nullable().default(null)
});

export function rutasPublicasInvitados() {
  const r = new Hono<Entorno>();
  const comentariosPorEnlace = new LimitadorAccesos(MAX_COMENTARIOS, VENTANA_COMENTARIOS_MS);

  // Nada de lo que sale de aquí debe quedar en cachés intermedias ni del navegador
  r.use('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); });

  r.get('/:token', async (c) => {
    const db = c.get('db');
    const vigente = await enlaceVigente(db, c.req.param('token'));
    if (!vigente) throw enlaceNoValido();
    const { enlace, proceso } = vigente;
    const [rev] = await db.select({ numero: revisiones.numero, creadaEn: revisiones.creadaEn, contenido: revisiones.contenido })
      .from(revisiones).where(eq(revisiones.id, enlace.revisionId)).limit(1);
    if (!rev) throw enlaceNoValido();
    await db.update(invitadosEnlaces).set({ ultimoAcceso: new Date() }).where(eq(invitadosEnlaces.id, enlace.id));
    const comentarios = await db.select().from(invitadosComentarios)
      .where(eq(invitadosComentarios.enlaceId, enlace.id)).orderBy(asc(invitadosComentarios.creadoEn));
    return c.json({
      proceso: { nombre: proceso },
      revision: { numero: rev.numero, creadaEn: rev.creadaEn, contenido: rev.contenido },
      enlace: { destinatario: enlace.destinatario, caducaEn: enlace.caducaEn, admiteComentarios: enlace.admiteComentarios },
      comentarios: comentarios.map(comentarioParaInvitado)
    });
  });

  r.post('/:token/comentarios', async (c) => {
    const db = c.get('db');
    const vigente = await enlaceVigente(db, c.req.param('token'));
    if (!vigente) throw enlaceNoValido();
    const { enlace } = vigente;
    if (!enlace.admiteComentarios) {
      throw new ErrorHttp(403, 'Este enlace es solo de lectura: no admite comentarios.', 'INVITADOS_SIN_COMENTARIOS');
    }
    if (comentariosPorEnlace.bloqueado(enlace.id)) {
      throw new ErrorHttp(429, 'Se enviaron demasiados comentarios seguidos. Espera unos minutos y vuelve a intentarlo.', 'LIMITE');
    }
    const d = await cuerpo(c, ComentarioEsquema);
    let elementoEtiqueta: string | null = null;
    if (d.elementoId) {
      // Solo elementos de la revisión del enlace: el invitado no llega a ninguna otra
      const [rev] = await db.select({ contenido: revisiones.contenido }).from(revisiones).where(eq(revisiones.id, enlace.revisionId)).limit(1);
      const elementos = elementosDe(rev?.contenido, d.vista);
      if (!elementos.has(d.elementoId)) {
        throw new ErrorHttp(400, 'Ese elemento no está en el diagrama de esta versión.', 'VALIDACION', ['elementoId: no existe en la revisión']);
      }
      const etiqueta = elementos.get(d.elementoId)!.slice(0, 200);
      // Para el equipo, «(To-Be)» distingue un paso reingenierizado del original con el mismo id
      elementoEtiqueta = d.vista === 'tobe' ? `${etiqueta || d.elementoId} (To-Be)` : etiqueta || null;
    }
    comentariosPorEnlace.fallo(enlace.id);
    const [comentario] = await db.insert(invitadosComentarios).values({
      enlaceId: enlace.id, revisionId: enlace.revisionId, elementoId: d.elementoId, elementoEtiqueta,
      nombre: d.nombre, texto: d.texto
    }).returning();
    // Sin autor (lo escribe alguien sin cuenta) y con la organización del enlace, para que
    // el administrador lo vea en su auditoría. El nombre que dio queda en el detalle.
    await registrarEvento(db, {
      accion: 'invitados.comentario.alta', entidad: 'invitados_comentario', entidadId: comentario!.id,
      detalle: { enlaceId: enlace.id, procesoId: enlace.procesoId, revisionId: enlace.revisionId, nombre: d.nombre, elementoId: d.elementoId },
      usuarioId: null, organizacionId: enlace.organizacionId, ip: c.get('ip')
    });
    return c.json({ comentario: comentarioParaInvitado(comentario!) }, 201);
  });

  return r;
}
