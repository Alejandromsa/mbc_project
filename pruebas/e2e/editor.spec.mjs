// Editor: borradores locales del modo proyecto y «Exportar → JSON» completo
// (divergencia D7), de punta a punta con el shell, la API y Postgres.
import { readFile } from 'node:fs/promises';
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

const barra = (page) => page.locator('.piq-proyecto');
const clavesLocales = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('processiq.proceso.')).sort());

async function guardarRevision(page, mensaje) {
  await barra(page).getByRole('button', { name: 'Guardar revisión' }).click();
  const dialogo = page.locator('dialog.piq-dialogo');
  await dialogo.getByRole('textbox').fill(mensaje);
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click();
}

test('los borradores locales se borran al guardar una revisión que los contiene y se purgan a los 30 días', async ({ page }) => {
  await entrar(page, 'editor');
  // Lo que dejaron en este navegador otros procesos (ids inventados) y el editor libre
  const hace = (dias) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const libre = JSON.stringify({ meta: { name: 'Trabajo del editor libre' }, nodes: [], edges: [], savedAt: hace(90) });
  await page.evaluate(({ viejo, reciente, libre }) => {
    const borrador = (savedAt) => JSON.stringify({ meta: { name: 'Otro proceso' }, nodes: [], edges: [], savedAt });
    const base = JSON.stringify({ revisionId: null, huella: 'abc' });
    localStorage.setItem('processiq.proceso.otro-viejo', borrador(viejo));
    localStorage.setItem('processiq.proceso.otro-viejo.base', base);
    localStorage.setItem('processiq.proceso.otro-reciente', borrador(reciente));
    localStorage.setItem('processiq.proceso.otro-reciente.base', base);
    localStorage.setItem('processiq.proceso.huerfano.base', base);
    localStorage.setItem('processiq.v1', libre);
  }, { viejo: hace(31), reciente: hace(29), libre });

  await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await page.getByRole('link', { name: 'Gestión de siniestros', exact: true }).click();
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(barra(page)).toContainText('v3 · Borrador');
  const id = new URL(page.url()).searchParams.get('proceso');
  const propio = `processiq.proceso.${id}`;

  // Al abrir: se purgan el de más de 30 días y la base sin borrador; el reciente y el editor libre siguen
  expect(await clavesLocales(page)).toEqual([propio, `${propio}.base`, 'processiq.proceso.otro-reciente', 'processiq.proceso.otro-reciente.base'].sort());
  expect(await page.evaluate(() => localStorage.getItem('processiq.v1'))).toBe(libre);

  // Guardar una revisión que contiene el borrador lo borra
  await page.locator('#processName').fill('Siniestros con borrador');
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeVisible();
  expect(await clavesLocales(page)).toContain(propio);
  await guardarRevision(page, 'Nombre nuevo');
  await expect(page.locator('.piq-proyecto-aviso')).toContainText('Guardada como v4');
  await expect.poll(() => clavesLocales(page)).toEqual(['processiq.proceso.otro-reciente', 'processiq.proceso.otro-reciente.base']);

  // Un cambio nuevo vuelve a crear el borrador y su base (la v4), y se puede recuperar
  await page.locator('#processName').fill('Siniestros tras guardar');
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeVisible();
  expect(await clavesLocales(page)).toContain(`${propio}.base`);
  const base = await page.evaluate((c) => JSON.parse(localStorage.getItem(c)), `${propio}.base`);
  expect(base.revisionId).toBe(new URL(page.url()).searchParams.get('revision'));
  page.on('dialog', (d) => d.accept());   // aviso nativo de «salir con cambios sin guardar»
  await page.reload();
  const dialogo = page.locator('dialog.piq-dialogo');
  await expect(dialogo).toContainText('Tienes cambios sin guardar');
  await dialogo.getByRole('button', { name: 'Recuperar mis cambios' }).click();
  await expect(page.locator('#processName')).toHaveValue('Siniestros tras guardar');
  expect(await page.evaluate(() => localStorage.getItem('processiq.v1'))).toBe(libre);
});

/** «Exportar → JSON» del editor libre con To-Be y análisis; devuelve el archivo descargado. */
async function exportarJsonCompleto(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForFunction(() => !!window.ProcessIQ);
  await page.evaluate(() => window.ProcessIQ.loadComplex4());
  await page.evaluate(() => document.querySelector('#btnCloneToBe').click());
  await expect(page.locator('#tobeIndicator')).toBeVisible();
  // Análisis capturados, tal como los guarda el editor, y recarga
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('processiq.v1'));
    Object.assign(d, {
      kpiValues: { 'seg-03': { name: 'Lead time de siniestro', unit: 'días', benchmark: '< 7 días', value: '12', gap: '+5', source: 'Muestreo de 30 casos' } },
      raci: { [d.nodes[1].id]: { Operaciones: 'R/A' } },
      sipoc: { suppliers: 'Cliente', inputs: 'Solicitud', process: 'Atender la solicitud', outputs: 'Respuesta', customers: 'Cliente' },
      simResults: { fteCurrent: 2.5, fteToBe: 1.5, monthlyCost: 1000, monthlySavings: 400, annualSavings: 4800, leadTimeChain: 120, activitiesWithData: 3 }
    });
    localStorage.setItem('processiq.v1', JSON.stringify(d));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.ProcessIQ);
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => document.querySelector('button[data-export="json"]').click())
  ]);
  const ruta = test.info().outputPath('proceso-completo.json');
  await descarga.saveAs(ruta);
  await ctx.close();
  return { ruta, json: JSON.parse(await readFile(ruta, 'utf8')) };
}

/** Contenido de la última revisión de un proceso, pedido a la API con la sesión de la página. */
async function ultimaRevision(page, procesoId) {
  const { revisiones } = await (await page.request.get(`/api/procesos/${procesoId}`)).json();
  return (await (await page.request.get(`/api/revisiones/${revisiones[0].id}`)).json()).revision.contenido;
}

function comprobarContenidoCompleto(contenido, json) {
  expect(contenido.activeView).toBe('tobe');
  expect(contenido.views.tobe.nodes).toHaveLength(json.nodes.length);
  expect(contenido.views.asis.nodes).toHaveLength(json.views.asis.nodes.length);
  expect(contenido.kpiValues).toEqual(json.kpiValues);
  expect(contenido.raci).toEqual(json.raci);
  expect(contenido.sipoc).toEqual(json.sipoc);
  expect(contenido.simResults).toEqual(json.simResults);
  expect(contenido.lanes).toEqual(json.lanes);
  // Las cachés de pintado no llegan a la revisión, tampoco dentro de las vistas
  expect(JSON.stringify(contenido.views)).not.toMatch(/"_(d|dSerie|band|inferredOwner|sello)"/);
}

test('el JSON completo del editor se lleva a un proyecto con sus dos vistas y análisis («Nuevo proceso» e importación asistida)', async ({ page, browser }) => {
  const { ruta, json } = await exportarJsonCompleto(browser);
  expect(json.views.asis.nodes.length).toBeGreaterThan(5);
  expect(json.views.tobe.nodes).toHaveLength(json.nodes.length);

  // «Nuevo proceso → JSON» en un proyecto
  await entrar(page, 'editor');
  await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await page.getByRole('button', { name: 'Nuevo proceso' }).click();
  const nuevo = page.locator('dialog.dialogo[open]');
  await nuevo.getByLabel('Partir de').selectOption('archivo');
  await nuevo.locator('#archivo-proceso').setInputFiles(ruta);
  await expect(nuevo.getByLabel('Nombre del proceso')).toHaveValue(json.meta.name);
  await nuevo.screenshot({ path: 'resultados/editor-json-nuevo-proceso.png' });
  await nuevo.getByRole('button', { name: 'Crear proceso' }).click();
  await expect(page.getByRole('heading', { name: json.meta.name, level: 1 })).toBeVisible();
  const procesoId = page.url().split('/proyectos/proceso/')[1];
  comprobarContenidoCompleto(await ultimaRevision(page, procesoId), json);

  // Se abre en el editor en la vista To-Be, y la As-Is también está
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(barra(page)).toContainText('v1');
  await expect(page.locator('#tobeIndicator')).toBeVisible();
  expect(await page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(json.nodes.length);
  await page.screenshot({ path: 'resultados/editor-json-en-proyecto.png' });
  await page.locator('#btnViewAsIs').click();
  expect(await page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(json.views.asis.nodes.length);

  // Importación asistida del mismo archivo
  await page.goto('/proyectos/importar');
  await page.getByLabel('Añadir archivos JSON exportados del editor').setInputFiles(ruta);
  await expect(page.getByRole('row')).toHaveCount(2);   // cabecera + 1
  await page.getByRole('button', { name: 'Importar el proceso' }).click();
  const hecho = page.getByRole('status').filter({ hasText: 'importado' });
  await expect(hecho).toBeVisible();
  const importado = new URL(await hecho.getByRole('link', { name: 'Abrir en el editor' }).getAttribute('href'), page.url()).searchParams.get('proceso');
  comprobarContenidoCompleto(await ultimaRevision(page, importado), json);
});

test('el editor libre importa el JSON completo; el panel «Validaciones» y la ingesta muestran sus textos nuevos', async ({ page, browser }) => {
  const { ruta, json } = await exportarJsonCompleto(browser);
  await page.goto('/');
  await page.waitForFunction(() => !!window.ProcessIQ);
  await page.evaluate(() => window.ProcessIQ.loadDemo());
  await page.locator('#fileImport').setInputFiles(ruta);
  await expect(page.locator('#tobeIndicator')).toBeVisible();
  await expect(page.locator('#btnViewToBe')).toHaveClass(/active/);
  expect(await page.evaluate(() => window.ProcessIQ.snapshot())).toMatchObject({ name: json.meta.name, nodes: json.nodes.length });
  // El selector cambia de color con una transición: la captura espera a que termine
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#btnViewToBe')).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.screenshot({ path: 'resultados/editor-json-importado.png' });

  // D8: el aviso del linter no promete bloquear el export
  await page.evaluate(() => document.querySelector('[data-tab="validations"]').click());
  const validaciones = page.locator('[data-panel="validations"]');
  await expect(validaciones.locator('.panel-hint')).toContainText('crítico (conviene resolverlo antes de exportar)');
  await validaciones.screenshot({ path: 'resultados/editor-validaciones.png' });

  // D9: tildes en la ingesta
  await page.locator('#btnIngest').click();
  await page.evaluate(() => window.ProcessIQ.addSource('texto', 'notas.txt', 'El cliente solicita el servicio. El asesor valida los datos.'));
  await expect(page.locator('#btnAddSource')).toHaveText('+ Añadir otra fuente');
  await page.locator('#ingestModal .modal-card').screenshot({ path: 'resultados/editor-ingesta-fuentes.png' });
});
