// Escenarios de fidelidad: lo que se captura de cada proceso de ejemplo.
// Se ejecuta igual contra el MVP de referencia y contra la app nueva; las
// pruebas comparan artefacto por artefacto.
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

// Los 14 procesos de ejemplo que expone el gancho window.ProcessIQ del MVP.
export const DEMOS = [
  'loadDemo', 'loadComplex', 'loadComplex2', 'loadComplex3', 'loadComplex4', 'loadComplex5',
  'loadComplex6', 'loadComplex7', 'loadComplex8', 'loadComplex9', 'loadComplex10',
  'loadComplex11', 'loadComplex12', 'loadFichaVentaLotes'
];

// Fecha fija: fichas, informes, PPTX y BPMN llevan la fecha del dia.
export const FECHA_FIJA = new Date('2026-09-25T12:00:00-05:00');
export const VIEWPORT = { width: 1440, height: 900 };

export async function abrirApp(page, url) {
  await page.clock.setFixedTime(FECHA_FIJA);
  await page.route(/umami/, (r) => r.abort());
  await page.goto(url);
  await page.waitForFunction(() => !!window.ProcessIQ);
  await cargarFuentes(page);
}

/**
 * Las cajas y etiquetas se miden con la fuente real. Se cargan TODAS las caras
 * de Montserrat declaradas (4 pesos × subconjuntos Unicode de Google Fonts):
 * si una llega tarde, el primer render mide esas etiquetas con la fuente de
 * reserva y el resultado depende del timing. Llamarla también tras cada recarga.
 */
export async function cargarFuentes(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const caras = [...document.fonts].filter((f) => /Montserrat/i.test(f.family));
    await Promise.all(caras.map((f) => f.load().catch(() => null)));
    await document.fonts.ready;
  });
}

// Deja terminar render, auto-encuadre y microtareas pendientes.
async function asentar(page) {
  await page.evaluate(() => new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300)))));
}

export async function descargar(page, accion) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), accion()]);
  return { nombre: dl.suggestedFilename(), datos: await readFile(await dl.path()) };
}

export function clicExport(page, tipo, tema) {
  return page.evaluate(([t, tm]) => {
    const sel = tm ? `button[data-export="${t}"][data-tema="${tm}"]` : `button[data-export="${t}"]`;
    document.querySelector(sel).click();
  }, [tipo, tema]);
}

// Del PPTX solo interesan las laminas (docProps lleva marcas de tiempo).
export async function laminasPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const nombres = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const laminas = {};
  for (const n of nombres) laminas[n] = await zip.file(n).async('string');
  return laminas;
}

const texto = (d) => d.datos.toString('utf8');

/**
 * Carga un proceso de ejemplo y devuelve sus artefactos.
 * @returns {Promise<Record<string, string>>} clave -> contenido textual
 */
export async function capturarDemo(page, demo) {
  await page.evaluate((d) => window.ProcessIQ[d](), demo);
  await asentar(page);

  const a = {};
  a['resumen.json'] = JSON.stringify(await page.evaluate(() => ({
    snapshot: window.ProcessIQ.snapshot(),
    calidad: window.ProcessIQ.quality()
  })), null, 2);

  const json = await descargar(page, () => clicExport(page, 'json'));
  a['nombre-archivo.txt'] = json.nombre;
  a['proyecto.json'] = texto(json);
  a['diagrama.svg'] = texto(await descargar(page, () => clicExport(page, 'svg')));
  a['proceso.bpmn'] = texto(await descargar(page, () => clicExport(page, 'bpmn')));
  a['informe.doc'] = texto(await descargar(page, () => clicExport(page, 'word')));
  a['ficha.doc'] = texto(await descargar(page, () => page.evaluate(() => window.ProcessIQ.exportFicha())));

  for (const tema of ['mbc', 'bbva']) {
    const pptx = await descargar(page, () => clicExport(page, 'pptx', tema));
    const laminas = await laminasPptx(pptx.datos);
    for (const [n, xml] of Object.entries(laminas)) {
      a[`pptx-${tema}/${n.replace('ppt/slides/', '')}`] = xml;
    }
  }

  // Niveles de detalle: Ejecutivo (1), Actividad (2), Detalle (3).
  for (const nivel of [1, 2, 3]) {
    await page.evaluate((n) => window.ProcessIQ.nivel(n), nivel);
    await asentar(page);
    const r = await page.evaluate(() => ({
      snapshot: window.ProcessIQ.snapshot(),
      calidad: window.ProcessIQ.quality(),
      bpmn: window.ProcessIQ.generateBpmnXml(),
      svg: window.ProcessIQ.svg()
    }));
    a[`nivel-${nivel}/resumen.json`] = JSON.stringify({ snapshot: r.snapshot, calidad: r.calidad }, null, 2);
    a[`nivel-${nivel}/proceso.bpmn`] = r.bpmn;
    a[`nivel-${nivel}/diagrama.svg`] = r.svg;
  }
  return a;
}
