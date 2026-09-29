# Modelo de seguridad

Cómo se protegen hoy las cuentas, las sesiones, los datos y los secretos de la plataforma, qué queda fuera y cómo informar de una vulnerabilidad.

Actualizado: 28-sep-2026.

Este documento describe el código tal como está. La seguridad objetivo está en [arquitectura.md §9](../arquitectura.md#9-seguridad). Si algo cambia en el código, cambia aquí.

## Contenido

1. [Resumen](#1-resumen)
2. [Superficie expuesta](#2-superficie-expuesta)
3. [Cuentas locales](#3-cuentas-locales)
4. [Sesión](#4-sesión)
5. [Protección CSRF](#5-protección-csrf)
6. [Límites](#6-límites)
7. [Permisos](#7-permisos)
8. [Auditoría y registros](#8-auditoría-y-registros)
9. [Cabeceras HTTP y TLS](#9-cabeceras-http-y-tls)
10. [Secretos](#10-secretos)
11. [Privacidad de los datos](#11-privacidad-de-los-datos)
12. [Cadena de suministro](#12-cadena-de-suministro)
13. [Semilla de desarrollo](#13-semilla-de-desarrollo)
14. [Intermediario de IA](#14-intermediario-de-ia)
15. [Cómo se prueba](#15-cómo-se-prueba)
16. [Qué NO está cubierto todavía](#16-qué-no-está-cubierto-todavía)
17. [Cómo informar de una vulnerabilidad](#17-cómo-informar-de-una-vulnerabilidad)

## 1. Resumen

| Riesgo | Control | Dónde |
|---|---|---|
| Robo de contraseñas si se filtra la base | scrypt con sal por usuario | [seguridad.ts](../../apps/api/src/seguridad.ts) |
| Robo de sesiones si se filtra la base | En la base solo está el SHA-256 del token | [seguridad.ts](../../apps/api/src/seguridad.ts), [app.ts](../../apps/api/src/app.ts) |
| Fuerza bruta en «Entrar» | 10 fallos en 15 minutos, por correo y por IP | [rutas/sesion.ts](../../apps/api/src/rutas/sesion.ts) |
| CSRF | `Origin` obligatorio en las escrituras y cookie `SameSite=Lax` | [app.ts](../../apps/api/src/app.ts) |
| Acceso a proyectos ajenos | Rol de organización + rol de proyecto en cada ruta; 404 si no hay acceso | [permisos.ts](../../apps/api/src/permisos.ts) |
| Clave de Anthropic expuesta | Solo existe en el servidor; el cliente nunca envía prompts | [rutas/ia.ts](../../apps/api/src/rutas/ia.ts), [intermediario](../../apps/intermediario/src/index.ts) |
| Gasto de IA descontrolado | Presupuesto mensual y límite por persona | [config.ts](../../apps/api/src/config.ts) |
| Secretos en el repositorio | `.gitignore`, `.dockerignore` y escaneo de secretos de GitHub | [.gitignore](../../.gitignore), [ADR 18](../adr/0018-repositorio-publico.md) |
| Dependencias vulnerables | `pnpm audit` en la CI, con excepciones justificadas | [ci.yml](../../.github/workflows/ci.yml), [ADR 17](../adr/0017-excepciones-auditoria-dependencias.md) |

## 2. Superficie expuesta

Solo un puerto llega desde internet: el 443 de Caddy. El resto de servicios no publica puertos ([docker-compose.yml](../../docker-compose.yml)).

| Servicio | Exposición | Qué atiende |
|---|---|---|
| `web` (Caddy) | 443 publicado | Estáticos de la web; `/api/*` → API; `/ia/*` → intermediario |
| `api` | `expose: 8080`, solo red interna de Docker | API de la plataforma |
| `worker` | Sin HTTP | Cola de IA; llama a Anthropic |
| `intermediario` | `expose: 8787`, solo red interna | IA del editor libre |
| `postgres` | Solo red interna | Base de datos |
| `respaldo` | Sin red de entrada | `pg_dump` periódico |

Rutas de la API que no exigen sesión (`PUBLICAS` en [app.ts](../../apps/api/src/app.ts)):

| Ruta | Para qué |
|---|---|
| `GET /api/salud` | Comprobación de salud (la usa el `HEALTHCHECK` de la imagen) |
| `POST /api/sesion` | Entrar |
| `POST /api/errores` | Informes de error de la web (también desde la pantalla «Entrar») |

Además, el prefijo **`/api/publico/`** ([ADR 20](../adr/0020-rutas-publicas-con-token.md)): sus rutas no leen la cookie ni ven a ningún usuario y validan su propio token. Hoy solo las usa la iniciativa `invitados` (`/api/publico/invitados/:token`). Tienen límite de uso por IP y sus escrituras exigen el `Origin` como las demás.

Todas las demás rutas `/api/*` exigen una sesión válida. La referencia completa de rutas está en [api.md](api.md).

## 3. Cuentas locales

Las cuentas son locales (correo y contraseña) mientras TI no registre la aplicación en Entra ID ([ADR 12](../adr/0012-cuentas-locales.md)).

### Hash de contraseñas

| Parámetro | Valor |
|---|---|
| Algoritmo | scrypt (`node:crypto`) |
| Coste | N = 2^15, r = 8, p = 1 (unos 32 MB y 50–100 ms por verificación, según el código) |
| Sal | 16 bytes aleatorios por contraseña |
| Longitud del hash | 64 bytes |
| Normalización | La contraseña se normaliza a NFKC antes de derivar |
| Formato guardado | `scrypt$N$r$p$sal$hash` (base64url) en `usuarios.hash_clave` |

- Los parámetros se guardan con cada hash. Así se pueden subir en el futuro sin invalidar los existentes.
- La verificación compara en tiempo constante (`timingSafeEqual`). Un formato desconocido devuelve «no válida».
- Si el correo no existe, se verifica igual contra un hash ficticio. El tiempo de respuesta no delata qué correos existen.
- El mensaje de error es el mismo para correo inexistente, contraseña incorrecta y cuenta desactivada: «Correo o contraseña incorrectos».

### Reglas de contraseña

Al cambiar la contraseña, la API (`problemaConClave` en [seguridad.ts](../../apps/api/src/seguridad.ts) y la ruta `POST /api/sesion/clave`) rechaza la nueva si:

- tiene menos de 10 caracteres o más de 200;
- solo tiene números;
- contiene la parte del correo anterior a la `@`;
- es igual a la actual.

### Contraseña temporal y cambio obligatorio

- Toda alta y todo restablecimiento generan una contraseña temporal de 14 caracteres. El alfabeto tiene 56 símbolos y excluye los que se confunden (`0`, `O`, `1`, `l`, `I`).
- Se muestra **una sola vez**: en la respuesta al administrador o en la salida de la línea de comandos. No se guarda en claro.
- La cuenta queda con `debe_cambiar_clave = true`. Con esa marca, la API solo admite `GET /api/sesion`, `DELETE /api/sesion` y `POST /api/sesion/clave`. Cualquier otra ruta responde `403 CAMBIAR_CLAVE`.

### Alta, restablecimiento y desactivación

| Acción | Cómo | Efecto |
|---|---|---|
| Primer administrador | `node dist/cli.js crear-usuario --email … --nombre … --rol admin`, dentro del contenedor de la API ([cli.ts](../../apps/api/src/cli.ts)) | Contraseña temporal en la salida |
| Alta | Administrador, en la plataforma (`POST /api/usuarios`) | Contraseña temporal en la respuesta |
| Restablecer | Administrador en la plataforma, o `cli.js restablecer-clave --email …` | Nueva temporal y **se cierran todas sus sesiones** |
| Desactivar | Administrador (`PATCH /api/usuarios/:id` con `activo: false`) | **Se borran sus sesiones** en el acto; además, cada petición comprueba `activo` |
| Autobloqueo | La API impide que un administrador se quite el rol o se desactive a sí mismo | `409 AUTOBLOQUEO` |

No hay recuperación de contraseña por correo: no hay servidor de correo. Una contraseña olvidada la restablece un administrador.

## 4. Sesión

| Aspecto | Implementación |
|---|---|
| Token | 32 bytes aleatorios en base64url (`nuevoToken`) |
| En la base | Solo el SHA-256 del token (`sesiones.token_hash`, único), con IP, agente de usuario y caducidad |
| Cookie | `piq_sesion`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Expires` = caducidad de la sesión. Sin `Domain`: solo vale para el host que la emitió |
| `Secure` | Se pone si `ORIGEN_PUBLICO` empieza por `https://` (en producción y staging, sí; en desarrollo con `http://localhost`, no) |
| Caducidad | `HORAS_SESION` (12 h por defecto). Es fija: la actividad no la alarga |
| Validación | En cada petición: el hash existe, no ha caducado y la cuenta está activa |
| Cerrar sesión | `DELETE /api/sesion` borra la fila y la cookie. La web recarga la página para no dejar datos en memoria ([lección 17](../lecciones-aprendidas.md)) |
| Cambiar la contraseña | Cierra las **demás** sesiones del usuario |
| Cerrar todas las sesiones | Ver [rotacion-secretos.md](../runbooks/rotacion-secretos.md) |

Cada inicio de sesión crea una sesión nueva con un token nuevo. Las sesiones anteriores del mismo usuario (otros navegadores) siguen vivas hasta que caducan.

## 5. Protección CSRF

- Toda petición a `/api/*` que no sea `GET`, `HEAD` u `OPTIONS` debe llevar la cabecera `Origin` **exactamente igual** a `ORIGEN_PUBLICO`. Si no, `403 ORIGEN`. Vale también para `POST /api/sesion` y `POST /api/errores`.
- Una petición de escritura sin `Origin` (por ejemplo, `curl` sin esa cabecera) se rechaza.
- La cookie es `SameSite=Lax`: el navegador no la envía en peticiones `POST` iniciadas desde otro sitio.
- La API no envía cabeceras CORS. La web y la API comparten origen, así que otro sitio no puede leer sus respuestas.
- **Regla a mantener:** las rutas `GET` no cambian nada. Si una lo hiciera, quedaría fuera de la comprobación de `Origin`.

## 6. Límites

| Límite | Valor | Dónde | Respuesta |
|---|---|---|---|
| Intentos de entrar | 10 fallos en 15 minutos, por correo **y** por IP | `LimitadorAccesos`, [rutas/sesion.ts](../../apps/api/src/rutas/sesion.ts) | `429 BLOQUEADO` |
| Informes de error | 20 por minuto por IP | `LimiteInformes`, [rutas/sistema.ts](../../apps/api/src/rutas/sistema.ts) | `429 LIMITE` |
| Rutas públicas con token (`/api/publico/`) | 120 peticiones por minuto por IP, también con tokens inventados | `LimitadorAccesos` en [app.ts](../../apps/api/src/app.ts) | `429 LIMITE` |
| Comentarios de invitados | 20 cada 10 minutos por enlace | [modulos/invitados/publico.ts](../../apps/api/src/modulos/invitados/publico.ts) | `429 LIMITE` |
| Informes de error (navegador) | Como mucho 10 por página, sin repetir el mismo error | [shell/observabilidad.ts](../../apps/web/src/shell/observabilidad.ts) | — |
| Cuerpo de la petición (API) | 8 MB | `bodyLimit`, [app.ts](../../apps/api/src/app.ts) | `413` |
| Cuerpo de la petición (intermediario) | 2 MB | [intermediario](../../apps/intermediario/src/index.ts) | `413` |
| Texto de una generación de IA | 1 000 000 caracteres y 50 fuentes | [rutas/ia.ts](../../apps/api/src/rutas/ia.ts) | `400 VALIDACION` |
| Gasto de IA de la organización | `PRESUPUESTO_IA_MENSUAL_USD` (100 por defecto) | [rutas/ia.ts](../../apps/api/src/rutas/ia.ts) | `409 PRESUPUESTO` |
| Gasto de IA por persona | `LIMITE_IA_USUARIO_MENSUAL_USD` (25 por defecto) | [rutas/ia.ts](../../apps/api/src/rutas/ia.ts) | `409 LIMITE_USUARIO` |

Detalles del límite de intentos:

- La ventana empieza con el primer fallo y dura 15 minutos. Al llegar a 10 fallos, ese correo o esa IP quedan bloqueados hasta que termina la ventana.
- Un acceso correcto pone a cero el contador del correo, no el de la IP.
- Los contadores viven en memoria. Valen porque hay una sola instancia de la API, y se reinician si la API se reinicia.
- Contrapartida conocida: quien conozca un correo puede bloquear esa cuenta 15 minutos fallando a propósito.

La IP es el primer valor de `X-Forwarded-For`, que pone Caddy. La API no es accesible sin pasar por Caddy, y Caddy ignora el `X-Forwarded-For` que envía el navegador: solo confía en los proxies de `PROXIES_CONFIABLES` ([Caddyfile](../../infra/Caddyfile)). En producción, ninguno externo; en staging, los rangos privados, porque delante está el Caddy de producción ([ADR 16](../adr/0016-staging-mismo-servidor.md)).

Todos los cuerpos JSON se validan con Zod, con longitudes máximas (`cuerpo` en [validar.ts](../../apps/api/src/validar.ts)). Un id de proyecto, proceso, revisión, usuario o ejecución que no es un UUID responde 404.

## 7. Permisos

Dos niveles, comprobados en la API en cada ruta ([permisos.ts](../../apps/api/src/permisos.ts)).

**Rol en la organización:**

| Rol | Puede |
|---|---|
| `admin` | Todo: usuarios, auditoría, «Sistema», consumo de IA, catálogos. En **todos** los proyectos de su organización actúa como `propietario` |
| `consultor` | Crear proyectos y participar en los que lo invitan |
| `lector` | Solo participar en los proyectos que lo invitan. No crea proyectos (`403 PERMISO`) |

**Rol en el proyecto:**

| Capacidad | propietario | editor | revisor | lector | Qué incluye |
|---|:-:|:-:|:-:|:-:|---|
| `leer` | ✓ | ✓ | ✓ | ✓ | Ver el proyecto, procesos, revisiones y ejecuciones de IA |
| `escribir` | ✓ | ✓ | | | Crear procesos, guardar revisiones, enviar a revisión, usar la IA del servidor |
| `aprobar` | ✓ | | ✓ | | Aprobar o devolver una revisión en revisión |
| `administrar` | ✓ | | | | Datos del proyecto, miembros, archivar |

Reglas:

- **404 frente a 403.** Si el proyecto no existe, es de otra organización o no eres miembro, la respuesta es `404`: no delata que existe. Si tienes acceso pero tu rol no permite la acción, `403 PERMISO`.
- **Archivados.** Un proyecto archivado es de solo lectura: `escribir` y `aprobar` responden `409 ARCHIVADO`. `administrar` sigue permitido solo para reactivarlo; cualquier otro cambio responde `409 ARCHIVADO`.
- **Organización.** Las consultas filtran por la organización de quien pide. Un miembro nuevo tiene que ser una cuenta activa de la misma organización.
- **Último propietario.** Un proyecto no puede quedarse sin propietario (`409 ULTIMO_PROPIETARIO`).
- **Revisiones.** Una revisión `aprobada` es inmutable (`409 INMUTABLE`). El cambio de estado se hace con una condición sobre el estado anterior, para que dos aprobaciones simultáneas no se pisen.
- **Solo administradores:** `/api/usuarios`, `/api/auditoria`, `/api/sistema`, `/api/ia/consumo` y las escrituras de `/api/catalogos`.
- **Cualquier sesión:** `/api/directorio` (id, nombre y correo de las cuentas activas, para elegir miembros), la lectura de catálogos y `/api/ia/estado`.
- El shell tiene una copia de las capacidades ([shell/permisos.ts](../../apps/web/src/shell/permisos.ts)) solo para mostrar u ocultar botones. **La autoridad es siempre la API.**

## 8. Auditoría y registros

### Tabla `auditoria`

Cada escritura relevante llama a `registrar()` ([auditoria.ts](../../apps/api/src/auditoria.ts)). Cada fila guarda usuario, acción, entidad, id de la entidad, detalle (JSON), IP y fecha.

| Grupo | Acciones | Detalle guardado |
|---|---|---|
| Sesión | `sesion.inicio`, `sesion.fallida`, `sesion.cierre` | En un fallo, el correo que se intentó |
| Usuarios | `usuario.alta`, `usuario.cambio`, `usuario.cambio_clave`, `usuario.restablecer_clave` | Correo y rol en el alta; los campos cambiados |
| Proyectos | `proyecto.alta`, `proyecto.cambio`, `proyecto.miembro`, `proyecto.baja_miembro` | Nombre, cambios, usuario y rol |
| Procesos y revisiones | `proceso.alta`, `proceso.cambio`, `revision.alta`, `revision.estado` | Número, conflicto, estado anterior y nuevo |
| IA | `ia.generacion`, `ia.analisis`, `ia.cancelacion` | Ejecución, modelo, caracteres y **nombres** de las fuentes (no su texto) |
| Invitados | `invitados.enlace.alta`, `invitados.enlace.baja`, `invitados.comentario.alta`, `invitados.comentario.resolucion` | Revisión, destinatario y caducidad del enlace; en los comentarios, sin autor y con el nombre que escribió el invitado |
| Catálogos | `catalogo.kpi.alta`, `catalogo.kpi.cambio`, `catalogo.verbo`, `catalogo.verbo.baja`, `catalogo.tema.alta`, `catalogo.tema.cambio`, `catalogo.tema.baja` | Qué se cambió |

La consultan los administradores en `/proyectos/admin/auditoria` (`GET /api/auditoria`, hasta 500 eventos por consulta).

No se registran: las lecturas, las exportaciones (se hacen en el navegador), descartar una generación de IA y lo que se hace por la línea de comandos (`cli.js`). Los despliegues quedan en `despliegues.log` del servidor, fuera del repositorio.

### Otros registros

- **Errores (`errores`).** Los 500 de la API, los errores de la web, del editor en modo proyecto y del worker. Se agrupan por huella, se purgan a los 30 días y los ve el administrador en «Sistema» ([ADR 15](../adr/0015-observabilidad-propia.md)). Los 4xx no se registran.
- **Referencia de error.** Toda respuesta de `/api/*` lleva `X-Request-Id`. Un 500 devuelve un mensaje genérico con esa referencia, nunca la pila.
- **Registro de acceso (salida estándar).** Escrituras, errores 5xx y peticiones de más de 2 s, en JSON, con el correo del usuario. Docker rota los logs (10 MB × 5 por servicio).

## 9. Cabeceras HTTP y TLS

Caddy añade estas cabeceras a todas las respuestas, también a las páginas 404 ([Caddyfile](../../infra/Caddyfile), bloque `cabeceras-seguridad`):

| Cabecera | Valor | Para qué |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000` | El navegador solo usa HTTPS durante un año |
| `X-Content-Type-Options` | `nosniff` | Sin adivinar tipos de contenido |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | No filtra rutas ni parámetros a otros sitios |
| `X-Frame-Options` | `DENY` | La web no se puede incrustar en otra página |
| `Server` | (se quita) | No anuncia el servidor |

TLS:

- Certificado de Let's Encrypt, obtenido por el desafío TLS-ALPN: el puerto 80 del servidor lo ocupa IIS.
- Por eso **no hay redirección de HTTP a HTTPS**. La cubre HSTS para quien ya visitó el sitio.
- HTTP/1.1 y HTTP/2. HTTP/3 está desactivado (necesitaría UDP 443).
- Dentro del servidor, el tráfico entre contenedores va por la red de Docker sin TLS.

No hay `Content-Security-Policy` (ver [§16](#16-qué-no-está-cubierto-todavía)).

## 10. Secretos

### Dónde viven

| Secreto | Archivo en el servidor | Lo usa |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env` (producción), `.env.staging` | `intermediario` y `worker`. La `api` la recibe solo para saber si la IA está configurada |
| `ACCESS_CODE` (código del equipo) | `.env`, `.env.staging` | `intermediario` |
| `POSTGRES_PASSWORD` | `.env`, `.env.staging` | `postgres`, `api`, `worker`, `respaldo` |
| `PULSE_TOKEN` (opcional) | `.env` | `intermediario`, `worker` |
| Token de Cloudflare (DNS) | Fuera del repositorio | Quien administra el DNS |
| Datos de red del servidor | `servidor-datos.local.md`, solo en el servidor | Responsable de operación ([ADR 18](../adr/0018-repositorio-publico.md)) |

Las plantillas sin valores son [.env.example](../../.env.example), [.env.staging.example](../../.env.staging.example) y [.env.dev.example](../../.env.dev.example).

### Qué nunca se sube

- [.gitignore](../../.gitignore) excluye `.env` y `.env.*` (salvo las tres plantillas), `*.local.md`, las copias de seguridad (`respaldos/`, `respaldos-*/`), `despliegues.log`, los resultados de pruebas y `bench/fixtures/` (procesos reales de cliente).
- [.dockerignore](../../.dockerignore) excluye `.env` y `.env.*`: las imágenes no llevan secretos. Docker Compose los inyecta como variables de entorno al arrancar.
- La CI no usa ningún secreto. Construye las imágenes con valores de relleno (`DOMINIO=ci.invalid`).
- El escaneo de secretos de GitHub rechaza el push que contenga una clave reconocible ([ADR 18](../adr/0018-repositorio-publico.md)).
- Tampoco se suben datos de clientes: ni en fichas, pruebas, capturas ni mensajes de commit.

### Clave propia en el editor libre

El editor libre (`/`) conserva el modo «clave propia» del MVP: la persona pega su clave de Anthropic y queda **solo en su navegador** (`localStorage`, clave `processiq.ai`). Nunca pasa por nuestros servidores: el navegador llama directamente a Anthropic. En los procesos de proyectos no existe ese modo: la IA es la del servidor.

### Rotación

El procedimiento está en [rotacion-secretos.md](../runbooks/rotacion-secretos.md). Se rota:

- cuando alguien con acceso deja el equipo;
- ante cualquier sospecha de filtración;
- como mínimo una vez al año.

| Secreto | Cómo se rota (resumen) |
|---|---|
| `ANTHROPIC_API_KEY` | Clave nueva en la consola de Anthropic, reiniciar `intermediario`, `api` y `worker`, **revocar la anterior** |
| `ACCESS_CODE` | Generar uno nuevo y reiniciar `intermediario`; hay que repartirlo al equipo |
| `POSTGRES_PASSWORD` | Cambiarla dentro de Postgres (`ALTER USER`) y en `.env`, y reiniciar `api`, `worker` y `respaldo` |
| Contraseña de un usuario | «Restablecer contraseña» en la plataforma o `cli.js restablecer-clave` |
| Todas las sesiones | Borrar la tabla `sesiones` |

**Por confirmar:** [arquitectura.md §9](../arquitectura.md#9-seguridad) pide rotar cada 90 días; el runbook dice «como mínimo una vez al año».

## 11. Privacidad de los datos

### Documentos del cliente

- Word, PDF, PowerPoint, texto, BPMN y CSV se leen **en el navegador** con mammoth, pdf.js y JSZip ([packages/documentos](../../packages/documentos)). El archivo original nunca se sube.
- Esas librerías se sirven desde la propia web (`/vendor/`), no desde un CDN. La prueba de fidelidad `D5` comprueba que la app no hace peticiones a terceros, salvo Google Fonts ([divergencias.spec.mjs](../../pruebas/fidelidad/divergencias.spec.mjs)).

### Editor libre y modo proyecto

| Modo | Dónde vive el trabajo | Llamadas a la API |
|---|---|---|
| Editor libre (`/`) | `localStorage` del navegador (`processiq.v1`) | Ninguna (lo comprueba la última prueba de [plataforma.spec.mjs](../../pruebas/e2e/plataforma.spec.mjs)) |
| Proceso de un proyecto (`/?proceso=…`) | Revisiones en Postgres; borrador local en `processiq.proceso.<id>` | Sí |

### Texto de las fuentes en la IA del servidor

- El editor envía a la API el **texto extraído** y, de cada fuente, su nombre, tipo y número de caracteres.
- El texto se guarda en `ejecuciones_ia.texto` solo mientras la ejecución está viva. Se borra (`texto = null`) al terminar: completada, fallida o cancelada. Mientras espera un reintento, se conserva.
- Quedan el nombre, el tipo y el tamaño de cada fuente, el resultado (la especificación del proceso), los tokens y el coste.
- La API nunca devuelve ese texto: `publica()` lo quita de toda respuesta ([rutas/ia.ts](../../apps/api/src/rutas/ia.ts)).
- Los análisis (pains y copiloto) envían un resumen del proceso, no los documentos. También se borra al terminar.
- El texto sí sale hacia Anthropic, que es un tercero. La política de datos con Legal está pendiente (ver [§16](#16-qué-no-está-cubierto-todavía)).

### Errores sin datos sensibles

| Origen | Qué se envía o guarda | Qué no |
|---|---|---|
| Web y editor en modo proyecto | Mensaje (máx. 2000), pila (máx. 8000), ruta y parámetros de la URL (ids), agente de usuario, archivo y línea o pila de componentes | El contenido del proceso o de las fuentes |
| Editor libre | Nada: no informa de errores | — |
| API (500) | Mensaje, pila, método y ruta, id del usuario, agente de usuario | Cuerpos de petición |
| Worker | Mensaje, pila, id de la ejecución | Texto de las fuentes |

Cuidado: si un código mete datos del proceso en el mensaje de un `Error`, esos datos acabarían en `errores`. Los mensajes de error no deben llevar contenido del usuario.

### Invitados externos

- Un enlace de invitado ([ADR 20](../adr/0020-rutas-publicas-con-token.md)) da acceso **sin cuenta** a una revisión: al diagrama, la ficha y las notas, no al proyecto, a otras revisiones ni al equipo. Quien tenga el enlace la ve: se comparte solo por canales de confianza.
- El token son 32 bytes aleatorios; en la base solo está su SHA-256 y el enlace se muestra una vez. Caduca (14 días por defecto, 90 como máximo) y se revoca en el acto. Archivar el proyecto también lo corta.
- Token inventado, caducado, revocado o de un proyecto archivado: el mismo 404, sin distinguir los casos.
- De quien comenta solo se guarda el nombre que escribe; no se piden correos. La IP queda en la auditoría, como en cualquier escritura.
- En el navegador del invitado, el editor no lee ni escribe el trabajo del editor libre (`processiq.v1`): usa `processiq.invitados.vista`, que se borra al salir. No informa de errores a «Sistema» (la URL lleva el token).

### Otros datos personales

- **Registro de acceso y auditoría:** correo del usuario e IP.
- **Copias de seguridad:** `pg_dump` diario, se conservan 14, en una carpeta del mismo PC y **sin cifrar**. Hay que copiarlas fuera del equipo ([servidor-local.md](../runbooks/servidor-local.md#copias-de-seguridad)).
- **Google Fonts:** el navegador descarga la fuente Montserrat de Google, que ve la IP de quien usa la web.
- **Datos de prueba:** las cuentas de la semilla usan el dominio reservado `processiq.test` (RFC 2606) y un cliente ficticio.

## 12. Cadena de suministro

| Control | Detalle |
|---|---|
| Auditoría en la CI | `pnpm audit --prod --audit-level=high` falla con cualquier aviso alto o crítico nuevo ([ci.yml](../../.github/workflows/ci.yml)) |
| Excepciones | [ADR 17](../adr/0017-excepciones-auditoria-dependencias.md): `canvas` eliminado con `pnpm.overrides`; tres avisos aceptados (`image-size` por pptxgenjs y `mammoth`) en `pnpm.auditConfig.ignoreGhsas` de [package.json](../../package.json). Solo valen mientras esas librerías corran en el navegador |
| Un solo lockfile | `pnpm-lock.yaml`. La CI instala con `--frozen-lockfile`; las imágenes con `pnpm fetch` y `pnpm install --offline --frozen-lockfile` |
| Versión de pnpm | Fijada en `packageManager` (`pnpm@10.33.0`); Node 22 en la CI y en las imágenes |
| Librerías del navegador | Versión exacta (pptxgenjs 3.12.0, JSZip 3.10.1, mammoth 1.8.0, pdf.js 4.7.76; también React y las demás dependencias de ejecución de la web) y servidas desde la propia web. Regla: nada desde un CDN |
| Resto de dependencias | Rangos `^` en `package.json`, resueltos siempre por el lockfile |
| GitHub | Avisos de Dependabot y escaneo de secretos ([ADR 18](../adr/0018-repositorio-publico.md)) |
| Runners | Solo los de GitHub. No hay runners propios: un PR desde un fork podría ejecutar código en el servidor |
| Imágenes | `api` e `intermediario` corren como usuario `node`, no como root. La de la API solo lleva el bundle de esbuild y las migraciones; la del intermediario, solo dependencias de producción |

## 13. Semilla de desarrollo

La semilla crea cuentas con una contraseña conocida (`Prueba-ProcessIQ-2026`, cuentas `*@processiq.test`). Por eso no debe poder correr en el servidor ([sembrar.ts](../../apps/api/src/sembrar.ts)):

- Se niega si el host de `DATABASE_URL` no es `localhost` o una dirección de bucle local (IPv4 o IPv6).
- Se niega si `NODE_ENV` es `production`.
- No está en la imagen: el bundle de la API solo incluye `servidor`, `worker` y `cli` ([construir.mjs](../../apps/api/scripts/construir.mjs)), y la imagen fija `NODE_ENV=production`.

Las cuentas y cómo usarlas están en [desarrollo.md](desarrollo.md#4-semilla-y-cuentas-de-prueba).

## 14. Intermediario de IA

Existe para el **editor libre**, que conserva el contrato del MVP ([apps/intermediario](../../apps/intermediario/src/index.ts)). La clave de Anthropic vive en el contenedor; el navegador nunca la ve. Caddy lo publica bajo `/ia/*`, en el mismo origen que la web.

| Control | Detalle |
|---|---|
| Orígenes | Solo los de `ALLOWED_ORIGINS` (por defecto `https://<DOMINIO>`). Una llamada a `/v1/messages` sin `Origin` se rechaza (`403`). Fuera de un navegador el `Origin` se puede falsificar: la barrera real es el código |
| Código de equipo | Cabecera `x-processiq-code`, comparada en tiempo constante con `ACCESS_CODE` (`401` si no coincide) |
| Modelos | Solo `claude-opus-5`, `claude-sonnet-5` y `claude-haiku-4-5` |
| Topes | `max_tokens` como máximo 64 000; cuerpo de 2 MB; `fallbacks` solo con el valor `default` |
| Errores | Un 401 de Anthropic se devuelve como 502: falla la clave central, no el código del usuario |
| `/health` | Solo dice si está configurado y si la clave **tiene formato** válido; no revela valores |
| Gasto | Cada llamada deja `gasto_ia` en el log y, si hay `PULSE_URL`, lo envía a Pulse |

Límites conocidos:

- El código es uno solo para todo el equipo. Quien lo tenga puede enviar cualquier prompt con la clave de la empresa.
- No hay límite de peticiones ni identidad por persona.
- Mitigaciones: tope de gasto en la consola de Anthropic y rotación del código ([arquitectura.md §4](../arquitectura.md#etapa-actual-servidor-propio-mientras-no-haya-paas)). En los procesos de proyectos esto ya no aplica: la IA pasa por la API, con sesión, permisos y presupuesto.

## 15. Cómo se prueba

| Prueba | Qué comprueba |
|---|---|
| [sesion.test.ts](../../apps/api/src/sesion.test.ts) | scrypt; reglas de contraseña; cookie `HttpOnly`/`Secure`/`SameSite`; 401 sin cookie; mensaje genérico; salir invalida; CSRF por `Origin`; bloqueo tras 10 fallos; contraseña temporal; alta y desactivación |
| [proyectos.test.ts](../../apps/api/src/proyectos.test.ts) | 404 sin acceso; solo el propietario administra; el lector no crea proyectos; revisor no escribe y editor no aprueba; archivados; auditoría; directorio sin datos sensibles |
| [ia.test.ts](../../apps/api/src/ia.test.ts) (API) | Permisos, modelo permitido, IA sin configurar, proyecto archivado y presupuesto |
| [sistema.test.ts](../../apps/api/src/sistema.test.ts) | 500 registrado con referencia; los 4xx no; informes de la web con límite por IP |
| [semilla.test.ts](../../apps/api/src/semilla.test.ts) | Cada cuenta de prueba se comporta según su caso (temporal, inactiva, externa…) |
| [index.test.ts](../../apps/intermediario/src/index.test.ts) (intermediario) | `/health` sin secretos; orígenes; código; modelos; JSON inválido; topes; 401 → 502 |
| [invitados.test.ts](../../apps/api/src/modulos/invitados/invitados.test.ts) | Permisos para crear, listar y revocar enlaces; token válido, caducado, revocado, inventado y de un proyecto archivado (el mismo 404); el invitado no llega a otra revisión; las rutas públicas no ven la sesión y exigen `Origin`; límites de uso; auditoría |
| E2E ([plataforma.spec.mjs](../../pruebas/e2e/plataforma.spec.mjs), [ia.spec.mjs](../../pruebas/e2e/ia.spec.mjs)) | Entrar y contraseña temporal en el navegador; permisos por rol; quien solo lee no usa la IA |

Más detalle en [pruebas.md](pruebas.md).

## 16. Qué NO está cubierto todavía

| Tema | Situación hoy | Previsto o mitigación |
|---|---|---|
| Entra ID (OIDC) y MFA | Solo cuentas locales, sin segundo factor | Entra ID cuando TI registre la aplicación ([ADR 12](../adr/0012-cuentas-locales.md)); la sesión no cambia |
| Recuperar la contraseña sin ayuda | No hay servidor de correo | Lo hace un administrador |
| `Content-Security-Policy` | No existe | CSP estricta ([arquitectura.md §9](../arquitectura.md#9-seguridad)). Antes hay que servir Montserrat desde la propia web |
| `Permissions-Policy`, HSTS con `includeSubDomains`/`preload` | No se envían | — |
| Redirección de HTTP a HTTPS | No hay: el puerto 80 es de IIS | Ver [servidor-local.md](../runbooks/servidor-local.md#problemas-conocidos) si se libera |
| Antivirus de archivos | No aplica hoy: los documentos no se suben. Solo se suben imágenes de temas PPTX (PNG o JPEG en data URI, máx. ~1,5 MB, solo administradores) | ClamAV en el worker cuando se guarden originales |
| Límite de uso por persona y por endpoint | Solo en «Entrar», `/api/errores` y `/api/publico/`, y en memoria | Contadores en Postgres |
| Sesiones | Sin caducidad por inactividad; entrar no cierra las sesiones anteriores. Las filas caducadas las purga el worker cada hora | — |
| Auditoría | Sin política de retención; la base no impide editar o borrar filas; `cli.js` y las exportaciones no se auditan | — |
| Copias de seguridad | Sin cifrar y en el mismo PC | Copiarlas fuera del equipo; PITR en la nube |
| Cifrado del disco del servidor | **Por confirmar** | — |
| Tráfico interno | Sin TLS entre contenedores (misma máquina) | — |
| Envío de datos a Anthropic | Sin política acordada con Legal ni revisión de la Ley 29733 | [arquitectura.md §4 y §8](../arquitectura.md#8-ia-en-producción) |
| Invitados externos | El enlace es la única credencial: no hay identidad ni segundo factor, y quien lo reciba reenviado también entra. Sin avisos por correo. El límite de uso vive en memoria | Caducidad corta, revocar en cuanto no haga falta; contadores en Postgres si hay varias instancias |
| Intermediario | Código compartido, sin límite de peticiones | Desaparece cuando todo pase por la API |
| `postgres-dev` | Publica el puerto 5440 en todas las interfaces del PC, con la contraseña fija de desarrollo | Recomendado: publicarlo solo en la interfaz de bucle local, en [docker-compose.yml](../../docker-compose.yml) |
| `ANTHROPIC_API_KEY` en la `api` | La recibe aunque no llama a Anthropic | Pasarle solo un indicador de «configurada» |
| Fijación de versiones | Acciones de GitHub por etiqueta mayor (`@v7`) e imágenes base por etiqueta (`node:22-alpine`, `caddy:2-alpine`, `postgres:17-alpine`), no por hash | — |
| Existencia de procesos | Un proceso de un proyecto sin acceso y uno inexistente responden 404 con mensajes distintos. Los ids son UUID aleatorios. (El cambio de estado de una revisión ya comprueba el acceso antes que el estado) | Mismo mensaje en los dos casos |
| Contenedor de Caddy | Usa la imagen oficial sin cambiar de usuario | **Por confirmar** si corre como root |

## 17. Cómo informar de una vulnerabilidad

**No abras un issue público.** Usa el reporte privado de vulnerabilidades de GitHub:

1. Ve a la pestaña **Security** del repositorio.
2. Pulsa **Report a vulnerability**.
3. Describe qué parte afecta (API, web, editor, intermediario, infraestructura), cómo reproducirlo paso a paso, qué impacto crees que tiene y la versión o el commit si lo sabes.

Solo lo ven los responsables del proyecto. Prueba en tu propio entorno de desarrollo ([desarrollo.md](desarrollo.md)), con las cuentas de prueba: nada que degrade el servicio, acceda a datos de otras personas o gaste la IA de la organización.

El alcance y el compromiso de respuesta están en [SECURITY.md](../../SECURITY.md).
