// Colaboración en tiempo real (ADR 21) de punta a punta, con dos navegadores:
// cada uno ve al otro en la barra del editor y se marca quién edita; cuando uno
// guarda, el otro recibe el aviso al momento y carga la versión nueva (o sigue con
// la suya); la página del proceso del shell muestra quién lo tiene abierto y
// actualiza sola su lista de revisiones.
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

/** Fila de la versión vN en la tabla de revisiones. */
const fila = (page, n) => page.locator('tbody tr').filter({ has: page.locator('td:first-child strong', { hasText: new RegExp(`^v${n}$`) }) });
const barra = (page) => page.locator('.piq-proyecto');
const aviso = (page) => page.locator('.piq-proyecto-aviso');
const avatares = (page) => barra(page).locator('.piq-avatar');
const editando = (page) => barra(page).locator('.piq-presencia-editando');
const quienesEnElShell = (page) => page.getByText(/^Ahora lo tienen? abierto:/);

async function abrirEnElEditor(page) {
  await page.getByRole('link', { name: 'Abrir la última versión en el editor' }).click();
  await expect(barra(page)).toContainText('v3 · Borrador');
}

async function guardarRevision(page, mensaje) {
  await barra(page).getByRole('button', { name: 'Guardar revisión' }).click();
  const dialogo = page.locator('dialog.piq-dialogo');
  await dialogo.getByRole('textbox').fill(mensaje);
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click();
}

test('dos navegadores se ven, saben quién edita y, cuando uno guarda, el otro carga la versión nueva; el shell se actualiza solo', async ({ page, browser }) => {
  // Navegador B: la propietaria, con la página del proceso en una pestaña y (luego) el editor en otra
  const contextoB = await browser.newContext();
  const shellB = await contextoB.newPage();
  await entrar(shellB, 'propietario');
  await irAlProceso(shellB);
  await expect(quienesEnElShell(shellB)).toHaveCount(0);   // nadie más

  // Navegador A: el editor llega a la página del proceso y lo abre en el editor
  await entrar(page, 'editor');
  await irAlProceso(page);
  await expect(quienesEnElShell(shellB)).toContainText('EP · Editor de Prueba');
  await expect(quienesEnElShell(page)).toContainText('PP · Propietario de Prueba');
  await abrirEnElEditor(page);
  await expect(shellB.getByTitle('Editor de Prueba: viendo en el editor')).toBeVisible();
  const editorB = await contextoB.newPage();
  await editorB.goto(page.url());
  await expect(barra(editorB)).toContainText('v3 · Borrador');

  // Cada uno ve al otro, no a sí mismo; la propietaria cuenta una vez aunque tenga dos pestañas
  await expect(avatares(page)).toHaveText(['PP']);
  await expect(avatares(page)).toHaveAttribute('title', 'Propietario de Prueba: viendo en el editor y en la página del proceso');
  await expect(avatares(editorB)).toHaveText(['EP']);
  await expect(editando(page)).toHaveCount(0);

  // A empieza a editar: B lo ve en la barra del editor y en la página del proceso
  await page.locator('#processName').fill('Gestión de siniestros (versión de A)');
  await expect(barra(page).locator('.piq-proyecto-cambios')).toBeVisible();
  await expect(editando(editorB)).toHaveText('Editor está editando');
  await expect(avatares(editorB)).toHaveClass(/piq-avatar-editando/);
  await expect(quienesEnElShell(shellB)).toContainText('EP · Editor de Prueba, editando');
  await editorB.screenshot({ path: 'resultados/colaboracion-otro-editando.png' });
  await shellB.screenshot({ path: 'resultados/colaboracion-shell-presencia.png' });

  // B también edita: aviso suave en los dos, sin bloquear nada
  await editorB.locator('#processName').fill('Gestión de siniestros (versión de B)');
  await expect(editando(page)).toHaveText('Propietario también está editando');
  await expect(editando(editorB)).toHaveText('Editor también está editando');
  await expect(barra(page).getByRole('button', { name: 'Guardar revisión' })).toBeEnabled();
  await page.screenshot({ path: 'resultados/colaboracion-ambos-editando.png' });

  // A guarda: B recibe el aviso al momento, con sus cambios en riesgo
  await guardarRevision(page, 'Ajuste desde el navegador A');
  await expect(aviso(page)).toContainText('Guardada como v4');
  await expect(aviso(editorB)).toHaveClass(/piq-aviso-atencion/);
  await expect(aviso(editorB)).toContainText('Editor de Prueba guardó la v4: «Ajuste desde el navegador A». Tienes cambios sin guardar sobre la v3: si cargas la nueva versión, se perderán.');
  await expect(barra(editorB)).toContainText('v3 · Borrador · la última es la v4');
  await expect(editando(editorB)).toHaveCount(0);   // A ya no tiene cambios sin guardar
  await editorB.screenshot({ path: 'resultados/colaboracion-aviso-revision.png' });

  // La página del proceso de B se actualizó sola
  await expect(fila(shellB, 4)).toContainText('Ajuste desde el navegador A');
  await expect(fila(shellB, 4)).toContainText('Editor de Prueba');
  await expect(quienesEnElShell(shellB)).toContainText('EP · Editor de Prueba');
  await expect(quienesEnElShell(shellB)).not.toContainText('editando');
  await shellB.screenshot({ path: 'resultados/colaboracion-shell-revision-nueva.png' });

  // B carga la nueva versión: como tiene cambios, se le pregunta antes
  await aviso(editorB).getByRole('button', { name: 'Cargar la nueva versión' }).click();
  const dialogo = editorB.locator('dialog.piq-dialogo');
  await expect(dialogo).toContainText('Si cargas la v4, se perderán los cambios que hiciste sobre la v3.');
  await editorB.screenshot({ path: 'resultados/colaboracion-cargar-con-cambios.png' });
  await dialogo.getByRole('button', { name: 'Cargar la v4 y descartar mis cambios' }).click();
  await expect(editorB).toHaveURL(/\/\?revision=/);
  await expect(barra(editorB)).toContainText('v4 · Borrador');
  await expect(editorB.locator('#processName')).toHaveValue('Gestión de siniestros (versión de A)');
  await expect(barra(editorB).locator('.piq-proyecto-cambios')).toBeHidden();
  await expect(editorB.locator('dialog.piq-dialogo')).toHaveCount(0);   // no ofrece recuperar lo que descartó
  await expect(avatares(editorB)).toHaveText(['EP']);
  await expect(avatares(page)).toHaveText(['PP']);

  // Al irse B (las dos pestañas), desaparece para A sin esperar a que caduque
  await shellB.goto('/proyectos/');
  await editorB.goto('/proyectos/');
  await expect(avatares(page)).toHaveCount(0);
  await contextoB.close();
});

test('«Seguir con la mía» deja guardar con el conflicto marcado; sin cambios propios, «Cargar la nueva versión» no pregunta', async ({ page, browser }) => {
  await entrar(page, 'editor');
  await irAlProceso(page);
  await abrirEnElEditor(page);
  const contextoB = await browser.newContext();
  const editorB = await contextoB.newPage();
  await entrar(editorB, 'propietario');
  await irAlProceso(editorB);
  await abrirEnElEditor(editorB);
  await expect(avatares(page)).toHaveText(['PP']);

  // A guarda; B no tenía cambios
  await page.locator('#processName').fill('Primera de A');
  await guardarRevision(page, 'Primera de A');
  await expect(aviso(editorB)).toHaveClass(/piq-aviso-info/);
  await expect(aviso(editorB)).toHaveText(/^Editor de Prueba guardó la v4: «Primera de A»\.Cargar la nueva versiónSeguir con la mía/);
  await aviso(editorB).getByRole('button', { name: 'Seguir con la mía' }).click();
  await expect(aviso(editorB)).toBeHidden();
  await expect(barra(editorB)).toContainText('v3 · Borrador · la última es la v4');

  // B guarda sobre la v3: el diálogo lo advierte y la API marca el conflicto; su propia v5 no le avisa
  await editorB.locator('#processName').fill('Rama de B');
  await barra(editorB).getByRole('button', { name: 'Guardar revisión' }).click();
  const dialogo = editorB.locator('dialog.piq-dialogo');
  await expect(dialogo).toContainText('Estás trabajando sobre la v3, pero la última es la v4');
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(aviso(editorB)).toContainText('Guardada como v5. Mientras trabajabas, alguien guardó la v4');
  await expect(barra(editorB)).toContainText('v5 · Borrador');
  await expect(barra(editorB)).not.toContainText('la última es');

  // A recibe la v5 de B y, sin cambios propios, la carga sin diálogo
  await expect(aviso(page)).toContainText('Propietario de Prueba guardó la v5.');
  await aviso(page).getByRole('button', { name: 'Cargar la nueva versión' }).click();
  await expect(barra(page)).toContainText('v5 · Borrador');
  await expect(page.locator('#processName')).toHaveValue('Rama de B');
  await expect(aviso(editorB)).toContainText('Guardada como v5');   // B no recibió aviso de su propia versión
  await contextoB.close();
});

test('un lector aparece como «viendo» aunque cambie algo; la vista del invitado no da latidos ni abre el SSE', async ({ page, browser }) => {
  await entrar(page, 'editor');
  await irAlProceso(page);
  await abrirEnElEditor(page);
  const procesoId = new URL(page.url()).searchParams.get('proceso');

  const contextoL = await browser.newContext();
  const lector = await contextoL.newPage();
  await entrar(lector, 'lector');
  await irAlProceso(lector);
  await abrirEnElEditor(lector);
  await expect(barra(lector)).toContainText('solo lectura');
  await expect(avatares(page)).toHaveText(['LP']);
  await expect(avatares(lector)).toHaveText(['EP']);

  // El lector cambia algo que no podrá guardar: su latido sale como «editando» y la API lo deja en «viendo»
  const latido = lector.waitForResponse((r) => r.url().includes('/presencia') && r.request().method() === 'PUT' && r.request().postDataJSON().estado === 'editando');
  await lector.locator('#processName').fill('Cambio que no se guardará');
  expect((await (await latido).json()).estado).toBe('viendo');
  const { presencias } = await api(page.request, 'GET', `/procesos/${procesoId}/presencia`);
  expect(presencias.map((p) => [p.nombre, p.estado])).toEqual([['Editor de Prueba', 'viendo'], ['Lector de Prueba', 'viendo']]);
  await expect(editando(page)).toHaveCount(0);

  // Un enlace de invitado abierto por alguien con sesión: modo lectura, sin presencia
  const { revisiones } = await api(page.request, 'GET', `/procesos/${procesoId}`);
  const { url } = await api(page.request, 'POST', `/invitados/revisiones/${revisiones[0].id}/enlaces`, { destinatario: 'Gerencia de prueba (ficticia)' });
  const invitado = await contextoL.newPage();
  const llamadas = [];
  invitado.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/')) llamadas.push(`${r.method()} ${p}`); });
  await invitado.goto(url);
  await expect(invitado.locator('.invitados-barra')).toContainText('Gestión de siniestros');
  await invitado.waitForTimeout(1500);
  expect(llamadas.length).toBeGreaterThan(0);
  expect(llamadas.filter((l) => /\/(presencia|eventos)/.test(l))).toEqual([]);
  await expect(avatares(page)).toHaveText(['LP']);   // solo la pestaña del editor del lector
  await contextoL.close();
});
