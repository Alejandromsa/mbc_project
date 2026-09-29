# Módulo `invitados`

Enlaces de solo lectura con caducidad para que el cliente revise una revisión sin cuenta, y sus comentarios. Ficha: `docs/iniciativas/invitados.md`. Decisión: `docs/adr/0020-rutas-publicas-con-token.md`.

- `rutas.ts` (`/api/invitados`, con sesión): crear, listar y revocar enlaces (`escribir`); listar comentarios (`leer`) y resolverlos (`escribir`). Permisos con `accesoProceso`; nunca se escriben tablas del núcleo.
- `publico.ts` (`/api/publico/invitados/:token`, sin sesión): lo que usa el invitado. Reglas que no se pueden romper:
  - **Nunca** `c.get('usuario')`: en `/api/publico/` no hay sesión aunque el navegador tenga cookie.
  - Token inventado, mal formado, caducado, revocado o de un proyecto archivado: **siempre** `enlaceNoValido()` (mismo 404, código y mensaje). No añadas mensajes distintos por caso.
  - Solo se lee la revisión del enlace. Nada del proyecto, del equipo ni de otros enlaces sale en la respuesta (las pruebas comprueban las claves exactas).
  - Respuestas con `Cache-Control: no-store`.
- Del token solo se guarda el SHA-256 (`hashToken` de `seguridad.ts`); el token y la URL solo viajan en la respuesta de alta.
- Auditoría: `invitados.enlace.alta`, `invitados.enlace.baja`, `invitados.comentario.alta` (sin autor, con el nombre que dio) e `invitados.comentario.resolucion`.
- Pruebas: `invitados.test.ts` (Postgres real) y `pruebas/e2e/invitados.spec.mjs`. El límite de uso (120 por minuto e IP) vive en `app.ts`; el de comentarios (20 cada 10 min por enlace), aquí.
