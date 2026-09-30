// El editor en español e inglés (app/i18n.js). Por defecto, español; el idioma es el
// de la plataforma (processiq.idioma), se elige con «ES / EN» en la cabecera, persiste
// al recargar y lo siguen el shell y las otras pestañas. En español el editor no cambia:
// al volver de inglés, el HTML queda idéntico. Las exportaciones no se traducen.
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { en } from '../../apps/web/src/app/textos/en.js';
import { es } from '../../apps/web/src/app/textos/es.js';
import { ENLACES_HTML } from '../../apps/web/src/app/textos/html.js';
import { BASE, CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

const FECHA = new Date('2026-09-25T12:00:00-05:00');
const CAPTURAS = 'resultados/editor-idioma';

/** Variables {x} de un texto, ordenadas. */
const variables = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('los diccionarios del editor: en.js tiene todas las claves de es.js, con las mismas variables', () => {
  const faltan = Object.keys(es).filter((k) => !(k in en));
  const sobran = Object.keys(en).filter((k) => !(k in es));
  const distintas = Object.keys(es).filter((k) => k in en && variables(es[k]) !== variables(en[k]));
  const vacias = Object.keys(en).filter((k) => typeof en[k] !== 'string' || !en[k].trim());
  expect({ faltan, sobran, distintas, vacias }).toEqual({ faltan: [], sobran: [], distintas: [], vacias: [] });
  for (const [, , clave] of ENLACES_HTML) expect(es[clave], `clave ${clave} de textos/html.js`).toBeDefined();
});

// Contenedores con datos o catálogos (industrias, KPIs, el lienzo): no son textos de la interfaz
const DATOS = ['canvas', 'processIndustry', 'processMacro', 'kpiFilterIndustry', 'kpiList', 'propExecType', 'painCategory'];
/** Textos de index.html que son iguales en los dos idiomas (marcas, siglas, teclas, formatos). */
const IGUALES = new Set(['M', 'MBC', 'ProcessIQ', 'As-Is', 'To-Be', 'BPMN 2.0 · Bizagi/Camunda', 'PPTX · MBC', 'Data', '▱ Data', 'Props',
  'Pains', 'Pain points', 'KPIs', 'Sim', 'Lint', 'Ctrl/⌘', 'Z', 'Y', 'F', 'C', 'Del', 'Esc', 'Zoom 100%', 'USR-27', '⚡ Error', 'SLA',
  'BVA — Business Value Added', 'NVA — No Value Added', 'PR-DU-COM-02', 'ES', 'EN', 'Español', 'English', 'x',
  '🗄 Event Log (Process Mining)', 'event logs', 'event log', 'resource', 'process discovery']);

/** Todos los textos y atributos visibles de la página, con su ruta (sin el SVG del lienzo). */
function volcado(page) {
  return page.evaluate((datos) => {
    const out = [];
    const rec = (el, ruta, dato) => {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      const aqui = ruta + '>' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
      const esDato = dato || datos.includes(el.id);
      for (const a of ['title', 'placeholder', 'aria-label', 'data-title', 'alt']) if (el.hasAttribute(a)) out.push([aqui + '@' + a, el.getAttribute(a), esDato]);
      let i = 0;
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && n.nodeValue.trim()) out.push([aqui + '#' + i++, n.nodeValue, esDato]);
        else if (n.nodeType === 1 && n.id !== 'canvas') rec(n, aqui, esDato);
      }
    };
    rec(document.body, 'body', false);
    out.push(['title', document.title, false], ['lang', document.documentElement.lang, false]);
    return out;
  }, DATOS);
}

/** Sin desbordes horizontales a varios anchos (lección 22q). */
async function sinDesbordes(page) {
  for (const ancho of [1024, 1100, 1180, 1280, 1440]) {
    await page.setViewportSize({ width: ancho, height: 860 });
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(sobra, `desborde a ${ancho} px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 860 });
}

async function descargar(page, accion) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), accion()]);
  return readFile(await dl.path());
}

async function laminas(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const out = {};
  for (const n of Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort()) out[n] = await zip.file(n).async('string');
  return out;
}

/** Word, BPMN y láminas PPTX del proceso abierto, desde el menú Exportar. */
async function exportaciones(page, textoMenu, textoWord, textoBpmn, textoPptx) {
  const exportar = async (texto) => {
    await page.getByRole('button', { name: textoMenu, exact: true }).click();
    await page.locator('#exportDropdown').getByRole('button', { name: texto }).click();
  };
  return {
    word: (await descargar(page, () => exportar(textoWord))).toString('utf8'),
    bpmn: (await descargar(page, () => exportar(textoBpmn))).toString('utf8'),
    pptx: await laminas(await descargar(page, () => exportar(textoPptx)))
  };
}

test.describe('editor libre', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('en inglés: cabecera, paneles y mensajes; ejemplo y exportaciones sin traducir; persiste; al volver a español, idéntico', async ({ page, context }) => {
    await mkdir(CAPTURAS, { recursive: true });
    await page.clock.setFixedTime(FECHA);
    const errores = [];
    page.on('pageerror', (e) => errores.push(String(e)));
    await page.goto('/');
    await page.waitForFunction(() => !!window.ProcessIQ);

    // 1. Por defecto, español, con el selector en la cabecera
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    const idioma = page.getByRole('group', { name: 'Idioma' });
    await expect(idioma.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true');

    // Cada texto de textos/html.js es, exacto, el de index.html (es.js es la fuente de verdad)
    const mal = await page.evaluate(({ enlaces, es }) => enlaces.flatMap(([sel, dest, clave]) => {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) return [`${sel}: no existe`];
      return els.flatMap((el) => {
        let v;
        if (dest.startsWith('attr:')) v = el.getAttribute(dest.slice(5));
        else if (dest === 'html') v = el.innerHTML.replace(/\s+/g, ' ').trim();
        else v = ([...el.childNodes].find((n) => n.nodeType === 3 && /\S/.test(n.nodeValue))?.nodeValue ?? '').replace(/\s+/g, ' ').trim();
        return v === es[clave] ? [] : [`${sel} (${dest}): ${JSON.stringify(v)} ≠ es['${clave}']`];
      });
    }), { enlaces: ENLACES_HTML, es });
    expect(mal).toEqual([]);
    await sinDesbordes(page);
    const antes = await volcado(page);

    // 2. A inglés: todo index.html traducido (salvo lo que es igual en los dos idiomas)
    await idioma.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => localStorage.getItem('processiq.idioma'))).toBe('en');
    await expect(page).toHaveTitle('ProcessIQ — BPMN process diagramming · MBC Peru');
    const cabecera = page.locator('.app-header');
    for (const texto of ['New', 'Ingest', 'Export', '⛶ Present', 'AI To-Be']) await expect(cabecera.getByRole('button', { name: texto, exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Language' })).toBeVisible();
    await expect(page.locator('#canvasHint')).toContainText('Start your process mapping');
    await expect(page.locator('.canvas-statusbar')).toContainText('0 nodes');
    const ingles = await volcado(page);
    const mapa = new Map(antes.map(([ruta, valor]) => [ruta, valor]));
    // Lo que sigue igual tras pasar a inglés: solo datos, textos sin letras (·, ?, 1…) y los de IGUALES
    const sinTraducir = ingles.filter(([ruta, valor, dato]) => !dato && mapa.get(ruta) === valor && /\p{L}/u.test(valor) && !IGUALES.has(valor.trim()) && ruta !== 'lang')
      .map(([ruta, valor]) => `${ruta} = ${JSON.stringify(valor)}`);
    expect(sinTraducir).toEqual([]);
    await sinDesbordes(page);
    await page.screenshot({ path: `${CAPTURAS}/inicio.png` });

    // 3. Y de vuelta a español: idéntico a como estaba
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Español' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(await volcado(page)).toEqual(antes);

    // 4. Un ejemplo y sus exportaciones en español, para comparar
    await page.evaluate(() => window.ProcessIQ.loadComplex4());
    await page.waitForTimeout(500);
    const enEspanol = await exportaciones(page, 'Exportar', 'Word · informe del proceso', 'BPMN 2.0 · Bizagi/Camunda', 'PPTX · MBC azul, Montserrat');

    // 5. En inglés: el mismo ejemplo desde la galería; los paneles y mensajes en inglés
    await page.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'English' }).click();
    await page.evaluate(() => window.ProcessIQ.loadDemo());   // otro proceso, para cargar el ejemplo desde la galería
    await page.getByRole('button', { name: 'Ingest', exact: true }).click();
    await expect(page.locator('#ingestModal')).toContainText('Drop your documents here');
    await page.screenshot({ path: `${CAPTURAS}/ingesta.png` });
    await page.getByRole('button', { name: 'See examples' }).click();
    await expect(page.locator('#modalTitle')).toHaveText('Example processes');
    await page.locator('.example-item').filter({ hasText: 'Gestión de Siniestros (Seguros)' }).click();
    await expect(page.locator('#statusNodes')).toHaveText(/^\d+ nodes$/);
    // Antes de tocar nada (RACI, cuello de botella…): las exportaciones son las mismas que en español
    const enIngles = await exportaciones(page, 'Export', 'Word · process report', 'BPMN 2.0 · Bizagi/Camunda', 'PPTX · MBC blue, Montserrat');
    expect(enIngles.word).toBe(enEspanol.word);
    expect(enIngles.bpmn).toBe(enEspanol.bpmn);
    expect(Object.keys(enIngles.pptx).length).toBeGreaterThan(3);
    expect(enIngles.pptx).toEqual(enEspanol.pptx);
    await page.locator('.tab[data-tab="validations"]').click();
    await expect(page.locator('#drawerTitle')).toHaveText('MBB validations · linter');
    await expect(page.locator('#lintScore')).toContainText('MBB score');
    await expect(page.locator('#lintList')).not.toContainText('Actividad sin');
    await page.screenshot({ path: `${CAPTURAS}/validaciones.png` });
    await page.locator('.tab[data-tab="copilot"]').click();
    await page.getByRole('button', { name: 'Bottleneck / critical path' }).click();
    await expect(page.locator('#copilotMessages .copilot-msg.ai').last()).toContainText('Bottleneck:');
    await page.screenshot({ path: `${CAPTURAS}/copiloto.png` });
    // Un diálogo del editor
    await page.getByRole('button', { name: 'Generate RACI matrix' }).click();
    await expect(page.locator('#modalTitle')).toHaveText(/^RACI matrix · /);
    await expect(page.locator('#modalOk')).toHaveText('OK');
    await page.screenshot({ path: `${CAPTURAS}/dialogo.png` });
    await page.locator('#modalCancel').click();


    // 6. Persiste al recargar
    await page.reload();
    await page.waitForFunction(() => !!window.ProcessIQ);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.app-header').getByRole('button', { name: 'Export', exact: true })).toBeVisible();
    await expect(page.locator('.canvas-statusbar')).toContainText('nodes');

    // 7. El shell lo sigue; y si se cambia en el shell, el editor abierto lo sigue sin recargar
    const shell = await context.newPage();
    await shell.goto('/proyectos/entrar');
    await expect(shell.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await shell.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Español' }).click();
    await expect(shell.getByRole('button', { name: 'Entrar' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('.app-header').getByRole('button', { name: 'Exportar', exact: true })).toBeVisible();
    await expect(page.locator('.canvas-statusbar')).toContainText('nodos');
    await shell.close();
    expect(errores).toEqual([]);
  });
});

test.describe('plataforma', () => {
  test.beforeEach(() => reiniciarDatos());
  test.use({ viewport: { width: 1280, height: 860 } });

  test('el proceso de un proyecto en inglés: barra, guardar revisión y aviso; la vista del invitado', async ({ page, browser }) => {
    await mkdir(CAPTURAS, { recursive: true });
    await page.goto('/proyectos/entrar');
    await page.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'English' }).click();
    await page.getByLabel('Email').fill(correo('editor'));
    await page.getByLabel('Password').fill(CLAVE);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
    await page.getByRole('link', { name: 'Gestión de siniestros', exact: true }).click();
    await page.getByRole('link', { name: 'Open the latest version in the editor' }).click();

    const barra = page.locator('.piq-proyecto');
    await expect(barra).toContainText('v3 · Draft');
    await expect(barra).toContainText('your role: Editor');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.locator('#processName').fill('Siniestros (EN)');
    await expect(barra.locator('.piq-proyecto-cambios')).toHaveText('Unsaved changes');
    await barra.getByRole('button', { name: 'Save revision' }).click();
    const dialogo = page.locator('dialog.piq-dialogo');
    await expect(dialogo).toContainText('This will create v4 of “Gestión de siniestros”');
    await dialogo.screenshot({ path: `${CAPTURAS}/guardar-revision.png` });
    await dialogo.getByRole('textbox').fill('Name in English');
    await dialogo.getByRole('button', { name: 'Save', exact: true }).click();
    const aviso = page.locator('.piq-proyecto-aviso');
    await expect(aviso).toHaveText(/Saved as v4 \(draft\)\./);
    await page.screenshot({ path: `${CAPTURAS}/proyecto.png` });
    await sinDesbordes(page);

    // Cambiar a español desde el editor: la barra se repinta
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Español' }).click();
    await expect(barra).toContainText('v4 · Borrador');
    await expect(barra.getByRole('button', { name: 'Guardar revisión' })).toBeVisible();
    await page.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'English' }).click();

    // La vista del invitado, en inglés en un navegador que lo tiene elegido
    const id = new URL(page.url()).searchParams.get('revision');
    const r = await page.request.fetch(`/api/invitados/revisiones/${id}/enlaces`, { method: 'POST', data: { destinatario: 'Client committee (fictitious)' }, headers: { origin: BASE } });
    expect(r.ok()).toBeTruthy();
    const { url } = await r.json();
    const contexto = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await contexto.addInitScript(() => localStorage.setItem('processiq.idioma', 'en'));
    const cliente = await contexto.newPage();
    await cliente.goto(url);
    const barraInvitado = cliente.locator('.invitados-barra');
    await expect(barraInvitado).toContainText('Read-only · shared with Client committee (fictitious)');
    await expect(barraInvitado.getByRole('button', { name: 'Process sheet' })).toBeVisible();
    await expect(cliente.locator('#invitadosPanel')).toContainText('You have not left any comments on this version yet.');
    await cliente.getByLabel('Your name').fill('Committee');
    await cliente.getByLabel('Comment', { exact: true }).fill('Please review the deadlines.');
    await cliente.getByRole('button', { name: 'Send comment' }).click();
    await expect(cliente.locator('#invitadosPanel')).toContainText('Comment sent.');
    await cliente.screenshot({ path: `${CAPTURAS}/invitado.png` });
    // Español desde el selector de la cabecera
    await cliente.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Español' }).click();
    await expect(barraInvitado).toContainText('Solo lectura · compartida con Client committee (fictitious)');
    await expect(cliente.getByRole('button', { name: 'Enviar comentario' })).toBeVisible();
    await contexto.close();
  });
});
