// Diferencias intencionales con el MVP 3.8.9 (docs/fase1-divergencias.md).
// Cada prueba documenta el comportamiento del MVP y verifica el nuevo.
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { CLAVES_JSON_MVP, VIEWPORT, abrirApp, clicExport, descargar, laminasPptx } from './src/escenarios.mjs';
import { PUERTO_NUEVA, PUERTO_REFERENCIA } from './src/puertos.mjs';
import { archivosDeIngesta } from './src/archivos.mjs';
import { TEXTOS_DIVERGENTES } from './src/textos-divergentes.mjs';

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
    expect(mvp, `${t.d}: el MVP no dice «${t.nueva}»`).not.toContain(t.nueva);
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

// D12: una compuerta de convergencia no es una decisión. Es lo que cambia en los
// artefactos «merge-gateways/*» del copiloto (artefactos-divergentes.mjs): aquí se
// comprueba que la única diferencia con el MVP son los fines inventados.
const MODELO = (s) => ({
  nodos: s.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label, owner: n.owner, gatewayType: n.gatewayType, merge: !!n._merge, codigo: n.activityCode })),
  aristas: s.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label }))
});

test('D12: «Insertar compuertas de convergencia» ya no deja fines «Caso no procede» colgando', async ({ browser }) => {
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

// D13: con la jerarquía explícita (la de la IA o la de los subprocesos de un BPMN
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

test('D13: con jerarquía explícita, el nivel Ejecutivo no pasa de 10 cajas', async ({ browser }) => {
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
