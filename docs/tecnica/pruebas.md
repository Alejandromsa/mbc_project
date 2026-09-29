# Pruebas y CI

Qué prueba cada nivel, cómo ejecutarlo entero o de a una prueba, qué hace la CI paso a paso y cómo depurar cada tipo de fallo.

Actualizado: 29-sep-2026.

Recuentos medidos en esa fecha con `vitest list` y `playwright test --list` sobre `main`, y comprobados ejecutando las unitarias de los paquetes. Si añades pruebas, actualiza las tablas.

## Contenido

1. [La pirámide](#1-la-pirámide)
2. [Comandos rápidos](#2-comandos-rápidos)
3. [Fronteras entre paquetes](#3-fronteras-entre-paquetes)
4. [Tipos](#4-tipos)
5. [Unitarias de los paquetes](#5-unitarias-de-los-paquetes)
6. [Intermediario](#6-intermediario)
7. [Integración de la API](#7-integración-de-la-api)
8. [Fidelidad frente al MVP](#8-fidelidad-frente-al-mvp)
9. [E2E de la plataforma](#9-e2e-de-la-plataforma)
10. [La CI paso a paso](#10-la-ci-paso-a-paso)
11. [Dónde quedan los artefactos](#11-dónde-quedan-los-artefactos)
12. [Cómo depurar cada tipo de fallo](#12-cómo-depurar-cada-tipo-de-fallo)

## 1. La pirámide

```text
                 manual: bench/ con procesos reales, capturas de pantalla
              E2E (32)            web construida + API + worker + Postgres, con la CSP de producción
         Fidelidad (32)           app nueva frente al MVP 3.8.9 congelado
     Integración API (44)         rutas y permisos contra Postgres real
  Unitarias (102 + 7)             paquetes e intermediario, sin red
Fronteras · tipos · build · auditoría de dependencias · imágenes Docker
```

| Nivel | Herramienta | Dónde | Pruebas | Necesita | Duración aprox. |
|---|---|---|---|---|---|
| Fronteras | Node | [herramientas/fronteras.mjs](../../herramientas/fronteras.mjs) | 1 comprobación (9 paquetes), con 10 casos de ejemplo del extractor de imports | Nada | Segundos |
| Tipos | `tsc --noEmit` | Cada paquete y app | — | Nada | — |
| Unitarias de paquetes | Vitest | `packages/*/src/*.test.ts` | 102 | Nada | Segundos |
| Intermediario | Vitest | [apps/intermediario/src/index.test.ts](../../apps/intermediario/src/index.test.ts) | 7 | Nada | Segundos |
| Integración de la API | Vitest | `apps/api/src/*.test.ts` | 44 | Postgres de desarrollo | — |
| Fidelidad | Playwright | [pruebas/fidelidad](../../pruebas/fidelidad) | 33 | Web construida, Chromium, internet | ~2,5 min |
| E2E | Playwright | [pruebas/e2e](../../pruebas/e2e) | 32 | Web construida, Chromium, Postgres de desarrollo | ~5 min |
| Imágenes | `docker compose build` | [infra/](../../infra) | — | Docker | — |
| Banco de calidad | Consola del navegador | [bench/](../../bench/README.md) | Manual | Procesos reales fuera del repositorio | — |

**Total automatizado: 217 pruebas** (102 + 7 + 44 + 32 + 32).

Lo que las pruebas no ven: el diseño. Toda pantalla nueva o cambiada se revisa con una captura (`page.screenshot`) antes de darla por buena ([lección 19](../lecciones-aprendidas.md)).

## 2. Comandos rápidos

Todos desde la raíz del repositorio.

| Qué | Todo | Una sola |
|---|---|---|
| Fronteras | `pnpm fronteras` | — |
| Tipos | `pnpm typecheck` | `pnpm --filter @processiq/motor typecheck` |
| Unitarias + integración | `pnpm test` (necesita Postgres) | `pnpm --filter @processiq/motor exec vitest run -t "nivel 3"` |
| Solo los paquetes | `pnpm --filter "./packages/*" test` | `pnpm --filter @processiq/motor exec vitest run src/motor.test.ts` |
| Integración de la API | `pnpm --filter @processiq/api test` | `pnpm --filter @processiq/api exec vitest run -t "numera las revisiones"` |
| Fidelidad | `pnpm fidelidad` (construye y prueba) | `pnpm --filter @processiq/pruebas-fidelidad exec playwright test -g "loadComplex11$"` (**después** de construir) |
| E2E | `pnpm e2e` (construye y prueba) | `pnpm --filter @processiq/pruebas-e2e exec playwright test -g "conflicto"` (**después** de construir) |
| Construir la web | `pnpm --filter @processiq/web build` | — |

`pnpm test`, `pnpm typecheck` y `pnpm build` pasan por Turborepo ([turbo.json](../../turbo.json)). `test` depende del build de las dependencias y recibe la variable `TEST_DATABASE_URL`.

## 3. Fronteras entre paquetes

[fronteras.mjs](../../herramientas/fronteras.mjs) revisa las dependencias declaradas en cada `package.json` de `packages/` y los `import` reales de su `src/`.

| Paquete | Puede depender de |
|---|---|
| `@processiq/dominio` | Ningún paquete del monorepo |
| `db`, `bpmn`, `motor`, `exportar`, `mining`, `analitica`, `ia`, `documentos` | Solo `@processiq/dominio` |
| Cualquier paquete | Nunca de `apps/*`, ni por ruta relativa fuera de su carpeta |

Un paquete nuevo sin regla en `PERMITIDOS` también falla. Sale con código 1 y la lista de violaciones.

Qué cuenta como import: `import … from '…'`, `import '…'` (solo por sus efectos), `export … from '…'` (también `export * from` y `export * as`), `import type` e `import('…')`. Hasta el 29-sep-2026 no veía `import '…'`. Antes de revisar nada, el script pasa el extractor por 10 casos de ejemplo (`CASOS`, incluido uno que **no** es un import: `export const x = '…'`); si alguno falla, sale con código 1. Un caso nuevo se añade ahí.

Que `dominio` solo use ECMAScript estándar (sin DOM ni Node) no lo comprueba este script: lo detecta el typecheck, porque los paquetes compilan con `lib: ES2022` ([lección 5c](../lecciones-aprendidas.md)).

## 4. Tipos

- `pnpm typecheck` ejecuta `tsc --noEmit` en cada paquete y app.
- En la web solo se comprueba el shell (`apps/web/src/shell`, TypeScript estricto). El editor (`src/app/`) es JavaScript portado del MVP.
- Ningún archivo lleva ya `// @ts-nocheck`: los cuatro portados del MVP (`pptx.ts`, `word.ts`, `ficha.ts` y `extraccion.ts`) se tiparon el 28-sep-2026.
- Tras tocar `dominio`, ejecuta el typecheck desde la raíz: cada paquete compila la fuente de sus dependencias con su propia configuración.

## 5. Unitarias de los paquetes

Vitest sin configuración propia: `vitest run` en cada paquete. No usan red ni base de datos.

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| [dominio/src/dominio.test.ts](../../packages/dominio/src/dominio.test.ts) | 8 | Ficha de proceso y catálogos |
| [dominio/src/esquema.test.ts](../../packages/dominio/src/esquema.test.ts) | 8 (7 definiciones; una `it.each` con 2 casos) | `migrarProyecto`: migración del export del MVP a v1, idempotencia, datos antiguos, rechazos |
| [dominio/src/validacion.test.ts](../../packages/dominio/src/validacion.test.ts) | 5 | `validarProceso` (Playbook MBB) |
| [motor/src/motor.test.ts](../../packages/motor/src/motor.test.ts) | 17 | Operaciones del grafo, layout, ruteo y calidad, niveles de detalle |
| [bpmn/src/bpmn.test.ts](../../packages/bpmn/src/bpmn.test.ts) | 9 | `generarBpmnXml` y `leerBpmn` |
| [exportar/src/exportar.test.ts](../../packages/exportar/src/exportar.test.ts) | 7 | Ficha de Proceso, informe Word, PPTX |
| [documentos/src/documentos.test.ts](../../packages/documentos/src/documentos.test.ts) | 7 | Intérprete de texto, proceso básico, participantes |
| [mining/src/mining.test.ts](../../packages/mining/src/mining.test.ts) | 8 | Lectura de CSV y descubrimiento del proceso con la muestra |
| [analitica/src/analitica.test.ts](../../packages/analitica/src/analitica.test.ts) | 11 | Simulación, diagnóstico, backlog y What-If |
| [ia/src/ia.test.ts](../../packages/ia/src/ia.test.ts) | 22 | `llamarClaude` (streaming), `extraerJson`, costes, prompts, modo servidor, especificación de la generación |
| **Total** | **102** | |

Datos de prueba: los ejemplos del MVP en [packages/dominio/src/\_\_fixtures\_\_](../../packages/dominio/src/__fixtures__), que ya eran públicos. Nunca procesos de cliente.

Consejos:

- Modo vigilancia mientras programas: `pnpm --filter @processiq/motor exec vitest`.
- Vitest oculta los `console.log` de las pruebas que pasan. Para ver la salida real, usa `toMatchInlineSnapshot()` con `vitest run -u` y revisa el snapshot ([lección 5](../lecciones-aprendidas.md)).
- Antes de afirmar cómo se comporta el MVP en una expectativa, lee el código o captura la salida real ([lección 12](../lecciones-aprendidas.md)).

## 6. Intermediario

[index.test.ts](../../apps/intermediario/src/index.test.ts), 7 pruebas. Prueban la app de Hono en proceso, con un `fetch` falso hacia Anthropic:

- `/health` informa de la configuración sin revelar secretos (y recorta espacios);
- rechaza orígenes no permitidos, un código incorrecto, modelos fuera de la lista y JSON inválido;
- topa `max_tokens`, filtra `fallbacks` y reenvía la respuesta de Anthropic;
- un 401 de Anthropic se devuelve como 502.

## 7. Integración de la API

Contra un **Postgres real**, sin red: la app de Hono se llama en proceso (`app.request`).

### Entorno ([pruebas/entorno.ts](../../apps/api/src/pruebas/entorno.ts))

| Pieza | Qué hace |
|---|---|
| Base | `TEST_DATABASE_URL`; por defecto la base `processiq_pruebas` del Postgres de desarrollo (puerto 5440). Si no existe, la crea |
| `prepararBase()` | **Borra** los esquemas `public` y `drizzle` y aplica las migraciones desde cero, al empezar cada archivo |
| `vaciar()` | Vacía las tablas del núcleo entre pruebas (`truncate … cascade`) |
| `usuario()` | Crea una cuenta activa con contraseña conocida |
| `cliente()` | Cliente HTTP con cookies y cabecera `Origin` del origen de prueba. Admite otra configuración (p. ej. la IA sin clave) |
| [vitest.config.ts](../../apps/api/vitest.config.ts) | Un archivo cada vez (`fileParallelism: false`): comparten base. Tiempo por prueba 30 s; por *hook*, 60 s |

**No apuntes `TEST_DATABASE_URL` a una base con datos:** se borra entera.

### Archivos

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| [sesion.test.ts](../../apps/api/src/sesion.test.ts) | 11 | scrypt y reglas de contraseña; cookie; 401; salir; CSRF; bloqueo tras 10 fallos; contraseña temporal; alta, permisos y desactivación de usuarios |
| [proyectos.test.ts](../../apps/api/src/proyectos.test.ts) | 12 | Proyectos (propietario, visibilidad, 404, administración, lectores); procesos y revisiones (export del MVP, validación, numeración y conflicto, permisos, ciclo de aprobación, archivados, auditoría, directorio) |
| [ia.test.ts](../../apps/api/src/ia.test.ts) | 10 | Cola, worker, reintentos, reparación del JSON, errores definitivos, cancelación, permisos y presupuesto, análisis, SSE, consumo, ejecuciones huérfanas |
| [catalogos.test.ts](../../apps/api/src/catalogos.test.ts) | 4 | KPIs, verbos del Playbook y temas PPTX; siembra sin duplicados |
| [sistema.test.ts](../../apps/api/src/sistema.test.ts) | 5 | Huella de errores, 500 registrado con referencia, informes de la web con límite, avisos de «Sistema», purga a 30 días |
| [semilla.test.ts](../../apps/api/src/semilla.test.ts) | 2 | La semilla se puede repetir y cada cuenta se comporta según su caso |
| **Total** | **44** | |

La IA se prueba sin red ni gasto: `ia.test.ts` usa un `fetch` falso que imita el SSE de Anthropic.

Reglas:

- Cada ruta nueva lleva sus pruebas de integración, **incluidos los casos de permiso denegado**.
- Las rutas auxiliares de una prueba (p. ej. una que falla a propósito) se añaden a la app **antes** de la primera petición: Hono no admite rutas después ([lección 22d](../lecciones-aprendidas.md)).
- Varias copias del repositorio en el mismo PC: da a cada una su base, p. ej. `TEST_DATABASE_URL=postgres://processiq:processiq@localhost:5440/processiq_pruebas_<clave> pnpm --filter @processiq/api test` (credenciales fijas de desarrollo; la base se crea sola). Ver [trabajar-con-claude.md](../equipo/trabajar-con-claude.md).

## 8. Fidelidad frente al MVP

Demuestra que la app nueva se comporta **igual** que el MVP 3.8.9. El oráculo es la copia congelada en [referencia-mvp/](../../pruebas/fidelidad/referencia-mvp), que **nunca se edita**.

### Cómo funciona

- [playwright.config.mjs](../../pruebas/fidelidad/playwright.config.mjs) levanta dos servidores estáticos: el MVP en el puerto 4401 y `apps/web/dist` en el 4402.
- Cada escenario ejecuta la misma captura en las dos apps (`compararEnAmbas` en [comparar.mjs](../../pruebas/fidelidad/src/comparar.mjs)) y compara artefacto por artefacto: JSON, SVG, BPMN, Word, láminas PPTX, HTML de paneles, peticiones a la IA…
- También compara los **errores de JavaScript** de las dos páginas y los diálogos que aparecen.
- Condiciones fijas ([escenarios.mjs](../../pruebas/fidelidad/src/escenarios.mjs)): fecha 25-sep-2026 12:00 (hora de Lima), ventana de 1440 × 900, sin animaciones (`reducedMotion`), todas las caras de Montserrat cargadas y Umami bloqueado.
- 4 trabajadores en local, 2 en la CI; 10 minutos como máximo por prueba.

### La única tolerancia: ±0,25 px en `rect.edge-label-bg`

Todo se compara **byte a byte**, salvo los atributos `x` y `width` de `rect.edge-label-bg` (el fondo de las etiquetas de las flechas), que admiten ±0,25 px.

- **Por qué:** ese rectángulo toma su tamaño de la medición del texto. En corridas completas con la máquina cargada, las etiquetas largas («SLA 2h vencido», «No conforme») miden a veces hasta un 0,06 % menos en una de las dos apps (0,05 px en 90 px). No depende del zoom y la causa sigue abierta ([lecciones 7 y 7c](../lecciones-aprendidas.md)).
- **Por qué 0,25:** unas 4 veces lo máximo observado. Un cambio real (relleno, posición) mueve 1 px o más.
- **Qué sigue exacto:** el resto del artefacto, incluido el texto de la etiqueta, su `y` y el número de etiquetas.
- Toda tolerancia nueva va igual de acotada, con su motivo en el código, calibrada con varias corridas completas y con una prueba de que sigue detectando cambios reales.

### Escenarios (32)

| Spec | Escenario | Qué compara |
|---|---|---|
| [fidelidad.spec.mjs](../../pruebas/fidelidad/fidelidad.spec.mjs) | `fidelidad: <ejemplo>` × 14 (`loadDemo`, `loadComplex` a `loadComplex12`, `loadFichaVentaLotes`) | Resumen y calidad del diagrama; nombre de archivo; export JSON, SVG, BPMN, Word y Ficha; láminas PPTX con los temas `mbc` y `bbva`; y, en los niveles 1, 2 y 3, resumen, BPMN y SVG |
| [interacciones.spec.mjs](../../pruebas/fidelidad/interacciones.spec.mjs) | `copiloto: <ejemplo>` × 4 (`loadDemo`, `loadComplex`, `loadComplex11`, `loadFichaVentaLotes`) | Las 16 acciones del copiloto: mensajes, modal y diagrama resultante |
| | `comandos en lenguaje natural y deshacer` | Agregar, renombrar, conectar, marcar, eliminar y generar por comando; deshacer dos veces y rehacer |
| | `minería de event log (muestra)` | Vista previa y mapeo del CSV, proceso descubierto y variantes |
| | `texto en modo básico: <texto>` × 4 (`reclamos`, `compras`, `primeraPersona`, `transcripcion`) | Proceso que produce el intérprete sin IA |
| | `importación BPMN de los 14 ejemplos` | Importar el BPMN que exporta el MVP y volver a exportarlo |
| | `IA simulada: generación desde texto y niveles` | Diálogo de profundidad, **peticiones enviadas** (cuerpo y cabeceras), mensajes, diagrama, niveles y registro de costes |
| | `IA simulada: tareas del copiloto y pains` | Peticiones y respuestas de cada tarea de IA |
| | `ingesta de archivos: Word, PDF, PowerPoint y transcripción` | Texto extraído de cada fuente y proceso en modo básico. Los archivos se generan al vuelo ([archivos.mjs](../../pruebas/fidelidad/src/archivos.mjs)) |
| | `paneles y vistas: <ejemplo>` × 2 (`loadComplex4`, `loadFichaVentaLotes`) | Validaciones, KPIs, simulador, propiedades, pains, ficha, As-Is/To-Be con su PPTX, recarga e importación de JSON ([paneles.mjs](../../pruebas/fidelidad/src/paneles.mjs)) |
| [divergencias.spec.mjs](../../pruebas/fidelidad/divergencias.spec.mjs) | `D5` | La app nueva no pide nada a CDNs ni a analítica de terceros (solo Google Fonts), ni al exportar PPTX ni al leer archivos |
| | `F1` | El PPTX con To-Be se genera (en el MVP fallaba con `M_PRUNO is not defined`) |

La IA simulada intercepta en el navegador las llamadas a un intermediario ficticio y responde con un SSE como el de Anthropic. No hay red ni gasto.

### Qué necesita la fidelidad

- **La web construida.** `pnpm fidelidad` construye y luego prueba. Si lanzas Playwright a mano, construye antes y comprueba que el build terminó bien: si no, pruebas la versión anterior y el verde es falso ([lección 6](../lecciones-aprendidas.md)).
- **Chromium de Playwright** (`pnpm --filter @processiq/pruebas-fidelidad exec playwright install chromium`).
- **Internet:** el MVP de referencia carga pptxgenjs, mammoth, pdf.js y JSZip desde jsDelivr, y Montserrat de Google Fonts. La app nueva no pide nada fuera: sirve Montserrat desde `/fonts/`.
- **La misma Montserrat en las dos apps.** Los textos se miden con la fuente, y de esa medida salen cajas y etiquetas de los SVG y del PPTX. La app nueva usa los mismos archivos que Google servía (Montserrat v31, `@fontsource-variable/montserrat` 5.3.0) con las mismas reglas `@font-face` ([web.md §2.2](web.md#22-librerías-de-navegador-vendor)). Si un día falla la fidelidad solo en artefactos que miden texto, en las dos apps a la vez, mira primero si Google publicó otra versión de Montserrat (la URL de `fonts.gstatic.com` lleva `/v31/`): el MVP la tomaría y la app nueva no. No se relaja la tolerancia: se actualiza el paquete a la versión de Google o se hace que el arnés sirva al MVP los mismos archivos.
- **Los puertos 4401 y 4402 libres.** Fuera de la CI, Playwright **reutiliza** un servidor que ya esté escuchando ahí, aunque sea de otra copia del repositorio.

### Reglas

- `pnpm fidelidad` en verde tras cada cambio en la web o en un paquete.
- Un cambio intencional de comportamiento se registra en [fase1-divergencias.md](../fase1-divergencias.md) y se prueba en `divergencias.spec.mjs`.
- Antes de tocar un área que la fidelidad no cubre, se añade el escenario y se comprueba que pasa.
- Al añadir un escenario, ejecútalo con `GUARDAR_TODO=1` y mira que los artefactos tengan contenido de verdad, no solo que coincidan ([lección 10](../lecciones-aprendidas.md)).

## 9. E2E de la plataforma

Flujos completos con la web construida, la API real, el worker real, Postgres y un Anthropic falso.

### Entorno

[playwright.config.mjs](../../pruebas/e2e/playwright.config.mjs) arranca tres servidores ([src/](../../pruebas/e2e/src)):

| Servidor | Puerto | Qué hace |
|---|---|---|
| API | 8792 | Antes, la semilla `--desde-cero` sobre la base `processiq_e2e`. Después, la API desde la fuente (`tsx`), con `ORIGEN_PUBLICO` = la web de prueba |
| [anthropic-falso.mjs](../../pruebas/e2e/src/anthropic-falso.mjs) | 8793 | Responde `/v1/messages` en SSE, en trozos y con pausas. Además arranca el **worker real** apuntando a él (`ANTHROPIC_BASE_URL`, latido cada 3 s) |
| [servidor.mjs](../../pruebas/e2e/src/servidor.mjs) | 4480 | Hace de Caddy: `/api/*` a la API, `/proyectos/...` al shell y el resto a `apps/web/dist`, con las cabeceras de seguridad del Caddyfile (CSP incluida) |

**La E2E corre con la CSP de producción.** [csp.mjs](../../pruebas/e2e/src/csp.mjs) lee el bloque `cabeceras-seguridad` del [Caddyfile](../../infra/Caddyfile) y `servidor.mjs` lo envía en todas las respuestas. Solo en las pruebas, la CSP lleva además `report-uri /__informes-csp`: el navegador informa de cada violación (también las del worker de pdf.js) y el servidor la escribe en la consola (`CSP (enforce): …`) y la guarda.

- [csp.spec.mjs](../../pruebas/e2e/csp.spec.mjs) exige cero violaciones en sus recorridos.
- Al terminar la corrida, `globalTeardown` ([comprobar-csp.mjs](../../pruebas/e2e/src/comprobar-csp.mjs)) falla si **cualquier** prueba violó la CSP, aunque la prueba pasara. Solo descuenta la de control, que viola la CSP a propósito en `/?control-csp`.
- `csp.spec.mjs` reutiliza los recorridos del editor de la fidelidad (`pruebas/fidelidad/src/`): ejemplos, exportaciones, paneles, copiloto, minería, BPMN y archivos de ingesta generados al vuelo.

- Cada prueba parte del mismo estado: `beforeEach` ejecuta `reiniciarDatos()`, que vuelve a correr la semilla desde cero ([entorno.mjs](../../pruebas/e2e/src/entorno.mjs)).
- Todas comparten base: un solo trabajador, sin paralelismo.
- 60 s por prueba; 10 s por `expect`. Guarda la traza de las que fallan (`trace: 'retain-on-failure'`).
- Los tres servidores **no se reutilizan**: si un puerto está ocupado, la corrida falla al arrancar.
- Base: `E2E_DATABASE_URL`, por defecto `processiq_e2e` en el Postgres de desarrollo.

El Anthropic falso decide la respuesta por la petición: una generación (`max_tokens` ≥ 16 000) recibe un proceso de 3 elementos; una tarea del copiloto, un texto en markdown; los pains, un JSON de dolores. Rechaza cualquier clave que no sea la de prueba.

### Specs (32)

La tabla describe las del núcleo; las de cada iniciativa están en su ficha ([docs/iniciativas/](../iniciativas/README.md)).

| Spec | Prueba | Flujo |
|---|---|---|
| [plataforma.spec.mjs](../../pruebas/e2e/plataforma.spec.mjs) | Sin sesión lleva a «Entrar»… | Redirección, credenciales incorrectas y vuelta a la página pedida |
| | Contraseña temporal | Hay que cambiarla antes de seguir |
| | Abrir, guardar y ver la revisión | El editor abre la última versión, guarda una nueva y el proyecto la muestra |
| | Conflicto | Guardar sobre una versión que ya no es la última avisa |
| | Aprobación por roles | El revisor aprueba; el editor no puede; el lector solo consulta |
| | Cambios sin guardar | Sobreviven a una recarga y se recuperan o descartan |
| | Alta de cuenta | El administrador crea una cuenta y la persona entra con la temporal |
| | Proyecto archivado | Se consulta pero no admite cambios |
| | Editor libre intacto | Sin barra, sin llamadas a la API y con el trabajo en `processiq.v1` |
| [ia.spec.mjs](../../pruebas/e2e/ia.spec.mjs) | Generación | La IA del servidor genera desde el editor y queda como revisión |
| | Pestaña cerrada | Una generación terminada se ofrece al volver a abrir el proceso |
| | Copiloto y pains | Van al servidor; el administrador ve el consumo |
| | Solo lectura | Quien solo lee no usa la IA del servidor |
| [catalogos.spec.mjs](../../pruebas/e2e/catalogos.spec.mjs) | KPIs y verbos | Los de la organización llegan al editor; el editor libre sigue con los de fábrica |
| | Tema PPTX | Un tema de cliente creado en el shell exporta con sus colores |
| [importacion.spec.mjs](../../pruebas/e2e/importacion.spec.mjs) | Del editor libre a un proyecto | Lo dibujado en el navegador se lleva a un proyecto y se abre igual |
| | Varios JSON | Varios JSON exportados se importan de una vez |
| [sistema.spec.mjs](../../pruebas/e2e/sistema.spec.mjs) | «Sistema» | Un error del navegador aparece en «Sistema» y el worker da señales |
| [csp.spec.mjs](../../pruebas/e2e/csp.spec.mjs) | Cabeceras y fuentes | Las cabeceras son las del Caddyfile; las 20 caras de Montserrat cargan desde `/fonts/`; Permissions-Policy: micrófono sí, cámara y ubicación no |
| | Editor libre | Ejemplos con todas sus exportaciones (JSON, SVG, PNG, BPMN, Word, Ficha, PPTX mbc y bbva, niveles), paneles, To-Be, copiloto, comandos, minería, BPMN, presentación, ingesta de Word, PDF y PowerPoint, y grabación de voz, sin violaciones ni peticiones a otros orígenes |
| | IA del editor libre | Generación por el intermediario del mismo origen (`/ia`) y tarea del copiloto con clave propia (`api.anthropic.com`): la CSP deja salir las dos |
| | Shell | Todas las pantallas del administrador y el editor en modo proyecto (guardar revisión), sin violaciones |
| | Página 404 | Sus estilos en línea se aplican |
| | Control | La CSP bloquea e informa una petición a otro origen, un script en línea y `eval` (si esto falla, que las demás no vean violaciones no demuestra nada) |

### Qué necesita la E2E

- Postgres de desarrollo en marcha: `docker compose -f docker-compose.dev.yml up -d`.
- La web construida (`pnpm e2e` la construye).
- Chromium de Playwright. Fidelidad y E2E usan la misma versión (1.63.0), así que basta instalarlo una vez.
- Los puertos 4480, 8792 y 8793 libres. Una sola corrida a la vez por PC.

### Ejecutar una sola

```bash
pnpm --filter @processiq/web build
pnpm --filter @processiq/pruebas-e2e exec playwright test -g "conflicto"
pnpm --filter @processiq/pruebas-e2e exec playwright test plataforma.spec.mjs --headed   # viendo el navegador
```

Regla: cada flujo nuevo de la plataforma (shell o editor en modo proyecto) lleva su prueba en `pruebas/e2e/*.spec.mjs`. Un cambio en `apps/web/src/app/` exige `pnpm fidelidad` y `pnpm e2e` en verde.

## 10. La CI paso a paso

[ci.yml](../../.github/workflows/ci.yml) tiene un solo trabajo, `verificar`. Se ejecuta en cada PR y en cada push a `main`. Un push nuevo a la misma rama cancela la corrida anterior.

- Máquina: `ubuntu-latest`, 30 minutos como máximo.
- Servicio: Postgres 17 en el puerto 5440, base `processiq_pruebas`. La variable `TEST_DATABASE_URL` apunta a él.
- No usa secretos.

| # | Paso | Qué hace | Si falla, mira |
|---|---|---|---|
| 1 | Checkout, pnpm y Node 22 | Con caché de pnpm | — |
| 2 | Dependencias | `pnpm install --frozen-lockfile` | Que `pnpm-lock.yaml` esté al día y confirmado |
| 3 | Auditoría de dependencias | `pnpm audit --prod --audit-level=high` | [§12](#auditoría-de-dependencias) |
| 4 | Fronteras | `pnpm fronteras` | [§3](#3-fronteras-entre-paquetes) |
| 5 | Tipos | `pnpm typecheck` | [§4](#4-tipos) |
| 6 | Build | `pnpm build` (API, intermediario y web) | Que todo se empaqueta: dependencias que faltan, rutas de import |
| 7 | Pruebas unitarias | `pnpm test`: paquetes, intermediario e integración de la API | [§12](#unitarias-e-integración) |
| 8 | Navegador | `playwright install --with-deps chromium` | — |
| 9 | Fidelidad | `pnpm fidelidad` (vuelve a construir la web y compara) | Artefacto `resultados-pruebas` |
| 10 | E2E | `playwright test` en `pruebas/e2e`, con la web del paso anterior. Crea su base `processiq_e2e` en el mismo Postgres | Artefacto `resultados-pruebas` |
| 11 | Resultados (solo si algo falló) | Sube el artefacto `resultados-pruebas` (14 días) | [§11](#11-dónde-quedan-los-artefactos) |
| 12 | Imágenes Docker | `docker compose build` con `DOMINIO=ci.invalid` y una contraseña de relleno | El log del paso |

La protección de `main` exige que `verificar` esté en verde y que la rama esté al día con `main` ([ADR 18](../adr/0018-repositorio-publico.md), [docs/equipo/README.md](../equipo/README.md)).

## 11. Dónde quedan los artefactos

| Qué | En local | En la CI (artefacto `resultados-pruebas`) |
|---|---|---|
| Fidelidad: artefactos que difieren | `pruebas/fidelidad/resultados/<caso>/referencia/…` y `…/nueva/…` | Igual, dentro del artefacto |
| Fidelidad: salida de Playwright | `pruebas/fidelidad/resultados/playwright/` | Igual |
| Fidelidad: informe HTML | `pruebas/fidelidad/playwright-report/` | Igual |
| E2E: trazas, capturas y vídeos de las que fallan | `pruebas/e2e/resultados/<prueba>/` | Igual |
| E2E: informe HTML | `pruebas/e2e/playwright-report/` | Igual |
| Unitarias, integración, tipos, fronteras | Solo la salida de la consola | El log del paso |

`<caso>` es el nombre del escenario: el ejemplo (`loadComplex6`), `copiloto-<ejemplo>`, `comandos`, `mineria`, `texto-<texto>`, `importar-bpmn`, `ia-generacion`, `ia-tareas`, `ingesta-archivos` o `paneles-<ejemplo>`. Las pruebas de `divergencias.spec.mjs` no escriben artefactos.

Todas esas carpetas están en `.gitignore`. Cada corrida de la fidelidad empieza borrando las carpetas de caso de la anterior (`globalSetup`, [limpiar-resultados.mjs](../../pruebas/fidelidad/src/limpiar-resultados.mjs)); `resultados/playwright/` lo vacía Playwright. Lo que hay en `resultados/` es siempre de la última corrida.

Para abrir los informes y trazas:

```bash
pnpm --filter @processiq/pruebas-fidelidad exec playwright show-report
pnpm --filter @processiq/pruebas-e2e exec playwright show-report
pnpm --filter @processiq/pruebas-e2e exec playwright show-trace resultados/<prueba>/trace.zip
```

## 12. Cómo depurar cada tipo de fallo

### Fronteras

El mensaje dice qué archivo importa qué. Si la dependencia es legítima, cambiar las reglas es un cambio de núcleo (PR aparte, `plataforma/<tema>`).

### Tipos y build

- Error en un paquete que no tocaste: probablemente cambiaste `dominio` o `ia` y otro paquete los compila con otra configuración ([lecciones 5c y 22](../lecciones-aprendidas.md)).
- El build falla y el typecheck no: suele ser una dependencia que el paquete usa y no declara, o un import que solo resuelve en el editor. Revisa el `package.json` del paquete y su `index.ts`.

### Unitarias e integración

- `ECONNREFUSED` en la API: el Postgres de desarrollo no está levantado.
- Fallos raros al ejecutar dos copias a la vez: comparten `processiq_pruebas`. Usa `TEST_DATABASE_URL` distinto en cada una.
- «Can not add a route since the matcher is already built»: una ruta auxiliar añadida después de la primera petición.
- En la CI, los mismos síntomas se ven en el log del paso «Pruebas unitarias».

### Fidelidad

1. Lee el mensaje: «N de M artefactos difieren» y, por cada uno, la **posición** de la primera diferencia con 80 caracteres de contexto de cada app.
2. Abre `pruebas/fidelidad/resultados/<caso>/` y compara las dos versiones:

   ```bash
   R=pruebas/fidelidad/resultados/loadComplex6
   diff "$R/referencia/diagrama.svg" "$R/nueva/diagrama.svg"
   ```

   Usa variables de ruta; no hagas `cd` a la carpeta de resultados ([lección 3](../lecciones-aprendidas.md)).
3. Si falla por errores de JavaScript o por tiempo de espera, mira `pageerror` y la consola en el informe HTML: los errores de página también son comportamiento ([lección 11](../lecciones-aprendidas.md)).
4. Si difiere por décimas de píxel o alterna entre dos valores, sospecha de fuentes, transiciones o tiempos antes que del código. Repite solo ese caso: `… playwright test -g "loadComplex6$" --repeat-each 5` ([lección 7](../lecciones-aprendidas.md)).
5. Si pasa en local y falla en la CI (o al revés): comprueba que construiste la web, que no hay un servidor viejo en los puertos 4401/4402 y que hay internet.
6. Si la diferencia es intencional, no se toca `referencia-mvp/`: se registra la divergencia y se prueba en `divergencias.spec.mjs`.

### E2E

1. Abre la traza de la prueba (`show-trace`): pasos, capturas, red y consola en cada momento.
2. Mira la salida de la consola: ahí escriben la API, el worker y el Anthropic falso.
3. No arranca: puerto 4480, 8792 u 8793 ocupado, o el Postgres de desarrollo apagado.
4. Un selector que encuentra dos elementos: `getByLabel` busca por subcadena; usa `{ exact: true }` ([lección 20](../lecciones-aprendidas.md)). Antes de escribir una prueba sobre el editor, mira su marcado en `index.html`.
5. Tras una acción asíncrona, espera a una condición visible, no a un tiempo fijo ([lección 8](../lecciones-aprendidas.md)).

### Violaciones de la CSP

- La salida de la E2E dice qué directiva bloqueó qué recurso y en qué archivo y línea: `CSP (enforce): connect-src bloquea «https://…» en http://127.0.0.1:4480/ (…/assets/editor-….js:4)`.
- Si falla `comprobar-csp.mjs` al final de la corrida, alguna prueba violó la CSP aunque pasara: busca `CSP (` en la salida para ver cuál.
- Para descubrir qué necesita algo nuevo sin romper nada, cambia en tu copia `Content-Security-Policy` por `Content-Security-Policy-Report-Only` en el Caddyfile y corre la spec: todo funciona y las violaciones salen igual en la consola. Después, la directiva mínima en el Caddyfile, su motivo en [seguridad.md §9](seguridad.md#content-security-policy), y otra vez obligatoria.
- `eval` no se puede probar desde `page.evaluate`: DevTools lo permite aunque la CSP lo prohíba. La prueba de control usa un temporizador con texto (`setTimeout('…')`), que corre como código de la página.

### Auditoría de dependencias

- `pnpm audit --prod --audit-level=high` en local muestra el aviso y la ruta de dependencias.
- Solución preferida: actualizar la dependencia. Si no se puede, la excepción va en `pnpm.auditConfig.ignoreGhsas` de [package.json](../../package.json) **y** se justifica en la [ADR 17](../adr/0017-excepciones-auditoria-dependencias.md).
- Cuidado con pptxgenjs y mammoth: su versión está fijada por la fidelidad. Actualizarlas exige pasar la fidelidad completa.

### Imágenes Docker

Reproduce el paso en local tal como lo hace la CI ([desarrollo.md](desarrollo.md#8-construir-y-probar-las-imágenes-docker-en-local)). Suele ser un lockfile desactualizado (las imágenes instalan `--offline --frozen-lockfile`) o un archivo que `.dockerignore` excluye.
