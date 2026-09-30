// Idioma del shell de punta a punta: por defecto español (aunque el navegador
// esté en inglés); se cambia a inglés con «ES / EN», se recorren acceso,
// proyectos, un proyecto, un proceso, Portafolio, Conocimiento y Administración;
// la preferencia sobrevive a la recarga, la sigue otra pestaña y el editor la
// sigue (abre en inglés). Al final se vuelve a español.
import { expect, test } from '@playwright/test';
import { CLAVE, correo, reiniciarDatos } from './src/entorno.mjs';

test.beforeEach(() => reiniciarDatos());
// Navegador en inglés: el shell debe arrancar igualmente en español
test.use({ locale: 'en-US' });

const menu = (page) => page.getByRole('navigation', { name: 'Sections' });
const fechaEnIngles = /[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M/;

test('el shell se usa en inglés y vuelve a español; la preferencia persiste y el editor la sigue', async ({ page, context }) => {
  // 1. Por defecto, español
  await page.goto('/proyectos/entrar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  const idioma = page.getByRole('group', { name: 'Idioma' });
  await expect(idioma.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true');

  // Otra pestaña del mismo navegador, abierta antes del cambio
  const otra = await context.newPage();
  await otra.goto('/proyectos/entrar');
  await expect(otra.getByRole('button', { name: 'Entrar' })).toBeVisible();

  // 2. Acceso en inglés, con el error de la API traducido
  await idioma.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Sign in with your account to work on your team’s projects.')).toBeVisible();
  // El editor ya está en inglés: los enlaces no avisan de que abre en español
  await expect(page.getByRole('link', { name: 'use the editor without an account' })).not.toHaveAttribute('title', /Spanish/);
  expect(await page.evaluate(() => localStorage.getItem('processiq.idioma'))).toBe('en');
  // La otra pestaña lo sigue sin recargar
  await expect(otra.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(otra.locator('html')).toHaveAttribute('lang', 'en');
  await otra.close();

  await page.getByLabel('Email').fill(correo('admin'));
  await page.getByLabel('Password').fill('no-es-la-clave-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
  await page.screenshot({ path: 'resultados/idioma-entrar.png' });
  await page.getByLabel('Password').fill(CLAVE);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // 3. Proyectos y menú
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await expect(page).toHaveTitle('Projects · ProcessIQ');
  await expect(page.getByText('All projects in your organization.')).toBeVisible();
  await expect(page.locator('.usuario-nombre small')).toHaveText('Administrator');
  await expect(menu(page).getByRole('link', { name: 'Portfolio' })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Knowledge' })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Standalone editor' })).toHaveAttribute('title', 'The editor without a project (work is saved in this browser).');
  await expect(page.getByRole('link', { name: /Siniestros — Seguros Andinos/ })).toContainText(fechaEnIngles);
  await expect(page.getByRole('link', { name: /Siniestros — Seguros Andinos/ })).toContainText('Owner');
  await menu(page).getByText('Admin', { exact: true }).click();
  await page.locator('.shell-cabecera').screenshot({ path: 'resultados/idioma-cabecera.png' });
  await page.screenshot({ path: 'resultados/idioma-proyectos.png' });
  await page.keyboard.press('Escape');

  // 4. Un proyecto
  await page.getByRole('link', { name: /Siniestros — Seguros Andinos/ }).click();
  await expect(page.getByText('Your role: Owner')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Processes', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Members', level: 2 })).toBeVisible();
  const fila = page.getByRole('row', { name: /Gestión de siniestros/ });
  await expect(fila).toContainText('v3 Draft');
  await expect(fila.getByRole('link', { name: 'Open in editor' })).not.toHaveAttribute('title', /Spanish/);
  await page.getByRole('button', { name: 'New process' }).click();
  const dialogo = page.getByRole('dialog', { name: 'New process' });
  await expect(dialogo.getByLabel('Start from')).toContainText('An empty process');
  await dialogo.screenshot({ path: 'resultados/idioma-nuevo-proceso.png' });
  await dialogo.getByRole('button', { name: 'Cancel' }).click();
  await page.screenshot({ path: 'resultados/idioma-proyecto.png', fullPage: true });

  // 5. Un proceso
  await page.getByRole('link', { name: 'Gestión de siniestros', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revisions', level: 2 })).toBeVisible();
  const v2 = page.locator('tbody tr').filter({ has: page.locator('td:first-child strong', { hasText: /^v2$/ }) });
  await expect(v2).toContainText('In review');
  await expect(v2.getByRole('button', { name: 'Approve' })).toBeVisible();
  await expect(v2.getByRole('button', { name: 'Send back' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Client review' })).toContainText('No version of this process has been shared yet.');
  await page.screenshot({ path: 'resultados/idioma-proceso.png', fullPage: true });

  // El editor sigue el idioma de la plataforma: abre en inglés (editor-idioma.spec.mjs lo recorre)
  await page.getByRole('link', { name: 'Open the latest version in the editor' }).click();
  await expect(page).toHaveURL(/\/\?proceso=/);
  await expect(page.locator('.piq-proyecto')).toContainText('v3 · Draft');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Revisions', level: 2 })).toBeVisible();

  // 6. Portafolio
  await menu(page).getByRole('link', { name: 'Portfolio' }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio', level: 1 })).toBeVisible();
  const andinos = page.getByRole('row', { name: /Seguros Andinos/ });
  await expect(andinos).toContainText('0 of 3 approved');
  await expect(andinos.getByRole('img')).toHaveAttribute('aria-label', 'Approved: 0, In review: 0, Draft: 2, No revisions: 1');
  await andinos.getByRole('link', { name: 'Seguros Andinos (ficticio)' }).click();
  await expect(page.getByText('0 of 3 processes approved (0%)')).toBeVisible();
  await expect(page.locator('.portafolio-cifra').filter({ hasText: 'Pain points' })).toContainText('score');
  await page.screenshot({ path: 'resultados/idioma-portafolio.png', fullPage: true });

  // 7. Conocimiento
  await menu(page).getByRole('link', { name: 'Knowledge' }).click();
  await expect(page.getByRole('heading', { name: 'Knowledge', level: 1 })).toBeVisible();
  await page.getByLabel('Search activities, systems, roles and process sheets').fill('poliza vigente');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: /process(es)? for “poliza vigente”/ })).toBeVisible();
  await expect(page.locator('.conocimiento-resultado').first().getByRole('link', { name: 'Similar processes and comparison' })).toBeVisible();
  await page.screenshot({ path: 'resultados/idioma-conocimiento.png', fullPage: true });
  await page.getByRole('navigation', { name: 'Knowledge' }).getByRole('link', { name: 'Reference framework' }).click();
  await expect(page.getByText('No framework has been imported yet. Import one below from a CSV file.')).toBeVisible();
  await expect(page.getByLabel('CSV file', { exact: true })).toBeVisible();

  // 8. Administración
  await menu(page).getByText('Admin', { exact: true }).click();
  await menu(page).getByRole('link', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Last sign-in' })).toBeVisible();
  await expect(page.getByRole('row', { name: /nuevo@processiq\.test/ })).toContainText('Temporary password');
  await page.screenshot({ path: 'resultados/idioma-usuarios.png', fullPage: true });

  await page.goto('/proyectos/admin/catalogos');
  await expect(page.getByRole('heading', { name: 'Catalogs', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'Playbook verbs' }).click();
  await expect(page.getByRole('heading', { name: /^Banned \(\d+\)$/ })).toBeVisible();

  await page.goto('/proyectos/admin/auditoria');
  await expect(page.getByRole('heading', { name: 'Audit log', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Show')).toContainText('Users and sessions');

  await page.goto('/proyectos/admin/ia');
  await expect(page.getByRole('heading', { name: 'AI usage', level: 1 })).toBeVisible();

  await page.goto('/proyectos/admin/sistema');
  await expect(page.getByRole('heading', { name: 'System', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'AI worker' })).toContainText('OK', { timeout: 20_000 });
  await page.screenshot({ path: 'resultados/idioma-sistema.png', fullPage: true });

  // 9. La preferencia sobrevive a la recarga
  await page.reload();
  await expect(page.getByRole('heading', { name: 'System', level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // 10. De vuelta a español, también tras recargar
  await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Español' }).click();
  await expect(page.getByRole('heading', { name: 'Sistema', level: 1 })).toBeVisible();
  await expect(page).toHaveTitle('Sistema · ProcessIQ');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(await page.evaluate(() => localStorage.getItem('processiq.idioma'))).toBe('es');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sistema', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Secciones' }).getByText('Administración')).toBeVisible();
});
