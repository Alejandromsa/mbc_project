# 20. Rutas públicas bajo `/api/publico/`, con token propio y sin sesión

**Estado:** vigente. **Fecha:** 28-sep-2026. **Iniciativa:** `invitados` ([ficha](../iniciativas/invitados.md)).

## Contexto
El cliente tiene que revisar su proceso sin tener cuenta en ProcessIQ: hoy la validación se cierra exportando un PPTX y recogiendo las observaciones por correo. Hasta ahora toda ruta de la API, salvo tres (`GET /api/salud`, `POST /api/sesion` y `POST /api/errores`, la lista `PUBLICAS` de `app.ts`), exige la cookie de sesión de una cuenta de la organización. Añadir cada ruta de invitados a esa lista mezclaría dos cosas: rutas que ven a un usuario y rutas que no deben ver a ninguno.

## Decisión
- **Prefijo del núcleo.** Las rutas bajo `/api/publico/` no leen la cookie: el middleware de sesión de `app.ts` las deja pasar sin resolver ningún usuario, aunque el navegador tenga una sesión abierta. Cada módulo monta ahí las suyas (`/api/publico/<clave>/…`) y **valida su propio token**. En esas rutas nunca se usa `c.get('usuario')`.
- **Protecciones comunes que se mantienen:** las escrituras exigen el `Origin` de la web (CSRF), el cuerpo no pasa de 8 MB y cada respuesta lleva `X-Request-Id`.
- **Límite de uso por IP:** 120 peticiones por minuto a todo `/api/publico/`; después, `429 LIMITE` hasta que acaba el minuto. Reutiliza `LimitadorAccesos` (en memoria: hay una sola instancia de la API). Cuentan también las peticiones con un token inventado: no se pueden probar tokens sin límite.
- **El token de invitados** son 32 bytes aleatorios en base64url (como las sesiones). En la base solo se guarda su SHA-256 (`invitados_enlaces.token_hash`). El enlace completo (`/?invitado=<token>`) se muestra una sola vez, al crearlo; después se puede revocar, no recuperar.
- **Un solo 404** para un token inventado, mal formado, caducado, revocado o de un proyecto archivado: mismo estado, mismo código (`INVITADOS_ENLACE_NO_VALIDO`) y mismo mensaje. La respuesta no dice si el enlace existió.
- **Qué ve un invitado:** el nombre del proceso, el número y la fecha de la revisión del enlace, su contenido v1 (diagrama, ficha, vistas As-Is y To-Be, notas), el destinatario y la caducidad del enlace, y los comentarios hechos por **ese** enlace (si están resueltos, pero no quién los resolvió).
- **Qué no ve:** el proyecto (nombre, cliente, miembros), otras revisiones u otros procesos, a nadie del equipo, los demás enlaces ni los comentarios que llegaron por ellos. No puede guardar nada salvo sus comentarios. Las respuestas llevan `Cache-Control: no-store`.
- **Qué escribe:** comentarios con el nombre que escribe (no se piden correos), a la revisión en general o a un elemento de su diagrama, como mucho 20 cada 10 minutos por enlace. Cada uno queda en la auditoría (`invitados.comentario.alta`) sin autor y con ese nombre en el detalle.
- **En el editor**, `/?invitado=<token>` abre esa revisión en modo lectura (`app/plataforma/invitado.js`). No usa el trabajo del editor libre (`processiq.v1`): trabaja sobre una clave propia que se borra al salir. Sin el parámetro, el editor no cambia (lo comprueban la fidelidad y la E2E).

## Alternativas
- **Añadir cada ruta a `PUBLICAS`.** Descartada: la lista es de rutas concretas y el middleware seguiría leyendo la cookie en ellas si alguien la cambia; el prefijo deja la regla a la vista («aquí no hay usuario») y sirve a futuras iniciativas.
- **Cuentas de invitado** (un usuario con rol externo). Descartada: obliga a gestionar contraseñas y altas de personas de fuera, y el cliente solo necesita mirar y comentar una versión.
- **Guardar el token en claro** para poder volver a mostrarlo. Descartada: una fuga de la base daría acceso a todas las revisiones compartidas. Se crea otro enlace si hace falta.
- **Un token firmado sin estado (JWT).** Descartada: no se puede revocar en el acto sin volver a consultar la base.

## Consecuencias
- Una ruta nueva bajo `/api/publico/` es pública por construcción: su módulo responde de validar el token y de no filtrar datos. Plataforma revisa cada una.
- Bajo `/api/publico/`, una ruta que no existe responde `404` (no `401`), porque no se exige sesión.
- El límite vive en memoria, igual que el de «Entrar»: se reinicia con la API y no vale con varias instancias (entonces irá a Postgres).
- Quien tenga el enlace ve la revisión entera: el equipo debe revisar qué comparte (notas de las actividades, personas de la ficha). La pantalla lo recuerda al crearlo.
- Archivar el proyecto corta los enlaces; reactivarlo los devuelve si no caducaron.
