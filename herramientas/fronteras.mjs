// Comprueba las fronteras entre paquetes (docs/arquitectura.md §5):
//   - @processiq/dominio no depende de ningún otro paquete del monorepo;
//   - bpmn, motor, exportar, mining, analitica, ia y documentos solo dependen de dominio;
//   - ningún paquete importa de apps/* (ni por ruta relativa).
// Revisa las dependencias declaradas (package.json) y los imports reales de src/.
// Uso: node herramientas/fronteras.mjs   (sale con código 1 si hay violaciones)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERMITIDOS = {
  '@processiq/dominio': [],
  '@processiq/db': ['@processiq/dominio'],
  '@processiq/bpmn': ['@processiq/dominio'],
  '@processiq/motor': ['@processiq/dominio'],
  '@processiq/exportar': ['@processiq/dominio'],
  '@processiq/mining': ['@processiq/dominio'],
  '@processiq/analitica': ['@processiq/dominio'],
  '@processiq/ia': ['@processiq/dominio'],
  '@processiq/documentos': ['@processiq/dominio']
};

const archivos = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? archivos(p) : (/\.(ts|js|mjs)$/.test(p) ? [p] : []);
});

const violaciones = [];
const dirPaquetes = join(RAIZ, 'packages');
for (const nombreDir of readdirSync(dirPaquetes)) {
  const dir = join(dirPaquetes, nombreDir);
  const pj = join(dir, 'package.json');
  if (!existsSync(pj)) continue;
  const pkg = JSON.parse(readFileSync(pj, 'utf8'));
  const permitidos = PERMITIDOS[pkg.name];
  if (!permitidos) { violaciones.push(`${pkg.name}: paquete sin reglas de frontera (añádelo en herramientas/fronteras.mjs)`); continue; }

  const declarados = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => d.startsWith('@processiq/'));
  for (const d of declarados) if (!permitidos.includes(d)) violaciones.push(`${pkg.name}: declara ${d} en package.json`);

  const src = join(dir, 'src');
  if (!existsSync(src)) continue;
  for (const archivo of archivos(src)) {
    const texto = readFileSync(archivo, 'utf8');
    for (const m of texto.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const esp = m[1] || m[2];
      const donde = relative(RAIZ, archivo).split(sep).join('/');
      if (esp.startsWith('@processiq/') && !permitidos.includes(esp.split('/').slice(0, 2).join('/'))) {
        violaciones.push(`${donde}: importa ${esp}`);
      }
      if (esp.startsWith('.')) {
        const destino = resolve(dirname(archivo), esp);
        if (!destino.startsWith(dir + sep)) violaciones.push(`${donde}: importa fuera de su paquete (${esp})`);
      }
    }
  }
}

if (violaciones.length) {
  console.error('Fronteras entre paquetes violadas:\n  - ' + violaciones.join('\n  - '));
  process.exit(1);
}
console.log(`Fronteras OK (${Object.keys(PERMITIDOS).length} paquetes).`);
