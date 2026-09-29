// Diferencias intencionales con el MVP 3.8.9 (docs/fase1-divergencias.md).
// Cada prueba documenta el comportamiento del MVP y verifica el nuevo.
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
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

// D6: mammoth 1.13.0 en lugar de 1.8.0. Documentos Word con rasgos que 1.8.0
// leía mal. Se generan al vuelo, como los de archivos.mjs.
async function docxD6(cuerpo) {
  const z = new JSZip();
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  z.file('[Content_Types].xml', cab +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>');
  z.file('_rels/.rels', cab +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>');
  z.file('word/document.xml', cab +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>' + cuerpo + '</w:body></w:document>');
  return z.generateAsync({ type: 'nodebuffer' });
}

const p = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const REV = 'w:author="Revisor" w:date="2026-09-25T12:00:00Z"';
const WORD_REVISADO = [
  p('Registro la solicitud en el portal.'),
  // Control de contenido (w:customXml): 1.8.0 lo ignoraba entero
  `<w:customXml w:element="paso"><w:p><w:r><w:t>Valido los datos del cliente en el CRM.</w:t></w:r></w:p></w:customXml>`,
  // Párrafo movido con control de cambios: 1.8.0 perdía el texto en los dos extremos
  `<w:p><w:moveFrom w:id="1" ${REV}><w:r><w:t>Notifico el resultado al cliente.</w:t></w:r></w:moveFrom></w:p>`,
  p('Archivo el expediente.'),
  `<w:p><w:moveTo w:id="2" ${REV}><w:r><w:t>Notifico el resultado al cliente.</w:t></w:r></w:moveTo></w:p>`,
  // Fila de tabla eliminada con control de cambios: 1.8.0 la seguía leyendo
  `<w:tbl><w:tr><w:tc>${p('Paso vigente')}</w:tc></w:tr>` +
  `<w:tr><w:trPr><w:del w:id="3" ${REV}/></w:trPr><w:tc>${p('Paso eliminado')}</w:tc></w:tr></w:tbl>`,
  // Casilla marcada (w14:checkbox): 1.8.0 leía el símbolo; 1.13.0 la convierte en casilla y no deja texto
  `<w:p><w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="1"/></w14:checkbox></w:sdtPr>` +
  `<w:sdtContent><w:r><w:t>☒</w:t></w:r></w:sdtContent></w:sdt><w:r><w:t xml:space="preserve"> Aprobado por el jefe</w:t></w:r></w:p>`
].join('');
// mc:AlternateContent sin mc:Fallback: 1.8.0 fallaba y no leía nada del documento
const WORD_ALTERNATE = p('Inicio del procedimiento.') +
  '<w:p><w:r><mc:AlternateContent><mc:Choice Requires="w14"><w:t>Solo para Word 2010</w:t></mc:Choice></mc:AlternateContent></w:r></w:p>' +
  p('Fin del procedimiento.');

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function leerWord(page, archivos) {
  const avisos = [];
  page.on('dialog', (d) => { avisos.push(d.message()); d.dismiss().catch(() => {}); });
  await page.setInputFiles('#docFileInput', archivos);
  // Termina cuando cada archivo quedó como fuente o como fallo avisado
  await page.waitForFunction((n) => window.ProcessIQ.sources().length >= n, 1, { timeout: 60_000 });
  await expect.poll(async () => (await page.evaluate(() => window.ProcessIQ.sources().length)) + avisos.length,
    { timeout: 60_000 }).toBeGreaterThanOrEqual(archivos.length);
  const fuentes = await page.evaluate(() => window.ProcessIQ.sources().map((s) => ({ nombre: s.nombre, texto: s.texto })));
  return { fuentes, avisos };
}

test('D6: mammoth 1.13.0 lee los Word revisados que mammoth 1.8.0 leía mal', async ({ browser }) => {
  const archivos = [
    { name: 'procedimiento-revisado.docx', mimeType: DOCX, buffer: await docxD6(WORD_REVISADO) },
    { name: 'procedimiento-alternate.docx', mimeType: DOCX, buffer: await docxD6(WORD_ALTERNATE) }
  ];
  const texto = (r, nombre) => (r.fuentes.find((f) => f.nombre === nombre) || {}).texto;

  // MVP (mammoth 1.8.0)
  const ref = await abrir(browser, PUERTO_REFERENCIA);
  const r = await leerWord(ref.page, archivos);
  const revisadoRef = texto(r, 'procedimiento-revisado.docx');
  expect(revisadoRef).not.toContain('Valido los datos del cliente');          // customXml ignorado
  expect(revisadoRef).not.toContain('Notifico el resultado');                 // párrafo movido perdido
  expect(revisadoRef).toContain('Paso eliminado');                            // fila eliminada leída
  expect(revisadoRef).toContain('☒ Aprobado por el jefe');                    // símbolo de la casilla
  expect(texto(r, 'procedimiento-alternate.docx')).toBeUndefined();           // el documento falla entero
  expect(r.avisos.join('\n')).toContain('procedimiento-alternate.docx');
  await ref.ctx.close();

  // App nueva (mammoth 1.13.0)
  const nueva = await abrir(browser, PUERTO_NUEVA);
  const n = await leerWord(nueva.page, archivos);
  const revisado = texto(n, 'procedimiento-revisado.docx');
  expect(revisado).toContain('Valido los datos del cliente en el CRM.');
  expect(revisado.split('Notifico el resultado al cliente.').length - 1).toBe(1);   // una vez, en su nuevo sitio
  expect(revisado.indexOf('Archivo el expediente.')).toBeLessThan(revisado.indexOf('Notifico el resultado'));
  expect(revisado).toContain('Paso vigente');
  expect(revisado).not.toContain('Paso eliminado');
  expect(revisado).toContain('Aprobado por el jefe');
  expect(revisado).not.toContain('☒');                                        // se pierde el estado de la casilla
  const alternate = texto(n, 'procedimiento-alternate.docx');
  expect(alternate).toContain('Inicio del procedimiento.');
  expect(alternate).toContain('Fin del procedimiento.');
  expect(n.avisos).toEqual([]);
  expect(nueva.errores).toEqual([]);
  await nueva.ctx.close();
});
