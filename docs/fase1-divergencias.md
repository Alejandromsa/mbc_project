# Fase 1 — diferencias con el MVP 3.8.9

La regla del portado es no cambiar el comportamiento, y las pruebas de fidelidad (`pnpm fidelidad`) lo comprueban. Aquí se registra cada excepción: qué cambia, por qué y cómo lo tratan las pruebas.

## Fallos del MVP encontrados

| # | Fallo | Dónde | Estado |
|---|---|---|---|
| F1 | **El export PPTX falla siempre que existe un To-Be**: `ReferenceError: M_PRUNO is not defined`. `renderMiniDiagram` (lámina As-Is vs To-Be) usa constantes del tema que desde la v3.5.0 viven dentro de `exportPptx`. No se descarga nada y no se avisa al usuario. | `packages/exportar/src/pptx.ts` | **Corregido**: `renderMiniDiagram` recibe el texto y la fuente del tema. `divergencias.spec.mjs` comprueba que el MVP falla y que la app nueva genera el PPTX con la lámina As-Is vs To-Be. |

## Mejoras detectadas (no aplicadas en la fase 1)

| # | Hallazgo | Propuesta |
|---|---|---|
| M1 | Las etiquetas de las aristas se miden con `getBBox` al pintar. Si Montserrat (o uno de sus subconjuntos Unicode) aún no cargó, el fondo de la etiqueta queda del tamaño de la fuente de reserva hasta el siguiente repintado (visible tras recargar la página). | Repintar al terminar la carga de fuentes (`document.fonts` → `loadingdone`) y servir Montserrat desde la propia app en lugar de Google Fonts. |

## Diferencias intencionales

| # | Diferencia | Motivo | Efecto en las pruebas |
|---|---|---|---|
| D1 | Un event log sin transiciones (casos de una sola actividad) sigue fallando, pero ya **no deja el diagrama a medio construir**: el descubrimiento se calcula entero antes de tocar el proceso abierto. | Cálculo puro en `@processiq/mining`. | Ninguno: no hay escenario con ese error. |
| D2 | La IA en modo equipo llama al intermediario del mismo origen (`location.origin + '/ia'`) en lugar de `https://api.mbc-latam.com`. | El dominio se configura en `.env`; no se usa el Worker de Cloudflare. | Los escenarios de IA fijan `proxyUrl` en ambas apps. |
| D3 | El build no minifica el CSS (`cssMinify: false`). | El minificador pasaba a minúsculas los colores de las variables CSS, que la app copia a los SVG exportados. | Ninguno: evita la diferencia. |
| D4 | `index.html` no carga Umami y resuelve las URLs de Open Graph con el dominio que sirve la página. | Umami es del proyecto MBC; el dominio sale de `.env`. | Ninguno. |
| D5 | pptxgenjs 3.12.0, JSZip 3.10.1, mammoth (1.8.0 como el MVP; 1.13.0 desde el 28-sep-2026, ver D6) y pdf.js 4.7.76 se instalan por npm (versión exacta) y se sirven desde `/vendor/` en lugar de jsDelivr. | Sin dependencia de un CDN de terceros; paso previo a la CSP. | Salida idéntica (PPTX y extracción de archivos). `divergencias.spec.mjs` falla si la app pide algo a un servidor externo que no sea Google Fonts (pendiente M1). |
| D6 | **mammoth 1.13.0 en lugar de 1.8.0** para leer los `.docx`. Con documentos sencillos el texto es idéntico (los archivos de la fidelidad no cambian). Con Word revisados cambia: <br>• lee el texto dentro de `w:customXml` (controles de contenido de plantillas y SharePoint), que 1.8.0 ignoraba; <br>• un párrafo movido con control de cambios aparece una vez, en su sitio nuevo (1.8.0 lo perdía); <br>• no lee las filas de tabla eliminadas con control de cambios (1.8.0 sí); <br>• un `mc:AlternateContent` sin `mc:Fallback` ya no hace fallar el documento entero; <br>• **se pierde el símbolo de las casillas** (`☒ Aprobado` pasa a ` Aprobado`): 1.13.0 las convierte en casillas, que no tienen texto. | Quita el aviso GHSA-rmjr-87wv-gf87 (ADR 17) y trae los arreglos de seguridad de 1.12.2 (contaminación de prototipos con estilos manipulados) y 1.12.3 (bloqueo por retroceso excesivo con cadenas sin cerrar). El uso no cambia: solo `extractRawText`. | `divergencias.spec.mjs` (D6) lee dos Word generados al vuelo en las dos apps y comprueba cada punto, incluida la pérdida del símbolo de la casilla. El escenario de ingesta de la fidelidad sigue comparando byte a byte. |
