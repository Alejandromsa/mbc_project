// Escenarios de paneles y vistas: validaciones, KPIs, simulador, propiedades,
// pains, ficha, As-Is/To-Be (con su PPTX), recarga desde localStorage e
// importación de un proyecto JSON.
import { cargarFuentes, clicExport, descargar } from './escenarios.mjs';
import { estadoDiagrama } from './interacciones.mjs';

const esperar = (page, ms) => page.waitForTimeout(ms);
async function asentar(page) {
  await page.evaluate(() => new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300)))));
}
const pestana = (page, t) => page.evaluate((x) => document.querySelector(`[data-tab="${x}"]`).click(), t);
const html = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerHTML ?? '(no existe)', sel);

// Valores de los campos de un contenedor (el innerHTML no refleja .value).
const valores = (page, sel) => page.evaluate((s) => {
  const out = {};
  document.querySelectorAll(`${s} input, ${s} select, ${s} textarea`).forEach((el, i) => {
    out[el.id || el.name || `#${i}`] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return JSON.stringify(out, null, 2);
}, sel);

async function seleccionarNodo(page, indice) {
  await page.evaluate((i) => {
    const g = document.querySelectorAll('#nodesLayer .node-group')[i];
    const r = g.getBoundingClientRect();
    const opts = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: 0 };
    g.dispatchEvent(new MouseEvent('mousedown', opts));
    window.dispatchEvent(new MouseEvent('mouseup', opts));
  }, indice);
  await asentar(page);
}

export async function capturarPaneles(page, demo) {
  const a = {};
  await page.evaluate((d) => window.ProcessIQ[d](), demo);
  await asentar(page);

  await pestana(page, 'validations'); await asentar(page);
  a['validaciones.html'] = await html(page, '#lintList') + '\n' + await html(page, '#lintScore') + '\n' + await html(page, '#lintBadge');

  await pestana(page, 'kpis'); await asentar(page);
  a['kpis.html'] = await html(page, '#kpiList');

  await pestana(page, 'sim'); await asentar(page);
  a['simulador.html'] = await html(page, '#simResults');
  await page.evaluate(() => document.querySelector('#btnSimRun').click()); await asentar(page);
  a['simulador-ejecutado.html'] = await html(page, '#simResults');

  for (const i of [1, 4, 8]) {
    await seleccionarNodo(page, i);
    await pestana(page, 'properties'); await asentar(page);
    a[`propiedades-${i}/valores.json`] = await valores(page, '#propsForm');
    a[`propiedades-${i}/texto.txt`] = await page.evaluate(() => document.querySelector('#propsForm')?.innerText ?? '');
    await pestana(page, 'pains'); await asentar(page);
    a[`propiedades-${i}/pains.html`] = await page.evaluate(() =>
      document.querySelector('[data-panel="pains"], #tab-pains, .tab-panel.active')?.innerHTML ?? '');
  }

  await pestana(page, 'ficha'); await asentar(page);
  a['ficha/valores.json'] = await valores(page, '[data-panel="ficha"], #tab-ficha, .tab-panel.active');

  // As-Is -> To-Be
  await page.evaluate(() => document.querySelector('#btnCloneToBe').click()); await asentar(page);
  let e = await estadoDiagrama(page);
  a['to-be-clonado/resumen.json'] = e.resumen; a['to-be-clonado/diagrama.svg'] = e.svg;
  await page.evaluate(() => document.querySelector('#btnTransformToBe').click());
  await esperar(page, 200);
  await page.evaluate(() => {
    document.querySelector('#tobeLevelSel').value = 'estrategico';
    document.querySelector('#tobeLevelSel').dispatchEvent(new Event('change'));
    document.querySelector('#tobeChanges').value = 'Eliminar la validación manual y añadir autoservicio en la captura';
  });
  a['to-be-modal.html'] = await html(page, '#modalBody');
  await page.evaluate(() => document.querySelector('#modalOk').click());
  await esperar(page, 600); await asentar(page);
  e = await estadoDiagrama(page);
  a['to-be-transformado/resumen.json'] = e.resumen; a['to-be-transformado/diagrama.svg'] = e.svg;
  a['to-be-transformado/mensajes.html'] = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#copilotMessages > .copilot-msg')).slice(-2).map((m) => m.outerHTML).join('\n'));
  // El PPTX con To-Be no se compara aquí: en el MVP falla (F1) y en la app nueva
  // está corregido. Lo cubre divergencias.spec.mjs.
  a['to-be-informe.doc'] = (await descargar(page, () => clicExport(page, 'word'))).datos.toString('utf8');

  await page.evaluate(() => document.querySelector('#btnViewAsIs').click()); await asentar(page);
  e = await estadoDiagrama(page);
  a['vista-as-is/resumen.json'] = e.resumen; a['vista-as-is/diagrama.svg'] = e.svg;

  // Recarga: el estado se restaura desde localStorage
  const proyecto = (await descargar(page, () => clicExport(page, 'json'))).datos;
  await page.reload();
  await page.waitForFunction(() => !!window.ProcessIQ);
  // La app pinta desde localStorage ANTES de que el arnés pueda cargar las
  // fuentes: el SVG de ese primer pintado depende del timing. Se compara lo
  // que no mide texto (resumen y BPMN con coordenadas) y luego se cargan las
  // fuentes para los pasos siguientes.
  await asentar(page);
  e = await estadoDiagrama(page);
  a['tras-recarga/resumen.json'] = e.resumen;
  a['tras-recarga/proceso.bpmn'] = await page.evaluate(() => window.ProcessIQ.generateBpmnXml());
  await cargarFuentes(page);

  // Importación JSON: se carga otro ejemplo y luego se importa el proyecto guardado
  await page.evaluate(() => window.ProcessIQ.loadDemo()); await asentar(page);
  await page.setInputFiles('#fileImport', { name: 'proyecto.json', mimeType: 'application/json', buffer: proyecto });
  await esperar(page, 500); await asentar(page);
  e = await estadoDiagrama(page);
  a['importado/resumen.json'] = e.resumen; a['importado/diagrama.svg'] = e.svg;
  return a;
}
