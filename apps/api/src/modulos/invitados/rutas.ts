// Invitados, con sesión: el equipo comparte revisiones y atiende los comentarios.
//   POST /revisiones/:id/enlaces     crea un enlace (escribir). El token solo viaja en esta respuesta
//   GET  /procesos/:id/enlaces       enlaces de todas las revisiones del proceso (escribir; también archivado)
//   POST /enlaces/:id/revocar        revoca un enlace (escribir)
//   GET  /procesos/:id/comentarios   comentarios de los invitados (leer)
//   POST /comentarios/:id/resolver   marca o desmarca un comentario como resuelto (escribir)
import { Hono } from 'hono';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { invitadosComentarios, invitadosEnlaces, revisiones, usuarios } from '@processiq/db';
import { registrar } from '../../auditoria.js';
import { ErrorHttp, type Entorno } from '../../contexto.js';
import { puede } from '../../permisos.js';
import { accesoProceso } from '../../rutas/procesos.js';
import { nuevoToken } from '../../seguridad.js';
import { cuerpo, esUuid } from '../../validar.js';
import { DIAS_MAXIMO, DIAS_POR_DEFECTO, estadoEnlace, type Enlace } from './servicio.js';

const NuevoEnlaceEsquema = z.object({
  destinatario: z.string().trim().min(1, 'Indica a quién envías el enlace.').max(120),
  dias: z.number().int()
    .min(1, 'El enlace debe durar al menos 1 día.')
    .max(DIAS_MAXIMO, `El enlace puede durar como mucho ${DIAS_MAXIMO} días.`)
    .default(DIAS_POR_DEFECTO),
  admiteComentarios: z.boolean().default(true)
});
const ResolverEsquema = z.object({ resuelto: z.boolean().default(true) });

const creador = alias(usuarios, 'creador');
const resolvio = alias(usuarios, 'resolvio');

/** Lo que ve el equipo de un enlace: nunca el token ni su hash. */
function vistaEnlace(e: Enlace, creadoPor: string | null, comentarios: number) {
  return {
    id: e.id, revisionId: e.revisionId, destinatario: e.destinatario, admiteComentarios: e.admiteComentarios,
    caducaEn: e.caducaEn, revocadoEn: e.revocadoEn, creadoEn: e.creadoEn, ultimoAcceso: e.ultimoAcceso,
    creadoPor, comentarios, estado: estadoEnlace(e)
  };
}

const columnasComentario = {
  id: invitadosComentarios.id, enlaceId: invitadosComentarios.enlaceId, revisionId: invitadosComentarios.revisionId,
  destinatario: invitadosEnlaces.destinatario, nombre: invitadosComentarios.nombre, texto: invitadosComentarios.texto,
  elementoId: invitadosComentarios.elementoId, elementoEtiqueta: invitadosComentarios.elementoEtiqueta,
  creadoEn: invitadosComentarios.creadoEn, resueltoEn: invitadosComentarios.resueltoEn, resueltoPor: resolvio.nombre
};

export function rutasInvitados() {
  const r = new Hono<Entorno>();

  r.post('/revisiones/:id/enlaces', async (c) => {
    const db = c.get('db'), yo = c.get('usuario'), id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'Revisión no encontrada.');
    const [rev] = await db.select({ id: revisiones.id, procesoId: revisiones.procesoId, numero: revisiones.numero })
      .from(revisiones).where(eq(revisiones.id, id)).limit(1);
    if (!rev) throw new ErrorHttp(404, 'Revisión no encontrada.');
    const { proceso, proyecto } = await accesoProceso(db, yo, rev.procesoId, 'escribir');
    const d = await cuerpo(c, NuevoEnlaceEsquema);
    const { token, hash } = nuevoToken();
    const [enlace] = await db.insert(invitadosEnlaces).values({
      organizacionId: proyecto.organizacionId, proyectoId: proyecto.id, procesoId: proceso.id, revisionId: rev.id,
      tokenHash: hash, destinatario: d.destinatario, admiteComentarios: d.admiteComentarios,
      caducaEn: new Date(Date.now() + d.dias * 86_400_000), creadoPor: yo.id
    }).returning();
    await registrar(c, 'invitados.enlace.alta', 'invitados_enlace', enlace!.id, {
      procesoId: proceso.id, revisionId: rev.id, numero: rev.numero, destinatario: d.destinatario,
      dias: d.dias, admiteComentarios: d.admiteComentarios
    });
    // El enlace completo solo se muestra ahora: en la base queda el hash del token
    return c.json({ enlace: vistaEnlace(enlace!, yo.nombre, 0), token, url: `${c.get('config').origenPublico}/?invitado=${token}` }, 201);
  });

  r.get('/procesos/:id/enlaces', async (c) => {
    const db = c.get('db');
    // Leer y comprobar escribir aparte: en un proyecto archivado la lista se sigue viendo
    const { proceso, rol } = await accesoProceso(db, c.get('usuario'), c.req.param('id'), 'leer');
    if (!puede(rol, 'escribir')) throw new ErrorHttp(403, 'Tu rol en este proyecto no permite gestionar los enlaces de invitados.', 'PERMISO');
    const filas = await db.select({
      enlace: invitadosEnlaces, creadoPor: creador.nombre,
      comentarios: sql<number>`(select count(*)::int from invitados_comentarios c where c.enlace_id = ${invitadosEnlaces.id})`
    }).from(invitadosEnlaces).leftJoin(creador, eq(creador.id, invitadosEnlaces.creadoPor))
      .where(eq(invitadosEnlaces.procesoId, proceso.id)).orderBy(desc(invitadosEnlaces.creadoEn));
    return c.json({ enlaces: filas.map((f) => vistaEnlace(f.enlace, f.creadoPor, f.comentarios)) });
  });

  r.post('/enlaces/:id/revocar', async (c) => {
    const db = c.get('db'), yo = c.get('usuario'), id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'Enlace no encontrado.');
    const [e] = await db.select().from(invitadosEnlaces).where(eq(invitadosEnlaces.id, id)).limit(1);
    if (!e) throw new ErrorHttp(404, 'Enlace no encontrado.');
    await accesoProceso(db, yo, e.procesoId, 'escribir');
    let enlace = e;
    // Revocar dos veces no cambia nada ni deja otra entrada en la auditoría
    const [revocado] = await db.update(invitadosEnlaces).set({ revocadoEn: new Date(), revocadoPor: yo.id })
      .where(and(eq(invitadosEnlaces.id, id), isNull(invitadosEnlaces.revocadoEn))).returning();
    if (revocado) {
      enlace = revocado;
      await registrar(c, 'invitados.enlace.baja', 'invitados_enlace', id, { procesoId: e.procesoId, revisionId: e.revisionId, destinatario: e.destinatario });
    }
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(invitadosComentarios).where(eq(invitadosComentarios.enlaceId, id));
    const [autor] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, enlace.creadoPor)).limit(1);
    return c.json({ enlace: vistaEnlace(enlace, autor?.nombre ?? null, n?.n ?? 0) });
  });

  r.get('/procesos/:id/comentarios', async (c) => {
    const db = c.get('db');
    const { proceso } = await accesoProceso(db, c.get('usuario'), c.req.param('id'), 'leer');
    const comentarios = await db.select(columnasComentario).from(invitadosComentarios)
      .innerJoin(invitadosEnlaces, eq(invitadosEnlaces.id, invitadosComentarios.enlaceId))
      .leftJoin(resolvio, eq(resolvio.id, invitadosComentarios.resueltoPor))
      .where(eq(invitadosEnlaces.procesoId, proceso.id)).orderBy(desc(invitadosComentarios.creadoEn));
    return c.json({ comentarios });
  });

  r.post('/comentarios/:id/resolver', async (c) => {
    const db = c.get('db'), yo = c.get('usuario'), id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'Comentario no encontrado.');
    const [com] = await db.select({ id: invitadosComentarios.id, procesoId: invitadosEnlaces.procesoId, resueltoEn: invitadosComentarios.resueltoEn })
      .from(invitadosComentarios).innerJoin(invitadosEnlaces, eq(invitadosEnlaces.id, invitadosComentarios.enlaceId))
      .where(eq(invitadosComentarios.id, id)).limit(1);
    if (!com) throw new ErrorHttp(404, 'Comentario no encontrado.');
    await accesoProceso(db, yo, com.procesoId, 'escribir');
    const { resuelto } = await cuerpo(c, ResolverEsquema);
    if (resuelto !== !!com.resueltoEn) {
      await db.update(invitadosComentarios)
        .set(resuelto ? { resueltoEn: new Date(), resueltoPor: yo.id } : { resueltoEn: null, resueltoPor: null })
        .where(eq(invitadosComentarios.id, id));
      await registrar(c, 'invitados.comentario.resolucion', 'invitados_comentario', id, { procesoId: com.procesoId, resuelto });
    }
    const [comentario] = await db.select(columnasComentario).from(invitadosComentarios)
      .innerJoin(invitadosEnlaces, eq(invitadosEnlaces.id, invitadosComentarios.enlaceId))
      .leftJoin(resolvio, eq(resolvio.id, invitadosComentarios.resueltoPor))
      .where(eq(invitadosComentarios.id, id)).limit(1);
    return c.json({ comentario });
  });

  return r;
}
