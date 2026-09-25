// Ejecuta una misma captura en el MVP de referencia y en la app nueva, y compara
// artefacto por artefacto. Si algo difiere, ambos se escriben en resultados/.
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { VIEWPORT, abrirApp } from './escenarios.mjs';
import { PUERTO_REFERENCIA, PUERTO_NUEVA } from './puertos.mjs';

const APPS = {
  referencia: `http://127.0.0.1:${PUERTO_REFERENCIA}/`,
  nueva: `http://127.0.0.1:${PUERTO_NUEVA}/`
};
const RESULTADOS = join(import.meta.dirname, '..', 'resultados');

function primeraDiferencia(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  const ctx = (s) => JSON.stringify(s.slice(Math.max(0, i - 80), i + 80));
  return `posicion ${i} (largo ${a.length} vs ${b.length})\n  referencia: ${ctx(a)}\n  nueva:      ${ctx(b)}`;
}

async function guardar(caso, origen, clave, contenido) {
  const ruta = join(RESULTADOS, caso, origen, clave);
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, contenido ?? '(ausente)');
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {string} caso nombre de la carpeta de resultados
 * @param {(page, ctx) => Promise<Record<string,string>>} capturar
 * @param {{ antesDeCargar?: (ctx) => Promise<void> }} [opciones]
 */
export async function compararEnAmbas(browser, caso, capturar, opciones = {}) {
  const ejecutar = async (url) => {
    // Sin animaciones ni transiciones (la app respeta prefers-reduced-motion):
    // medir el lienzo a mitad de una transición hace el resultado dependiente del timing.
    const ctx = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true, reducedMotion: 'reduce' });
    if (opciones.antesDeCargar) await opciones.antesDeCargar(ctx);
    const page = await ctx.newPage();
    const errores = [], dialogos = [];
    page.on('pageerror', (e) => errores.push(String(e)));
    page.on('dialog', async (d) => { dialogos.push(d.type() + ': ' + d.message()); await d.dismiss(); });
    await abrirApp(page, url);
    const artefactos = await capturar(page, ctx);
    artefactos['dialogos.txt'] = dialogos.join('\n---\n');
    await ctx.close();
    return { artefactos, errores };
  };
  const ref = await ejecutar(APPS.referencia);
  const nueva = await ejecutar(APPS.nueva);

  expect(nueva.errores, 'errores de JavaScript en la app nueva').toEqual(ref.errores);
  const claves = [...new Set([...Object.keys(ref.artefactos), ...Object.keys(nueva.artefactos)])].sort();
  const distintos = [];
  // GUARDAR_TODO=1 escribe también los artefactos iguales (para inspeccionar qué se captura)
  if (process.env.GUARDAR_TODO) for (const k of claves) await guardar(caso, 'nueva', k, nueva.artefactos[k]);
  for (const k of claves) {
    const a = ref.artefactos[k], b = nueva.artefactos[k];
    if (a === b) continue;
    distintos.push(`${k}: ${a == null || b == null ? 'falta en una de las dos' : primeraDiferencia(a, b)}`);
    await guardar(caso, 'referencia', k, a);
    await guardar(caso, 'nueva', k, b);
  }
  expect(distintos, `${distintos.length} de ${claves.length} artefactos difieren`).toEqual([]);
  return claves.length;
}
