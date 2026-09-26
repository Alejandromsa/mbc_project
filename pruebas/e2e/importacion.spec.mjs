// Importación asistida (fase 3): el trabajo del editor libre de este navegador
// y los JSON exportados pasan a un proyecto.
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());

const FIXTURES = (n) => fileURLToPath(new URL(`../../packages/dominio/src/__fixtures__/${n}`, import.meta.url));

async function entrar(page, usuario) {
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo(usuario));
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
}

test('lo dibujado en el editor libre se lleva a un proyecto y se abre igual', async ({ page }) => {
  // Trabajo previo en el editor libre (como en el MVP), en este mismo navegador
  await page.goto('/');
  await page.waitForFunction(() => !!window.ProcessIQ);
  await page.evaluate(() => window.ProcessIQ.loadComplex());
  await page.locator('#processName').fill('Levantamiento en mi navegador');
  const nodos = await page.evaluate(() => window.ProcessIQ.snapshot().nodes);
  expect(nodos).toBeGreaterThan(5);

  await entrar(page, 'editor');
  await expect(page.getByRole('status').filter({ hasText: 'Levantamiento en mi navegador' })).toContainText(`${nodos} elementos`);
  await page.getByRole('link', { name: 'Llevarlo a un proyecto' }).click();

  await expect(page.getByRole('heading', { name: 'Importar procesos' })).toBeVisible();
  await expect(page.getByLabel(/Nombre del proceso/)).toHaveValue('Levantamiento en mi navegador');
  await expect(page.getByLabel('Proyecto de destino')).toContainText('Siniestros — Seguros Andinos');
  await page.getByRole('button', { name: 'Importar el proceso' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'importado' })).toContainText('«Levantamiento en mi navegador» importado');

  // Vaciar el editor libre es opcional
  await page.getByRole('button', { name: 'Vaciar el editor libre' }).click();
  expect(await page.evaluate(() => localStorage.getItem('processiq.v1'))).toBeNull();

  await page.getByRole('link', { name: 'Abrir en el editor' }).click();
  await expect(page.locator('.piq-proyecto')).toContainText('v1 · Borrador');
  expect(await page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(nodos);
  await expect(page.locator('#processName')).toHaveValue('Levantamiento en mi navegador');
});

test('varios JSON exportados del editor se importan de una vez', async ({ page }) => {
  await entrar(page, 'propietario');
  await page.getByRole('link', { name: 'Importar procesos' }).click();
  await expect(page.getByText('No hay nada en el editor libre de este navegador')).toBeVisible();
  await page.getByLabel('Añadir archivos JSON exportados del editor').setInputFiles([
    FIXTURES('mvp-3.8.9-siniestros.json'), FIXTURES('mvp-3.8.9-venta-lotes.json')
  ]);
  await expect(page.getByRole('row')).toHaveCount(3);   // cabecera + 2
  await page.getByRole('button', { name: 'Importar 2 procesos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'importado' })).toHaveCount(2);

  await page.goto('/proyectos/');
  await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await expect(page.getByRole('link', { name: 'Gestión de Siniestros de Seguros', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Venta de Lotes Urbanos', exact: true })).toBeVisible();
});
