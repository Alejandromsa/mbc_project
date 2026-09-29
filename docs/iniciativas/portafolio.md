# Portafolio de procesos por cliente (`portafolio`)

> **Estado:** en desarrollo · **Responsable:** @Alejandromsa (agente de portafolio) · **Desde:** 28-sep-2026

## Objetivo

Que un manager o socio vea, por cliente, el estado de todos sus procesos sin abrirlos uno a uno:
- cuántos hay y en qué estado está su última revisión;
- el avance hacia la aprobación;
- los indicadores del diagnóstico (actividades, pains, tipo de ejecución, KPIs).

Se sabrá que funciona si un manager prepara el seguimiento semanal de un cliente desde esta pantalla, sin exportar nada.

## Tipo

Módulo dentro de la plataforma: los mismos usuarios, la misma sesión y los datos de proyectos y procesos del núcleo.

## Alcance

- **Incluye:**
  - lista de clientes (el campo `cliente` de los proyectos) con el resumen de cada uno;
  - detalle de un cliente: sus proyectos y procesos, con el estado de la última revisión e indicadores calculados de su contenido;
  - solo lo que el usuario puede ver (sus proyectos; el administrador, todos).
- **No incluye:**
  - editar nada: es de solo lectura;
  - una tabla de clientes (sigue siendo el texto del proyecto);
  - exportar el tablero (puede ser un incremento posterior).

## Zonas de la iniciativa

| Qué | Valor |
|---|---|
| Carpetas | `apps/api/src/modulos/portafolio/`, `apps/web/src/modulos/portafolio/` |
| Rutas de la API | `/api/portafolio/…` |
| Rutas del shell | `/proyectos/portafolio/…` y la entrada «Portafolio» del menú |
| Tablas y tipos | `portafolio_…` (ninguna prevista en el primer incremento) |
| Variables de entorno | `PORTAFOLIO_…` (ninguna prevista) |
| Otros | `processiq.portafolio.*` en `localStorage`; clases `.portafolio-*`; `pruebas/e2e/portafolio.spec.mjs` |

## Qué usa del núcleo

- Lectura de `proyectos`, `miembros_proyecto`, `procesos` y `revisiones`, filtrando siempre por la organización y el acceso del usuario (regla 5 de [docs/equipo/README.md](../equipo/README.md)).
- `@processiq/dominio` y `@processiq/analitica` para calcular indicadores del contenido v1 de la última revisión.
- `pedir()` y los componentes del shell.
- Cambios en el núcleo: solo las líneas de registro (`app.ts`, `main.tsx`, `sesion.tsx`).

## Datos y privacidad

- No guarda datos nuevos: calcula a partir de las revisiones.
- No envía nada a la IA.
- Respeta los permisos por proyecto: nadie ve un cliente del que no tiene proyectos.

## Incrementos

| # | Qué entrega | Rama | PR | Estado |
|---|---|---|---|---|
| 1 | API de resumen por cliente y detalle; pantallas de lista y detalle; E2E | `portafolio/tablero` | #6 | en revisión |

## Pruebas

- Integración: resumen y detalle con varios proyectos, clientes y roles; un usuario sin acceso no ve el cliente; lector y administrador.
- E2E: el administrador abre «Portafolio», entra en un cliente de la semilla y ve sus procesos e indicadores (con captura revisada).

## Notas para Claude

- Lee [docs/equipo/nueva-iniciativa.md](../equipo/nueva-iniciativa.md): es la primera iniciativa y estrena la estructura `modulos/`.
- Los indicadores salen del contenido v1 (`packages/dominio`): valídalo con `migrarProyecto` antes de usarlo.
