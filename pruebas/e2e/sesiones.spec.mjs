// Sesiones abiertas de punta a punta, con dos navegadores: la misma persona entra
// en los dos, desde uno ve las dos sesiones y cierra la otra, y el otro vuelve a
// «Entrar» en cuanto hace algo. También el administrador («Cerrar sesiones» de una
// cuenta) y el cambio de contraseña, que cierra las demás. Capturas en español e inglés.
import { expect, test } from '@playwright/test';
import { CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());

async function entrar(page, usuario, clave = CLAVE) {
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo(usuario));
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
}

const cabecera = (page) => page.locator('.shell-cabecera');
const filas = (page) => page.getByRole('table').locator('tbody tr');
const idioma = (page, nombre) => cabecera(page).getByRole('group').getByRole('button', { name: nombre });

/** El nombre de la cabecera abre el menú del usuario («Cambiar contraseña», «Sesiones»); «Salir» está al lado. */
async function menuUsuario(page, opcion) {
  await cabecera(page).locator('.menu-usuario > summary').click();
  await cabecera(page).getByRole('link', { name: opcion }).click();
}

/** Tras perder la sesión, cualquier consulta lleva a «Entrar» (y conserva a dónde volver). */
async function vuelveAEntrar(page) {
  await expect(page).toHaveURL(/\/proyectos\/entrar\?volver=/);
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
}

test('la misma persona en dos navegadores: ve sus dos sesiones, cierra la otra y ese navegador vuelve a «Entrar»', async ({ page, browser }) => {
  await entrar(page, 'lector');
  // El menú del usuario: se abre con el nombre, se cierra con Escape; «Salir» queda a la vista
  const menu = cabecera(page).locator('.menu-usuario');
  await menu.locator('summary').click();
  await expect(menu.getByRole('link')).toHaveText(['Cambiar contraseña', 'Sesiones']);
  await expect(cabecera(page).getByRole('button', { name: 'Salir' })).toBeVisible();
  await page.screenshot({ path: 'resultados/sesiones-menu.png', clip: { x: 0, y: 0, width: 1280, height: 160 } });
  await page.keyboard.press('Escape');
  await expect(menu.getByRole('link', { name: 'Sesiones' })).toBeHidden();
  await menuUsuario(page, 'Sesiones');
  await expect(page.getByRole('heading', { name: 'Sesiones', level: 1 })).toBeVisible();
  await expect(menu).toHaveClass(/activo/);
  await expect(menu.getByRole('link', { name: 'Sesiones' })).toBeHidden();   // al elegir, se cierra
  await expect(page).toHaveTitle('Sesiones · ProcessIQ');
  await expect(filas(page)).toHaveCount(1);
  await expect(filas(page).first()).toContainText('Chrome en Windows');
  await expect(filas(page).first()).toContainText('Esta sesión');
  await expect(page.getByText('No tienes otras sesiones abiertas.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar las demás sesiones' })).toBeDisabled();

  // Segundo navegador, la misma cuenta
  const contextoB = await browser.newContext();
  const otro = await contextoB.newPage();
  await entrar(otro, 'lector');

  // En el primero aparecen las dos: esta, primero y marcada; la otra, con «Cerrar»
  await page.reload();
  await expect(filas(page)).toHaveCount(2);
  await expect(filas(page).first()).toContainText('Esta sesión');
  await expect(filas(page).nth(1)).not.toContainText('Esta sesión');
  await expect(filas(page).nth(1).getByRole('button', { name: 'Cerrar la sesión de Chrome en Windows' })).toBeVisible();
  await expect(filas(page).first().getByRole('button')).toHaveCount(0);
  await expect(page.getByText('No tienes otras sesiones abiertas.')).toHaveCount(0);
  await page.screenshot({ path: 'resultados/sesiones-dos.png' });

  // Cierra las demás: solo queda esta
  await page.getByRole('button', { name: 'Cerrar las demás sesiones' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se cerró 1 sesión' })).toHaveText('Se cerró 1 sesión: ese navegador tendrá que volver a entrar.');
  await expect(filas(page)).toHaveCount(1);
  await page.screenshot({ path: 'resultados/sesiones-cerradas.png' });

  // El otro navegador, en cuanto hace algo, vuelve a «Entrar»; al entrar, sigue donde iba
  await menuUsuario(otro, 'Sesiones');
  await vuelveAEntrar(otro);
  await otro.getByLabel('Correo').fill(correo('lector'));
  await otro.getByLabel('Contraseña').fill(CLAVE);
  await otro.getByRole('button', { name: 'Entrar' }).click();
  await expect(otro.getByRole('heading', { name: 'Sesiones', level: 1 })).toBeVisible();
  await expect(filas(otro)).toHaveCount(2);

  // Cerrar una sola: la del otro navegador
  await page.reload();
  await filas(page).nth(1).getByRole('button', { name: 'Cerrar la sesión de Chrome en Windows' }).click();
  await expect(page.getByText('Sesión cerrada: ese navegador tendrá que volver a entrar.')).toBeVisible();
  await expect(filas(page)).toHaveCount(1);
  await otro.getByRole('link', { name: 'Proyectos', exact: true }).click();
  await vuelveAEntrar(otro);

  // En inglés (y de vuelta a español, que es lo que esperan las demás pruebas en este navegador)
  await entrar(otro, 'lector');
  await page.reload();
  await idioma(page, 'English').click();
  await expect(page.getByRole('heading', { name: 'Sessions', level: 1 })).toBeVisible();
  await expect(filas(page).first()).toContainText('Chrome on Windows');
  await expect(filas(page).first()).toContainText('This session');
  await expect(filas(page).nth(1).getByRole('button', { name: 'Sign out the session on Chrome on Windows' })).toBeVisible();
  await page.screenshot({ path: 'resultados/sesiones-en.png' });
  await cabecera(page).locator('.menu-usuario > summary').click();
  await expect(cabecera(page).locator('.menu-usuario').getByRole('link')).toHaveText(['Change password', 'Sessions']);
  await page.screenshot({ path: 'resultados/sesiones-menu-en.png', clip: { x: 0, y: 0, width: 1280, height: 160 } });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sign out all other sessions' }).click();
  await expect(page.getByText('1 session signed out: that browser will have to sign in again.')).toBeVisible();
  await idioma(page, 'Español').click();
  await expect(page.getByRole('heading', { name: 'Sesiones', level: 1 })).toBeVisible();
  await contextoB.close();
});

test('cambiar la contraseña cierra las demás sesiones', async ({ page, browser }) => {
  await entrar(page, 'editor');
  const contextoB = await browser.newContext();
  const otro = await contextoB.newPage();
  await entrar(otro, 'editor');

  await menuUsuario(page, 'Cambiar contraseña');
  await page.getByLabel('Contraseña actual').fill(CLAVE);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill('Otra-Clave-De-Prueba-2026');
  await page.getByLabel('Repite la contraseña nueva').fill('Otra-Clave-De-Prueba-2026');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();

  // Esta sigue dentro y es la única; la del otro navegador se cerró
  await menuUsuario(page, 'Sesiones');
  await expect(filas(page)).toHaveCount(1);
  await expect(filas(page).first()).toContainText('Esta sesión');
  await menuUsuario(otro, 'Sesiones');
  await vuelveAEntrar(otro);
  await contextoB.close();
});

test('el administrador cierra todas las sesiones de una cuenta desde «Usuarios»', async ({ page, browser }) => {
  const contextoB = await browser.newContext();
  const lector = await contextoB.newPage();
  await entrar(lector, 'lector');

  await entrar(page, 'admin');
  await page.goto('/proyectos/admin/usuarios');
  const fila = page.getByRole('row').filter({ hasText: 'Lector de Prueba' });
  // No se ofrece sobre uno mismo ni sobre una cuenta desactivada (no tiene sesiones)
  await expect(page.getByRole('row').filter({ hasText: 'Admin de Prueba' }).getByRole('button', { name: 'Cerrar sesiones' })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Inactivo de Prueba' }).getByRole('button', { name: 'Cerrar sesiones' })).toHaveCount(0);

  let pregunta = '';
  page.once('dialog', (d) => { pregunta = d.message(); d.accept(); });
  await fila.getByRole('button', { name: 'Cerrar sesiones' }).click();
  await expect(page.getByText('Se cerró 1 sesión de Lector de Prueba.')).toBeVisible();
  expect(pregunta).toBe('¿Cerrar todas las sesiones de Lector de Prueba? Tendrá que volver a entrar en cada navegador. La cuenta sigue activa.');
  await page.screenshot({ path: 'resultados/sesiones-admin.png' });

  // El lector vuelve a «Entrar»; su cuenta sigue activa y puede entrar de nuevo
  await menuUsuario(lector, 'Sesiones');
  await vuelveAEntrar(lector);
  await entrar(lector, 'lector');

  // En inglés el aviso sigue al idioma; si se cancela la confirmación, no se cierra nada
  await idioma(page, 'English').click();
  await expect(page.getByText('1 session of Lector de Prueba signed out.')).toBeVisible();
  const cierres = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/sesion/usuarios/')) cierres.push(r.url()); });
  page.once('dialog', (d) => d.dismiss());
  await fila.getByRole('button', { name: 'Sign out sessions' }).click();
  expect(cierres).toEqual([]);
  page.once('dialog', (d) => d.accept());
  await fila.getByRole('button', { name: 'Sign out sessions' }).click();
  await expect.poll(() => cierres.length).toBe(1);
  await expect(page.getByText('1 session of Lector de Prueba signed out.')).toBeVisible();
  await page.screenshot({ path: 'resultados/sesiones-admin-en.png' });
  await idioma(page, 'Español').click();
  await contextoB.close();
});
