import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asc } from 'drizzle-orm';
import { aplicarMigraciones, auditoria, carpetaMigraciones, organizaciones, sesiones, usuarios, type Conexion } from '@processiq/db';
import { ejecutarCli } from './cli.js';
import { CLAVE, cerrarBase, cliente, prepararBase, usuario, vaciar } from './pruebas/entorno.js';
import { hashearClave } from './seguridad.js';

let conexion: Conexion;
beforeAll(async () => { conexion = await prepararBase(); });
afterAll(cerrarBase);
beforeEach(vaciar);

/** Segunda organización (el entorno de pruebas solo crea la primera). */
async function otraOrganizacion(nombre = 'Otra') {
  const [o] = await conexion.db.insert(organizaciones).values({ nombre }).returning();
  return o!;
}

async function usuarioEn(organizacionId: string, email: string, rol: 'admin' | 'consultor' | 'lector' = 'consultor') {
  const [u] = await conexion.db.insert(usuarios).values({
    organizacionId, email, nombre: email.split('@')[0]!, rol, hashClave: await hashearClave(CLAVE), debeCambiarClave: false
  }).returning();
  return u!;
}

const filas = () => conexion.db.select().from(auditoria).orderBy(asc(auditoria.id));

describe('auditoría por organización', () => {
  it('cada administrador ve solo los eventos de su organización', async () => {
    const adminA = await usuario('admin@mbc.pe', 'admin');
    const anaA = await usuario('ana@mbc.pe');
    const orgB = await otraOrganizacion();
    const adminB = await usuarioEn(orgB.id, 'admin@otra.pe', 'admin');
    const lucaB = await usuarioEn(orgB.id, 'luca@otra.pe');

    const a = cliente(), ana = cliente(), b = cliente(), luca = cliente();
    await a.entrar(adminA.email); await ana.entrar(anaA.email); await b.entrar(adminB.email); await luca.entrar(lucaB.email);
    await ana.post('/api/proyectos', { nombre: 'Proyecto A' });
    await luca.post('/api/proyectos', { nombre: 'Proyecto B' });
    // Entradas fallidas: contra una cuenta de B y con un correo que no existe
    expect((await cliente().entrar(lucaB.email, 'otra-clave-mala')).status).toBe(401);
    expect((await cliente().entrar('nadie@ninguna.pe', 'otra-clave-mala')).status).toBe(401);

    const vistoA = (await a.get('/api/auditoria?limite=100')).json.eventos;
    const vistoB = (await b.get('/api/auditoria?limite=100')).json.eventos;
    const resumen = (ev: any[]) => ev.map((e) => `${e.accion}:${e.usuario ?? e.detalle.email}`).sort();
    expect(resumen(vistoA)).toEqual(['proyecto.alta:ana@mbc.pe', 'sesion.inicio:admin@mbc.pe', 'sesion.inicio:ana@mbc.pe']);
    expect(resumen(vistoB)).toEqual([
      'proyecto.alta:luca@otra.pe', 'sesion.fallida:luca@otra.pe', 'sesion.inicio:admin@otra.pe', 'sesion.inicio:luca@otra.pe'
    ]);

    // Los filtros no cruzan organizaciones: la entidad de otra organización no aparece
    const proyectoB = vistoB.find((e: any) => e.accion === 'proyecto.alta').entidadId;
    expect((await a.get(`/api/auditoria?entidad=proyecto&entidadId=${proyectoB}`)).json.eventos).toEqual([]);
    expect((await b.get(`/api/auditoria?entidad=proyecto&entidadId=${proyectoB}`)).json.eventos).toHaveLength(1);

    // En la base, cada fila lleva su organización; la del correo inexistente, ninguna
    const org = new Map((await filas()).map((f) => [`${f.accion}:${f.usuarioId ?? (f.detalle as any).email}`, f.organizacionId]));
    expect(org.get(`proyecto.alta:${anaA.id}`)).toBe(adminA.organizacionId);
    expect(org.get(`proyecto.alta:${lucaB.id}`)).toBe(orgB.id);
    expect(org.get('sesion.fallida:luca@otra.pe')).toBe(orgB.id);
    expect(org.get('sesion.fallida:nadie@ninguna.pe')).toBeNull();
  });

  it('solo los administradores consultan la auditoría', async () => {
    await usuario('ana@mbc.pe');
    const ana = cliente(); await ana.entrar('ana@mbc.pe');
    expect((await ana.get('/api/auditoria')).status).toBe(403);
    expect((await cliente().get('/api/auditoria')).status).toBe(401);
  });
});

describe('línea de comandos', () => {
  it('crear-usuario y restablecer-clave quedan en la auditoría, sin autor y con origen cli', async () => {
    const admin = await usuario('admin@mbc.pe', 'admin');
    const orgB = await otraOrganizacion();
    const adminB = await usuarioEn(orgB.id, 'admin@otra.pe', 'admin');

    const salida = await ejecutarCli(conexion.db, ['crear-usuario', '--email', 'Nuevo@MBC.pe', '--nombre', 'Nuevo', '--rol', 'lector']);
    expect(salida).toMatch(/^Usuario creado: nuevo@mbc\.pe \(lector\)\nContraseña temporal: \S{14}\n/);

    const b = cliente(); await b.entrar('admin@otra.pe');
    expect(await conexion.db.select().from(sesiones)).toHaveLength(1);
    expect(await ejecutarCli(conexion.db, ['restablecer-clave', '--email', 'ADMIN@otra.pe'])).toMatch(/^Contraseña temporal: \S{14}\n/);
    expect(await conexion.db.select().from(sesiones)).toHaveLength(0);

    await expect(ejecutarCli(conexion.db, ['restablecer-clave', '--email', 'nadie@mbc.pe'])).rejects.toThrow('No existe un usuario con ese correo.');
    await expect(ejecutarCli(conexion.db, ['crear-usuario', '--email', 'x@mbc.pe'])).rejects.toThrow(/^Uso: crear-usuario/);
    await expect(ejecutarCli(conexion.db, ['borrar-todo'])).rejects.toThrow('Comandos: crear-usuario, restablecer-clave');

    const cli = (await filas()).filter((f) => f.accion.startsWith('cli.'));
    expect(cli.map((f) => [f.accion, f.usuarioId, f.organizacionId, f.detalle, f.ip])).toEqual([
      ['cli.usuario.alta', null, admin.organizacionId, { origen: 'cli', email: 'nuevo@mbc.pe', rol: 'lector' }, null],
      ['cli.usuario.restablecer_clave', null, orgB.id, { origen: 'cli', email: 'admin@otra.pe' }, null]
    ]);
    expect(cli[1]!.entidadId).toBe(adminB.id);

    // El administrador de la organización lo ve en la plataforma
    const c = cliente(); await c.entrar(admin.email);
    const eventos = (await c.get('/api/auditoria?entidad=usuario')).json.eventos;
    expect(eventos.filter((e: any) => e.accion.startsWith('cli.')).map((e: any) => [e.accion, e.usuario, e.detalle.origen]))
      .toEqual([['cli.usuario.alta', null, 'cli']]);
  });
});

describe('migración', () => {
  it('rellena la organización de las filas anteriores a partir del usuario', async () => {
    // Base en la versión anterior: todas las migraciones hasta la de la auditoría por organización
    const tmp = mkdtempSync(join(tmpdir(), 'piq-migraciones-'));
    try {
      cpSync(carpetaMigraciones(), tmp, { recursive: true });
      const rutaDiario = join(tmp, 'meta', '_journal.json');
      const diario = JSON.parse(readFileSync(rutaDiario, 'utf8'));
      const corte = diario.entries.findIndex((e: { tag: string }) => e.tag.endsWith('_auditoria_organizacion'));
      expect(corte).toBeGreaterThan(0);
      diario.entries = diario.entries.slice(0, corte);
      writeFileSync(rutaDiario, JSON.stringify(diario));

      await conexion.pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
      await aplicarMigraciones(conexion.db, tmp);
      const org = (await conexion.pool.query(`insert into organizaciones (nombre) values ('MBC') returning id`)).rows[0].id;
      const u = (await conexion.pool.query(
        `insert into usuarios (organizacion_id, email, nombre, hash_clave) values ($1, 'ana@mbc.pe', 'Ana', 'x') returning id`, [org]
      )).rows[0].id;
      await conexion.pool.query(
        `insert into auditoria (usuario_id, accion, entidad, entidad_id, detalle) values
           ($1, 'proyecto.alta', 'proyecto', 'p1', '{}'),
           (null, 'sesion.fallida', 'usuario', $1, '{"email":"ana@mbc.pe"}'),
           (null, 'sesion.fallida', 'usuario', null, '{"email":"nadie@mbc.pe"}')`, [u]);

      await aplicarMigraciones(conexion.db);
      const r = await conexion.pool.query('select accion, organizacion_id from auditoria order by id');
      expect(r.rows.map((f) => f.organizacion_id)).toEqual([org, org, null]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
