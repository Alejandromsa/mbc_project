// Copia los bundles de navegador de las librerías (instaladas por npm con la
// versión exacta que usaba el MVP por CDN) a public/vendor/, que Vite publica
// tal cual. Así la app no depende de jsDelivr y se sirve desde su dominio.
// Se ejecuta antes de `vite` y `vite build` (ver package.json).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(raiz, 'package.json'));
const destino = join(raiz, 'public', 'vendor');
mkdirSync(destino, { recursive: true });

const ARCHIVOS = [
  ['pptxgenjs/dist/pptxgen.bundle.js', 'pptxgen.bundle.js'],
  ['jszip/dist/jszip.min.js', 'jszip.min.js'],
  ['mammoth/mammoth.browser.min.js', 'mammoth.browser.min.js'],
  ['pdfjs-dist/build/pdf.min.mjs', 'pdf.min.mjs'],
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs']
];

for (const [origen, nombre] of ARCHIVOS) {
  copyFileSync(require.resolve(origen), join(destino, nombre));
}
console.log(`vendor: ${ARCHIVOS.length} archivos copiados a public/vendor/`);
