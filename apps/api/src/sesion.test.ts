import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashearClave, problemaConClave, verificarClave } from './seguridad.js';
import { CLAVE, cerrarBase, cliente, marcarClaveTemporal, prepararBase, usuario, vaciar } from './pruebas/entorno.js';

beforeAll(async () => { await prepararBase(); });
afterAll(cerrarBase);
beforeEach(vaciar);

describe('contraseñas', () => {
  it('scrypt: verifica la correcta y rechaza la incorrecta o un formato ajeno', async () => {
    const h = await hashearClave('correcta horse battery');
    expect(h.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(await verificarClave('correcta horse battery', h)).toBe(true);
    expect(await verificarClave('otra', h)).toBe(false);
    expect(await verificarClave('x', 'md5$abc')).toBe(false);
  });

  it('reglas mínimas para contraseñas nuevas', () => {
    expect(problemaConClave('corta', 'ana@mbc.pe')).toMatch(/10 caracteres/);
    expect(problemaConClave('1234567890123', 'ana@mbc.pe')).toMatch(/solo números/);
    expect(problemaConClave('ana-es-la-mejor', 'ana@mbc.pe')).toMatch(/usuario de correo/);
    expect(problemaConClave('una-frase-larga', 'ana@mbc.pe')).toBeNull();
  });
});

describe('sesión', () => {
  it('entra, pone una cookie httpOnly/Secure/SameSite y dice quién soy', async () => {
    await usuario('ana@mbc.pe', 'admin');
    const c = cliente();
    const r = await c.entrar('ANA@mbc.pe');                      // el correo no distingue mayúsculas
    expect(r.status).toBe(200);
    expect(r.json.usuario).toMatchObject({ email: 'ana@mbc.pe', rol: 'admin', debeCambiarClave: false });
    const cookie = r.headers.get('set-cookie')!;
    expect(cookie).toMatch(/piq_sesion=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect((await c.get('/api/sesion')).json.usuario.email).toBe('ana@mbc.pe');
  });

  it('sin cookie: 401; credenciales malas: mensaje genérico', async () => {
    await usuario('ana@mbc.pe');
    const c = cliente();
    expect((await c.get('/api/proyectos')).status).toBe(401);
    const malo = await c.entrar('ana@mbc.pe', 'no-es-esta');
    const inexistente = await c.entrar('nadie@mbc.pe', 'no-es-esta');
    expect(malo.status).toBe(401);
    expect(inexistente.json.error.mensaje).toBe(malo.json.error.mensaje);
  });

  it('salir invalida la sesión', async () => {
    await usuario('ana@mbc.pe');
    const c = cliente();
    await c.entrar('ana@mbc.pe');
    const cookie = c.cookie;
    expect((await c.del('/api/sesion')).status).toBe(204);
    const otro = cliente();
    const r = await otro.get('/api/sesion', { cookie });
    expect(r.status).toBe(401);
  });

  it('las escrituras exigen el Origin de la web (CSRF)', async () => {
    await usuario('ana@mbc.pe');
    const c = cliente();
    const r = await c.post('/api/sesion', { email: 'ana@mbc.pe', clave: CLAVE }, { origin: 'https://malicioso.test' });
    expect(r.status).toBe(403);
    expect(r.json.error.codigo).toBe('ORIGEN');
  });

  it('bloquea tras 10 intentos fallidos', async () => {
    await usuario('ana@mbc.pe');
    const c = cliente();
    for (let i = 0; i < 10; i++) expect((await c.entrar('ana@mbc.pe', 'mala-' + i)).status).toBe(401);
    const r = await c.entrar('ana@mbc.pe');
    expect(r.status).toBe(429);
  });

  it('con contraseña temporal solo se puede cambiarla; al cambiarla se liberan las rutas', async () => {
    await usuario('ana@mbc.pe');
    await marcarClaveTemporal('ana@mbc.pe');
    const c = cliente();
    expect((await c.entrar('ana@mbc.pe')).json.usuario.debeCambiarClave).toBe(true);
    const bloqueada = await c.get('/api/proyectos');
    expect(bloqueada.status).toBe(403);
    expect(bloqueada.json.error.codigo).toBe('CAMBIAR_CLAVE');
    expect((await c.post('/api/sesion/clave', { actual: CLAVE, nueva: 'corta' })).json.error.codigo).toBe('CLAVE_DEBIL');
    expect((await c.post('/api/sesion/clave', { actual: 'mala', nueva: 'otra-clave-bien-larga' })).json.error.codigo).toBe('CLAVE_ACTUAL');
    expect((await c.post('/api/sesion/clave', { actual: CLAVE, nueva: 'otra-clave-bien-larga' })).status).toBe(204);
    expect((await c.get('/api/proyectos')).status).toBe(200);
    // la nueva sirve para entrar; la vieja ya no
    expect((await cliente().entrar('ana@mbc.pe', 'otra-clave-bien-larga')).status).toBe(200);
    expect((await cliente().entrar('ana@mbc.pe')).status).toBe(401);
  });
});

describe('usuarios (administración)', () => {
  it('el admin da de alta con contraseña temporal; el nuevo debe cambiarla', async () => {
    await usuario('admin@mbc.pe', 'admin');
    const admin = cliente();
    await admin.entrar('admin@mbc.pe');
    const alta = await admin.post('/api/usuarios', { email: 'Luis@MBC.pe', nombre: 'Luis Soto', rol: 'consultor' });
    expect(alta.status).toBe(201);
    expect(alta.json.usuario.email).toBe('luis@mbc.pe');
    expect(alta.json.claveTemporal).toMatch(/^[A-Za-z2-9]{14}$/);
    expect((await admin.post('/api/usuarios', { email: 'luis@mbc.pe', nombre: 'Otro' })).status).toBe(409);
    const luis = cliente();
    expect((await luis.entrar('luis@mbc.pe', alta.json.claveTemporal)).json.usuario.debeCambiarClave).toBe(true);
  });

  it('un consultor no administra usuarios', async () => {
    await usuario('ana@mbc.pe');
    const c = cliente();
    await c.entrar('ana@mbc.pe');
    expect((await c.get('/api/usuarios')).status).toBe(403);
  });

  it('desactivar corta las sesiones; el admin no puede desactivarse a sí mismo', async () => {
    const admin = await usuario('admin@mbc.pe', 'admin');
    const ana = await usuario('ana@mbc.pe');
    const ca = cliente(); await ca.entrar('admin@mbc.pe');
    const cu = cliente(); await cu.entrar('ana@mbc.pe');
    expect((await ca.patch(`/api/usuarios/${ana.id}`, { activo: false })).status).toBe(200);
    expect((await cu.get('/api/sesion')).status).toBe(401);
    expect((await ca.patch(`/api/usuarios/${admin.id}`, { activo: false })).status).toBe(409);
  });
});
