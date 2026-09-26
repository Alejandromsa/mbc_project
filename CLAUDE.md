# CLAUDE.md

Este archivo orienta a Claude Code (claude.ai/code) cuando trabaja con el código de este repositorio.

## Contexto

ProcessIQ, plataforma BPMN de MBC. Este repo es la **v4**: la arquitectura objetivo está en `docs/arquitectura.md`. La **fase 1 (fundaciones)** portó el MVP 3.8.9 a paquetes TypeScript sin cambiar su comportamiento. El MVP original vive en otro repo (`nelson2206/process-iq`); aquí hay una copia congelada en `pruebas/fidelidad/referencia-mvp/`, que es el oráculo de las pruebas. La **fase 2 (plataforma)** añade Postgres y una API con cuentas locales, proyectos, procesos y revisiones (Entra ID llegará cuando TI registre la aplicación).

Código, comentarios, textos de interfaz y documentación en **español**.

- **`docs/lecciones-aprendidas.md`**: errores ya cometidos en este repo y cómo evitarlos. Léelo al empezar y añade una entrada (qué pasó → regla) cada vez que un error cueste tiempo o produzca un resultado falso.
- **`docs/fase1-divergencias.md`**: fallos del MVP corregidos y diferencias intencionales.
- **`docs/mvp/HANDOFF.md`**: lecciones del MVP (layout, PPTX, IA, rarezas del navegador). Léelo antes de tocar el auto-layout, el export PPTX o la ingesta.

## Comandos

```bash
pnpm install
pnpm dev                                        # web (Vite) en :5173 (copia /vendor y arranca)
pnpm typecheck && pnpm test                     # tipos y unitarias de todos los paquetes (turbo)
pnpm fronteras                                  # dependencias permitidas entre paquetes
pnpm fidelidad                                  # build de la web + comparación con el MVP (Playwright, ~2,5 min)
pnpm --filter @processiq/motor test             # un solo paquete
pnpm --filter @processiq/pruebas-fidelidad exec playwright test -g "loadComplex11$"   # un escenario (¡tras build!)
docker compose --profile dev up -d postgres-dev # Postgres de desarrollo en :5440 (lo necesitan las pruebas de la API)
pnpm --filter @processiq/api dev                # API en :8790 con .env.dev (copiar de .env.dev.example); Vite reenvía /api
pnpm --filter @processiq/api semilla            # cuentas de prueba (*@processiq.test, clave Prueba-ProcessIQ-2026) y proyectos en todos los estados
pnpm --filter @processiq/api worker             # worker de IA (cola ejecuciones_ia); con ANTHROPIC_API_KEY en .env.dev gasta de verdad
pnpm --filter @processiq/api exec vitest run -t "numera las revisiones"   # una prueba de la API
pnpm --filter @processiq/db generar             # nueva migración tras cambiar packages/db/src/esquema.ts
pnpm e2e                                        # build + shell/editor/API/Postgres de punta a punta (Playwright, ~1 min; base processiq_e2e)
infra/desplegar.sh staging | produccion [version] | versiones   # servidor: staging, promoción y reversión (docs/runbooks/despliegue.md)
```

## Estructura

```text
packages/            TypeScript, exportan su fuente (./src/index.ts); Vite y Vitest la consumen sin build
  dominio/           modelo, catálogos, ficha, validación (Playbook MBB), recorrido, esquema v1 + migración (Zod)
  motor/             auto-layout por carriles, ruteo (heurística + A*), calidad, niveles, operaciones del grafo
  bpmn/              import/export BPMN 2.0
  exportar/          PPTX (temas mbc y bbva), informe Word, Ficha de Proceso
  documentos/        extracción Word/PDF/PPTX/texto, intérprete básico de texto, participantes
  mining/            event logs CSV -> proceso, variantes
  analitica/         simulador, cuello de botella, automatización, mapa de valor, backlog, What-If
  ia/                prompts, cliente de Claude en streaming, costes, construcción e interpretación
  db/                esquema Drizzle, migraciones SQL (migraciones/) y conexión; solo lo usa la API
apps/
  web/               dos páginas: el editor (/, src/app/, JS del MVP en módulos ES) y el shell (/proyectos/, src/shell/, React + TS)
  api/               Hono + Postgres: sesiones, usuarios, proyectos, procesos, revisiones, auditoría; cli.ts
                     ia/ + rutas/ia.ts + worker.ts: IA en el servidor (cola, ejecución, SSE, consumo)
  intermediario/     guarda la clave de Anthropic; contrato del antiguo Cloudflare Worker
pruebas/fidelidad/   MVP congelado frente a la app nueva (fidelidad, interacciones, divergencias)
pruebas/e2e/         flujos de la plataforma con la web construida, la API real y Postgres
herramientas/        fronteras.mjs
infra/               Caddyfile y Dockerfiles
```

- `apps/web/src/app/` son los ~60 módulos de interfaz del MVP. Leen y escriben el `state` compartido (`estado.js`) y delegan el cálculo en los paquetes. `window.ProcessIQ` (definido en `inicio.js`) es el gancho de pruebas que usa la fidelidad: no romperlo.
- Las cachés viven en la app y la lógica pura en los paquetes: por ejemplo, las rutas memorizadas por arista están en `lienzo/ruteo.js` y la geometría en `@processiq/motor`.
- Las librerías de navegador (pptxgenjs 3.12.0, JSZip 3.10.1, mammoth 1.8.0, pdf.js 4.7.76) se instalan por npm con versión exacta y `scripts/copiar-vendor.mjs` las copia a `public/vendor/` en cada `dev`/`build`.
- `pptx.ts`, `word.ts`, `ficha.ts` y `extraccion.ts` están portados tal cual con `// @ts-nocheck` (deuda: tiparlos). **En esos archivos, solo el build detecta imports rotos.**
- `vite.config.js` tiene `cssMinify: false` a propósito: la app copia variables CSS a los SVG y el minificador cambiaba las mayúsculas de los colores.
- Shell (`apps/web/src/shell`, `proyectos/index.html`):
  - React 19 + TanStack Query + wouter (base `/proyectos`); TypeScript estricto (`pnpm --filter @processiq/web typecheck`).
  - `api.ts` es el cliente tipado de la API y lo comparte la integración del editor; `permisos.ts` copia las capacidades de la API solo para mostrar u ocultar botones.
  - Rutas del lado del cliente: Caddy (`try_files`) y el plugin de `vite.config.js` sirven `proyectos/index.html` para cualquier `/proyectos/...`.
  - `src/tokens.css` (colores, tipografía, espacios) lo comparten editor y shell.
- Integración del editor (`src/app/plataforma/proyecto.js`):
  - Solo se activa con `/?proceso=…` o `/?revision=…`; sin esos parámetros no hace nada y el editor es el del MVP (lo comprueban la fidelidad y la última prueba E2E).
  - En modo proyecto, el trabajo se guarda en `processiq.proceso.<id>`, no en `processiq.v1` (`usarClaveAlmacen` de `estado.js`). Hay un borrador por proceso y se ofrece recuperarlo.
  - `persist()` avisa por `cambios.js` para detectar cambios sin guardar (huella del contenido normalizado con `migrarProyecto`, sin `CLAVES_EFIMERAS`).
  - «Guardar revisión» envía el contenido v1 con `padreId` = revisión abierta; la API marca el conflicto.
- Catálogos administrables (fase 2.4a; `apps/api/src/catalogos.ts`, `rutas/catalogos.ts`, `apps/web/src/app/plataforma/catalogos.js`):
  - KPIs (`codigo` = id que guardan los procesos, nunca cambia), verbos del Playbook y temas PPTX de cliente, por organización.
  - Se siembran con los del MVP (`asegurarCatalogos`).
  - En modo proyecto el editor **reemplaza en sitio** `KPI_LIBRARY`, `VERBS_ALLOWED`, `VERBS_FORBIDDEN` y `TEMAS_PPTX`. Así editor (`window.*`), linter y PPTX los usan por referencia sin tocar el código portado.
  - Los temas de cliente añaden su botón al menú Exportar.
- Observabilidad (fase 2.4b; `apps/api/src/observabilidad.ts`, `rutas/sistema.ts`, `apps/web/src/shell/observabilidad.ts`):
  - Los errores 500 de la API se registran en la tabla `errores` (la respuesta lleva la referencia `X-Request-Id`); los 4xx no se registran.
  - La web informa a `POST /api/errores`: el shell siempre, el editor solo en modo proyecto.
  - El worker registra sus errores y da su latido (`latidos`).
  - `GET /api/sistema` junta todo y calcula los avisos.
  - No hay servicios externos de monitorización.
- API (`apps/api`):
  - Sesión por cookie `piq_sesion` (httpOnly; en la base solo se guarda el hash del token). Las escrituras exigen `Origin` igual a `ORIGEN_PUBLICO` (CSRF). Con contraseña temporal solo se permite cambiarla.
  - Permisos en `permisos.ts`: rol de organización (`admin`/`consultor`/`lector`) y rol por proyecto (`propietario`/`editor`/`revisor`/`lector`). Un proyecto sin acceso devuelve 404, no 403.
  - Revisiones: el contenido es JSON v1 validado con `migrarProyecto` de `dominio`. El número se asigna bajo `select … for update` sobre el proceso. Si `padreId` no es la última revisión, se guarda igual y se responde `conflicto: true`. Una revisión `aprobada` es inmutable.
  - Errores: `{ error: { mensaje, codigo, detalles } }`, lanzados con `ErrorHttp`. Toda escritura relevante llama a `registrar()` (auditoría).
  - `scripts/construir.mjs` empaqueta con esbuild (`servidor`, `worker`, `cli`) y copia `packages/db/migraciones` a `dist/`; la API migra al arrancar y el worker no.
- IA en el servidor (fase 2.3, `apps/api/src/ia`, `rutas/ia.ts`):
  - La fila de `ejecuciones_ia` es el trabajo: el worker la toma con `SKIP LOCKED` (`cola.ts`) y la ejecuta con `llamarClaude` en modo `servidor` de `@processiq/ia` (`ejecutar.ts`).
  - Reintenta lo que `clasificarErrorIa` considera transitorio, repara una vez el JSON, suma tokens y coste, y borra el texto de las fuentes al terminar.
  - Avisos por `LISTEN/NOTIFY` (`avisos.ts`): `ia_cola` despierta al worker e `ia_ejecucion` alimenta el SSE `/api/ia/ejecuciones/:id/eventos`, que envía el estado completo en cada evento, así que reconectar es seguro.
  - **El cliente nunca envía prompts:** envía el texto de las fuentes o el proceso. El servidor decide prompt, modelo (dentro de los permitidos), esfuerzo y topes (presupuesto mensual y límite por persona).
  - En el editor, `ia/remota.js` es el punto de enganche. Si `plataforma/ia.js` registró la IA remota (modo proyecto), generación, pains y tareas del copiloto van al servidor; si no, se comportan igual que el MVP.
  - La especificación generada la dibuja el editor (`buildProcessFromAiSpec`) y se guarda como revisión con `ejecucionIaId`.
- Servidor: Caddy sirve `apps/web/dist`, obtiene el certificado por TLS-ALPN (IIS ocupa el puerto 80), enruta `/api/*` a la API y `/ia/*` al intermediario. La web llama a la IA en su mismo origen (`location.origin + '/ia'`). El dominio sale de `.env` (`DOMINIO`); `index.html` se sirve como plantilla (`{{.Host}}` en Open Graph).

## Reglas de trabajo

- **`pnpm fidelidad` en verde después de cada cambio en la web o en un paquete.** Compara, entre el MVP congelado y la app nueva:
  - los 14 ejemplos: JSON, SVG, BPMN, Word, Ficha, láminas PPTX y 3 niveles;
  - el copiloto, los comandos, deshacer, minería, ingesta de texto y de archivos, importación BPMN e IA simulada (peticiones incluidas);
  - paneles y vistas.

  Si algo difiere, los artefactos quedan en `pruebas/fidelidad/resultados/<caso>/`. Todo se compara byte a byte. La única tolerancia es de ±0,25 px en `x`/`width` de `rect.edge-label-bg`: con la máquina cargada, la medición de las etiquetas largas varía de forma intermitente (ver `comparar.mjs`).
- **Nunca editar `pruebas/fidelidad/referencia-mvp/`.** Un cambio intencional de comportamiento se registra en `docs/fase1-divergencias.md` y se prueba en `divergencias.spec.mjs`.
- Antes de tocar un área que la fidelidad no cubre, **añadir primero el escenario** y ver que pasa.
- **Portar sin reescribir:** mover el código tal cual (con scripts que copian el texto literal y verifican con `diff`) y cambiar solo la frontera: parámetros en lugar de `state` y de globales. Los prompts y mensajes se comparan byte a byte.
- **Fronteras** (las comprueba `pnpm fronteras` en la CI): `dominio` no depende de ningún paquete del monorepo; los demás paquetes solo de `dominio`; `packages/*` nunca importan de `apps/*`. `dominio` solo usa ECMAScript estándar (nada de DOM ni Node en `src/`).
- **Esquema de la base:** nunca editar una migración ya publicada. Las migraciones deben ser compatibles con la versión anterior (se añade; no se borra ni se renombra en el mismo despliegue), para poder revertir con `infra/desplegar.sh produccion <anterior>`. Se cambia `packages/db/src/esquema.ts`, se genera la migración nueva con `pnpm --filter @processiq/db generar` y se revisa el SQL antes de confirmarlo.
- Cada ruta nueva de la API lleva pruebas de integración en `apps/api/src/*.test.ts` contra Postgres real (`pruebas/entorno.ts`), incluidos los casos de permiso denegado.
- La IA del servidor se prueba sin red ni gasto:
  - integración (`apps/api/src/ia.test.ts`), con un `fetch` falso que imita el SSE de Anthropic;
  - E2E, con `pruebas/e2e/src/anthropic-falso.mjs`, que además arranca el worker real.
- Cada flujo nuevo de la plataforma (shell o editor en modo proyecto) lleva su prueba en `pruebas/e2e/*.spec.mjs`. **Cambios en `src/app/`: `pnpm fidelidad` y `pnpm e2e` en verde.**
- Pantalla nueva o cambiada: revisar una captura (Playwright `page.screenshot`) antes de darla por buena; las pruebas verdes no ven el diseño.

## Rarezas del entorno (Windows)

- **No usar heredocs ni `sed` con código que contenga `\`**: la shell se come las barras. Los scripts se escriben con el editor en el directorio temporal y se ejecutan desde ahí.
- El `curl` de Git Bash devuelve `000` con `-w`/`-o /dev/null`: usar `-v` u `-o NUL`.
- El puerto 5432 del PC lo ocupa un Postgres nativo: el de desarrollo va en el 5440. No pasar binarios por tubería a `docker compose exec -T` (se corrompen).
- En una pestaña oculta del navegador los timers se estrangulan y el export PPTX no termina; Playwright headless no tiene ese problema.
