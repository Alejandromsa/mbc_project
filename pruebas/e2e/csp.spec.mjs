// Content-Security-Policy y Permissions-Policy de punta a punta.
// src/servidor.mjs sirve la web construida con las cabeceras de infra/Caddyfile
// y registra cada violación (src/csp.mjs). Aquí se recorren el editor y el
// shell y se exige que no haya ninguna; además, al final de toda la corrida,
// src/comprobar-csp.mjs falla si otra prueba violó la CSP.
import { expect, test } from '@playwright/test';
import { BASE, CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';
import { MARCA_CONTROL, cabecerasDeCaddy, cabecerasDePrueba, informesCsp } from './src/csp.mjs';
// Los mismos recorridos del editor que la fidelidad compara con el MVP
import { capturarDemo, cargarFuentes, clicExport, descargar } from '../fidelidad/src/escenarios.mjs';
import {
  SPEC_IA, capturarComandos, capturarCopiloto, capturarImportBpmn, capturarMineria, sse, xmlBpmnDeDemo
} from '../fidelidad/src/interacciones.mjs';
import { capturarPaneles } from '../fidelidad/src/paneles.mjs';
import { archivosDeIngesta } from '../fidelidad/src/archivos.mjs';

const CSP_OBLIGATORIA = !!cabecerasDeCaddy()['Content-Security-Policy'];

/** Violaciones de la CSP y avisos de política en la consola desde que empieza la prueba. */
function vigilar(page) {
  const consola = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Permissions.Policy|Refused to/i.test(m.text())) consola.push(m.text());
  });
  let desde = null;
  return {
    async empezar() { desde = (await informesCsp()).length; },
    async comprobar() {
      await page.waitForTimeout(800);   // el navegador envía los informes en segundo plano
      expect((await informesCsp()).slice(desde), 'violaciones de la CSP').toEqual([]);
      expect(consola, 'avisos de CSP o Permissions-Policy en la consola').toEqual([]);
    }
  };
}

/** Peticiones a otros orígenes (http/https); data: y blob: no cuentan. */
function externas(page) {
  const hosts = new Set();
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol) && u.origin !== BASE) hosts.add(u.host);
  });
  return hosts;
}

async function abrirEditor(page, ruta = '/') {
  const respuesta = await page.goto(ruta);
  await page.waitForFunction(() => !!window.ProcessIQ);
  await cargarFuentes(page);
  return respuesta;
}

test('las cabeceras son las del Caddyfile y Montserrat llega de /fonts/', async ({ page }) => {
  const v = vigilar(page);
  await v.empezar();
  const hosts = externas(page);
  const respuesta = await abrirEditor(page);
  // Obligatoria: `-Report-Only` solo vale en una copia de trabajo, para descubrir qué rompe
  expect(CSP_OBLIGATORIA, 'la CSP del Caddyfile es obligatoria, no de solo informe').toBe(true);
  const esperadas = cabecerasDePrueba();
  for (const [nombre, valor] of Object.entries(esperadas)) expect(respuesta.headers()[nombre.toLowerCase()], nombre).toBe(valor);
  expect(esperadas['Permissions-Policy']).toBe('camera=(), geolocation=(), microphone=(self)');

  // Las 20 caras (4 pesos × 5 subconjuntos) cargadas desde la propia web
  const caras = await page.evaluate(() => [...document.fonts]
    .filter((f) => f.family.replace(/["']/g, '') === 'Montserrat').map((f) => `${f.weight}:${f.status}`));
  expect(caras).toHaveLength(20);
  expect(caras.every((c) => c.endsWith(':loaded'))).toBe(true);
  const recursos = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /woff2|fonts/.test(n)));
  expect(recursos.length).toBeGreaterThan(0);
  expect(recursos.every((n) => n.startsWith(BASE + '/fonts/'))).toBe(true);

  // Permissions-Policy: micrófono sí (grabación de voz), cámara y geolocalización no
  const permisos = await page.evaluate(() => {
    const p = document.permissionsPolicy || document.featurePolicy;
    return p ? { microfono: p.allowsFeature('microphone'), camara: p.allowsFeature('camera'), geolocalizacion: p.allowsFeature('geolocation') } : null;
  });
  expect(permisos).toEqual({ microfono: true, camara: false, geolocalizacion: false });
  expect(await page.evaluate(() => navigator.permissions.query({ name: 'geolocation' }).then((r) => r.state))).toBe('denied');

  expect([...hosts]).toEqual([]);
  await v.comprobar();
});

test('editor libre: ejemplos, exportaciones, paneles, copiloto, minería, BPMN, ingesta y grabación', async ({ page, context }) => {
  test.setTimeout(300_000);
  const v = vigilar(page);
  await v.empezar();
  const hosts = externas(page);
  await abrirEditor(page);

  // Ejemplos con sus exportaciones: JSON, SVG, BPMN, Word, Ficha, PPTX (mbc y bbva) y los 3 niveles
  for (const demo of ['loadComplex4', 'loadFichaVentaLotes']) await capturarDemo(page, demo);
  const png = await descargar(page, () => clicExport(page, 'png'));   // SVG -> blob: -> <img> -> canvas
  expect(png.datos.length).toBeGreaterThan(1000);
  await page.evaluate(() => window.ProcessIQ.openFichaPreview());     // mete un <style> en el modal
  await page.evaluate(() => document.querySelector('#modalCancel').click());

  // Paneles, To-Be, recarga e importación JSON; copiloto; comandos; minería; BPMN
  await capturarPaneles(page, 'loadComplex4');
  await capturarCopiloto(page, 'loadComplex');
  await capturarComandos(page);
  await capturarMineria(page);
  await capturarImportBpmn(page, await xmlBpmnDeDemo(page, 'loadComplex3'));
  await page.evaluate(() => document.querySelector('#btnPresent').click());
  await page.keyboard.press('Escape');

  // Ingesta: Word (mammoth), PDF (pdf.js y su worker), PowerPoint (JSZip) y texto
  await page.setInputFiles('#docFileInput', await archivosDeIngesta());
  await page.waitForFunction(() => window.ProcessIQ.sources().length >= 4, null, { timeout: 60_000 });
  const leidas = await page.evaluate(() => window.ProcessIQ.sources().map((s) => [s.nombre, s.chars]));
  for (const [nombre, chars] of leidas) expect(chars, nombre).toBeGreaterThan(50);
  await page.evaluate(() => { window.ProcessIQ.runIngest(); });
  await page.waitForFunction(() => document.querySelector('#modalCancel')?.textContent === 'Modo básico', null, { timeout: 10_000 });
  await page.evaluate(() => document.querySelector('#modalCancel').click());
  await expect.poll(() => page.evaluate(() => window.ProcessIQ.snapshot().tasks)).toBeGreaterThan(2);

  // Grabación de voz («🔴 Grabar»): la Permissions-Policy no bloquea el micrófono
  await context.grantPermissions(['microphone'], { origin: BASE });
  await page.evaluate(() => document.querySelector('#btnRecStart').click());
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.querySelector('#recStatus').textContent)).not.toContain('not-allowed');
  await page.evaluate(() => document.querySelector('#btnRecStop').click());

  expect([...hosts]).toEqual([]);
  await v.comprobar();
});

test('IA del editor libre: el intermediario del mismo origen (/ia) y la clave propia (api.anthropic.com)', async ({ page, context }) => {
  const v = vigilar(page);
  await v.empezar();
  // Las peticiones solo llegan aquí si la CSP las deja salir (connect-src)
  const origenes = [];
  const responder = async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    origenes.push(new URL(req.url()).origin);
    const cuerpo = req.postDataJSON();
    const texto = JSON.stringify(cuerpo.system ?? '').includes('Reconstruyes flujos') ? JSON.stringify(SPEC_IA) : '**Respuesta simulada.**';
    await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: sse(texto) });
  };
  await context.route(BASE + '/ia/**', responder);
  await context.route('https://api.anthropic.com/**', responder);
  await abrirEditor(page);

  // Modo equipo con el intermediario por defecto (location.origin + '/ia'): generación
  await page.evaluate(() => localStorage.setItem('processiq.ai', JSON.stringify({ modo: 'equipo', codigo: 'codigo-prueba', model: 'claude-opus-5' })));
  await page.evaluate(() => { document.querySelector('#notesInput').value = 'Recibo la solicitud, reviso los datos y, si todo está bien, apruebo el crédito.'; });
  await page.evaluate(() => { window.ProcessIQ.runIngest(); });
  await page.waitForFunction(() => document.querySelector('#modalOk')?.textContent === 'Generar', null, { timeout: 10_000 });
  await page.evaluate(() => document.querySelector('#modalOk').click());
  await page.waitForFunction(() => /interpretado con IA/.test(document.querySelector('#copilotMessages')?.textContent ?? ''), null, { timeout: 30_000 });

  // Clave propia: el navegador llama directamente a Anthropic
  await page.evaluate(() => localStorage.setItem('processiq.ai', JSON.stringify({ modo: 'propia', key: 'sk-ant-prueba', model: 'claude-opus-5' })));
  const tarea = await page.evaluate(() => window.ProcessIQ.aiTasks()[0]);
  await page.evaluate((t) => document.querySelector(`.copilot-action[data-action="${t}"]`).click(), tarea);
  await expect.poll(() => origenes.includes('https://api.anthropic.com')).toBe(true);
  expect(origenes).toContain(BASE);

  await page.evaluate(() => window.ProcessIQ.openAiSettings());      // diálogo con estilos en línea
  await page.evaluate(() => document.querySelector('#modalCancel').click());
  await v.comprobar();
});

test('shell: todas las pantallas del administrador y el editor en modo proyecto', async ({ page }) => {
  test.setTimeout(120_000);
  reiniciarDatos();
  const v = vigilar(page);
  await v.empezar();
  const hosts = externas(page);
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo('admin'));
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();

  for (const ruta of ['/proyectos/importar', '/proyectos/admin/usuarios', '/proyectos/admin/catalogos', '/proyectos/admin/auditoria',
    '/proyectos/admin/ia', '/proyectos/admin/sistema', '/proyectos/portafolio', '/proyectos/conocimiento']) {
    await page.goto(ruta);
    await expect(page.locator('h1').first(), ruta).toBeVisible();
    await expect(page.getByText('Algo salió mal')).toHaveCount(0);
  }
  await page.goto('/proyectos/no-existe');
  await expect(page.getByText('Esta página no existe')).toBeVisible();
  await page.goto('/proyectos/admin/catalogos');
  for (const pestana of ['Verbos del Playbook', 'Temas PPTX', 'Plantillas de proceso']) {
    await page.getByRole('tab', { name: pestana }).click();
    await expect(page.getByRole('tab', { name: pestana })).toHaveAttribute('aria-selected', 'true');
  }

  await page.goto('/proyectos/');
  await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await page.getByRole('link', { name: 'Gestión de siniestros', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestión de siniestros', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  const barra = page.locator('.piq-proyecto');
  await expect(barra).toContainText('v3');
  await page.locator('#processName').fill('Gestión de siniestros (CSP)');
  await barra.getByRole('button', { name: 'Guardar revisión' }).click();
  const dialogo = page.locator('dialog.piq-dialogo');
  await dialogo.getByRole('textbox').fill('Prueba de la CSP');
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('.piq-proyecto-aviso')).toContainText('Guardada como v4');

  expect([...hosts]).toEqual([]);
  await v.comprobar();
});

test('la página 404 (con estilos en línea) cumple la CSP', async ({ page }) => {
  const v = vigilar(page);
  await v.empezar();
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.mark')).backgroundColor)).toBe('rgb(255, 71, 19)');
  await v.comprobar();
});

test('control: la CSP bloquea otros orígenes, los scripts en línea y eval, y lo informa', async ({ page }) => {
  // Esta página viola la CSP a propósito: su URL lleva MARCA_CONTROL para que
  // la comprobación final de la corrida no la cuente.
  const desde = (await informesCsp()).length;
  await abrirEditor(page, '/?' + MARCA_CONTROL);
  const r = await page.evaluate(async () => {
    const out = {};
    try { await fetch('https://ejemplo.invalid/'); out.fetch = 'salio'; } catch { out.fetch = 'fallo'; }
    const s = document.createElement('script');
    s.textContent = 'window.__enLinea = 1';
    document.head.appendChild(s);
    out.enLinea = window.__enLinea === 1 ? 'ejecutado' : 'bloqueado';
    // Un temporizador con texto es eval. No se prueba con new Function: dentro de
    // page.evaluate, DevTools permite eval aunque la CSP lo prohíba.
    setTimeout('window.__evalTexto = 1', 0);
    await new Promise((r) => setTimeout(r, 200));
    out.eval = window.__evalTexto === 1 ? 'ejecutado' : 'bloqueado';
    return out;
  });
  await expect.poll(async () => (await informesCsp()).slice(desde).map((i) => i.directiva).sort())
    .toEqual(['connect-src', 'script-src', 'script-src-elem']);
  const informes = (await informesCsp()).slice(desde);
  expect(informes.every((i) => i.documento.includes(MARCA_CONTROL))).toBe(true);
  expect(informes.find((i) => i.directiva === 'connect-src').bloqueado).toContain('ejemplo.invalid');
  if (CSP_OBLIGATORIA) expect(r).toEqual({ fetch: 'fallo', enLinea: 'bloqueado', eval: 'bloqueado' });
});
