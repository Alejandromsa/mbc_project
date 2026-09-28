import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { kpis, type Conexion } from '@processiq/db';
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
    // Un cambio parcial no toca lo que no envía (antes se vaciaban unidad, benchmark…)
    expect((await c.admin.get('/api/catalogos/kpis')).json.kpis.find((k: any) => k.codigo === codigo))
      .toMatchObject({ activo: false, macroproceso: 'Siniestros', unidad: 'días', benchmark: '< 10', descripcion: 'Del aviso al pago.' });
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
