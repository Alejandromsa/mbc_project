// Motor del diagrama con BPMN importados (fixtures inventados de packages/bpmn):
// - una compuerta de convergencia no recibe el fin «Caso no procede» (divergencia D13);
// - el nivel Ejecutivo no pasa de 10 cajas aunque el BPMN traiga subprocesos (D14);
// - el auto-layout respeta el orden de carriles del proceso (meta.ordenCarriles).
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const fixture = (nombre) => readFile(new URL(`../../packages/bpmn/src/__fixtures__/${nombre}`, import.meta.url), 'utf8');

async function abrirEditor(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.ProcessIQ);
  await page.evaluate(() => document.fonts.ready);
}

async function soltarArchivo(page, nombre, contenido) {
  await page.locator('#btnIngest').click();
  await expect(page.locator('#ingestModal')).toBeVisible();
  await page.setInputFiles('#docFileInput', { name: nombre, mimeType: 'application/xml', buffer: Buffer.from(contenido, 'utf8') });
  await expect(page.locator('#ingestModal')).toBeHidden();
}

const guardado = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('processiq.v1')));
const casosNoProcede = (d) => d.nodes.filter((n) => n.label === 'Caso no procede');
// Compuertas exclusivas de convergencia: varias entradas y una sola salida
const convergencias = (d) => d.nodes.filter((n) => n.type === 'decision' && n.gatewayType !== 'parallel' && n.gatewayType !== 'inclusive' &&
  d.edges.filter((e) => e.to === n.id).length >= 2 && d.edges.filter((e) => e.from === n.id).length === 1);

async function captura(page, nombre) {
  // Tras importar se abre la Ficha (como en el MVP): para la captura se cierra el panel
  if (await page.locator('#btnDrawerClose').isVisible()) await page.locator('#btnDrawerClose').click();
  await page.evaluate(() => window.ProcessIQ.autoFit());
  await page.waitForTimeout(400);
  await page.screenshot({ path: `resultados/${nombre}.png` });
}

// El copiloto publica el pedido al instante y hace el trabajo (y su respuesta) en un
// setTimeout: se espera a la respuesta, no al pedido.
async function accionCopiloto(page, accion) {
  const antes = await page.locator('#copilotMessages > .copilot-msg').count();
  await page.evaluate((a) => document.querySelector(`.copilot-action[data-action="${a}"]`).click(), accion);
  await expect(page.locator('#copilotMessages > .copilot-msg')).toHaveCount(antes + 2);
  return page.locator('#copilotMessages > .copilot-msg').last();
}

test('las compuertas de convergencia de un BPMN importado no reciben el fin «Caso no procede»', async ({ page }) => {
  await abrirEditor(page);

  // BPMN de otra herramienta con carriles: tampoco al insertar las compuertas de cierre
  await soltarArchivo(page, 'bizagi-reclamos.bpmn', await fixture('bizagi-reclamos.bpmn'));
  let d = await guardado(page);
  expect(d.lanes.list).toHaveLength(4);
  expect(casosNoProcede(d)).toEqual([]);
  const mensaje = await accionCopiloto(page, 'merge-gateways');
  await expect(mensaje).toContainText('compuerta(s) de convergencia insertada(s)');
  d = await guardado(page);
  const cierres = d.nodes.filter((n) => n._merge);
  expect(cierres.length).toBeGreaterThan(0);
  await expect(mensaje).toContainText(`Nodos: 15 → ${15 + cierres.length}.`);
  expect(casosNoProcede(d)).toEqual([]);
  // Cada cierre: varias entradas, una salida sin rótulo, en el carril de su destino
  for (const c of cierres) {
    expect(d.edges.filter((e) => e.to === c.id).length).toBeGreaterThanOrEqual(2);
    expect(d.edges.filter((e) => e.from === c.id).map((e) => e.label)).toEqual(['']);
  }
  expect(d.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  await captura(page, 'motor-convergencias-bizagi');

  // Un BPMN del propio ProcessIQ con compuertas de cierre se lee como en el MVP (plano):
  // al importarlo, sus convergencias siguen sin fin inventado
  await page.evaluate(() => window.ProcessIQ.loadComplex());
  await expect(await accionCopiloto(page, 'merge-gateways')).toContainText('2 compuerta(s) de convergencia insertada(s)');
  const xml = await page.evaluate(() => window.ProcessIQ.generateBpmnXml());
  expect(xml).toContain('exporter="ProcessIQ"');
  await soltarArchivo(page, 'originacion.bpmn', xml);
  d = await guardado(page);
  expect(convergencias(d)).toHaveLength(2);
  expect(casosNoProcede(d)).toEqual([]);
  await captura(page, 'motor-convergencias-reimportado');
});

test('el nivel Ejecutivo de un BPMN con subprocesos no pasa de 10 cajas y vuelve entero a Detalle', async ({ page }) => {
  await abrirEditor(page);
  for (const [archivo, total] of [['camunda-alta-cliente.bpmn', 24], ['signavio-compras.bpmn', 19]]) {
    await soltarArchivo(page, archivo, await fixture(archivo));
    expect(await page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(total);
    await page.locator('#nivelVista button[data-nivel="1"]').click();
    await expect.poll(() => page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBeLessThanOrEqual(10);
    const d = await guardado(page);
    expect(d.lanes.list).toHaveLength(1);                                    // un solo carril: el del proceso
    expect(d.nodes.some((n) => /\(\+\d+ pasos\)$/.test(n.label))).toBe(true); // etapas, como las deducidas
    expect(d.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && n.x > 0 && n.y > 0)).toBe(true);
    expect(await page.evaluate(() => window.ProcessIQ.quality())).toMatchObject({ sobreCajas: 0 });
    await captura(page, `motor-ejecutivo-${archivo.split('-')[0]}`);
    await page.locator('#nivelVista button[data-nivel="3"]').click();
    await expect.poll(() => page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(total);
  }
});

test('el auto-layout respeta el orden de carriles guardado en el proceso (meta.ordenCarriles)', async ({ page }) => {
  await abrirEditor(page);
  await soltarArchivo(page, 'signavio-compras.bpmn', await fixture('signavio-compras.bpmn'));
  const ORDEN = ['Comprador', 'Jefe de compras', 'Almacén', 'Finanzas'];   // el del archivo, de arriba abajo
  let d = await guardado(page);
  // Sin orden guardado, el baricentro sube «Finanzas» (como el MVP)
  expect(d.lanes.list).toEqual(['Comprador', 'Finanzas', 'Jefe de compras', 'Almacén']);

  // El mismo proceso con el orden guardado, por «Importar» (JSON completo sin carriles)
  const json = { ...d, meta: { ...d.meta, ordenCarriles: ORDEN }, lanes: null, activeView: 'asis', views: { asis: null, tobe: null } };
  await page.setInputFiles('#fileImport', { name: 'compras.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json), 'utf8') });
  await expect.poll(async () => (await guardado(page)).lanes?.list).toEqual(ORDEN);
  // Se mantiene al reorganizar y al pasar por Actividad
  await expect(await accionCopiloto(page, 'relayout')).toContainText('Diagrama reorganizado');
  expect((await guardado(page)).lanes.list).toEqual(ORDEN);
  await page.locator('#nivelVista button[data-nivel="2"]').click();
  await expect.poll(() => page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBeLessThan(19);
  const enActividad = (await guardado(page)).lanes.list;
  expect(enActividad).toEqual(ORDEN.filter((l) => enActividad.includes(l)));
  await page.locator('#nivelVista button[data-nivel="3"]').click();
  await expect.poll(() => page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(19);
  d = await guardado(page);
  expect(d.lanes.list).toEqual(ORDEN);
  expect(d.meta.ordenCarriles).toEqual(ORDEN);
  // «Jefe de compras» queda por encima de «Finanzas», como en el archivo
  const y = (etiqueta) => d.nodes.find((n) => n.label === etiqueta).y;
  expect(y('Aprobar solicitud')).toBeLessThan(y('Validar factura contra orden'));
  await captura(page, 'motor-orden-carriles');
});
