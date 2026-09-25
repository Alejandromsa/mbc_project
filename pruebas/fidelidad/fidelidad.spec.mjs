// Fidelidad de los 14 procesos de ejemplo: carga, exports y niveles de detalle.
// Cada proceso se carga en el MVP 3.8.9 congelado (referencia-mvp/) y en la app
// nueva (apps/web/dist); todos sus artefactos deben ser idénticos.
import { test } from '@playwright/test';
import { DEMOS, capturarDemo } from './src/escenarios.mjs';
import { compararEnAmbas } from './src/comparar.mjs';

for (const demo of DEMOS) {
  test(`fidelidad: ${demo}`, async ({ browser }) => {
    await compararEnAmbas(browser, demo, (page) => capturarDemo(page, demo));
  });
}
