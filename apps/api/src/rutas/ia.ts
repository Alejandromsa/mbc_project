// IA en el servidor (docs/arquitectura.md §8): endpoints de negocio que encolan
// ejecuciones para el worker, su progreso por SSE, cancelación y consumo.
// El cliente nunca envía prompts: envía datos (texto de las fuentes o el
// proceso) y el servidor decide prompt, modelo, esfuerzo y límites.
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ejecucionesIa, usuarios } from '@processiq/db';
import { migrarProyecto } from '@processiq/dominio';
import { MODELOS_IA, PRECIOS_IA, TAREAS_IA, resumenProcesoParaIa } from '@processiq/ia';
import { registrar } from '../auditoria.js';
import { ErrorHttp, type Entorno, type UsuarioSesion } from '../contexto.js';
import { CANAL_COLA, CANAL_EJECUCION, avisar, despertador } from '../ia/avisos.js';
import type { EjecucionIa } from '../ia/cola.js';
import { gastoDelMes, inicioDelMes, sinPresupuesto } from '../ia/presupuesto.js';
import { exigirAdmin, type Capacidad } from '../permisos.js';
import { cuerpo, esUuid } from '../validar.js';
import { accesoProceso } from './procesos.js';

const TERMINALES = new Set(['completada', 'fallida', 'cancelada']);
/** Texto de fuentes admitido en una generación (el editor ya lo recorta a 180 000 caracteres). */
const MAX_TEXTO = 1_000_000;

const GeneracionEsquema = z.object({
  procesoId: z.string().uuid(),
  texto: z.string().trim().min(1, 'No hay texto que interpretar.').max(MAX_TEXTO),
  etiqueta: z.string().trim().max(200).default('documento'),
  vista: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  roles: z.record(z.string().max(200), z.string().max(200)).nullable().optional(),
  variasFuentes: z.boolean().default(false),
  fuentes: z.array(z.object({ nombre: z.string().max(300), tipo: z.string().max(40), caracteres: z.number().int().nonnegative() })).max(50).default([]),
  /** El elegido en el editor. Si el servidor no lo permite, usa otro y lo dice (modeloSustituido). */
  modelo: z.string().max(100).optional()
});

const AnalisisEsquema = z.object({
  procesoId: z.string().uuid(),
  /** 'pains' o una tarea del copiloto (suggest-kpis, raci…). */
  // Object.hasOwn: 'constructor' o 'toString' no son tareas aunque existan en el prototipo
  tipo: z.string().refine((t) => t === 'pains' || Object.hasOwn(TAREAS_IA, t), 'Análisis desconocido.'),
  /** El proceso tal como está en el editor (se valida con el esquema del dominio). */
  contenido: z.unknown()
});

/** Lo que se muestra de una ejecución: nunca el texto de las fuentes. */
function publica(e: EjecucionIa, conResultado: boolean) {
  const { texto: _texto, resultado, organizacionId: _org, ...resto } = e;
  return { ...resto, resultado: conResultado ? resultado : undefined };
}

async function exigirIaDisponible(c: Context<Entorno>, yo: UsuarioSesion) {
  const ia = c.get('config').ia;
  if (!ia.configurada) {
    throw new ErrorHttp(409, 'La IA del servidor no está configurada todavía (falta la clave de Anthropic). Avisa a quien administra ProcessIQ.', 'IA_NO_CONFIGURADA');
  }
  // El worker lo vuelve a comprobar antes de cada llamada (ia/ejecutar.ts)
  const sin = await sinPresupuesto(c.get('db'), ia, yo.organizacionId, yo.id);
  if (sin) throw new ErrorHttp(409, sin.mensaje, sin.codigo);
}

async function accesoEjecucion(c: Context<Entorno>, id: string, capacidad: Capacidad) {
  if (!esUuid(id)) throw new ErrorHttp(404, 'Ejecución no encontrada.');
  const db = c.get('db');
  const [e] = await db.select().from(ejecucionesIa).where(eq(ejecucionesIa.id, id)).limit(1);
  if (!e) throw new ErrorHttp(404, 'Ejecución no encontrada.');
  await accesoProceso(db, c.get('usuario'), e.procesoId, capacidad);
  return e;
}

async function encolar(c: Context<Entorno>, valores: typeof ejecucionesIa.$inferInsert) {
  const db = c.get('db');
  const [e] = await db.insert(ejecucionesIa).values(valores).returning();
  await avisar(db, CANAL_COLA, e!.id);
  return e!;
}

export function rutasIa(opciones: { sondeoMs?: number } = {}) {
  const r = new Hono<Entorno>();
  const sondeoMs = opciones.sondeoMs ?? 5000;

  /** Qué IA ofrece el servidor y cuánto queda de presupuesto este mes. */
  r.get('/estado', async (c) => {
    const ia = c.get('config').ia, yo = c.get('usuario');
    const gasto = await gastoDelMes(c.get('db'), yo.organizacionId, yo.id);
    return c.json({
      configurada: ia.configurada,
      modelos: MODELOS_IA.filter((m) => ia.modelosPermitidos.includes(m.id)).map((m) => ({ ...m, precio: PRECIOS_IA[m.id] })),
      modeloAnalisis: ia.modeloAnalisis,
      presupuesto: {
        mensualUsd: ia.presupuestoMensualUsd, gastadoUsd: gasto.organizacion,
        limiteUsuarioUsd: ia.limiteUsuarioMensualUsd, gastadoUsuarioUsd: gasto.usuario
      }
    });
  });

  /** Generar un proceso desde el texto de las fuentes (sustituye a aiBuildProcess). */
  r.post('/generaciones', async (c) => {
    const yo = c.get('usuario');
    const d = await cuerpo(c, GeneracionEsquema);
    const { proceso } = await accesoProceso(c.get('db'), yo, d.procesoId, 'escribir');
    const ia = c.get('config').ia;
    // El servidor decide el modelo: si no permite el pedido, usa el primero permitido y lo dice
    const modelo = d.modelo && ia.modelosPermitidos.includes(d.modelo) ? d.modelo : ia.modelosPermitidos[0]!;
    const modeloSustituido = d.modelo && d.modelo !== modelo ? { pedido: d.modelo, usado: modelo } : null;
    await exigirIaDisponible(c, yo);
    const e = await encolar(c, {
      organizacionId: yo.organizacionId, procesoId: proceso.id, usuarioId: yo.id, tipo: 'generacion', modelo,
      parametros: { etiqueta: d.etiqueta, vista: d.vista, roles: d.roles ?? null, variasFuentes: d.variasFuentes, fuentes: d.fuentes, caracteres: d.texto.length },
      texto: d.texto
    });
    await registrar(c, 'ia.generacion', 'proceso', proceso.id, {
      ejecucionId: e.id, modelo, ...(modeloSustituido ? { modeloPedido: modeloSustituido.pedido } : {}),
      caracteres: d.texto.length, fuentes: d.fuentes.map((f) => f.nombre)
    });
    return c.json({ ejecucion: publica(e, false), modeloSustituido }, 202);
  });

  /** Análisis del proceso: pains o una tarea del copiloto (sustituye a aiAnalyzePains y runAiTask). */
  r.post('/analisis', async (c) => {
    const yo = c.get('usuario');
    const d = await cuerpo(c, AnalisisEsquema);
    const { proceso } = await accesoProceso(c.get('db'), yo, d.procesoId, 'escribir');
    const m = migrarProyecto(d.contenido);
    if (!m.ok) throw new ErrorHttp(400, 'El proceso no es válido.', 'PROCESO_INVALIDO', m.errores);
    if (m.proyecto.nodes.length === 0) throw new ErrorHttp(400, 'No hay proceso que analizar.', 'PROCESO_VACIO');
    await exigirIaDisponible(c, yo);
    const p = m.proyecto;
    const resumen = resumenProcesoParaIa({ meta: p.meta, nodes: p.nodes, edges: p.edges, lanes: (p.lanes as never) ?? null });
    const e = await encolar(c, {
      organizacionId: yo.organizacionId, procesoId: proceso.id, usuarioId: yo.id,
      tipo: d.tipo === 'pains' ? 'pains' : 'tarea', tarea: d.tipo === 'pains' ? null : d.tipo,
      modelo: c.get('config').ia.modeloAnalisis, parametros: { nodos: p.nodes.length }, texto: resumen
    });
    await registrar(c, 'ia.analisis', 'proceso', proceso.id, { ejecucionId: e.id, tipo: d.tipo });
    return c.json({ ejecucion: publica(e, false) }, 202);
  });

  r.get('/ejecuciones/:id', async (c) => {
    const e = await accesoEjecucion(c, c.req.param('id'), 'leer');
    return c.json({ ejecucion: publica(e, true) });
  });

  /** Progreso en vivo (SSE). Cada evento trae el estado completo: reconectar es seguro. */
  r.get('/ejecuciones/:id/eventos', async (c) => {
    const inicial = await accesoEjecucion(c, c.req.param('id'), 'leer');
    const db = c.get('db'), escucha = c.get('escucha');
    return streamSSE(c, async (stream) => {
      const reloj = despertador();
      let cerrada = false;
      stream.onAbort(() => { cerrada = true; reloj.despertar(); });
      const quitar = escucha?.suscribir(CANAL_EJECUCION, (id) => { if (id === inicial.id) reloj.despertar(); });
      let ultimo = '';
      try {
        for (;;) {
          const [e] = await db.select().from(ejecucionesIa).where(eq(ejecucionesIa.id, inicial.id)).limit(1);
          if (!e) break;
          const fin = TERMINALES.has(e.estado);
          const datos = JSON.stringify(publica(e, fin));
          if (datos !== ultimo) {
            ultimo = datos;
            await stream.writeSSE({ event: 'estado', data: datos });
          } else {
            await stream.write(': latido\n\n');
          }
          if (fin || cerrada) break;
          await reloj.esperar(sondeoMs);
          if (cerrada) break;
        }
      } finally {
        quitar?.();
      }
    });
  });

  r.post('/ejecuciones/:id/cancelar', async (c) => {
    const e = await accesoEjecucion(c, c.req.param('id'), 'escribir');
    const db = c.get('db');
    if (TERMINALES.has(e.estado)) return c.json({ ejecucion: publica(e, false) });
    // En cola: se cancela ya. Ejecutando: el worker lo ve en su vigilancia y aborta la llamada.
    const [act] = await db.update(ejecucionesIa).set(e.estado === 'en_cola'
      ? { cancelar: true, estado: 'cancelada', texto: null, terminadoEn: new Date(), actualizadoEn: new Date() }
      : { cancelar: true, actualizadoEn: new Date() })
      .where(eq(ejecucionesIa.id, e.id)).returning();
    await avisar(db, CANAL_EJECUCION, e.id);
    await registrar(c, 'ia.cancelacion', 'proceso', e.procesoId, { ejecucionId: e.id });
    return c.json({ ejecucion: publica(act!, false) });
  });

  /** Una generación terminada que no se quiere aplicar: deja de ofrecerse al abrir el proceso. */
  r.post('/ejecuciones/:id/descartar', async (c) => {
    const e = await accesoEjecucion(c, c.req.param('id'), 'escribir');
    const [act] = await c.get('db').update(ejecucionesIa).set({ descartada: true }).where(eq(ejecucionesIa.id, e.id)).returning();
    return c.json({ ejecucion: publica(act!, false) });
  });

  /** Ejecuciones de un proceso; «pendientes» = generaciones terminadas que aún no se dibujaron ni descartaron. */
  r.get('/procesos/:id', async (c) => {
    const db = c.get('db');
    const { proceso } = await accesoProceso(db, c.get('usuario'), c.req.param('id'), 'leer');
    const lista = await db.select().from(ejecucionesIa).where(eq(ejecucionesIa.procesoId, proceso.id))
      .orderBy(desc(ejecucionesIa.creadoEn)).limit(20);
    const pendientes = lista.filter((e) => e.tipo === 'generacion' && e.estado === 'completada' && !e.revisionId && !e.descartada);
    return c.json({ ejecuciones: lista.map((e) => publica(e, false)), pendientes: pendientes.map((e) => publica(e, true)) });
  });

  /** Consumo de IA de la organización (solo administradores). */
  r.get('/consumo', async (c) => {
    const yo = c.get('usuario');
    exigirAdmin(yo);
    const db = c.get('db'), ia = c.get('config').ia;
    const delMes = and(eq(ejecucionesIa.organizacionId, yo.organizacionId), gte(ejecucionesIa.creadoEn, inicioDelMes()));
    const porUsuario = await db.select({
      usuarioId: ejecucionesIa.usuarioId, nombre: usuarios.nombre, email: usuarios.email,
      ejecuciones: sql<number>`count(*)::int`,
      costeUsd: sql<number>`coalesce(sum(${ejecucionesIa.costeUsd}), 0)::float8`
    }).from(ejecucionesIa).innerJoin(usuarios, eq(usuarios.id, ejecucionesIa.usuarioId))
      .where(delMes).groupBy(ejecucionesIa.usuarioId, usuarios.nombre, usuarios.email)
      .orderBy(desc(sql`sum(${ejecucionesIa.costeUsd})`));
    const recientes = await db.select({
      id: ejecucionesIa.id, procesoId: ejecucionesIa.procesoId, tipo: ejecucionesIa.tipo, tarea: ejecucionesIa.tarea,
      modelo: ejecucionesIa.modelo, estado: ejecucionesIa.estado, error: ejecucionesIa.error, intentos: ejecucionesIa.intentos,
      tokensEntrada: ejecucionesIa.tokensEntrada, tokensSalida: ejecucionesIa.tokensSalida, costeUsd: ejecucionesIa.costeUsd,
      creadoEn: ejecucionesIa.creadoEn, terminadoEn: ejecucionesIa.terminadoEn, usuario: usuarios.email
    }).from(ejecucionesIa).innerJoin(usuarios, eq(usuarios.id, ejecucionesIa.usuarioId))
      .where(eq(ejecucionesIa.organizacionId, yo.organizacionId)).orderBy(desc(ejecucionesIa.creadoEn)).limit(50);
    const total = porUsuario.reduce((s, u) => s + Number(u.costeUsd), 0);
    return c.json({
      mes: { gastadoUsd: total, presupuestoUsd: ia.presupuestoMensualUsd, limiteUsuarioUsd: ia.limiteUsuarioMensualUsd },
      porUsuario: porUsuario.map((u) => ({ ...u, costeUsd: Number(u.costeUsd) })),
      recientes
    });
  });

  return r;
}
