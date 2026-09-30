// IA en el servidor: API + cola + worker contra Postgres real, con un fetch
// falso que imita el streaming de Anthropic (sin red ni gasto).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { ejecucionesIa, type Conexion } from '@processiq/db';
import { MATRICES_IA, PROMPT_GENERACION, PROMPT_MATRICES, PROMPT_REPARACION, ROL_ANALISTA, sistemaReparacionMatriz, usd } from '@processiq/ia';
import { despertador } from './ia/avisos.js';
import { reencolarHuerfanas, tomarSiguiente } from './ia/cola.js';
import { ejecutar } from './ia/ejecutar.js';
import { cerrarBase, cliente, config, prepararBase, usuario, vaciar } from './pruebas/entorno.js';

const EXPORT_MVP = JSON.parse(readFileSync(join(import.meta.dirname, '../../../packages/dominio/src/__fixtures__/mvp-3.8.9-siniestros.json'), 'utf8'));
const SPEC = {
  meta: { name: 'Atención de reclamos' },
  nodes: [
    { k: 'a1', type: 'start', label: 'Llega el reclamo' },
    { k: 'a2', type: 'task', label: 'Registrar el reclamo', owner: 'Mesa de ayuda' },
    { k: 'a3', type: 'end', label: 'Reclamo atendido' }
  ],
  edges: [{ from: 'a1', to: 'a2' }, { from: 'a2', to: 'a3' }]
};
const TEXTO = 'El cliente llama a la mesa de ayuda, que registra el reclamo y lo deriva al área responsable.';

let conexion: Conexion;
beforeAll(async () => { conexion = await prepararBase(); });
afterAll(cerrarBase);
beforeEach(vaciar);

// ------------------------------------------------------------ Anthropic falso
const sse = (eventos: object[]) => eventos.map((e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
function respuestaClaude(texto: string, { entrada = 1000, salida = 500, modelo = 'claude-opus-5' } = {}) {
  return new Response(sse([
    { type: 'message_start', message: { model: modelo, usage: { input_tokens: entrada } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: texto } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: salida } }
  ]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
type Fabrica = (init: RequestInit) => Response;
function fetchFalso(...respuestas: Fabrica[]) {
  let i = 0;
  return vi.fn(async (_url: string, init: RequestInit) => respuestas[Math.min(i++, respuestas.length - 1)]!(init));
}
const cuerpoDe = (f: ReturnType<typeof fetchFalso>, n = 0) => JSON.parse(String((f.mock.calls[n]![1] as RequestInit).body));

const dependencias = (f: ReturnType<typeof fetchFalso>, extra: object = {}) => ({
  db: conexion.db, claveAnthropic: 'sk-ant-prueba', fetch: f as unknown as typeof fetch,
  esperar: async () => {}, intervaloVigilanciaMs: 20, topes: config.ia, ...extra
});
async function procesarCola(f: ReturnType<typeof fetchFalso>, extra: object = {}) {
  const e = await tomarSiguiente(conexion.db);
  expect(e, 'había una ejecución en la cola').not.toBeNull();
  await ejecutar(dependencias(f, extra), e!);
  return e!;
}
/** Empieza la respuesta (message_start con 1000 tokens de entrada y algo de texto) y después se corta la red o se queda colgada hasta que se aborta. */
function cortada(corte: 'red' | 'colgada'): Fabrica {
  return (init) => {
    let n = 0;
    return new Response(new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (n++ === 0) {
          ctrl.enqueue(new TextEncoder().encode(sse([
            { type: 'message_start', message: { model: 'claude-opus-5', usage: { input_tokens: 1000 } } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"nodes":[' } }
          ])));
          return;
        }
        if (corte === 'red') { ctrl.error(new TypeError('terminated')); return; }
        return new Promise<void>((listo) => init.signal!.addEventListener('abort', () => {
          ctrl.error(Object.assign(new Error('abortada'), { name: 'AbortError' }));
          listo();
        }));
      }
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
}
const fila = async (id: string) => (await conexion.db.select().from(ejecucionesIa).where(eq(ejecucionesIa.id, id)))[0]!;

// ------------------------------------------------------------ equipo de prueba
async function equipo() {
  const u = {
    admin: await usuario('admin@mbc.pe', 'admin'),
    ana: await usuario('ana@mbc.pe'),       // propietaria
    rosa: await usuario('rosa@mbc.pe')      // revisora: no escribe, no gasta IA
  };
  const c = { admin: cliente(), ana: cliente(), rosa: cliente() };
  for (const k of Object.keys(c) as (keyof typeof c)[]) await c[k].entrar(`${k}@mbc.pe`);
  const p = (await c.ana.post('/api/proyectos', { nombre: 'Reclamos' })).json.proyecto;
  await c.ana.put(`/api/proyectos/${p.id}/miembros/${u.rosa.id}`, { rol: 'revisor' });
  const proceso = (await c.ana.post(`/api/proyectos/${p.id}/procesos`, { nombre: 'Atención de reclamos' })).json.proceso;
  const generar = (quien = c.ana, extra: object = {}) => quien.post('/api/ia/generaciones', {
    procesoId: proceso.id, texto: TEXTO, etiqueta: 'texto pegado', vista: 2, modelo: 'claude-opus-5',
    fuentes: [{ nombre: 'Texto pegado', tipo: 'texto', caracteres: TEXTO.length }], ...extra
  });
  return { u, c, p, proceso, generar };
}

describe('IA en el servidor', () => {
  it('genera un proceso: encola, el worker llama a Claude, valida y guarda el resultado con su coste', async () => {
    const { c, proceso, generar } = await equipo();
    const r = await generar();
    expect(r.status).toBe(202);
    expect(r.json.ejecucion).toMatchObject({ estado: 'en_cola', tipo: 'generacion', modelo: 'claude-opus-5' });
    expect(r.json.ejecucion.texto).toBeUndefined();

    const f = fetchFalso(() => respuestaClaude(JSON.stringify(SPEC)));
    await procesarCola(f);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init as RequestInit).headers).toMatchObject({ 'x-api-key': 'sk-ant-prueba' });
    const cuerpo = cuerpoDe(f);
    expect(cuerpo.system).toBe(PROMPT_GENERACION);
    expect(cuerpo.messages[0].content).toContain(TEXTO);

    const e = (await c.ana.get(`/api/ia/ejecuciones/${r.json.ejecucion.id}`)).json.ejecucion;
    expect(e).toMatchObject({ estado: 'completada', intentos: 1, tokensEntrada: 1000, tokensSalida: 500, error: null });
    expect(e.costeUsd).toBeCloseTo(usd(1000, 500, 'claude-opus-5'), 6);
    expect(e.resultado.nodes).toHaveLength(3);
    expect((await fila(e.id)).texto).toBeNull();   // el texto de las fuentes no se conserva

    // Pendiente de dibujar hasta que el editor guarde la revisión enlazada
    expect((await c.ana.get(`/api/ia/procesos/${proceso.id}`)).json.pendientes).toHaveLength(1);
    const rev = await c.ana.post(`/api/procesos/${proceso.id}/revisiones`, { contenido: EXPORT_MVP, mensaje: 'Generado con IA', ejecucionIaId: e.id });
    expect(rev.status).toBe(201);
    expect((await fila(e.id)).revisionId).toBe(rev.json.revision.id);
    expect((await c.ana.get(`/api/ia/procesos/${proceso.id}`)).json.pendientes).toHaveLength(0);
  });

  it('al terminar no conserva el texto de las fuentes ni los nombres de los participantes', async () => {
    const { generar } = await equipo();
    const r = await generar(undefined, { roles: { 'Ana Pérez': 'Jefa de siniestros' } });
    expect((await fila(r.json.ejecucion.id)).parametros).toMatchObject({ roles: { 'Ana Pérez': 'Jefa de siniestros' } });
    await procesarCola(fetchFalso(() => respuestaClaude(JSON.stringify(SPEC))));
    const f = await fila(r.json.ejecucion.id);
    expect(f).toMatchObject({ estado: 'completada', texto: null });
    expect(f.parametros).not.toHaveProperty('roles');
    expect(f.parametros).toMatchObject({ etiqueta: 'texto pegado', vista: 2 });   // el resto se conserva
  });

  it('reintenta lo pasajero con espera; la ejecución no se toma antes de tiempo', async () => {
    const { c, generar } = await equipo();
    const id = (await generar()).json.ejecucion.id;
    const f = fetchFalso(() => new Response('{"error":{"message":"Overloaded"}}', { status: 529 }), () => respuestaClaude(JSON.stringify(SPEC)));
    await procesarCola(f);
    let e = await fila(id);
    expect(e.estado).toBe('en_cola');
    expect(e.error).toContain('reintento 2 de 3');
    expect(e.disponibleEn.getTime()).toBeGreaterThan(Date.now());
    expect(await tomarSiguiente(conexion.db)).toBeNull();

    await conexion.db.update(ejecucionesIa).set({ disponibleEn: new Date() }).where(eq(ejecucionesIa.id, id));
    await procesarCola(f);
    e = await fila(id);
    expect(e).toMatchObject({ estado: 'completada', intentos: 2, error: null });
    expect((await c.ana.get(`/api/ia/ejecuciones/${id}`)).json.ejecucion.resultado.nodes).toHaveLength(3);
  });

  it('repara una vez una respuesta que no es JSON válido y cobra las dos llamadas', async () => {
    const { generar } = await equipo();
    const id = (await generar()).json.ejecucion.id;
    const f = fetchFalso(() => respuestaClaude('Aquí tienes el proceso: { "nodes": [ roto'), () => respuestaClaude(JSON.stringify(SPEC)));
    await procesarCola(f);
    const e = await fila(id);
    expect(e).toMatchObject({ estado: 'completada', tokensEntrada: 2000, tokensSalida: 1000 });
    expect(cuerpoDe(f, 1).system).toBe(PROMPT_REPARACION);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('los errores definitivos no se reintentan y dejan el mensaje', async () => {
    const { generar } = await equipo();
    const id = (await generar()).json.ejecucion.id;
    const f = fetchFalso(() => new Response('{}', { status: 401 }));
    await procesarCola(f);
    const e = await fila(id);
    expect(e.estado).toBe('fallida');
    expect(e.error).toContain('clave de Anthropic del servidor');
    expect(e.texto).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('cancelar: en cola se cancela al momento; ejecutando, el worker aborta la llamada', async () => {
    const { c, generar } = await equipo();
    const enCola = (await generar()).json.ejecucion.id;
    expect((await c.ana.post(`/api/ia/ejecuciones/${enCola}/cancelar`)).json.ejecucion.estado).toBe('cancelada');
    expect(await tomarSiguiente(conexion.db)).toBeNull();

    const id = (await generar()).json.ejecucion.id;
    // Una respuesta que no termina hasta que se aborta la llamada
    const colgada = fetchFalso((init) => new Response(new ReadableStream({
      start(ctrl) {
        init.signal!.addEventListener('abort', () => ctrl.error(Object.assign(new Error('abortado'), { name: 'AbortError' })));
      }
    }), { status: 200 }));
    const e = await tomarSiguiente(conexion.db);
    const enMarcha = ejecutar(dependencias(colgada), e!);
    await vi.waitFor(() => expect(colgada).toHaveBeenCalled());
    expect((await c.ana.post(`/api/ia/ejecuciones/${id}/cancelar`)).status).toBe(200);
    await enMarcha;
    expect((await fila(id)).estado).toBe('cancelada');
  });

  it('permisos, IA sin configurar, proyecto archivado y presupuesto', async () => {
    const { u, c, p, proceso, generar } = await equipo();
    expect((await generar(c.rosa)).json.error.codigo).toBe('PERMISO');

    const sinClave = cliente({ ...config, ia: { ...config.ia, configurada: false } });
    await sinClave.entrar('ana@mbc.pe');
    expect((await generar(sinClave)).json.error.codigo).toBe('IA_NO_CONFIGURADA');

    // Gasto previo del mes: la organización llega a su presupuesto (US$ 100)
    const gasto = (usuarioId: string, costeUsd: number) => conexion.db.insert(ejecucionesIa).values({
      organizacionId: u.ana.organizacionId, procesoId: proceso.id, usuarioId, tipo: 'generacion', modelo: 'claude-opus-5',
      estado: 'completada', costeUsd
    });
    await gasto(u.ana.id, 25);
    expect((await generar()).json.error.codigo).toBe('LIMITE_USUARIO');
    expect((await generar(c.admin)).status).toBe(202);
    await gasto(u.admin.id, 80);
    expect((await generar(c.admin)).json.error.codigo).toBe('PRESUPUESTO');
    const estado = (await c.admin.get('/api/ia/estado')).json;
    expect(estado).toMatchObject({ configurada: true, presupuesto: { mensualUsd: 100, gastadoUsd: 105 } });
    expect(estado.modelos.map((m: any) => m.id)).toEqual(['claude-opus-5', 'claude-sonnet-5']);

    await c.ana.patch(`/api/proyectos/${p.id}`, { archivado: true });
    expect((await generar(c.admin)).json.error.codigo).toBe('ARCHIVADO');
  });

  it('modelo: si el pedido no está permitido, usa el primero permitido y lo dice en la respuesta', async () => {
    const { c, proceso, generar } = await equipo();
    const r = await generar(c.ana, { modelo: 'claude-haiku-4-5' });
    expect(r.status).toBe(202);
    expect(r.json.modeloSustituido).toEqual({ pedido: 'claude-haiku-4-5', usado: 'claude-opus-5' });
    expect(r.json.ejecucion.modelo).toBe('claude-opus-5');
    const f = fetchFalso(() => respuestaClaude(JSON.stringify(SPEC)));
    await procesarCola(f);
    expect(cuerpoDe(f).model).toBe('claude-opus-5');
    const [auditada] = (await conexion.pool.query(`select detalle from auditoria where accion = 'ia.generacion'`)).rows;
    expect(auditada.detalle).toMatchObject({ modelo: 'claude-opus-5', modeloPedido: 'claude-haiku-4-5' });

    // Permitido o sin pedir: sin sustitución
    expect((await generar(c.ana, { modelo: 'claude-sonnet-5' })).json).toMatchObject({ modeloSustituido: null, ejecucion: { modelo: 'claude-sonnet-5' } });
    const sinModelo = await c.ana.post('/api/ia/generaciones', { procesoId: proceso.id, texto: TEXTO });
    expect(sinModelo.json).toMatchObject({ modeloSustituido: null, ejecucion: { modelo: 'claude-opus-5' } });
  });

  it('una llamada cortada a mitad suma lo consumido hasta el corte (cancelación y corte de red), también en el gasto informado', async () => {
    const { c, generar } = await equipo();
    const gasto = vi.fn();
    const coste1000 = usd(1000, 0, 'claude-opus-5');

    // Cancelada mientras la IA respondía
    const id = (await generar()).json.ejecucion.id;
    const e = await tomarSiguiente(conexion.db);
    const enMarcha = ejecutar(dependencias(fetchFalso(cortada('colgada')), { reportarGasto: gasto }), e!);
    await vi.waitFor(async () => expect((await fila(id)).progreso).toBeGreaterThan(0));   // ya llegó el inicio de la respuesta
    expect((await c.ana.post(`/api/ia/ejecuciones/${id}/cancelar`)).status).toBe(200);
    await enMarcha;
    const cancelada = await fila(id);
    expect(cancelada).toMatchObject({ estado: 'cancelada', tokensEntrada: 1000, tokensSalida: 0 });
    expect(cancelada.costeUsd).toBeCloseTo(coste1000, 9);
    expect(gasto).toHaveBeenCalledExactlyOnceWith({ modelo: 'claude-opus-5', entrada: 1000, salida: 0, ejecucionId: id, parcial: true });

    // Corte de red: se reintenta y lo consumido queda sumado
    const id2 = (await generar()).json.ejecucion.id;
    await procesarCola(fetchFalso(cortada('red')));
    const cortadaRed = await fila(id2);
    expect(cortadaRed).toMatchObject({ estado: 'en_cola', tokensEntrada: 1000 });
    expect(cortadaRed.error).toContain('Se cortó la conexión mientras la IA respondía');
    expect(cortadaRed.costeUsd).toBeCloseTo(coste1000, 9);
    // El reintento suma lo suyo encima
    await conexion.db.update(ejecucionesIa).set({ disponibleEn: new Date() }).where(eq(ejecucionesIa.id, id2));
    await procesarCola(fetchFalso(() => respuestaClaude(JSON.stringify(SPEC))));
    expect(await fila(id2)).toMatchObject({ estado: 'completada', tokensEntrada: 2000, tokensSalida: 500 });
  });

  it('el worker vuelve a comprobar el presupuesto justo antes de llamar, también en los reintentos', async () => {
    const { u, c, proceso, generar } = await equipo();
    const gasto = (usuarioId: string, costeUsd: number) => conexion.db.insert(ejecucionesIa).values({
      organizacionId: u.ana.organizacionId, procesoId: proceso.id, usuarioId, tipo: 'generacion', modelo: 'claude-opus-5', estado: 'completada', costeUsd
    });
    const ANTES = ' La ejecución se detuvo antes de llamar a la IA.';

    // Reintento: el primer intento falla por sobrecarga y, mientras espera, la persona llega a su límite
    const id = (await generar()).json.ejecucion.id;
    const f = fetchFalso(() => new Response('{"error":{"message":"Overloaded"}}', { status: 529 }), () => respuestaClaude(JSON.stringify(SPEC)));
    await procesarCola(f);
    expect((await fila(id)).estado).toBe('en_cola');
    await gasto(u.ana.id, 25);
    await conexion.db.update(ejecucionesIa).set({ disponibleEn: new Date() }).where(eq(ejecucionesIa.id, id));
    await procesarCola(f);
    expect(await fila(id)).toMatchObject({
      estado: 'fallida', intentos: 2, tokensEntrada: 0, costeUsd: 0, texto: null,
      error: 'Alcanzaste tu límite mensual de IA (US$ 25). Un administrador puede ampliarlo.' + ANTES
    });
    expect(f).toHaveBeenCalledTimes(1);   // el segundo intento no llamó a Claude

    // Encolada con presupuesto; antes de que el worker la tome, otra persona agota el de la organización
    const id2 = (await generar(c.admin)).json.ejecucion.id;
    await gasto(u.admin.id, 75);   // 25 + 75 = US$ 100
    const g = fetchFalso(() => respuestaClaude(JSON.stringify(SPEC)));
    await procesarCola(g);
    expect(await fila(id2)).toMatchObject({
      estado: 'fallida', costeUsd: 0,
      error: 'Se alcanzó el presupuesto mensual de IA de la organización (US$ 100). Un administrador puede ampliarlo.' + ANTES
    });
    expect(g).not.toHaveBeenCalled();
  });

  it('antes de reparar también: cuenta lo que la ejecución ya gastó y aún no está en la base', async () => {
    const { generar } = await equipo();
    const id = (await generar()).json.ejecucion.id;
    // La primera respuesta no es JSON y cuesta más de US$ 25, el límite de la persona
    const f = fetchFalso(() => respuestaClaude('no es JSON', { entrada: 1000, salida: 1_000_000 }), () => respuestaClaude(JSON.stringify(SPEC)));
    await procesarCola(f);
    const e = await fila(id);
    expect(e).toMatchObject({ estado: 'fallida', tokensEntrada: 1000, tokensSalida: 1_000_000 });   // lo gastado queda registrado
    expect(e.error).toMatch(/^Alcanzaste tu límite mensual de IA \(US\$ 25\)/);
    expect(f).toHaveBeenCalledTimes(1);   // no se llamó a reparar
  });

  it('análisis: tareas del copiloto y pains, con el modelo de análisis y el proceso que envía el editor', async () => {
    const { c, proceso } = await equipo();
    const tarea = await c.ana.post('/api/ia/analisis', { procesoId: proceso.id, tipo: 'suggest-kpis', contenido: EXPORT_MVP });
    expect(tarea.status).toBe(202);
    const f = fetchFalso(() => respuestaClaude('## KPIs sugeridos\n- Tiempo de ciclo', { modelo: 'claude-sonnet-5' }));
    await procesarCola(f);
    expect(cuerpoDe(f)).toMatchObject({ model: 'claude-sonnet-5', system: ROL_ANALISTA });
    expect(cuerpoDe(f).messages[0].content).toContain('=== PROCESO A ANALIZAR ===');
    expect((await fila(tarea.json.ejecucion.id)).resultado).toEqual({ markdown: '## KPIs sugeridos\n- Tiempo de ciclo' });

    const pains = await c.ana.post('/api/ia/analisis', { procesoId: proceso.id, tipo: 'pains', contenido: EXPORT_MVP });
    await procesarCola(fetchFalso(() => respuestaClaude('{"detectados":[],"sectoriales":[{"titulo":"Fraude"}]}')));
    expect((await fila(pains.json.ejecucion.id)).resultado).toEqual({ datos: { detectados: [], sectoriales: [{ titulo: 'Fraude' }] } });

    expect((await c.ana.post('/api/ia/analisis', { procesoId: proceso.id, tipo: 'inventada', contenido: EXPORT_MVP })).status).toBe(400);
    // Claves del prototipo de un objeto no son tareas (antes se encolaban y gastaban)
    for (const tipo of ['constructor', 'toString', '__proto__']) {
      expect((await c.ana.post('/api/ia/analisis', { procesoId: proceso.id, tipo, contenido: EXPORT_MVP })).status).toBe(400);
    }
  });

  it('análisis: RACI y SIPOC como matriz editable, validada contra el proceso y con una reparación (D12)', async () => {
    const { c, proceso } = await equipo();
    const analizar = (tipo: string, contenido: unknown = EXPORT_MVP, quien = c.ana) =>
      quien.post('/api/ia/analisis', { procesoId: proceso.id, tipo, contenido });

    const raci = await analizar('matriz-raci');
    expect(raci.status).toBe(202);
    expect(raci.json.ejecucion).toMatchObject({ tipo: 'tarea', tarea: 'matriz-raci', modelo: 'claude-sonnet-5' });
    // El worker valida contra las actividades del proceso (tareas, de sistema y decisiones): sus id van en los parámetros
    expect((await fila(raci.json.ejecucion.id)).parametros).toEqual({
      nodos: 18, actividades: ['n2', 'n3', 'n4', 'n6', 'n7', 'n9', 'n10', 'n12', 'n13', 'n14', 'n15', 'n17', 'n19']
    });
    // Primero una tabla Markdown (no vale); la reparación trae JSON con una fila del inicio (n1) y otra inventada (x9)
    const f = fetchFalso(
      () => respuestaClaude('| Actividad | Contact Center |\n|---|---|\n| Registrar | R/A |', { modelo: 'claude-sonnet-5' }),
      () => respuestaClaude(JSON.stringify({ n1: { Asegurado: 'R' }, n2: { 'Contact Center': 'r/a', Asegurado: 'I' }, x9: { Perito: 'R' } }), { modelo: 'claude-sonnet-5' })
    );
    await procesarCola(f);
    expect(f).toHaveBeenCalledTimes(2);
    expect(cuerpoDe(f, 0)).toMatchObject({ model: 'claude-sonnet-5', system: PROMPT_MATRICES, max_tokens: 8000, output_config: { effort: 'high' } });
    const pedido = cuerpoDe(f, 0).messages[0].content;
    expect(pedido.startsWith(MATRICES_IA['matriz-raci'].instruccion + '\n\n=== PROCESO A ANALIZAR ===\n')).toBe(true);
    expect(pedido).toContain('id=n2 - tipo=task');
    expect(cuerpoDe(f, 1).system).toBe(sistemaReparacionMatriz('matriz-raci'));
    expect(cuerpoDe(f, 1).messages[0].content).toContain('Problema detectado: La IA no devolvió JSON.');
    const e = (await c.ana.get(`/api/ia/ejecuciones/${raci.json.ejecucion.id}`)).json.ejecucion;
    expect(e).toMatchObject({ estado: 'completada', intentos: 1, error: null, resultado: { matriz: { n2: { 'Contact Center': 'R/A', Asegurado: 'I' } } } });
    expect(Object.keys(e.resultado.matriz)).toEqual(['n2']);
    expect(e.costeUsd).toBeCloseTo(2 * usd(1000, 500, 'claude-sonnet-5'), 6);   // se cobran las dos llamadas

    // SIPOC válido a la primera
    const SIPOC = { suppliers: 'Asegurado, Perito', inputs: 'Denuncia, Póliza', process: 'Registrar, Evaluar, Pagar', outputs: 'Pago', customers: 'Asegurado' };
    const sipoc = await analizar('matriz-sipoc');
    const f2 = fetchFalso(() => respuestaClaude(JSON.stringify(SIPOC)));
    await procesarCola(f2);
    expect(f2).toHaveBeenCalledTimes(1);
    expect((await fila(sipoc.json.ejecucion.id)).resultado).toEqual({ matriz: SIPOC });

    // Sin arreglo tras la reparación: fallida y sin reintentos (el editor pide entonces el informe en texto)
    const mala = await analizar('matriz-sipoc');
    const f3 = fetchFalso(() => respuestaClaude('El SIPOC, en prosa.'));
    await procesarCola(f3);
    expect(f3).toHaveBeenCalledTimes(2);
    expect(await fila(mala.json.ejecucion.id)).toMatchObject({
      estado: 'fallida', intentos: 1, texto: null, error: 'La IA devolvió una matriz que no se pudo interpretar ni reparar: La IA no devolvió JSON.'
    });

    // Una RACI sin actividades se rechaza antes de gastar; quien solo revisa no la pide
    const soloEventos = { ...EXPORT_MVP, nodes: EXPORT_MVP.nodes.filter((n: any) => n.type === 'start' || n.type === 'end'), edges: [] };
    const sin = await analizar('matriz-raci', soloEventos);
    expect(sin.status).toBe(400);
    expect(sin.json.error.codigo).toBe('PROCESO_SIN_ACTIVIDADES');
    expect((await analizar('matriz-sipoc', soloEventos)).status).toBe(202);   // el SIPOC no necesita actividades
    expect((await analizar('matriz-raci', EXPORT_MVP, c.rosa)).json.error.codigo).toBe('PERMISO');
    expect((await analizar('matriz-inventada')).status).toBe(400);
  });

  it('el progreso se sigue por SSE hasta el estado final, con el resultado en el último evento', async () => {
    const { c, generar } = await equipo();
    const id = (await generar()).json.ejecucion.id;
    const res = await c.ana.app.request(`/api/ia/ejecuciones/${id}/eventos`, { headers: { cookie: c.ana.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const texto = res.text();   // termina cuando el servidor cierra el stream (estado final)
    await new Promise((r) => setTimeout(r, 120));
    await procesarCola(fetchFalso(() => respuestaClaude(JSON.stringify(SPEC))));
    const cuerpo = await texto;
    const estados = [...cuerpo.matchAll(/"estado":"(\w+)"/g)].map((m) => m[1]);
    expect(estados[0]).toBe('en_cola');
    expect(estados.at(-1)).toBe('completada');
    expect(cuerpo.split('event: estado').at(-1)).toContain('"nodes"');   // el resultado va en el último
  });

  it('consumo del mes por persona (solo administradores)', async () => {
    const { c, generar } = await equipo();
    await generar();
    await procesarCola(fetchFalso(() => respuestaClaude(JSON.stringify(SPEC))));
    const r = (await c.admin.get('/api/ia/consumo')).json;
    expect(r.mes.gastadoUsd).toBeCloseTo(usd(1000, 500, 'claude-opus-5'), 6);
    expect(r.porUsuario).toMatchObject([{ email: 'ana@mbc.pe', ejecuciones: 1 }]);
    expect(r.recientes).toHaveLength(1);
    expect((await c.ana.get('/api/ia/consumo')).status).toBe(403);
  });

  it('una ejecución sin latido (worker caído) vuelve a la cola sin contar el intento', async () => {
    const { generar } = await equipo();
    const id = (await generar()).json.ejecucion.id;
    await tomarSiguiente(conexion.db);
    await conexion.db.update(ejecucionesIa).set({ actualizadoEn: sql`now() - interval '10 minutes'` as unknown as Date }).where(eq(ejecucionesIa.id, id));
    expect(await reencolarHuerfanas(conexion.db)).toBe(1);
    expect(await fila(id)).toMatchObject({ estado: 'en_cola', intentos: 0 });
  });
});

describe('despertador del worker', () => {
  it('un aviso despierta a todos los bucles que esperan, no solo al último', async () => {
    const reloj = despertador();
    const despiertos: number[] = [];
    const t0 = Date.now();
    const bucles = [1, 2, 3].map((n) => reloj.esperar(10_000).then(() => { despiertos.push(n); }));
    reloj.despertar();
    await Promise.all(bucles);
    expect(despiertos.sort()).toEqual([1, 2, 3]);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('sin aviso la espera vence sola; un aviso sin nadie esperando no adelanta la siguiente espera', async () => {
    const reloj = despertador();
    await reloj.esperar(10);   // vence sola
    reloj.despertar();         // nadie espera: no pasa nada
    const t0 = Date.now();
    await reloj.esperar(30);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
  });
});
