# 19. Búsqueda sobre los procesos con pg_trgm y unaccent, sin IA

**Estado:** vigente. **Fecha:** 28-sep-2026. Iniciativa `conocimiento` ([ficha](../iniciativas/conocimiento.md)).

## Contexto
La fase 4 prevé un «RAG sobre entregables» con IA. Antes de tener presupuesto para embeddings, los consultores ya necesitan encontrar lo que MBC levantó en otros proyectos:
- buscar procesos por actividades, sistemas, roles o ficha, sin depender de tildes, mayúsculas ni erratas;
- ver qué procesos se parecen a uno dado;
- comparar un proceso con el marco APQC PCF, que tiene licencia y aporta el administrador.

Todo con Postgres, sin servicios externos (convenciones: nada de servicios nuevos en la nube).

## Decisión
- **Extensiones `pg_trgm` y `unaccent`.** Son módulos *contrib* que ya trae la imagen `postgres:17-alpine`, y son *trusted*: las crea el dueño de la base sin ser superusuario. Las puede usar cualquier módulo.
- **Creadas a mano en la migración.** drizzle no genera `CREATE EXTENSION` ni funciones. Se añadieron al principio del SQL generado (`0005_conocimiento_busqueda.sql`) antes de confirmarlo. drizzle-kit no las conoce (no están en su snapshot): no las borra ni las vuelve a generar, y después de esta migración `generar` sigue respondiendo «No schema changes».
- **`conocimiento_normalizar(text)`, IMMUTABLE**, envuelve `lower(unaccent(…))`:
  - `unaccent` es STABLE (depende de un diccionario) y un índice solo admite funciones IMMUTABLE;
  - todo va calificado (`public.unaccent('public.unaccent'::regdictionary, …)`). Desde Postgres 17, `CREATE INDEX`, `REINDEX`, `VACUUM` y `ANALYZE` ejecutan las funciones del índice con un `search_path` seguro, y `pg_restore` con uno vacío. Comprobado con un control: la misma función sin calificar hace fallar el `CREATE INDEX` con «function unaccent(text) does not exist».
- **Índice perezoso.** `conocimiento_indice` guarda el texto derivado de la última revisión de cada proceso, con un índice GIN de trigramas sobre `conocimiento_normalizar(texto)`. Se rellena al buscar: las revisiones que falten o hayan cambiado y los procesos renombrados. El guardado de revisiones del núcleo no cambia. Las filas caen en cascada con su proceso y con su revisión.
- **Búsqueda:**
  - parecido de palabra (`<%`, umbral 0,5 fijado por transacción), y deben aparecer todas las palabras;
  - las de tres letras o menos (SAP, ERP, CRM), enteras: con tan pocos trigramas, «sap» se parecía a «salud»;
  - el extracto es el trozo (actividad, sistema, rol, ficha) que mejor coincide.
- **Procesos parecidos:**
  - `similarity` sobre un texto aparte, ya normalizado: nombre, objeto de cada actividad sin su verbo, sistemas y roles, sin palabras vacías ni ficha;
  - con el texto completo, los verbos («registrar», «gestionar») y la morfología común daban el mismo 0,25 a un proceso afín que a uno ajeno.
- **Comparativo:**
  - cada actividad va al elemento del marco con mayor media entre `similarity` y `word_similarity` (umbral 0,35 por defecto; a igualdad, el más específico);
  - la cobertura se cuenta por grupos de nivel 2 dentro de cada categoría de nivel 1.
- **Marco en `conocimiento_marco`**, por organización. Se importa desde un CSV (cabeceras del APQC o propias), con vista previa, y cada importación reemplaza la anterior. El repositorio no incluye el APQC: las pruebas usan un marco inventado.

## Alternativas descartadas
- **Búsqueda de texto completo de Postgres** (`tsvector` en español): reduce las palabras a su raíz, pero no tolera erratas ni mide el parecido entre frases cortas. Puede sumarse más adelante.
- **Embeddings con pgvector e IA:** tienen coste por llamada y necesitan otra imagen de Postgres. Quedan para la fase 4, con presupuesto.
- **Columna generada con el texto normalizado:** también exige la función IMMUTABLE y duplica el texto; el índice de expresión basta.
- **Indexar al guardar la revisión** (trigger o ruta del núcleo): tocaría el núcleo. A esta escala, indexar al buscar es suficiente.

## Consecuencias
- La primera búsqueda de una organización indexa todos sus procesos, en lotes de 25 revisiones. Las siguientes solo indexan lo que cambió.
- La función declara IMMUTABLE algo que depende del diccionario de `unaccent`. Si alguien cambia ese diccionario, hay que ejecutar `REINDEX INDEX conocimiento_indice_texto_idx`.
- Si alguna vez las extensiones se instalan en otro esquema, `CREATE EXTENSION IF NOT EXISTS … WITH SCHEMA public` no las mueve y la función falla al crearse: es un fallo visible en la migración, no silencioso.
- Mismo motor en todos los entornos:
  - producción, staging y desarrollo usan la misma imagen (`postgres:17-alpine`, el mismo identificador de imagen, 17.11), con `pg_trgm` 1.6 y `unaccent` 1.1 disponibles;
  - la CI levanta `postgres:17-alpine` como servicio;
  - las pruebas de integración comprueban que existen las extensiones, que la función es IMMUTABLE y que la búsqueda usa el índice.
- Copias: `pg_dump` y `pg_restore` de una base con el índice lleno se restauran sin errores, y el índice se sigue usando.
- Los umbrales se calibraron con pocos procesos de ejemplo. Se revisan con datos reales antes de darles más peso.
