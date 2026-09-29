import { defineConfig, devices } from '@playwright/test';
import { BASE, PUERTO_ANTHROPIC, PUERTO_API, URL_BASE_DATOS } from './src/entorno.mjs';

// Requisitos: Postgres de desarrollo en :5440 (docker compose -f docker-compose.dev.yml up -d)
// y la web construida (el script "e2e" la construye antes).
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Todas las pruebas comparten la base de datos: una detrás de otra
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'resultados',
  // Falla si alguna prueba violó la CSP del Caddyfile (la web se sirve con ella: src/servidor.mjs)
  globalTeardown: './src/comprobar-csp.mjs',
  use: { ...devices['Desktop Chrome'], baseURL: BASE, trace: 'retain-on-failure' },
  webServer: [
    {
      // Base nueva con la semilla y, después, la API real (tsx, sin construir)
      command: 'pnpm --filter @processiq/api semilla --desde-cero && pnpm --filter @processiq/api exec tsx src/servidor.ts',
      url: `http://127.0.0.1:${PUERTO_API}/api/salud`,
      env: { DATABASE_URL: URL_BASE_DATOS, ORIGEN_PUBLICO: BASE, PORT: String(PUERTO_API), ANTHROPIC_API_KEY: 'sk-ant-e2e' },
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      // Anthropic falso + el worker de IA apuntando a él
      command: 'node src/anthropic-falso.mjs',
      url: `http://127.0.0.1:${PUERTO_ANTHROPIC}/salud`,
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: 'node src/servidor.mjs',
      url: `${BASE}/`,
      reuseExistingServer: false
    }
  ]
});
