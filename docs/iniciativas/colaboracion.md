# Colaboración en tiempo real (`colaboracion`, núcleo)

> **Estado:** reservada · **Responsable:** plataforma (agente de colaboración) · **Desde:** 28-sep-2026

## Objetivo

Que dos personas que abren el mismo proceso no se pisen sin darse cuenta:
- ven **quién más lo tiene abierto**;
- ven quién está **editando**: un bloqueo suave, que avisa pero no impide;
- se enteran **al momento** cuando otro guarda una revisión, con la opción de cargarla.

Hoy solo se enteran al guardar, con el aviso de conflicto.

Se sabrá que funciona si los conflictos al guardar (`conflicto: true`) bajan casi a cero en los proyectos con varios editores.

## Tipo

Núcleo. Toca la integración del editor con la plataforma, la API de procesos y la página del proceso. No es un módulo: la presencia es parte del guardado de revisiones.

## Alcance

- **Incluye:**
  - **presencia por proceso:** latido del editor y del shell, que caduca solo;
  - **estado «editando»:** el editor lo marca mientras hay cambios sin guardar;
  - **eventos en vivo** por SSE, con `LISTEN/NOTIFY` igual que la IA: presencia y revisión nueva;
  - en el editor, la barra del proyecto muestra quién está y avisa de una revisión nueva, con «Cargar» y «Seguir con la mía»;
  - en la página del proceso, la lista de revisiones se actualiza sola.
- **No incluye:**
  - edición simultánea del mismo diagrama (CRDT u operaciones en vivo): se decide después, con esta base;
  - WebSocket: SSE basta para avisar ([ADR 21](../adr/README.md)).

## Zonas

| Qué | Valor |
|---|---|
| Carpetas y archivos | `apps/api/src/colaboracion/` (nuevo), las rutas de presencia y eventos en `apps/api/src/rutas/procesos.ts`, `apps/web/src/app/plataforma/colaboracion.js` (nuevo) y su enganche en `proyecto.js`, y `apps/web/src/shell/paginas/Proceso.tsx` |
| Rutas de la API | `/api/procesos/:id/presencia`, `/api/procesos/:id/eventos` |
| Tablas | `presencias` (proceso, usuario, estado, último latido) |
| Canales `LISTEN/NOTIFY` | `procesos_evento` |
| Otros | `pruebas/e2e/colaboracion.spec.mjs` |

## Datos y privacidad

- La presencia guarda el usuario, el proceso, el estado y la hora del último latido. Se borra sola al caducar; no hay histórico.
- Solo la ven quienes tienen acceso al proceso.

## Incrementos

| # | Qué entrega | Rama | PR | Estado |
|---|---|---|---|---|
| 1 | Presencia, «editando» y aviso de revisión nueva en el editor y en el shell; ADR 21; E2E con dos navegadores | `plataforma/colaboracion` | | 🔜 (después de `invitados`: tocan la misma integración del editor) |

## Pruebas

- **Integración:**
  - latido, caducidad y permisos (sin acceso, 404);
  - el SSE entrega presencia y revisiones nuevas a quien tiene acceso y a nadie más.
- **E2E:** dos navegadores abren el mismo proceso, cada uno ve al otro; uno guarda y el otro recibe el aviso y carga la revisión. Con capturas revisadas.
- **Fidelidad:** en verde: sin proyecto, el editor no cambia.
