// Antes de cada ejecución (globalSetup de Playwright): borra los artefactos que
// dejó la anterior en resultados/<caso>/, para que no queden restos que parezcan
// fallos de esta. resultados/playwright (outputDir) lo vacía Playwright.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export default function limpiarResultados() {
  const carpeta = join(import.meta.dirname, '..', 'resultados');
  if (!existsSync(carpeta)) return;
  for (const nombre of readdirSync(carpeta)) {
    if (nombre !== 'playwright') rmSync(join(carpeta, nombre), { recursive: true, force: true });
  }
}
