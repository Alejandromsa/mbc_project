// Diferencias intencionales con el MVP 3.8.9 (docs/fase1-divergencias.md).
// Cada prueba documenta el comportamiento del MVP y verifica el nuevo.
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { CLAVES_JSON_MVP, VIEWPORT, abrirApp, clicExport, descargar, laminasPptx } from './src/escenarios.mjs';
import { PUERTO_NUEVA, PUERTO_REFERENCIA } from './src/puertos.mjs';
import { archivosDeIngesta } from './src/archivos.mjs';
import { TEXTOS_DIVERGENTES } from './src/textos-divergentes.mjs';
import { prepararIa, respuestaPara } from './src/interacciones.mjs';
import { CONFIG_IA, SPEC_IA, TEXTOS, URL_IA } from './src/interacciones.mjs';

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
  let fuentesPropias = 0;
  nueva.page.on('request', (r) => {
    const url = new URL(r.url());
    if (!/^https?:$/.test(url.protocol)) return;
    // Solo la propia app: desde el PR #16 también Montserrat (/fonts/), antes de Google Fonts
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externas.add(url.hostname);
    else if (url.pathname.startsWith('/fonts/')) fuentesPropias++;
  });
  await nueva.page.reload();
  await nueva.page.waitForFunction(() => !!window.ProcessIQ);
  await nueva.page.evaluate(() => window.ProcessIQ.loadComplex());
  await descargar(nueva.page, () => clicExport(nueva.page, 'pptx', 'mbc'));          // pptxgenjs + JSZip
  await nueva.page.setInputFiles('#docFileInput', await archivosDeIngesta());       // mammoth + pdf.js
  await nueva.page.waitForFunction(() => window.ProcessIQ.sources().length >= 4, null, { timeout: 60_000 });
  expect([...externas]).toEqual([]);
  expect(fuentesPropias, 'Montserrat llega de /fonts/ de la propia app').toBeGreaterThan(0);
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
  // Casillas (w14:checkbox), marcada y sin marcar: 1.8.0 leía el símbolo; 1.13.0 las convierte en
  // casillas sin texto, y la app nueva quita antes esa marca para leer el símbolo (ingesta/flujo.js)
  `<w:p><w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="1"/></w14:checkbox></w:sdtPr>` +
  `<w:sdtContent><w:r><w:t>☒</w:t></w:r></w:sdtContent></w:sdt><w:r><w:t xml:space="preserve"> Aprobado por el jefe</w:t></w:r></w:p>`,
  `<w:p><w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="0"/></w14:checkbox></w:sdtPr>` +
  `<w:sdtContent><w:r><w:t>☐</w:t></w:r></w:sdtContent></w:sdt><w:r><w:t xml:space="preserve"> Firmado por el cliente</w:t></w:r></w:p>`
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
  expect(revisadoRef).toContain('☐ Firmado por el cliente');
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
  expect(revisado).toContain('☒ Aprobado por el jefe');                       // el estado de las casillas se conserva
  expect(revisado).toContain('☐ Firmado por el cliente');
  const alternate = texto(n, 'procedimiento-alternate.docx');
  expect(alternate).toContain('Inicio del procedimiento.');
  expect(alternate).toContain('Fin del procedimiento.');
  expect(n.avisos).toEqual([]);
  expect(nueva.errores).toEqual([]);
  await nueva.ctx.close();
});

// D7: «Exportar → JSON» completo. Las cachés de pintado (_d, _band…) se
// regeneran al dibujar: se comparan los contenidos sin ellas.
const CACHES = ['_d', '_dSerie', '_band', '_inferredOwner', '_sello'];
const sinCaches = (v) => JSON.parse(JSON.stringify(v, (k, x) => (CACHES.includes(k) ? undefined : x)));
const exportarJson = async (page) => (await descargar(page, () => clicExport(page, 'json'))).datos.toString('utf8');
const importarJson = (page, texto, nombre = 'proyecto.json') =>
  page.setInputFiles('#fileImport', { name: nombre, mimeType: 'application/json', buffer: Buffer.from(texto) });

test('D7: «Exportar → JSON» lleva las dos vistas y los análisis, y se importa entero', async ({ browser }) => {
  // MVP: solo meta, ficha, la vista activa (nodes, edges) y la fecha
  const ref = await abrir(browser, PUERTO_REFERENCIA);
  await conToBe(ref.page);
  expect(Object.keys(JSON.parse(await exportarJson(ref.page)))).toEqual(CLAVES_JSON_MVP);
  await ref.ctx.close();

  // App nueva: To-Be clonado y análisis capturados, tal como los guarda el editor
  const nueva = await abrir(browser, PUERTO_NUEVA);
  await conToBe(nueva.page);
  await nueva.page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('processiq.v1'));
    Object.assign(d, {
      kpiValues: { 'seg-03': { name: 'Lead time de siniestro', unit: 'días', benchmark: '< 7 días', value: '12', gap: '+5', source: 'Muestreo de 30 casos' } },
      raci: { [d.nodes[1].id]: { Operaciones: 'R/A', Riesgos: 'C' } },
      sipoc: { suppliers: 'Cliente', inputs: 'Solicitud', process: 'Atender la solicitud', outputs: 'Respuesta', customers: 'Cliente' },
      simResults: { fteCurrent: 2.5, fteToBe: 1.5, monthlyCost: 1000, monthlySavings: 400, annualSavings: 4800, leadTimeChain: 120, activitiesWithData: 3 }
    });
    localStorage.setItem('processiq.v1', JSON.stringify(d));
  });
  await nueva.page.reload();
  await nueva.page.waitForFunction(() => !!window.ProcessIQ);
  const texto = await exportarJson(nueva.page);
  const json = JSON.parse(texto);
  expect(Object.keys(json)).toEqual(['meta', 'ficha', 'nodes', 'edges', 'activeView', 'views', 'raci', 'sipoc', 'simResults', 'kpiValues', 'lanes', 'exportedAt']);
  expect(json.activeView).toBe('tobe');
  expect(json.views.tobe).toEqual({ nodes: json.nodes, edges: json.edges });
  expect(json.views.asis.nodes.length).toBeGreaterThan(5);
  expect(json.kpiValues['seg-03'].value).toBe('12');
  expect(json.raci[json.nodes[1].id]).toEqual({ Operaciones: 'R/A', Riesgos: 'C' });
  expect(json.sipoc.process).toBe('Atender la solicitud');
  expect(json.simResults.annualSavings).toBe(4800);
  expect(Array.isArray(json.lanes && json.lanes.list)).toBe(true);
  expect(nueva.errores).toEqual([]);
  await nueva.ctx.close();

  // Otro navegador: se importa en el editor libre, sobre otro proceso, y vuelve todo
  const otra = await abrir(browser, PUERTO_NUEVA);
  await otra.page.evaluate(() => window.ProcessIQ.loadDemo());
  await importarJson(otra.page, texto);
  await expect(otra.page.locator('#tobeIndicator')).toBeVisible();
  const guardado = await otra.page.evaluate(() => JSON.parse(localStorage.getItem('processiq.v1')));
  for (const k of ['activeView', 'raci', 'sipoc', 'simResults', 'kpiValues', 'lanes']) expect(guardado[k], k).toEqual(json[k]);
  expect(sinCaches(guardado.views)).toEqual(sinCaches(json.views));
  expect(await otra.page.evaluate(() => window.ProcessIQ.snapshot())).toMatchObject({ name: json.meta.name, nodes: json.nodes.length });
  await otra.page.evaluate(() => document.querySelector('#btnViewAsIs').click());
  expect(await otra.page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(json.views.asis.nodes.length);
  expect(otra.errores).toEqual([]);
  await otra.ctx.close();

  // El MVP también abre el JSON completo: ignora lo nuevo y lo trata como uno suyo
  const mvp = await abrir(browser, PUERTO_REFERENCIA);
  await mvp.page.evaluate(() => window.ProcessIQ.loadDemo());
  await importarJson(mvp.page, texto);
  await expect.poll(() => mvp.page.evaluate(() => window.ProcessIQ.snapshot().name)).toBe(json.meta.name);
  expect(await mvp.page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(json.nodes.length);
  expect(mvp.errores).toEqual([]);
  await mvp.ctx.close();
});

test('D8: el panel «Validaciones» ya no dice que lo crítico bloquea el export (nunca lo bloqueó)', async ({ browser }) => {
  // Un proceso sin evento de fin: da hallazgos críticos
  const SIN_FIN = JSON.stringify({
    meta: { name: 'Proceso sin fin' }, ficha: {},
    nodes: [
      { id: 'n1', type: 'start', x: 100, y: 100, w: 54, h: 54, label: 'Inicio' },
      { id: 'n2', type: 'task', x: 250, y: 90, w: 158, h: 76, label: 'Registrar solicitud' }
    ],
    edges: [{ id: 'e3', from: 'n1', to: 'n2', label: '' }]
  });
  const casos = [[PUERTO_REFERENCIA, 'crítico bloquea export'], [PUERTO_NUEVA, 'crítico (conviene resolverlo antes de exportar)']];
  for (const [puerto, texto] of casos) {
    const app = await abrir(browser, puerto);
    const aviso = await app.page.evaluate(() => document.querySelector('[data-panel="validations"] .panel-hint').textContent);
    expect(aviso).toContain(texto);
    await app.page.evaluate(() => window.ProcessIQ.loadDemo());
    await importarJson(app.page, SIN_FIN, 'sin-fin.json');
    await expect(app.page.locator('#lintList .lint-item.sev-critical').first()).toBeAttached();
    // Con hallazgos críticos, los exports se descargan igual
    for (const tipo of ['json', 'bpmn']) {
      expect((await descargar(app.page, () => clicExport(app.page, tipo))).datos.length, tipo).toBeGreaterThan(0);
    }
    expect(app.errores).toEqual([]);
    await app.ctx.close();
  }
});

test('D9: la interfaz del editor lleva sus tildes, y la lista de textos de la fidelidad está al día', async ({ browser }) => {
  // Lo que sirve cada app al abrir el editor: su HTML y sus scripts
  async function servido(puerto) {
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    const respuestas = [];
    page.on('response', (r) => {
      if (new URL(r.url()).hostname === '127.0.0.1' && ['document', 'script'].includes(r.request().resourceType())) respuestas.push(r);
    });
    await abrirApp(page, `http://127.0.0.1:${puerto}/`);
    const textos = await Promise.all(respuestas.map((r) => r.text()));
    await ctx.close();
    return textos.join('\n');
  }
  const mvp = await servido(PUERTO_REFERENCIA);
  const nueva = await servido(PUERTO_NUEVA);
  for (const t of TEXTOS_DIVERGENTES) {
    expect(mvp, `${t.d}: el MVP dice «${t.mvp}»`).toContain(t.mvp);
    // `enMvp`: sitios donde el MVP ya usa el texto nuevo; se descuentan (y tienen que seguir ahí)
    let mvpSinOtros = mvp;
    for (const otro of t.enMvp ?? []) {
      expect(mvp, `${t.d}: el MVP dice «${otro}»`).toContain(otro);
      mvpSinOtros = mvpSinOtros.split(otro).join('');
    }
    expect(mvpSinOtros, `${t.d}: el MVP no dice «${t.nueva}»`).not.toContain(t.nueva);
    expect(nueva, `${t.d}: la app nueva dice «${t.nueva}»`).toContain(t.nueva);
    expect(nueva, `${t.d}: la app nueva no dice «${t.mvp}»`).not.toContain(t.mvp);
  }

  // Y en pantalla: el modal de ingesta y el aviso de «Análisis profundo de dolores» sin IA
  const visto = {};
  for (const [nombre, puerto] of [['mvp', PUERTO_REFERENCIA], ['nueva', PUERTO_NUEVA]]) {
    const app = await abrir(browser, puerto);
    const avisos = [];
    app.page.on('dialog', (d) => { avisos.push(d.message()); d.dismiss().catch(() => {}); });
    await app.page.evaluate(() => window.ProcessIQ.loadDemo());
    await app.page.evaluate(() => document.querySelector('.copilot-action[data-action="ai-pains"]').click());
    await expect.poll(() => avisos.length).toBe(1);
    visto[nombre] = await app.page.evaluate(() => ({
      boton: document.querySelector('.copilot-action[data-action="ai-pains"]').textContent.trim(),
      anadir: document.querySelector('#btnAddSource').textContent + ' | ' + document.querySelector('#btnAddSource').title,
      pista: document.querySelector('.src-hint').textContent
    }));
    visto[nombre].aviso = avisos[0];
    expect(app.errores).toEqual([]);
    await app.ctx.close();
  }
  expect(visto.mvp).toEqual({
    boton: 'Analisis profundo de dolores (IA)',
    anadir: '+ Anadir otra fuente | Anadir otro documento, transcripcion o diagrama',
    pista: 'Se combinaran en un solo AS-IS. Ante contradicciones prevalece la fuente mas reciente (p. ej. la transcripcion del levantamiento sobre un diagrama antiguo).',
    aviso: 'El analisis profundo de dolores usa la IA (Claude). Aun no configuraste tu API key. Abrir Ajustes de IA?'
  });
  expect(visto.nueva).toEqual({
    boton: 'Análisis profundo de dolores (IA)',
    anadir: '+ Añadir otra fuente | Añadir otro documento, transcripción o diagrama',
    pista: 'Se combinarán en un solo AS-IS. Ante contradicciones prevalece la fuente más reciente (p. ej. la transcripción del levantamiento sobre un diagrama antiguo).',
    aviso: 'El análisis profundo de dolores usa la IA (Claude). Aún no configuraste tu API key. ¿Abrir Ajustes de IA?'
  });
});

// D10: BPMN de otras herramientas (fixtures inventados de packages/bpmn). El BPMN
// exportado por el propio ProcessIQ se sigue leyendo como en el MVP: lo compara
// byte a byte el escenario «importación BPMN de los 14 ejemplos».
const fixtureBpmn = (nombre) => readFile(new URL(`../../packages/bpmn/src/__fixtures__/${nombre}`, import.meta.url), 'utf8');
const importarBpmn = (page, xml) => page.evaluate((x) => {
  try { return window.ProcessIQ.importBpmnXml(x); } catch (e) { return { error: String(e.message) }; }
}, xml);
const guardado = (page) => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('processiq.v1'));
  return { nodos: d.nodes, carriles: d.lanes ? d.lanes.list : [] };
});

test('D10: un BPMN de otra herramienta conserva carriles y subprocesos; un XML que no es BPMN no borra el proceso abierto', async ({ browser }) => {
  const xml = await fixtureBpmn('bizagi-reclamos.bpmn');

  // MVP: plano y sin carriles; el inicio, el fin y la convergencia del subproceso quedan sueltos
  const ref = await abrir(browser, PUERTO_REFERENCIA);
  expect(await importarBpmn(ref.page, xml)).toEqual({ count: 19, tasks: 9, gateways: 3, events: 7, flows: 18 });
  const mvp = await guardado(ref.page);
  expect(mvp.carriles).toEqual(['Por asignar']);
  expect(mvp.nodos.filter((n) => n.label === 'Caso no procede')).toHaveLength(1);
  // Un XML que no es BPMN: devuelve 0 y el proceso abierto ya se borró
  await ref.page.evaluate(() => window.ProcessIQ.loadDemo());
  expect(await importarBpmn(ref.page, '<raiz/>')).toEqual({ count: 0 });
  expect(await ref.page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(0);
  expect(ref.errores).toEqual([]);
  await ref.ctx.close();

  // App nueva: carriles, subproceso con su contenido plegable y avisos
  const nueva = await abrir(browser, PUERTO_NUEVA);
  const r = await importarBpmn(nueva.page, xml);
  expect(r).toMatchObject({ count: 15, tasks: 9, gateways: 2, events: 4, flows: 16, subprocesos: 1 });
  expect(r.carriles).toEqual(['Cliente', 'Mesa de ayuda', 'Analista de reclamos', 'Supervisor']);
  expect(r.avisos).toHaveLength(3);
  const nuevo = await guardado(nueva.page);
  expect([...nuevo.carriles].sort()).toEqual([...r.carriles].sort());
  expect(nuevo.nodos.some((n) => n.label === 'Caso no procede')).toBe(false);
  const sub = nuevo.nodos.find((n) => n.label === 'Evaluar reclamo');
  expect(sub).toMatchObject({ marker: 'subprocess', owner: 'Analista de reclamos', boundary: { type: 'timer', interrupting: false } });
  expect(nuevo.nodos.filter((n) => n.padre === sub.id).map((n) => n.label))
    .toEqual(['Revisar antecedentes', 'Consultar historial del cliente', '¿Procede?', 'Calcular compensación', 'Redactar rechazo']);
  // Niveles: el contenido se pliega en Actividad y vuelve en Detalle, sin llamar a nadie
  await nueva.page.evaluate(() => window.ProcessIQ.nivel(2));
  expect(await nueva.page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(10);
  await nueva.page.evaluate(() => window.ProcessIQ.nivel(3));
  expect(await nueva.page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(15);
  // Un XML que no es BPMN: mensaje claro y el proceso abierto sigue ahí
  expect(await importarBpmn(nueva.page, '<raiz/>')).toEqual({
    error: 'El archivo es XML, pero no es un diagrama BPMN 2.0: su elemento principal es <raiz> y debería ser <definitions>.'
  });
  expect(await nueva.page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(15);
  expect(nueva.errores).toEqual([]);
  await nueva.ctx.close();
});

// D12: con IA, «Generar matriz RACI» y «Generar SIPOC» traen la matriz editable (JSON validado,
// con una reparación) en lugar del informe en Markdown del MVP. La IA se simula como en la
// fidelidad (prepararIa); este `responder` contesta además las peticiones de matriz.
const SISTEMA_MATRICES = 'Devuelves EXCLUSIVAMENTE un objeto JSON válido, con la forma exacta que pide la tarea';
const SISTEMA_REPARACION = 'Eres un validador de JSON.';
const SEPARADOR = '=== PROCESO A ANALIZAR ===';
const ROL_EXTRA = 'Comité de riesgos';
const SIPOC_IA = {
  suppliers: 'Asegurado, Taller afiliado', inputs: 'Denuncia del siniestro, Póliza vigente',
  process: 'Registrar, Peritar, Liquidar, Pagar', outputs: 'Indemnización pagada', customers: 'Asegurado, Área de reaseguros'
};

/** Actividades (task, system, decision) del resumen que recibe la IA, con su rol. */
function actividadesDelResumen(contenido) {
  const r = [];
  for (const linea of contenido.split('\n')) {
    const id = /^id=(\S+) - tipo=(task|system|decision)\b/.exec(linea);
    const rol = / - rol=(.+?)(?= - |$)/.exec(linea);
    if (id && rol) r.push({ id: id[1], rol: rol[1] });
  }
  return r;
}
/** La RACI «de la IA»: R/A al rol de cada actividad; el comité, I en la primera y «a» (minúscula) en la segunda; y una fila inventada. */
function raciSimulada(contenido) {
  const m = {};
  actividadesDelResumen(contenido).forEach((a, i) => {
    m[a.id] = { [a.rol]: i === 1 ? 'R' : 'R/A' };
    if (i === 0) m[a.id][ROL_EXTRA] = 'I';
    if (i === 1) m[a.id][ROL_EXTRA] = 'a';
  });
  m.x99 = { Inventado: 'R' };
  return m;
}
function responderMatrices(cuerpo) {
  if (!String(cuerpo.system ?? '').includes(SISTEMA_MATRICES)) return respuestaPara(cuerpo);
  const contenido = String(cuerpo.messages[0].content);
  return JSON.stringify(contenido.startsWith('Construye el SIPOC') ? SIPOC_IA : raciSimulada(contenido));
}

async function abrirConIa(browser, puerto, responder) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true, reducedMotion: 'reduce' });
  const peticiones = [];
  await prepararIa(ctx, peticiones, responder);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await abrirApp(page, `http://127.0.0.1:${puerto}/`);
  await page.evaluate(() => window.ProcessIQ.loadComplex());
  return { ctx, page, errores, peticiones, cuerpos: () => peticiones.map((p) => p.cuerpo) };
}
const pulsar = (page, accion) => page.evaluate((a) => document.querySelector(`.copilot-action[data-action="${a}"]`).click(), accion);
const mensajesHtml = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#copilotMessages > .copilot-msg')).map((m) => m.outerHTML));
const guardadoV1 = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('processiq.v1')));
const modalAbierto = (page) => page.evaluate(() => !document.querySelector('#modal').hidden);
/** Lo que el MVP pide y responde con el informe en texto de una tarea (su petición y sus dos últimos mensajes). */
async function informeDelMvp(browser, tarea) {
  const mvp = await abrirConIa(browser, PUERTO_REFERENCIA, responderMatrices);
  await pulsar(mvp.page, tarea);
  await expect.poll(() => mvp.page.evaluate(() => document.querySelector('#copilotMessages').textContent)).toContain('Respuesta simulada');
  const r = { cuerpos: mvp.cuerpos(), mensajes: (await mensajesHtml(mvp.page)).slice(-2), guardado: await guardadoV1(mvp.page), modal: await modalAbierto(mvp.page) };
  expect(mvp.errores).toEqual([]);
  await mvp.ctx.close();
  return r;
}

test('D12: con IA, la RACI y el SIPOC se cargan en su matriz editable y van al PPTX (el MVP daba un informe en texto)', async ({ browser }) => {
  // MVP, con la misma IA simulada: una petición del informe en Markdown y ninguna matriz
  const mvp = { raci: await informeDelMvp(browser, 'raci'), sipoc: await informeDelMvp(browser, 'sipoc') };
  for (const r of Object.values(mvp)) {
    expect(r.cuerpos).toHaveLength(1);
    expect(r.cuerpos[0].system).toContain('Usas Markdown');
    expect(r.modal).toBe(false);
    expect(r.guardado.raci ?? null).toBeNull();
    expect(r.guardado.sipoc ?? null).toBeNull();
  }

  const nueva = await abrirConIa(browser, PUERTO_NUEVA, responderMatrices);
  // RACI: una petición de matriz, con el mismo proceso y los mismos parámetros que el informe del MVP
  await pulsar(nueva.page, 'raci');
  await expect.poll(() => modalAbierto(nueva.page)).toBe(true);
  expect(nueva.cuerpos()).toHaveLength(1);
  const pedido = nueva.cuerpos()[0];
  expect(pedido.system).toContain(SISTEMA_MATRICES);
  expect(pedido.messages[0].content.startsWith('Construye la matriz RACI del proceso.')).toBe(true);
  expect(pedido.messages[0].content.split(SEPARADOR)[1]).toBe(mvp.raci.cuerpos[0].messages[0].content.split(SEPARADOR)[1]);
  const sinTexto = ({ system: _s, messages: _m, ...resto }) => resto;
  expect(sinTexto(pedido)).toEqual(sinTexto(mvp.raci.cuerpos[0]));   // modelo, max_tokens, esfuerzo, respaldo, stream

  // La matriz guardada: una fila por actividad del resumen (la inventada no), las letras de la IA
  // normalizadas («a» -> «A») y vacías las demás celdas; los roles, los de la IA
  const actividades = actividadesDelResumen(pedido.messages[0].content);
  const deIa = raciSimulada(pedido.messages[0].content);
  const raci = (await guardadoV1(nueva.page)).raci;
  expect(Object.keys(raci).sort()).toEqual(actividades.map((a) => a.id).sort());
  const roles = [...new Set([...actividades.map((a) => a.rol), ROL_EXTRA])];
  for (const a of actividades) {
    expect(Object.keys(raci[a.id]).sort(), a.id).toEqual([...roles].sort());
    for (const rol of roles) expect(raci[a.id][rol], `${a.id} / ${rol}`).toBe((deIa[a.id][rol] || '').toUpperCase());
  }
  expect(raci[actividades[1].id][ROL_EXTRA]).toBe('A');
  // El diálogo editable muestra exactamente esa matriz
  const celdas = await nueva.page.evaluate(() => Array.from(document.querySelectorAll('.raci-pick')).map((s) => [s.dataset.tid, s.dataset.role, s.value]));
  expect(celdas).toHaveLength(actividades.length * roles.length);
  for (const [tid, rol, valor] of celdas) expect(valor, `${tid} / ${rol}`).toBe(raci[tid][rol]);
  expect(await nueva.page.locator('#modalOk').textContent()).toBe('Guardar cambios');
  // Se edita como la de siempre
  await nueva.page.evaluate((id) => {
    const sel = document.querySelector(`.raci-pick[data-tid="${id}"][data-role="Comité de riesgos"]`);
    sel.value = 'C';
    document.querySelector('#modalOk').click();
  }, actividades[0].id);
  await expect.poll(async () => (await guardadoV1(nueva.page)).raci[actividades[0].id][ROL_EXTRA]).toBe('C');
  const textoChat = await nueva.page.evaluate(() => document.querySelector('#copilotMessages').textContent);
  expect(textoChat).toContain(`Matriz RACI propuesta por la IA con ${actividades.length} actividades × ${roles.length} roles.`);
  expect(textoChat).toContain(`Matriz RACI guardada con ${actividades.length} actividades × ${roles.length} roles.`);

  // SIPOC: la matriz de la IA, tal cual, en el diálogo y en el proceso
  await pulsar(nueva.page, 'sipoc');
  await expect.poll(() => modalAbierto(nueva.page)).toBe(true);
  expect(nueva.cuerpos()).toHaveLength(2);
  expect(nueva.cuerpos()[1].messages[0].content.split(SEPARADOR)[1]).toBe(mvp.sipoc.cuerpos[0].messages[0].content.split(SEPARADOR)[1]);
  expect((await guardadoV1(nueva.page)).sipoc).toEqual(SIPOC_IA);
  const columnas = await nueva.page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-sipoc]')).map((t) => [t.dataset.sipoc, t.value])));
  expect(columnas).toEqual(SIPOC_IA);
  await nueva.page.evaluate(() => document.querySelector('#modalCancel').click());

  // El PPTX lleva las dos láminas con lo de la IA
  const laminas = Object.values(await laminasPptx((await descargar(nueva.page, () => clicExport(nueva.page, 'pptx', 'mbc'))).datos));
  const laminaRaci = laminas.find((xml) => xml.includes('>Matriz RACI<'));
  expect(laminaRaci, 'lámina RACI').toBeTruthy();
  expect(laminaRaci).toContain(`>${ROL_EXTRA}<`);
  expect(laminaRaci).toContain('>R/A<');
  const laminaSipoc = laminas.find((xml) => xml.includes('>SIPOC — alcance del proceso<'));
  expect(laminaSipoc, 'lámina SIPOC').toBeTruthy();
  for (const v of Object.values(SIPOC_IA)) expect(laminaSipoc).toContain(v);
  expect(nueva.errores).toEqual([]);
  await nueva.ctx.close();
});

test('D12: si la matriz no se puede reparar, cae al informe en texto del MVP (la misma petición y el mismo mensaje)', async ({ browser }) => {
  for (const tarea of ['raci', 'sipoc']) {
    // La IA de la fidelidad contesta Markdown a todo: ni la matriz ni su reparación son JSON
    const mvp = await informeDelMvp(browser, tarea);
    const nueva = await abrirConIa(browser, PUERTO_NUEVA, respuestaPara);
    await pulsar(nueva.page, tarea);
    await expect.poll(() => nueva.peticiones.length).toBe(3);
    await expect.poll(() => nueva.page.evaluate(() => document.querySelector('#copilotMessages').textContent)).toContain('Respuesta simulada');
    const [matriz, reparacion, informe] = nueva.cuerpos();
    expect(matriz.system).toContain(SISTEMA_MATRICES);
    expect(reparacion.system.startsWith(SISTEMA_REPARACION)).toBe(true);
    expect(reparacion.messages[0].content.startsWith('Problema detectado: La IA no devolvió JSON.')).toBe(true);
    expect(JSON.stringify(informe), `${tarea}: la petición del informe es la del MVP`).toBe(JSON.stringify(mvp.cuerpos[0]));
    const mensajes = await mensajesHtml(nueva.page);
    expect(mensajes.slice(-2), `${tarea}: el informe se ve como en el MVP`).toEqual(mvp.mensajes);
    expect(mensajes.at(-3)).toContain('No se pudo armar la matriz editable (La IA devolvió una matriz que no se pudo interpretar ni reparar: La IA no devolvió JSON.). Pido el informe en texto.');
    expect(await modalAbierto(nueva.page)).toBe(false);
    const guardado = await guardadoV1(nueva.page);
    expect(guardado.raci ?? null).toBeNull();
    expect(guardado.sipoc ?? null).toBeNull();
    expect(nueva.errores).toEqual([]);
    await nueva.ctx.close();
  }
});

// D13: una compuerta de convergencia no es una decisión. Es lo que cambia en los
// artefactos «merge-gateways/*» del copiloto (artefactos-divergentes.mjs): aquí se
// comprueba que la única diferencia con el MVP son los fines inventados.
const MODELO = (s) => ({
  nodos: s.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label, owner: n.owner, gatewayType: n.gatewayType, merge: !!n._merge, codigo: n.activityCode })),
  aristas: s.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label }))
});

test('D13: «Insertar compuertas de convergencia» ya no deja fines «Caso no procede» colgando', async ({ browser }) => {
  for (const demo of ['loadComplex', 'loadComplex11', 'loadFichaVentaLotes']) {
    const res = {};
    for (const [nombre, puerto] of [['mvp', PUERTO_REFERENCIA], ['nueva', PUERTO_NUEVA]]) {
      const app = await abrir(browser, puerto);
      await app.page.evaluate((d) => window.ProcessIQ[d](), demo);
      await app.page.waitForTimeout(300);
      const antes = await app.page.evaluate(() => JSON.parse(localStorage.getItem('processiq.v1')).nodes.length);
      await app.page.evaluate(() => document.querySelector('.copilot-action[data-action="merge-gateways"]').click());
      await app.page.waitForTimeout(900);
      res[nombre] = await app.page.evaluate(() => ({
        estado: JSON.parse(localStorage.getItem('processiq.v1')),
        mensaje: [...document.querySelectorAll('#copilotMessages > .copilot-msg')].at(-1).outerHTML,
        svg: window.ProcessIQ.svg()
      }));
      res[nombre].antes = antes;
      expect(app.errores).toEqual([]);
      await app.ctx.close();
    }
    const { mvp, nueva } = res;
    const m = MODELO(mvp.estado), n = MODELO(nueva.estado);
    const merges = m.nodos.filter((x) => x.merge).map((x) => x.id);
    expect(merges.length, `${demo}: el copiloto inserta compuertas de cierre`).toBeGreaterThan(0);
    // MVP: de cada compuerta de cierre cuelga una rama «No» hacia un fin «Caso no procede»
    const ramasNo = m.aristas.filter((a) => merges.includes(a.from) && a.label === 'No');
    expect(ramasNo).toHaveLength(merges.length);
    const inventados = ramasNo.map((a) => a.to);
    expect(inventados.map((id) => m.nodos.find((x) => x.id === id).label)).toEqual(merges.map(() => 'Caso no procede'));
    // App nueva: el mismo modelo sin esos fines ni sus ramas, y la salida de la compuerta sin «Sí»
    expect(n.nodos).toEqual(m.nodos.filter((x) => !inventados.includes(x.id)));
    expect(n.aristas).toEqual(m.aristas.filter((a) => !inventados.includes(a.to))
      .map((a) => (merges.includes(a.from) ? { ...a, label: '' } : a)));
    expect(n.aristas.filter((a) => merges.includes(a.from)).map((a) => a.label)).toEqual(merges.map(() => ''));
    // El mensaje solo cambia en el recuento de nodos
    expect(nueva.antes).toBe(mvp.antes);
    expect(mvp.mensaje).toContain(`Nodos: ${mvp.antes} → ${mvp.antes + 2 * merges.length}.`);
    expect(nueva.mensaje).toBe(mvp.mensaje.replace(`→ ${mvp.antes + 2 * merges.length}.`, `→ ${mvp.antes + merges.length}.`));
    // En el dibujo: ningún «Caso no procede»
    const veces = (s) => s.split('>Caso no procede<').length - 1;
    expect(veces(mvp.svg)).toBe(merges.length);
    expect(veces(nueva.svg)).toBe(0);
  }
});

// D14: con la jerarquía explícita (la de la IA o la de los subprocesos de un BPMN
// importado), el nivel Ejecutivo también tiene el techo de 10 cajas.
const SPEC_LARGA = {
  meta: { name: 'Proceso largo', industry: 'Banca', macroprocess: 'O2C' },
  nodes: [
    { k: 's', type: 'start', label: 'Inicio', owner: 'Cliente', nivel: 1 },
    ...Array.from({ length: 12 }, (_, i) => ({ k: 't' + i, type: 'task', label: 'Paso ' + (i + 1), owner: i % 2 ? 'Operaciones' : 'Ventas', nivel: 1 })),
    { k: 't3a', type: 'task', label: 'Detalle A', owner: 'Ventas', nivel: 3, padre: 't3' },
    { k: 't3b', type: 'task', label: 'Detalle B', owner: 'Ventas', nivel: 3, padre: 't3' },
    { k: 'f', type: 'end', label: 'Fin', owner: 'Cliente', nivel: 1 }
  ],
  edges: [
    { from: 's', to: 't0' }, { from: 't0', to: 't1' }, { from: 't1', to: 't2' }, { from: 't2', to: 't3a' }, { from: 't3a', to: 't3b' },
    { from: 't3b', to: 't4' }, ...Array.from({ length: 7 }, (_, i) => ({ from: 't' + (i + 4), to: 't' + (i + 5) })), { from: 't11', to: 'f' }
  ]
};

test('D14: con jerarquía explícita, el nivel Ejecutivo no pasa de 10 cajas', async ({ browser }) => {
  const res = {};
  for (const [nombre, puerto] of [['mvp', PUERTO_REFERENCIA], ['nueva', PUERTO_NUEVA]]) {
    const app = await abrir(browser, puerto);
    res[nombre] = await app.page.evaluate((spec) => {
      window.ProcessIQ.buildProcessFromAiSpec(spec);
      const r = { detalle: window.ProcessIQ.snapshot().nodes };
      r.actividad = window.ProcessIQ.nivel(2).nodos;
      r.ejecutivo = window.ProcessIQ.nivel(1).nodos;
      const d = JSON.parse(localStorage.getItem('processiq.v1'));
      r.carriles = d.lanes.list;
      r.etapas = d.nodes.filter((x) => x.marker === 'subprocess').map((x) => x.label);
      r.vuelta = window.ProcessIQ.nivel(3).nodos;
      return r;
    }, SPEC_LARGA);
    expect(app.errores).toEqual([]);
    await app.ctx.close();
  }
  // MVP: el Ejecutivo es el nivel superior entero (14 pasos + inicio y fin)
  expect(res.mvp).toMatchObject({ detalle: 16, actividad: 14, ejecutivo: 14, carriles: ['O2C'], vuelta: 16 });
  // App nueva: igual en Detalle y Actividad; el Ejecutivo, en etapas y un solo carril
  expect(res.nueva).toMatchObject({ detalle: 16, actividad: 14, carriles: ['O2C'], vuelta: 16 });
  expect(res.nueva.ejecutivo).toBeLessThanOrEqual(10);
  expect(res.nueva.etapas.length).toBeGreaterThan(0);
  expect(res.nueva.etapas[0]).toBe('Paso 1 (+1 pasos)');
});

// D21: si la respuesta informa tokens de la caché de prompts, el coste de la generación los
// cobra a su precio; el MVP los sumaba a la entrada y los cobraba como entrada normal. El
// editor no pide la caché (la petición es la del MVP): solo cambia la cuenta.
function sseConCache(texto) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return ev('message_start', { message: { id: 'msg_prueba', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null,
    usage: { input_tokens: 200, cache_creation_input_tokens: 400, cache_read_input_tokens: 600, output_tokens: 1 } } }) +
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) +
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: texto } }) +
    ev('content_block_stop', { index: 0 }) +
    ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 900 } }) +
    ev('message_stop', {});
}

async function generarConCache(browser, puerto) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true, reducedMotion: 'reduce' });
  const cuerpos = [];
  await ctx.addInitScript((c) => localStorage.setItem('processiq.ai', JSON.stringify(c)), CONFIG_IA);
  await ctx.route(URL_IA + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    cuerpos.push(req.postDataJSON());
    await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: sseConCache(JSON.stringify(SPEC_IA)) });
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await abrirApp(page, `http://127.0.0.1:${puerto}/`);
  await page.evaluate((t) => { document.querySelector('#notesInput').value = t; }, TEXTOS.compras);
  await page.evaluate(() => { window.ProcessIQ.runIngest(); });
  await page.waitForFunction(() => document.querySelector('#modalOk')?.textContent === 'Generar', null, { timeout: 10_000 });
  await page.evaluate(() => document.querySelector('#modalOk').click());
  await page.waitForFunction(() => /interpretado con IA/.test(document.querySelector('#copilotMessages')?.textContent ?? ''), null, { timeout: 30_000 });
  const r = {
    cuerpos,
    costes: await page.evaluate(() => JSON.parse(localStorage.getItem('processiq.ia.costes'))),
    chat: await page.evaluate(() => document.querySelector('#copilotMessages').textContent)
  };
  expect(errores).toEqual([]);
  await ctx.close();
  return r;
}

test('D21: el coste de una generación cobra la caché de prompts a su precio (el MVP, como entrada normal)', async ({ browser }) => {
  const mvp = await generarConCache(browser, PUERTO_REFERENCIA);
  const nueva = await generarConCache(browser, PUERTO_NUEVA);
  // La misma petición, sin cache_control: el editor no pide la caché
  expect(nueva.cuerpos).toHaveLength(1);
  expect(nueva.cuerpos).toEqual(mvp.cuerpos);
  expect(JSON.stringify(nueva.cuerpos)).not.toContain('cache_control');
  // Los mismos tokens (la entrada incluye los 1000 de la caché) y el mismo registro, salvo el coste
  expect(mvp.costes).toHaveLength(1);
  const { usd: usdMvp, ...restoMvp } = mvp.costes[0];
  const { usd: usdNueva, ...restoNueva } = nueva.costes[0];
  expect(restoNueva).toEqual(restoMvp);
  expect(restoNueva).toMatchObject({ modelo: 'claude-opus-5', entrada: 1200, salida: 900 });
  // Opus 5: el MVP, 1200 × 5 + 900 × 25; la app nueva, 200 × 5 + 400 × 6,25 (escritura) + 600 × 0,5 (lectura) + 900 × 25
  expect(usdMvp).toBeCloseTo((1200 * 5 + 900 * 25) / 1e6, 12);
  expect(usdNueva).toBeCloseTo((200 * 5 + 400 * 6.25 + 600 * 0.5 + 900 * 25) / 1e6, 12);
  expect(mvp.chat).toContain('Coste de esta ejecución: US$ 0.029 (1,200 tokens de entrada');
  expect(nueva.chat).toContain('Coste de esta ejecución: US$ 0.026 (1,200 tokens de entrada');
});
