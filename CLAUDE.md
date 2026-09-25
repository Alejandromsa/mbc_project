# CLAUDE.md

Este archivo orienta a Claude Code (claude.ai/code) cuando trabaja con el código de este repositorio.

## Contexto

ProcessIQ, plataforma BPMN de MBC. Este repo es la **v4**: la arquitectura objetivo está en `docs/arquitectura.md`. La **fase 1 (fundaciones)** portó el MVP 3.8.9 a paquetes TypeScript sin cambiar su comportamiento. El MVP original vive en otro repo (`nelson2206/process-iq`); aquí hay una copia congelada en `pruebas/fidelidad/referencia-mvp/`, que es el oráculo de las pruebas.

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
docker compose up -d --build                    # servidor (ver docs/runbooks/servidor-local.md)
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
apps/
  web/               src/app/: la interfaz del MVP en módulos ES (adaptadores sobre los paquetes + UI)
  intermediario/     guarda la clave de Anthropic; contrato del antiguo Cloudflare Worker
pruebas/fidelidad/   MVP congelado frente a la app nueva (fidelidad, interacciones, divergencias)
herramientas/        fronteras.mjs
infra/               Caddyfile y Dockerfiles
```

- `apps/web/src/app/` son los ~60 módulos de interfaz del MVP. Leen y escriben el `state` compartido (`estado.js`) y delegan el cálculo en los paquetes. `window.ProcessIQ` (definido en `inicio.js`) es el gancho de pruebas que usa la fidelidad: no romperlo.
- Las cachés viven en la app y la lógica pura en los paquetes: por ejemplo, las rutas memorizadas por arista están en `lienzo/ruteo.js` y la geometría en `@processiq/motor`.
- Las librerías de navegador (pptxgenjs 3.12.0, JSZip 3.10.1, mammoth 1.8.0, pdf.js 4.7.76) se instalan por npm con versión exacta y `scripts/copiar-vendor.mjs` las copia a `public/vendor/` en cada `dev`/`build`.
- `pptx.ts`, `word.ts`, `ficha.ts` y `extraccion.ts` están portados tal cual con `// @ts-nocheck` (deuda: tiparlos). **En esos archivos, solo el build detecta imports rotos.**
- `vite.config.js` tiene `cssMinify: false` a propósito: la app copia variables CSS a los SVG y el minificador cambiaba las mayúsculas de los colores.
- Servidor: Caddy sirve `apps/web/dist`, obtiene el certificado por TLS-ALPN (IIS ocupa el puerto 80) y enruta `/ia/*` al intermediario. La web llama a la IA en su mismo origen (`location.origin + '/ia'`). El dominio sale de `.env` (`DOMINIO`); `index.html` se sirve como plantilla (`{{.Host}}` en Open Graph).

## Reglas de trabajo

- **`pnpm fidelidad` en verde después de cada cambio en la web o en un paquete.** Compara, entre el MVP congelado y la app nueva:
  - los 14 ejemplos: JSON, SVG, BPMN, Word, Ficha, láminas PPTX y 3 niveles;
  - el copiloto, los comandos, deshacer, minería, ingesta de texto y de archivos, importación BPMN e IA simulada (peticiones incluidas);
  - paneles y vistas.

  Si algo difiere, los artefactos quedan en `pruebas/fidelidad/resultados/<caso>/`.
- **Nunca editar `pruebas/fidelidad/referencia-mvp/`.** Un cambio intencional de comportamiento se registra en `docs/fase1-divergencias.md` y se prueba en `divergencias.spec.mjs`.
- Antes de tocar un área que la fidelidad no cubre, **añadir primero el escenario** y ver que pasa.
- **Portar sin reescribir:** mover el código tal cual (con scripts que copian el texto literal y verifican con `diff`) y cambiar solo la frontera: parámetros en lugar de `state` y de globales. Los prompts y mensajes se comparan byte a byte.
- **Fronteras** (las comprueba `pnpm fronteras` en la CI): `dominio` no depende de ningún paquete del monorepo; los demás paquetes solo de `dominio`; `packages/*` nunca importan de `apps/*`. `dominio` solo usa ECMAScript estándar (nada de DOM ni Node en `src/`).

## Rarezas del entorno (Windows)

- **No usar heredocs ni `sed` con código que contenga `\`**: la shell se come las barras. Los scripts se escriben con el editor en el directorio temporal y se ejecutan desde ahí.
- El `curl` de Git Bash devuelve `000` con `-w`/`-o /dev/null`: usar `-v` u `-o NUL`.
- En una pestaña oculta del navegador los timers se estrangulan y el export PPTX no termina; Playwright headless no tiene ese problema.
