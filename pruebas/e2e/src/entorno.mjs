// Entorno de las pruebas E2E: la web construida (apps/web/dist) y la API real
// contra una base propia (processiq_e2e) en el Postgres de desarrollo.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PUERTO_WEB = 4480;
export const PUERTO_API = 8792;
export const BASE = `http://127.0.0.1:${PUERTO_WEB}`;
export const URL_BASE_DATOS = process.env.E2E_DATABASE_URL ?? 'postgres://processiq:processiq@localhost:5440/processiq_e2e';
export const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));

/** Contraseña de las cuentas de la semilla (apps/api/src/semilla.ts). */
export const CLAVE = 'Prueba-ProcessIQ-2026';
export const correo = (usuario) => `${usuario}@processiq.test`;

/** Base vacía y datos de la semilla: cada prueba parte del mismo estado. */
export function reiniciarDatos() {
  execSync('pnpm --filter @processiq/api semilla --desde-cero', {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: URL_BASE_DATOS },
    stdio: 'pipe'
  });
}
