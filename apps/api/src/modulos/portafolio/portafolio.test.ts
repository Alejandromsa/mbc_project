import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { organizaciones, usuarios, type Conexion } from '@processiq/db';
import { migrarProyecto, validarProceso, VERBS_ALLOWED, VERBS_FORBIDDEN, type ProyectoV1 } from '@processiq/dominio';
import { CLAVE, cerrarBase, cliente, prepararBase, usuario, vaciar } from '../../pruebas/entorno.js';
import { hashearClave } from '../../seguridad.js';
import { claveCliente } from './servicio.js';

const fixture = (nombre: string) => JSON.parse(readFileSync(join(import.meta.dirname, '../../../../../packages/dominio/src/__fixtures__', nombre), 'utf8'));
const SINIESTROS = fixture('mvp-3.8.9-siniestros.json');
const VENTA_LOTES = fixture('mvp-3.8.9-venta-lotes.json');
const kpi = (value: string) => ({ name: 'Tiempo de ciclo', unit: 'días', benchmark: '5', value, gap: '', source: '' });

let conexion: Conexion;
beforeAll(async () => { conexion = await prepararBase(); });
afterAll(cerrarBase);
beforeEach(vaciar);

/**
 * Cartera de prueba (Ana crea todos los proyectos y es su propietaria):
 *   Aseguradora Sur   Siniestros  (Luis editor): aprobado, en revisión, sin revisiones
 *   aseguradora  SUR  Canales     (misma, otra grafía): un borrador
 *   Banco Norte       Créditos    (Lola lectora): un borrador con KPIs
 *   Cliente Nuevo     Por empezar: sin procesos
 *   (sin cliente)     Interno: sin procesos
 *   Cliente Antiguo   Cerrado: archivado, un borrador
 * Pepe no participa en ninguno.
 */
async function cartera() {
  const u = {
    admin: await usuario('admin@mbc.pe', 'admin'),
    ana: await usuario('ana@mbc.pe'),
    luis: await usuario('luis@mbc.pe'),
    lola: await usuario('lola@mbc.pe', 'lector'),
    pepe: await usuario('pepe@mbc.pe')
  };
  const c = { admin: cliente(), ana: cliente(), luis: cliente(), lola: cliente(), pepe: cliente() };
  for (const k of Object.keys(c) as (keyof typeof c)[]) await c[k].entrar(`${k}@mbc.pe`);

  const proyecto = async (nombre: string, clienteProyecto: string) =>
    (await c.ana.post('/api/proyectos', { nombre, cliente: clienteProyecto })).json.proyecto as { id: string };
  const proceso = async (p: { id: string }, nombre: string, contenido?: unknown) =>
    (await c.ana.post(`/api/proyectos/${p.id}/procesos`, { nombre, ...(contenido ? { contenido } : {}) })).json;
  const estado = (revision: string, e: string) => c.ana.post(`/api/revisiones/${revision}/estado`, { estado: e });

  const siniestros = await proyecto('Siniestros', 'Aseguradora Sur');
  const canales = await proyecto('Canales', 'aseguradora  SUR');
  const creditos = await proyecto('Créditos', 'Banco Norte');
  await proyecto('Por empezar', 'Cliente Nuevo');
  await proyecto('Interno', '');
  const cerrado = await proyecto('Cerrado', 'Cliente Antiguo');
  await c.ana.put(`/api/proyectos/${siniestros.id}/miembros/${u.luis.id}`, { rol: 'editor' });
  await c.ana.put(`/api/proyectos/${creditos.id}/miembros/${u.lola.id}`, { rol: 'lector' });

  const gestion = await proceso(siniestros, 'Gestión de siniestros', SINIESTROS);
  await estado(gestion.revision.id, 'en_revision');
  await estado(gestion.revision.id, 'aprobada');
  const venta = await proceso(siniestros, 'Venta de lotes', VENTA_LOTES);
  await estado(venta.revision.id, 'en_revision');
  await proceso(siniestros, 'Sin revisiones');
  await proceso(canales, 'Atención en agencias', SINIESTROS);
  await proceso(creditos, 'Originación', { ...SINIESTROS, kpiValues: { k1: kpi('12'), k2: kpi('  '), k3: kpi('3,5') } });
  await proceso(cerrado, 'Histórico', SINIESTROS);
  await c.ana.patch(`/api/proyectos/${cerrado.id}`, { archivado: true });
  return { u, c, gestionId: gestion.proceso.id as string };
}

const filas = (clientes: any[]) => clientes.map((x) => [x.cliente, x.proyectos, x.procesos, x.avance]);
const avance = (aprobados: number, enRevision: number, borradores: number, sinRevisiones: number) => ({ aprobados, enRevision, borradores, sinRevisiones });
const detalle = (quien: ReturnType<typeof cliente>, nombre: string, extra = '') =>
  quien.get(`/api/portafolio/cliente?nombre=${encodeURIComponent(nombre)}${extra}`);

/** Hallazgos esperados, contados con el linter del dominio. */
function hallazgosDe(contenido: unknown, catalogo?: Parameters<typeof validarProceso>[2]) {
  const r = migrarProyecto(contenido);
  if (!r.ok) throw new Error('fixture inválido');
  const p: ProyectoV1 = r.proyecto;
  const cuenta = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const h of validarProceso(p.nodes, p.edges, catalogo)) { cuenta[h.sev]++; cuenta.total++; }
  return cuenta;
}

describe('portafolio: resumen por cliente', () => {
  it('el administrador ve todos los clientes de la organización, agrupados y con el avance de sus procesos', async () => {
    const { c } = await cartera();
    const r = await c.admin.get('/api/portafolio/clientes');
    expect(r.status).toBe(200);
    expect(filas(r.json.clientes)).toEqual([
      ['Aseguradora Sur', 2, 4, avance(1, 1, 1, 1)],
      ['Banco Norte', 1, 1, avance(0, 0, 1, 0)],
      ['Cliente Nuevo', 1, 0, avance(0, 0, 0, 0)],
      ['', 1, 0, avance(0, 0, 0, 0)]
    ]);
    expect(r.json.clientes[0].actualizadoEn).toEqual(expect.any(String));
    // La propietaria de todos los proyectos ve lo mismo
    expect((await c.ana.get('/api/portafolio/clientes')).json.clientes).toEqual(r.json.clientes);
  });

  it('cada uno ve solo los clientes y los proyectos en los que participa', async () => {
    const { c } = await cartera();
    // Luis solo está en Siniestros: de Aseguradora Sur ve un proyecto y sus 3 procesos
    expect(filas((await c.luis.get('/api/portafolio/clientes')).json.clientes)).toEqual([['Aseguradora Sur', 1, 3, avance(1, 1, 0, 1)]]);
    // Lola, lectora de la organización y del proyecto Créditos
    expect(filas((await c.lola.get('/api/portafolio/clientes')).json.clientes)).toEqual([['Banco Norte', 1, 1, avance(0, 0, 1, 0)]]);
    // Pepe no participa en nada
    expect((await c.pepe.get('/api/portafolio/clientes')).json.clientes).toEqual([]);
  });

  it('los proyectos archivados no cuentan salvo que se pidan', async () => {
    const { c } = await cartera();
    const conArchivados = (await c.admin.get('/api/portafolio/clientes?archivados=1')).json.clientes;
    expect(conArchivados.map((x: any) => x.cliente)).toEqual(['Aseguradora Sur', 'Banco Norte', 'Cliente Antiguo', 'Cliente Nuevo', '']);
    expect(filas(conArchivados)[2]).toEqual(['Cliente Antiguo', 1, 1, avance(0, 0, 1, 0)]);
  });

  it('sin sesión responde 401', async () => {
    await cartera();
    expect((await cliente().get('/api/portafolio/clientes')).status).toBe(401);
    expect((await cliente().get('/api/portafolio/cliente?nombre=Banco%20Norte')).status).toBe(401);
  });

  it('agrupa las grafías de un mismo cliente sin mayúsculas, tildes ni espacios repetidos', () => {
    expect(claveCliente('  Clínica  del SUR ')).toBe(claveCliente('clinica del sur'));
    expect(claveCliente('Banco Norte')).not.toBe(claveCliente('Banco Sur'));
  });
});

describe('portafolio: detalle de un cliente', () => {
  it('proyectos y procesos con el estado de la última revisión e indicadores de su contenido', async () => {
    const { c, gestionId } = await cartera();
    const r = await detalle(c.admin, 'Aseguradora Sur');
    expect(r.status).toBe(200);
    const d = r.json;
    expect(d.cliente).toBe('Aseguradora Sur');
    expect(d.resumen).toMatchObject({ proyectos: 2, procesos: 4, avance: avance(1, 1, 1, 1) });
    expect(d.proyectos.map((p: any) => [p.nombre, p.procesos.map((x: any) => [x.nombre, x.ultimaRevision?.numero ?? null, x.ultimaRevision?.estado ?? null])])).toEqual([
      ['Canales', [['Atención en agencias', 1, 'borrador']]],
      ['Siniestros', [['Gestión de siniestros', 1, 'aprobada'], ['Sin revisiones', null, null], ['Venta de lotes', 1, 'en_revision']]]
    ]);

    const gestion = d.proyectos[1].procesos[0];
    expect(gestion.id).toBe(gestionId);
    expect(gestion.contenidoInvalido).toBe(false);
    expect(gestion.indicadores).toEqual({
      porTipo: { start: 1, task: 10, decision: 3, end: 2, intermediate: 2 },
      actividades: 10,
      roles: ['Analista de Siniestros', 'Asegurado', 'Contact Center', 'Jefe de Siniestros', 'Perito', 'Suscripción', 'Tesorería'],
      ejecucion: { system: 3, email: 2, manual: 4, automatic: 1 },
      pains: { total: 2, puntuacion: 16 + 15, maxima: 16 },
      kpis: { definidos: 0, conValor: 0 },
      hallazgos: hallazgosDe(SINIESTROS)
    });
    const sinRevisiones = d.proyectos[1].procesos[1];
    expect(sinRevisiones).toMatchObject({ ultimaRevision: null, indicadores: null, contenidoInvalido: false });

    // Agregado del cliente: Gestión + Atención (mismo contenido) + Venta de lotes
    const i = d.indicadores;
    expect(i).toMatchObject({
      procesosConContenido: 3,
      actividades: 10 + 10 + 23,
      roles: 7 + 5,
      ejecucion: { system: 3 + 3 + 9, email: 2 + 2 + 1, manual: 4 + 4 + 13, automatic: 1 + 1 },
      pains: { total: 2 + 2 + 3, puntuacion: 31 + 31 + 36, maxima: 16 },
      kpis: { definidos: 0, conValor: 0 }
    });
    expect(i.hallazgos.total).toBe(2 * hallazgosDe(SINIESTROS).total + hallazgosDe(VENTA_LOTES).total);
    // Pains principales: por puntuación (severidad × frecuencia), con su proceso
    expect(i.painsPrincipales.slice(0, 3).map((p: any) => [p.puntuacion, p.proceso, p.actividad, p.severidad, p.frecuencia])).toEqual([
      [16, 'Atención en agencias', 'Solicitar documentación', 4, 4],
      [16, 'Gestión de siniestros', 'Solicitar documentación', 4, 4],
      [15, 'Atención en agencias', 'Autorizar pago', 3, 5]
    ]);
    expect(i.painsPrincipales).toHaveLength(7);
  });

  it('el nombre se busca sin distinguir mayúsculas ni tildes, y solo con los proyectos que el usuario ve', async () => {
    const { c } = await cartera();
    const r = await detalle(c.luis, 'ASEGURADORA   sur');
    expect(r.status).toBe(200);
    expect(r.json.cliente).toBe('Aseguradora Sur');
    expect(r.json.proyectos.map((p: any) => p.nombre)).toEqual(['Siniestros']);
    expect(r.json.resumen).toMatchObject({ proyectos: 1, procesos: 3 });
  });

  it('sin acceso al cliente responde 404, igual que si no existiera', async () => {
    const { c } = await cartera();
    const sinAcceso = await detalle(c.pepe, 'Aseguradora Sur');
    const inexistente = await detalle(c.admin, 'Nadie');
    expect([sinAcceso.status, sinAcceso.json.error.codigo]).toEqual([404, 'PORTAFOLIO_CLIENTE_NO_ENCONTRADO']);
    expect(sinAcceso.json).toEqual(inexistente.json);
    // Luis no participa en Créditos: no ve Banco Norte
    expect((await detalle(c.luis, 'Banco Norte')).status).toBe(404);
  });

  it('un lector ve el detalle de su cliente, con los KPIs que tienen valor', async () => {
    const { c } = await cartera();
    const r = await detalle(c.lola, 'Banco Norte');
    expect(r.status).toBe(200);
    expect(r.json.proyectos[0].procesos[0].indicadores.kpis).toEqual({ definidos: 3, conValor: 2 });
    expect(r.json.indicadores.kpis).toEqual({ definidos: 3, conValor: 2 });
  });

  it('un cliente sin procesos y los proyectos sin cliente', async () => {
    const { c } = await cartera();
    const nuevo = (await detalle(c.admin, 'Cliente Nuevo')).json;
    expect(nuevo.resumen).toMatchObject({ proyectos: 1, procesos: 0, avance: avance(0, 0, 0, 0) });
    expect(nuevo.proyectos).toEqual([{ id: expect.any(String), nombre: 'Por empezar', archivado: false, procesos: [] }]);
    expect(nuevo.indicadores).toEqual({
      procesosConContenido: 0, porTipo: {}, actividades: 0, roles: 0, ejecucion: {},
      pains: { total: 0, puntuacion: 0, maxima: 0 }, painsPrincipales: [],
      kpis: { definidos: 0, conValor: 0 }, hallazgos: { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
    });
    const sinCliente = await detalle(c.admin, '');
    expect([sinCliente.status, sinCliente.json.cliente, sinCliente.json.proyectos.map((p: any) => p.nombre)]).toEqual([200, '', ['Interno']]);
  });

  it('un cliente con todos sus proyectos archivados solo aparece si se piden los archivados', async () => {
    const { c } = await cartera();
    expect((await detalle(c.admin, 'Cliente Antiguo')).status).toBe(404);
    const r = await detalle(c.admin, 'Cliente Antiguo', '&archivados=1');
    expect(r.status).toBe(200);
    expect(r.json.proyectos.map((p: any) => [p.nombre, p.archivado, p.procesos.length])).toEqual([['Cerrado', true, 1]]);
  });

  it('los hallazgos usan los verbos del Playbook de la organización', async () => {
    const { c } = await cartera();
    const antes = (await detalle(c.admin, 'Banco Norte')).json.indicadores.hallazgos;
    expect(antes).toEqual(hallazgosDe(SINIESTROS));
    expect((await c.admin.put('/api/catalogos/verbos/solicitar', { tipo: 'prohibido', motivo: 'Di qué se pide y a quién.' })).status).toBe(200);
    const despues = (await detalle(c.admin, 'Banco Norte')).json.indicadores.hallazgos;
    const catalogo = { permitidos: VERBS_ALLOWED.filter((v) => v !== 'solicitar'), prohibidos: { ...VERBS_FORBIDDEN, solicitar: 'x' } };
    expect(despues).toEqual(hallazgosDe(SINIESTROS, catalogo));
    expect(despues.medium).toBeGreaterThan(antes.medium);
  });

  it('nunca muestra proyectos de otra organización', async () => {
    const { c } = await cartera();
    const [otra] = await conexion.db.insert(organizaciones).values({ nombre: 'Otra' }).returning();
    await conexion.db.insert(usuarios).values({
      organizacionId: otra!.id, email: 'jefa@otra.pe', nombre: 'Jefa', rol: 'admin', hashClave: await hashearClave(CLAVE), debeCambiarClave: false
    });
    const jefa = cliente();
    expect((await jefa.entrar('jefa@otra.pe')).status).toBe(200);
    expect((await jefa.get('/api/portafolio/clientes')).json.clientes).toEqual([]);
    expect((await detalle(jefa, 'Aseguradora Sur')).status).toBe(404);
    // Y al revés: su proyecto no aparece en la organización de MBC
    await jefa.post('/api/proyectos', { nombre: 'Suyo', cliente: 'Aseguradora Sur' });
    expect((await detalle(jefa, 'Aseguradora Sur')).json.proyectos.map((p: any) => p.nombre)).toEqual(['Suyo']);
    expect((await detalle(c.admin, 'Aseguradora Sur')).json.proyectos.map((p: any) => p.nombre)).toEqual(['Canales', 'Siniestros']);
  });
});
