// Invitados de punta a punta: un editor comparte una versión con el cliente; un
// navegador SIN sesión abre el enlace, ve el diagrama y la ficha y comenta (en
// general y sobre un paso); el editor ve los comentarios y los resuelve; al
// revocarlo, el enlace deja de funcionar. El trabajo del editor libre de ese
// navegador no se toca.
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

const seccion = (page) => page.getByRole('region', { name: 'Revisión con el cliente' });
const nodos = (page) => page.locator('#nodesLayer > g.node-group');
/** Índice del nodo cuyo texto contiene la etiqueta (las etiquetas largas se parten en varias líneas). */
const indiceDe = (page, etiqueta) => page.evaluate((e) => [...document.querySelectorAll('#nodesLayer > g.node-group')]
  .findIndex((g) => g.textContent.replace(/\s+/g, '').includes(e.replace(/\s+/g, ''))), etiqueta);

test('el editor comparte una versión, el cliente la comenta sin cuenta y el editor lo resuelve; revocado, deja de funcionar', async ({ page, browser }) => {
  await entrar(page, 'editor');
  await irAlProceso(page);
  await expect(seccion(page).getByText('Todavía no se ha compartido ninguna versión de este proceso.')).toBeVisible();

  // Compartir la v2 (en revisión) con caducidad de 7 días
  await seccion(page).getByRole('button', { name: 'Compartir con el cliente' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Compartir con el cliente' });
  await dialogo.getByLabel('Versión que verá').selectOption({ index: 1 });
  await dialogo.getByLabel('Para quién es').fill('Gerencia de Siniestros (ficticia)');
  await dialogo.getByLabel('Días hasta que caduque').fill('7');
  await dialogo.screenshot({ path: 'resultados/invitados-dialogo.png' });
  await dialogo.getByRole('button', { name: 'Crear enlace' }).click();
  const enlace = dialogo.getByLabel('Enlace para el cliente');
  await expect(enlace).toBeVisible();
  const url = (await enlace.textContent()).trim();
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?invitado=[A-Za-z0-9_-]{43}$/);
  await expect(dialogo).toContainText('Solo se muestra ahora');
  await dialogo.screenshot({ path: 'resultados/invitados-enlace-creado.png' });
  await dialogo.getByRole('button', { name: 'Hecho' }).click();
  const filaEnlace = seccion(page).getByRole('row', { name: /Gerencia de Siniestros/ });
  await expect(filaEnlace).toContainText('Activo');
  await expect(filaEnlace).toContainText('Sin abrir');
  await expect(seccion(page).getByRole('heading', { name: 'v2', level: 3 })).toBeVisible();

  // El cliente: otro navegador, sin sesión y con su propio trabajo en el editor libre
  const contexto = await browser.newContext();
  const cliente = await contexto.newPage();
  await cliente.goto('/');
  await cliente.waitForFunction(() => !!window.ProcessIQ);
  await expect(cliente.locator('html')).not.toHaveClass(/invitados-modo/);
  await expect(cliente.locator('.invitados-barra')).toHaveCount(0);
  await cliente.evaluate(() => { window.ProcessIQ.loadDemo(); localStorage.setItem('processiq.ui', JSON.stringify({ panelOpen: true, tab: 'kpis' })); });
  const antes = await cliente.evaluate(() => ({ v1: localStorage.getItem('processiq.v1'), ui: localStorage.getItem('processiq.ui') }));
  expect(JSON.parse(antes.v1).nodes.length).toBeGreaterThan(0);

  const llamadas = [];
  cliente.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/')) llamadas.push(`${r.method()} ${p}`); });
  const avisosDelNavegador = [];
  cliente.on('dialog', (d) => { avisosDelNavegador.push(d.message()); d.dismiss(); });
  await cliente.goto(url);
  const barra = cliente.locator('.invitados-barra');
  await expect(barra).toContainText('Gestión de siniestros · versión 2');
  await expect(barra).toContainText('Solo lectura · compartida con Gerencia de Siniestros (ficticia)');
  await expect(nodos(cliente)).toHaveCount(18);
  await expect(cliente.locator('body')).toHaveClass(/present-mode/);
  for (const selector of ['.toolbar-left', '.panel-right', '#btnIngest', '#btnNew', '#btnExportMenu', '#btnPresent', '#btnUndo', '#processName']) {
    await expect(cliente.locator(selector)).toBeHidden();
  }
  const panel = cliente.getByRole('complementary', { name: 'Comentarios' });
  await expect(panel).toBeVisible();
  await cliente.screenshot({ path: 'resultados/invitados-vista.png' });

  // Solo lectura: ni arrastrar, ni doble clic para editar la etiqueta, ni modo conexión (C), ni Esc para salir de «Presentar»
  const i = await indiceDe(cliente, 'Validar póliza vigente');
  expect(i).toBeGreaterThanOrEqual(0);
  const posicion = await nodos(cliente).nth(i).getAttribute('transform');
  const caja = await nodos(cliente).nth(i).boundingBox();
  await cliente.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await cliente.mouse.down();
  await cliente.mouse.move(caja.x + caja.width / 2 + 120, caja.y + caja.height / 2 + 80, { steps: 5 });
  await cliente.mouse.up();
  await expect(nodos(cliente).nth(i)).toHaveAttribute('transform', posicion);
  await nodos(cliente).nth(i).dblclick();
  await barra.locator('.invitados-barra-titulo').click();   // el foco fuera de los campos del panel
  await cliente.keyboard.press('c');
  await cliente.keyboard.press('Escape');
  await expect(cliente.locator('#canvas')).not.toHaveClass(/connect-mode/);
  await expect(cliente.locator('body')).toHaveClass(/present-mode/);
  await expect(nodos(cliente)).toHaveCount(18);
  expect(avisosDelNavegador).toEqual([]);
  // (el clic dejó señalado ese paso para comentarlo: se quita)
  await expect(panel.locator('.invitados-ancla-actual')).toContainText('Sobre «Validar póliza vigente»');
  await panel.getByRole('button', { name: 'Comentar el proceso en general' }).click();

  // La ficha, en su vista previa
  await barra.getByRole('button', { name: 'Ficha del proceso' }).click();
  await expect(cliente.locator('#modal')).toBeVisible();
  await expect(cliente.locator('#modalTitle')).toContainText('Ficha de Proceso');
  await cliente.screenshot({ path: 'resultados/invitados-ficha.png' });
  await cliente.keyboard.press('Escape');
  await expect(cliente.locator('#modal')).toBeHidden();
  await expect(cliente.locator('body')).toHaveClass(/present-mode/);

  // Un comentario general…
  await expect(panel.locator('.invitados-ancla-actual')).toHaveText('Comentario sobre el proceso en general');
  await panel.getByLabel('Tu nombre').fill('Carla Ruiz (ficticia)');
  await panel.getByRole('button', { name: 'Enviar comentario' }).click();
  await expect(panel.getByRole('alert')).toHaveText('Escribe el comentario.');
  await panel.getByLabel('Comentario', { exact: true }).fill('Falta el paso de firma del gerente.');
  await panel.getByRole('button', { name: 'Enviar comentario' }).click();
  await expect(panel.getByRole('status')).toHaveText('Comentario enviado. El equipo lo verá junto a esta versión.');
  // …y otro sobre un paso del diagrama
  const j = await indiceDe(cliente, 'Registrar siniestro');
  await nodos(cliente).nth(j).click();
  await expect(nodos(cliente).nth(j)).toHaveClass(/invitados-senalado/);
  await expect(panel.locator('.invitados-ancla-actual')).toContainText('Sobre «Registrar siniestro»');
  await expect(panel.getByLabel('Comentario', { exact: true })).toBeFocused();
  await cliente.keyboard.type('Esto lo hace el área de atención.');
  await cliente.screenshot({ path: 'resultados/invitados-comentando.png' });
  await panel.getByRole('button', { name: 'Enviar comentario' }).click();
  const lista = panel.getByRole('list', { name: 'Tus comentarios' });
  await expect(lista.getByRole('listitem')).toHaveCount(2);
  await expect(lista.getByRole('listitem').nth(1)).toContainText('Sobre «Registrar siniestro»');
  await expect(barra.getByRole('button', { name: 'Comentarios (2)' })).toBeVisible();
  await cliente.screenshot({ path: 'resultados/invitados-comentarios.png' });
  await panel.screenshot({ path: 'resultados/invitados-panel.png' });
  await cliente.locator('.app-header').screenshot({ path: 'resultados/invitados-cabecera.png' });
  // Todo lo que pidió el invitado fue a la API pública con su token
  expect(llamadas.length).toBeGreaterThan(0);
  expect(llamadas.filter((l) => !/^(GET|POST) \/api\/publico\/invitados\/[A-Za-z0-9_-]{43}(\/comentarios)?$/.test(l))).toEqual([]);

  // El trabajo del editor libre sigue igual y la copia de la vista se borró al salir
  await cliente.goto('/proyectos/entrar');
  const despues = await cliente.evaluate(() => ({
    v1: localStorage.getItem('processiq.v1'), ui: localStorage.getItem('processiq.ui'), vista: localStorage.getItem('processiq.invitados.vista')
  }));
  expect(despues).toEqual({ ...antes, vista: null });

  // El editor ve los comentarios junto a la v2 y resuelve uno
  await page.reload();
  const comentarios = seccion(page).locator('.invitados-comentario');
  await expect(comentarios).toHaveCount(2);
  const general = comentarios.filter({ hasText: 'Falta el paso de firma del gerente.' });
  await expect(general).toContainText('Carla Ruiz (ficticia)');
  await expect(general).toContainText('Gerencia de Siniestros (ficticia)');
  await expect(comentarios.filter({ hasText: 'Esto lo hace el área de atención.' })).toContainText('Sobre «Registrar siniestro»');
  await expect(filaEnlace).not.toContainText('Sin abrir');
  await expect(seccion(page)).toContainText('2 comentarios sin resolver');
  await page.screenshot({ path: 'resultados/invitados-proceso.png', fullPage: true });
  await general.getByLabel('Resuelto').check();
  await expect(general).toContainText('por Editor de Prueba');
  await expect(seccion(page)).toContainText('1 comentario sin resolver');
  // Lo pendiente queda arriba
  await expect(comentarios.first()).toContainText('Esto lo hace el área de atención.');
  await page.screenshot({ path: 'resultados/invitados-proceso-resuelto.png', fullPage: true });

  // El cliente ve que el equipo lo resolvió
  await cliente.goto(url);
  await expect(panel.locator('.invitados-item-resuelto')).toHaveCount(1);
  await expect(panel.locator('.invitados-item-resuelto')).toContainText('El equipo lo marcó como resuelto');

  // Revocar: el enlace deja de funcionar en el acto, también con la página abierta
  await filaEnlace.getByRole('button', { name: 'Revocar' }).click();
  await page.getByRole('dialog', { name: 'Revocar el enlace' }).getByRole('button', { name: 'Revocar enlace' }).click();
  await expect(filaEnlace).toContainText('Revocado');
  await expect(filaEnlace.getByRole('button', { name: 'Revocar' })).toHaveCount(0);
  await panel.getByLabel('Tu nombre').fill('Carla Ruiz (ficticia)');
  await panel.getByLabel('Comentario', { exact: true }).fill('¿Sigue abierto?');
  await panel.getByRole('button', { name: 'Enviar comentario' }).click();
  await expect(cliente.locator('.invitados-error')).toContainText('Este enlace ya no está disponible');
  await expect(nodos(cliente)).toHaveCount(0);
  await cliente.reload();
  await expect(cliente.locator('.invitados-error')).toContainText('Puede que haya caducado o que lo hayan revocado');
  await expect(nodos(cliente)).toHaveCount(0);
  await cliente.screenshot({ path: 'resultados/invitados-revocado.png' });
  const token = new URL(url).searchParams.get('invitado');
  expect((await contexto.request.get(`/api/publico/invitados/${token}`)).status()).toBe(404);
  await contexto.close();
});

test('quien solo lee ve los comentarios sin poder compartir ni resolver; un enlace sin comentarios es solo de lectura', async ({ page, browser }) => {
  // El editor crea dos enlaces a la última versión por la API: uno con comentarios y otro sin ellos
  await entrar(page, 'editor');
  const { proyectos } = await api(page.request, 'GET', '/proyectos');
  const { procesos } = await api(page.request, 'GET', `/proyectos/${proyectos.find((p) => /Siniestros/.test(p.nombre)).id}`);
  const proceso = procesos.find((p) => p.nombre === 'Gestión de siniestros');
  const conComentarios = await api(page.request, 'POST', `/invitados/revisiones/${proceso.ultimaRevision.id}/enlaces`, { destinatario: 'Comité del cliente (ficticio)' });
  const soloLectura = await api(page.request, 'POST', `/invitados/revisiones/${proceso.ultimaRevision.id}/enlaces`, { destinatario: 'Auditoría (ficticia)', admiteComentarios: false });

  const contexto = await browser.newContext();
  await api(contexto.request, 'POST', `/publico/invitados/${conComentarios.token}/comentarios`, { nombre: 'Comité', texto: 'Revisar los plazos del pago.' });

  // Sin comentarios: se ve el diagrama y la ficha, pero no hay panel ni se ancla nada
  const cliente = await contexto.newPage();
  await cliente.goto(soloLectura.url);
  await expect(cliente.locator('.invitados-barra')).toContainText('compartida con Auditoría (ficticia)');
  await expect(nodos(cliente)).toHaveCount(18);
  await expect(cliente.locator('.invitados-barra').getByRole('button', { name: /Comentarios/ })).toHaveCount(0);
  await expect(cliente.getByRole('complementary', { name: 'Comentarios' })).toHaveCount(0);
  await nodos(cliente).first().click();
  await expect(cliente.getByRole('complementary', { name: 'Comentarios' })).toHaveCount(0);
  await cliente.screenshot({ path: 'resultados/invitados-solo-lectura.png' });
  await contexto.close();

  // La lectora del proyecto ve el comentario, pero no los enlaces ni las acciones
  const lectora = await browser.newPage();
  await entrar(lectora, 'lector');
  await irAlProceso(lectora);
  const s = seccion(lectora);
  await expect(s.locator('.invitados-comentario')).toContainText('Revisar los plazos del pago.');
  await expect(s.getByRole('button', { name: 'Compartir con el cliente' })).toHaveCount(0);
  await expect(s.getByRole('table')).toHaveCount(0);
  await expect(s.getByLabel('Resuelto')).toHaveCount(0);
  await lectora.screenshot({ path: 'resultados/invitados-lectora.png', fullPage: true });
});
