// Flujos de la plataforma de punta a punta: shell de proyectos + editor + API + Postgres.
import { expect, test } from '@playwright/test';
import { CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());

async function entrar(page, usuario, clave = CLAVE) {
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo(usuario));
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Fila de la versión vN en la tabla de revisiones. */
const fila = (page, n) => page.locator('tbody tr').filter({ has: page.locator('td:first-child strong', { hasText: new RegExp(`^v${n}$`) }) });

async function irAlProceso(page, proceso = 'Gestión de siniestros') {
  await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await page.getByRole('link', { name: proceso, exact: true }).click();
  await expect(page.getByRole('heading', { name: proceso, level: 1 })).toBeVisible();
}

const barra = (page) => page.locator('.piq-proyecto');

async function guardarRevision(page, mensaje) {
  await barra(page).getByRole('button', { name: 'Guardar revisión' }).click();
  const dialogo = page.locator('dialog.piq-dialogo');
  await dialogo.getByRole('textbox').fill(mensaje);
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click();
}

test('sin sesión lleva a «Entrar»; credenciales incorrectas; al entrar vuelve a donde iba', async ({ page }) => {
  await page.goto('/proyectos/');
  await expect(page).toHaveURL(/\/proyectos\/entrar\?volver=/);
  await page.getByLabel('Correo').fill(correo('editor'));
  await page.getByLabel('Contraseña').fill('no-es-la-clave-1');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/proyectos\/$/);
  await expect(page.getByRole('link', { name: /Siniestros — Seguros Andinos/ })).toBeVisible();
  // El archivado no aparece por defecto (el editor no es miembro de él)
  await expect(page.getByText('Proyecto archivado (prueba)')).toHaveCount(0);
});

test('con contraseña temporal hay que cambiarla antes de seguir', async ({ page }) => {
  await entrar(page, 'nuevo');
  await expect(page).toHaveURL(/\/proyectos\/clave/);
  await expect(page.getByText('Estás usando una contraseña temporal')).toBeVisible();
  await page.goto('/proyectos/');
  await expect(page).toHaveURL(/\/proyectos\/clave/);   // no deja pasar
  await page.getByLabel('Contraseña temporal').fill(CLAVE);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill('Otra-clave-segura-2026');
  await page.getByLabel('Repite la contraseña nueva').fill('Otra-clave-segura-2026');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
  await expect(page.getByText('Todavía no hay proyectos')).toBeVisible();
});

test('el editor abre la última versión, guarda una revisión nueva y el proyecto la muestra', async ({ page }) => {
  await entrar(page, 'editor');
  await irAlProceso(page);
  await expect(fila(page, 3)).toContainText('Borrador');
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();

  await expect(page).toHaveURL(/\/\?proceso=/);
  await expect(barra(page)).toContainText('Gestión de siniestros');
  await expect(barra(page)).toContainText('v3 · Borrador');
  expect(await page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(18);
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeHidden();

  await page.locator('#processName').fill('Gestión de siniestros (ajustado)');
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeVisible();
  await guardarRevision(page, 'Nombre ajustado tras la entrevista');
  await expect(page.locator('.piq-proyecto-aviso')).toContainText('Guardada como v4');
  await expect(barra(page)).toContainText('v4 · Borrador');
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeHidden();
  await expect(page).toHaveURL(/\/\?revision=/);
  // El trabajo del editor libre (processiq.v1) no se tocó
  expect(await page.evaluate(() => localStorage.getItem('processiq.v1'))).toBeNull();

  await barra(page).getByRole('link', { name: 'Volver al proyecto' }).click();
  await expect(fila(page, 4)).toContainText('Nombre ajustado tras la entrevista');
  await expect(fila(page, 4)).toContainText('Editor de Prueba');

  // Al volver a abrirla, trae lo guardado
  await fila(page, 4).getByRole('link', { name: 'Abrir' }).click();
  await expect(page.locator('#processName')).toHaveValue('Gestión de siniestros (ajustado)');
  expect(await page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(18);
});

test('guardar sobre una versión que ya no es la última avisa del conflicto', async ({ page }) => {
  await entrar(page, 'editor');
  await irAlProceso(page);
  await fila(page, 2).getByRole('link', { name: 'Abrir' }).click();
  await expect(barra(page)).toContainText('v2 · En revisión');
  await expect(barra(page)).toContainText('la última es la v3');

  await page.locator('#processName').fill('Rama desde la v2');
  await barra(page).getByRole('button', { name: 'Guardar revisión' }).click();
  const dialogo = page.locator('dialog.piq-dialogo');
  await expect(dialogo).toContainText('Estás trabajando sobre la v2, pero la última es la v3');
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('.piq-proyecto-aviso')).toContainText('alguien guardó la v3');

  await barra(page).getByRole('link', { name: 'Volver al proyecto' }).click();
  await expect(fila(page, 4)).toContainText('a partir de v2');
});

test('el revisor aprueba; el editor no puede aprobar; el lector solo consulta', async ({ page, browser }) => {
  await entrar(page, 'revisor');
  await irAlProceso(page);
  await expect(fila(page, 2)).toContainText('En revisión');
  await fila(page, 2).getByRole('button', { name: 'Aprobar' }).click();
  await expect(fila(page, 2)).toContainText('Aprobada');
  await expect(fila(page, 3).getByRole('button', { name: 'Enviar a revisión' })).toHaveCount(0);

  const editor = await (await browser.newContext()).newPage();
  await entrar(editor, 'editor');
  await irAlProceso(editor);
  await expect(fila(editor, 3).getByRole('button', { name: 'Enviar a revisión' })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Aprobar' })).toHaveCount(0);

  const lector = await (await browser.newContext()).newPage();
  await entrar(lector, 'lector');
  await irAlProceso(lector);
  await expect(lector.getByRole('button', { name: /Aprobar|Enviar a revisión|Renombrar/ })).toHaveCount(0);
  await lector.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(barra(lector)).toContainText('solo lectura');
  await expect(barra(lector).getByRole('button', { name: 'Guardar revisión' })).toBeHidden();
  await expect(lector.locator('.piq-proyecto-aviso')).toContainText('no permite guardar revisiones');
});

test('los cambios sin guardar sobreviven a una recarga y se pueden recuperar o descartar', async ({ page }) => {
  page.on('dialog', (d) => d.accept());   // aviso nativo de «salir con cambios sin guardar»
  await entrar(page, 'editor');
  await irAlProceso(page);
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(barra(page)).toContainText('v3');
  await page.locator('#processName').fill('Cambio que no se guardó');
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeVisible();

  await page.reload();
  const dialogo = page.locator('dialog.piq-dialogo');
  await expect(dialogo).toContainText('Tienes cambios sin guardar');
  await dialogo.getByRole('button', { name: 'Recuperar mis cambios' }).click();
  await expect(page.locator('#processName')).toHaveValue('Cambio que no se guardó');
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeVisible();

  await page.reload();
  await page.locator('dialog.piq-dialogo').getByRole('button', { name: 'Descartarlos' }).click();
  await expect(page.locator('#processName')).toHaveValue('Gestión de Siniestros de Seguros');
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeHidden();
});

test('el administrador crea una cuenta y la persona entra con la contraseña temporal', async ({ page }) => {
  await entrar(page, 'admin');
  await page.getByRole('navigation', { name: 'Secciones' }).getByText('Administración').click();
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Usuarios' }).click();
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  await page.getByLabel('Nombre y apellido').fill('Persona Nueva');
  await page.getByLabel('Correo').fill('persona.nueva@processiq.test');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  const temporal = (await page.locator('.clave-temporal-valor code').textContent())?.trim();
  expect(temporal).toMatch(/^\S{14}$/);
  await page.getByRole('button', { name: 'Hecho' }).click();
  await expect(page.getByRole('row', { name: /persona\.nueva@processiq\.test/ })).toContainText('Contraseña temporal');

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/proyectos\/entrar/);
  await entrar(page, 'persona.nueva', temporal);
  await expect(page).toHaveURL(/\/proyectos\/clave/);
});

test('un proyecto archivado se consulta pero no admite cambios', async ({ page }) => {
  await entrar(page, 'propietario');
  await page.getByLabel(/Mostrar archivados/).check();
  await page.getByRole('link', { name: /Proyecto archivado \(prueba\)/ }).click();
  await expect(page.getByText('Proyecto archivado: se puede consultar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo proceso' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.getByRole('button', { name: 'Reactivar proyecto' })).toBeVisible();
});

test('el editor sin proyecto sigue igual: sin barra, sin llamadas a la API y con el trabajo en processiq.v1', async ({ page }) => {
  const llamadas = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/')) llamadas.push(r.url()); });
  await page.goto('/');
  await page.waitForFunction(() => !!window.ProcessIQ);
  await page.evaluate(() => window.ProcessIQ.loadDemo());
  await expect(page.locator('.piq-proyecto')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('processiq.v1') || '{}').nodes?.length)).toBeGreaterThan(0);
  expect(llamadas).toEqual([]);
});
