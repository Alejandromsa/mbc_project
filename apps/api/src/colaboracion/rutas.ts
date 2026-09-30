// Colaboración en tiempo real (docs/iniciativas/colaboracion.md, ADR 21):
//   GET    /api/procesos/:id/presencia   quién lo tiene abierto (y qué revisión)
//   PUT    /api/procesos/:id/presencia   latido de una pestaña (viendo o editando, revisión abierta)
//   DELETE /api/procesos/:id/presencia   la pestaña se cierra (?pestana=)
//   GET    /api/procesos/:id/eventos     SSE: presencia, última revisión y estado de las revisiones, en vivo
// Todo con acceso «leer» al proceso; sin él, 404 como el resto de la API.
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { sesiones, usuarios, type BaseDeDatos } from '@processiq/db';
import { ErrorHttp, type Entorno } from '../contexto.js';
import { despertador } from '../ia/avisos.js';
import { puede } from '../permisos.js';
import { accesoProceso } from '../rutas/procesos.js';
import { cuerpo } from '../validar.js';
import { CANAL_PROCESOS } from './avisos.js';
import {
  CADUCIDAD_S, LATIDO_S, estadosRevisiones, latir, presentes, renovar, revisionDelProceso, salir, ultimaRevision
} from './presencia.js';

/** Lo genera la web al abrir la página (crypto.randomUUID o similar). */
const PestanaEsquema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Identificador de pestaña no válido.');
const LatidoEsquema = z.object({
  pestana: PestanaEsquema,
  lugar: z.enum(['editor', 'shell']),
  estado: z.enum(['viendo', 'editando']).default('viendo'),
  /** Revisión abierta en el editor (null: el shell, o un proceso sin revisiones). */
  revisionId: z.string().uuid().nullable().default(null)
});

/** Tras un corte, EventSource vuelve a conectar a los 3 s. */
const REINTENTO_MS = 3000;

async function sesionViva(db: BaseDeDatos, sesionId: string): Promise<boolean> {
  const [s] = await db.select({ id: sesiones.id }).from(sesiones).innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
    .where(and(eq(sesiones.id, sesionId), gt(sesiones.expiraEn, new Date()), eq(usuarios.activo, true))).limit(1);
  return !!s;
}

export interface OpcionesColaboracion {
  /** Cada cuánto re-lee el SSE si no llega ningún aviso (ms): así ve también las presencias que caducan. */
  sondeoMs?: number;
  /** Duración máxima de una conexión SSE (ms); después el navegador reconecta y la sesión se vuelve a validar. */
  duracionMaxMs?: number;
}

export function rutasColaboracion(opciones: OpcionesColaboracion = {}) {
  const r = new Hono<Entorno>();
  const sondeoMs = opciones.sondeoMs ?? 5000;
  const duracionMaxMs = opciones.duracionMaxMs ?? 10 * 60_000;

  r.get('/procesos/:id/presencia', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    const { proceso } = await accesoProceso(db, yo, c.req.param('id'), 'leer');
    return c.json({ presencias: await presentes(db, proceso.id, yo.id) });
  });

  r.put('/procesos/:id/presencia', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    const { proceso, proyecto, rol } = await accesoProceso(db, yo, c.req.param('id'), 'leer');
    const d = await cuerpo(c, LatidoEsquema);
    // Solo «edita» quien puede guardar: los cambios de un lector no llegan al proyecto
    const estado = d.estado === 'editando' && puede(rol, 'escribir') && !proyecto.archivado ? 'editando' : 'viendo';
    // La revisión abierta tiene que ser de este proceso: si no, se enseñaría el número de una ajena
    if (d.revisionId && !(await revisionDelProceso(db, proceso.id, d.revisionId))) {
      throw new ErrorHttp(400, 'La revisión abierta no es de este proceso.', 'VALIDACION');
    }
    await latir(db, { procesoId: proceso.id, usuarioId: yo.id, pestana: d.pestana, lugar: d.lugar, estado, revisionId: d.revisionId });
    return c.json({ estado, presencias: await presentes(db, proceso.id, yo.id), latidoS: LATIDO_S, caducidadS: CADUCIDAD_S });
  });

  r.delete('/procesos/:id/presencia', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    const { proceso } = await accesoProceso(db, yo, c.req.param('id'), 'leer');
    const pestana = PestanaEsquema.safeParse(c.req.query('pestana'));
    if (!pestana.success) throw new ErrorHttp(400, 'Falta la pestaña que se cierra.', 'VALIDACION');
    await salir(db, { procesoId: proceso.id, usuarioId: yo.id, pestana: pestana.data });
    return c.body(null, 204);
  });

  /**
   * Eventos en vivo del proceso (SSE):
   *   presencia  { presencias }  quién lo tiene abierto, cada vez que cambia
   *   revision   { revision }    la última revisión, cada vez que cambia (alguien guardó)
   *   estado     { revisiones }  id, número y estado de cada revisión, cada vez que alguna
   *                              cambia de estado (enviar a revisión, aprobar, devolver) o hay una nueva
   * Al conectar llegan los tres con el estado actual, así que reconectar es seguro.
   * Con ?pestana=, mientras la conexión siga abierta el servidor renueva el latido
   * de esa pestaña: en segundo plano el navegador estrangula sus temporizadores.
   */
  r.get('/procesos/:id/eventos', async (c) => {
    const db = c.get('db'), yo = c.get('usuario'), sesionId = c.get('sesionId'), escucha = c.get('escucha');
    const { proceso } = await accesoProceso(db, yo, c.req.param('id'), 'leer');
    const pestana = PestanaEsquema.safeParse(c.req.query('pestana'));
    const mia = pestana.success ? { procesoId: proceso.id, usuarioId: yo.id, pestana: pestana.data } : null;
    return streamSSE(c, async (stream) => {
      const reloj = despertador();
      let cerrada = false;
      stream.onAbort(() => { cerrada = true; reloj.despertar(); });
      const quitar = escucha?.suscribir(CANAL_PROCESOS, (id) => { if (id === proceso.id) reloj.despertar(); });
      const hasta = Date.now() + duracionMaxMs;
      let renovadaEn = 0;   // la primera vuelta ya renueva
      let presenciaEnviada = '', revisionEnviada = '', estadosEnviados = '';
      try {
        await stream.write(`retry: ${REINTENTO_MS}\n\n`);
        while (!cerrada && Date.now() < hasta) {
          // Sesión y acceso se comprueban en cada vuelta: quien sale o pierde el acceso deja de recibir
          if (!(await sesionViva(db, sesionId))) break;
          try { await accesoProceso(db, yo, proceso.id, 'leer'); } catch { break; }
          if (mia && Date.now() - renovadaEn >= LATIDO_S * 1000) {
            renovadaEn = Date.now();
            await renovar(db, mia);
          }
          const lista = JSON.stringify({ presencias: await presentes(db, proceso.id, yo.id) });
          const revision = JSON.stringify({ revision: await ultimaRevision(db, proceso.id) });
          let envio = false;
          if (lista !== presenciaEnviada) {
            presenciaEnviada = lista;
            await stream.writeSSE({ event: 'presencia', data: lista });
            envio = true;
          }
          if (revision !== revisionEnviada) {
            revisionEnviada = revision;
            await stream.writeSSE({ event: 'revision', data: revision });
            envio = true;
          }
          const estados = JSON.stringify({ revisiones: await estadosRevisiones(db, proceso.id) });
          if (estados !== estadosEnviados) {
            estadosEnviados = estados;
            await stream.writeSSE({ event: 'estado', data: estados });
            envio = true;
          }
          if (!envio) await stream.write(': latido\n\n');
          await reloj.esperar(Math.min(sondeoMs, Math.max(0, hasta - Date.now())));
        }
      } finally {
        quitar?.();
      }
    });
  });

  return r;
}
