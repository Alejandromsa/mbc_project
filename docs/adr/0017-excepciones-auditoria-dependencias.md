# 17. Excepciones de la auditoría de dependencias

**Estado:** vigente; revisar en cada actualización de dependencias. **Fecha:** 26-sep-2026. **Revisada:** 28-sep-2026 (ya no hay excepciones: ver «Evaluación del 28-sep-2026»).

## Contexto

La CI ejecuta `pnpm audit --prod --audit-level=high`. Al activarla aparecieron 15 avisos.

## Decisión

- **`tar` (1 crítico y varios altos):** venía por `pdfjs-dist → canvas → @mapbox/node-pre-gyp`. `canvas` es una dependencia opcional de pdf.js para Node; en el navegador no se usa. **Se elimina** con `pnpm.overrides: { "canvas": "-" }`: 12 avisos menos.
- **`image-size` GHSA-5p2g-fcmc-qvqq y GHSA-w3rx-r6r6-pgpr (altos, denegación de servicio con imágenes JXL, HEIF o ICNS manipuladas):** llega por `pptxgenjs`. Hasta el 28-sep-2026 fue un riesgo aceptado. **Desde el 28-sep-2026 se elimina** con `pnpm.overrides: { "pptxgenjs>image-size": "-" }`, igual que `canvas`: pptxgenjs la declara, pero no la usa (ver la evaluación). pptxgenjs sigue en 3.12.0.
- **`mammoth` GHSA-rmjr-87wv-gf87 (moderado, recorrido de directorios):** solo afectaba a mammoth en Node, al leer imágenes enlazadas del disco. Hasta el 28-sep-2026 fue un riesgo aceptado, con la versión 1.8.0 fijada por la fidelidad con el MVP. **Desde el 28-sep-2026 se actualiza a 1.13.0**, que lo corrige (divergencia D6 en `docs/fase1-divergencias.md`).

`pnpm.auditConfig.ignoreGhsas` (en `package.json`) queda vacío. Una excepción nueva se añade allí y se justifica en esta ADR.

## Evaluación del 28-sep-2026

Se evaluaron las últimas versiones publicadas. Resumen por librería:

| Librería | Versión evaluada | Avisos que quita | Fidelidad | Decisión |
|---|---|---|---|---|
| mammoth | 1.13.0 (26-sep-2026) | GHSA-rmjr-87wv-gf87 (corregido desde 1.11.0) | 32 de 32 en verde, sin cambios. Con Word revisados extrae distinto (D6) | **Actualizada** |
| pptxgenjs | 4.0.1 (26-jun-2025) | Ninguno: sigue pidiendo `image-size ^1.2.1` | 33 de 33 en verde, y el `.pptx` completo idéntico al del MVP | **No se actualiza**; los avisos se quitan con el override |

### mammoth 1.13.0

- **Uso:** solo `extractRawText({ arrayBuffer })` del bundle de navegador (`mammoth.browser.min.js`). El changelog de 1.9.0 a 1.13.0 no rompe esa llamada. La 1.13.0 cambia bluebird por promesas nativas, lo que no afecta a un `await`. El bundle pasa de 642 kB a 405 kB.
- **Seguridad, además del aviso:**
  - 1.11.0 desactiva por defecto el acceso a archivos externos;
  - 1.12.2 evita la contaminación de prototipos con estilos manipulados;
  - 1.12.3 evita un bloqueo por retroceso excesivo con cadenas sin cerrar.

  Los dos últimos también afectan al navegador.
- **Fidelidad:** en verde. Los archivos de la fidelidad son párrafos simples y dan el mismo texto.
- **Diferencias medidas con Word revisados:** controles de contenido (`w:customXml`), párrafos movidos, filas eliminadas, `mc:AlternateContent` sin `mc:Fallback` y casillas. Son cinco cambios: cuatro arreglan errores de 1.8.0 y uno pierde el símbolo de la casilla (`☒`). Están registrados como divergencia D6 y los fija la prueba D6 de `divergencias.spec.mjs`.

### pptxgenjs 4.0.1

- **No quita los avisos:**
  - image-size solo está corregida en la 2.0.3 (14-sep-2026), y la rama 1.x no tiene arreglo;
  - pptxgenjs 4.0.1, la última publicada, sigue pidiendo `^1.2.1`.

  Suponer que «desaparece al actualizar pptxgenjs», como decía esta ADR, era un error.
- **image-size no se usa:**
  - ninguno de los archivos de `dist/` de pptxgenjs (3.12.0 y 4.0.1: `pptxgen.bundle.js`, `.cjs.js`, `.es.js`, `.min.js`) la menciona;
  - la 4.0.1 la excluye además del navegador (`"browser": { "image-size": false }`).

  Por eso se quita del árbol en lugar de aceptarla. El bundle que se sirve en `/vendor/` no cambia: es el mismo archivo, byte a byte.
- **Salida idéntica:**
  - con la 4.0.1, la fidelidad pasa entera;
  - además se comparó el **paquete completo**, no solo las láminas (la fidelidad solo mira `ppt/slides/slideN.xml`): 14 ejemplos × 2 temas, de 42 a 61 partes cada uno (`docProps`, `presentation.xml`, diseños, tema, imágenes y relaciones);
  - los 28 `.pptx` son idénticos byte a byte a los del MVP con la 3.12.0, porque, con la fecha fija de la fidelidad, también coinciden `docProps` y el zip.
- **Rompe la copia a `/vendor/`:** su campo `exports` no publica `dist/pptxgen.bundle.js`, y `scripts/copiar-vendor.mjs` falla con `ERR_PACKAGE_PATH_NOT_EXPORTED`. Se arregla resolviendo `join(dirname(require.resolve('pptxgenjs')), 'pptxgen.bundle.js')`.
- **Por qué no se actualiza:** no quita ningún aviso y no trae nada que el export use: sus arreglos son de tablas con hipervínculos y paginado automático, de gráficos y de la detección de Node. Obliga a tocar la copia del vendor. Queda como opción probada si algún día hace falta.

## Alternativas

- **Seguir aceptando los avisos de image-size en `ignoreGhsas`.** Descartada: la dependencia no se usa, y quitarla deja la auditoría sin excepciones.
- **Forzar image-size 2.0.4 con un override.** Descartada: cambia de versión mayor una dependencia que nadie llama, solo para callar la auditoría.
- **Actualizar pptxgenjs a 4.0.1.** No resuelve los avisos (ver arriba).

## Consecuencias

- La CI falla con cualquier aviso alto nuevo, y ya no hay excepciones aceptadas.
- **Al actualizar pptxgenjs:**
  - buscar `image-size` en su `dist/`. Si una versión futura la usara, el override la rompería en Node. Y si la metiera dentro del bundle, la auditoría no la vería, porque el bundle ya viene compilado;
  - comparar el `.pptx` completo, no solo las láminas.
- **Al actualizar mammoth:** pasar `pnpm fidelidad`, incluida la prueba D6.
- Si pptxgenjs o mammoth se usaran alguna vez en el servidor, hay que revisar esta ADR.
