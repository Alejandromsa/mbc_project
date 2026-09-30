// Colaboración (ADR 21): la página del proceso muestra qué versión tiene abierta
// cada persona en el editor y avisa si ya no es la última; los cambios de estado
// de una revisión (enviar a revisión, aprobar) llegan al momento por el SSE, sin
// esperar al sondeo de 5 s. Capturas en español e inglés.
import { expect, test } from '@playwright/test';
import { BASE, CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());

async function entrar(page, usuario) {
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo(usuario));
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
}

async function irAlProceso(page, proceso = 'Gestión de siniestros') {
  await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await page.getByRole('link', { name: proceso, exact: true }).click();
  await expect(page.getByRole('heading', { name: proceso, level: 1 })).toBeVisible();
}

/** Llamada a la API con la sesión de la página (las escrituras exigen el Origin de la web). */
async function api(request, metodo, ruta, datos) {
  const r = await request.fetch(`/api${ruta}`, { method: metodo, data: datos, headers: { origin: BASE } });
  expect(r.ok(), `${metodo} ${ruta} -> ${r.status()}`).toBeTruthy();
  return r.json();
}

const fila = (page, n) => page.locator('tbody tr').filter({ has: page.locator('td:first-child strong', { hasText: new RegExp(`^v${n}$`) }) });
const quienesEnElShell = (page) => page.getByText(/^(Ahora lo tienen? abierto|Currently open by):/);
const barra = (page) => page.locator('.piq-proyecto');
const aviso = (page) => page.locator('.piq-proyecto-aviso');
/** Por debajo del sondeo de respaldo del SSE (5 s): si llega antes, fue el NOTIFY. */
const AL_MOMENTO = { timeout: 3000 };

test('el shell ve qué versión tiene abierta cada uno, «versión anterior» y los cambios de estado al momento', async ({ page, browser }) => {
  // B: la propietaria mira la página del proceso
  const contextoB = await browser.newContext();
  const shellB = await contextoB.newPage();
  await entrar(shellB, 'propietario');
  await irAlProceso(shellB);
  const procesoId = new URL(shellB.url()).pathname.split('/').pop();
  const { revisiones } = await api(shellB.request, 'GET', `/procesos/${procesoId}`);
  const v2 = revisiones.find((r) => r.numero === 2);

  // A: el editor abre la última versión (v3) en el editor
  await entrar(page, 'editor');
  await irAlProceso(page);
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(barra(page)).toContainText('v3 · Borrador');
  await expect(quienesEnElShell(shellB)).toContainText('EP · Editor de Prueba (v3)');
  await expect(quienesEnElShell(shellB)).not.toContainText('versión anterior');
  await expect(shellB.getByTitle('Editor de Prueba: viendo en el editor (v3)')).toBeVisible();

  // La propietaria guarda la v4 (por la API): la v3 de A pasa a «versión anterior», al momento
  const { revision: v3 } = await api(shellB.request, 'GET', `/revisiones/${revisiones[0].id}`);
  const { revision: v4 } = await api(shellB.request, 'POST', `/procesos/${procesoId}/revisiones`, {
    contenido: v3.contenido, mensaje: 'Versión de la propietaria', padreId: v3.id
  });
  await expect(fila(shellB, 4)).toContainText('Versión de la propietaria', AL_MOMENTO);
  await expect(quienesEnElShell(shellB)).toContainText('EP · Editor de Prueba (v3, versión anterior)', AL_MOMENTO);
  await expect(barra(page)).toContainText('la última es la v4');   // el editor de A, como siempre
  await shellB.screenshot({ path: 'resultados/colaboracion-version-anterior.png' });

  // A carga la nueva versión: vuelve a tener la última
  await aviso(page).getByRole('button', { name: 'Cargar la nueva versión' }).click();
  await expect(barra(page)).toContainText('v4 · Borrador');
  await expect(quienesEnElShell(shellB)).toContainText('EP · Editor de Prueba (v4)');
  await expect(quienesEnElShell(shellB)).not.toContainText('versión anterior');
  // …y empieza a editar
  await page.locator('#processName').fill('Gestión de siniestros (sobre la v4)');
  await expect(quienesEnElShell(shellB)).toContainText('EP · Editor de Prueba, editando (v4)');

  // R: el revisor abre la v2 en el editor
  const contextoR = await browser.newContext();
  const revisor = await contextoR.newPage();
  await entrar(revisor, 'revisor');
  await revisor.goto(`/?revision=${v2.id}`);
  await expect(barra(revisor)).toContainText('v2 · En revisión');
  await expect(quienesEnElShell(shellB)).toContainText('RP · Revisor de Prueba (v2, versión anterior)');

  // Cambios de estado hechos por otros: la tabla de B cambia sin esperar al sondeo
  await api(page.request, 'POST', `/revisiones/${v4.id}/estado`, { estado: 'en_revision' });
  await expect(fila(shellB, 4)).toContainText('En revisión', AL_MOMENTO);
  await api(revisor.request, 'POST', `/revisiones/${v2.id}/estado`, { estado: 'aprobada' });   // una que no es la última
  await expect(fila(shellB, 2)).toContainText('Aprobada', AL_MOMENTO);
  await shellB.screenshot({ path: 'resultados/colaboracion-estado-al-momento.png' });

  // En inglés
  await shellB.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'English' }).click();
  await expect(quienesEnElShell(shellB)).toContainText('EP · Editor de Prueba, editing (v4)');
  await expect(quienesEnElShell(shellB)).toContainText('RP · Revisor de Prueba (v2, older version)');
  await expect(fila(shellB, 4)).toContainText('In review');
  await shellB.screenshot({ path: 'resultados/colaboracion-version-anterior-en.png' });
  await shellB.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Español' }).click();
  await contextoR.close();
  await contextoB.close();
});
