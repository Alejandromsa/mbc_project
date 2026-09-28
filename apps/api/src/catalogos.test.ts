import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { kpis, plantillasProceso, type Conexion } from '@processiq/db';
import { KPI_LIBRARY, VERBS_ALLOWED, VERBS_FORBIDDEN } from '@processiq/dominio';
import { asegurarCatalogos } from './catalogos.js';
import { cerrarBase, cliente, prepararBase, usuario, vaciar } from './pruebas/entorno.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TEMA = {
  nombre: 'Rímac', autor: 'MBC Business Consulting · Rímac', pie: 'Rímac',
  dk1: 'C8102E', lt2: 'FFFFFF', acento: 'E4002B', gris: '6B6B6B', antetitulo: '6B6B6B', sep: 'D9D9D9', chipRol: 'FBE3E6',
  teal: '8C1D2F', rosa: 'C8102E', verde: '2E7D32', arena: 'F5F5F5', circulo: 'C8102E',
  font: 'Arial', fontTitulo: 'Arial', logo: PNG, logoInv: PNG, logoW: 1.2, logoH: 0.3,
  portada: 'mbc', portadaFondo: 'C8102E', portadaTexto: 'FFFFFF', portadaSub: 'FBE3E6', cierre: true
};

let conexion: Conexion;
beforeAll(async () => { conexion = await prepararBase(); });
afterAll(cerrarBase);
beforeEach(vaciar);

async function equipo() {
  const admin = await usuario('admin@mbc.pe', 'admin');
  await usuario('ana@mbc.pe');
  const c = { admin: cliente(), ana: cliente() };
  await c.admin.entrar('admin@mbc.pe');
  await c.ana.entrar('ana@mbc.pe');
  return { admin, c };
}
const porId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

describe('catálogos administrables', () => {
  it('la organización nace con los catálogos del MVP y el editor los recibe con la misma forma; sembrar dos veces no duplica', async () => {
    const { admin, c } = await equipo();
    const r = (await c.ana.get('/api/catalogos')).json;
    expect([...r.kpis].sort(porId)).toEqual([...KPI_LIBRARY].sort(porId));
    expect([...r.verbos.permitidos].sort()).toEqual([...VERBS_ALLOWED].sort());
    expect(r.verbos.prohibidos).toEqual(VERBS_FORBIDDEN);
    expect(r.temas).toEqual([]);

    await asegurarCatalogos(conexion.db, admin.organizacionId);
    const [n] = await conexion.db.select({ n: sql<number>`count(*)::int` }).from(kpis).where(eq(kpis.organizacionId, admin.organizacionId));
    expect(n!.n).toBe(KPI_LIBRARY.length);
  });

  it('KPIs: el administrador crea y desactiva; el resto no puede', async () => {
    const { c } = await equipo();
    const nuevo = { industria: 'Seguros', macroproceso: 'Siniestros', nombre: 'Tiempo de liquidación', unidad: 'días', benchmark: '< 10', descripcion: 'Del aviso al pago.' };
    expect((await c.ana.post('/api/catalogos/kpis', nuevo)).status).toBe(403);
    const r = await c.admin.post('/api/catalogos/kpis', nuevo);
    expect(r.status).toBe(201);
    const codigo = r.json.kpi.codigo;
    expect(codigo).toMatch(/^org-[0-9a-f]{8}$/);
    const enEditor = async () => (await c.ana.get('/api/catalogos')).json.kpis.find((k: any) => k.id === codigo);
    expect(await enEditor()).toMatchObject({ name: 'Tiempo de liquidación', industry: 'Seguros', macroprocess: 'Siniestros', unit: 'días' });

    expect((await c.admin.patch(`/api/catalogos/kpis/${r.json.kpi.id}`, { activo: false })).status).toBe(200);
    expect(await enEditor()).toBeUndefined();
    expect((await c.admin.get('/api/catalogos/kpis')).json.kpis.some((k: any) => k.codigo === codigo && !k.activo)).toBe(true);
    expect((await c.admin.post('/api/catalogos/kpis', { nombre: 'Sin industria' })).status).toBe(400);
  });

  it('verbos del Playbook: pasar un verbo a prohibido exige motivo; se puede quitar', async () => {
    const { c } = await equipo();
    expect((await c.admin.put('/api/catalogos/verbos/coordinar', { tipo: 'prohibido' })).status).toBe(400);
    expect((await c.admin.put('/api/catalogos/verbos/coordinar', { tipo: 'prohibido', motivo: 'Demasiado vago en este cliente.' })).status).toBe(200);
    expect((await c.admin.put(`/api/catalogos/verbos/${encodeURIComponent('dos palabras')}`, { tipo: 'permitido' })).status).toBe(400);
    expect((await c.ana.put('/api/catalogos/verbos/tramitar', { tipo: 'permitido' })).status).toBe(403);
    expect((await c.admin.put('/api/catalogos/verbos/Tramitar', { tipo: 'permitido' })).status).toBe(200);

    let v = (await c.ana.get('/api/catalogos')).json.verbos;
    expect(v.prohibidos.coordinar).toBe('Demasiado vago en este cliente.');
    expect(v.permitidos).not.toContain('coordinar');
    expect(v.permitidos).toContain('tramitar');

    expect((await c.admin.del('/api/catalogos/verbos/tramitar')).status).toBe(204);
    v = (await c.ana.get('/api/catalogos')).json.verbos;
    expect(v.permitidos).not.toContain('tramitar');
  });

  it('temas PPTX de cliente: se validan, no pisan los del sistema y el editor recibe los activos', async () => {
    const { c } = await equipo();
    expect((await c.ana.post('/api/catalogos/temas', { clave: 'rimac', definicion: TEMA })).status).toBe(403);
    expect((await c.admin.post('/api/catalogos/temas', { clave: 'mbc', definicion: TEMA })).json.error.codigo).toBe('CLAVE_RESERVADA');
    const malo = await c.admin.post('/api/catalogos/temas', { clave: 'rimac', definicion: { ...TEMA, dk1: '#C8102E' } });
    expect(malo.status).toBe(400);
    expect(malo.json.error.detalles.join(' ')).toContain('dk1');
    expect((await c.admin.post('/api/catalogos/temas', { clave: 'rimac', definicion: { ...TEMA, logo: 'https://otro.sitio/logo.png' } })).status).toBe(400);

    const r = await c.admin.post('/api/catalogos/temas', { clave: 'Rimac', definicion: TEMA });
    expect(r.status).toBe(201);
    expect(r.json.tema).toMatchObject({ clave: 'rimac', nombre: 'Rímac', activo: true });
    expect((await c.admin.post('/api/catalogos/temas', { clave: 'rimac', definicion: TEMA })).json.error.codigo).toBe('DUPLICADO');
    expect((await c.ana.get('/api/catalogos')).json.temas).toEqual([{ clave: 'rimac', nombre: 'Rímac', definicion: TEMA }]);

    await c.admin.patch(`/api/catalogos/temas/${r.json.tema.id}`, { activo: false });
    expect((await c.ana.get('/api/catalogos')).json.temas).toEqual([]);
    expect((await c.admin.del(`/api/catalogos/temas/${r.json.tema.id}`)).status).toBe(204);
    expect((await c.admin.get('/api/catalogos/temas')).json.temas).toEqual([]);
  });
});

describe('plantillas de proceso', () => {
  const ejemplo = () => JSON.parse(readFileSync(join(import.meta.dirname, '../../../packages/dominio/src/__fixtures__/mvp-3.8.9-venta-lotes.json'), 'utf8'));

  /** Un proyecto de Ana con un proceso y su primera revisión (el ejemplo del MVP, con cliente y personas). */
  async function conRevision(c: { ana: ReturnType<typeof cliente> }) {
    const proyecto = (await c.ana.post('/api/proyectos', { nombre: 'Piloto', cliente: 'Cliente Demo' })).json.proyecto;
    const creado = (await c.ana.post(`/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Venta', contenido: ejemplo() })).json;
    return { proyecto, revisionId: creado.revision.id as string };
  }

  it('el administrador la crea desde una revisión sin los datos del cliente; los demás solo la usan', async () => {
    const { c } = await equipo();
    const { proyecto, revisionId } = await conRevision(c);

    expect((await c.ana.post('/api/catalogos/plantillas', { revisionId, nombre: 'Venta de lotes' })).status).toBe(403);
    const r = await c.admin.post('/api/catalogos/plantillas', { revisionId, nombre: 'Venta de lotes', descripcion: 'Del piloto' });
    expect(r.status).toBe(201);
    expect(r.json.plantilla).toMatchObject({ nombre: 'Venta de lotes', descripcion: 'Del piloto', industria: 'Transversal', nodos: 33, activo: true, autor: 'admin' });
    expect(r.json.plantilla.contenido).toBeUndefined();
    const id = r.json.plantilla.id;
    expect((await c.admin.post('/api/catalogos/plantillas', { revisionId, nombre: 'Venta de lotes' })).json.error.codigo).toBe('DUPLICADO');

    const [fila] = await conexion.db.select().from(plantillasProceso).where(eq(plantillasProceso.id, id));
    const guardado = fila!.contenido as any;
    expect(guardado.meta.client).toBe('');
    expect(guardado.ficha.gobernanza).toEqual([]);
    expect(guardado.ficha.cambios).toEqual([]);
    expect(guardado.kpiValues).toBeUndefined();
    expect(JSON.stringify(guardado)).not.toContain('Rolleri');   // la persona de la gobernanza

    // Ana la ve y crea un proceso a partir de ella: nombre propio y el cliente de su proyecto
    expect((await c.ana.get('/api/catalogos/plantillas')).json.plantillas.map((p: any) => p.nombre)).toEqual(['Venta de lotes']);
    const nuevo = await c.ana.post(`/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Venta Lima', plantillaId: id });
    expect(nuevo.status).toBe(201);
    expect(nuevo.json.revision.numero).toBe(1);
    const rev = (await c.ana.get(`/api/revisiones/${nuevo.json.revision.id}`)).json.revision;
    expect(rev.mensaje).toBe('Creado desde la plantilla «Venta de lotes»');
    expect(rev.contenido.meta).toMatchObject({ name: 'Venta Lima', client: 'Cliente Demo' });
    expect(rev.contenido.nodes).toHaveLength(33);
    expect(rev.contenido.ficha.gobernanza).toEqual([]);
  });

  it('una plantilla oculta no se ofrece ni se usa; se renombra, se borra y no se mezcla con contenido', async () => {
    const { c } = await equipo();
    const { proyecto, revisionId } = await conRevision(c);
    const id = (await c.admin.post('/api/catalogos/plantillas', { revisionId, nombre: 'Base' })).json.plantilla.id;

    expect((await c.ana.post(`/api/proyectos/${proyecto.id}/procesos`, { nombre: 'X', plantillaId: id, contenido: ejemplo() })).status).toBe(400);
    expect((await c.ana.patch(`/api/catalogos/plantillas/${id}`, { activo: false })).status).toBe(403);
    const oculta = await c.admin.patch(`/api/catalogos/plantillas/${id}`, { activo: false });
    expect(oculta.json.plantilla).toMatchObject({ nombre: 'Base', activo: false });
    expect((await c.ana.get('/api/catalogos/plantillas')).json.plantillas).toEqual([]);
    expect((await c.admin.get('/api/catalogos/plantillas')).json.plantillas).toHaveLength(1);
    expect((await c.ana.post(`/api/proyectos/${proyecto.id}/procesos`, { nombre: 'X', plantillaId: id })).status).toBe(404);

    const renombrada = await c.admin.patch(`/api/catalogos/plantillas/${id}`, { nombre: 'Base comercial', activo: true });
    expect(renombrada.json.plantilla).toMatchObject({ nombre: 'Base comercial', activo: true, descripcion: '' });
    expect((await c.admin.del(`/api/catalogos/plantillas/${id}`)).status).toBe(204);
    expect((await c.admin.del(`/api/catalogos/plantillas/${id}`)).status).toBe(404);
    // El proceso del que salió sigue intacto
    expect((await c.ana.get(`/api/revisiones/${revisionId}`)).json.revision.contenido.ficha.gobernanza.length).toBeGreaterThan(0);
  });

  it('solo desde revisiones a las que el administrador llega y que existen', async () => {
    const { c } = await equipo();
    expect((await c.admin.post('/api/catalogos/plantillas', { revisionId: '00000000-0000-4000-8000-000000000000', nombre: 'Nada' })).status).toBe(404);
    expect((await c.admin.post('/api/catalogos/plantillas', { revisionId: 'no-es-uuid', nombre: 'Nada' })).status).toBe(400);
  });
});
