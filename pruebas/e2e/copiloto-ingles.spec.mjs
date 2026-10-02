// El copiloto con el editor en inglés (app/copiloto/comandos.js y heuristicas.js).
// - Entiende las órdenes de edición en inglés y también las de siempre en español, y
//   responde en el idioma del editor.
// - Cada orden en inglés deja el proceso exactamente igual que su equivalente en
//   español: se compara el proceso guardado (processiq.v1) después de cada orden.
// - Su ayuda (el placeholder del cuadro) está en inglés, con ejemplos en inglés.
// - Los nombres de las actividades no se traducen: se escriben tal cual.
// Con el editor en español no cambia nada: lo compara la fidelidad con el MVP
// (pruebas/fidelidad, «comandos: variantes, errores y órdenes en inglés…»).
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { en } from '../../apps/web/src/app/textos/en.js';
import { es } from '../../apps/web/src/app/textos/es.js';

const CAPTURAS = 'resultados/copiloto-ingles';
const VIEWPORT = { width: 1280, height: 860 };

/**
 * [orden en español, la misma en inglés, respuesta en inglés], en este orden, sobre el
 * ejemplo «Gestión de Reclamos» (loadDemo). Cubre las cinco órdenes con sus variantes
 * (antes y después, sinónimos, comillas, «the step»), una conexión que ya existe y
 * nombres que no existen.
 */
const PARES = [
  ['agregar Validar identidad después de Registrar reclamo', 'add Validar identidad after Registrar reclamo',
    '✅ I added "Validar identidad" after "Registrar reclamo".'],
  ['insertar Revisar documentos antes de Investigar caso', 'insert a new step Revisar documentos before Investigar caso',
    '✅ I added "Revisar documentos" before "Investigar caso".'],
  ['renombrar Investigar caso a Analizar caso', 'rename Investigar caso to Analizar caso',
    '✅ I renamed "Investigar caso" → "Analizar caso".'],
  ['cambiar Analizar caso por Analizar expediente', 'replace Analizar caso with Analizar expediente',
    '✅ I renamed "Analizar caso" → "Analizar expediente".'],
  ['conectar Aprobar resolución con Validar identidad', 'connect Aprobar resolución to Validar identidad',
    '✅ I connected "Aprobar resolución" → "Validar identidad".'],
  ['une Aprobar resolución con Validar identidad', 'link Aprobar resolución with Validar identidad',
    'That connection already exists.'],
  ['marcar Notificar al cliente como automático', 'mark Notificar al cliente as automatic',
    '✅ "Notificar al cliente" marked as Service Task.'],
  ['poner Analizar expediente como bot', 'set Analizar expediente as bot',
    '✅ "Analizar expediente" marked as Service Task.'],
  ['cambiar tipo de Revisar documentos como teléfono', 'change the type of Revisar documentos to phone',
    '✅ "Revisar documentos" marked as Receive Task.'],
  ['marcar Validar identidad como ia', 'flag "Validar identidad" as AI',
    '✅ "Validar identidad" marked as Script Task.'],
  ['eliminar Validar identidad', 'delete Validar identidad',
    '✅ I deleted "Validar identidad" and reconnected the flow.'],
  ['borrar el paso Revisar documentos', 'remove the step Revisar documentos',
    '✅ I deleted "Revisar documentos" and reconnected the flow.'],
  ['eliminar Cobro inexistente', 'delete Cobro inexistente',
    'I could not find "Cobro inexistente" to delete.'],
  ['agregar Llamar al cliente después de Pago inexistente', 'add Llamar al cliente after Pago inexistente',
    'I could not find the activity "Pago inexistente". Check the name.'],
  ['renombrar Nada a Algo', 'rename Nada to Algo',
    'I could not find "Nada" to rename.'],
  ['conectar Nada con Aprobar resolución', 'join Nada and Aprobar resolución',
    'I could not find "Nada".']
];

/** El editor libre en un navegador nuevo, en el idioma pedido, con el ejemplo cargado y el copiloto abierto. */
async function abrirEditor(browser, idioma) {
  const contexto = await browser.newContext({ viewport: VIEWPORT });
  if (idioma === 'en') await contexto.addInitScript(() => localStorage.setItem('processiq.idioma', 'en'));
  const page = await contexto.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => !!window.ProcessIQ);
  await expect(page.locator('html')).toHaveAttribute('lang', idioma);
  await page.evaluate(() => window.ProcessIQ.loadDemo());
  // Un clic en la pestaña activa con el cajón abierto lo cierra (cajon.js): solo si hace falta
  const abierto = () => page.evaluate(() => document.body.classList.contains('panel-open') &&
    document.querySelector('.tab[data-tab="copilot"]').classList.contains('active'));
  if (!(await abierto())) await page.locator('.tab[data-tab="copilot"]').click();
  expect(await abierto()).toBe(true);
  // El cuadro está al final del panel, debajo de las acciones rápidas
  await page.locator('#btnCopilotSend').scrollIntoViewIfNeeded();
  await expect(page.locator('#btnCopilotSend')).toBeInViewport();
  return { contexto, page, errores };
}

/** Envía una orden por el cuadro del copiloto y devuelve el texto de la respuesta. */
async function enviar(page, orden) {
  const mensajes = page.locator('#copilotMessages > .copilot-msg');
  const antes = await mensajes.count();
  await page.locator('#copilotPrompt').fill(orden);
  await page.locator('#btnCopilotSend').click();
  // La respuesta llega a los 350 ms (copiloto.js). Las frases que lanzan un análisis
  // (resumen, KPIs…) escriben primero el suyo y después una burbuja vacía.
  await expect.poll(() => mensajes.count()).toBeGreaterThanOrEqual(antes + 2);
  await expect(mensajes.nth(antes)).toHaveText(orden);
  return (await mensajes.nth(antes + 1).locator('.bubble').innerText()).trim();
}

/** El proceso guardado, sin la hora de guardado. */
async function modelo(page) {
  return page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('processiq.v1'));
    delete d.savedAt;
    return d;
  });
}

/** Aplica las órdenes una a una: respuesta y proceso después de cada una. */
async function recorrer(page, ordenes) {
  const pasos = [];
  for (const orden of ordenes) {
    const respuesta = await enviar(page, orden);
    pasos.push({ orden, respuesta, modelo: await modelo(page) });
  }
  return pasos;
}

test.describe('copiloto con el editor en inglés', () => {
  test.setTimeout(120_000);

  test('cada orden en inglés deja el proceso igual que su equivalente en español, y responde en inglés', async ({ browser }) => {
    await mkdir(CAPTURAS, { recursive: true });

    // En español (el editor de siempre)
    const es1 = await abrirEditor(browser, 'es');
    const inicioEs = await modelo(es1.page);
    const enEspanol = await recorrer(es1.page, PARES.map(([orden]) => orden));
    expect(enEspanol[0].respuesta).toBe('✅ Agregué "Validar identidad" después de "Registrar reclamo".');
    expect(es1.errores).toEqual([]);
    await es1.contexto.close();

    // En inglés: las mismas órdenes en inglés
    const en1 = await abrirEditor(browser, 'en');
    expect(await modelo(en1.page)).toEqual(inicioEs);
    const enIngles = await recorrer(en1.page, PARES.map(([, orden]) => orden));
    for (const [i, [ordenEs, ordenEn, respuesta]] of PARES.entries()) {
      expect(enIngles[i].respuesta, `respuesta a «${ordenEn}»`).toBe(respuesta);
      expect(enIngles[i].modelo, `proceso tras «${ordenEn}» frente a «${ordenEs}»`).toEqual(enEspanol[i].modelo);
    }
    // Las órdenes hicieron algo: hay una actividad renombrada y una conexión nueva
    const final = enIngles.at(-1).modelo;
    expect(final.nodes.map((n) => n.label)).toContain('Analizar expediente');
    expect(final.nodes.find((n) => n.label === 'Notificar al cliente').executionType).toBe('automatic');
    expect(final.nodes.find((n) => n.label === 'Analizar expediente').executionType).toBe('rpa');
    expect(final).not.toEqual(inicioEs);
    await en1.page.locator('#copilotMessages').evaluate((m) => { m.scrollTop = 0; });
    await en1.page.screenshot({ path: `${CAPTURAS}/ordenes-en-ingles.png` });
    await en1.page.locator('#copilotMessages').evaluate((m) => { m.scrollTop = m.scrollHeight; });
    await en1.page.screenshot({ path: `${CAPTURAS}/ordenes-en-ingles-final.png` });
    expect(en1.errores).toEqual([]);
    await en1.contexto.close();
  });

  test('con el editor en inglés, las órdenes en español también funcionan y responden en inglés', async ({ browser }) => {
    const es1 = await abrirEditor(browser, 'es');
    const enEspanol = await recorrer(es1.page, PARES.map(([orden]) => orden));
    await es1.contexto.close();

    const en1 = await abrirEditor(browser, 'en');
    const mezcla = await recorrer(en1.page, PARES.map(([orden]) => orden));
    for (const [i, [ordenEs, , respuesta]] of PARES.entries()) {
      expect(mezcla[i].modelo, `proceso tras «${ordenEs}»`).toEqual(enEspanol[i].modelo);
      // Misma respuesta en inglés. En los «no encontré», la orden en español escribe el
      // nombre en minúsculas (como el MVP: interpreta la orden ya en minúsculas).
      expect(mezcla[i].respuesta.toLowerCase(), `respuesta a «${ordenEs}»`).toBe(respuesta.toLowerCase());
    }
    expect(en1.errores).toEqual([]);
    await en1.contexto.close();
  });

  test('los nombres se escriben tal cual, y lo que no es una orden no toca el proceso', async ({ browser }) => {
    await mkdir(CAPTURAS, { recursive: true });
    const en1 = await abrirEditor(browser, 'en');
    const page = en1.page;

    // El nombre no se traduce y conserva sus mayúsculas (en español, como el MVP, solo la primera)
    expect(await enviar(page, 'add Validar en SAP after Registrar reclamo')).toBe('✅ I added "Validar en SAP" after "Registrar reclamo".');
    expect(await enviar(page, 'agregar Revisar en SAP después de Validar en SAP')).toBe('✅ I added "Revisar en sap" after "Validar en SAP".');
    const conNombres = await modelo(page);
    expect(conNombres.nodes.map((n) => n.label)).toEqual(expect.arrayContaining(['Validar en SAP', 'Revisar en sap']));

    // No son órdenes de editar: no renombran ni borran nada
    const generico = en['heur.generico'];
    expect(await enviar(page, 'change the owner of Registrar reclamo to Ana')).toBe(generico);
    expect(await enviar(page, 'remove the connection between Registrar reclamo and Validar en SAP')).toBe(generico);
    expect(await modelo(page)).toEqual(conNombres);

    // Frases del copiloto en inglés (además de las de siempre)
    expect(await enviar(page, 'hello')).toBe(en['heur.hola']);
    expect(await enviar(page, 'which indicators apply?')).toContain('Recommended KPIs for Banca (Servicio)');
    expect(await enviar(page, 'redesign it')).toContain('Redesign proposal (to-be)');
    expect(await enviar(page, 'executive summary')).toContain('EXECUTIVE SUMMARY — PROCESS DIAGNOSIS');
    expect(await modelo(page)).toEqual(conNombres);
    await page.screenshot({ path: `${CAPTURAS}/frases.png` });
    expect(en1.errores).toEqual([]);
    await en1.contexto.close();
  });

  test('la ayuda del copiloto sale en inglés, y en español vuelve a ser la de siempre', async ({ browser }) => {
    await mkdir(CAPTURAS, { recursive: true });
    const es1 = await abrirEditor(browser, 'es');
    const page = es1.page;
    const cuadro = page.locator('#copilotPrompt');
    await expect(cuadro).toHaveAttribute('placeholder', es['html.copiloto.comandos']);
    await page.locator('.copilot-input').screenshot({ path: `${CAPTURAS}/cuadro-es.png` });

    await page.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'English' }).click();
    await expect(cuadro).toHaveAttribute('placeholder', en['html.copiloto.comandos']);
    const ayuda = await cuadro.getAttribute('placeholder');
    expect(ayuda).not.toMatch(/Spanish|agregar|después/);
    for (const orden of ['add ', ' after ', 'delete ', 'rename ', 'connect ', 'mark ', ' as automatic']) expect(ayuda).toContain(orden);
    await expect(page.locator('#btnCopilotSend')).toHaveText('Send');
    await page.locator('.copilot-input').screenshot({ path: `${CAPTURAS}/cuadro-en.png` });

    // Cada ejemplo de la ayuda funciona tal como está escrito (con los nombres del ejemplo)
    expect(await enviar(page, 'add Validar score after Registrar reclamo')).toBe('✅ I added "Validar score" after "Registrar reclamo".');
    expect(await enviar(page, 'delete Aprobar')).toBe('✅ I deleted "Aprobar resolución" and reconnected the flow.');
    expect(await enviar(page, 'mark Validar score as automatic')).toBe('✅ "Validar score" marked as Service Task.');

    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Español' }).click();
    await expect(cuadro).toHaveAttribute('placeholder', es['html.copiloto.comandos']);
    await expect(page.locator('#btnCopilotSend')).toHaveText('Enviar');
    expect(es1.errores).toEqual([]);
    await es1.contexto.close();
  });
});
