// Empaqueta la API en dist/ con esbuild: los paquetes del monorepo (fuente TS)
// y las dependencias van dentro del bundle; la imagen Docker solo necesita Node
// y las migraciones SQL (se copian a dist/migraciones).
import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
rmSync(dist, { recursive: true, force: true });

await build({
  entryPoints: { servidor: join(raiz, 'src/servidor.ts'), cli: join(raiz, 'src/cli.ts') },
  outdir: dist,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // pg intenta cargar su variante nativa opcional; no se usa
  external: ['pg-native'],
  // Las dependencias CommonJS (pg) necesitan require dentro de un bundle ESM
  banner: { js: "import { createRequire as __crearRequire } from 'node:module'; const require = __crearRequire(import.meta.url);" },
  logLevel: 'warning'
});

cpSync(join(raiz, '..', '..', 'packages', 'db', 'migraciones'), join(dist, 'migraciones'), { recursive: true });
console.log('api: dist/servidor.js, dist/cli.js y dist/migraciones');
