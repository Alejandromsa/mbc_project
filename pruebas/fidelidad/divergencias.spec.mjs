// Diferencias intencionales con el MVP 3.8.9 (docs/fase1-divergencias.md).
// Cada prueba documenta el comportamiento del MVP y verifica el nuevo.
import { test, expect } from '@playwright/test';
import { VIEWPORT, abrirApp, clicExport, descargar, laminasPptx } from './src/escenarios.mjs';
import { PUERTO_NUEVA, PUERTO_REFERENCIA } from './src/puertos.mjs';
import { archivosDeIngesta } from './src/archivos.mjs';

async function abrir(browser, puerto) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await abrirApp(page, `http://127.0.0.1:${puerto}/`);
  return { ctx, page, errores };
}

async function conToBe(page) {
  await page.evaluate(() => window.ProcessIQ.loadComplex4());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#btnCloneToBe').click());
  await page.waitForTimeout(400);
}

test('D5: la app nueva no depende de CDNs ni de analítica de terceros', async ({ browser }) => {
  const nueva = await abrir(browser, PUERTO_NUEVA);
  const externas = new Set();
  nueva.page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    // Permitidos: la propia app y Google Fonts (pendiente M1: servir Montserrat desde la app)
    if (!['127.0.0.1', 'localhost', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(host)) externas.add(host);
  });
  await nueva.page.reload();
  await nueva.page.waitForFunction(() => !!window.ProcessIQ);
  await nueva.page.evaluate(() => window.ProcessIQ.loadComplex());
  await descargar(nueva.page, () => clicExport(nueva.page, 'pptx', 'mbc'));          // pptxgenjs + JSZip
  await nueva.page.setInputFiles('#docFileInput', await archivosDeIngesta());       // mammoth + pdf.js
  await nueva.page.waitForFunction(() => window.ProcessIQ.sources().length >= 4, null, { timeout: 60_000 });
  expect([...externas]).toEqual([]);
  expect(nueva.errores).toEqual([]);
  await nueva.ctx.close();
});

test('F1: el PPTX con To-Be se genera (en el MVP fallaba con M_PRUNO)', async ({ browser }) => {
  // MVP: falla y no descarga nada
  const ref = await abrir(browser, PUERTO_REFERENCIA);
  await conToBe(ref.page);
  await clicExport(ref.page, 'pptx', 'mbc');
  await ref.page.waitForTimeout(2500);
  expect(ref.errores.join('\n')).toContain('M_PRUNO is not defined');
  await ref.ctx.close();

  // App nueva: descarga, sin errores, con la lámina comparativa As-Is / To-Be
  const nueva = await abrir(browser, PUERTO_NUEVA);
  await conToBe(nueva.page);
  const pptx = await descargar(nueva.page, () => clicExport(nueva.page, 'pptx', 'mbc'));
  expect(nueva.errores).toEqual([]);
  const laminas = Object.values(await laminasPptx(pptx.datos));
  const comparativa = laminas.find((xml) => xml.includes('>AS-IS<') && xml.includes('>TO-BE<'));
  expect(comparativa, 'lámina As-Is vs To-Be').toBeTruthy();
  await nueva.ctx.close();
});
