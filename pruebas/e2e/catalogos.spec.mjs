// Catálogos administrables de punta a punta: el administrador los cambia en el
// shell y el editor los usa en los procesos de proyectos (KPIs, linter, PPTX).
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());

async function entrar(page, usuario) {
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo(usuario));
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
}

async function abrirSiniestrosEnEditor(page) {
  await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await page.getByRole('link', { name: 'Gestión de siniestros', exact: true }).click();
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(page.locator('.piq-proyecto')).toContainText('v3');
}

test('KPIs y verbos de la organización llegan al editor; el editor libre sigue con los de fábrica', async ({ page, browser }) => {
  await entrar(page, 'admin');
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Catálogos' }).click();

  await page.getByRole('button', { name: 'Nuevo KPI' }).click();
  const dialogo = page.locator('dialog.dialogo[open]');
  await dialogo.getByLabel('Nombre').fill('Tiempo de liquidación de siniestros');
  await dialogo.getByLabel('Industria').fill('Seguros');
  await dialogo.getByLabel('Macroproceso').fill('Siniestros');
  await dialogo.getByLabel('Unidad').fill('días');
  await dialogo.getByRole('button', { name: 'Crear KPI' }).click();
  await expect(page.getByRole('row', { name: /Tiempo de liquidación de siniestros/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Verbos del Playbook' }).click();
  await page.getByLabel('Verbo prohibido').fill('registrar');
  await page.getByLabel('Motivo').fill('En este cliente se dice «ingresar».');
  await page.getByRole('button', { name: 'Prohibir' }).click();
  await expect(page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'registrar', exact: true }) })).toContainText('se dice «ingresar»');

  const editor = await (await browser.newContext()).newPage();
  await entrar(editor, 'editor');
  await abrirSiniestrosEnEditor(editor);
  expect(await editor.evaluate(() => window.KPI_LIBRARY.some((k) => k.name === 'Tiempo de liquidación de siniestros'))).toBe(true);
  expect(await editor.evaluate(() => window.VERBS_FORBIDDEN.registrar)).toBe('En este cliente se dice «ingresar».');
  await expect(editor.locator('#lintList')).toContainText('se dice «ingresar»');

  // El editor libre no usa los catálogos de la organización
  await editor.goto('/');
  await editor.waitForFunction(() => !!window.ProcessIQ);
  expect(await editor.evaluate(() => window.KPI_LIBRARY.some((k) => k.name === 'Tiempo de liquidación de siniestros'))).toBe(false);
  expect(await editor.evaluate(() => window.VERBS_FORBIDDEN.registrar)).toBeUndefined();
});

test('un tema PPTX de cliente se crea en el shell y exporta con sus colores', async ({ page, browser }) => {
  await entrar(page, 'admin');
  await page.goto('/proyectos/admin/catalogos');
  await page.getByRole('tab', { name: 'Temas PPTX' }).click();
  await page.getByRole('button', { name: 'Nuevo tema' }).click();
  await page.getByLabel('Nombre del cliente').fill('Rímac Seguros');
  await expect(page.getByLabel('Clave')).toHaveValue('rimac-seguros');
  await page.getByRole('button', { name: 'Crear y editar' }).click();

  const editorTema = page.locator('dialog.dialogo-ancho[open]');
  await expect(editorTema).toContainText('Colores');
  await editorTema.locator('label.color').filter({ hasText: 'Principal (títulos y barras)' }).locator('input').fill('#c8102e');
  await editorTema.getByRole('button', { name: 'Guardar tema' }).click();
  await expect(page.locator('.tema')).toContainText('Rímac Seguros');

  const editor = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await entrar(editor, 'editor');
  await abrirSiniestrosEnEditor(editor);
  await editor.locator('#btnExportMenu').click();
  const boton = editor.getByRole('button', { name: /PPTX · cliente Rímac Seguros/ });
  await expect(boton).toBeVisible();
  const [descarga] = await Promise.all([editor.waitForEvent('download', { timeout: 60_000 }), boton.click()]);
  const zip = await JSZip.loadAsync(await readFile(await descarga.path()));
  const laminas = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(laminas.length).toBeGreaterThan(1);
  const xml = (await Promise.all(laminas.map((f) => zip.file(f).async('string')))).join('');
  expect(xml).toContain('C8102E');
});
