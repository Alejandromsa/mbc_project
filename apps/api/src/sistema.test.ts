import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { errores, latidos, type Conexion } from '@processiq/db';
import { huellaError, latido, purgarErrores } from './observabilidad.js';
import { cerrarBase, cliente, config, prepararBase, usuario, vaciar } from './pruebas/entorno.js';

let conexion: Conexion;
beforeAll(async () => { conexion = await prepararBase(); });
afterAll(cerrarBase);
beforeEach(async () => { await vaciar(); await conexion.pool.query('truncate errores, latidos'); });

describe('observabilidad', () => {
  it('la huella agrupa el mismo error aunque cambien números, ids o la línea', () => {
    const a = huellaError('api', 'Proceso 12 no encontrado (a1b2c3d4-0000-4000-8000-000000000001)', 'Error: x\n    at leer (/app/dist/servidor.js:120:15)');
    const b = huellaError('api', 'Proceso 99 no encontrado (ffffffff-0000-4000-8000-000000000002)', 'Error: x\n    at leer (/app/dist/servidor.js:131:9)');
    expect(a).toBe(b);
    expect(huellaError('web', 'Proceso 12 no encontrado', null)).not.toBe(a);
  });

  it('un error inesperado de la API queda registrado con referencia; los 4xx no', async () => {
    await usuario('admin@mbc.pe', 'admin');
    const c = cliente();
    let n = 0;
    // Una ruta que falla sin control (antes de la primera petición: Hono fija las rutas al usarse)
    c.app.get('/api/prueba/fallo', () => { throw new Error(`Fallo ${++n} inesperado`); });
    await c.entrar('admin@mbc.pe');

    const r = await c.get('/api/prueba/fallo');
    expect(r.status).toBe(500);
    expect(r.json.error.codigo).toBe('INTERNO');
    expect(r.json.error.mensaje).toContain(r.json.error.referencia);
    expect(r.headers.get('x-request-id')).toBe(r.json.error.referencia);
    await c.get('/api/prueba/fallo');
    expect((await c.get('/api/no-existe')).status).toBe(404);
    expect((await c.get('/api/proyectos/no-es-un-id')).status).toBe(404);

    const filas = await conexion.db.select().from(errores);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ origen: 'api', ruta: 'GET /api/prueba/fallo' });
    expect(filas[0]!.huella).toBe(filas[1]!.huella);
    const grupos = (await c.get('/api/sistema')).json.errores.grupos;
    expect(grupos).toMatchObject([{ origen: 'api', veces: 2, mensaje: 'Fallo 2 inesperado' }]);
    const repeticiones = (await c.get(`/api/sistema/errores/${grupos[0].huella}`)).json.repeticiones;
    expect(repeticiones[0]).toMatchObject({ usuario: 'admin@mbc.pe', detalle: { referencia: expect.any(String) } });
  });

  it('la web informa de sus errores, con o sin sesión, y con límite por IP', async () => {
    await usuario('ana@mbc.pe');
    const anonimo = cliente();
    const error = { origen: 'web', mensaje: 'TypeError: x is undefined', pila: 'at render (proyectos.js:1:100)', url: '/proyectos/' };
    expect((await anonimo.post('/api/errores', error)).status).toBe(204);
    const ana = cliente();
    await ana.entrar('ana@mbc.pe');
    expect((await ana.post('/api/errores', { ...error, origen: 'editor' })).status).toBe(204);
    expect((await anonimo.post('/api/errores', { ...error, origen: 'otro' })).status).toBe(400);

    const filas = await conexion.db.select().from(errores).orderBy(errores.id);
    expect(filas.map((f) => [f.origen, f.usuarioId !== null])).toEqual([['web', false], ['editor', true]]);

    let ultimo = 0;
    for (let i = 0; i < 20; i++) ultimo = (await anonimo.post('/api/errores', error)).status;
    expect(ultimo).toBe(429);
  });

  it('estado del sistema: avisa si el worker no late, si la copia es vieja y si hay errores', async () => {
    await usuario('admin@mbc.pe', 'admin');
    await usuario('ana@mbc.pe');
    const carpeta = await mkdtemp(join(tmpdir(), 'processiq-respaldos-'));
    const archivo = join(carpeta, 'processiq-20260901-000000.dump');
    await writeFile(archivo, 'x'.repeat(1234));
    const haceUnDia = new Date(Date.now() - 30 * 3_600_000);
    await utimes(archivo, haceUnDia, haceUnDia);

    const admin = cliente({ ...config, carpetaRespaldos: carpeta, version: 'abc1234' });
    await admin.entrar('admin@mbc.pe');
    const ana = cliente();
    await ana.entrar('ana@mbc.pe');
    expect((await ana.get('/api/sistema')).status).toBe(403);

    let s = (await admin.get('/api/sistema')).json;
    expect(s.version).toBe('abc1234');
    expect(s.baseDeDatos.migraciones).toBeGreaterThanOrEqual(4);
    expect(s.worker.vivo).toBe(false);
    expect(s.respaldos).toMatchObject({ visible: true, cantidad: 1, ultimo: { archivo: 'processiq-20260901-000000.dump', bytes: 1234 } });
    const textos = s.avisos.map((a: any) => a.texto).join(' | ');
    expect(textos).toContain('worker de IA no ha dado señales');
    expect(textos).toContain('La última copia de seguridad es de hace 30 h');
    expect(textos).toContain('pesa solo 1234 bytes: probablemente está vacía');

    await latido(conexion.db, 'worker', { concurrencia: 2 });
    s = (await admin.get('/api/sistema')).json;
    expect(s.worker).toMatchObject({ vivo: true, detalle: { concurrencia: 2 } });
    expect(s.avisos.map((a: any) => a.texto).join(' ')).not.toContain('worker');

    await conexion.db.update(latidos).set({ en: new Date(Date.now() - 10 * 60_000) }).where(eq(latidos.servicio, 'worker'));
    s = (await admin.get('/api/sistema')).json;
    expect(s.worker.vivo).toBe(false);
    expect(s.avisos.map((a: any) => a.texto).join(' ')).toContain('no da señales desde hace 10 min');
  });

  it('los errores de más de 30 días se purgan', async () => {
    await conexion.db.insert(errores).values([
      { origen: 'api', mensaje: 'viejo', huella: 'h1', creadoEn: sql`now() - interval '40 days'` as unknown as Date },
      { origen: 'api', mensaje: 'reciente', huella: 'h2' }
    ]);
    expect(await purgarErrores(conexion.db)).toBe(1);
    expect((await conexion.db.select().from(errores)).map((e) => e.mensaje)).toEqual(['reciente']);
  });
});
