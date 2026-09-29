// Copia los bundles de navegador de las librerías (instaladas por npm con la
// versión exacta que usaba el MVP por CDN) a public/vendor/, que Vite publica
// tal cual. Así la app no depende de jsDelivr y se sirve desde su dominio.
// También copia Montserrat a public/fonts/ (montserrat.css las declara), para
// no depender de Google Fonts: lo exige la Content-Security-Policy.
// Se ejecuta antes de `vite` y `vite build` (ver package.json).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(raiz, 'package.json'));

function copiar(carpeta, archivos) {
  const destino = join(raiz, 'public', carpeta);
  mkdirSync(destino, { recursive: true });
  for (const [origen, nombre] of archivos) copyFileSync(require.resolve(origen), join(destino, nombre));
  console.log(`${carpeta}: ${archivos.length} archivos copiados a public/${carpeta}/`);
}

copiar('vendor', [
  ['pptxgenjs/dist/pptxgen.bundle.js', 'pptxgen.bundle.js'],
  ['jszip/dist/jszip.min.js', 'jszip.min.js'],
  ['mammoth/mammoth.browser.min.js', 'mammoth.browser.min.js'],
  ['pdfjs-dist/build/pdf.min.mjs', 'pdf.min.mjs'],
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs']
]);

// Montserrat variable de @fontsource-variable/montserrat (versión exacta): sus
// woff2 son byte a byte los que Google Fonts servía a Chrome (v31), con los mismos
// subconjuntos. Solo la cara normal; la licencia (OFL 1.1) viaja con las fuentes.
const SUBCONJUNTOS = ['cyrillic-ext', 'cyrillic', 'vietnamese', 'latin-ext', 'latin'];
copiar('fonts', [
  ...SUBCONJUNTOS.map((s) => [`@fontsource-variable/montserrat/files/montserrat-${s}-wght-normal.woff2`, `montserrat-${s}-wght-normal.woff2`]),
  ['@fontsource-variable/montserrat/LICENSE', 'OFL.txt']
]);
