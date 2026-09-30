// Colaboración en tiempo real (ADR 21): presencia por proceso y eventos en vivo
// por SSE, contra Postgres real.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { presencias, type Conexion } from '@processiq/db';
import { crearApp } from '../app.js';
import { Escucha } from '../ia/avisos.js';
import { URL_PRUEBAS, cerrarBase, cliente, config, prepararBase, usuario, vaciar } from '../pruebas/entorno.js';
import { CANAL_PROCESOS } from './index.js';

const SINIESTROS = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../packages/dominio/src/__fixtures__/mvp-3.8.9-siniestros.json'), 'utf8'));

let conexion: Conexion;
beforeAll(async () => { conexion = await prepararBase(); });
afterAll(cerrarBase);
beforeEach(vaciar);

type Cliente = ReturnType<typeof cliente>;

/**
 * Ana es propietaria de «Proyecto Andes»; Luis, editor; Lola, lectora. Pepe es de
 * la organización pero no participa. «Siniestros» tiene una revisión y hay un
 * segundo proceso en el mismo proyecto.
 */
async function escenario() {
  const u = { ana: await usuario('ana@mbc.pe'), luis: await usuario('luis@mbc.pe'), lola: await usuario('lola@mbc.pe', 'lector'), pepe: await usuario('pepe@mbc.pe') };
  const c = { ana: cliente(), luis: cliente(), lola: cliente(), pepe: cliente() };
  for (const k of Object.keys(c) as (keyof typeof c)[]) await c[k].entrar(`${k}@mbc.pe`);
  const { proyecto } = (await c.ana.post('/api/proyectos', { nombre: 'Proyecto Andes', cliente: 'Aseguradora Sur' })).json;
  await c.ana.put(`/api/proyectos/${proyecto.id}/miembros/${u.luis.id}`, { rol: 'editor' });
  await c.ana.put(`/api/proyectos/${proyecto.id}/miembros/${u.lola.id}`, { rol: 'lector' });
  const a = (await c.ana.post(`/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Gestión de siniestros', contenido: SINIESTROS })).json;
  const otro = (await c.ana.post(`/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Otro proceso', contenido: SINIESTROS })).json;
  return { u, c, proyectoId: proyecto.id as string, procesoId: a.proceso.id as string, v1: a.revision.id as string, otroId: otro.proceso.id as string };
}

const PESTANA = { ana: 'pestana-ana-editor', ana2: 'pestana-ana-shell', luis: 'pestana-luis-editor', lola: 'pestana-lola-shell' };
const latido = (quien: Cliente, procesoId: string, pestana: string, extra: Record<string, string> = {}) =>
  quien.put(`/api/procesos/${procesoId}/presencia`, { pestana, lugar: 'editor', estado: 'viendo', ...extra });
const presentes = async (quien: Cliente, procesoId: string) => (await quien.get(`/api/procesos/${procesoId}/presencia`)).json.presencias;
const filas = async () => (await conexion.pool.query('select count(*)::int as n from presencias')).rows[0].n as number;
/** Envejece los latidos de todas las pestañas (como si dejaran de latir hace `segundos`). */
const envejecer = (segundos: number) => conexion.db.update(presencias).set({ ultimoLatido: sql`now() - make_interval(secs => ${segundos})` });

type Evento = { event: string; data: any };
/**
 * Abre el SSE de un proceso y va leyendo sus eventos. `esperar` lee hasta que los
 * eventos recibidos cumplen la condición (o falla a los `ms`); `cerrar` corta la conexión.
 */
async function conectar(quien: Cliente, procesoId: string, pestana?: string, app = quien.app) {
  const res = await app.request(`/api/procesos/${procesoId}/eventos${pestana ? `?pestana=${pestana}` : ''}`, { headers: { cookie: quien.cookie } });
  const eventos: Evento[] = [];
  let texto = '';
  let terminado = false;
  const lector = res.status === 200 ? res.body!.getReader() : null;
  const decodificador = new TextDecoder();
  async function leer(): Promise<boolean> {
    const { done, value } = await lector!.read();
    if (done) { terminado = true; return false; }
    texto += decodificador.decode(value, { stream: true });
    let i;
    while ((i = texto.indexOf('\n\n')) >= 0) {
      const bloque = texto.slice(0, i);
      texto = texto.slice(i + 2);
      const event = /^event: (.*)$/m.exec(bloque)?.[1];
      const data = /^data: (.*)$/m.exec(bloque)?.[1];
      if (event && data !== undefined) eventos.push({ event, data: JSON.parse(data) });
    }
    return true;
  }
  return {
    res, eventos,
    get terminado() { return terminado; },
    async esperar(condicion: (e: Evento[]) => boolean, ms = 5000) {
      const limite = Date.now() + ms;
      while (!condicion(eventos)) {
        if (terminado) throw new Error('El SSE terminó antes de cumplirse la condición');
        const r = await Promise.race([leer(), new Promise<'tiempo'>((listo) => setTimeout(() => listo('tiempo'), Math.max(0, limite - Date.now())))]);
        if (r === 'tiempo') throw new Error(`Tiempo agotado; eventos: ${JSON.stringify(eventos)}`);
      }
      return eventos;
    },
    /** Lee hasta que el servidor cierra la conexión. */
    async hastaElFinal(ms = 5000) {
      const limite = Date.now() + ms;
      while (!terminado) {
        const r = await Promise.race([leer(), new Promise<'tiempo'>((listo) => setTimeout(() => listo('tiempo'), Math.max(0, limite - Date.now())))]);
        if (r === 'tiempo') throw new Error('El SSE no se cerró');
      }
    },
    cerrar: () => lector?.cancel().catch(() => {})
  };
}
const ultimo = (eventos: Evento[], tipo: string) => eventos.filter((e) => e.event === tipo).at(-1)?.data;
const nombres = (lista: { nombre: string }[] | undefined) => (lista ?? []).map((p) => p.nombre);

describe('colaboración: presencia', () => {
  it('el latido registra la pestaña y todos los que pueden leer el proceso ven quién está, una vez por persona', async () => {
    const { c, u, procesoId } = await escenario();
    const r = await latido(c.ana, procesoId, PESTANA.ana, { estado: 'editando' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ estado: 'editando', latidoS: 20, caducidadS: 60 });
    expect(r.json.presencias).toEqual([
      { usuarioId: u.ana.id, nombre: 'ana', estado: 'editando', lugares: ['editor'], desde: expect.any(String), revisiones: [], yo: true }
    ]);
    // La misma persona en el shell: sigue siendo una entrada, «editando» si alguna pestaña edita
    await latido(c.ana, procesoId, PESTANA.ana2, { lugar: 'shell' });
    await latido(c.luis, procesoId, PESTANA.luis);
    const vistaLola = await presentes(c.lola, procesoId);   // la lectora también la ve
    expect(vistaLola).toMatchObject([
      { nombre: 'ana', estado: 'editando', lugares: ['editor', 'shell'], yo: false },
      { nombre: 'luis', estado: 'viendo', lugares: ['editor'], yo: false }
    ]);
    // Ana deja de editar (guardó): el estado vuelve a «viendo»
    await latido(c.ana, procesoId, PESTANA.ana, { estado: 'viendo' });
    expect((await presentes(c.luis, procesoId))[0]).toMatchObject({ nombre: 'ana', estado: 'viendo' });
    expect(await filas()).toBe(3);
    // Nada queda en la auditoría: la presencia no tiene histórico
    expect((await conexion.pool.query("select count(*)::int as n from auditoria where accion like '%presencia%'")).rows[0].n).toBe(0);
  });

  it('solo «edita» quien puede guardar: una lectora que cambia algo cuenta como «viendo»', async () => {
    const { c, procesoId } = await escenario();
    const r = await latido(c.lola, procesoId, PESTANA.lola, { estado: 'editando' });
    expect(r.json.estado).toBe('viendo');
    expect(await presentes(c.ana, procesoId)).toMatchObject([{ nombre: 'lola', estado: 'viendo' }]);
  });

  it('en un proyecto archivado nadie «edita»', async () => {
    const { c, proyectoId, procesoId } = await escenario();
    await c.ana.patch(`/api/proyectos/${proyectoId}`, { archivado: true });
    expect((await latido(c.ana, procesoId, PESTANA.ana, { estado: 'editando' })).json.estado).toBe('viendo');
  });

  it('sin latido en 60 s la presencia caduca: deja de verse y el siguiente latido la borra', async () => {
    const { c, procesoId, otroId } = await escenario();
    await latido(c.ana, procesoId, PESTANA.ana);
    await latido(c.luis, otroId, PESTANA.luis);
    await envejecer(59);
    expect(nombres(await presentes(c.lola, procesoId))).toEqual(['ana']);   // aún no
    await envejecer(61);
    expect(await presentes(c.lola, procesoId)).toEqual([]);
    expect(await filas()).toBe(2);   // no se ve, pero sigue en la tabla hasta el siguiente latido
    await latido(c.lola, procesoId, PESTANA.lola);
    // Se borraron las dos caducadas (también la del otro proceso) y queda solo la nueva
    expect((await conexion.pool.query('select pestana from presencias')).rows).toEqual([{ pestana: PESTANA.lola }]);
  });

  it('al cerrar la pestaña se borra su presencia (y solo la suya)', async () => {
    const { c, procesoId } = await escenario();
    await latido(c.ana, procesoId, PESTANA.ana);
    await latido(c.ana, procesoId, PESTANA.ana2, { lugar: 'shell' });
    await latido(c.luis, procesoId, PESTANA.luis);
    expect((await c.ana.del(`/api/procesos/${procesoId}/presencia?pestana=${PESTANA.ana}`)).status).toBe(204);
    expect(await presentes(c.lola, procesoId)).toMatchObject([{ nombre: 'ana', lugares: ['shell'] }, { nombre: 'luis' }]);
    // Ana no puede cerrar la pestaña de Luis: solo se borran las propias
    await c.ana.del(`/api/procesos/${procesoId}/presencia?pestana=${PESTANA.luis}`);
    expect(nombres(await presentes(c.lola, procesoId))).toEqual(['ana', 'luis']);
    expect((await c.ana.del(`/api/procesos/${procesoId}/presencia`)).status).toBe(400);
  });

  it('permisos: sin acceso al proceso, 404 en todo; sin sesión, 401; datos inválidos, 400', async () => {
    const { c, procesoId } = await escenario();
    await latido(c.ana, procesoId, PESTANA.ana);
    expect((await c.pepe.get(`/api/procesos/${procesoId}/presencia`)).status).toBe(404);
    expect((await latido(c.pepe, procesoId, 'pestana-de-pepe')).status).toBe(404);
    expect((await c.pepe.del(`/api/procesos/${procesoId}/presencia?pestana=pestana-de-pepe`)).status).toBe(404);
    expect((await c.pepe.get(`/api/procesos/${procesoId}/eventos`)).status).toBe(404);
    expect((await c.ana.get('/api/procesos/no-es-un-uuid/presencia')).status).toBe(404);
    expect(await filas()).toBe(1);   // Pepe no dejó rastro

    const anonimo = cliente();
    expect((await anonimo.get(`/api/procesos/${procesoId}/presencia`)).status).toBe(401);
    expect((await anonimo.get(`/api/procesos/${procesoId}/eventos`)).status).toBe(401);

    expect((await latido(c.ana, procesoId, 'x')).status).toBe(400);                         // pestaña corta
    expect((await latido(c.ana, procesoId, 'pestana con espacios')).status).toBe(400);
    expect((await latido(c.ana, procesoId, PESTANA.ana, { lugar: 'otro' })).status).toBe(400);
    expect((await latido(c.ana, procesoId, PESTANA.ana, { estado: 'bloqueando' })).status).toBe(400);
  });

  it('cada persona dice qué revisión tiene abierta; si ya no es la última, se marca', async () => {
    const { c, u, procesoId, v1, otroId } = await escenario();
    // Ana abre la v1 en el editor; Lola mira la página del proceso (sin revisión)
    await latido(c.ana, procesoId, PESTANA.ana, { revisionId: v1 });
    await latido(c.lola, procesoId, PESTANA.lola, { lugar: 'shell' });
    expect(await presentes(c.luis, procesoId)).toMatchObject([
      { nombre: 'ana', revisiones: [{ id: v1, numero: 1, ultima: true }] },
      { nombre: 'lola', revisiones: [] }
    ]);
    // Luis guarda la v2: la v1 de Ana pasa a ser una versión anterior
    const v2 = (await c.luis.post(`/api/procesos/${procesoId}/revisiones`, { contenido: SINIESTROS, mensaje: 'v2', padreId: v1 })).json.revision.id;
    expect((await presentes(c.lola, procesoId))[0].revisiones).toEqual([{ id: v1, numero: 1, ultima: false }]);
    // Luis tiene la v2 abierta en dos pestañas y la v1 en otra: una entrada, de la más antigua a la más nueva y sin repetir
    await latido(c.luis, procesoId, PESTANA.luis, { revisionId: v2 });
    await latido(c.luis, procesoId, 'pestana-luis-editor-2', { revisionId: v2 });
    await latido(c.luis, procesoId, 'pestana-luis-editor-3', { revisionId: v1 });
    expect((await presentes(c.ana, procesoId)).find((p: any) => p.usuarioId === u.luis.id).revisiones).toEqual([
      { id: v1, numero: 1, ultima: false }, { id: v2, numero: 2, ultima: true }
    ]);
    // La revisión tiene que ser de este proceso: si no, 400 y la presencia no cambia
    const deOtro = (await c.ana.get(`/api/procesos/${otroId}`)).json.revisiones[0].id;
    const r = await latido(c.ana, procesoId, PESTANA.ana, { revisionId: deOtro });
    expect(r.status).toBe(400);
    expect(r.json.error.codigo).toBe('VALIDACION');
    expect((await latido(c.ana, procesoId, PESTANA.ana, { revisionId: 'no-es-un-uuid' })).status).toBe(400);
    expect((await presentes(c.lola, procesoId))[0].revisiones).toEqual([{ id: v1, numero: 1, ultima: false }]);
    // Sin revisionId (una versión anterior de la web, o el shell) queda sin revisión
    await latido(c.ana, procesoId, PESTANA.ana);
    expect((await presentes(c.lola, procesoId))[0].revisiones).toEqual([]);
  });

  it('si se borra la revisión abierta, la presencia sigue sin ella (set null)', async () => {
    const { c, procesoId, v1 } = await escenario();
    const v2 = (await c.ana.post(`/api/procesos/${procesoId}/revisiones`, { contenido: SINIESTROS, mensaje: 'v2', padreId: v1 })).json.revision.id;
    await latido(c.ana, procesoId, PESTANA.ana, { revisionId: v2 });
    await conexion.pool.query('delete from revisiones where id = $1', [v2]);
    expect(await filas()).toBe(1);
    expect(await presentes(c.luis, procesoId)).toMatchObject([{ nombre: 'ana', revisiones: [] }]);
  });

  it('borrar el proceso o la cuenta borra su presencia', async () => {
    const { c, u, procesoId, otroId } = await escenario();
    await latido(c.ana, procesoId, PESTANA.ana);
    await latido(c.luis, otroId, PESTANA.luis);
    await conexion.pool.query('delete from procesos where id = $1', [procesoId]);
    await conexion.pool.query('delete from usuarios where id = $1', [u.luis.id]);
    expect(await filas()).toBe(0);
  });
});

describe('colaboración: eventos en vivo (SSE)', () => {
  it('al conectar llegan la presencia y la última revisión; después, cada cambio', async () => {
    const { c, u, procesoId, v1 } = await escenario();
    await latido(c.ana, procesoId, PESTANA.ana);
    const sse = await conectar(c.lola, procesoId);   // la lectora también recibe
    expect(sse.res.status).toBe(200);
    expect(sse.res.headers.get('content-type')).toContain('text/event-stream');
    await sse.esperar((e) => !!ultimo(e, 'presencia') && !!ultimo(e, 'revision'));
    expect(ultimo(sse.eventos, 'presencia').presencias).toMatchObject([{ nombre: 'ana', estado: 'viendo', yo: false }]);
    expect(ultimo(sse.eventos, 'revision').revision).toMatchObject({ id: v1, numero: 1, autorId: u.ana.id, autor: 'ana' });

    // Luis llega y empieza a editar
    await latido(c.luis, procesoId, PESTANA.luis, { estado: 'editando' });
    await sse.esperar((e) => nombres(ultimo(e, 'presencia')?.presencias).includes('luis'));
    expect(ultimo(sse.eventos, 'presencia').presencias[1]).toMatchObject({ nombre: 'luis', estado: 'editando' });

    // Luis guarda: revisión nueva con número, autor y mensaje
    const guardada = await c.luis.post(`/api/procesos/${procesoId}/revisiones`, { contenido: SINIESTROS, mensaje: 'Ajuste de la ficha', padreId: v1 });
    expect(guardada.status).toBe(201);
    await sse.esperar((e) => ultimo(e, 'revision')?.revision?.numero === 2);
    expect(ultimo(sse.eventos, 'revision').revision).toMatchObject({
      id: guardada.json.revision.id, numero: 2, autorId: u.luis.id, autor: 'luis', mensaje: 'Ajuste de la ficha', estado: 'borrador'
    });

    // Ana cierra su pestaña
    await c.ana.del(`/api/procesos/${procesoId}/presencia?pestana=${PESTANA.ana}`);
    await sse.esperar((e) => !nombres(ultimo(e, 'presencia')?.presencias).includes('ana'));
    // Cada evento se envía solo si cambió: una revisión por guardado
    expect(sse.eventos.filter((e) => e.event === 'revision')).toHaveLength(2);
    await sse.cerrar();
  });

  it('el evento «estado» trae el estado de cada revisión al conectar y cada vez que alguna cambia', async () => {
    const { c, u, procesoId, proyectoId, v1 } = await escenario();
    await c.ana.put(`/api/proyectos/${proyectoId}/miembros/${u.pepe.id}`, { rol: 'revisor' });
    const v2 = (await c.luis.post(`/api/procesos/${procesoId}/revisiones`, { contenido: SINIESTROS, mensaje: 'v2', padreId: v1 })).json.revision.id;
    const sse = await conectar(c.lola, procesoId);
    await sse.esperar((e) => !!ultimo(e, 'estado'));
    expect(ultimo(sse.eventos, 'estado').revisiones).toEqual([
      { id: v2, numero: 2, estado: 'borrador' }, { id: v1, numero: 1, estado: 'borrador' }
    ]);
    // La v1 (que no es la última) pasa a revisión y la aprueban: llega aunque la última no cambie
    expect((await c.ana.post(`/api/revisiones/${v1}/estado`, { estado: 'en_revision' })).status).toBe(200);
    await sse.esperar((e) => ultimo(e, 'estado')?.revisiones[1].estado === 'en_revision');
    expect((await c.pepe.post(`/api/revisiones/${v1}/estado`, { estado: 'aprobada' })).status).toBe(200);
    await sse.esperar((e) => ultimo(e, 'estado')?.revisiones[1].estado === 'aprobada');
    expect(sse.eventos.filter((e) => e.event === 'revision')).toHaveLength(1);   // la última (v2) no cambió
    // Una transición rechazada no cambia nada
    expect((await c.ana.post(`/api/revisiones/${v2}/estado`, { estado: 'aprobada' })).status).toBe(409);
    await new Promise((r) => setTimeout(r, 200));
    expect(sse.eventos.filter((e) => e.event === 'estado')).toHaveLength(3);
    await sse.cerrar();
  });

  it('una presencia que caduca desaparece del SSE sin que nadie avise', async () => {
    const { c, procesoId } = await escenario();
    await latido(c.ana, procesoId, PESTANA.ana);
    const sse = await conectar(c.luis, procesoId);
    await sse.esperar((e) => nombres(ultimo(e, 'presencia')?.presencias).includes('ana'));
    await envejecer(61);
    await sse.esperar((e) => ultimo(e, 'presencia')?.presencias.length === 0);
    await sse.cerrar();
  });

  it('solo lo recibe quien tiene acceso, y solo de ese proceso', async () => {
    const { c, u, procesoId, otroId, proyectoId, v1 } = await escenario();
    const sse = await conectar(c.lola, procesoId);
    await sse.esperar((e) => !!ultimo(e, 'revision'));
    // Actividad en el otro proceso: no llega a este SSE
    await latido(c.ana, otroId, PESTANA.ana);
    await c.ana.post(`/api/procesos/${otroId}/revisiones`, { contenido: SINIESTROS, mensaje: 'En el otro' });
    await new Promise((r) => setTimeout(r, 300));
    expect(ultimo(sse.eventos, 'presencia').presencias).toEqual([]);
    expect(sse.eventos.filter((e) => e.event === 'revision')).toHaveLength(1);

    // Sacan a Lola del proyecto: su SSE se cierra y no recibe lo que viene después
    await c.ana.del(`/api/proyectos/${proyectoId}/miembros/${u.lola.id}`);
    await sse.hastaElFinal();
    await c.ana.post(`/api/procesos/${procesoId}/revisiones`, { contenido: SINIESTROS, mensaje: 'Ya no lo ve', padreId: v1 });
    expect(sse.eventos.some((e) => JSON.stringify(e.data).includes('Ya no lo ve'))).toBe(false);
    expect((await c.lola.get(`/api/procesos/${procesoId}/eventos`)).status).toBe(404);
  });

  it('al cerrar la sesión, el SSE se corta', async () => {
    const { c, procesoId } = await escenario();
    const sse = await conectar(c.luis, procesoId);
    await sse.esperar((e) => !!ultimo(e, 'revision'));
    const cookie = c.luis.cookie;
    await c.luis.del('/api/sesion');
    expect(cookie).not.toBe('');
    await sse.hastaElFinal();
  });

  it('mientras el SSE de una pestaña sigue abierto, su latido se renueva (pestañas en segundo plano)', async () => {
    const { c, procesoId } = await escenario();
    await latido(c.ana, procesoId, PESTANA.ana);
    await envejecer(50);
    const sse = await conectar(c.ana, procesoId, PESTANA.ana);
    await sse.esperar((e) => !!ultimo(e, 'presencia'));
    const { rows } = await conexion.pool.query("select extract(epoch from now() - ultimo_latido)::float8 as s from presencias");
    expect(rows[0].s).toBeLessThan(5);
    await sse.cerrar();
    // Una pestaña que nunca dio latido no aparece solo por conectarse
    const otra = await conectar(c.luis, procesoId, PESTANA.luis);
    await otra.esperar((e) => !!ultimo(e, 'presencia'));
    expect(nombres(ultimo(otra.eventos, 'presencia').presencias)).toEqual(['ana']);
    await otra.cerrar();
  });

  it('con LISTEN/NOTIFY, el aviso llega al momento aunque el sondeo sea lento', async () => {
    const { c, procesoId, v1 } = await escenario();
    const escucha = new Escucha(URL_PRUEBAS, [CANAL_PROCESOS]);
    await escucha.iniciar();
    try {
      const app = crearApp(conexion.db, config, { escucha, sondeoMs: 60_000 });
      const sse = await conectar(c.lola, procesoId, undefined, app);
      await sse.esperar((e) => !!ultimo(e, 'revision') && !!ultimo(e, 'presencia'));
      const t0 = Date.now();
      await latido(c.luis, procesoId, PESTANA.luis, { estado: 'editando' });
      await sse.esperar((e) => nombres(ultimo(e, 'presencia')?.presencias).includes('luis'), 3000);
      await c.luis.post(`/api/procesos/${procesoId}/revisiones`, { contenido: SINIESTROS, mensaje: 'Al momento', padreId: v1 });
      await sse.esperar((e) => ultimo(e, 'revision')?.revision?.mensaje === 'Al momento', 3000);
      expect(Date.now() - t0).toBeLessThan(3000);
      await sse.cerrar();
    } finally {
      await escucha.cerrar();
    }
  });

  it('con LISTEN/NOTIFY, el cambio de estado de una revisión y la revisión abierta llegan al momento', async () => {
    const { c, u, procesoId, v1 } = await escenario();
    const escucha = new Escucha(URL_PRUEBAS, [CANAL_PROCESOS]);
    await escucha.iniciar();
    try {
      const app = crearApp(conexion.db, config, { escucha, sondeoMs: 60_000 });
      await latido(c.luis, procesoId, PESTANA.luis);
      const sse = await conectar(c.lola, procesoId, undefined, app);
      await sse.esperar((e) => !!ultimo(e, 'estado') && !!ultimo(e, 'presencia'));
      const t0 = Date.now();
      // Enviar a revisión: el aviso sale al confirmar la transacción del cambio de estado
      await c.ana.post(`/api/revisiones/${v1}/estado`, { estado: 'en_revision' });
      await sse.esperar((e) => ultimo(e, 'estado')?.revisiones[0].estado === 'en_revision', 3000);
      expect(ultimo(sse.eventos, 'revision').revision).toMatchObject({ id: v1, estado: 'en_revision' });
      // Luis abre la v1 en el editor sin cambiar de estado: también avisa
      await latido(c.luis, procesoId, PESTANA.luis, { revisionId: v1 });
      await sse.esperar((e) => ultimo(e, 'presencia')?.presencias[0]?.revisiones?.length === 1, 3000);
      expect(ultimo(sse.eventos, 'presencia').presencias[0]).toMatchObject({ usuarioId: u.luis.id, revisiones: [{ id: v1, numero: 1, ultima: true }] });
      // Ana guarda la v2: la v1 de Luis pasa a «anterior» en el mismo aviso
      await c.ana.post(`/api/procesos/${procesoId}/revisiones`, { contenido: SINIESTROS, mensaje: 'v2', padreId: v1 });
      await sse.esperar((e) => ultimo(e, 'presencia')?.presencias[0]?.revisiones?.[0]?.ultima === false, 3000);
      expect(Date.now() - t0).toBeLessThan(3000);
      await sse.cerrar();
    } finally {
      await escucha.cerrar();
    }
  });
});
