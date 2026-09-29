// Portafolio de punta a punta: el administrador abre «Portafolio» desde el menú,
// entra en un cliente y ve sus procesos e indicadores; quien no participa en
// ningún proyecto no ve clientes; los archivados solo aparecen si se piden.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { BASE, CLAVE, RAIZ, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());

const fixture = (nombre) => JSON.parse(readFileSync(join(RAIZ, 'packages/dominio/src/__fixtures__', nombre), 'utf8'));

async function entrar(page, usuario) {
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo(usuario));
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
}

/** Llamada a la API con la sesión de la página (las escrituras exigen el Origin de la web). */
async function api(page, metodo, ruta, datos) {
  const r = await page.request.fetch(`/api${ruta}`, { method: metodo, data: datos, headers: { origin: BASE } });
  expect(r.ok(), `${metodo} ${ruta} -> ${r.status()}`).toBeTruthy();
  return r.json();
}

/** Un segundo cliente, con un proceso aprobado (y KPIs medidos) y otro en revisión. */
async function segundoCliente(page) {
  const { proyecto } = await api(page, 'POST', '/proyectos', { nombre: 'Cobranzas (prueba)', cliente: 'Banco del Pacífico (ficticio)' });
  const siniestros = fixture('mvp-3.8.9-siniestros.json');
  const kpi = (value) => ({ name: 'Tiempo de ciclo', unit: 'días', benchmark: '5', value, gap: '', source: '' });
  const a = await api(page, 'POST', `/proyectos/${proyecto.id}/procesos`, {
    nombre: 'Cobranza temprana', contenido: { ...siniestros, kpiValues: { k1: kpi('12'), k2: kpi('') } }
  });
  await api(page, 'POST', `/revisiones/${a.revision.id}/estado`, { estado: 'en_revision' });
  await api(page, 'POST', `/revisiones/${a.revision.id}/estado`, { estado: 'aprobada' });
  const b = await api(page, 'POST', `/proyectos/${proyecto.id}/procesos`, { nombre: 'Recupero judicial', contenido: fixture('mvp-3.8.9-venta-lotes.json') });
  await api(page, 'POST', `/revisiones/${b.revision.id}/estado`, { estado: 'en_revision' });
}

test('el administrador ve los clientes, entra en uno y llega a sus procesos', async ({ page }) => {
  await entrar(page, 'admin');
  await segundoCliente(page);
  const menu = page.getByRole('navigation', { name: 'Secciones' });
  await menu.getByRole('link', { name: 'Portafolio' }).click();

  await expect(page.getByRole('heading', { name: 'Portafolio', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/proyectos\/portafolio\/?$/);
  await expect(menu.getByRole('link', { name: 'Portafolio' })).toHaveAttribute('aria-current', 'page');
  // El menú del shell sigue apuntando a sus pantallas, no a rutas dentro del portafolio
  await expect(menu.getByRole('link', { name: 'Proyectos' })).toHaveAttribute('href', '/proyectos/');
  await expect(menu.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/proyectos/admin/usuarios');

  const filas = page.getByRole('table').getByRole('row');
  await expect(filas).toHaveCount(3);   // cabecera + 2 clientes (el archivado no cuenta)
  const pacifico = page.getByRole('row', { name: /Banco del Pacífico/ });
  await expect(pacifico).toContainText('1 de 2 aprobados');
  const andinos = page.getByRole('row', { name: /Seguros Andinos/ });
  await expect(andinos.getByRole('cell').nth(1)).toHaveText('1');
  await expect(andinos.getByRole('cell').nth(2)).toHaveText('3');
  await expect(andinos).toContainText('0 de 3 aprobados');
  await expect(andinos.getByRole('img')).toHaveAttribute('aria-label', 'Aprobados: 0, En revisión: 0, En borrador: 2, Sin revisiones: 1');
  await page.screenshot({ path: 'resultados/portafolio-lista.png', fullPage: true });
  await page.locator('.shell-cabecera').screenshot({ path: 'resultados/portafolio-menu.png' });

  // Detalle de un cliente: avance, indicadores y procesos por proyecto
  await pacifico.getByRole('link', { name: 'Banco del Pacífico (ficticio)' }).click();
  await expect(page.getByRole('heading', { name: 'Banco del Pacífico (ficticio)', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/proyectos\/portafolio\/cliente\/Banco%20del%20Pac/);
  await expect(menu.getByRole('link', { name: 'Portafolio' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('1 de 2 procesos aprobados (50 %)')).toBeVisible();
  const cifra = (etiqueta) => page.locator('.portafolio-cifra').filter({ has: page.getByText(etiqueta, { exact: true }) });
  await expect(cifra('Actividades')).toContainText('33');
  await expect(cifra('Pains')).toContainText('5');
  await expect(cifra('KPIs con valor')).toContainText('de 2 KPIs elegidos');
  await expect(page.getByRole('table').filter({ hasText: 'Puntuación' }).getByRole('row').nth(1)).toContainText('Reenvíos por documentación incompleta');
  const cobranza = page.locator('.portafolio-proyecto').getByRole('row', { name: /Cobranza temprana/ });
  await expect(cobranza).toContainText('v1');
  await expect(cobranza).toContainText('Aprobada');
  await expect(cobranza).toContainText('1 de 2');
  await expect(page.locator('.portafolio-proyecto').getByRole('row', { name: /Recupero judicial/ })).toContainText('En revisión');
  await page.screenshot({ path: 'resultados/portafolio-cliente.png', fullPage: true });

  // Los enlaces llevan a las pantallas del proyecto y del proceso
  await cobranza.getByRole('link', { name: 'Cobranza temprana' }).click();
  await expect(page.getByRole('heading', { name: 'Cobranza temprana', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/proyectos\/proceso\//);
  await page.goBack();
  await page.getByRole('link', { name: 'Cobranzas (prueba)' }).click();
  await expect(page.getByRole('heading', { name: 'Cobranzas (prueba)', level: 1 })).toBeVisible();

  // El cliente de la semilla, con sus tres procesos en distintos estados
  await menu.getByRole('link', { name: 'Portafolio' }).click();
  await page.getByRole('link', { name: 'Seguros Andinos (ficticio)' }).click();
  await expect(page.locator('.portafolio-proyecto').getByRole('row', { name: /Gestión de siniestros/ })).toContainText('v3');
  await expect(page.locator('.portafolio-proyecto').getByRole('row', { name: /Proceso sin revisiones/ })).toContainText('Sin contenido todavía');
  await page.screenshot({ path: 'resultados/portafolio-cliente-semilla.png', fullPage: true });

  // Desde el portafolio, «Proyectos» vuelve a la lista de proyectos
  await menu.getByRole('link', { name: 'Proyectos' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
});

test('los archivados solo aparecen si se piden, y el lector ve su cliente', async ({ page, browser }) => {
  await entrar(page, 'admin');
  await page.goto('/proyectos/portafolio/');
  await expect(page.getByRole('link', { name: 'Cliente antiguo (ficticio)' })).toHaveCount(0);
  await page.getByLabel('Incluir proyectos archivados').check();
  await page.getByRole('link', { name: 'Cliente antiguo (ficticio)' }).click();
  await expect(page.getByRole('heading', { name: 'Cliente antiguo (ficticio)', level: 1 })).toBeVisible();
  await expect(page.locator('.portafolio-proyecto')).toContainText('Archivado');
  // La casilla se conserva al volver a la lista
  await page.getByRole('navigation', { name: 'Ruta' }).getByRole('link', { name: 'Portafolio' }).click();
  await expect(page.getByLabel('Incluir proyectos archivados')).toBeChecked();

  const lector = await browser.newPage();
  await entrar(lector, 'lector');
  await lector.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Portafolio' }).click();
  await expect(lector.getByText('Incluye los proyectos en los que participas.')).toBeVisible();
  await lector.getByRole('link', { name: 'Seguros Andinos (ficticio)' }).click();
  await expect(lector.locator('.portafolio-proyecto').getByRole('row', { name: /Venta de lotes urbanos/ })).toContainText('Borrador');
  await lector.close();
});

test('quien no participa en ningún proyecto no ve clientes, ni entrando por la dirección', async ({ page }) => {
  await entrar(page, 'externo');
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Portafolio' }).click();
  await expect(page.getByText('Todavía no hay clientes que mostrar.')).toBeVisible();
  await page.screenshot({ path: 'resultados/portafolio-vacio.png', fullPage: true });
  await page.goto('/proyectos/portafolio/cliente/Seguros%20Andinos%20(ficticio)');
  await expect(page.getByText('Cliente no encontrado.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gestión de siniestros' })).toHaveCount(0);
});
