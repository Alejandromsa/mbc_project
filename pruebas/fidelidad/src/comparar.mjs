// Ejecuta una misma captura en el MVP de referencia y en la app nueva, y compara
// artefacto por artefacto. Si algo difiere, ambos se escriben en resultados/.
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { VIEWPORT, abrirApp } from './escenarios.mjs';
import { PUERTO_REFERENCIA, PUERTO_NUEVA } from './puertos.mjs';
import { conTextosNuevos } from './textos-divergentes.mjs';
import { divergentesDe } from './artefactos-divergentes.mjs';

const APPS = {
  referencia: `http://127.0.0.1:${PUERTO_REFERENCIA}/`,
  nueva: `http://127.0.0.1:${PUERTO_NUEVA}/`
};
const RESULTADOS = join(import.meta.dirname, '..', 'resultados');

// Única tolerancia de la fidelidad: el fondo de las etiquetas de flecha
// (rect.edge-label-bg) toma x y width del getBBox del texto. En corridas
// completas con la máquina cargada, las etiquetas largas miden a veces hasta
// un 0,06 % menos en una de las dos apps (0,05 px en 90 px); no depende del
// zoom y la causa sigue abierta (docs/lecciones-aprendidas.md, 7 y 7c). Esos
// dos atributos se comparan con ±0,25 px: un cambio real (relleno, posición)
// mueve 1 px o más. El resto del artefacto, texto de la etiqueta incluido,
// se compara byte a byte.
const RECT_ETIQUETA = /<rect\b[^>]*class="edge-label-bg"[^>]*>/g;
const MEDIDA = /\b(x|width)="(-?[0-9.]+)"/g;
const TOLERANCIA_PX = 0.25;

function separarMedidas(s) {
  const medidas = [];
  const resto = s.replace(RECT_ETIQUETA, (rect) => rect.replace(MEDIDA, (_, attr, valor) => {
    medidas.push(Number(valor));
    return `${attr}="#"`;
  }));
  return { resto, medidas };
}

export function equivalentes(a, b) {
  if (a === b) return true;
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const A = separarMedidas(a), B = separarMedidas(b);
  return A.resto === B.resto && A.medidas.length === B.medidas.length &&
    A.medidas.every((v, i) => Math.abs(v - B.medidas[i]) <= TOLERANCIA_PX);
}

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
  // Textos de la interfaz cambiados a propósito (D8, D9): en el MVP se ponen los
  // nuevos antes de comparar (textos-divergentes.mjs). Lo guardado en resultados/ ya lleva ese cambio.
  for (const k of Object.keys(ref.artefactos)) ref.artefactos[k] = conTextosNuevos(ref.artefactos[k]);

  expect(nueva.errores, 'errores de JavaScript en la app nueva').toEqual(ref.errores);
  const claves = [...new Set([...Object.keys(ref.artefactos), ...Object.keys(nueva.artefactos)])].sort();
  const distintos = [];
  // GUARDAR_TODO=1 escribe también los artefactos iguales (para inspeccionar qué se captura)
  if (process.env.GUARDAR_TODO) for (const k of claves) await guardar(caso, 'nueva', k, nueva.artefactos[k]);
  // Artefactos que cambian a propósito (artefactos-divergentes.mjs): los compara su
  // prueba de divergencia. Aquí solo se exige que sigan difiriendo (si no, la lista está vieja).
  const divergentes = divergentesDe(caso);
  for (const [k, d] of divergentes) {
    const a = ref.artefactos[k], b = nueva.artefactos[k];
    if (a == null || b == null || equivalentes(a, b)) distintos.push(`${k}: figura como divergente (${d}) en artefactos-divergentes.mjs, pero ${a == null || b == null ? 'falta en una de las dos' : 'ya coincide con el MVP'}`);
  }
  for (const k of claves) {
    const a = ref.artefactos[k], b = nueva.artefactos[k];
    if (divergentes.has(k)) continue;
    if (equivalentes(a, b)) continue;
    distintos.push(`${k}: ${a == null || b == null ? 'falta en una de las dos' : primeraDiferencia(a, b)}`);
    await guardar(caso, 'referencia', k, a);
    await guardar(caso, 'nueva', k, b);
  }
  expect(distintos, `${distintos.length} de ${claves.length} artefactos difieren`).toEqual([]);
  return claves.length;
}
