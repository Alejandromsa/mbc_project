// Plantillas de proceso de punta a punta: el administrador guarda una revisión
// como plantilla y un editor crea con ella un proceso nuevo, que el editor abre.
import { expect, test } from '@playwright/test';
import { CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());

async function entrar(page, usuario) {
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo(usuario));
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
}

test('una revisión se guarda como plantilla y de ella nace un proceso con el cliente del proyecto', async ({ page, browser }) => {
  await entrar(page, 'admin');
  await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await page.getByRole('link', { name: 'Gestión de siniestros', exact: true }).click();
  await page.screenshot({ path: 'resultados/plantilla-proceso.png', fullPage: true });
  await page.getByRole('row', { name: /v3/ }).getByRole('button', { name: 'Guardar como plantilla' }).click();
  const dialogo = page.locator('dialog.dialogo[open]');
  await dialogo.getByLabel('Nombre de la plantilla').fill('Siniestros base');
  await dialogo.getByLabel('Descripción').fill('Flujo de referencia para aseguradoras');
  await dialogo.screenshot({ path: 'resultados/plantilla-guardar.png' });
  await dialogo.getByRole('button', { name: 'Guardar plantilla' }).click();
  await expect(page.getByText('Plantilla «Siniestros base» creada')).toBeVisible();

  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Catálogos' }).click();
  await page.getByRole('tab', { name: 'Plantillas de proceso' }).click();
  const fila = page.getByRole('row', { name: /Siniestros base/ });
  await expect(fila).toContainText('Seguros');
  await expect(fila).toContainText('Admin de Prueba');
  await page.screenshot({ path: 'resultados/plantillas-catalogo.png', fullPage: true });

  // Un editor del proyecto la usa (no es administrador: solo ve las activas)
  const otra = await browser.newPage();
  await entrar(otra, 'editor');
  await otra.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await otra.getByRole('button', { name: 'Nuevo proceso' }).click();
  const nuevo = otra.locator('dialog.dialogo[open]');
  await nuevo.getByLabel('Partir de').selectOption('plantilla');
  await expect(nuevo.getByLabel('Plantilla', { exact: true })).toContainText('Siniestros base');
  await nuevo.getByLabel('Nombre del proceso').fill('Siniestros vehiculares');
  await nuevo.screenshot({ path: 'resultados/plantilla-nuevo-proceso.png' });
  await nuevo.getByRole('button', { name: 'Crear proceso' }).click();

  await expect(otra.getByRole('heading', { name: 'Siniestros vehiculares', level: 1 })).toBeVisible();
  await expect(otra.getByRole('row', { name: /v1/ })).toContainText('Creado desde la plantilla «Siniestros base»');
  await expect(otra.getByRole('button', { name: 'Guardar como plantilla' })).toHaveCount(0);

  // El editor abre el proceso con el diagrama de la plantilla y su nombre
  await otra.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(otra.locator('.piq-proyecto')).toContainText('v1');
  await expect(otra.locator('#processName')).toHaveValue('Siniestros vehiculares');
  expect(await otra.evaluate(() => window.ProcessIQ.snapshot())).toMatchObject({ name: 'Siniestros vehiculares', nodes: expect.any(Number) });
  expect(await otra.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBeGreaterThan(5);
  await otra.close();

  // Oculta, ya no se ofrece
  await fila.getByRole('button', { name: 'Ocultar' }).click();
  await expect(fila).toContainText('Oculta');
  const tercera = await browser.newPage();
  await entrar(tercera, 'editor');
  await tercera.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await tercera.getByRole('button', { name: 'Nuevo proceso' }).click();
  await expect(tercera.locator('dialog.dialogo[open]').getByLabel('Partir de').locator('option[value="plantilla"]')).toHaveCount(0);
  await tercera.close();
});
