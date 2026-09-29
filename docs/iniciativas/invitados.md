# Revisión por invitados externos (`invitados`)

> **Estado:** en desarrollo · **Responsable:** @Alejandromsa (agente de invitados) · **Desde:** 28-sep-2026

## Objetivo

Que el cliente revise su proceso sin tener cuenta en ProcessIQ:
- el consultor comparte un **enlace de solo lectura, con caducidad**, a una revisión concreta;
- el invitado ve el diagrama y la ficha, y deja comentarios;
- el equipo ve esos comentarios junto a la revisión y los marca como resueltos.

Se sabrá que funciona si una validación con el cliente se cierra sin exportar un PPTX para recoger sus observaciones por correo.

## Tipo

Módulo dentro de la plataforma. Es el primero con **rutas públicas**, y eso necesita un cambio pequeño del núcleo en la sesión, descrito en [ADR 20](../adr/README.md).

## Alcance

- **Incluye:**
  - crear, listar y revocar enlaces de una revisión: quien tenga `escribir` en el proyecto;
  - caducidad (por defecto 14 días, máximo 90), nombre del destinatario y si admite comentarios;
  - vista del invitado en el editor, en modo lectura: el diagrama en «Presentar», la ficha y un panel de comentarios. Un comentario puede ir anclado a un elemento del diagrama;
  - en la página del proceso, los comentarios de cada revisión, con «resuelto».
- **No incluye:**
  - que el invitado edite;
  - cuentas de invitado;
  - avisos por correo, porque no hay servidor de correo.

## Zonas de la iniciativa

| Qué | Valor |
|---|---|
| Carpetas | `apps/api/src/modulos/invitados/`, `apps/web/src/modulos/invitados/`, `apps/web/src/app/plataforma/invitado.js` (la vista del invitado dentro del editor) |
| Rutas de la API | `/api/invitados/…` (con sesión: gestión) y `/api/publico/invitados/…` (sin sesión: lo que usa el invitado con su token) |
| Rutas web | `/?invitado=<token>` (el editor en modo invitado); componentes del módulo montados en la página del proceso |
| Tablas y tipos | `invitados_…` (enlaces con el hash del token y comentarios) |
| Otros | Acciones de auditoría `invitados.*`; clases `.invitados-*`; `pruebas/e2e/invitados.spec.mjs` |

## Qué usa del núcleo

- Lectura de `proyectos`, `procesos` y `revisiones` (regla 5), y `accesoProceso` para gestionar los enlaces.
- **Cambios en el núcleo** (plataforma los revisa en el mismo PR, en commits aparte):
  1. `app.ts`: el middleware de sesión deja pasar el prefijo `/api/publico/`. Esas rutas validan su propio token y tienen límite de uso por IP.
  2. `apps/web/src/app/plataforma/`: con `?invitado=`, el editor abre la revisión del token en modo lectura. Sin ese parámetro no cambia nada, y la fidelidad lo comprueba.
  3. `Proceso.tsx`: una línea que monta el componente de comentarios del módulo.

## Datos y privacidad

- **El token se guarda como hash**, igual que las sesiones. El enlace se muestra una sola vez, al crearlo.
- El invitado solo ve la revisión del enlace: nada del proyecto, de otros procesos ni de otras personas.
- Los comentarios guardan el nombre que el invitado escribe; no se piden correos.
- Revocar un enlace o dejarlo caducar corta el acceso al momento.
- Todo queda en la auditoría: alta, revocación y cada comentario.

## Incrementos

| # | Qué entrega | Rama | PR | Estado |
|---|---|---|---|---|
| 1 | Enlaces, vista del invitado, comentarios y su gestión; ADR 20; E2E | `invitados/enlaces` | | ⏳ |

## Pruebas

- **Integración:**
  - permisos para crear y revocar;
  - token válido, caducado, revocado e inventado (siempre 404);
  - el invitado no llega a otra revisión;
  - límite de uso;
  - los comentarios quedan en la auditoría.
- **E2E:** un editor crea el enlace, un navegador sin sesión lo abre, ve el diagrama y comenta; el editor ve el comentario y lo resuelve; el enlace revocado deja de funcionar. Con capturas revisadas.
- **Fidelidad:** en verde, porque toca `apps/web/src/app/plataforma/`.
