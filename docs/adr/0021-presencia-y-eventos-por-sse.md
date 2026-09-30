# 21. Presencia por proceso y eventos en vivo por SSE, sin WebSocket

**Estado:** vigente. **Fecha:** 28-sep-2026. **Iniciativa:** `colaboracion`, núcleo ([ficha](../iniciativas/colaboracion.md)).

## Contexto
Dos personas pueden abrir y editar a la vez el mismo proceso. Hasta ahora solo se enteraban al guardar: la API guarda igual y responde `conflicto: true` ([api.md](../tecnica/api.md#post-apiprocesosidrevisiones--guardar-revisión)), y la segunda versión no incluye los cambios de la primera. Queremos que cada una vea quién más tiene abierto el proceso, quién está editando, y que se entere en el momento en que otra guarda una revisión, con la opción de cargarla.

Lo que ya había: una sola instancia de la API (Hono sobre Node) detrás de Caddy, Postgres, y un canal en vivo para la IA: `LISTEN/NOTIFY` (`Escucha`, una conexión dedicada por servicio) más un SSE que envía el estado completo en cada evento ([ia.md](../tecnica/ia.md), §6.8). No hay presupuesto para servicios externos (ni Redis ni un servicio de tiempo real).

## Decisión
- **Canal: SSE, reutilizando el de la IA.** `GET /api/procesos/:id/eventos` (acceso `leer`) envía dos eventos, cada uno con el estado completo y solo cuando cambia: `presencia` (quién lo tiene abierto) y `revision` (la última revisión: número, autor, mensaje, estado). Al conectar llegan los dos, así que reconectar es seguro. La API escucha el canal `procesos_evento` en la misma `Escucha` que `ia_ejecucion` (ninguna conexión nueva a Postgres) y, como respaldo, vuelve a leer cada 5 s.
- **El aviso solo lleva el id del proceso.** Cada conexión SSE vuelve a leer lo que su usuario puede ver. El `NOTIFY` de una revisión nueva va **dentro** de la transacción que la guarda: sale al confirmarla y no sale si se deshace.
- **Presencia = una fila por pestaña**, en la tabla `presencias` (proceso, usuario, pestaña, lugar, estado, desde, último latido). La pestaña es un identificador aleatorio que genera la web: la misma persona puede tener abiertos el editor y la página del proceso. Hacia fuera se junta por persona: `editando` si alguna de sus pestañas lo está.
- **Latido y caducidad.** Cada pestaña da un latido (`PUT …/presencia`) cada 20 s y enseguida si cambia su estado. Sin latido durante **60 s**, la presencia deja de contar; la borra el siguiente latido de cualquiera. Al cerrar la pestaña (`pagehide`), `fetch` con `keepalive` la borra (`DELETE …/presencia`); si no llega, caduca sola.
- **El SSE también renueva el latido de su pestaña** (con `?pestana=`, cada 20 s y solo si la fila ya existe). En segundo plano el navegador estrangula los temporizadores (hasta uno por minuto) y la presencia parpadearía justo en el límite de los 60 s; la conexión abierta demuestra que la pestaña sigue ahí.
- **«Editando» es un bloqueo suave.** Es el estado «hay cambios sin guardar» del editor. No impide nada: avisa en la barra («Ana también está editando») y el conflicto se sigue marcando al guardar. Solo cuenta como `editando` quien puede guardar (capacidad `escribir` en un proyecto sin archivar); un lector que cambia algo sigue `viendo`.
- **Seguridad.** Todo exige sesión y acceso `leer` al proceso; sin él, 404 como el resto de la API. El SSE vuelve a comprobar en cada vuelta que la sesión sigue viva y que el acceso no se retiró, y se cierra a los 10 minutos para que el navegador reconecte (pide `retry: 3000`) y pase otra vez por la sesión. La vista del invitado (`?invitado=`, [ADR 20](0020-rutas-publicas-con-token.md)) no da latidos ni abre el SSE.

## Privacidad
- La presencia guarda solo quién, en qué proceso, en qué lugar (editor o shell), su estado y cuándo dio el último latido. Se ve solo desde dentro del proceso, y solo el nombre (no el correo).
- **No hay histórico:** las filas se borran al cerrar la pestaña o al caducar, no se auditan ni se copian a otra tabla. Quién tuvo abierto qué y cuándo no se puede consultar después.
- Borrar un proceso o una cuenta borra sus presencias (claves foráneas en cascada).

## Alternativas
- **WebSocket.** Descartado por ahora: el cliente no necesita enviar nada en vivo (el latido cada 20 s es una petición normal, con CSRF y sesión como el resto), y SSE ya funciona detrás de Caddy, reconecta solo y reutiliza la sesión por cookie. WebSocket obligaría a otro protocolo en Caddy y en la API, a autenticar la conexión por su cuenta y a gestionar la reconexión. Se reconsidera si llega la edición simultánea del mismo diagrama (CRDT u operaciones en vivo), que sí necesita un canal en los dos sentidos.
- **Presencia en memoria de la API.** Más simple, pero se pierde al reiniciar y no vale con varias instancias. En Postgres la ve cualquier instancia y el `NOTIFY` llega a todas.
- **Sondear desde el navegador** (`GET` cada pocos segundos). Descartado: más peticiones y más latencia que un SSE con aviso.
- **Una fila por persona** en lugar de por pestaña. Descartado: la página del proceso («viendo») pisaría el estado del editor («editando») de la misma persona, y cerrar una pestaña la borraría de todas.
- **Bloqueo duro** (solo una persona edita a la vez). Descartado: una pestaña olvidada bloquearía a los demás, y el conflicto ya se detecta y no pierde nada.

## Consecuencias
- Cada SSE abierto hace unas cinco consultas pequeñas por vuelta (sesión, acceso, presencia, última revisión) cada 5 s y con cada aviso de su proceso. Con decenas de personas es poco; si crece mucho, se puede comprobar el acceso con menos frecuencia.
- ~~Un cambio de estado de la última revisión (enviar a revisión, aprobar) no avisa con `NOTIFY`: llega en el sondeo de 5 s.~~ Desde el 29-sep-2026 el cambio de estado también hace `NOTIFY` dentro de su transacción, y el SSE envía un tercer evento, `estado` (id, número y estado de cada revisión), con la misma regla: estado completo y solo cuando cambia. La presencia lleva además la revisión que cada uno tiene abierta en el editor (`presencias.revision_id`). Ver [api.md](../tecnica/api.md#presencia-y-eventos-en-vivo-colaboración).
- Por HTTP/1.1 el navegador abre como mucho 6 conexiones por origen; cada pestaña con un proceso abierto usa una (dos si además sigue una generación de IA). En producción Caddy sirve HTTP/2 y no hay límite práctico.
- En las E2E, la página del proceso del shell cuenta como presencia: quien pasa por ella aparece en «Ahora lo tiene(n) abierto» y en la barra del editor de los demás.
- La base para la edición simultánea queda puesta (canal por proceso, presencia), pero esa decisión es otra ADR.
