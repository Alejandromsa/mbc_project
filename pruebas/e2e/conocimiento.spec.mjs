// Conocimiento de punta a punta: el administrador importa un marco de ejemplo
// INVENTADO (nada del APQC real); una consultora busca un término de la
// semilla, abre el resultado y ve los procesos parecidos y el comparativo.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { BASE, CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());

const MARCO = readFileSync(new URL('../../apps/api/src/modulos/conocimiento/__fixtures__/marco-ejemplo.csv', import.meta.url));
const SINIESTROS = JSON.parse(readFileSync(new URL('../../packages/dominio/src/__fixtures__/mvp-3.8.9-siniestros.json', import.meta.url), 'utf8'));

async function entrar(page, usuario) {
  await page.goto('/proyectos/entrar');
  await page.getByLabel('Correo').fill(correo(usuario));
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Proyectos', level: 1 })).toBeVisible();
}

const irAConocimiento = (page) => page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Conocimiento' }).click();

test('el administrador importa el marco con vista previa; una consultora busca, abre un resultado y ve parecidos y comparativo', async ({ page, browser }) => {
  // 1. Marco de ejemplo, importado por el administrador desde el CSV
  await entrar(page, 'admin');
  await irAConocimiento(page);
  await page.getByRole('navigation', { name: 'Conocimiento' }).getByRole('link', { name: 'Marco de referencia' }).click();
  await expect(page.getByText('El PCF tiene licencia de APQC y ProcessIQ no lo incluye')).toBeVisible();
  await expect(page.getByText('Todavía no hay un marco importado.')).toBeVisible();
  await page.getByLabel('Archivo CSV').setInputFiles({ name: 'marco-ejemplo.csv', mimeType: 'text/csv', buffer: MARCO });
  await expect(page.getByText('Vista previa de «marco-ejemplo.csv»')).toBeVisible();
  await expect(page.locator('.conocimiento-previa .conocimiento-cifras')).toHaveText('40 elementos: 4 categorías, 11 grupos de procesos, 25 procesos.');
  await page.screenshot({ path: 'resultados/conocimiento-marco-vista-previa.png', fullPage: true });
  await page.getByRole('button', { name: 'Importar 40 elementos' }).click();
  await expect(page.getByText('Marco importado: 40 elementos.')).toBeVisible();
  await expect(page.getByRole('row', { name: /3\.0 Gestionar siniestros 16/ })).toBeVisible();
  // Arriba del todo: con la página desplazada, la cabecera fija sale en medio de la captura completa
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'resultados/conocimiento-marco.png', fullPage: true });

  // 2. El mismo proceso de siniestros, redibujado en otro proyecto (para «parecidos»)
  const propietario = await browser.newPage();
  await entrar(propietario, 'propietario');
  const crear = async (ruta, data) => {
    const r = await propietario.request.post(ruta, { headers: { origin: BASE }, data });
    expect(r.status()).toBe(201);
    return r.json();
  };
  const { proyecto } = await crear('/api/proyectos', { nombre: 'Autos del Sur (prueba)', cliente: 'Aseguradora ficticia' });
  const vehiculares = structuredClone(SINIESTROS);
  for (const n of vehiculares.nodes) if (n.label === 'Activar peritaje') n.label = 'Inspeccionar vehículo';
  await crear(`/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Siniestros vehiculares', contenido: vehiculares });

  // 3. Buscar sin tilde un término de la semilla
  await irAConocimiento(propietario);
  await expect(propietario.getByRole('heading', { name: 'Conocimiento', level: 1 })).toBeVisible();
  // El menú del shell sigue funcionando dentro del módulo
  const menu = propietario.getByRole('navigation', { name: 'Secciones' });
  await expect(menu.getByRole('link', { name: 'Conocimiento' })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('link', { name: 'Proyectos' })).toHaveAttribute('href', '/proyectos/');
  await expect(menu.getByRole('link', { name: 'Proyectos' })).not.toHaveAttribute('aria-current', 'page');
  await propietario.getByLabel('Buscar en actividades, sistemas, roles y ficha').fill('poliza vigente');
  await propietario.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(propietario).toHaveURL(/\/proyectos\/conocimiento\/\?q=poliza/);
  await expect(propietario.getByRole('heading', { name: '2 procesos para «poliza vigente»' })).toBeVisible();
  const resultado = propietario.locator('.conocimiento-resultado').filter({ hasText: 'Gestión de siniestros' });
  await expect(resultado).toContainText('Siniestros — Seguros Andinos (prueba)');
  await expect(resultado.locator('.conocimiento-extracto')).toHaveText(/Actividad\s*Validar póliza vigente/);
  await expect(resultado.locator('mark')).toHaveText(['póliza', 'vigente']);
  await propietario.screenshot({ path: 'resultados/conocimiento-buscar.png', fullPage: true });

  // 4. Desde el resultado: parecidos (de otro proyecto) y comparativo con el marco
  await resultado.getByRole('link', { name: 'Parecidos y comparativo' }).click();
  await expect(propietario.getByRole('heading', { name: 'Gestión de siniestros', level: 1 })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Conocimiento' })).toHaveAttribute('aria-current', 'page');
  const primero = propietario.locator('.conocimiento-parecidos > li').first();
  await expect(primero).toContainText('Siniestros vehiculares');
  await expect(primero).toContainText('Autos del Sur (prueba)');
  await expect(primero).toContainText('Muy parecido');
  await expect(primero).toContainText('Core Seguros');
  await expect(propietario.getByText('9 de 10 actividades tienen un equivalente en el marco')).toBeVisible();
  const categoria = propietario.locator('.conocimiento-categoria').filter({ hasText: 'Gestionar siniestros' });
  await expect(categoria).toContainText('3 de 4 grupos cubiertos (75%)');
  await expect(categoria.locator('li.falta')).toHaveText(/3\.4 Recuperar costos del siniestro/);
  await expect(propietario.getByRole('row', { name: /Validar póliza vigente/ })).toContainText('3.1.2 Validar la vigencia de la póliza');
  await expect(propietario.getByRole('row', { name: /Cotizar talleres/ })).toContainText('Sin equivalente en el marco');
  await propietario.screenshot({ path: 'resultados/conocimiento-proceso.png', fullPage: true });

  // Un umbral más estricto asigna menos actividades
  await propietario.getByLabel('Umbral de parecido').selectOption('0.65');
  await expect(propietario.getByText(/^\d de 10 actividades tienen un equivalente/)).toBeVisible();
  await expect(propietario.getByText('9 de 10 actividades')).toHaveCount(0);

  // Quien no es administrador ve el marco, pero no puede importarlo
  await propietario.getByRole('navigation', { name: 'Conocimiento' }).getByRole('link', { name: 'Marco de referencia' }).click();
  await expect(propietario.getByText('40 elementos en 4 categorías')).toBeVisible();
  await expect(propietario.getByText('Solo un administrador puede importar o reemplazar el marco.')).toBeVisible();
  await expect(propietario.getByLabel('Archivo CSV')).toHaveCount(0);
  await propietario.close();

  // 5. Sin acceso a los proyectos, no encuentra nada
  const externo = await browser.newPage();
  await entrar(externo, 'externo');
  await externo.goto('/proyectos/conocimiento/?q=poliza');
  await expect(externo.getByText('Ningún proceso de tus proyectos coincide con «poliza»')).toBeVisible();
  await externo.close();
});
