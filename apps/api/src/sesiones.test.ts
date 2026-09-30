// Sesiones abiertas: cada uno ve y cierra las suyas (nunca las de otro), el
// administrador cierra las de una cuenta, y cambiar la contraseña o desactivar
// la cuenta cierra las demás. Contra Postgres real.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { auditoria, organizaciones, sesiones, usuarios, type Conexion } from '@processiq/db';
import { resumirAgente } from './rutas/sesion.js';
import { CLAVE, cerrarBase, cliente, marcarClaveTemporal, prepararBase, usuario, vaciar } from './pruebas/entorno.js';
import { hashearClave } from './seguridad.js';

let conexion: Conexion;
beforeAll(async () => { conexion = await prepararBase(); });
afterAll(cerrarBase);
beforeEach(vaciar);

type Cliente = ReturnType<typeof cliente>;

const UA = {
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  firefoxLinux: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'
};

/** Entra como `email` desde un navegador con ese agente y esa IP (la que pondría Caddy). */
async function entrarDesde(email: string, agente: string, ip = '198.51.100.7'): Promise<Cliente> {
  const c = cliente();
  const r = await c.post('/api/sesion', { email, clave: CLAVE }, { 'user-agent': agente, 'x-forwarded-for': ip });
  expect(r.status).toBe(200);
  return c;
}

const lista = async (c: Cliente) => (await c.get('/api/sesion/lista')).json.sesiones as any[];
const sigueDentro = async (c: Cliente) => (await c.get('/api/sesion')).status === 200;
const acciones = async (accion: string) =>
  conexion.db.select().from(auditoria).where(eq(auditoria.accion, accion)).orderBy(asc(auditoria.id));
const filasDe = async (usuarioId: string) => (await conexion.db.select().from(sesiones).where(eq(sesiones.usuarioId, usuarioId))).length;

describe('resumen del agente de usuario', () => {
  it('navegador y sistema, sin versiones', () => {
    expect(resumirAgente(UA.chromeWindows)).toEqual({ navegador: 'Chrome', sistema: 'Windows' });
    expect(resumirAgente(UA.firefoxLinux)).toEqual({ navegador: 'Firefox', sistema: 'Linux' });
    expect(resumirAgente(UA.safariIphone)).toEqual({ navegador: 'Safari', sistema: 'iOS' });
    expect(resumirAgente(UA.edgeWindows)).toEqual({ navegador: 'Edge', sistema: 'Windows' });
    expect(resumirAgente(UA.chromeAndroid)).toEqual({ navegador: 'Chrome', sistema: 'Android' });
    expect(resumirAgente(UA.safariMac)).toEqual({ navegador: 'Safari', sistema: 'macOS' });
    expect(resumirAgente('curl/8.9.1')).toEqual({ navegador: null, sistema: null });
    expect(resumirAgente(null)).toEqual({ navegador: null, sistema: null });
  });
});

describe('mis sesiones', () => {
  it('lista solo las mías y vigentes, con la actual marcada y primero; nunca el token ni su hash', async () => {
    const ana = await usuario('ana@mbc.pe');
    await usuario('luis@mbc.pe');
    const enCasa = await entrarDesde('ana@mbc.pe', UA.firefoxLinux, '203.0.113.20');
    const enLaOficina = await entrarDesde('ana@mbc.pe', UA.chromeWindows, '198.51.100.7');
    await entrarDesde('luis@mbc.pe', UA.safariIphone);
    // Una sesión caducada de Ana (el worker aún no la purgó): no se lista
    const caducada = await entrarDesde('ana@mbc.pe', UA.safariMac);
    const [vieja] = await lista(caducada);
    await conexion.db.update(sesiones).set({ expiraEn: new Date(Date.now() - 1000) }).where(eq(sesiones.id, vieja.id));

    const vistas = await lista(enLaOficina);
    expect(vistas).toHaveLength(2);
    expect(vistas[0]).toMatchObject({ actual: true, navegador: 'Chrome', sistema: 'Windows', ip: '198.51.100.7' });
    expect(vistas[1]).toMatchObject({ actual: false, navegador: 'Firefox', sistema: 'Linux', ip: '203.0.113.20' });
    for (const s of vistas) {
      expect(Object.keys(s).sort()).toEqual(['actual', 'creadaEn', 'expiraEn', 'id', 'ip', 'navegador', 'sistema']);
      expect(new Date(s.expiraEn).getTime()).toBeGreaterThan(new Date(s.creadaEn).getTime());
    }
    // Ni el token de la cookie ni el hash de la base aparecen en la respuesta
    const cuerpo = JSON.stringify(await enLaOficina.get('/api/sesion/lista'));
    const hashes = (await conexion.db.select({ h: sesiones.tokenHash }).from(sesiones).where(eq(sesiones.usuarioId, ana.id))).map((f) => f.h);
    for (const h of hashes) expect(cuerpo).not.toContain(h);
    expect(cuerpo).not.toContain(enLaOficina.cookie.split('=')[1]!);
    // Desde el otro navegador, la actual es la otra
    expect((await lista(enCasa)).find((s) => s.actual)).toMatchObject({ navegador: 'Firefox' });
  });

  it('cierro otra sesión mía: deja de valer y queda en la auditoría; la de otra persona responde 404', async () => {
    const ana = await usuario('ana@mbc.pe');
    await usuario('luis@mbc.pe');
    const enCasa = await entrarDesde('ana@mbc.pe', UA.firefoxLinux);
    const enLaOficina = await entrarDesde('ana@mbc.pe', UA.chromeWindows);
    const luis = await entrarDesde('luis@mbc.pe', UA.safariIphone);
    const deCasa = (await lista(enCasa)).find((s) => s.actual)!.id;
    const deLuis = (await lista(luis))[0].id;

    // La de Luis no existe para Ana: 404, y Luis sigue dentro
    expect((await enLaOficina.del(`/api/sesion/lista/${deLuis}`)).status).toBe(404);
    expect(await sigueDentro(luis)).toBe(true);
    expect((await enLaOficina.del('/api/sesion/lista/no-es-un-uuid')).status).toBe(404);
    expect((await enLaOficina.del('/api/sesion/lista/00000000-0000-4000-8000-000000000000')).status).toBe(404);

    expect((await enLaOficina.del(`/api/sesion/lista/${deCasa}`)).status).toBe(204);
    expect(await sigueDentro(enCasa)).toBe(false);
    expect(await sigueDentro(enLaOficina)).toBe(true);
    expect((await lista(enLaOficina)).map((s) => s.actual)).toEqual([true]);
    const [ev] = await acciones('sesion.cierre_otra');
    expect(ev).toMatchObject({ usuarioId: ana.id, entidad: 'usuario', entidadId: ana.id, detalle: { sesionId: deCasa } });
    // Ya cerrada: 404
    expect((await enLaOficina.del(`/api/sesion/lista/${deCasa}`)).status).toBe(404);
  });

  it('cerrar la sesión actual desde la lista es salir', async () => {
    await usuario('ana@mbc.pe');
    const c = await entrarDesde('ana@mbc.pe', UA.chromeWindows);
    const [actual] = await lista(c);
    const r = await c.del(`/api/sesion/lista/${actual.id}`);
    expect(r.status).toBe(204);
    expect(r.headers.get('set-cookie')).toMatch(/piq_sesion=;/);
    expect(await sigueDentro(c)).toBe(false);
    expect(await acciones('sesion.cierre')).toHaveLength(1);
  });

  it('cerrar las demás: todas menos la actual, con su número en la respuesta y en la auditoría', async () => {
    const ana = await usuario('ana@mbc.pe');
    await usuario('luis@mbc.pe');
    const a1 = await entrarDesde('ana@mbc.pe', UA.firefoxLinux);
    const a2 = await entrarDesde('ana@mbc.pe', UA.safariIphone);
    const a3 = await entrarDesde('ana@mbc.pe', UA.chromeWindows);
    const luis = await entrarDesde('luis@mbc.pe', UA.chromeWindows);

    const r = await a3.post('/api/sesion/cerrar-otras');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ cerradas: 2 });
    expect(await sigueDentro(a1)).toBe(false);
    expect(await sigueDentro(a2)).toBe(false);
    expect(await sigueDentro(a3)).toBe(true);
    expect(await sigueDentro(luis)).toBe(true);
    expect(await filasDe(ana.id)).toBe(1);
    expect((await acciones('sesion.cierre_otras'))[0]).toMatchObject({ usuarioId: ana.id, detalle: { cerradas: 2 } });
    // Sin otras: 0
    expect((await a3.post('/api/sesion/cerrar-otras')).json).toEqual({ cerradas: 0 });
    // Exigen el Origin de la web, como toda escritura
    expect((await a3.post('/api/sesion/cerrar-otras', {}, { origin: 'https://malicioso.test' })).status).toBe(403);
  });

  it('sin sesión, 401; con la contraseña temporal pendiente, 403 CAMBIAR_CLAVE (reset ya las cerró todas)', async () => {
    const anonimo = cliente();
    expect((await anonimo.get('/api/sesion/lista')).status).toBe(401);
    expect((await anonimo.post('/api/sesion/cerrar-otras')).status).toBe(401);
    await usuario('ana@mbc.pe');
    await marcarClaveTemporal('ana@mbc.pe');
    const c = await entrarDesde('ana@mbc.pe', UA.chromeWindows);
    const r = await c.get('/api/sesion/lista');
    expect(r.status).toBe(403);
    expect(r.json.error.codigo).toBe('CAMBIAR_CLAVE');
    expect((await c.post('/api/sesion/cerrar-otras')).json.error.codigo).toBe('CAMBIAR_CLAVE');
  });
});

describe('cierres por cambios en la cuenta', () => {
  it('cambiar la contraseña cierra las demás sesiones y lo deja en la auditoría', async () => {
    const ana = await usuario('ana@mbc.pe');
    const enCasa = await entrarDesde('ana@mbc.pe', UA.firefoxLinux);
    const enElMovil = await entrarDesde('ana@mbc.pe', UA.safariIphone);
    const enLaOficina = await entrarDesde('ana@mbc.pe', UA.chromeWindows);
    expect((await enLaOficina.post('/api/sesion/clave', { actual: CLAVE, nueva: 'otra-clave-bien-larga' })).status).toBe(204);
    expect(await sigueDentro(enCasa)).toBe(false);
    expect(await sigueDentro(enElMovil)).toBe(false);
    expect(await sigueDentro(enLaOficina)).toBe(true);
    expect((await lista(enLaOficina)).map((s) => s.navegador)).toEqual(['Chrome']);
    expect((await acciones('usuario.cambio_clave'))[0]).toMatchObject({ usuarioId: ana.id, detalle: { sesionesCerradas: 2 } });
  });

  it('desactivar una cuenta cierra todas sus sesiones', async () => {
    await usuario('admin@mbc.pe', 'admin');
    const ana = await usuario('ana@mbc.pe');
    const admin = await entrarDesde('admin@mbc.pe', UA.chromeWindows);
    const a1 = await entrarDesde('ana@mbc.pe', UA.firefoxLinux);
    const a2 = await entrarDesde('ana@mbc.pe', UA.safariIphone);
    expect(await filasDe(ana.id)).toBe(2);
    expect((await admin.patch(`/api/usuarios/${ana.id}`, { activo: false })).status).toBe(200);
    expect(await filasDe(ana.id)).toBe(0);
    expect(await sigueDentro(a1)).toBe(false);
    expect(await sigueDentro(a2)).toBe(false);
    // Reactivada, las sesiones cerradas siguen cerradas: hay que volver a entrar
    await admin.patch(`/api/usuarios/${ana.id}`, { activo: true });
    expect(await sigueDentro(a1)).toBe(false);
  });
});

describe('administración: cerrar las sesiones de una cuenta', () => {
  it('el administrador cierra todas las de una cuenta de su organización', async () => {
    const adm = await usuario('admin@mbc.pe', 'admin');
    const luis = await usuario('luis@mbc.pe');
    const admin = await entrarDesde('admin@mbc.pe', UA.chromeWindows);
    const l1 = await entrarDesde('luis@mbc.pe', UA.firefoxLinux);
    const l2 = await entrarDesde('luis@mbc.pe', UA.safariIphone);
    const r = await admin.post(`/api/sesion/usuarios/${luis.id}/cerrar`);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ cerradas: 2 });
    expect(await sigueDentro(l1)).toBe(false);
    expect(await sigueDentro(l2)).toBe(false);
    expect(await sigueDentro(admin)).toBe(true);
    expect((await acciones('sesion.cierre_admin'))[0]).toMatchObject({
      usuarioId: adm.id, entidad: 'usuario', entidadId: luis.id, detalle: { cerradas: 2 }
    });
    // La cuenta sigue activa: puede volver a entrar
    expect(await sigueDentro(await entrarDesde('luis@mbc.pe', UA.firefoxLinux))).toBe(true);
  });

  it('sobre sí mismo conserva la sesión desde la que lo pide', async () => {
    const adm = await usuario('admin@mbc.pe', 'admin');
    const otra = await entrarDesde('admin@mbc.pe', UA.firefoxLinux);
    const admin = await entrarDesde('admin@mbc.pe', UA.chromeWindows);
    expect((await admin.post(`/api/sesion/usuarios/${adm.id}/cerrar`)).json).toEqual({ cerradas: 1 });
    expect(await sigueDentro(otra)).toBe(false);
    expect(await sigueDentro(admin)).toBe(true);
  });

  it('permisos: un consultor no puede (403); otra organización o un id inválido, 404', async () => {
    await usuario('admin@mbc.pe', 'admin');
    const luis = await usuario('luis@mbc.pe');
    await usuario('ana@mbc.pe');
    const [otraOrg] = await conexion.db.insert(organizaciones).values({ nombre: 'Otra' }).returning();
    const [luca] = await conexion.db.insert(usuarios).values({
      organizacionId: otraOrg!.id, email: 'luca@otra.pe', nombre: 'luca', rol: 'consultor', hashClave: await hashearClave(CLAVE), debeCambiarClave: false
    }).returning();
    const admin = await entrarDesde('admin@mbc.pe', UA.chromeWindows);
    const consultora = await entrarDesde('ana@mbc.pe', UA.chromeWindows);
    const deLuis = await entrarDesde('luis@mbc.pe', UA.chromeWindows);
    const deLuca = await entrarDesde('luca@otra.pe', UA.chromeWindows);

    const r = await consultora.post(`/api/sesion/usuarios/${luis.id}/cerrar`);
    expect(r.status).toBe(403);
    expect(r.json.error.codigo).toBe('PERMISO');
    expect(await sigueDentro(deLuis)).toBe(true);
    expect((await admin.post(`/api/sesion/usuarios/${luca!.id}/cerrar`)).status).toBe(404);
    expect(await sigueDentro(deLuca)).toBe(true);
    expect((await admin.post('/api/sesion/usuarios/no-es-un-uuid/cerrar')).status).toBe(404);
    expect(await acciones('sesion.cierre_admin')).toHaveLength(0);
  });
});
