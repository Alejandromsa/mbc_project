// Fidelidad de las interacciones: copiloto, comandos, deshacer, minería,
// ingesta de texto, importación BPMN e IA simulada.
import { test } from '@playwright/test';
import { compararEnAmbas } from './src/comparar.mjs';
import { VIEWPORT, abrirApp, DEMOS } from './src/escenarios.mjs';
import {
  TEXTOS, capturarComandos, capturarCopiloto, capturarGeneracionIa, capturarImportBpmn,
  capturarMineria, capturarTareasIa, capturarTextoBasico, estadoDiagrama, prepararIa, xmlBpmnDeDemo
} from './src/interacciones.mjs';
import { PUERTO_REFERENCIA } from './src/puertos.mjs';
import { capturarPaneles } from './src/paneles.mjs';
import { archivosDeIngesta } from './src/archivos.mjs';

for (const demo of ['loadDemo', 'loadComplex', 'loadComplex11', 'loadFichaVentaLotes']) {
  test(`copiloto: ${demo}`, async ({ browser }) => {
    await compararEnAmbas(browser, `copiloto-${demo}`, (page) => capturarCopiloto(page, demo));
  });
}

test('comandos en lenguaje natural y deshacer', async ({ browser }) => {
  await compararEnAmbas(browser, 'comandos', (page) => capturarComandos(page));
});

test('minería de event log (muestra)', async ({ browser }) => {
  await compararEnAmbas(browser, 'mineria', (page) => capturarMineria(page));
});

for (const clave of Object.keys(TEXTOS)) {
  test(`texto en modo básico: ${clave}`, async ({ browser }) => {
    await compararEnAmbas(browser, `texto-${clave}`, (page) => capturarTextoBasico(page, clave));
  });
}

test('importación BPMN de los 14 ejemplos', async ({ browser }) => {
  // El XML de entrada sale siempre del MVP de referencia: se prueba solo el importador.
  const ctx = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await abrirApp(page, `http://127.0.0.1:${PUERTO_REFERENCIA}/`);
  const xmls = {};
  for (const d of DEMOS) xmls[d] = await xmlBpmnDeDemo(page, d);
  await ctx.close();
  await compararEnAmbas(browser, 'importar-bpmn', async (p) => {
    const a = {};
    for (const d of DEMOS) {
      for (const [k, v] of Object.entries(await capturarImportBpmn(p, xmls[d]))) a[`${d}/${k}`] = v;
    }
    return a;
  });
});

test('IA simulada: generación desde texto y niveles', async ({ browser }) => {
  const peticiones = [];
  await compararEnAmbas(browser, 'ia-generacion', (page) => capturarGeneracionIa(page, peticiones), {
    antesDeCargar: async (ctx) => { peticiones.length = 0; await prepararIa(ctx, peticiones); }
  });
});

test('IA simulada: tareas del copiloto y pains', async ({ browser }) => {
  const peticiones = [];
  await compararEnAmbas(browser, 'ia-tareas', (page) => capturarTareasIa(page, peticiones), {
    antesDeCargar: async (ctx) => { peticiones.length = 0; await prepararIa(ctx, peticiones); }
  });
});

test('ingesta de archivos: Word, PDF, PowerPoint y transcripción', async ({ browser }) => {
  const archivos = await archivosDeIngesta();
  await compararEnAmbas(browser, 'ingesta-archivos', async (page) => {
    const a = {};
    await page.setInputFiles('#docFileInput', archivos);
    await page.waitForFunction(() => window.ProcessIQ.sources().length >= 4, null, { timeout: 60_000 });
    await page.waitForTimeout(500);
    a['fuentes.json'] = JSON.stringify(await page.evaluate(() =>
      window.ProcessIQ.sources().map((s) => ({ id: s.id, tipo: s.tipo, nombre: s.nombre, chars: s.chars, texto: s.texto }))), null, 2);
    a['aviso.txt'] = await page.evaluate(() => document.querySelector('#docFileName')?.textContent ?? '');
    // Generación en modo básico a partir de las 4 fuentes combinadas
    await page.evaluate(() => { window.ProcessIQ.runIngest(); });
    await page.waitForFunction(() => document.querySelector('#modalCancel')?.textContent === 'Modo básico', null, { timeout: 10_000 });
    await page.evaluate(() => document.querySelector('#modalCancel').click());
    await page.waitForTimeout(1500);
    const e = await estadoDiagrama(page);
    a['resumen.json'] = e.resumen;
    a['diagrama.svg'] = e.svg;
    return a;
  });
});

for (const demo of ['loadComplex4', 'loadFichaVentaLotes']) {
  test(`paneles y vistas: ${demo}`, async ({ browser }) => {
    await compararEnAmbas(browser, `paneles-${demo}`, (page) => capturarPaneles(page, demo));
  });
}
