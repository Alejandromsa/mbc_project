# Conocimiento: reglas y trampas del módulo

Búsqueda sobre los procesos de la organización y comparativo con el marco APQC, sin IA (`pg_trgm` + `unaccent`). Ficha: `docs/iniciativas/conocimiento.md`. Decisión: `docs/adr/0019-busqueda-pg-trgm-unaccent.md`.

- **Archivos:** `texto.ts` saca el texto de un contenido v1 (sin base de datos); `marco.ts` lee el CSV y calcula la cobertura (sin base); `servicio.ts` hace las consultas; `rutas.ts`, los endpoints. Unitarias en `marco.test.ts`, integración en `conocimiento.test.ts`.
- **Tablas del núcleo, solo lectura** y siempre con `conAcceso(yo)` (organización y, si no es administrador, miembro del proyecto). Las rutas con `:id` pasan antes por `accesoProceso` (404 sin acceso).
- **Índice perezoso:** `indexarPendientes()` se llama al buscar y al pedir parecidos. Indexa toda la organización, no solo lo visible: el filtro de acceso va en la consulta, nunca en el índice.
- **`conocimiento_normalizar()`** está creada a mano en la migración 0005. Es IMMUTABLE y califica todo con `public.`: en Postgres 17 los índices se construyen con un `search_path` seguro (lección 22h). No la cambies sin una migración nueva y un `REINDEX`.
- **`texto_parecido` ya está normalizado en TypeScript** (`texto.ts`): se compara tal cual, sin `conocimiento_normalizar()`. Si cambia cómo se construye, los procesos ya indexados no se recalculan solos: hay que vaciar `conocimiento_indice` en la migración que acompañe al cambio.
- **Umbrales** (`servicio.ts`): se calibraron con pocos ejemplos. Antes de cambiarlos, mide con varios procesos reales y deja el motivo en el comentario.
- **El APQC real no entra en el repositorio** (licencia): las pruebas usan `__fixtures__/marco-ejemplo.csv`, inventado.
- **Sin `\uXXXX` en el código** escrito con la herramienta de escritura (lección 5d): para quitar tildes, `normalize('NFD').replace(/\p{M}/gu, '')`.
