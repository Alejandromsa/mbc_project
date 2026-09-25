import { defineConfig, devices } from '@playwright/test';
import { PUERTO_REFERENCIA, PUERTO_NUEVA } from './src/puertos.mjs';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  timeout: 10 * 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'resultados/playwright',
  use: { ...devices['Desktop Chrome'] },
  webServer: [
    {
      command: `node src/servidor-estatico.mjs referencia-mvp ${PUERTO_REFERENCIA}`,
      url: `http://127.0.0.1:${PUERTO_REFERENCIA}/`,
      reuseExistingServer: !process.env.CI
    },
    {
      // La app nueva se prueba ya construida: ejecutar antes `pnpm --filter @processiq/web build`
      command: `node src/servidor-estatico.mjs ../../apps/web/dist ${PUERTO_NUEVA}`,
      url: `http://127.0.0.1:${PUERTO_NUEVA}/`,
      reuseExistingServer: !process.env.CI
    }
  ]
});
