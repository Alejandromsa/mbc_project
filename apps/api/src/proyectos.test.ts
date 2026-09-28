import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cerrarBase, cliente, prepararBase, usuario, vaciar } from './pruebas/entorno.js';

// Export JSON del MVP 3.8.9 (formato v0): lo que hoy descargan los consultores
const EXPORT_MVP = JSON.parse(readFileSync(join(import.meta.dirname, '../../../packages/dominio/src/__fixtures__/mvp-3.8.9-siniestros.json'), 'utf8'));

beforeAll(async () => { await prepararBase(); });
afterAll(cerrarBase);
beforeEach(vaciar);

async function equipo() {
  const u = {
    admin: await usuario('admin@mbc.pe', 'admin'),
    ana: await usuario('ana@mbc.pe'),       // propietaria del proyecto
    luis: await usuario('luis@mbc.pe'),     // editor
    rosa: await usuario('rosa@mbc.pe'),     // revisora
    pepe: await usuario('pepe@mbc.pe')      // sin acceso
  };
  const c = { admin: cliente(), ana: cliente(), luis: cliente(), rosa: cliente(), pepe: cliente() };
  for (const k of Object.keys(c) as (keyof typeof c)[]) await c[k].entrar(`${k}@mbc.pe`);
  const p = (await c.ana.post('/api/proyectos', { nombre: 'Siniestros', cliente: 'Aseguradora' })).json.proyecto;
  await c.ana.put(`/api/proyectos/${p.id}/miembros/${u.luis.id}`, { rol: 'editor' });
  await c.ana.put(`/api/proyectos/${p.id}/miembros/${u.rosa.id}`, { rol: 'revisor' });
  return { u, c, p };
}

describe('proyectos', () => {
  it('quien crea es propietario; cada uno ve solo sus proyectos; el admin ve todos', async () => {
    const { c, p } = await equipo();
    expect(p.rol).toBe('propietario');
    expect((await c.luis.get('/api/proyectos')).json.proyectos.map((x: any) => [x.nombre, x.rol])).toEqual([['Siniestros', 'editor']]);
    expect((await c.pepe.get('/api/proyectos')).json.proyectos).toEqual([]);
    expect((await c.admin.get('/api/proyectos')).json.proyectos).toHaveLength(1);
  });

  it('sin acceso responde 404 (no delata que existe)', async () => {
    const { c, p } = await equipo();
    expect((await c.pepe.get(`/api/proyectos/${p.id}`)).status).toBe(404);
    expect((await c.pepe.get('/api/proyectos/no-es-uuid')).status).toBe(404);
  });

  it('solo el propietario administra; siempre queda al menos un propietario', async () => {
    const { u, c, p } = await equipo();
    expect((await c.luis.patch(`/api/proyectos/${p.id}`, { nombre: 'X' })).status).toBe(403);
    expect((await c.ana.patch(`/api/proyectos/${p.id}`, { cliente: 'Aseguradora SA' })).json.proyecto.cliente).toBe('Aseguradora SA');
    expect((await c.ana.del(`/api/proyectos/${p.id}/miembros/${u.ana.id}`)).status).toBe(409);
    const degradar = await c.ana.put(`/api/proyectos/${p.id}/miembros/${u.ana.id}`, { rol: 'editor' });
    expect(degradar.status).toBe(409);
    expect(degradar.json.error.codigo).toBe('ULTIMO_PROPIETARIO');
    // Con otro propietario, sí
    expect((await c.ana.put(`/api/proyectos/${p.id}/miembros/${u.luis.id}`, { rol: 'propietario' })).status).toBe(200);
    expect((await c.ana.put(`/api/proyectos/${p.id}/miembros/${u.ana.id}`, { rol: 'editor' })).status).toBe(200);
    await c.luis.put(`/api/proyectos/${p.id}/miembros/${u.ana.id}`, { rol: 'propietario' });
    await c.ana.put(`/api/proyectos/${p.id}/miembros/${u.luis.id}`, { rol: 'editor' });
    const detalle = (await c.ana.get(`/api/proyectos/${p.id}`)).json;
    expect(detalle.miembros.map((m: any) => m.rol).sort()).toEqual(['editor', 'propietario', 'revisor']);
  });

  it('un lector de la organización no crea proyectos', async () => {
    await usuario('lec@mbc.pe', 'lector');
    const lec = cliente(); await lec.entrar('lec@mbc.pe');
    expect((await lec.post('/api/proyectos', { nombre: 'X' })).status).toBe(403);
  });
});

describe('procesos y revisiones', () => {
  it('crea un proceso desde el export del MVP y lo guarda como v1', async () => {
    const { c, p } = await equipo();
    const r = await c.luis.post(`/api/proyectos/${p.id}/procesos`, { nombre: 'Gestión de siniestros', contenido: EXPORT_MVP });
    expect(r.status).toBe(201);
    expect(r.json.revision).toMatchObject({ numero: 1, estado: 'borrador' });
    const rev = (await c.rosa.get(`/api/revisiones/${r.json.revision.id}`)).json.revision;
    expect(rev.schemaVersion).toBe(1);
    expect(rev.contenido.schemaVersion).toBe(1);
    expect(rev.contenido.nodes).toHaveLength(EXPORT_MVP.nodes.length);
    expect(rev.contenido).not.toHaveProperty('exportedAt');
    expect(rev.autor).toBe('luis');
  });

  it('rechaza un proceso inválido con el detalle de los errores', async () => {
    const { c, p } = await equipo();
    const malo = { ...EXPORT_MVP, edges: [...EXPORT_MVP.edges, { id: 'eX', from: 'n1', to: 'no-existe', label: '' }] };
    const r = await c.luis.post(`/api/proyectos/${p.id}/procesos`, { nombre: 'X', contenido: malo });
    expect(r.status).toBe(400);
    expect(r.json.error.codigo).toBe('PROCESO_INVALIDO');
    expect(r.json.error.detalles.join(' ')).toMatch(/nodo inexistente: no-existe/);
  });

  it('numera las revisiones y avisa si se guardó sobre una que ya no era la última', async () => {
    const { c, p } = await equipo();
    const pr = (await c.luis.post(`/api/proyectos/${p.id}/procesos`, { nombre: 'P', contenido: EXPORT_MVP })).json;
    const r1 = pr.revision.id;
    const r2 = await c.luis.post(`/api/procesos/${pr.proceso.id}/revisiones`, { contenido: EXPORT_MVP, padreId: r1, mensaje: 'Ajuste' });
    expect(r2.json).toMatchObject({ revision: { numero: 2 }, conflicto: false });
    // Ana trabajó sobre la 1 sin ver la 2
    const r3 = await c.ana.post(`/api/procesos/${pr.proceso.id}/revisiones`, { contenido: EXPORT_MVP, padreId: r1 });
    expect(r3.json).toMatchObject({ revision: { numero: 3 }, conflicto: true, ultimaAnterior: { numero: 2 } });
    const lista = (await c.rosa.get(`/api/procesos/${pr.proceso.id}`)).json.revisiones;
    expect(lista.map((x: any) => x.numero)).toEqual([3, 2, 1]);
    expect(lista[1].mensaje).toBe('Ajuste');
  });

  it('permisos: el revisor no escribe y el editor no aprueba', async () => {
    const { c, p } = await equipo();
    expect((await c.rosa.post(`/api/proyectos/${p.id}/procesos`, { nombre: 'X' })).status).toBe(403);
    const pr = (await c.luis.post(`/api/proyectos/${p.id}/procesos`, { nombre: 'P', contenido: EXPORT_MVP })).json;
    const rev = pr.revision.id;
    expect((await c.luis.post(`/api/revisiones/${rev}/estado`, { estado: 'aprobada' })).status).toBe(409); // borrador -> aprobada no existe
    expect((await c.luis.post(`/api/revisiones/${rev}/estado`, { estado: 'en_revision' })).status).toBe(200);
    expect((await c.luis.post(`/api/revisiones/${rev}/estado`, { estado: 'aprobada' })).status).toBe(403);
    expect((await c.pepe.post(`/api/revisiones/${rev}/estado`, { estado: 'aprobada' })).status).toBe(404);
  });

  it('ciclo borrador -> en revisión -> devuelta -> en revisión -> aprobada; la aprobada es inmutable', async () => {
    const { c, p } = await equipo();
    const rev = (await c.luis.post(`/api/proyectos/${p.id}/procesos`, { nombre: 'P', contenido: EXPORT_MVP })).json.revision.id;
    const estado = async (quien: ReturnType<typeof cliente>, e: string) => (await quien.post(`/api/revisiones/${rev}/estado`, { estado: e }));
    expect((await estado(c.luis, 'en_revision')).json.revision.estado).toBe('en_revision');
    expect((await estado(c.rosa, 'borrador')).json.revision.estado).toBe('borrador');
    await estado(c.luis, 'en_revision');
    expect((await estado(c.rosa, 'aprobada')).json.revision.estado).toBe('aprobada');
    const r = await estado(c.ana, 'borrador');
    expect(r.status).toBe(409);
    expect(r.json.error.codigo).toBe('INMUTABLE');
    // Quien no tiene acceso recibe 404, sin saber que existe ni en qué estado está
    for (const e of ['borrador', 'aprobada']) expect((await estado(c.pepe, e)).status).toBe(404);
  });

  it('un proyecto archivado es de solo lectura hasta que se reactiva', async () => {
    const { u, c, p } = await equipo();
    const proc = (await c.luis.post(`/api/proyectos/${p.id}/procesos`, { nombre: 'P', contenido: EXPORT_MVP })).json;
    await c.luis.post(`/api/revisiones/${proc.revision.id}/estado`, { estado: 'en_revision' });
    await c.ana.patch(`/api/proyectos/${p.id}`, { archivado: true });

    const bloqueos = [
      await c.luis.post(`/api/proyectos/${p.id}/procesos`, { nombre: 'X' }),
      await c.rosa.post(`/api/revisiones/${proc.revision.id}/estado`, { estado: 'aprobada' }),
      await c.ana.put(`/api/proyectos/${p.id}/miembros/${u.pepe.id}`, { rol: 'lector' }),
      await c.ana.del(`/api/proyectos/${p.id}/miembros/${u.luis.id}`),
      await c.ana.patch(`/api/proyectos/${p.id}`, { nombre: 'Otro' })
    ];
    expect(bloqueos.map((r) => [r.status, r.json.error.codigo])).toEqual(Array(5).fill([409, 'ARCHIVADO']));
    expect((await c.luis.get(`/api/procesos/${proc.proceso.id}`)).status).toBe(200);

    expect((await c.ana.patch(`/api/proyectos/${p.id}`, { archivado: false })).status).toBe(200);
    expect((await c.rosa.post(`/api/revisiones/${proc.revision.id}/estado`, { estado: 'aprobada' })).status).toBe(200);
  });

  it('todo queda en la auditoría', async () => {
    const { c, p } = await equipo();
    await c.luis.post(`/api/proyectos/${p.id}/procesos`, { nombre: 'P', contenido: EXPORT_MVP });
    const eventos = (await c.admin.get('/api/auditoria?limite=50')).json.eventos.map((e: any) => `${e.accion}:${e.usuario}`);
    expect(eventos).toEqual(expect.arrayContaining([
      'proyecto.alta:ana@mbc.pe', 'proyecto.miembro:ana@mbc.pe', 'proceso.alta:luis@mbc.pe', 'sesion.inicio:rosa@mbc.pe'
    ]));
    expect((await c.luis.get('/api/auditoria')).status).toBe(403);
    // Un límite que no es un número usa el de por defecto en vez de fallar
    expect((await c.admin.get('/api/auditoria?limite=abc')).status).toBe(200);
  });

  it('el directorio (para elegir miembros) lo ve cualquiera, solo con cuentas activas y sin datos sensibles', async () => {
    const { u, c } = await equipo();
    await c.admin.patch(`/api/usuarios/${u.pepe.id}`, { activo: false });
    const r = await c.luis.get('/api/directorio');
    expect(r.status).toBe(200);
    expect(r.json.usuarios.map((x: any) => x.email).sort()).toEqual(['admin@mbc.pe', 'ana@mbc.pe', 'luis@mbc.pe', 'rosa@mbc.pe']);
    expect(Object.keys(r.json.usuarios[0]).sort()).toEqual(['email', 'id', 'nombre']);
    expect((await cliente().get('/api/directorio')).status).toBe(401);
  });
});
