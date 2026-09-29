# Referencia de la API

Referencia completa de la API de la plataforma (`/api/*`): convenciones, permisos, cada endpoint con su cuerpo, su respuesta y sus errores, y los códigos de error.

Actualizado: 28-sep-2026.

La API está en [apps/api/src](../../apps/api/src) (Hono + Postgres). Todas las rutas se montan en [app.ts](../../apps/api/src/app.ts). El cliente tipado de la web es [api.ts](../../apps/web/src/shell/api.ts). Este documento describe el código tal como está: si algo cambia allí, cambia aquí.

## Contenido

1. [Resumen de endpoints](#resumen-de-endpoints)
2. [Convenciones generales](#convenciones-generales)
3. [Permisos](#permisos)
4. [Salud y errores de la web](#salud-y-errores-de-la-web)
5. [Sesión](#sesión)
6. [Usuarios](#usuarios)
7. [Directorio](#directorio)
8. [Proyectos y miembros](#proyectos-y-miembros)
9. [Procesos y revisiones](#procesos-y-revisiones)
10. [Auditoría](#auditoría)
11. [IA en el servidor](#ia-en-el-servidor)
12. [Catálogos](#catálogos)
13. [Sistema](#sistema)
14. [Códigos de error](#códigos-de-error)
15. [Acciones de auditoría](#acciones-de-auditoría)
16. [Intermediario de IA (`/ia`)](#intermediario-de-ia-ia)
17. [Módulos de iniciativas](#módulos-de-iniciativas)
18. [Observaciones y puntos por confirmar](#observaciones-y-puntos-por-confirmar)

## Resumen de endpoints

Permiso: **público** = sin sesión; **usuario** = cualquier sesión válida; **admin** = rol `admin` de la organización; **leer / escribir / aprobar / administrar** = capacidad en el proyecto (ver [Permisos](#permisos)).

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/api/salud` | público | Comprueba que la API y la base responden |
| POST | `/api/errores` | público | La web informa de un error de interfaz |
| POST | `/api/sesion` | público | Inicia sesión y deja la cookie |
| GET | `/api/sesion` | usuario ¹ | Devuelve el usuario de la sesión |
| DELETE | `/api/sesion` | usuario ¹ | Cierra la sesión |
| POST | `/api/sesion/clave` | usuario ¹ | Cambia la contraseña propia |
| GET | `/api/usuarios` | admin | Lista las cuentas de la organización |
| POST | `/api/usuarios` | admin | Da de alta una cuenta con contraseña temporal |
| PATCH | `/api/usuarios/:id` | admin | Cambia nombre, rol o estado de una cuenta |
| POST | `/api/usuarios/:id/restablecer-clave` | admin | Genera una contraseña temporal nueva |
| GET | `/api/directorio` | usuario | Cuentas activas (id, nombre, correo) para elegir miembros |
| GET | `/api/proyectos` | usuario | Mis proyectos, con mi rol |
| POST | `/api/proyectos` | admin o consultor | Crea un proyecto; el creador queda como propietario |
| GET | `/api/proyectos/:id` | leer | Proyecto, miembros y procesos con su última revisión |
| PATCH | `/api/proyectos/:id` | administrar | Cambia datos del proyecto o lo archiva/reactiva |
| PUT | `/api/proyectos/:id/miembros/:usuarioId` | administrar | Añade un miembro o cambia su rol |
| DELETE | `/api/proyectos/:id/miembros/:usuarioId` | administrar | Quita un miembro |
| POST | `/api/proyectos/:id/procesos` | escribir | Crea un proceso: vacío, desde un JSON o desde una plantilla |
| GET | `/api/procesos/:id` | leer | Proceso y lista de revisiones (sin contenido) |
| PATCH | `/api/procesos/:id` | escribir | Renombra el proceso |
| POST | `/api/procesos/:id/revisiones` | escribir | Guarda una revisión nueva |
| GET | `/api/revisiones/:id` | leer | Una revisión con su contenido |
| POST | `/api/revisiones/:id/estado` | escribir o aprobar ² | Envía a revisión, aprueba o devuelve |
| GET | `/api/auditoria` | admin | Últimos eventos de auditoría, con filtros |
| GET | `/api/ia/estado` | usuario | Modelos disponibles y presupuesto del mes |
| POST | `/api/ia/generaciones` | escribir | Encola la generación de un proceso desde texto |
| POST | `/api/ia/analisis` | escribir | Encola un análisis (pains o tarea del copiloto) |
| GET | `/api/ia/ejecuciones/:id` | leer | Estado y resultado de una ejecución |
| GET | `/api/ia/ejecuciones/:id/eventos` | leer | Progreso en vivo (SSE) |
| POST | `/api/ia/ejecuciones/:id/cancelar` | escribir | Cancela una ejecución |
| POST | `/api/ia/ejecuciones/:id/descartar` | escribir | Descarta una generación terminada |
| GET | `/api/ia/procesos/:id` | leer | Últimas ejecuciones de un proceso y pendientes |
| GET | `/api/ia/consumo` | admin | Gasto de IA del mes por persona y últimas ejecuciones |
| GET | `/api/catalogos` | usuario | Catálogos activos con la forma que usa el editor |
| GET | `/api/catalogos/kpis` | admin | Todos los KPIs de la organización |
| POST | `/api/catalogos/kpis` | admin | Crea un KPI |
| PATCH | `/api/catalogos/kpis/:id` | admin | Cambia o desactiva un KPI |
| GET | `/api/catalogos/verbos` | admin | Verbos del Playbook |
| PUT | `/api/catalogos/verbos/:verbo` | admin | Crea o cambia un verbo |
| DELETE | `/api/catalogos/verbos/:verbo` | admin | Borra un verbo |
| GET | `/api/catalogos/temas` | admin | Temas PPTX de cliente |
| POST | `/api/catalogos/temas` | admin | Crea un tema PPTX |
| PATCH | `/api/catalogos/temas/:id` | admin | Cambia la definición o activa/desactiva un tema |
| DELETE | `/api/catalogos/temas/:id` | admin | Borra un tema |
| GET | `/api/catalogos/plantillas` | usuario ³ | Plantillas de proceso (activas; el admin ve todas) |
| POST | `/api/catalogos/plantillas` | admin | Crea una plantilla desde una revisión |
| PATCH | `/api/catalogos/plantillas/:id` | admin | Renombra, cambia la descripción o la industria, oculta o muestra |
| DELETE | `/api/catalogos/plantillas/:id` | admin | Borra una plantilla |
| GET | `/api/sistema` | admin | Estado de API, base, worker, IA, copias y errores, con avisos |
| GET | `/api/sistema/errores/:huella` | admin | Últimas repeticiones de un error |
| GET | `/api/portafolio/clientes` | usuario | Portafolio: clientes de los proyectos visibles, con su avance |
| GET | `/api/portafolio/cliente?nombre=` | usuario | Portafolio: un cliente con sus procesos e indicadores |

¹ También con la contraseña temporal pendiente de cambio (ver [Contraseña temporal](#contraseña-temporal)).
² `escribir` para pasar de `borrador` a `en_revision`; `aprobar` para aprobar o devolver.
³ Un usuario que no es admin solo recibe las activas.

## Convenciones generales

### Base y formato

- Todas las rutas empiezan por `/api` y están en el **mismo origen** que la web. No hay CORS: la API no responde a otros orígenes.
- Cuerpos y respuestas en JSON. La API lee el cuerpo con `c.req.json()` y lo valida con Zod ([validar.ts](../../apps/api/src/validar.ts)). Los textos se recortan (`trim`) antes de validar la longitud.
- Los identificadores son UUID. Un id con formato inválido en la ruta responde **404**, no 400.
- Las fechas van en ISO 8601 (UTC).
- Las respuestas sin contenido son **204** sin cuerpo.
- Toda respuesta de `/api/*` lleva la cabecera `X-Request-Id` (8 caracteres hexadecimales).

### Sesión por cookie

- `POST /api/sesion` crea la sesión y deja la cookie **`piq_sesion`** ([rutas/sesion.ts](../../apps/api/src/rutas/sesion.ts)):
  - `HttpOnly`, `SameSite=Lax`, `Path=/`.
  - `Secure` solo si `ORIGEN_PUBLICO` empieza por `https://`.
  - Caduca a las `HORAS_SESION` horas (12 por defecto). La caducidad es fija: usar la sesión no la alarga.
- El token son 32 bytes aleatorios. En la base solo se guarda su SHA-256 ([seguridad.ts](../../apps/api/src/seguridad.ts)).
- En cada petición, la API busca la sesión por el hash, comprueba que no caducó y que la cuenta sigue activa. El rol se lee de la base en cada petición: un cambio de rol se aplica al instante.
- Sin cookie: **401 `SIN_SESION`** («Inicia sesión para continuar.»). Cookie caducada, desconocida o de una cuenta desactivada: **401 `SIN_SESION`** («La sesión caducó…»).

### Protección CSRF por `Origin`

Toda petición que no sea `GET`, `HEAD` u `OPTIONS` debe traer la cabecera `Origin` **exactamente igual** a `ORIGEN_PUBLICO`. Si no, **403 `ORIGEN`**. Vale también para las rutas públicas (`POST /api/sesion`, `POST /api/errores`). El navegador la pone solo; con `curl` hay que añadirla a mano.

### Rutas públicas

Solo tres rutas no piden sesión: `GET /api/salud`, `POST /api/sesion` y `POST /api/errores`. Cualquier otra ruta bajo `/api`, **incluso una que no existe**, responde 401 sin sesión. Con sesión, una ruta inexistente responde 404 `{ "error": { "mensaje": "Ruta no encontrada." } }`.

### Contraseña temporal

Una cuenta recién creada o con la contraseña restablecida tiene `debeCambiarClave: true`. Mientras no la cambie, solo puede usar:

- `GET /api/sesion`, `DELETE /api/sesion` y `POST /api/sesion/clave`;
- las rutas públicas.

Cualquier otra responde **403 `CAMBIAR_CLAVE`**.

### Límite de tamaño

El cuerpo de una petición no puede pasar de **8 MB**. Si pasa: **413** «La petición es demasiado grande (máximo 8 MB).», sin `codigo`. El límite se comprueba antes que la sesión.

### Formato de los errores

```json
{ "error": { "mensaje": "Texto para mostrar", "codigo": "CODIGO_ESTABLE", "detalles": ["…"] } }
```

- `mensaje`: en español, listo para mostrar.
- `codigo`: estable, para que la web reaccione sin leer el texto. Algunos errores no lo traen (400 de JSON inválido, 404, 413).
- `detalles`: solo en algunos errores. En `VALIDACION` y `PROCESO_INVALIDO` es una lista de textos `ruta.del.campo: motivo`.

Los errores esperados se lanzan con `ErrorHttp` ([contexto.ts](../../apps/api/src/contexto.ts)): estados 400, 401, 403, 404, 409, 413 y 429. No se guardan en la tabla `errores`.

**Errores 500.** Cualquier otro fallo responde:

```json
{ "error": { "mensaje": "Error interno del servidor (referencia 1a2b3c4d).", "codigo": "INTERNO", "referencia": "1a2b3c4d" } }
```

La `referencia` es la misma que la cabecera `X-Request-Id`. El error queda en la tabla `errores` (pantalla «Sistema») y en el log de la API como `{"evento":"error","id":"1a2b3c4d",…}`. Para buscarlo: `docker compose logs api | grep 1a2b3c4d`.

### Registro de peticiones

La API escribe en su log una línea JSON `{"evento":"peticion", id, metodo, ruta, estado, ms, usuario}` por cada escritura, cada respuesta 5xx y cada petición que tarda más de 2 s. Las lecturas rápidas no se registran.

### 404 frente a 403 en proyectos

[permisos.ts](../../apps/api/src/permisos.ts) (`accesoProyecto`):

- Proyecto de otra organización, inexistente o sin ser miembro: **404** «Proyecto no encontrado.». Así no se delata que existe.
- Miembro sin la capacidad pedida: **403 `PERMISO`** «Tu rol en este proyecto no permite esta acción.».

Lo mismo vale para procesos, revisiones y ejecuciones de IA, que heredan el acceso de su proyecto. Las rutas solo de administrador responden **403 `PERMISO`** («Solo un administrador puede hacer esto.»), no 404.

### Proyectos archivados

Un proyecto archivado es de solo lectura:

- Cualquier acción que pida `escribir` o `aprobar` responde **409 `ARCHIVADO`** («El proyecto está archivado.»): crear procesos, renombrarlos, guardar revisiones, cambiar estados, lanzar, cancelar o descartar IA.
- Con `administrar` solo se puede **reactivarlo** (`PATCH` con `archivado: false`). Cambiar otros datos o los miembros responde **409 `ARCHIVADO`** («…reactívalo antes de cambiarlo.»).
- Leer sigue permitido.

### Límites de uso

Los dos límites viven en memoria (hay una sola instancia de la API) y se reinician al reiniciarla. La IP es la primera de `X-Forwarded-For`, que pone Caddy; sin ella, `local`.

| Ruta | Límite | Respuesta |
|---|---|---|
| `POST /api/sesion` | Más de 10 fallos en 15 min **por correo o por IP** bloquean ese correo o esa IP hasta que acaba la ventana (cuenta desde el primer fallo). Un acceso correcto borra los fallos del correo, no los de la IP. | 429 `BLOQUEADO` |
| `POST /api/errores` | 20 informes por minuto y por IP. Se cuenta antes de validar el cuerpo. | 429 `LIMITE` |

### Ejemplo: sesión con `curl` en desarrollo

Con la API de desarrollo (`pnpm --filter @processiq/api dev`, puerto 8790) y las cuentas de la semilla:

```bash
API=http://localhost:8790
ORIGEN=http://localhost:5173   # el ORIGEN_PUBLICO de .env.dev

# Entrar: la cookie queda en cookies.txt
curl -s -c cookies.txt -H "Origin: $ORIGEN" -H "content-type: application/json" \
  -d '{"email":"admin@processiq.test","clave":"Prueba-ProcessIQ-2026"}' \
  "$API/api/sesion"

# Leer: los GET no piden Origin
curl -s -b cookies.txt "$API/api/proyectos"

# Escribir: cookie + Origin
curl -s -b cookies.txt -H "Origin: $ORIGEN" -H "content-type: application/json" \
  -d '{"nombre":"Proyecto de prueba","cliente":"Cliente X"}' \
  "$API/api/proyectos"
```

Desde la web se usa el cliente tipado, que ya envía la cookie y convierte los errores en `ErrorApi` (`estado`, `codigo`, `detalles`):

```ts
import { api, ErrorApi } from '../shell/api';

try {
  const { proyectos } = await api.proyectos();
} catch (e) {
  if (e instanceof ErrorApi && e.codigo === 'SIN_SESION') { /* ir a /proyectos/entrar */ }
}
```

Si falla la red, `pedir()` lanza `ErrorApi` con `estado: 0` y `codigo: 'RED'`. Ese código lo pone el cliente, no la API.

## Permisos

Dos niveles: el rol en la organización y el rol en cada proyecto ([permisos.ts](../../apps/api/src/permisos.ts), [contexto.ts](../../apps/api/src/contexto.ts)). La web copia las capacidades en `apps/web/src/shell/permisos.ts` solo para mostrar u ocultar botones: quien decide es la API.

### Rol de organización

| Rol | Qué puede |
|---|---|
| `admin` | Todo lo de su organización: usuarios, auditoría, catálogos (escritura), consumo de IA y «Sistema». En **todos** los proyectos de la organización actúa como `propietario`, aunque no sea miembro. `GET /api/proyectos` le devuelve todos. |
| `consultor` | Crear proyectos (queda como propietario). En el resto, lo que diga su rol en cada proyecto. |
| `lector` | No puede crear proyectos (403 `PERMISO`). En el resto, lo que diga su rol en cada proyecto. |

### Rol de proyecto y capacidades

| Capacidad | `propietario` | `editor` | `revisor` | `lector` | Para qué |
|---|:-:|:-:|:-:|:-:|---|
| `leer` | ✓ | ✓ | ✓ | ✓ | Ver el proyecto, procesos, revisiones y ejecuciones de IA |
| `escribir` | ✓ | ✓ | | | Crear y renombrar procesos, guardar revisiones, enviar a revisión, lanzar/cancelar/descartar IA |
| `aprobar` | ✓ | | ✓ | | Aprobar o devolver una revisión `en_revision` |
| `administrar` | ✓ | | | | Datos del proyecto, miembros, archivar y reactivar |

## Salud y errores de la web

Rutas en [app.ts](../../apps/api/src/app.ts) y [rutas/sistema.ts](../../apps/api/src/rutas/sistema.ts).

### `GET /api/salud`

- **Permiso:** público.
- **Respuesta 200:** `{ "ok": true, "servicio": "processiq-api" }`. Antes ejecuta `select 1` en la base; si la base no responde, sale un 500.
- La usa el `HEALTHCHECK` de la imagen Docker de la API.

### `POST /api/errores`

La web y el editor informan de sus errores inesperados.

- **Permiso:** público, pero con `Origin` correcto. Límite: 20 por minuto por IP (429 `LIMITE`).
- **Cuerpo:**

| Campo | Tipo | Validación |
|---|---|---|
| `origen` | `'web' \| 'editor'` | obligatorio |
| `mensaje` | string | máx. 2000 |
| `pila` | string | opcional, máx. 8000 |
| `url` | string | opcional, máx. 500 |
| `detalle` | objeto | opcional; su JSON no puede pasar de 4000 caracteres |

- **Respuesta:** 204.
- Si la petición trae una cookie de sesión válida, anota el usuario. Se guarda en `errores` con una huella que agrupa repeticiones ([observabilidad.ts](../../apps/api/src/observabilidad.ts)). Los errores se purgan a los 30 días.
- **Auditoría:** ninguna.

## Sesión

[rutas/sesion.ts](../../apps/api/src/rutas/sesion.ts). El objeto `usuario` que devuelven estas rutas es:

```json
{ "id": "uuid", "email": "ana@ejemplo.test", "nombre": "Ana", "rol": "consultor", "debeCambiarClave": false }
```

### `POST /api/sesion` — entrar

- **Permiso:** público.
- **Cuerpo:** `email` (correo válido, máx. 200; se pasa a minúsculas), `clave` (1–200).
- **Respuesta 200:** `{ "usuario": {…} }` y la cabecera `Set-Cookie: piq_sesion=…`.
- **Errores:**
  - 401 `CREDENCIALES`: correo inexistente, contraseña incorrecta o cuenta desactivada (mismo mensaje en los tres casos; la contraseña se verifica siempre para no delatar qué correos existen).
  - 429 `BLOQUEADO`: demasiados fallos (ver [Límites de uso](#límites-de-uso)).
- **Auditoría:** `sesion.inicio`; en los fallos, `sesion.fallida` con `{ email }`.
- Actualiza `ultimoAcceso` de la cuenta.

### `GET /api/sesion` — quién soy

- **Permiso:** usuario (también con contraseña temporal).
- **Respuesta 200:** `{ "usuario": {…} }`.

### `DELETE /api/sesion` — salir

- **Permiso:** usuario (también con contraseña temporal).
- Borra la sesión y la cookie. **Respuesta:** 204.
- **Auditoría:** `sesion.cierre`.

### `POST /api/sesion/clave` — cambiar la contraseña

- **Permiso:** usuario (también con contraseña temporal).
- **Cuerpo:** `actual` (1–200), `nueva` (máx. 200).
- **Reglas de la nueva** (`problemaConClave` en [seguridad.ts](../../apps/api/src/seguridad.ts)): al menos 10 caracteres, no solo números, no puede contener la parte del correo antes de la `@` (sin distinguir mayúsculas) y debe ser distinta de la actual.
- **Respuesta:** 204. Quita `debeCambiarClave` y **cierra las demás sesiones** del usuario (la actual sigue).
- **Errores:** 400 `CLAVE_ACTUAL` (la actual no coincide), 400 `CLAVE_DEBIL` (incumple una regla; el mensaje dice cuál).
- **Auditoría:** `usuario.cambio_clave`.

## Usuarios

[rutas/usuarios.ts](../../apps/api/src/rutas/usuarios.ts). **Todas solo para admin** (403 `PERMISO`). Solo ven y tocan cuentas de su organización. El objeto `usuario` de administración es:

```json
{ "id": "uuid", "email": "…", "nombre": "…", "rol": "consultor", "activo": true,
  "debeCambiarClave": true, "creadoEn": "…", "ultimoAcceso": null }
```

### `GET /api/usuarios`

- **Respuesta 200:** `{ "usuarios": [ … ] }`, ordenados por nombre.

### `POST /api/usuarios`

- **Cuerpo:** `email` (correo válido, máx. 200, a minúsculas), `nombre` (1–120), `rol` (`admin` | `consultor` | `lector`, por defecto `consultor`).
- **Respuesta 201:** `{ "usuario": {…}, "claveTemporal": "…" }`. La contraseña temporal (14 caracteres, sin 0/O/1/l/I) **se muestra una sola vez**; la cuenta nace con `debeCambiarClave: true`.
- **Errores:** 409 `DUPLICADO` si el correo ya existe (en cualquier organización: el correo es único en toda la base).
- **Auditoría:** `usuario.alta` con `{ email, rol }`.

### `PATCH /api/usuarios/:id`

- **Cuerpo:** al menos uno de `nombre` (1–120), `rol`, `activo` (boolean). Vacío: 400 `VALIDACION` («Nada que cambiar»).
- **Respuesta 200:** `{ "usuario": {…} }`.
- Desactivar (`activo: false`) **corta en el acto todas sus sesiones**.
- **Errores:** 404 si no existe en la organización; 409 `AUTOBLOQUEO` si te quitas a ti mismo el rol `admin` o te desactivas.
- **Auditoría:** `usuario.cambio` con los cambios.

### `POST /api/usuarios/:id/restablecer-clave`

- **Cuerpo:** ninguno.
- **Respuesta 200:** `{ "claveTemporal": "…" }`. Marca `debeCambiarClave` y **borra todas las sesiones** de esa cuenta (también la tuya si te restableces a ti mismo).
- **Errores:** 404 si no existe en la organización.
- **Auditoría:** `usuario.restablecer_clave`.

El primer administrador se crea por línea de comandos, dentro del contenedor de la API: `node dist/cli.js crear-usuario --email … --nombre "…" --rol admin` ([cli.ts](../../apps/api/src/cli.ts)). La línea de comandos no deja rastro en la auditoría.

## Directorio

[rutas/directorio.ts](../../apps/api/src/rutas/directorio.ts).

### `GET /api/directorio`

- **Permiso:** usuario.
- **Respuesta 200:** `{ "usuarios": [ { "id", "nombre", "email" } ] }`: cuentas **activas** de la organización, por nombre. Sirve para elegir a quién añadir a un proyecto.

## Proyectos y miembros

[rutas/proyectos.ts](../../apps/api/src/rutas/proyectos.ts). El objeto `proyecto` es la fila completa:

```json
{ "id": "uuid", "organizacionId": "uuid", "nombre": "…", "cliente": "…", "descripcion": "…",
  "creadoPor": "uuid", "creadoEn": "…", "archivado": false, "rol": "propietario" }
```

### `GET /api/proyectos`

- **Permiso:** usuario.
- **Respuesta 200:** `{ "proyectos": [ { "id", "nombre", "cliente", "descripcion", "archivado", "creadoEn", "rol" } ] }`, del más nuevo al más antiguo. Un admin recibe todos los de la organización con `rol: "propietario"`; los demás, solo aquellos de los que son miembros (archivados incluidos).

### `POST /api/proyectos`

- **Permiso:** admin o consultor. Un `lector` de organización recibe 403 `PERMISO`.
- **Cuerpo:** `nombre` (1–160), `cliente` (máx. 160, por defecto `""`), `descripcion` (máx. 2000, por defecto `""`).
- **Respuesta 201:** `{ "proyecto": {…, "rol": "propietario"} }`. El creador queda como miembro `propietario`.
- **Auditoría:** `proyecto.alta` con `{ nombre }`.

### `GET /api/proyectos/:id`

- **Permiso:** leer.
- **Respuesta 200:**

```json
{
  "proyecto": { "…": "fila completa", "rol": "editor" },
  "miembros": [ { "usuarioId": "uuid", "nombre": "…", "email": "…", "rol": "propietario" } ],
  "procesos": [ { "id": "uuid", "proyectoId": "uuid", "nombre": "…", "creadoPor": "uuid",
                  "creadoEn": "…", "actualizadoEn": "…",
                  "ultimaRevision": { "id": "uuid", "numero": 3, "estado": "borrador" } } ]
}
```

- `miembros` va por nombre; `procesos`, del último actualizado al primero. `ultimaRevision` es `null` si el proceso no tiene revisiones. Un admin que no es miembro no aparece en `miembros`.

### `PATCH /api/proyectos/:id`

- **Permiso:** administrar.
- **Cuerpo:** al menos uno de `nombre` (1–160), `cliente` (máx. 160), `descripcion` (máx. 2000), `archivado` (boolean). Vacío: 400 `VALIDACION`.
- **Respuesta 200:** `{ "proyecto": {…} }` (fila completa, **sin** `rol`).
- **Errores:** 409 `ARCHIVADO` si el proyecto está archivado y el cuerpo trae algo más que `archivado`.
- **Auditoría:** `proyecto.cambio` con los cambios.

### `PUT /api/proyectos/:id/miembros/:usuarioId`

- **Permiso:** administrar; el proyecto no puede estar archivado (409 `ARCHIVADO`).
- **Cuerpo:** `rol` (`propietario` | `editor` | `revisor` | `lector`).
- Añade el miembro o, si ya lo es, cambia su rol. La cuenta debe ser **activa** y de la misma organización.
- **Respuesta 200:** `{ "ok": true }`.
- **Errores:** 404 «Usuario no encontrado.»; 409 `ULTIMO_PROPIETARIO` si baja de rol al único propietario.
- **Auditoría:** `proyecto.miembro` con `{ usuarioId, rol }`.

### `DELETE /api/proyectos/:id/miembros/:usuarioId`

- **Permiso:** administrar; no archivado (409 `ARCHIVADO`).
- **Respuesta:** 204 (también si esa persona no era miembro).
- **Errores:** 404 si el id no es un UUID; 409 `ULTIMO_PROPIETARIO` si es el único propietario.
- **Auditoría:** `proyecto.baja_miembro` con `{ usuarioId }`.

## Procesos y revisiones

[rutas/procesos.ts](../../apps/api/src/rutas/procesos.ts).

- Un **proceso** pertenece a un proyecto y tiene revisiones numeradas (1, 2, 3…).
- Una **revisión** es el proceso completo en JSON v1. Se valida y migra con `migrarProyecto` de `@processiq/dominio`: se acepta el export JSON del editor o una versión anterior del esquema, y se guarda en v1.
- Si el contenido no es válido: 400 `PROCESO_INVALIDO`, con `detalles` = lista de errores del esquema.

El objeto `revision` de las listas es:

```json
{ "id": "uuid", "procesoId": "uuid", "numero": 2, "padreId": "uuid|null", "autorId": "uuid",
  "autor": "Nombre", "mensaje": "…", "estado": "borrador", "schemaVersion": 1, "creadaEn": "…" }
```

### `POST /api/proyectos/:id/procesos`

- **Permiso:** escribir.
- **Cuerpo:**

| Campo | Tipo | Validación |
|---|---|---|
| `nombre` | string | 1–200 |
| `contenido` | JSON | opcional: proceso inicial (export del editor o v1) |
| `plantillaId` | UUID | opcional: plantilla activa de la organización de la que parte (en lugar de `contenido`) |
| `mensaje` | string | máx. 500, por defecto `""` (si queda vacío se usa «Versión inicial», o «Creado desde la plantilla «X»») |

- **Desde una plantilla:** la v1 es una copia de su contenido, con `meta.name` = `nombre` y `meta.client` = el cliente del proyecto.
- **Respuesta 201:** `{ "proceso": {…}, "revision": { "id", "numero": 1, "estado": "borrador" } | null }`. Sin `contenido` ni `plantillaId`, el proceso nace sin revisiones.
- **Errores:** 400 `PROCESO_INVALIDO`; 400 `VALIDACION` si llegan `contenido` y `plantillaId` a la vez; 404 si la plantilla no existe, está oculta o es de otra organización; 409 `ARCHIVADO`.
- **Auditoría:** `proceso.alta` con `{ proyectoId, nombre, conRevision }` y, si parte de una plantilla, `plantillaId`.

### `GET /api/procesos/:id`

- **Permiso:** leer.
- **Respuesta 200:** `{ "proceso": {…}, "rol": "editor", "revisiones": [ … ] }`. Revisiones de la más nueva a la más antigua, **sin** contenido.

### `PATCH /api/procesos/:id`

- **Permiso:** escribir.
- **Cuerpo:** `nombre` (1–200).
- **Respuesta 200:** `{ "proceso": {…} }` (actualiza `actualizadoEn`).
- **Auditoría:** `proceso.cambio` con `{ nombre }`.

### `POST /api/procesos/:id/revisiones` — guardar revisión

- **Permiso:** escribir.
- **Cuerpo:**

| Campo | Tipo | Validación |
|---|---|---|
| `contenido` | JSON | obligatorio; se valida con `migrarProyecto` |
| `mensaje` | string | máx. 500, por defecto `""` |
| `padreId` | UUID o `null` | por defecto `null`: la revisión sobre la que trabajaste (`null` si partiste de un proceso sin revisiones) |
| `ejecucionIaId` | UUID o `null` | por defecto `null`: la generación de IA de la que sale esta revisión |

- **Cómo funciona:**
  - Todo va en una transacción que bloquea el proceso (`select … for update`): dos guardados simultáneos nunca reciben el mismo número.
  - El número es el de la última revisión + 1. La revisión nueva nace en `borrador`.
  - **Conflicto:** si `padreId` no es la última revisión (alguien guardó en paralelo), se guarda igual y se responde `conflicto: true`. No se pierde nada.
  - Con `ejecucionIaId`, la ejecución queda enlazada a la revisión y deja de ofrecerse como pendiente. Debe ser una `generacion` `completada` de este mismo proceso; si no, falla todo el guardado.
- **Respuesta 201:**

```json
{
  "revision": { "id": "uuid", "numero": 4, "estado": "borrador", "padreId": "uuid", "creadaEn": "…" },
  "conflicto": false,
  "ultimaAnterior": { "id": "uuid", "numero": 3 }
}
```

- **Errores:** 400 `PROCESO_INVALIDO`, 400 `PADRE_INVALIDO` (el padre no es de este proceso), 400 `EJECUCION_INVALIDA`, 409 `ARCHIVADO`.
- **Auditoría:** `revision.alta` con `{ procesoId, numero, conflicto, ejecucionIaId? }`.

### `GET /api/revisiones/:id`

- **Permiso:** leer (sobre el proyecto del proceso).
- **Respuesta 200:** `{ "revision": { …, "contenido": { …JSON v1… } } }`.

### `POST /api/revisiones/:id/estado`

- **Cuerpo:** `estado` (`borrador` | `en_revision` | `aprobada`).
- **Transiciones permitidas:**

| De | A | Capacidad |
|---|---|---|
| `borrador` | `en_revision` | escribir |
| `en_revision` | `aprobada` | aprobar |
| `en_revision` | `borrador` (devolver) | aprobar |

- Una revisión `aprobada` es **inmutable**: para cambiarla, guarda una nueva.
- **Respuesta 200:** `{ "revision": { "id", "estado" } }`.
- **Errores:**
  - 404 si no tienes acceso al proyecto (se comprueba antes que el estado: no se revela en qué estado está).
  - 409 `INMUTABLE`: la revisión ya está aprobada.
  - 409 `TRANSICION`: transición no permitida (p. ej. `borrador` → `aprobada`).
  - 409 `CONCURRENCIA`: otra persona la cambió a la vez.
  - 409 `ARCHIVADO`, 403 `PERMISO`.
- **Auditoría:** `revision.estado` con `{ de, a }`.

## Auditoría

[rutas/auditoria.ts](../../apps/api/src/rutas/auditoria.ts). La tabla `auditoria` solo recibe inserciones ([auditoria.ts](../../apps/api/src/auditoria.ts)): usuario, acción, entidad, id, detalle e IP.

### `GET /api/auditoria`

- **Permiso:** admin.
- **Parámetros de consulta** (opcionales): `entidad` (p. ej. `proyecto`), `entidadId`, `limite` (1–500, por defecto 100; si no es un número, se usa el de por defecto).
- **Respuesta 200:** del más reciente al más antiguo:

```json
{ "eventos": [ { "id": 123, "accion": "revision.estado", "entidad": "revision", "entidadId": "uuid",
                 "detalle": { "de": "en_revision", "a": "aprobada" }, "ip": "…", "creadoEn": "…",
                 "usuario": "correo@ejemplo.test" } ] }
```

`usuario` es el correo (o `null` si el evento no tiene usuario, como un inicio de sesión fallido). La lista completa de acciones está en [Acciones de auditoría](#acciones-de-auditoría).

## IA en el servidor

[rutas/ia.ts](../../apps/api/src/rutas/ia.ts), [ia/cola.ts](../../apps/api/src/ia/cola.ts), [ia/ejecutar.ts](../../apps/api/src/ia/ejecutar.ts), [ia/avisos.ts](../../apps/api/src/ia/avisos.ts), [worker.ts](../../apps/api/src/worker.ts).

**El cliente nunca envía prompts.** Envía el texto de las fuentes o el proceso. El servidor decide el prompt, el modelo (dentro de los permitidos), el esfuerzo y los topes.

### Cómo funciona una ejecución

1. La API valida, comprueba permisos y topes, e inserta una fila en `ejecuciones_ia` en estado `en_cola`. Responde **202** y avisa al worker (`NOTIFY ia_cola`).
2. El worker toma la fila más antigua disponible con `FOR UPDATE SKIP LOCKED`. La pasa a `ejecutando` y llama a Claude en streaming.
3. Cada segundo como mucho, actualiza `progreso` (caracteres recibidos) y avisa (`NOTIFY ia_ejecucion`). El SSE reenvía el estado.
4. Al terminar queda en `completada` (con `resultado`), `fallida` (con `error`) o `cancelada`. El texto de las fuentes se borra de la base.

Estados y reintentos:

| Estado | Significado |
|---|---|
| `en_cola` | Esperando al worker. Si `error` tiene texto, es un reintento programado («… (reintento 2 de 3)»). |
| `ejecutando` | El worker está llamando a Claude. `progreso` = caracteres recibidos. |
| `completada` | Terminó. `resultado` tiene la salida. |
| `fallida` | Error no recuperable o se agotaron los reintentos. `error` explica por qué. |
| `cancelada` | Alguien la canceló. |

- **Reintentos:** hasta 3 intentos ante errores pasajeros (red, 429, sobrecarga), con esperas de 15 s y 60 s.
- **Reparación del JSON:** en las generaciones, si la respuesta no es un proceso válido y no es enorme (`MAX_CHARS_REPARACION` de `@processiq/ia`), se pide **una** reparación a la IA. Si tampoco sirve, la ejecución queda `fallida`.
- **Coste:** los tokens y el coste de todos los intentos y de la reparación se suman.
- **Ejecuciones huérfanas:** si una ejecución lleva 120 s en `ejecutando` sin latido (el worker se cayó), vuelve a la cola sin contar el intento. Lo mismo pasa si el worker se apaga a mitad.

### Topes de gasto

Antes de encolar, la API comprueba (`exigirIaDisponible`):

1. Que hay clave de Anthropic (`ANTHROPIC_API_KEY`). Si no: 409 `IA_NO_CONFIGURADA`.
2. Que el gasto del mes de la organización es menor que `PRESUPUESTO_IA_MENSUAL_USD`. Si no: 409 `PRESUPUESTO`.
3. Que tu gasto del mes es menor que `LIMITE_IA_USUARIO_MENSUAL_USD`. Si no: 409 `LIMITE_USUARIO`.

El mes es el mes calendario en hora de Lima (`America/Lima`) y se cuenta por la fecha de creación de cada ejecución. El gasto es a precio de lista de Anthropic. El tope se comprueba **al encolar**: las ejecuciones ya en cola o en curso pueden pasarlo.

### El objeto `ejecucion`

Nunca incluye el texto de las fuentes ni la organización (`publica()` en [rutas/ia.ts](../../apps/api/src/rutas/ia.ts)).

| Campo | Tipo | Notas |
|---|---|---|
| `id`, `procesoId`, `usuarioId` | UUID | |
| `tipo` | `generacion` \| `pains` \| `tarea` | |
| `tarea` | string \| null | Solo en `tarea`: `suggest-kpis`, `propose-tobe`, `raci`… |
| `modelo` | string | Modelo usado |
| `estado` | ver tabla anterior | |
| `parametros` | objeto | Generación: `etiqueta`, `vista`, `roles`, `variasFuentes`, `fuentes`, `caracteres`. Análisis: `nodos`. |
| `progreso` | número | Caracteres recibidos |
| `resultado` | JSON | **Solo** en `GET /api/ia/ejecuciones/:id`, en el evento SSE final y en `pendientes`. Generación: la especificación del proceso; `pains`: `{ datos }`; `tarea`: `{ markdown }`. |
| `error` | string \| null | |
| `intentos` | número | |
| `tokensEntrada`, `tokensSalida`, `costeUsd` | número | Acumulados |
| `revisionId` | UUID \| null | Revisión que la aplicó |
| `descartada` | boolean | |
| `cancelar` | boolean | Se pidió cancelar |
| `disponibleEn`, `creadoEn`, `iniciadoEn`, `terminadoEn`, `actualizadoEn` | fecha \| null | |

### `GET /api/ia/estado`

- **Permiso:** usuario.
- **Respuesta 200:**

```json
{
  "configurada": true,
  "modelos": [ { "id": "claude-opus-5", "label": "Claude Opus — …", "precio": { "entrada": 5, "salida": 25, "nombre": "Claude Opus 5" } } ],
  "modeloAnalisis": "claude-sonnet-5",
  "presupuesto": { "mensualUsd": 100, "gastadoUsd": 12.4, "limiteUsuarioUsd": 25, "gastadoUsuarioUsd": 3.1 }
}
```

`modelos` son los de `MODELOS_IA_PERMITIDOS`, en el orden del catálogo de `@processiq/ia`. Precios en US$ por millón de tokens.

### `POST /api/ia/generaciones`

Genera un proceso a partir del texto de las fuentes. Sustituye a `aiBuildProcess` del MVP.

- **Permiso:** escribir en el proyecto del proceso.
- **Cuerpo:**

| Campo | Tipo | Validación |
|---|---|---|
| `procesoId` | UUID | obligatorio |
| `texto` | string | 1 a 1 000 000 caracteres («No hay texto que interpretar.» si está vacío). El worker usa como mucho 180 000. |
| `etiqueta` | string | máx. 200, por defecto `"documento"` |
| `vista` | `1 \| 2 \| 3` | por defecto `2` (nivel de detalle) |
| `roles` | objeto `{ texto: texto }` | opcional o `null`; claves y valores máx. 200 |
| `variasFuentes` | boolean | por defecto `false` |
| `fuentes` | lista de `{ nombre (máx. 300), tipo (máx. 40), caracteres (entero ≥ 0) }` | máx. 50, por defecto `[]` |
| `modelo` | string | opcional; por defecto el primero de `MODELOS_IA_PERMITIDOS` |

- **Respuesta 202:** `{ "ejecucion": {…} }` (sin `resultado`).
- **Errores:** 400 `VALIDACION`, 400 `MODELO` (modelo no permitido), 409 `IA_NO_CONFIGURADA`, 409 `PRESUPUESTO`, 409 `LIMITE_USUARIO`, 409 `ARCHIVADO`.
- **Auditoría:** `ia.generacion` (entidad `proceso`) con `{ ejecucionId, modelo, caracteres, fuentes }` (solo los nombres de las fuentes).

Ejemplo desde la web:

```ts
const { ejecucion } = await api.generarIa({
  procesoId, texto, etiqueta: 'Entrevistas', vista: 2,
  variasFuentes: true, fuentes: [{ nombre: 'entrevista-1.docx', tipo: 'docx', caracteres: 18000 }]
});
```

### `POST /api/ia/analisis`

Pains o una tarea del copiloto. Sustituye a `aiAnalyzePains` y `runAiTask` del MVP.

- **Permiso:** escribir.
- **Cuerpo:**
  - `procesoId` (UUID).
  - `tipo`: `pains` o una tarea de `TAREAS_IA`: `suggest-kpis`, `propose-tobe`, `raci`, `impact-effort`, `automation`, `backlog`, `exec-summary`, `sipoc`, `bottleneck`. Otro valor: 400 `VALIDACION` («Análisis desconocido.»).
  - `contenido`: el proceso tal como está en el editor.
- El servidor valida el contenido, arma un resumen del proceso y usa siempre `MODELO_IA_ANALISIS`.
- **Respuesta 202:** `{ "ejecucion": {…} }`.
- **Errores:** 400 `PROCESO_INVALIDO`, 400 `PROCESO_VACIO` (sin nodos), 409 `IA_NO_CONFIGURADA`, 409 `PRESUPUESTO`, 409 `LIMITE_USUARIO`, 409 `ARCHIVADO`.
- **Auditoría:** `ia.analisis` con `{ ejecucionId, tipo }`.

### `GET /api/ia/ejecuciones/:id`

- **Permiso:** leer.
- **Respuesta 200:** `{ "ejecucion": {…} }`, **con** `resultado` (que vale `null` mientras no termina).

### `GET /api/ia/ejecuciones/:id/eventos` — progreso en vivo (SSE)

- **Permiso:** leer. Los errores de acceso (401, 404…) llegan como JSON normal, antes de abrir el stream.
- **Respuesta:** `Content-Type: text/event-stream`.
- **Eventos:**
  - `estado`: el objeto `ejecucion` completo en `data`. Se envía al conectar y cada vez que cambia.
  - Un comentario `: latido` cuando no hubo cambios en la última espera, para mantener viva la conexión.
- **Cuándo se envía:** la API escucha `ia_ejecucion` (LISTEN/NOTIFY de Postgres) y, como respaldo, vuelve a leer la fila cada 5 s.
- **Cierre:** el servidor cierra el stream al enviar un estado terminal (`completada`, `fallida`, `cancelada`). Solo ese último evento incluye `resultado`.
- **Reconexión:** cada evento trae el estado completo, así que reconectar es seguro: el primer evento de la conexión nueva es el estado actual. No se usan `id:` ni `retry:`.
- **Cierre en el cliente:** al recibir un estado terminal, **cierra el `EventSource`**. Si no, el navegador reconecta y recibe otra vez el estado final.

Flujo típico:

```text
event: estado
data: {"id":"…","estado":"en_cola","progreso":0,…}

event: estado
data: {"id":"…","estado":"ejecutando","progreso":0,…}

event: estado
data: {"id":"…","estado":"ejecutando","progreso":4210,…}

: latido

event: estado
data: {"id":"…","estado":"completada","resultado":{…},…}
```

En el navegador (así lo hace [plataforma/ia.js](../../apps/web/src/app/plataforma/ia.js)):

```js
const fuente = new EventSource(api.eventosIa(id));
fuente.addEventListener('estado', (ev) => {
  const e = JSON.parse(ev.data);
  if (['completada', 'fallida', 'cancelada'].includes(e.estado)) fuente.close();
});
```

Con `curl`: `curl -N -b cookies.txt "$API/api/ia/ejecuciones/<id>/eventos"`.

### `POST /api/ia/ejecuciones/:id/cancelar`

- **Permiso:** escribir.
- **Comportamiento:**
  - En cola: pasa a `cancelada` al momento y se borra el texto.
  - Ejecutando: se marca `cancelar: true` y el worker aborta la llamada en su siguiente vigilancia (cada 2 s).
  - Ya terminada: no cambia nada y devuelve la ejecución tal cual.
- **Respuesta 200:** `{ "ejecucion": {…} }`.
- **Auditoría:** `ia.cancelacion` (entidad `proceso`) con `{ ejecucionId }`, salvo si ya estaba terminada.

### `POST /api/ia/ejecuciones/:id/descartar`

- **Permiso:** escribir.
- Marca `descartada: true`: una generación terminada deja de ofrecerse al abrir el proceso. No comprueba el tipo ni el estado.
- **Respuesta 200:** `{ "ejecucion": {…} }`.
- **Auditoría:** ninguna.

### `GET /api/ia/procesos/:id`

- **Permiso:** leer.
- **Respuesta 200:** `{ "ejecuciones": [ … ], "pendientes": [ … ] }`.
  - `ejecuciones`: las 20 últimas del proceso, sin `resultado`.
  - `pendientes`: las de esas 20 que son `generacion` `completada`, sin revisión y sin descartar, **con** `resultado`. El editor las ofrece para dibujarlas.

### `GET /api/ia/consumo`

- **Permiso:** admin.
- **Respuesta 200:**

```json
{
  "mes": { "gastadoUsd": 12.4, "presupuestoUsd": 100, "limiteUsuarioUsd": 25 },
  "porUsuario": [ { "usuarioId": "uuid", "nombre": "…", "email": "…", "ejecuciones": 7, "costeUsd": 3.1 } ],
  "recientes": [ { "id", "procesoId", "tipo", "tarea", "modelo", "estado", "error", "intentos",
                   "tokensEntrada", "tokensSalida", "costeUsd", "creadoEn", "terminadoEn", "usuario": "correo" } ]
}
```

`mes` y `porUsuario` son del mes en curso (hora de Lima), por gasto descendente. `recientes` son las 50 últimas ejecuciones de la organización, de cualquier mes.

## Catálogos

[rutas/catalogos.ts](../../apps/api/src/rutas/catalogos.ts), [catalogos.ts](../../apps/api/src/catalogos.ts). Son por organización: KPIs, verbos del Playbook, temas PPTX de cliente y plantillas de proceso. Al crear la organización se siembran con los del MVP. **Leer lo activo: cualquier usuario. Todo lo demás: admin.**

### `GET /api/catalogos`

- **Permiso:** usuario.
- **Respuesta 200:** solo lo activo, con la forma de `@processiq/dominio` (la que usa el editor):

```json
{
  "kpis": [ { "id": "codigo", "industry": "…", "macroprocess": "…", "name": "…", "unit": "…", "benchmark": "…", "description": "…" } ],
  "verbos": { "permitidos": ["registrar", "…"], "prohibidos": { "gestionar": "motivo que ve el consultor" } },
  "temas": [ { "clave": "cliente", "nombre": "…", "definicion": { … } } ]
}
```

En los KPIs, `id` es el `codigo` estable que guardan los procesos.

### KPIs

El objeto `kpi` es la fila completa: `id`, `organizacionId`, `codigo`, `industria`, `macroproceso`, `nombre`, `unidad`, `benchmark`, `descripcion`, `activo`, `creadoEn`, `actualizadoEn`.

| Método y ruta | Cuerpo | Respuesta | Auditoría |
|---|---|---|---|
| `GET /api/catalogos/kpis` | — | `{ "kpis": [ … ] }` por industria, macroproceso y nombre, activos e inactivos | — |
| `POST /api/catalogos/kpis` | `industria` (1–80), `nombre` (1–160), `macroproceso` (máx. 80), `unidad` (máx. 40), `benchmark` (máx. 120), `descripcion` (máx. 600); los opcionales valen `""` por defecto | 201 `{ "kpi": {…} }`. El `codigo` lo genera la API (`org-` + 8 caracteres) y **no cambia nunca**. | `catalogo.kpi.alta` |
| `PATCH /api/catalogos/kpis/:id` | cualquiera de los campos anteriores y `activo` (boolean) | `{ "kpi": {…} }`; 404 si no existe en la organización | `catalogo.kpi.cambio` |

Un KPI desactivado deja de ofrecerse en el editor, pero los procesos que ya lo usan lo conservan.

> **Atención:** hoy un `PATCH` que no incluye `macroproceso`, `unidad`, `benchmark` o `descripcion` **los vacía**. Ver [Observaciones](#observaciones-y-puntos-por-confirmar).

### Verbos del Playbook

El objeto `verbo` es `{ "verbo", "tipo": "permitido" | "prohibido", "motivo", "actualizadoEn" }`; en la lista, además, `organizacionId`.

| Método y ruta | Cuerpo | Respuesta | Auditoría |
|---|---|---|---|
| `GET /api/catalogos/verbos` | — | `{ "verbos": [ … ] }` por orden alfabético | — |
| `PUT /api/catalogos/verbos/:verbo` | `tipo` (`permitido` \| `prohibido`), `motivo` (máx. 200, por defecto `""`; **obligatorio** si es prohibido) | `{ "verbo": {…} }` (crea o cambia; en un verbo permitido el motivo se guarda vacío) | `catalogo.verbo` con `{ tipo }` |
| `DELETE /api/catalogos/verbos/:verbo` | — | 204; 404 si no existe | `catalogo.verbo.baja` |

El `:verbo` de la ruta se pasa a minúsculas y debe ser una sola palabra de 2 a 30 letras (`a-z`, vocales acentuadas, `ü`, `ñ`). Si no: 400 `VALIDACION` («El verbo debe ser una sola palabra en infinitivo…»).

### Temas PPTX de cliente

El objeto `tema` es la fila completa: `id`, `organizacionId`, `clave`, `nombre`, `definicion`, `activo`, `creadoEn`, `actualizadoEn`. Los temas del código (`mbc`, `bbva`) no están en la base y no se pueden redefinir.

| Método y ruta | Cuerpo | Respuesta | Auditoría |
|---|---|---|---|
| `GET /api/catalogos/temas` | — | `{ "temas": [ … ] }` por nombre | — |
| `POST /api/catalogos/temas` | `clave` (2–30: minúsculas, números y guiones; se pasa a minúsculas), `definicion` | 201 `{ "tema": {…} }`; 409 `CLAVE_RESERVADA` (`mbc`, `bbva`); 409 `DUPLICADO` | `catalogo.tema.alta` con `{ clave, nombre }` |
| `PATCH /api/catalogos/temas/:id` | al menos uno de `definicion` (completa) y `activo` | `{ "tema": {…} }`; 404. La clave no se cambia. | `catalogo.tema.cambio` con `{ activo, definicion: true/false }` |
| `DELETE /api/catalogos/temas/:id` | — | 204; 404 | `catalogo.tema.baja` con `{ clave }` |

`definicion` sigue la forma de `TEMAS_PPTX` de `@processiq/exportar` y es **estricta**: un campo de más da error.

| Campos | Tipo |
|---|---|
| `nombre` (1–60), `autor` (máx. 120), `pie` (máx. 60) | texto; `nombre` pasa a ser el nombre del tema |
| `dk1`, `lt2`, `acento`, `gris`, `antetitulo`, `sep`, `chipRol`, `teal`, `rosa`, `verde`, `arena`, `circulo`, `portadaFondo`, `portadaTexto`, `portadaSub` | color hexadecimal de 6 dígitos, sin `#` |
| `font`, `fontTitulo` | texto 1–60 |
| `logo`, `logoInv`, `foto` (opcional) | data URI `data:image/png;base64,…` o `data:image/jpeg;base64,…`, máx. 2 000 000 caracteres cada una |
| `logoW` | número > 0 y ≤ 6 |
| `logoH` | número > 0 y ≤ 3 |
| `portada` | `mbc` \| `bbva` |
| `cierre` | boolean |

Recuerda el límite de 8 MB por petición si el tema lleva tres imágenes grandes.

### Plantillas de proceso

Un proceso completo del que se parte al crear otro (`POST /api/proyectos/:id/procesos` con `plantillaId`). El objeto `plantilla` **no lleva el contenido**: `id`, `nombre`, `descripcion`, `industria`, `nodos` (elementos del diagrama), `activo`, `autor` (nombre de quien la creó o `null`), `creadoEn`, `actualizadoEn`.

| Método y ruta | Cuerpo | Respuesta | Auditoría |
|---|---|---|---|
| `GET /api/catalogos/plantillas` | — | `{ "plantillas": [ … ] }` por nombre. Un usuario que no es admin solo recibe las activas. | — |
| `POST /api/catalogos/plantillas` | `revisionId` (UUID), `nombre` (1–160), `descripcion` (máx. 600), `industria` (máx. 80; vacía: la del proceso) | 201 `{ "plantilla": {…} }`; 404 si la revisión no existe o es de un proyecto al que no llega; 400 `PROCESO_INVALIDO`; 409 `DUPLICADO` (nombre) | `catalogo.plantilla.alta` con `{ nombre, revisionId }` |
| `PATCH /api/catalogos/plantillas/:id` | al menos uno de `nombre`, `descripcion`, `industria`, `activo` | `{ "plantilla": {…} }`; 404; 409 `DUPLICADO` | `catalogo.plantilla.cambio` con los campos enviados |
| `DELETE /api/catalogos/plantillas/:id` | — | 204; 404. Los procesos creados con ella no cambian. | `catalogo.plantilla.baja` con `{ nombre }` |

**Qué se quita al crearla** (`contenidoDePlantilla` en [catalogos.ts](../../apps/api/src/catalogos.ts)): el cliente (`meta.client`), las personas de la gobernanza de la ficha, el historial de cambios de la ficha, los valores medidos de KPI (`kpiValues`) y los resultados de la simulación. El texto libre (objetivo, notas de las tareas…) no se toca: quien la crea debe revisar que no nombre al cliente.

## Sistema

[rutas/sistema.ts](../../apps/api/src/rutas/sistema.ts). Sin servicios externos: errores y latidos viven en la base.

### `GET /api/sistema`

- **Permiso:** admin.
- **Respuesta 200:**

```json
{
  "version": "a1b2c3d4",
  "api": { "arrancadaEn": "…", "segundosActiva": 3600, "node": "v22.x" },
  "baseDeDatos": { "latenciaMs": 3, "tamanoBytes": 12345678, "migraciones": 9 },
  "worker": { "ultimoLatido": "…", "segundosSinLatido": 12, "vivo": true, "detalle": { "concurrencia": 2, "enCurso": 0, "iaConfigurada": true } },
  "ia": { "configurada": true, "enCola": 0, "ejecutando": 0, "fallidas24h": 0, "completadas24h": 5 },
  "respaldos": { "visible": true, "cantidad": 14, "ultimo": { "archivo": "processiq-….dump", "bytes": 81234, "fecha": "…" },
                 "horasDesdeUltimo": 5.2, "disco": { "libreBytes": 120000000000, "totalBytes": 500000000000 } },
  "errores": { "ultimas24h": 1, "ultimaHora": 0,
               "grupos": [ { "huella": "…", "origen": "web", "mensaje": "…", "veces": 3, "ultima": "…", "ruta": "…", "pila": "…" } ] },
  "avisos": [ { "nivel": "error", "texto": "El worker de IA no da señales desde hace 5 min." } ]
}
```

- `version` sale de `PROCESSIQ_VERSION` (`desarrollo` si no está).
- `respaldos` es `{ "visible": false }` si la API no tiene `CARPETA_RESPALDOS_LECTURA` o no puede leerla. `disco` puede ser `null`.
- `errores.grupos`: los 30 grupos más recientes de los últimos 7 días.
- **Avisos que calcula:**

| Nivel | Cuándo |
|---|---|
| error | El worker nunca dio latido, o lleva más de 120 s sin darlo |
| atención | Hay ejecuciones de IA esperando más de 5 min |
| atención | La API no tiene `ANTHROPIC_API_KEY` |
| error | No hay ninguna copia de seguridad (con la carpeta visible) |
| error | La última copia tiene más de 26 h |
| error | La última copia pesa menos de 10 000 bytes (probablemente vacía) |
| atención | Queda menos del 10 % de disco libre |
| atención | Hubo errores en la última hora |
| atención | La base tardó más de 500 ms en responder |

### `GET /api/sistema/errores/:huella`

- **Permiso:** admin.
- **Respuesta 200:** `{ "repeticiones": [ { "id", "origen", "mensaje", "pila", "ruta", "agente", "detalle", "creadoEn", "usuario" } ] }`: las 20 últimas de esa huella. En los errores de la API, `detalle.referencia` es el `X-Request-Id`.

## Códigos de error

| HTTP | `codigo` | Cuándo sale | Dónde |
|---|---|---|---|
| 400 | *(sin código)* | El cuerpo no es JSON válido | cualquier ruta con cuerpo |
| 400 | `VALIDACION` | El cuerpo no cumple el esquema Zod (`detalles` = lista de `campo: motivo`), o el verbo de la ruta no es válido | cualquier ruta con cuerpo; `PUT /api/catalogos/verbos/:verbo` |
| 400 | `CLAVE_ACTUAL` | La contraseña actual no coincide | `POST /api/sesion/clave` |
| 400 | `CLAVE_DEBIL` | La nueva contraseña incumple una regla o es igual a la actual | `POST /api/sesion/clave` |
| 400 | `PROCESO_INVALIDO` | El contenido no es un proceso válido (`detalles` = errores del esquema) | crear proceso, guardar revisión, análisis de IA |
| 400 | `PADRE_INVALIDO` | `padreId` no es una revisión de este proceso | guardar revisión |
| 400 | `EJECUCION_INVALIDA` | `ejecucionIaId` no es una generación completada de este proceso | guardar revisión |
| 400 | `MODELO` | Modelo no permitido | `POST /api/ia/generaciones` |
| 400 | `PROCESO_VACIO` | El proceso no tiene nodos | `POST /api/ia/analisis` |
| 401 | `SIN_SESION` | Sin cookie, o sesión caducada, desconocida o de una cuenta desactivada | toda ruta no pública |
| 401 | `CREDENCIALES` | Correo o contraseña incorrectos, o cuenta desactivada | `POST /api/sesion` |
| 403 | `ORIGEN` | Escritura con un `Origin` distinto de `ORIGEN_PUBLICO` (o sin él) | toda ruta que no sea GET/HEAD/OPTIONS |
| 403 | `CAMBIAR_CLAVE` | Hay que cambiar la contraseña temporal antes | toda ruta salvo las de sesión y las públicas |
| 403 | `PERMISO` | No eres admin, tu rol de proyecto no tiene la capacidad o (lector de organización) intentas crear un proyecto | rutas de admin, de proyecto y `POST /api/proyectos` |
| 404 | *(sin código)* | No existe, id con formato inválido o proyecto sin acceso | cualquier ruta con id; ruta inexistente |
| 409 | `ARCHIVADO` | El proyecto está archivado | escrituras en proyectos, procesos, revisiones e IA |
| 409 | `DUPLICADO` | Ya existe un usuario con ese correo, un tema con esa clave o una plantilla con ese nombre | `POST /api/usuarios`, `POST /api/catalogos/temas`, `POST` y `PATCH /api/catalogos/plantillas` |
| 409 | `AUTOBLOQUEO` | Un admin intenta quitarse el rol `admin` o desactivarse | `PATCH /api/usuarios/:id` |
| 409 | `ULTIMO_PROPIETARIO` | Quitar al único propietario o bajarlo de rol | `DELETE` y `PUT /api/proyectos/:id/miembros/:usuarioId` |
| 409 | `INMUTABLE` | La revisión ya está aprobada | `POST /api/revisiones/:id/estado` |
| 409 | `TRANSICION` | Cambio de estado no permitido | `POST /api/revisiones/:id/estado` |
| 409 | `CONCURRENCIA` | La revisión cambió de estado mientras tanto | `POST /api/revisiones/:id/estado` |
| 409 | `IA_NO_CONFIGURADA` | La API no tiene `ANTHROPIC_API_KEY` | generaciones y análisis |
| 409 | `PRESUPUESTO` | Se alcanzó el presupuesto mensual de la organización | generaciones y análisis |
| 409 | `LIMITE_USUARIO` | Alcanzaste tu límite mensual | generaciones y análisis |
| 409 | `CLAVE_RESERVADA` | La clave del tema es `mbc` o `bbva` | `POST /api/catalogos/temas` |
| 413 | *(sin código)* | Cuerpo de más de 8 MB | cualquier ruta |
| 429 | `BLOQUEADO` | Más de 10 fallos de acceso en 15 min por correo o IP | `POST /api/sesion` |
| 429 | `LIMITE` | Más de 20 informes de error por minuto e IP | `POST /api/errores` |
| 500 | `INTERNO` | Error inesperado; trae `referencia` (= `X-Request-Id`) | cualquier ruta |
| 0 | `RED` | **Solo en el cliente** ([api.ts](../../apps/web/src/shell/api.ts)): no hubo respuesta del servidor | — |

## Acciones de auditoría

Todas las escrituras relevantes llaman a `registrar()` ([auditoria.ts](../../apps/api/src/auditoria.ts)).

| Acción | Entidad | Detalle | Ruta |
|---|---|---|---|
| `sesion.inicio` | `usuario` | — | `POST /api/sesion` |
| `sesion.fallida` | `usuario` | `{ email }` (sin usuario) | `POST /api/sesion` |
| `sesion.cierre` | `usuario` | — | `DELETE /api/sesion` |
| `usuario.cambio_clave` | `usuario` | — | `POST /api/sesion/clave` |
| `usuario.alta` | `usuario` | `{ email, rol }` | `POST /api/usuarios` |
| `usuario.cambio` | `usuario` | cambios | `PATCH /api/usuarios/:id` |
| `usuario.restablecer_clave` | `usuario` | — | `POST /api/usuarios/:id/restablecer-clave` |
| `proyecto.alta` | `proyecto` | `{ nombre }` | `POST /api/proyectos` |
| `proyecto.cambio` | `proyecto` | cambios | `PATCH /api/proyectos/:id` |
| `proyecto.miembro` | `proyecto` | `{ usuarioId, rol }` | `PUT …/miembros/:usuarioId` |
| `proyecto.baja_miembro` | `proyecto` | `{ usuarioId }` | `DELETE …/miembros/:usuarioId` |
| `proceso.alta` | `proceso` | `{ proyectoId, nombre, conRevision }` (+ `plantillaId` si parte de una plantilla) | `POST /api/proyectos/:id/procesos` |
| `proceso.cambio` | `proceso` | `{ nombre }` | `PATCH /api/procesos/:id` |
| `revision.alta` | `revision` | `{ procesoId, numero, conflicto, ejecucionIaId? }` | `POST /api/procesos/:id/revisiones` |
| `revision.estado` | `revision` | `{ de, a }` | `POST /api/revisiones/:id/estado` |
| `ia.generacion` | `proceso` | `{ ejecucionId, modelo, caracteres, fuentes }` | `POST /api/ia/generaciones` |
| `ia.analisis` | `proceso` | `{ ejecucionId, tipo }` | `POST /api/ia/analisis` |
| `ia.cancelacion` | `proceso` | `{ ejecucionId }` | `POST /api/ia/ejecuciones/:id/cancelar` |
| `catalogo.kpi.alta` | `kpi` | `{ codigo, nombre }` | `POST /api/catalogos/kpis` |
| `catalogo.kpi.cambio` | `kpi` | cambios | `PATCH /api/catalogos/kpis/:id` |
| `catalogo.verbo` | `verbo` (id = el verbo) | `{ tipo }` | `PUT /api/catalogos/verbos/:verbo` |
| `catalogo.verbo.baja` | `verbo` | — | `DELETE /api/catalogos/verbos/:verbo` |
| `catalogo.tema.alta` | `tema_pptx` | `{ clave, nombre }` | `POST /api/catalogos/temas` |
| `catalogo.tema.cambio` | `tema_pptx` | `{ activo, definicion }` | `PATCH /api/catalogos/temas/:id` |
| `catalogo.tema.baja` | `tema_pptx` | `{ clave }` | `DELETE /api/catalogos/temas/:id` |
| `catalogo.plantilla.alta` | `plantilla_proceso` | `{ nombre, revisionId }` | `POST /api/catalogos/plantillas` |
| `catalogo.plantilla.cambio` | `plantilla_proceso` | campos enviados | `PATCH /api/catalogos/plantillas/:id` |
| `catalogo.plantilla.baja` | `plantilla_proceso` | `{ nombre }` | `DELETE /api/catalogos/plantillas/:id` |

No dejan rastro: `POST /api/ia/ejecuciones/:id/descartar`, `POST /api/errores` y los comandos de [cli.ts](../../apps/api/src/cli.ts).

## Intermediario de IA (`/ia`)

No es parte de la API. Es otro servicio ([apps/intermediario/src/index.ts](../../apps/intermediario/src/index.ts)) con el contrato del antiguo Cloudflare Worker del MVP. Lo usa el **editor libre** (`/`, sin proyecto) en el modo «Clave del equipo». Caddy lo publica en `/ia/*` y quita el prefijo.

| Método y ruta pública | Qué hace |
|---|---|
| `GET /ia/health` | `{ ok, servicio: "processiq-intermediario", configurado, formatoClave: "vacia" \| "ok" \| "sospechoso" }`. No pide código. |
| `POST /ia/v1/messages` | Reenvía a Anthropic el cuerpo JSON de la API de Messages y devuelve la respuesta tal cual (SSE incluido). |
| `OPTIONS /ia/*` | Preflight CORS: 204 si el origen está en `ALLOWED_ORIGINS`, 403 si no. |

Reglas de `POST /ia/v1/messages`:

- Cabecera `x-processiq-code` igual a `ACCESS_CODE` (comparación en tiempo constante).
- `Origin` en `ALLOWED_ORIGINS`.
- Cuerpo de 2 MB como máximo.
- `model`: `claude-opus-5`, `claude-sonnet-5` o `claude-haiku-4-5`.
- `max_tokens` se limita a 1–64 000 (1024 si falta).
- `fallbacks` solo se acepta con el valor `"default"`; cualquier otro se elimina.

Los errores tienen otro formato: `{ "type": "error", "error": { "type": "processiq_proxy", "message": "…" } }`.

| HTTP | Cuándo |
|---|---|
| 400 | Cuerpo o JSON inválido, o modelo no permitido |
| 401 | Código de acceso incorrecto |
| 403 | Origen no permitido |
| 413 | Cuerpo de más de 2 MB |
| 500 | Falta `ANTHROPIC_API_KEY` o `ACCESS_CODE` |
| 502 | No se pudo contactar con Anthropic, o Anthropic rechazó la clave central |

Los demás errores de Anthropic se reenvían con su estado original.

## Módulos de iniciativas

Cada iniciativa monta sus rutas bajo `/api/<clave>/` ([docs/equipo/nueva-iniciativa.md](../equipo/nueva-iniciativa.md)). Todas exigen sesión y aplican las convenciones de arriba. El detalle de cada una está en su ficha ([registro](../iniciativas/README.md)).

### Portafolio (`/api/portafolio`)

[modulos/portafolio](../../apps/api/src/modulos/portafolio) · [ficha](../iniciativas/portafolio.md). Solo lectura: no escribe nada ni registra auditoría. Ve los proyectos de la organización en los que el usuario es miembro; el admin, todos. `?archivados=1` incluye los proyectos archivados en las dos rutas.

| Método y ruta | Respuesta |
|---|---|
| `GET /api/portafolio/clientes` | `{ "clientes": [ { cliente, proyectos, procesos, avance, actualizadoEn } ] }`. Agrupa por el texto `cliente` de los proyectos sin distinguir mayúsculas, tildes ni espacios; `cliente: ""` son los proyectos sin cliente (al final). `avance` cuenta los procesos por estado de su última revisión (aprobada, en revisión, borrador, sin revisiones). |
| `GET /api/portafolio/cliente?nombre=…` | `{ cliente, resumen, indicadores, proyectos: [ { id, nombre, archivado, procesos: [ { id, nombre, ultimaRevision, indicadores, contenidoInvalido } ] } ] }`. Los indicadores salen del contenido v1 de la última revisión: actividades por tipo, roles, tipo de ejecución, pains y su puntuación, KPIs y hallazgos del linter del Playbook (con los verbos de la organización). 404 `PORTAFOLIO_CLIENTE_NO_ENCONTRADO` si el usuario no ve ningún proyecto de ese cliente, igual que si no existe. |

## Observaciones y puntos por confirmar

Encontrados al revisar el código para este documento.

**Ya corregidos** (28-sep-2026, ver `CHANGELOG.md`):

- `PATCH /api/catalogos/kpis/:id` con solo `{ activo }` vaciaba macroproceso, unidad, benchmark y descripción (en Zod 4, `partial()` sigue aplicando los `.default`).
- `PUT …/miembros/:usuarioId` podía dejar un proyecto sin propietario: ahora responde 409 `ULTIMO_PROPIETARIO`, igual que el `DELETE`.
- `POST /api/revisiones/:id/estado` respondía `INMUTABLE` o `TRANSICION` antes de comprobar el acceso: ahora, sin acceso, 404.
- El `tipo` de `POST /api/ia/analisis` aceptaba claves del prototipo (`constructor`, `toString`): ahora se valida con `Object.hasOwn`.
- Un `limite` no numérico en `GET /api/auditoria` daba 500: ahora usa el de por defecto.

**Abiertos:**

1. **Auditoría y «Sistema» no filtran por organización.** `GET /api/auditoria`, `GET /api/sistema` y `GET /api/sistema/errores/:huella` leen toda la base. Hoy hay una sola organización; con varias, un admin vería datos de las demás.
2. **Existencia de procesos.** Un proceso de un proyecto sin acceso responde «Proyecto no encontrado.» y uno inexistente, «Proceso no encontrado.». Los dos son 404; el riesgo es bajo porque los ids son UUID.
3. **Modelo por defecto.** La API usa el primero de `MODELOS_IA_PERMITIDOS` en el orden de la variable. `GET /api/ia/estado` los lista en el orden del catálogo, y el editor toma el primero de esa lista. Si la variable no empieza por `claude-opus-5`, los dos pueden no coincidir.
4. **Tipos del cliente.** `api.cambiarProyecto` declara que devuelve un `Proyecto` con `rol`, pero `PATCH /api/proyectos/:id` no devuelve `rol`.
5. **Un `lector` de organización puede escribir en un proyecto** si le dan rol `editor` o `propietario` en él. El rol de organización `lector` solo impide crear proyectos. Por confirmar si es intencional.
