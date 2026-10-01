// IA en el servidor de punta a punta: editor en modo proyecto + API + worker +
// Anthropic falso (src/anthropic-falso.mjs).
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { BASE, CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());

async function entrar(page, usuario) {
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo(usuario));
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
}

async function irAlProceso(page, proceso) {
  await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await page.getByRole('link', { name: proceso, exact: true }).click();
  await expect(page.getByRole('heading', { name: proceso, level: 1 })).toBeVisible();
}

const barra = (page) => page.locator('.piq-proyecto');
const fila = (page, n) => page.locator('tbody tr').filter({ has: page.locator('td:first-child strong', { hasText: new RegExp(`^v${n}$`) }) });
const nodos = (page) => page.evaluate(() => window.ProcessIQ.snapshot().nodes);

test('la IA del servidor genera el proceso desde el editor y queda guardado como revisión', async ({ page }) => {
  await entrar(page, 'editor');
  await irAlProceso(page, 'Proceso sin revisiones');
  await page.getByRole('link', { name: 'Empezar a dibujarlo en el editor' }).click();
  await expect(barra(page)).toContainText('sin revisiones todavía');
  expect(await page.evaluate(() => window.ProcessIQ.aiReady())).toBe(true);

  await page.locator('#btnIngest').click();
  await expect(page.locator('#ingestAiMode')).toContainText('IA en el servidor');
  await page.evaluate(() => { document.querySelector('#ingestModal .ingest-more').open = true; });   // «pegar texto» está plegado
  await page.locator('#notesInput').fill('La mesa de ayuda recibe el reclamo del cliente, lo registra en el CRM y lo deriva al área responsable.');
  await page.locator('#btnIngestGo').click();
  await page.locator('#modalOk').click();   // nivel de detalle y modelo

  await expect(page.locator('.piq-proyecto-aviso')).toContainText('Proceso generado con IA y guardado como v1', { timeout: 30_000 });
  await expect(barra(page)).toContainText('v1 · Borrador');
  expect(await nodos(page)).toBe(3);
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeHidden();

  await barra(page).getByRole('link', { name: 'Volver al proyecto' }).click();
  await expect(fila(page, 1)).toContainText('Proceso generado con IA desde texto pegado');
});

test('si el servidor no permite el modelo elegido, usa otro y el editor lo avisa', async ({ page }) => {
  await entrar(page, 'editor');
  await irAlProceso(page, 'Proceso sin revisiones');
  const procesoId = new URL(page.url()).pathname.split('/').pop();
  await page.getByRole('link', { name: 'Empezar a dibujarlo en el editor' }).click();
  await expect(barra(page)).toContainText('sin revisiones todavía');

  // El diálogo solo ofrece Opus 5 y Sonnet 5, y este servidor permite los dos: la petición pide
  // Haiku 4.5, como si quien administra hubiera dejado fuera el modelo elegido.
  await page.route('**/api/ia/generaciones', (route) =>
    route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), modelo: 'claude-haiku-4-5' }) }));
  // El seguimiento (SSE) espera a que la prueba lo suelte: así se ven los avisos antes de que se guarde
  let soltar;
  const suelto = new Promise((r) => { soltar = r; });
  await page.route('**/api/ia/ejecuciones/*/eventos', async (route) => { await suelto; await route.continue(); });

  await page.locator('#btnIngest').click();
  await page.evaluate(() => { document.querySelector('#ingestModal .ingest-more').open = true; });
  await page.locator('#notesInput').fill('La mesa de ayuda recibe el reclamo del cliente, lo registra en el CRM y lo deriva al área responsable.');
  await page.locator('#btnIngestGo').click();
  await page.locator('#modalOk').click();   // nivel de detalle y modelo

  // Aviso de la barra (queda tras el diálogo de ingesta) y nota en el progreso, que es lo que se ve mientras genera
  await expect(page.locator('.piq-proyecto-aviso.piq-aviso-atencion'))
    .toContainText('El servidor de IA no permite Claude Haiku 4.5: esta generación usa Claude Opus 5.');
  await expect(page.locator('#ingestProgressText'))
    .toContainText('Claude Haiku 4.5 no está permitido en el servidor: se usa Claude Opus 5. En cola en el servidor de IA');
  await page.screenshot({ path: 'resultados/ia-modelo-sustituido.png' });
  // Captura del aviso de la barra, que el diálogo de ingesta tapa (solo para revisar su aspecto)
  const ingesta = page.locator('#ingestModal');
  await ingesta.evaluate((m) => { m.style.visibility = 'hidden'; });
  await page.locator('.piq-proyecto-aviso').screenshot({ path: 'resultados/ia-modelo-sustituido-aviso.png' });
  await ingesta.evaluate((m) => { m.style.visibility = ''; });
  soltar();

  await expect(page.locator('.piq-proyecto-aviso')).toContainText('Proceso generado con IA y guardado como v1', { timeout: 30_000 });
  expect(await nodos(page)).toBe(3);
  // El coste del copiloto nombra el modelo que se usó de verdad
  await expect(page.locator('#copilotMessages')).toContainText('precio de lista de Claude Opus 5');
  const { ejecuciones } = await (await page.request.get(`/api/ia/procesos/${procesoId}`)).json();
  expect(ejecuciones.map((e) => e.modelo)).toEqual(['claude-opus-5']);
});

test('una generación que terminó con la pestaña cerrada se ofrece al volver a abrir el proceso', async ({ page }) => {
  await entrar(page, 'editor');
  await irAlProceso(page, 'Proceso sin revisiones');
  const procesoId = new URL(page.url()).pathname.split('/').pop();
  // Lanzada desde una pestaña que se cerró: directamente por la API
  const r = await page.request.post('/api/ia/generaciones', {
    headers: { origin: BASE },
    data: { procesoId, texto: 'La mesa de ayuda registra el reclamo en el CRM.', etiqueta: 'minuta.docx', vista: 3 }
  });
  expect(r.status()).toBe(202);
  const id = (await r.json()).ejecucion.id;
  await expect.poll(async () => (await (await page.request.get(`/api/ia/ejecuciones/${id}`)).json()).ejecucion.estado, { timeout: 30_000 })
    .toBe('completada');

  await page.getByRole('link', { name: 'Empezar a dibujarlo en el editor' }).click();
  const dialogo = page.locator('dialog.piq-dialogo');
  await expect(dialogo).toContainText('Hay un proceso generado con IA sin guardar');
  await expect(dialogo).toContainText('minuta.docx');
  await dialogo.getByRole('button', { name: 'Dibujarlo y guardarlo' }).click();
  await expect(barra(page)).toContainText('v1 · Borrador');
  expect(await nodos(page)).toBe(3);

  // Ya enlazada a la revisión: no se vuelve a ofrecer
  await page.reload();
  await expect(barra(page)).toContainText('v1');
  await expect(page.locator('dialog.piq-dialogo')).toHaveCount(0);
});

test('el copiloto y el análisis de dolores van al servidor; el administrador ve el consumo', async ({ page, browser }) => {
  await entrar(page, 'editor');
  await irAlProceso(page, 'Gestión de siniestros');
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(barra(page)).toContainText('v3');

  await page.evaluate(() => window.ProcessIQ.runAiTask('suggest-kpis'));
  await expect(page.locator('#copilotMessages')).toContainText('Análisis del servidor', { timeout: 30_000 });
  await page.evaluate(() => window.ProcessIQ.aiAnalyzePains());
  await expect(page.locator('#copilotMessages')).toContainText('Fraude en reclamos', { timeout: 30_000 });

  const admin = await (await browser.newContext()).newPage();
  await entrar(admin, 'admin');
  await admin.getByRole('navigation', { name: 'Secciones' }).getByText('Administración').click();
  await admin.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'IA' }).click();
  await expect(admin.getByRole('heading', { name: 'Consumo de IA' })).toBeVisible();
  const ultimas = admin.getByRole('table').last();   // «Últimas ejecuciones» (la primera es «Por persona»)
  await expect(ultimas).toContainText('Sugerir KPIs aplicables');
  await expect(ultimas).toContainText('Análisis de dolores');
  await expect(admin.getByRole('table').first().getByRole('row', { name: /editor@processiq\.test/ })).toContainText('US$');
});

// Lo que contesta el Anthropic falso a las matrices (src/anthropic-falso.mjs)
const ROL_E2E = 'Auditoría interna';
const SIPOC_E2E = {
  suppliers: 'Asegurado, Taller afiliado', inputs: 'Denuncia del siniestro, Póliza vigente',
  process: 'Registrar, Peritar, Liquidar, Pagar', outputs: 'Indemnización pagada', customers: 'Asegurado, Reaseguros'
};

async function laminasPptx(page) {
  const [descarga] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    page.evaluate(() => document.querySelector('button[data-export="pptx"][data-tema="mbc"]').click())
  ]);
  const zip = await JSZip.loadAsync(await readFile(await descarga.path()));
  const nombres = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  return Promise.all(nombres.map((f) => zip.file(f).async('string')));
}

test('la RACI y el SIPOC con la IA del servidor llegan como matrices editables y van al PPTX (D12)', async ({ page, browser }) => {
  test.setTimeout(150_000);
  await entrar(page, 'editor');
  await irAlProceso(page, 'Gestión de siniestros');
  const procesoId = new URL(page.url()).pathname.split('/').pop();
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(barra(page)).toContainText('v3');
  const actividades = await page.evaluate(() => window.ProcessIQ.snapshot().tasks + window.ProcessIQ.snapshot().decisions);

  // RACI: el botón del copiloto, como lo usa el consultor
  await page.locator('.tab[data-tab="copilot"]').click();
  await page.getByRole('button', { name: 'Generar matriz RACI' }).click();
  await expect(page.locator('#modal')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#modalTitle')).toHaveText(/^Matriz RACI · /);
  await expect(page.locator('#modalOk')).toHaveText('Guardar cambios');
  // Rellena: una fila por actividad, cada una con su R/A y la auditoría interna informada
  const tabla = page.locator('#modalBody table.raci-table');
  await expect(tabla.locator('thead th').last()).toHaveText(ROL_E2E);
  await expect(tabla.locator('tbody tr')).toHaveCount(actividades);
  const celdas = await page.evaluate(() => Array.from(document.querySelectorAll('.raci-pick')).map((s) => [s.dataset.role, s.value]));
  expect(celdas.filter(([, v]) => v === 'R/A')).toHaveLength(actividades);
  expect(celdas.filter(([r, v]) => r === 'Auditoría interna' && v === 'I')).toHaveLength(actividades);
  expect(celdas.filter(([, v]) => v !== '' && v !== 'R/A' && v !== 'I')).toEqual([]);
  await expect(page.locator('#copilotMessages')).toContainText(`Matriz RACI propuesta por la IA con ${actividades} actividades`);
  await page.screenshot({ path: 'resultados/ia-matriz-raci.png' });
  // El final de la tabla: la columna de la auditoría y la pista del diálogo
  await page.evaluate(() => document.querySelectorAll('#modalBody, #modalBody *').forEach((el) => { el.scrollLeft = el.scrollWidth; el.scrollTop = el.scrollHeight; }));
  await expect(page.locator('#modalBody .panel-hint')).toContainText('Propuesta de la IA');
  await page.screenshot({ path: 'resultados/ia-matriz-raci-final.png' });
  // Se edita como la de siempre: la primera fila pasa a consultar a la auditoría
  await tabla.locator('.raci-pick[data-role="Auditoría interna"]').first().selectOption('C');
  await page.locator('#modalOk').click();
  await expect(page.locator('#copilotMessages')).toContainText('Matriz RACI guardada con');

  // SIPOC
  await page.getByRole('button', { name: 'Generar SIPOC' }).click();
  await expect(page.locator('#modal')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#modalTitle')).toHaveText(/^SIPOC · /);
  for (const [columna, valor] of Object.entries(SIPOC_E2E)) await expect(page.locator(`[data-sipoc="${columna}"]`)).toHaveValue(valor);
  await page.screenshot({ path: 'resultados/ia-matriz-sipoc.png' });
  await page.locator('#modalOk').click();
  await expect(page.locator('#copilotMessages')).toContainText('SIPOC guardado.');
  await page.locator('#copilotMessages').screenshot({ path: 'resultados/ia-matriz-copiloto.png' });

  // Las pidió el editor al servidor (tareas de la cola) y el proceso queda con cambios por guardar
  const { ejecuciones } = await (await page.request.get(`/api/ia/procesos/${procesoId}`)).json();
  const matrices = ejecuciones.filter((e) => e.tipo === 'tarea').map((e) => `${e.tarea} ${e.estado}`).sort();
  expect(matrices).toEqual(['matriz-raci completada', 'matriz-sipoc completada']);
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeVisible();

  // El PPTX lleva las dos láminas con lo que dijo la IA (y el cambio de la primera fila)
  const laminas = await laminasPptx(page);
  const raci = laminas.find((xml) => xml.includes('>Matriz RACI<'));
  expect(raci, 'lámina RACI').toBeTruthy();
  expect(raci).toContain(`>${ROL_E2E}<`);
  expect(raci.split('>R/A<').length - 1).toBeGreaterThanOrEqual(Math.min(actividades, 14));   // la lámina lleva hasta 14 filas
  expect(raci).toContain('>C<');
  const sipoc = laminas.find((xml) => xml.includes('>SIPOC — alcance del proceso<'));
  expect(sipoc, 'lámina SIPOC').toBeTruthy();
  for (const v of Object.values(SIPOC_E2E)) expect(sipoc).toContain(v);

  // «Consumo de IA» las nombra como su tarea del copiloto, no por su tipo interno
  const admin = await (await browser.newContext()).newPage();
  await entrar(admin, 'admin');
  await admin.getByRole('navigation', { name: 'Secciones' }).getByText('Administración').click();
  await admin.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'IA' }).click();
  const ultimas = admin.getByRole('table').last();
  await expect(ultimas).toContainText('Matriz RACI');
  await expect(ultimas).toContainText('SIPOC');
  await expect(ultimas).not.toContainText('matriz-');
  await ultimas.screenshot({ path: 'resultados/ia-matrices-consumo.png' });
});

test('quien solo lee no usa la IA del servidor', async ({ page }) => {
  await entrar(page, 'lector');
  await irAlProceso(page, 'Gestión de siniestros');
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(barra(page)).toContainText('solo lectura');
  expect(await page.evaluate(() => window.ProcessIQ.aiReady())).toBe(false);
  await page.evaluate(() => window.ProcessIQ.aiAnalyzePains());
  await expect(page.locator('.piq-proyecto-aviso')).toContainText('no permiten usar la IA');
});
