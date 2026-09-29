// Observabilidad de punta a punta: un error del navegador llega a la pantalla
// «Sistema» y el worker real da su latido.
import { expect, test } from '@playwright/test';
import { CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());

test('un error del navegador aparece en «Sistema» y el worker da señales', async ({ page }) => {
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo('admin'));
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();

  // Un error no controlado en la web
  await page.evaluate(() => { setTimeout(() => { throw new Error('Fallo de prueba E2E en la web'); }, 0); });

  await page.getByRole('navigation', { name: 'Secciones' }).getByText('Administración').click();

  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Sistema' }).click();
  await expect(page.getByRole('heading', { name: 'Sistema', level: 1 })).toBeVisible();
  // El desplegable se cierra al elegir y «Administración» queda resaltado en /admin/…
  await expect(page.locator('details.menu-admin')).not.toHaveAttribute('open', '');
  await expect(page.locator('details.menu-admin')).toHaveClass(/activo/);
  await page.getByRole('navigation', { name: 'Secciones' }).getByText('Administración').click();
  await page.screenshot({ path: 'resultados/menu-administracion.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('details.menu-admin')).not.toHaveAttribute('open', '');
  // La base se vació antes de la prueba: el siguiente latido del worker (cada 3 s en las E2E) la repone
  await expect(page.getByRole('region', { name: 'Worker de IA' })).toContainText('Bien', { timeout: 20_000 });
  await expect(page.locator('tbody')).toContainText('Fallo de prueba E2E en la web', { timeout: 20_000 });

  await page.getByRole('button', { name: /Fallo de prueba E2E en la web/ }).click();
  const detalle = page.locator('dialog[open]');
  await expect(detalle).toContainText('admin@processiq.test');
  await expect(detalle.locator('pre')).toContainText('Error: Fallo de prueba E2E en la web');
});
