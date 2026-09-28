# <Nombre de la iniciativa> (`<clave>`)

> **Estado:** reservada · **Responsable:** @<usuario de GitHub> · **Equipo:** <personas> · **Desde:** <dd-mmm-aaaa>

Copia este archivo como `docs/iniciativas/<clave>.md` y rellénalo en el PR de reserva. Es el documento que Claude lee para saber qué es tuyo y qué no: mantenlo al día en cada incremento.

## Objetivo

Qué problema resuelve, para quién y cómo se sabrá que funciona.

## Tipo

Módulo, app aparte o repositorio propio, y por qué (criterio de `docs/equipo/nueva-aplicacion.md`).

## Alcance

- **Incluye:**
- **No incluye:**

## Zonas de la iniciativa

Lo que es suyo. Todo lo que no está aquí es de otros: se toca solo en los puntos de registro o con un PR de plataforma.

| Qué | Valor |
|---|---|
| Carpetas | `apps/api/src/modulos/<clave>/`, `apps/web/src/modulos/<clave>/` |
| Rutas de la API | `/api/<clave>/…` |
| Rutas del shell | `/proyectos/<clave>/…` |
| Tablas y tipos | `<clave>_…` |
| Variables de entorno | `<CLAVE>_…` |
| Otros (canales, claves del navegador, puertos) | |

## Qué usa del núcleo

- Datos y funciones del núcleo que usa (proyectos, procesos, revisiones, IA, catálogos…) y por qué vía (`accesoProyecto`, `pedir`…).
- **Cambios que necesita en el núcleo:** cada uno es un PR de plataforma aparte. Enlazar aquí cada PR.

## Datos y privacidad

- ¿Guarda datos de clientes? ¿Cuáles y durante cuánto tiempo?
- ¿Envía algo a la IA? ¿Qué?
- ¿Quién puede verlo (roles)?

## Incrementos

| # | Qué entrega | Rama | PR | Estado |
|---|---|---|---|---|
| 1 | | `<clave>/<tema>` | | |

## Decisiones

- <dd-mmm-aaaa> — Decisión menor y su motivo. Las que duran van a una ADR (enlazarla).

## Pruebas

- Integración: qué rutas y qué casos de permiso.
- E2E: qué flujos.

## Notas para Claude

Reglas propias, trampas ya encontradas y comandos útiles del módulo. Si crecen, pasarlas a `apps/api/src/modulos/<clave>/CLAUDE.md`.
