# Variables de entorno y configuración

Qué variables usa cada servicio de ProcessIQ, sus valores por defecto, en qué archivo se ponen en cada entorno y cómo aplicar un cambio.

Actualizado: 28-sep-2026.

Fuentes:

- Plantillas: [.env.example](../../.env.example), [.env.staging.example](../../.env.staging.example) y [.env.dev.example](../../.env.dev.example).
- Compose: [docker-compose.yml](../../docker-compose.yml) y [docker-compose.staging.yml](../../docker-compose.staging.yml).
- Código: [config.ts](../../apps/api/src/config.ts), [worker.ts](../../apps/api/src/worker.ts), [intermediario](../../apps/intermediario/src/index.ts), [Caddyfile](../../infra/Caddyfile), [respaldo.sh](../../infra/respaldo.sh) y [desplegar.sh](../../infra/desplegar.sh).

> Los archivos `.env`, `.env.staging` y `.env.dev` tienen secretos y **nunca se suben al repositorio** (`.gitignore` solo deja pasar los `*.example`). Este documento solo recoge nombres y valores por defecto.

## Contenido

1. [Los tres entornos](#los-tres-entornos)
2. [Cómo aplicar un cambio](#cómo-aplicar-un-cambio)
3. [Referencia de variables](#referencia-de-variables)
4. [Valores de las plantillas](#valores-de-las-plantillas)
5. [Qué se valida al arrancar](#qué-se-valida-al-arrancar)
6. [Recetas](#recetas)
7. [Observaciones y puntos por confirmar](#observaciones-y-puntos-por-confirmar)

## Los tres entornos

| | Desarrollo | Staging | Producción |
|---|---|---|---|
| Dónde corre | Tu PC, con `pnpm` | El servidor, en Docker | El servidor, en Docker |
| Archivo de configuración | `.env.dev` (plantilla `.env.dev.example`) | `.env.staging` (plantilla `.env.staging.example`) | `.env` (plantilla `.env.example`) |
| Quién lee el archivo | `tsx --env-file-if-exists=../../.env.dev` en `pnpm --filter @processiq/api dev`, `worker` y `semilla` | `docker compose --env-file .env.staging` (lo hace `infra/desplegar.sh staging`) | `docker compose` (lee `.env` solo) |
| Proyecto de Compose | — (solo `postgres-dev`, perfil `dev`) | `processiq-staging` | `processiq` |
| Archivos de Compose | `docker-compose.yml` | `docker-compose.yml` + `docker-compose.staging.yml` | `docker-compose.yml` |
| Base de datos | `postgres-dev` en el puerto 5440 del PC | Volumen propio de staging | Volumen de producción |
| Copias de seguridad | No hay | `CARPETA_RESPALDOS=./respaldos-staging` | `./respaldos` (por defecto) |
| HTTPS | No (Vite en `http://localhost:5173`) | Lo termina el Caddy de producción; el de staging escucha HTTP en `:80` | Caddy con Let's Encrypt en el 443 |
| Cómo se despliega | — | `infra/desplegar.sh staging` | `infra/desplegar.sh produccion [version]` |

Cómo encajan los tres:

- **Producción** es el único que publica el puerto 443. Su Caddy también sirve `staging.<dominio>` ([infra/caddy/staging.caddy](../../infra/caddy/staging.caddy)) y lo reenvía al Caddy de staging por la red Docker compartida `processiq-borde`.
- **Staging** usa las mismas imágenes que producción, con volúmenes, base, copias y secretos propios. `docker-compose.staging.yml` quita los puertos publicados y el reenvío a staging.
- **Desarrollo** no usa Docker salvo para Postgres:
  - API en `:8790`, web (Vite) en `:5173` e intermediario en `:8787`.
  - Vite reenvía `/api` a la API y `/ia` al intermediario ([vite.config.js](../../apps/web/vite.config.js)).
  - El proceso completo está en [servidor-local.md](../runbooks/servidor-local.md#desarrollo-en-el-pc).

Con `--env-file .env.staging`, Compose **no** lee `.env`: cada entorno ve solo su archivo.

## Cómo aplicar un cambio

### Producción

1. Edita `.env` en la carpeta del repositorio, en el servidor.
2. Recrea los servicios afectados:

```bash
docker compose up -d                        # recrea lo que haya cambiado
docker compose up -d api worker             # solo API y worker (topes y modelos de IA)
```

`docker compose restart` **no** vuelve a leer `.env`: usa siempre `up -d`. `up -d` solo recrea los contenedores cuya configuración cambió.

| Si cambias… | Ejecuta |
|---|---|
| `DOMINIO`, `TLS_MODO`, `PUERTO_HTTPS`, `PROXIES_CONFIABLES`, `DOMINIO_STAGING` | `docker compose up -d` |
| `ORIGEN_PUBLICO`, `HORAS_SESION` | `docker compose up -d api` |
| `PRESUPUESTO_IA_MENSUAL_USD`, `LIMITE_IA_USUARIO_MENSUAL_USD`, `MODELOS_IA_PERMITIDOS`, `MODELO_IA_ANALISIS` | `docker compose up -d api worker` |
| `IA_CONCURRENCIA` | `docker compose up -d worker` |
| `ANTHROPIC_API_KEY` | `docker compose up -d intermediario api worker` |
| `ACCESS_CODE`, `ALLOWED_ORIGINS` | `docker compose up -d intermediario` |
| `PULSE_URL`, `PULSE_TOKEN` | `docker compose up -d intermediario worker` |
| `RESPALDO_HORA`, `ZONA_HORARIA`, `RESPALDO_CADA_HORAS`, `RESPALDO_CONSERVAR` | `docker compose up -d respaldo` |
| `CARPETA_RESPALDOS` | `docker compose up -d api respaldo` |
| `POSTGRES_PASSWORD` | Primero cámbiala **dentro** de Postgres. Sigue [rotacion-secretos.md](../runbooks/rotacion-secretos.md). |
| `VERSION` | No la edites a mano: usa `infra/desplegar.sh produccion <version>`. |

Después, comprueba la pantalla «Sistema» (`/proyectos/admin/sistema`) o los logs: `docker compose logs -f api`.

### Staging

Edita `.env.staging` y recrea con el mismo comando que usa el script:

```bash
docker compose -p processiq-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml up -d api worker
```

`infra/desplegar.sh staging` también aplica la configuración, pero además **reconstruye** las imágenes con el commit actual y exige que no haya cambios sin confirmar. Úsalo para desplegar código, no para un simple cambio de variable.

### Desarrollo

Edita `.env.dev` y **reinicia** el proceso (`Ctrl+C` y otra vez `pnpm --filter @processiq/api dev` o `worker`). `tsx watch` recarga el código, pero el archivo de entorno solo se lee al arrancar.

## Referencia de variables

Columnas:

- **Por defecto:** el valor que se usa si la variable falta o está vacía. Si Compose y el código tienen defectos distintos, se indican los dos.
- **Obligatoria:** sin ella el servicio no arranca, o la función no sirve.
- **Archivo:** `P` = `.env` (producción), `S` = `.env.staging`, `D` = `.env.dev`. «Interna» = la ponen Compose o el Dockerfile; no va en ningún `.env`.

### Web y dominio (Caddy)

Las lee Compose al cargar el archivo, y el contenedor `web` (Caddy) a través de su `environment`.

| Variable | Usa | Por defecto | Obligatoria | Efecto | Archivo |
|---|---|---|---|---|---|
| `DOMINIO` | Compose → `web`, y por defecto `ORIGEN_PUBLICO`, `ALLOWED_ORIGINS` y `DOMINIO_STAGING` | — | **Sí**: Compose falla con «Falta DOMINIO en .env» | Nombre del sitio en Caddy y del certificado. Necesita un registro DNS A hacia el servidor. | P, S |
| `TLS_MODO` | `web` | `acme` | No | `acme`: certificado de Let's Encrypt con el desafío TLS-ALPN (solo puerto 443; el 80 lo ocupa IIS). `interno`: CA propia de Caddy, para pruebas en localhost. `ninguno`: HTTP simple (staging). | P (`acme`), S (`ninguno`) |
| `PUERTO_HTTPS` | Compose (`ports` de `web`) | `443` | No | Puerto del PC donde se publica el 443 de Caddy. El router debe reenviar el 443 externo a este puerto. En staging no se publica ningún puerto. | P |
| `SITIO_WEB` | Compose → `DOMINIO` de `web` | el valor de `DOMINIO` | No | Sustituye la dirección del sitio en Caddy. Staging usa `:80` (HTTP detrás del Caddy de producción). | S |
| `PROXIES_CONFIABLES` | `web` (`trusted_proxies` de Caddy) | `127.0.0.1/32` | No | De quién se acepta `X-Forwarded-For`. Producción: nadie más que localhost (Caddy pone la IP real). Staging: `private_ranges`, para creer la IP que le pasa el Caddy de producción. | S |
| `DOMINIO_STAGING` | `web` de producción ([staging.caddy](../../infra/caddy/staging.caddy)) | `staging.${DOMINIO}` | No | Dominio que el Caddy de producción reenvía al de staging. No está en ninguna plantilla. | P (opcional) |
| `RED_BORDE` | Compose (nombre de la red) y `infra/desplegar.sh` | `processiq-borde` | No | Red Docker compartida por las dos pilas. Solo se cambia para pruebas aisladas. | Opcional |
| `VERSION` | Compose (etiqueta de las imágenes `processiq/web`, `api` e `intermediario`; argumento de construcción de la API) | `local` | No | Versión desplegada = commit de 8 caracteres. La escribe `infra/desplegar.sh` al final del archivo. Llega a la API como `PROCESSIQ_VERSION`. | P, S (la pone el script) |

### Base de datos y copias de seguridad

| Variable | Usa | Por defecto | Obligatoria | Efecto | Archivo |
|---|---|---|---|---|---|
| `POSTGRES_PASSWORD` | `postgres`, `api` y `worker` (dentro de `DATABASE_URL`), `respaldo` (`PGPASSWORD`) | — | **Sí**: Compose falla con «Falta POSTGRES_PASSWORD en .env» | Contraseña del usuario `processiq`. Larga y aleatoria, distinta en staging. Solo se aplica al **crear** la base: después hay que cambiarla también con `ALTER USER`. | P, S |
| `DATABASE_URL` | API, worker, `cli.ts`, `semilla` | — | **Sí** | Conexión a Postgres (`postgres://usuario:clave@host:puerto/base`). En Docker la arma Compose con `POSTGRES_PASSWORD` y el host `postgres`. | Interna (P, S); D |
| `CARPETA_RESPALDOS` | Compose: `respaldo` (escritura) y `api` (solo lectura, en `/respaldos`) | `./respaldos` | No | Carpeta del servidor donde quedan los `processiq-AAAAMMDD-HHMMSS.dump`. Cópiala además fuera del PC. | P (opcional), S (`./respaldos-staging`) |
| `RESPALDO_HORA` | `respaldo` | `03:00` | No | Hora local (HH:MM) de la copia diaria. Al arrancar, si la última copia tiene más de 24 h, hace una en el acto. **Vacía** (`RESPALDO_HORA=`): vuelve al modo de una copia cada `RESPALDO_CADA_HORAS`. | P, S (`03:30`) |
| `ZONA_HORARIA` | `respaldo` (como `TZ`) | `America/Lima` | No | Zona en la que se interpreta `RESPALDO_HORA`. | P, S (opcional) |
| `RESPALDO_CADA_HORAS` | `respaldo` | `24` | No | Solo con `RESPALDO_HORA` vacía: cada cuántas horas se hace un `pg_dump` desde el arranque. | P, S (opcional) |
| `RESPALDO_CONSERVAR` | `respaldo` | `14` | No | Cuántas copias se conservan; las más antiguas se borran. | P, S (opcional) |
| `RESPALDO_ESPERA_INICIAL_S` | [respaldo.sh](../../infra/respaldo.sh) | `300` | No | Espera antes de la primera copia, para que la API haya creado las tablas. **Compose no la pasa al contenedor**: hoy solo se cambia editando `docker-compose.yml`. | — |
| `CARPETA_RESPALDOS_LECTURA` | API | — (Compose: `/respaldos`) | No | Carpeta que lee «Sistema» para mostrar la última copia y el disco libre. Sin ella, «Sistema» no muestra copias. | Interna |
| `CARPETA_MIGRACIONES` | API, `cli.ts`, `semilla` | `packages/db/migraciones` (imagen: `/app/dist/migraciones`) | No | Dónde están las migraciones SQL. La API las aplica al arrancar; el worker no. | Interna (Dockerfile) |
| `POSTGRES_DB`, `POSTGRES_USER` | Contenedores `postgres` y `postgres-dev` | `processiq` | — | Nombre de la base y del usuario. Fijos en Compose. | Interna |
| `PGHOST`, `PGUSER`, `PGDATABASE`, `PGPASSWORD` | `respaldo` (`pg_dump`) | `postgres`, `processiq`, `processiq`, `POSTGRES_PASSWORD` | — | Conexión de las copias. Fijas en Compose. | Interna |

`postgres-dev` (perfil `dev`) tiene usuario, base y contraseña fijos (`processiq`) y publica el puerto 5440. Solo sirve para desarrollo y pruebas.

### API

| Variable | Usa | Por defecto | Obligatoria | Efecto | Archivo |
|---|---|---|---|---|---|
| `ORIGEN_PUBLICO` | API | Compose: `https://${DOMINIO}`; código: ninguno | **Sí** (el código la exige) | Origen de la web. Toda escritura debe traer `Origin` igual a este valor (si no, 403 `ORIGEN`). Si empieza por `https://`, la cookie lleva `Secure`. Formato `http(s)://host[:puerto]`, sin ruta; se quitan las `/` finales. | S (explícita), D (`http://localhost:5173`); en P sale de `DOMINIO` |
| `HORAS_SESION` | API | `12` | No | Duración fija de una sesión, en horas. | P, S, D (opcional) |
| `PORT` | API | `8080` (Dockerfile y código) | No | Puerto HTTP de la API. En desarrollo, `8790`: es el que espera el proxy de Vite. | Interna; D (`8790`) |
| `PROCESSIQ_VERSION` | API | `desarrollo` | No | Versión que muestra «Sistema». La fija la imagen a partir de `VERSION`. | Interna (Dockerfile) |
| `NODE_ENV` | API, worker, intermediario, `semilla` | `production` en las imágenes | No | En las imágenes vale `production`. `semilla` se niega a correr con `production`. El intermediario no abre el puerto con `test`. | Interna |

### IA en el servidor (API y worker)

La API solo **informa** si hay clave y aplica los topes: no llama a Anthropic. Quien llama es el `worker`. Ver [IA en el servidor](api.md#ia-en-el-servidor).

| Variable | Usa | Por defecto | Obligatoria | Efecto | Archivo |
|---|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | worker (llama a Claude), API (`configurada`), intermediario | vacía | Para usar IA, **sí** | Clave de Anthropic, creada dentro de un workspace con tope de gasto. Sin ella, la API responde 409 `IA_NO_CONFIGURADA` y no encola; el worker avisa en su log. Se recortan los espacios. | P, S; D (solo si quieres IA real: **gasta de verdad**) |
| `PRESUPUESTO_IA_MENSUAL_USD` | API | `100` | No | Tope de gasto de la organización por mes calendario (hora de Lima), en US$ a precio de lista. Al alcanzarlo: 409 `PRESUPUESTO`. | P, S (`10`) |
| `LIMITE_IA_USUARIO_MENSUAL_USD` | API | `25` | No | Tope de gasto de cada persona por mes. Al alcanzarlo: 409 `LIMITE_USUARIO`. | P, S (`5`) |
| `MODELOS_IA_PERMITIDOS` | API | `claude-opus-5,claude-sonnet-5` | No | Modelos que se pueden elegir al generar, separados por comas. El primero es el de por defecto. Solo se admiten modelos con precio conocido: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`. | P (opcional) |
| `MODELO_IA_ANALISIS` | API | `claude-sonnet-5` | No | Modelo de los análisis (pains y tareas del copiloto). Mismas reglas que el anterior. | P (opcional) |
| `IA_CONCURRENCIA` | worker | `2` | No | Ejecuciones de IA a la vez (mínimo 1; se redondea hacia abajo). El worker usa un pool de hasta `IA_CONCURRENCIA + 2` conexiones a la base, más una dedicada a `LISTEN`. | P, S (`1`) |
| `LATIDO_SEGUNDOS` | worker | `30` | No | Cada cuánto da el worker su latido a «Sistema». Mantenla por debajo de 120: con más, «Sistema» avisa de que el worker no da señales. No la pasa Compose. | D (opcional) |
| `ANTHROPIC_BASE_URL` | worker | la de Anthropic | No | Base de la API de Anthropic. **Solo para pruebas** con un servidor falso (lo usa `pruebas/e2e`). No la pasa Compose. | — |
| `PULSE_URL` | worker, intermediario | vacía | No | Endpoint donde se reporta el gasto de cada llamada. Vacía: solo queda en el log (`"evento":"gasto_ia"`). | P (opcional) |
| `PULSE_TOKEN` | worker, intermediario | vacía | No | Credencial para `PULSE_URL`, en `Authorization: Bearer`. | P (opcional) |

### Intermediario de IA (editor libre)

El intermediario sirve al editor libre (`/`) en el modo «Clave del equipo». Caddy lo publica en `/ia/*`. Ver [Intermediario de IA](api.md#intermediario-de-ia-ia).

| Variable | Usa | Por defecto | Obligatoria | Efecto | Archivo |
|---|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | intermediario | vacía | **Sí** | La misma clave que usa el worker. Sin ella (o sin `ACCESS_CODE`), `POST /ia/v1/messages` responde 500. `/ia/health` dice si tiene formato de clave (`ok`, `sospechoso`, `vacia`). | P, S |
| `ACCESS_CODE` | intermediario | vacía | **Sí** | Código del equipo que se pone en los ajustes de IA del editor. Se compara en tiempo constante. Distinto en staging. | P, S |
| `ALLOWED_ORIGINS` | intermediario | Compose: `https://${DOMINIO}`; código: ninguno (rechaza todo) | No en Docker | Orígenes permitidos, separados por comas. Solo hace falta si publicas en un puerto distinto de 443 (p. ej. `https://localhost:8443`). | P (opcional), S (explícita) |
| `PULSE_URL`, `PULSE_TOKEN` | intermediario | vacías | No | Igual que en el worker. | P (opcional) |
| `PORT` | intermediario | `8787` | No | Puerto HTTP del intermediario. | Interna (Dockerfile) |

### Pruebas y CI

No van en ningún `.env`: se exportan en la terminal o en la CI.

| Variable | Usa | Por defecto | Efecto |
|---|---|---|---|
| `TEST_DATABASE_URL` | Pruebas de integración de la API ([pruebas/entorno.ts](../../apps/api/src/pruebas/entorno.ts)) | `postgres://processiq:processiq@localhost:5440/processiq_pruebas` | Base que las pruebas vacían y recrean. |
| `E2E_DATABASE_URL` | Pruebas E2E (`pruebas/e2e`) | `postgres://processiq:processiq@localhost:5440/processiq_e2e` | Base de las pruebas de punta a punta. |
| `CI` | Configuración de Playwright de la fidelidad | — | En la CI: 2 workers y no reutiliza servidores ya arrancados. |
| `GUARDAR_TODO` | `pruebas/fidelidad/src/comparar.mjs` | — | Guarda todos los artefactos, no solo los que difieren. |

## Valores de las plantillas

Lo que traen los `*.example` (las celdas «vacía» hay que completarlas). Lo que no aparece toma el valor por defecto de la sección anterior.

| Variable | `.env.example` (producción) | `.env.staging.example` | `.env.dev.example` |
|---|---|---|---|
| `DOMINIO` | `mbc.asissoft.com` | `staging.mbc.asissoft.com` | — |
| `ORIGEN_PUBLICO` | — (sale de `DOMINIO`) | `https://staging.mbc.asissoft.com` | `http://localhost:5173` |
| `ALLOWED_ORIGINS` | comentada | `https://staging.mbc.asissoft.com` | — |
| `SITIO_WEB` | — | `:80` | — |
| `TLS_MODO` | `acme` | `ninguno` | — |
| `PROXIES_CONFIABLES` | — | `private_ranges` | — |
| `PUERTO_HTTPS` | `443` | — | — |
| `POSTGRES_PASSWORD` | vacía | vacía (distinta de producción) | — |
| `DATABASE_URL` | — (la arma Compose) | — (la arma Compose) | `postgres://processiq:processiq@localhost:5440/processiq` |
| `PORT` | — | — | `8790` |
| `HORAS_SESION` | `12` | `12` | — |
| `ANTHROPIC_API_KEY` | vacía | vacía | — |
| `ACCESS_CODE` | vacía | vacía | — |
| `PULSE_URL`, `PULSE_TOKEN` | vacías | — | — |
| `PRESUPUESTO_IA_MENSUAL_USD` | `100` | `10` | — |
| `LIMITE_IA_USUARIO_MENSUAL_USD` | `25` | `5` | — |
| `MODELOS_IA_PERMITIDOS` | `claude-opus-5,claude-sonnet-5` | — | — |
| `MODELO_IA_ANALISIS` | `claude-sonnet-5` | — | — |
| `IA_CONCURRENCIA` | `2` | `1` | — |
| `CARPETA_RESPALDOS` | — (`./respaldos`) | `./respaldos-staging` | — |
| `RESPALDO_HORA` | `03:00` | `03:30` | — |
| `ZONA_HORARIA` | `America/Lima` | — | — |

`infra/desplegar.sh` añade `VERSION=<commit>` al final de `.env` y `.env.staging` la primera vez, y la actualiza en cada despliegue.

## Qué se valida al arrancar

| Servicio | Comprueba | Si falla |
|---|---|---|
| Compose (cualquier comando) | `DOMINIO` y `POSTGRES_PASSWORD` presentes | No hace nada: «Falta DOMINIO en .env» o «Falta POSTGRES_PASSWORD en .env» |
| API (`leerConfig`) | `DATABASE_URL` presente; `ORIGEN_PUBLICO` con forma de origen; `PRESUPUESTO_IA_MENSUAL_USD` y `LIMITE_IA_USUARIO_MENSUAL_USD` numéricos y ≥ 0; cada modelo de `MODELOS_IA_PERMITIDOS` y `MODELO_IA_ANALISIS`, conocido | El proceso termina con el motivo («Falta DATABASE_URL», «ORIGEN_PUBLICO debe ser un origen…», «MODELOS_IA_PERMITIDOS: modelo desconocido…»). Docker lo reinicia en bucle: mira `docker compose logs api`. |
| API (arranque) | Aplica las migraciones y asegura la organización y los catálogos | No arranca; el healthcheck (`/api/salud`) no se pone sano y el worker no arranca |
| Worker (`leerConfigWorker`) | `DATABASE_URL` presente; `IA_CONCURRENCIA` numérico y ≥ 0 | El proceso termina. Sin `ANTHROPIC_API_KEY` arranca, pero lo avisa en el log. |
| Intermediario | Nada | Arranca siempre. Sin clave o código, responde 500 a las llamadas; revisa `GET /ia/health`. |
| `semilla` | `DATABASE_URL` apunta a `localhost`, `127.0.0.1` o `[::1]` y `NODE_ENV` no es `production` | Se niega a correr: las cuentas de prueba tienen una contraseña conocida |

## Recetas

**Subir el tope de IA de la organización (producción).** Cambia `PRESUPUESTO_IA_MENSUAL_USD` en `.env` y ejecuta `docker compose up -d api worker`. El nuevo tope se ve en `GET /api/ia/estado` y en la pantalla de consumo. El tope de gasto de la consola de Anthropic sigue siendo la última red.

**Cambiar de dominio.**

1. Edita `DOMINIO` en `.env`.
2. Crea el registro DNS A.
3. Ejecuta `docker compose up -d`.

Caddy pide el certificado solo. `ORIGEN_PUBLICO` y `ALLOWED_ORIGINS` siguen al dominio si no las fijaste a mano.

**Rotar secretos.** `ANTHROPIC_API_KEY`, `ACCESS_CODE` y `POSTGRES_PASSWORD`: sigue [rotacion-secretos.md](../runbooks/rotacion-secretos.md).

**Activar la IA del servidor en desarrollo.**

1. Añade `ANTHROPIC_API_KEY` a `.env.dev`.
2. Reinicia `pnpm --filter @processiq/api dev`, para que la API la vea como configurada.
3. Arranca `pnpm --filter @processiq/api worker`.

Cada ejecución **gasta de verdad**. Para probar sin gasto están las pruebas con Anthropic falso (`apps/api/src/ia.test.ts`, `pruebas/e2e`).

**Probar la pila completa en local sin tocar producción.** Otro proyecto de Compose, con su propia red y su propia carpeta de copias ([servidor-local.md](../runbooks/servidor-local.md)):

```bash
VERSION=prueba DOMINIO=localhost TLS_MODO=interno PUERTO_HTTPS=8443 \
ORIGEN_PUBLICO=https://localhost:8443 ALLOWED_ORIGINS=https://localhost:8443 \
POSTGRES_PASSWORD=solo-para-probar CARPETA_RESPALDOS=./respaldos-prueba RED_BORDE=processiq-prueba-borde \
docker compose -p processiq-prueba up -d --build
# quitarlo: docker compose -p processiq-prueba down -v
```

`ORIGEN_PUBLICO` hace falta porque el puerto no es 443 (ver la observación 2). `POSTGRES_PASSWORD` sale del `.env` de la carpeta, salvo que la pases también en la línea.

## Observaciones y puntos por confirmar

Encontrados al revisar el código para este documento. No están corregidos.

1. **El intermediario de desarrollo lee `.env`, no `.env.dev`.** Su script `dev` usa `--env-file-if-exists=../../.env`.
   - Si el PC de desarrollo es el servidor, toma los secretos de producción.
   - En ese archivo `ALLOWED_ORIGINS` suele estar vacía, y el código, sin Compose, no tiene valor por defecto. Por confirmar: las llamadas desde Vite (`Origin: http://localhost:5173`) se rechazarían con 403, salvo que añadas ese origen.
2. **Puerto distinto de 443.** `ORIGEN_PUBLICO` vale por defecto `https://${DOMINIO}`, sin puerto. Si publicas en otro puerto (`PUERTO_HTTPS=8443`), el navegador envía `Origin: https://localhost:8443` y todas las escrituras (incluido entrar) dan 403 `ORIGEN`.
   - `.env.example` solo menciona `ALLOWED_ORIGINS` para ese caso.
   - La receta de `servidor-local.md` («Probar en local sin tocar producción») no fija `ORIGEN_PUBLICO`.
3. **`HORAS_SESION` y `PORT` no se validan** (usan `Number(...)`, no el validador de los topes). En Docker no importa, porque Compose pone `12` si está vacía. En `.env.dev`, `HORAS_SESION=` vacía da 0 (sesiones que caducan al instante), y un texto da `NaN` (por confirmar: probablemente un 500 al entrar).
4. **`RESPALDO_ESPERA_INICIAL_S`** existe en `respaldo.sh`, pero `docker-compose.yml` no la pasa al contenedor.
5. **`RED_BORDE`**: Compose la toma del `.env`, pero `infra/desplegar.sh` solo de la terminal. Si la cambias solo en `.env`, el script comprobaría otra red.
6. **Compose exige `DOMINIO` y `POSTGRES_PASSWORD` al cargar el archivo**, aunque solo arranques `postgres-dev`. La CI las pone para `docker compose build`. Por confirmar: en un PC sin `.env`, `docker compose --profile dev up -d postgres-dev` fallaría. Solución: pasarlas en la línea o crear un `.env` con valores de prueba.
7. **`DOMINIO_STAGING`, `RED_BORDE`, `LATIDO_SEGUNDOS` y `ANTHROPIC_BASE_URL`** no están en ninguna plantilla. Las dos últimas tampoco las pasa Compose. Está bien para las de prueba, pero conviene saberlo.
