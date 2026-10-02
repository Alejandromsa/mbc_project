import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray, like } from 'drizzle-orm';
import { sesiones, usuarios, type Conexion } from '@processiq/db';
import { cerrarBase, cliente, prepararBase, URL_PRUEBAS } from './pruebas/entorno.js';
import { CLAVE_PRUEBA, CUENTAS_PRUEBA, DOMINIO_PRUEBA, correoPrueba, sembrar } from './semilla.js';

let conexion: Conexion;
beforeAll(async () => { conexion = await prepararBase(); });
afterAll(cerrarBase);

describe('semilla de desarrollo', () => {
  it('se puede repetir: restablece las cuentas y rehace los proyectos sin duplicar', async () => {
    await sembrar(conexion.db, URL_PRUEBAS);
    const { proyectoId, procesoSiniestrosId } = await sembrar(conexion.db, URL_PRUEBAS);

    const cuentas = await conexion.db.select().from(usuarios).where(like(usuarios.email, `%@${DOMINIO_PRUEBA}`));
    expect(cuentas).toHaveLength(CUENTAS_PRUEBA.length);
    // Las sesiones con las que se sembró no quedan abiertas
    expect(await conexion.db.select().from(sesiones).where(inArray(sesiones.usuarioId, cuentas.map((c) => c.id)))).toHaveLength(0);

    const admin = cliente();
    await admin.entrar(correoPrueba('admin'), CLAVE_PRUEBA);
    const lista = (await admin.get('/api/proyectos')).json.proyectos;
    expect(lista.map((p: any) => [p.nombre, p.archivado]).sort()).toEqual([
      ['Proyecto archivado (prueba)', true],
      ['Siniestros — Seguros Andinos (prueba)', false]
    ]);

    const detalle = (await admin.get(`/api/proyectos/${proyectoId}`)).json;
    expect(detalle.procesos.map((p: any) => [p.nombre, p.ultimaRevision && [p.ultimaRevision.numero, p.ultimaRevision.estado]]).sort()).toEqual([
      ['Gestión de siniestros', [3, 'borrador']],
      ['Proceso sin revisiones', null],
      ['Venta de lotes urbanos', [1, 'borrador']]
    ]);
    expect(detalle.miembros).toHaveLength(4);
    const revisiones = (await admin.get(`/api/procesos/${procesoSiniestrosId}`)).json.revisiones;
    expect(revisiones.map((r: any) => [r.numero, r.estado])).toEqual([[3, 'borrador'], [2, 'en_revision'], [1, 'aprobada']]);
  });

  it('cada cuenta se comporta según su caso', async () => {
    await sembrar(conexion.db, URL_PRUEBAS);
    const entrar = async (u: string) => { const c = cliente(); return { c, r: await c.entrar(correoPrueba(u), CLAVE_PRUEBA) }; };

    const nuevo = await entrar('nuevo');
    expect(nuevo.r.json.usuario.debeCambiarClave).toBe(true);
    expect((await nuevo.c.get('/api/proyectos')).status).toBe(403);

    expect((await entrar('inactivo')).r.status).toBe(401);

    const externo = await entrar('externo');
    expect((await externo.c.get('/api/proyectos')).json.proyectos).toEqual([]);

    const lector = await entrar('lector');
    expect((await lector.c.get('/api/proyectos')).json.proyectos).toHaveLength(1);
    expect((await lector.c.post('/api/proyectos', { nombre: 'No debería' })).status).toBe(403);
  });
});
