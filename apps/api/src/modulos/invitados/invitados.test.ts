import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { invitadosEnlaces, type Conexion } from '@processiq/db';
import { ORIGEN, cerrarBase, cliente, prepararBase, usuario, vaciar } from '../../pruebas/entorno.js';

const SINIESTROS = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../../packages/dominio/src/__fixtures__/mvp-3.8.9-siniestros.json'), 'utf8'));
/** Un nodo que solo existe en otro proceso (para comprobar que el invitado no llega a él). */
const OTRO = { ...SINIESTROS, nodes: [...SINIESTROS.nodes, { ...SINIESTROS.nodes[1], id: 'solo-en-otro', label: 'Solo en otro proceso' }] };

let conexion: Conexion;
beforeAll(async () => { conexion = await prepararBase(); });
afterAll(cerrarBase);
beforeEach(vaciar);

type Cliente = ReturnType<typeof cliente>;

/**
 * Ana es propietaria del proyecto «Proyecto Andes»; Luis, editor; Rita, revisora; Lola, lectora.
 * Pepe es de la organización pero no participa. «Siniestros» tiene dos
 * revisiones (v1 y v2, con otro responsable) y hay un segundo proceso.
 */
async function escenario() {
  await usuario('admin@mbc.pe', 'admin');
  const u = {
    ana: await usuario('ana@mbc.pe'), luis: await usuario('luis@mbc.pe'), rita: await usuario('rita@mbc.pe'),
    lola: await usuario('lola@mbc.pe', 'lector'), pepe: await usuario('pepe@mbc.pe')
  };
  const c = { ana: cliente(), luis: cliente(), rita: cliente(), lola: cliente(), pepe: cliente() };
  for (const k of Object.keys(c) as (keyof typeof c)[]) await c[k].entrar(`${k}@mbc.pe`);
  const { proyecto } = (await c.ana.post('/api/proyectos', { nombre: 'Proyecto Andes', cliente: 'Aseguradora Sur' })).json;
  await c.ana.put(`/api/proyectos/${proyecto.id}/miembros/${u.luis.id}`, { rol: 'editor' });
  await c.ana.put(`/api/proyectos/${proyecto.id}/miembros/${u.rita.id}`, { rol: 'revisor' });
  await c.ana.put(`/api/proyectos/${proyecto.id}/miembros/${u.lola.id}`, { rol: 'lector' });
  const a = (await c.ana.post(`/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Gestión de siniestros', contenido: SINIESTROS })).json;
  const v2 = (await c.ana.post(`/api/procesos/${a.proceso.id}/revisiones`, {
    contenido: { ...SINIESTROS, meta: { ...SINIESTROS.meta, owner: 'Jefatura v2' } }, padreId: a.revision.id
  })).json;
  const otro = (await c.ana.post(`/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Otro proceso', contenido: OTRO })).json;
  return {
    u, c, proyectoId: proyecto.id as string, procesoId: a.proceso.id as string,
    v1: a.revision.id as string, v2: v2.revision.id as string, otroProcesoId: otro.proceso.id as string, otraRevision: otro.revision.id as string
  };
}

const crearEnlace = (quien: Cliente, revision: string, datos: Record<string, unknown> = {}) =>
  quien.post(`/api/invitados/revisiones/${revision}/enlaces`, { destinatario: 'Gerencia de Operaciones', ...datos });
/** El invitado: sin sesión (cliente nuevo, sin cookie). */
const invitado = () => cliente();
const eventos = async (accion: string) =>
  (await conexion.pool.query('select usuario_id, organizacion_id, entidad, entidad_id, detalle from auditoria where accion = $1 order by id', [accion])).rows;

describe('invitados: enlaces', () => {
  it('el token solo viaja al crear el enlace; en la base queda su hash', async () => {
    const { c, v2, procesoId } = await escenario();
    const antes = Date.now();
    const r = await crearEnlace(c.ana, v2);
    expect(r.status).toBe(201);
    expect(r.json.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.json.url).toBe(`${ORIGEN}/?invitado=${r.json.token}`);
    expect(r.json.enlace).toMatchObject({ revisionId: v2, destinatario: 'Gerencia de Operaciones', admiteComentarios: true, estado: 'activo', comentarios: 0, creadoPor: 'ana' });
    // Por defecto caduca a los 14 días
    const dias = (new Date(r.json.enlace.caducaEn).getTime() - antes) / 86_400_000;
    expect(dias).toBeGreaterThan(13.99);
    expect(dias).toBeLessThan(14.01);

    const [fila] = await conexion.db.select().from(invitadosEnlaces).where(eq(invitadosEnlaces.id, r.json.enlace.id));
    expect(fila!.tokenHash).toBe(createHash('sha256').update(r.json.token).digest('hex'));
    expect(JSON.stringify(fila)).not.toContain(r.json.token);

    // La lista nunca lleva el token ni su hash
    const lista = await c.ana.get(`/api/invitados/procesos/${procesoId}/enlaces`);
    expect(lista.status).toBe(200);
    expect(lista.json.enlaces).toHaveLength(1);
    expect(JSON.stringify(lista.json)).not.toContain(r.json.token);
    expect(JSON.stringify(lista.json)).not.toContain(fila!.tokenHash);
    expect(Object.keys(lista.json.enlaces[0]).sort()).toEqual(
      ['admiteComentarios', 'caducaEn', 'comentarios', 'creadoEn', 'creadoPor', 'destinatario', 'estado', 'id', 'revisionId', 'revocadoEn', 'ultimoAcceso'].sort());

    const [alta] = await eventos('invitados.enlace.alta');
    expect(alta).toMatchObject({ entidad: 'invitados_enlace', entidad_id: r.json.enlace.id, detalle: { revisionId: v2, numero: 2, dias: 14, destinatario: 'Gerencia de Operaciones' } });
    expect(alta.usuario_id).toEqual(expect.any(String));
  });

  it('caducidad entre 1 y 90 días, destinatario obligatorio y revisión existente', async () => {
    const { c, v1 } = await escenario();
    expect((await crearEnlace(c.ana, v1, { dias: 90 })).status).toBe(201);
    for (const datos of [{ dias: 91 }, { dias: 0 }, { dias: 2.5 }, { destinatario: '   ' }, { admiteComentarios: 'sí' }]) {
      const r = await crearEnlace(c.ana, v1, datos);
      expect(r.status, JSON.stringify(datos)).toBe(400);
      expect(r.json.error.codigo).toBe('VALIDACION');
    }
    expect((await crearEnlace(c.ana, v1, { dias: 91 })).json.error.detalles).toEqual(['dias: El enlace puede durar como mucho 90 días.']);
    expect((await crearEnlace(c.ana, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await crearEnlace(c.ana, 'no-es-un-id')).status).toBe(404);
  });

  it('crean, listan y revocan quienes pueden escribir en el proyecto', async () => {
    const { c, v1, procesoId } = await escenario();
    const deLuis = await crearEnlace(c.luis, v1);
    expect(deLuis.status).toBe(201);
    const id = deLuis.json.enlace.id;
    // Revisora y lectora: 403; sin acceso al proyecto: 404; sin sesión: 401
    for (const quien of [c.rita, c.lola]) {
      expect((await crearEnlace(quien, v1)).json.error.codigo).toBe('PERMISO');
      expect((await quien.get(`/api/invitados/procesos/${procesoId}/enlaces`)).json.error.codigo).toBe('PERMISO');
      expect((await quien.post(`/api/invitados/enlaces/${id}/revocar`)).json.error.codigo).toBe('PERMISO');
    }
    expect((await crearEnlace(c.pepe, v1)).status).toBe(404);
    expect((await c.pepe.get(`/api/invitados/procesos/${procesoId}/enlaces`)).status).toBe(404);
    expect((await c.pepe.post(`/api/invitados/enlaces/${id}/revocar`)).status).toBe(404);
    expect((await crearEnlace(invitado(), v1)).status).toBe(401);
    expect((await invitado().get(`/api/invitados/procesos/${procesoId}/enlaces`)).status).toBe(401);

    // Ana revoca el enlace de Luis; revocar otra vez no cambia nada ni se audita de nuevo
    const r = await c.ana.post(`/api/invitados/enlaces/${id}/revocar`);
    expect(r.status).toBe(200);
    expect(r.json.enlace).toMatchObject({ id, estado: 'revocado', creadoPor: 'luis' });
    const otraVez = await c.luis.post(`/api/invitados/enlaces/${id}/revocar`);
    expect(otraVez.json.enlace.revocadoEn).toBe(r.json.enlace.revocadoEn);
    expect(await eventos('invitados.enlace.baja')).toHaveLength(1);
    expect((await c.luis.get(`/api/invitados/procesos/${procesoId}/enlaces`)).json.enlaces.map((e: any) => e.estado)).toEqual(['revocado']);
  });

  it('en un proyecto archivado la lista se ve, pero no se crea ni se revoca', async () => {
    const { c, v1, procesoId, proyectoId } = await escenario();
    const id = (await crearEnlace(c.ana, v1)).json.enlace.id;
    await c.ana.patch(`/api/proyectos/${proyectoId}`, { archivado: true });
    expect((await c.ana.get(`/api/invitados/procesos/${procesoId}/enlaces`)).json.enlaces).toHaveLength(1);
    expect((await crearEnlace(c.ana, v1)).json.error.codigo).toBe('ARCHIVADO');
    expect((await c.ana.post(`/api/invitados/enlaces/${id}/revocar`)).json.error.codigo).toBe('ARCHIVADO');
  });
});

describe('invitados: acceso con el token', () => {
  it('con un token válido, el invitado ve la revisión del enlace, el nombre del proceso y nada más', async () => {
    const { c, v1, procesoId } = await escenario();
    const { token } = (await crearEnlace(c.ana, v1)).json;
    const r = await invitado().get(`/api/publico/invitados/${token}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(r.json).sort()).toEqual(['comentarios', 'enlace', 'proceso', 'revision']);
    expect(r.json.proceso).toEqual({ nombre: 'Gestión de siniestros' });
    expect(Object.keys(r.json.revision).sort()).toEqual(['contenido', 'creadaEn', 'numero']);
    expect(r.json.revision.numero).toBe(1);
    expect(r.json.revision.contenido.meta.owner).not.toBe('Jefatura v2');
    expect(r.json.revision.contenido.nodes).toHaveLength(SINIESTROS.nodes.length);
    expect(r.json.enlace).toEqual({ destinatario: 'Gerencia de Operaciones', caducaEn: expect.any(String), admiteComentarios: true });
    expect(r.json.comentarios).toEqual([]);
    // Nada del proyecto ni del equipo
    for (const dato of ['Aseguradora Sur', 'Proyecto Andes', 'ana@mbc.pe', '"ana"']) expect(JSON.stringify(r.json)).not.toContain(dato);
    // Y queda anotado cuándo se abrió
    const lista = await c.ana.get(`/api/invitados/procesos/${procesoId}/enlaces`);
    expect(lista.json.enlaces[0].ultimoAcceso).toEqual(expect.any(String));
  });

  it('token caducado, revocado, inventado, mal formado o de un proyecto archivado: siempre el mismo 404', async () => {
    const { c, v1, v2, proyectoId } = await escenario();
    const caducado = (await crearEnlace(c.ana, v1)).json;
    await conexion.db.update(invitadosEnlaces).set({ caducaEn: new Date(Date.now() - 1000) }).where(eq(invitadosEnlaces.id, caducado.enlace.id));
    const revocado = (await crearEnlace(c.ana, v1)).json;
    await c.ana.post(`/api/invitados/enlaces/${revocado.enlace.id}/revocar`);
    const archivado = (await crearEnlace(c.ana, v2)).json;
    const vivo = (await crearEnlace(c.ana, v1)).json;

    const inventado = 'A'.repeat(43);
    const tokens = [caducado.token, revocado.token, inventado, 'corto', `${vivo.token}x`];
    const respuestas = [];
    for (const t of tokens) {
      respuestas.push(await invitado().get(`/api/publico/invitados/${t}`));
      respuestas.push(await invitado().post(`/api/publico/invitados/${t}/comentarios`, { nombre: 'Cliente', texto: 'Hola' }));
    }
    await c.ana.patch(`/api/proyectos/${proyectoId}`, { archivado: true });
    respuestas.push(await invitado().get(`/api/publico/invitados/${archivado.token}`));
    respuestas.push(await invitado().post(`/api/publico/invitados/${archivado.token}/comentarios`, { nombre: 'Cliente', texto: 'Hola' }));
    for (const r of respuestas) {
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ error: { mensaje: 'Este enlace no existe o ya no está disponible. Pide uno nuevo a quien te lo envió.', codigo: 'INVITADOS_ENLACE_NO_VALIDO' } });
    }
    // Reactivado el proyecto, el enlace vuelve a servir (no había caducado)
    await c.ana.patch(`/api/proyectos/${proyectoId}`, { archivado: false });
    expect((await invitado().get(`/api/publico/invitados/${archivado.token}`)).status).toBe(200);
  });

  it('el invitado no llega a otra revisión ni a otro proceso', async () => {
    const { c, v1, otroProcesoId, procesoId } = await escenario();
    const { token } = (await crearEnlace(c.ana, v1)).json;
    const g = invitado();
    // Un elemento que solo existe en otro proceso
    const ajeno = await g.post(`/api/publico/invitados/${token}/comentarios`, { nombre: 'Cliente', texto: 'Mira esto', elementoId: 'solo-en-otro' });
    expect(ajeno.status).toBe(400);
    expect(ajeno.json.error.codigo).toBe('VALIDACION');
    // Un id de revisión o de enlace en el cuerpo no cambia a qué revisión va el comentario
    const v2 = (await c.ana.get(`/api/procesos/${procesoId}`)).json.revisiones[0].id;
    const r = await g.post(`/api/publico/invitados/${token}/comentarios`, { nombre: 'Cliente', texto: 'Comentario', revisionId: v2, enlaceId: '00000000-0000-4000-8000-000000000000' });
    expect(r.status).toBe(201);
    const comentarios = (await c.ana.get(`/api/invitados/procesos/${procesoId}/comentarios`)).json.comentarios;
    expect(comentarios.map((x: any) => x.revisionId)).toEqual([v1]);
    expect((await c.ana.get(`/api/invitados/procesos/${otroProcesoId}/comentarios`)).json.comentarios).toEqual([]);
    // Las rutas públicas no dan acceso a las del núcleo ni a las de gestión
    expect((await g.get(`/api/revisiones/${v1}`)).status).toBe(401);
    expect((await g.get(`/api/invitados/procesos/${procesoId}/comentarios`)).status).toBe(401);
    // (la URL se normaliza antes de mirar el prefijo: «..» no sirve para salir de /api/publico/)
    expect((await g.get(`/api/publico/invitados/${token}/../../../revisiones/${v1}`)).status).toBe(401);
    expect((await g.get('/api/publico/otra-cosa')).status).toBe(404);
  });

  it('las rutas públicas no ven al usuario aunque haya sesión, y las escrituras exigen el Origin de la web', async () => {
    const { c, v1 } = await escenario();
    const { token } = (await crearEnlace(c.ana, v1)).json;
    // Ana, con su sesión abierta, comenta por el enlace: queda como un invitado más, sin autor
    const r = await c.ana.post(`/api/publico/invitados/${token}/comentarios`, { nombre: 'Ana probando', texto: 'Se ve bien' });
    expect(r.status).toBe(201);
    const [alta] = await eventos('invitados.comentario.alta');
    expect(alta.usuario_id).toBeNull();
    // Sin el Origin de la web: 403, también en las rutas públicas
    const sinOrigen = await invitado().post(`/api/publico/invitados/${token}/comentarios`, { nombre: 'X', texto: 'Y' }, { origin: 'https://otro.sitio' });
    expect(sinOrigen.status).toBe(403);
    expect(sinOrigen.json.error.codigo).toBe('ORIGEN');
  });
});

describe('invitados: comentarios', () => {
  it('el invitado comenta la revisión o un elemento; el equipo los ve y los resuelve; todo queda en la auditoría', async () => {
    const { c, u, v1, procesoId } = await escenario();
    const enlace = (await crearEnlace(c.ana, v1)).json;
    const otroEnlace = (await crearEnlace(c.ana, v1, { destinatario: 'Auditoría interna' })).json;
    const g = invitado();

    const general = await g.post(`/api/publico/invitados/${enlace.token}/comentarios`, { nombre: '  Carla Ruiz ', texto: 'Falta el paso de firma del gerente.' });
    expect(general.status).toBe(201);
    expect(general.json.comentario).toMatchObject({ nombre: 'Carla Ruiz', texto: 'Falta el paso de firma del gerente.', elementoId: null, elementoEtiqueta: null, resuelto: false });
    const anclado = await g.post(`/api/publico/invitados/${enlace.token}/comentarios`, { nombre: 'Carla Ruiz', texto: 'Esto lo hace otra área.', elementoId: 'n2' });
    expect(anclado.json.comentario).toMatchObject({ elementoId: 'n2', elementoEtiqueta: 'Registrar siniestro' });
    await invitado().post(`/api/publico/invitados/${otroEnlace.token}/comentarios`, { nombre: 'Auditor', texto: 'De otro enlace' });
    // Validación: nombre y texto obligatorios
    const vacio = await g.post(`/api/publico/invitados/${enlace.token}/comentarios`, { nombre: ' ', texto: '' });
    expect(vacio.status).toBe(400);
    expect(vacio.json.error.detalles).toEqual(['nombre: Escribe tu nombre.', 'texto: Escribe el comentario.']);

    // El invitado solo ve los comentarios de su enlace
    const vista = (await g.get(`/api/publico/invitados/${enlace.token}`)).json;
    expect(vista.comentarios.map((x: any) => x.texto)).toEqual(['Falta el paso de firma del gerente.', 'Esto lo hace otra área.']);

    // El equipo (también quien solo lee) ve todos, con el destinatario de cada enlace
    for (const quien of [c.ana, c.rita, c.lola]) {
      const lista = await quien.get(`/api/invitados/procesos/${procesoId}/comentarios`);
      expect(lista.status).toBe(200);
      expect(lista.json.comentarios.map((x: any) => [x.destinatario, x.nombre, x.elementoEtiqueta])).toEqual([
        ['Auditoría interna', 'Auditor', null],
        ['Gerencia de Operaciones', 'Carla Ruiz', 'Registrar siniestro'],
        ['Gerencia de Operaciones', 'Carla Ruiz', null]
      ]);
    }
    expect((await c.pepe.get(`/api/invitados/procesos/${procesoId}/comentarios`)).status).toBe(404);
    expect((await c.ana.get(`/api/invitados/procesos/${procesoId}/enlaces`)).json.enlaces.map((e: any) => e.comentarios)).toEqual([1, 2]);

    // Resolver: quien escribe; la revisora y la lectora no
    const id = general.json.comentario.id;
    expect((await c.rita.post(`/api/invitados/comentarios/${id}/resolver`, { resuelto: true })).json.error.codigo).toBe('PERMISO');
    expect((await c.lola.post(`/api/invitados/comentarios/${id}/resolver`, { resuelto: true })).json.error.codigo).toBe('PERMISO');
    expect((await c.pepe.post(`/api/invitados/comentarios/${id}/resolver`, { resuelto: true })).status).toBe(404);
    const resuelto = await c.luis.post(`/api/invitados/comentarios/${id}/resolver`, { resuelto: true });
    expect(resuelto.status).toBe(200);
    expect(resuelto.json.comentario).toMatchObject({ id, resueltoPor: 'luis', resueltoEn: expect.any(String) });
    // El invitado ve que está resuelto, pero no quién lo resolvió
    const tras = (await g.get(`/api/publico/invitados/${enlace.token}`)).json.comentarios.find((x: any) => x.id === id);
    expect(tras).toEqual({ id, nombre: 'Carla Ruiz', texto: 'Falta el paso de firma del gerente.', elementoId: null, elementoEtiqueta: null, creadoEn: expect.any(String), resuelto: true });
    // Reabrir
    const reabierto = await c.ana.post(`/api/invitados/comentarios/${id}/resolver`, { resuelto: false });
    expect(reabierto.json.comentario).toMatchObject({ resueltoEn: null, resueltoPor: null });

    // Auditoría: cada comentario (sin autor, con el nombre que dio) y cada cambio de estado
    const altas = await eventos('invitados.comentario.alta');
    expect(altas).toHaveLength(3);
    expect(altas.every((e: any) => e.usuario_id === null && e.entidad === 'invitados_comentario')).toBe(true);
    expect(altas[1].detalle).toMatchObject({ enlaceId: enlace.enlace.id, revisionId: v1, procesoId, nombre: 'Carla Ruiz', elementoId: 'n2' });
    const resoluciones = await eventos('invitados.comentario.resolucion');
    expect(resoluciones.map((e: any) => [e.usuario_id, e.detalle.resuelto])).toEqual([[u.luis.id, true], [u.ana.id, false]]);
    // Llevan la organización del enlace: el administrador los ve en su auditoría aunque no tengan autor
    expect((await eventos('invitados.comentario.alta')).map((e: any) => e.organizacion_id)).toEqual(Array(3).fill(u.ana.organizacionId));
    const admin = cliente();
    await admin.entrar('admin@mbc.pe');
    const auditoria = await admin.get('/api/auditoria?entidad=invitados_comentario');
    expect(auditoria.json.eventos.map((e: any) => [e.accion, e.usuario])).toEqual([
      ['invitados.comentario.resolucion', 'ana@mbc.pe'], ['invitados.comentario.resolucion', 'luis@mbc.pe'],
      ['invitados.comentario.alta', null], ['invitados.comentario.alta', null], ['invitados.comentario.alta', null]
    ]);
  });

  it('un comentario sobre el To-Be se busca en esa vista y el equipo lo ve marcado', async () => {
    const { c, proyectoId } = await escenario();
    // El To-Be nace clonando el As-Is: mismos ids, otras etiquetas, y aquí sin el paso n3
    const tobe = {
      nodes: SINIESTROS.nodes.filter((n: any) => n.id !== 'n3').map((n: any) => (n.id === 'n2' ? { ...n, label: 'Registro automático' } : n)),
      edges: []
    };
    const contenido = { ...SINIESTROS, activeView: 'asis', views: { asis: { nodes: SINIESTROS.nodes, edges: SINIESTROS.edges }, tobe } };
    const p = (await c.ana.post(`/api/proyectos/${proyectoId}/procesos`, { nombre: 'Con To-Be', contenido })).json;
    const { token } = (await crearEnlace(c.ana, p.revision.id)).json;
    const comentar = (datos: Record<string, unknown>) => invitado().post(`/api/publico/invitados/${token}/comentarios`, { nombre: 'Cliente', texto: 'Ojo', ...datos });
    expect((await comentar({ elementoId: 'n2', vista: 'asis' })).json.comentario.elementoEtiqueta).toBe('Registrar siniestro');
    expect((await comentar({ elementoId: 'n2', vista: 'tobe' })).json.comentario.elementoEtiqueta).toBe('Registro automático (To-Be)');
    expect((await comentar({ elementoId: 'n3', vista: 'tobe' })).status).toBe(400);
    expect((await comentar({ elementoId: 'n3', vista: 'otra' })).status).toBe(400);
    // Sin vista, vale cualquier elemento de la revisión
    expect((await comentar({ elementoId: 'n3' })).json.comentario.elementoEtiqueta).toBe('Validar póliza vigente');
  });

  it('un enlace sin comentarios se puede abrir pero no comentar', async () => {
    const { c, v1 } = await escenario();
    const { token } = (await crearEnlace(c.ana, v1, { admiteComentarios: false })).json;
    const g = invitado();
    expect((await g.get(`/api/publico/invitados/${token}`)).json.enlace.admiteComentarios).toBe(false);
    const r = await g.post(`/api/publico/invitados/${token}/comentarios`, { nombre: 'Cliente', texto: 'Hola' });
    expect(r.status).toBe(403);
    expect(r.json.error.codigo).toBe('INVITADOS_SIN_COMENTARIOS');
  });
});

describe('invitados: límites de uso', () => {
  it('120 peticiones por minuto e IP a las rutas públicas; otra IP no se ve afectada', async () => {
    const { c, v1 } = await escenario();
    const { token } = (await crearEnlace(c.ana, v1)).json;
    const g = invitado();
    const ip = { 'x-forwarded-for': '203.0.113.7' };
    for (let i = 0; i < 120; i++) expect((await g.get(`/api/publico/invitados/${token}`, ip)).status).toBe(200);
    const pasado = await g.get(`/api/publico/invitados/${token}`, ip);
    expect(pasado.status).toBe(429);
    expect(pasado.json.error.codigo).toBe('LIMITE');
    // También los tokens inventados cuentan (no se puede probar tokens sin límite)
    expect((await g.get(`/api/publico/invitados/${'B'.repeat(43)}`, ip)).status).toBe(429);
    expect((await g.get(`/api/publico/invitados/${token}`, { 'x-forwarded-for': '203.0.113.8' })).status).toBe(200);
    // Las rutas con sesión no cuentan para ese límite
    expect((await c.ana.get('/api/sesion', ip)).status).toBe(200);
  });

  it('como mucho 20 comentarios seguidos por enlace', async () => {
    const { c, v1 } = await escenario();
    const { token } = (await crearEnlace(c.ana, v1)).json;
    const g = invitado();
    for (let i = 0; i < 20; i++) {
      expect((await g.post(`/api/publico/invitados/${token}/comentarios`, { nombre: 'Cliente', texto: `Comentario ${i}` }, { 'x-forwarded-for': `198.51.100.${i}` })).status).toBe(201);
    }
    const r = await g.post(`/api/publico/invitados/${token}/comentarios`, { nombre: 'Cliente', texto: 'Uno más' }, { 'x-forwarded-for': '198.51.100.99' });
    expect(r.status).toBe(429);
    expect(r.json.error.codigo).toBe('LIMITE');
  });
});
