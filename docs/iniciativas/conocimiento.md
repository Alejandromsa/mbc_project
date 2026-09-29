# Conocimiento: búsqueda sobre entregables y comparativo APQC (`conocimiento`)

> **Estado:** en desarrollo · **Responsable:** @Alejandromsa (agente de conocimiento) · **Desde:** 28-sep-2026

## Objetivo

Reutilizar lo que MBC ya levantó:
- encontrar, entre los procesos de la organización a los que el consultor tiene acceso, los que se parecen al que está levantando (por actividades, sistemas, roles o ficha);
- comparar un proceso con el marco de referencia APQC PCF para ver qué etapas del estándar cubre y cuáles le faltan.

Se sabrá que funciona si un consultor, antes de una entrevista, encuentra en menos de un minuto dos o tres procesos parecidos de otros proyectos.

## Tipo

Módulo dentro de la plataforma. Es la versión sin IA del «RAG sobre entregables» de la fase 4: búsqueda de texto en Postgres (`pg_trgm` y `unaccent`), sin embeddings ni servicios externos, y sin gasto.

## Alcance

- **Incluye:**
  - buscador de procesos (última revisión de cada uno) con resultados ordenados por parecido y un extracto de dónde coincide;
  - «procesos parecidos» a uno dado;
  - importación del APQC PCF desde un CSV (solo administradores) y comparativo de un proceso con él.
- **No incluye:**
  - IA ni embeddings (se decide después, con presupuesto);
  - el archivo APQC: tiene licencia y lo aporta el dueño del proyecto. Las pruebas usan un marco de ejemplo inventado.

## Zonas de la iniciativa

| Qué | Valor |
|---|---|
| Carpetas | `apps/api/src/modulos/conocimiento/`, `apps/web/src/modulos/conocimiento/` |
| Rutas de la API | `/api/conocimiento/…` |
| Rutas del shell | `/proyectos/conocimiento/…` y la entrada «Conocimiento» del menú |
| Tablas y tipos | `conocimiento_…` (índice de búsqueda y marco APQC) |
| Extensiones de Postgres | `pg_trgm`, `unaccent` ([ADR 19](../adr/README.md)) |
| Variables de entorno | `CONOCIMIENTO_…` (ninguna prevista) |
| Otros | clases `.conocimiento-*`; `pruebas/e2e/conocimiento.spec.mjs` |

## Qué usa del núcleo

- Lectura de `proyectos`, `miembros_proyecto`, `procesos` y `revisiones`, filtrando siempre por la organización y el acceso del usuario (regla 5 de [docs/equipo/README.md](../equipo/README.md)).
- `@processiq/dominio` para leer el contenido v1.
- Cambios en el núcleo: solo las líneas de registro y su sección en `esquema.ts`.

## Datos y privacidad

- El índice guarda texto derivado de las revisiones: se borra en cascada con sus procesos.
- Nadie ve en los resultados un proceso de un proyecto al que no tiene acceso.
- No envía nada a la IA.

## Incrementos

| # | Qué entrega | Rama | PR | Estado |
|---|---|---|---|---|
| 1 | Índice y buscador, procesos parecidos, importación y comparativo APQC; pantallas; E2E | `conocimiento/busqueda` | #11 | en revisión |

## Pruebas

- Integración: indexa y encuentra por actividad, sistema y rol, con y sin tildes; no devuelve procesos de proyectos sin acceso; importación del CSV (solo admin) y comparativo con un marco de ejemplo.
- E2E: buscar un término de la semilla, abrir un resultado y ver el comparativo con el marco de ejemplo (captura revisada).
