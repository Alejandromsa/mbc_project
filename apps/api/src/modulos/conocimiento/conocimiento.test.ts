// Integración de Conocimiento contra Postgres real: índice perezoso, búsqueda
// con y sin tildes, acceso, procesos parecidos, importación del marco (solo
// administradores) y comparativo con un marco de ejemplo INVENTADO (nada del APQC).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { auditoria, conocimientoIndice, organizaciones, procesos, usuarios, type Conexion } from '@processiq/db';
import { hashearClave } from '../../seguridad.js';
import { CLAVE, cerrarBase, cliente, prepararBase, usuario, vaciar } from '../../pruebas/entorno.js';

const fixture = (n: string) => JSON.parse(readFileSync(new URL(`../../../../../packages/dominio/src/__fixtures__/${n}`, import.meta.url), 'utf8'));
const MARCO = readFileSync(new URL('./__fixtures__/marco-ejemplo.csv', import.meta.url), 'utf8');
const SINIESTROS = fixture('mvp-3.8.9-siniestros.json');

/** Proceso lineal mínimo con actividades [texto, rol, sistema]. */
function proceso(nombre: string, actividades: [string, string, string][], ficha: Record<string, unknown> = {}) {
  const nodes: Record<string, unknown>[] = [{ id: 'i', type: 'start', x: 0, y: 0, w: 54, h: 54, label: 'Inicio' }];
  actividades.forEach(([label, owner, system], k) => nodes.push({ id: `t${k}`, type: 'task', x: 200 * (k + 1), y: 0, w: 158, h: 76, label, owner, system }));
  const edges = nodes.slice(1).map((n, k) => ({ id: `e${k}`, from: nodes[k]!.id, to: n.id, label: '' }));
  return { meta: { name: nombre, industry: '', macroprocess: '', client: '', owner: '' }, ficha, nodes, edges };
}

const REEMBOLSOS = proceso('Reembolsos de salud', [
  ['Recibir solicitud de reembolso', 'Plataforma de atención', 'Core Salud'],
  ['Verificar póliza del afiliado', 'Plataforma de atención', 'Core Salud'],
  ['Revisar documentos médicos', 'Auditor médico', ''],
  ['Aprobar reembolso', 'Jefe de Reembolsos', ''],
  ['Pagar reembolso', 'Tesorería', 'ERP'],
  ['Notificar al asegurado', 'Plataforma de atención', '']
]);
const COMPRAS = proceso('Compras de TI', [
  ['Registrar requerimiento de compra', 'Usuario solicitante', 'SAP'],
  ['Solicitar cotizaciones', 'Compras', 'SAP'],
  ['Emitir orden de compra', 'Compras', 'SAP'],
  ['Recibir bienes', 'Almacén', 'SAP']
], { objetivo: 'Reducir el tiempo de respuesta a las áreas usuarias' });

let conexion: Conexion;
beforeAll(async () => { conexion = await prepararBase(); });
afterAll(cerrarBase);
beforeEach(vaciar);

/**
 * Admin, Ana (consultora con dos proyectos), Beto (consultor con otro proyecto)
 * y Carla (consultora sin proyectos). Todos en la misma organización.
 */
async function escenario() {
  await usuario('admin@mbc.pe', 'admin');
  await usuario('ana@mbc.pe');
  const beto = await usuario('beto@mbc.pe');
  await usuario('carla@mbc.pe', 'lector');
  const c = { admin: cliente(), ana: cliente(), beto: cliente(), carla: cliente() };
  await c.admin.entrar('admin@mbc.pe');
  await c.ana.entrar('ana@mbc.pe');
  await c.beto.entrar('beto@mbc.pe');
  await c.carla.entrar('carla@mbc.pe');

  const crearProceso = async (quien: ReturnType<typeof cliente>, proyectoId: string, nombre: string, contenido: unknown) => {
    const r = await quien.post(`/api/proyectos/${proyectoId}/procesos`, { nombre, contenido });
    expect(r.status).toBe(201);
    return r.json.proceso.id as string;
  };
  const seguros = (await c.ana.post('/api/proyectos', { nombre: 'Seguros del Norte', cliente: 'Aseguradora ficticia' })).json.proyecto;
  const siniestros = await crearProceso(c.ana, seguros.id, 'Gestión de siniestros', SINIESTROS);
  const reembolsos = await crearProceso(c.ana, seguros.id, 'Reembolsos de salud', REEMBOLSOS);
  const compras = (await c.ana.post('/api/proyectos', { nombre: 'Compras corporativas' })).json.proyecto;
  const comprasId = await crearProceso(c.ana, compras.id, 'Compras de TI', COMPRAS);

  // Beto: el mismo proceso de siniestros redibujado para otro cliente (con dos actividades distintas)
  const vehiculares = structuredClone(SINIESTROS);
  for (const n of vehiculares.nodes) {
    if (n.label === 'Activar peritaje') n.label = 'Inspeccionar vehículo';
    if (n.label === 'Cotizar talleres') n.label = 'Asignar taller';
  }
  const autos = (await c.beto.post('/api/proyectos', { nombre: 'Autos del Sur' })).json.proyecto;
  const vehicularesId = await crearProceso(c.beto, autos.id, 'Siniestros vehiculares', vehiculares);
  const lotes = await crearProceso(c.beto, autos.id, 'Venta de lotes', fixture('mvp-3.8.9-venta-lotes.json'));
  return { c, beto, proyectos: { seguros: seguros.id, compras: compras.id, autos: autos.id }, ids: { siniestros, reembolsos, compras: comprasId, vehiculares: vehicularesId, lotes } };
}

type Cliente = ReturnType<typeof cliente>;
const buscar = async (c: Cliente, q: string) => {
  const r = await c.get(`/api/conocimiento/buscar?q=${encodeURIComponent(q)}`);
  expect(r.status).toBe(200);
  return r.json.resultados as { procesoId: string; nombre: string; parecido: number; proyecto: { nombre: string }; extracto: { campo: string; texto: string; etiqueta?: string } }[];
};
const nombres = async (c: Cliente, q: string) => (await buscar(c, q)).map((r) => r.nombre).sort();

describe('búsqueda', () => {
  it('encuentra por actividad, sistema, rol y ficha, con y sin tildes ni mayúsculas, y dice dónde coincide', async () => {
    const { c } = await escenario();
    const [poliza] = await buscar(c.ana, 'poliza vigente');
    expect(poliza).toMatchObject({ nombre: 'Gestión de siniestros', proyecto: { nombre: 'Seguros del Norte' }, extracto: { campo: 'actividad', texto: 'Validar póliza vigente' } });
    for (const q of ['póliza vigente', 'PÓLIZA VIGENTE', 'Poliza Vigente']) expect((await buscar(c.ana, q))[0]!.extracto.texto).toBe('Validar póliza vigente');

    expect(await nombres(c.ana, 'póliza')).toEqual(['Gestión de siniestros', 'Reembolsos de salud']);
    // Sistema y rol (Tesorería con y sin tilde)
    expect((await buscar(c.ana, 'core seguros'))[0]!.extracto).toEqual({ campo: 'sistema', texto: 'Core Seguros' });
    for (const q of ['tesoreria', 'Tesorería']) {
      const r = await buscar(c.ana, q);
      expect(r.map((x) => x.nombre).sort()).toEqual(['Gestión de siniestros', 'Reembolsos de salud']);
      expect(r.every((x) => x.extracto.campo === 'rol' && x.extracto.texto === 'Tesorería')).toBe(true);
    }
    // Ficha (con su etiqueta) y una errata
    expect((await buscar(c.ana, 'areas usuarias'))[0]).toMatchObject({ nombre: 'Compras de TI', extracto: { campo: 'ficha', etiqueta: 'Objetivo' } });
    expect((await buscar(c.ana, 'polisa'))[0]!.parecido).toBeLessThan(1);
    expect(await nombres(c.ana, 'polisa')).toEqual(['Gestión de siniestros', 'Reembolsos de salud']);
    // Todas las palabras deben estar; lo que no está, no sale
    expect(await nombres(c.ana, 'póliza sap')).toEqual([]);
    // Palabras cortas (siglas de sistemas): enteras, «sap» no es «salud»
    expect(await nombres(c.ana, 'sap')).toEqual(['Compras de TI']);
    expect(await nombres(c.ana, 'hipoteca')).toEqual([]);

    const corta = await c.ana.get('/api/conocimiento/buscar?q=a');
    expect(corta.status).toBe(400);
    expect(corta.json.error.codigo).toBe('CONOCIMIENTO_CONSULTA_CORTA');
    expect((await c.ana.get('/api/conocimiento/buscar?q=poliza&limite=500')).status).toBe(400);
  });

  it('solo aparecen procesos de proyectos a los que tengo acceso (y nunca los de otra organización)', async () => {
    const { c, beto, proyectos } = await escenario();
    expect(await nombres(c.ana, 'siniestro')).toEqual(['Gestión de siniestros']);
    expect(await nombres(c.beto, 'siniestro')).toEqual(['Siniestros vehiculares']);
    expect(await nombres(c.carla, 'siniestro')).toEqual([]);
    expect(await nombres(c.admin, 'siniestro')).toEqual(['Gestión de siniestros', 'Siniestros vehiculares']);

    // Beto añade a Carla como lectora: desde ese momento lo encuentra
    expect((await c.beto.put(`/api/proyectos/${proyectos.autos}/miembros/${(await idDe('carla@mbc.pe'))}`, { rol: 'lector' })).status).toBe(200);
    expect(await nombres(c.carla, 'siniestro')).toEqual(['Siniestros vehiculares']);
    // Un proyecto archivado se sigue pudiendo consultar
    expect((await c.beto.patch(`/api/proyectos/${proyectos.autos}`, { archivado: true })).status).toBe(200);
    expect((await buscar(c.carla, 'siniestro'))[0]!).toMatchObject({ proyecto: { archivado: true } });

    // Administrador de otra organización: no ve nada de esta
    const [otra] = await conexion.db.insert(organizaciones).values({ nombre: 'Otra organización' }).returning();
    await conexion.db.insert(usuarios).values({
      organizacionId: otra!.id, email: 'admin@otra.pe', nombre: 'Admin otra', rol: 'admin', hashClave: await hashearClave(CLAVE), debeCambiarClave: false
    });
    const ajeno = cliente();
    await ajeno.entrar('admin@otra.pe');
    expect(await nombres(ajeno, 'siniestro')).toEqual([]);
    expect(beto.organizacionId).not.toBe(otra!.id);
  });

  it('indexa de forma perezosa: al buscar recoge revisiones nuevas y renombres; el índice cae con su proceso', async () => {
    const { c, ids } = await escenario();
    expect(await conexion.db.$count(conocimientoIndice)).toBe(0);
    expect(await nombres(c.ana, 'vigente')).toEqual(['Gestión de siniestros']);
    expect(await conexion.db.$count(conocimientoIndice)).toBe(5); // toda la organización, no solo lo visible

    const { revisiones } = (await c.ana.get(`/api/procesos/${ids.siniestros}`)).json;
    const cambiado = structuredClone(SINIESTROS);
    for (const n of cambiado.nodes) if (n.label === 'Validar póliza vigente') n.label = 'Verificar la cobertura contratada';
    expect((await c.ana.post(`/api/procesos/${ids.siniestros}/revisiones`, { contenido: cambiado, mensaje: 'v2', padreId: revisiones[0].id })).status).toBe(201);
    expect(await nombres(c.ana, 'vigente')).toEqual([]);
    expect(await nombres(c.ana, 'cobertura contratada')).toEqual(['Gestión de siniestros']);

    expect((await c.ana.patch(`/api/procesos/${ids.siniestros}`, { nombre: 'Indemnizaciones' })).status).toBe(200);
    expect((await buscar(c.ana, 'indemnizaciones'))[0]).toMatchObject({ nombre: 'Indemnizaciones', extracto: { campo: 'nombre' } });

    await conexion.db.delete(procesos).where(eq(procesos.id, ids.siniestros));
    expect(await conexion.db.$count(conocimientoIndice, eq(conocimientoIndice.procesoId, ids.siniestros))).toBe(0);
  });

  it('la normalización es IMMUTABLE y el índice de trigramas se usa al buscar', async () => {
    const { c } = await escenario();
    await buscar(c.ana, 'poliza');
    const q = async (texto: string) => (await conexion.pool.query(texto)).rows;
    expect(await q(`select extname from pg_extension where extname in ('pg_trgm', 'unaccent') order by 1`)).toEqual([{ extname: 'pg_trgm' }, { extname: 'unaccent' }]);
    expect(await q(`select provolatile from pg_proc where proname = 'conocimiento_normalizar'`)).toEqual([{ provolatile: 'i' }]);
    expect(await q(`select conocimiento_normalizar('Póliza VIGENTE — Ñandú') as t`)).toEqual([{ t: 'poliza vigente - nandu' }]);
    const cliente_ = await conexion.pool.connect();
    try {
      await cliente_.query('begin; set local enable_seqscan = off');
      const plan = (await cliente_.query(`explain select proceso_id from conocimiento_indice where conocimiento_normalizar('poliza') <% conocimiento_normalizar(texto)`)).rows.map((r) => r['QUERY PLAN']).join('\n');
      expect(plan).toContain('conocimiento_indice_texto_idx');
    } finally {
      await cliente_.query('rollback');
      cliente_.release();
    }
  });
});

async function idDe(email: string) {
  const [u] = await conexion.db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  return u!.id;
}

describe('procesos parecidos', () => {
  it('ordena por parecido, explica qué comparten y respeta el acceso', async () => {
    const { c, ids, proyectos } = await escenario();
    // El administrador ve todo: primero el mismo proceso redibujado; luego el de salud (también de seguros)
    const r = (await c.admin.get(`/api/conocimiento/procesos/${ids.siniestros}/parecidos`)).json;
    expect(r.proceso).toMatchObject({ procesoId: ids.siniestros, nombre: 'Gestión de siniestros' });
    const lista = r.parecidos as { nombre: string; parecido: number; enComun: { actividades: string[]; sistemas: string[]; roles: string[] } }[];
    expect(lista.map((p) => p.nombre).slice(0, 2)).toEqual(['Siniestros vehiculares', 'Reembolsos de salud']);
    expect(lista[0]!.parecido).toBeGreaterThan(0.8);
    expect(lista[1]!.parecido).toBeLessThan(0.5);
    expect(lista.map((p) => p.parecido)).toEqual([...lista.map((p) => p.parecido)].sort((a, b) => b - a));
    expect(lista[0]!.enComun.sistemas).toEqual(['Core Seguros', 'ERP']);
    expect(lista[0]!.enComun.actividades).toContain('Validar póliza vigente');
    expect(lista[0]!.enComun.actividades).not.toContain('Activar peritaje');
    expect(lista[1]!.enComun).toEqual({ actividades: ['Notificar al asegurado'], sistemas: ['ERP'], roles: ['Tesorería'] });

    // Ana no ve el proyecto de Beto: sus parecidos no lo incluyen
    const deAna = (await c.ana.get(`/api/conocimiento/procesos/${ids.siniestros}/parecidos`)).json.parecidos.map((p: any) => p.nombre);
    expect(deAna).not.toContain('Siniestros vehiculares');
    expect(deAna[0]).toBe('Reembolsos de salud');
    // Ni puede pedir los parecidos de un proceso de Beto (404, como en el núcleo)
    expect((await c.ana.get(`/api/conocimiento/procesos/${ids.vehiculares}/parecidos`)).status).toBe(404);
    expect((await c.ana.get('/api/conocimiento/procesos/no-es-un-id/parecidos')).status).toBe(404);

    // Un proceso sin revisiones: sin parecidos, sin error
    const vacio = (await c.ana.post(`/api/proyectos/${proyectos.compras}/procesos`, { nombre: 'Sin dibujar' })).json.proceso.id;
    expect((await c.ana.get(`/api/conocimiento/procesos/${vacio}/parecidos`)).json).toMatchObject({ proceso: null, parecidos: [], nombre: 'Sin dibujar' });
  });
});

describe('marco de referencia', () => {
  it('solo un administrador lo importa; la vista previa no guarda; cada importación reemplaza la anterior', async () => {
    const { c } = await escenario();
    expect((await c.ana.post('/api/conocimiento/marco/vista-previa', { csv: MARCO })).status).toBe(403);
    expect((await c.ana.put('/api/conocimiento/marco', { csv: MARCO })).status).toBe(403);
    expect((await c.ana.get('/api/conocimiento/marco')).json).toMatchObject({ elementos: 0, categorias: [], importadoEn: null });

    const previa = (await c.admin.post('/api/conocimiento/marco/vista-previa', { csv: MARCO })).json;
    expect(previa).toMatchObject({ valido: true, errores: [], elementos: 40, porNivel: { 1: 4, 2: 11, 3: 25 } });
    expect(previa.muestra[0]).toEqual({ codigo: '1.0', nombre: 'Planificar el negocio', nivel: 1 });
    expect((await c.ana.get('/api/conocimiento/marco')).json.elementos).toBe(0);

    const importado = await c.admin.put('/api/conocimiento/marco', { csv: MARCO });
    expect(importado.status).toBe(200);
    expect(importado.json).toMatchObject({ elementos: 40, reemplazados: 0 });
    const visto = (await c.ana.get('/api/conocimiento/marco')).json;
    expect(visto.elementos).toBe(40);
    expect(visto.categorias.map((k: any) => k.nombre)).toEqual(['Planificar el negocio', 'Vender y atender a los clientes', 'Gestionar siniestros', 'Administrar las finanzas']);
    expect(visto.importadoEn).toEqual(expect.any(String));

    // Con errores no se importa nada y el anterior sigue
    const malo = await c.admin.put('/api/conocimiento/marco', { csv: 'Código;Nombre\n1.0;Uno\n1.x;Mal' });
    expect(malo.status).toBe(400);
    expect(malo.json.error.codigo).toBe('CONOCIMIENTO_MARCO_INVALIDO');
    expect(malo.json.error.detalles).toEqual(['Fila 3: el código «1.x» no es jerárquico (por ejemplo 1.0, 1.2 o 1.2.3).']);
    expect((await c.admin.post('/api/conocimiento/marco/vista-previa', { csv: 'a;b\n1;2' })).json).toMatchObject({ valido: false, elementos: 0 });
    expect((await c.ana.get('/api/conocimiento/marco')).json.elementos).toBe(40);

    // Otro formato (el del APQC: coma y cabeceras en inglés) reemplaza al anterior
    const otro = await c.admin.put('/api/conocimiento/marco', { csv: 'Hierarchy ID,Name,Element Description\n1.0,Operar,"Inventado, para la prueba"\n1.1,Atender\n' });
    expect(otro.json).toMatchObject({ elementos: 2, reemplazados: 40 });
    expect((await c.ana.get('/api/conocimiento/marco')).json.elementos).toBe(2);
    const eventos = await conexion.db.select().from(auditoria).where(eq(auditoria.accion, 'conocimiento.marco.importacion')).orderBy(auditoria.id);
    expect(eventos.map((e) => e.detalle)).toEqual([
      { elementos: 40, categorias: 4, reemplazados: 0 },
      { elementos: 2, categorias: 1, reemplazados: 40 }
    ]);
  });
});

describe('comparativo con el marco', () => {
  it('asigna cada actividad al elemento más parecido sobre el umbral y calcula la cobertura por categoría', async () => {
    const { c, ids } = await escenario();
    // Sin marco: el comparativo lo dice y no falla
    const sinMarco = (await c.ana.get(`/api/conocimiento/procesos/${ids.siniestros}/comparativo`)).json;
    expect(sinMarco).toMatchObject({ marco: { elementos: 0 }, categorias: [] });
    expect(sinMarco.actividades).toHaveLength(10);

    expect((await c.admin.put('/api/conocimiento/marco', { csv: MARCO })).status).toBe(200);
    const r = (await c.ana.get(`/api/conocimiento/procesos/${ids.siniestros}/comparativo`)).json;
    expect(r).toMatchObject({ marco: { elementos: 40 }, umbral: 0.35, revision: { numero: 1 } });
    expect(r.actividades.map((a: any) => [a.texto, a.elemento?.codigo ?? null])).toEqual([
      ['Registrar siniestro', '3.1.1'],
      ['Validar póliza vigente', '3.1.2'],
      ['Solicitar documentación', '3.2.1'],
      ['Activar peritaje', '3.2.2'],
      ['Cotizar talleres', null],
      ['Evaluar cobertura', '3.2.3'],
      ['Liquidar reserva', '3.3.1'],
      ['Autorizar pago', '3.3.2'],
      ['Ejecutar pago', '3.3.3'],
      ['Notificar al asegurado', '3.3.4']
    ]);
    expect(r.actividades[0]).toMatchObject({ rol: 'Contact Center', elemento: { nombre: 'Registrar el aviso de siniestro', nivel: 3 } });
    expect(r.actividades.every((a: any) => a.parecido === null || a.parecido >= 0.35)).toBe(true);
    expect(r.categorias.map((k: any) => [k.codigo, k.actividades, k.grupos, k.cobertura])).toEqual([
      ['1.0', 0, 2, 0], ['2.0', 0, 3, 0], ['3.0', 9, 4, 0.75], ['4.0', 0, 2, 0]
    ]);
    expect(r.categorias[2].gruposFaltantes).toEqual([{ codigo: '3.4', nombre: 'Recuperar costos del siniestro' }]);

    // Con un umbral más exigente se asignan menos actividades
    const exigente = (await c.ana.get(`/api/conocimiento/procesos/${ids.siniestros}/comparativo?umbral=0.7`)).json;
    expect(exigente.actividades.filter((a: any) => a.elemento).length).toBeLessThan(5);
    expect((await c.ana.get(`/api/conocimiento/procesos/${ids.siniestros}/comparativo?umbral=2`)).status).toBe(400);
    // Sin acceso al proceso: 404
    expect((await c.ana.get(`/api/conocimiento/procesos/${ids.vehiculares}/comparativo`)).status).toBe(404);
    expect((await c.carla.get(`/api/conocimiento/procesos/${ids.siniestros}/comparativo`)).status).toBe(404);
  });
});
