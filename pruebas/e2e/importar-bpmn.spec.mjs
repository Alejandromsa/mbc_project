// Importar desde el editor un BPMN de otra herramienta: sale con sus carriles,
// su subproceso (plegable con los niveles) y sin elementos perdidos. El archivo
// es un fixture inventado con la forma de un export de Bizagi (packages/bpmn).
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const FIXTURE = new URL('../../packages/bpmn/src/__fixtures__/bizagi-reclamos.bpmn', import.meta.url);

// Lo que el archivo dibuja: cada actividad, compuerta y evento con nombre. No faltan
// ni el inicio y el fin sin nombre del subproceso (solo marcan sus bordes: la caja
// del subproceso enlaza con su contenido), ni la convergencia sin nombre (se dibuja
// implícita), ni el evento de borde, que va sobre «Evaluar reclamo».
const ELEMENTOS = [
  'Reclamo recibido', 'Registrar reclamo', '¿Reclamo completo?', 'Solicitar información faltante',
  'Información recibida', 'Evaluar reclamo', 'Revisar antecedentes', 'Consultar historial del cliente',
  '¿Procede?', 'Calcular compensación', 'Redactar rechazo', 'Escalar al supervisor',
  'Notificar resultado al cliente', 'Reclamo escalado', 'Reclamo atendido'
];
const CARRILES = ['Cliente', 'Mesa de ayuda', 'Analista de reclamos', 'Supervisor'];
const CONTENIDO_DEL_SUBPROCESO = ['Revisar antecedentes', 'Consultar historial del cliente', '¿Procede?', 'Calcular compensación', 'Redactar rechazo'];

async function abrirEditor(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.ProcessIQ);
  await page.evaluate(() => document.fonts.ready);
}

async function soltarArchivo(page, nombre, contenido) {
  await page.locator('#btnIngest').click();
  await expect(page.locator('#ingestModal')).toBeVisible();
  await page.setInputFiles('#docFileInput', { name: nombre, mimeType: 'application/xml', buffer: Buffer.from(contenido, 'utf8') });
}

const guardado = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('processiq.v1')));

test('un BPMN de otra herramienta se importa con sus carriles, su subproceso y sin perder elementos', async ({ page }) => {
  await abrirEditor(page);
  await soltarArchivo(page, 'bizagi-reclamos.bpmn', await readFile(FIXTURE, 'utf8'));

  const mensaje = page.locator('#copilotMessages > .copilot-msg').last();
  await expect(mensaje).toContainText('BPMN importado desde bizagi-reclamos.bpmn');
  await expect(mensaje).toContainText('15 elementos (9 actividades, 2 compuertas, 4 eventos) y 16 flujos.');
  await expect(mensaje).toContainText('Carriles: ' + CARRILES.join(', ') + '.');
  await expect(mensaje).toContainText('Un subproceso con contenido: se ve desplegado en el nivel Detalle y plegado en Actividad y Ejecutivo.');
  await expect(mensaje).toContainText('Se ignoraron elementos que el editor no representa: group (1).');
  await expect(page.locator('#ingestModal')).toBeHidden();

  // Todos los elementos, cada uno en su carril, y los carriles dibujados
  const d = await guardado(page);
  expect(d.meta.name).toBe('Atención de reclamos');
  expect(d.nodes.map((n) => n.label).sort()).toEqual([...ELEMENTOS].sort());
  expect([...d.lanes.list].sort()).toEqual([...CARRILES].sort());
  const carrilDe = Object.fromEntries(d.nodes.map((n) => [n.label, d.lanes.laneOf[n.id]]));
  expect(carrilDe).toMatchObject({
    'Reclamo recibido': 'Cliente', 'Registrar reclamo': 'Mesa de ayuda', 'Evaluar reclamo': 'Analista de reclamos',
    'Calcular compensación': 'Analista de reclamos', 'Escalar al supervisor': 'Supervisor'
  });
  await expect(page.locator('#laneHeadersLayer text')).toHaveCount(CARRILES.length);
  // Ningún nodo sin coordenadas: cero defectos también puede ser un diagrama vacío
  expect(d.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && n.x > 0 && n.y > 0)).toBe(true);
  expect(await page.evaluate(() => window.ProcessIQ.quality())).toMatchObject({ sobreCajas: 0 });

  // Tras importar se abre la Ficha (como en el MVP); para la captura se cierra el panel
  await page.locator('#btnDrawerClose').click();
  await page.evaluate(() => window.ProcessIQ.autoFit());
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'resultados/importar-bpmn-detalle.png' });

  // Nivel Actividad: el contenido del subproceso se pliega en su caja
  await page.locator('#nivelVista button[data-nivel="2"]').click();
  await expect.poll(() => page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(ELEMENTOS.length - CONTENIDO_DEL_SUBPROCESO.length);
  const plegado = await guardado(page);
  expect(plegado.nodes.map((n) => n.label)).not.toContain('Revisar antecedentes');
  expect(plegado.nodes.find((n) => n.label === 'Evaluar reclamo')).toMatchObject({ marker: 'subprocess', boundary: { type: 'timer', interrupting: false } });
  await page.evaluate(() => window.ProcessIQ.autoFit());
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'resultados/importar-bpmn-actividad.png' });

  // Y vuelve entero en Detalle
  await page.locator('#nivelVista button[data-nivel="3"]').click();
  await expect.poll(() => page.evaluate(() => window.ProcessIQ.snapshot().nodes)).toBe(ELEMENTOS.length);
});

test('un XML que no es BPMN da un mensaje claro y no borra el proceso abierto', async ({ page }) => {
  await abrirEditor(page);
  await page.evaluate(() => window.ProcessIQ.loadDemo());
  const antes = await page.evaluate(() => window.ProcessIQ.snapshot());
  expect(antes.nodes).toBeGreaterThan(5);

  const avisos = [];
  page.on('dialog', (dialogo) => { avisos.push(dialogo.message()); dialogo.accept().catch(() => {}); });
  await soltarArchivo(page, 'pedido.xml', '<?xml version="1.0"?><pedido><linea cantidad="2"/></pedido>');
  await expect.poll(() => avisos.length).toBe(1);
  expect(avisos[0]).toContain('El archivo es XML, pero no es un diagrama BPMN 2.0: su elemento principal es <pedido> y debería ser <definitions>.');
  expect(await page.evaluate(() => window.ProcessIQ.snapshot())).toEqual(antes);
});
