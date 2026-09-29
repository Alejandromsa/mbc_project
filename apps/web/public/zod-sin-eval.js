// zod (lo usan @processiq/dominio e @processiq/ia) compila sus validadores con
// `new Function` si puede, y para saberlo lo prueba al crear cada esquema. La
// web se sirve con una Content-Security-Policy sin 'unsafe-eval' (infra/Caddyfile):
// la prueba falla sin romper nada, pero el navegador registra una violación en
// cada carga. En modo `jitless`, zod no prueba y valida igual (sin compilar).
//
// Es un script clásico, no un módulo: corre antes que cualquier módulo de la
// página, y por tanto antes de que se cree ningún esquema, sea cual sea el orden
// de los chunks del build. zod adopta este objeto al cargar (lo documenta en
// v4/core/core.ts, `__zod_globalConfig`). Si deja de hacerlo, la E2E de la CSP
// (pruebas/e2e/csp.spec.mjs) falla con una violación de script-src.
globalThis.__zod_globalConfig = Object.assign(globalThis.__zod_globalConfig || {}, { jitless: true });
