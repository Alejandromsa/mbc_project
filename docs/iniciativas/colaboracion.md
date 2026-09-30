# Colaboración en tiempo real (`colaboracion`, núcleo)

> **Estado:** en desarrollo · **Responsable:** plataforma (agente de colaboración) · **Desde:** 28-sep-2026

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
| Carpetas y archivos | `apps/api/src/colaboracion/` (nuevo; sus rutas se montan con una línea en `app.ts`), el `NOTIFY` al guardar en `apps/api/src/rutas/procesos.ts`, el canal en la `Escucha` de `servidor.ts`, `apps/web/src/shell/colaboracion.ts` (nuevo: latido y SSE, lo comparten editor y shell), `apps/web/src/app/plataforma/colaboracion.js` (nuevo) y su enganche en `proyecto.js` y `barra.css`, y `apps/web/src/shell/paginas/Proceso.tsx` |
| Rutas de la API | `/api/procesos/:id/presencia`, `/api/procesos/:id/eventos` |
| Tablas | `presencias` (proceso, usuario, pestaña, lugar, estado, desde, último latido) |
| Canales `LISTEN/NOTIFY` | `procesos_evento` |
| Otros | `pruebas/e2e/colaboracion.spec.mjs` |

## Datos y privacidad

- La presencia guarda el usuario, el proceso, la pestaña (un identificador aleatorio), el lugar (editor o shell), el estado y la hora del último latido. Se borra al cerrar la pestaña o al caducar (60 s sin latido); no hay histórico ni auditoría.
- Solo la ven quienes tienen acceso `leer` al proceso, y solo el nombre de cada persona (no el correo).
- La vista del invitado (`?invitado=`) no da latidos ni abre el SSE.

## Incrementos

| # | Qué entrega | Rama | PR | Estado |
|---|---|---|---|---|
| 1 | Presencia, «editando» y aviso de revisión nueva en el editor y en el shell; ADR 21; E2E con dos navegadores | `plataforma/colaboracion` | #15 | en revisión |
| 2 | Aviso en vivo del cambio de estado de una revisión (`NOTIFY` y evento `estado`); qué versión tiene abierta cada persona («Ana (v3)», «versión anterior») en la página del proceso | `plataforma/sesiones-y-avisos` | #21 | en revisión |

## Decisiones

- 28-sep-2026 — SSE y no WebSocket; presencia por pestaña con caducidad a los 60 s; el SSE renueva el latido de su pestaña; «editando» solo para quien puede guardar: [ADR 21](../adr/0021-presencia-y-eventos-por-sse.md).
- 28-sep-2026 — «Cargar la nueva versión» recarga el editor con `/?revision=<nueva>` (el camino de apertura de siempre) en lugar de cambiar el contenido en sitio: así no quedan paneles con datos de la versión anterior. Con cambios sin guardar pregunta antes y, si se aceptan perder, borra el borrador local para que no se ofrezca recuperarlo.
- 28-sep-2026 — El shell no importa nada del editor, así que el latido y el SSE viven en `shell/colaboracion.ts` y el editor los importa de ahí, como ya hace con `api.ts`.
- 29-sep-2026 — El cambio de estado de una revisión avisa con `NOTIFY` dentro de su transacción, como el guardado. El SSE envía un evento aparte, `estado`, con el estado de **todas** las revisiones (no solo la última): aprobar la v2 cuando ya existe la v3 también se ve al momento. La presencia guarda la revisión abierta (`revision_id`, `set null`) y la API marca `ultima: false` si ya hay otra más nueva; la API comprueba que sea del mismo proceso para no enseñar el número de una ajena.

## Pruebas

- **Integración:**
  - latido, caducidad y permisos (sin acceso, 404);
  - el SSE entrega presencia y revisiones nuevas a quien tiene acceso y a nadie más.
- **E2E:** dos navegadores abren el mismo proceso, cada uno ve al otro; uno guarda y el otro recibe el aviso y carga la revisión. Con capturas revisadas.
- **Fidelidad:** en verde: sin proyecto, el editor no cambia.
