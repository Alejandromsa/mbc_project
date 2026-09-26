# 17. Excepciones de la auditoría de dependencias

**Estado:** vigente; revisar en cada actualización de dependencias. **Fecha:** 26-sep-2026.

## Contexto
La CI ejecuta `pnpm audit --prod --audit-level=high`. Al activarla aparecieron 15 avisos.

## Decisión
- **`tar` (1 crítico y varios altos):** venía por `pdfjs-dist → canvas → @mapbox/node-pre-gyp`. `canvas` es una dependencia opcional de pdf.js para Node; en el navegador no se usa. **Se elimina** con `pnpm.overrides: { "canvas": "-" }`: 12 avisos menos.
- **`image-size` GHSA-5p2g-fcmc-qvqq y GHSA-w3rx-r6r6-pgpr (altos, denegación de servicio con imágenes JXL, HEIF o ICNS manipuladas):** llega por `pptxgenjs`, que se sirve como bundle ya compilado en el navegador. Solo procesa imágenes propias: el diagrama y los logotipos de los temas, que suben administradores. **Riesgo aceptado.** Desaparece al actualizar pptxgenjs, pero antes hay que pasar la fidelidad de los PPTX.
- **`mammoth` GHSA-rmjr-87wv-gf87 (moderado, recorrido de directorios):** solo afecta a mammoth en Node, al leer imágenes enlazadas del disco. Aquí corre en el navegador, sin acceso a disco. Su versión (1.8.0) está fijada por la fidelidad con el MVP. **Riesgo aceptado.**

Las excepciones están en `package.json` (`pnpm.auditConfig.ignoreGhsas`).

## Consecuencias
- La CI falla con cualquier aviso alto nuevo.
- Si pptxgenjs o mammoth se usaran alguna vez en el servidor, estas excepciones dejan de valer.
