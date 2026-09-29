# Entorno de desarrollo

Cómo montar ProcessIQ en tu PC, levantar cada pieza, trabajar a diario, añadir migraciones y dependencias, probar las imágenes Docker y resolver los problemas más frecuentes.

Actualizado: 28-sep-2026.

Si trabajas en una iniciativa, lee antes [docs/equipo/README.md](../equipo/README.md). Las pruebas están explicadas en [pruebas.md](pruebas.md).

## Contenido

1. [Requisitos](#1-requisitos)
2. [Primera instalación](#2-primera-instalación)
3. [Levantar el entorno](#3-levantar-el-entorno)
4. [Semilla y cuentas de prueba](#4-semilla-y-cuentas-de-prueba)
5. [Flujo diario](#5-flujo-diario)
6. [Añadir una migración](#6-añadir-una-migración)
7. [Añadir una dependencia](#7-añadir-una-dependencia)
8. [Construir y probar las imágenes Docker en local](#8-construir-y-probar-las-imágenes-docker-en-local)
9. [Problemas frecuentes](#9-problemas-frecuentes)

## 1. Requisitos

| Herramienta | Versión | Por qué |
|---|---|---|
| Node | 22 o superior (`engines` en [package.json](../../package.json)) | La CI y las imágenes usan Node 22 |
| pnpm | 10 (fijado en `packageManager`: `pnpm@10.33.0`) | Con `corepack enable`, se usa esa versión exacta |
| Docker Desktop | Actual | Postgres de desarrollo y pruebas de las imágenes |
| Git | Actual. En Windows, con Git Bash | `infra/desplegar.sh` y los ejemplos de este documento son de bash |
| Chromium de Playwright | El de `@playwright/test` 1.63.0 | Fidelidad y E2E |
| Internet | — | Instalar dependencias; la fidelidad carga el MVP de referencia desde jsDelivr y la fuente de Google Fonts |

### Mapa de puertos

| Puerto | Qué | Cuándo |
|---|---|---|
| 5173 | Web (Vite): editor en `/`, plataforma en `/proyectos/` | `pnpm dev` |
| 8790 | API de desarrollo (`PORT` de `.env.dev`) | `pnpm --filter @processiq/api dev` |
| 8787 | Intermediario de IA | `pnpm --filter @processiq/intermediario dev` |
| 5440 | Postgres de desarrollo y pruebas, solo en `127.0.0.1` (el 5432 lo suele ocupar un Postgres nativo) | `docker compose -f docker-compose.dev.yml up -d` |
| 4173 | Vista previa del build | `pnpm --filter @processiq/web preview` |
| 4401, 4402 | Servidores de la fidelidad (MVP y app nueva) | `pnpm fidelidad` |
| 4480, 8792, 8793 | Web, API y Anthropic falso de la E2E | `pnpm e2e` |
| 8443 | Pila Docker de prueba (sugerido) | [§8](#8-construir-y-probar-las-imágenes-docker-en-local) |

El worker de IA no abre ningún puerto.

El Postgres de desarrollo tiene tres bases:

| Base | La usa | Se borra |
|---|---|---|
| `processiq` | La API de desarrollo y la semilla | Solo con `semilla --desde-cero` |
| `processiq_pruebas` | Pruebas de integración de la API | **En cada ejecución de las pruebas** |
| `processiq_e2e` | Pruebas E2E | Antes de cada prueba E2E |

## 2. Primera instalación

```bash
git clone <url del repositorio> processiq && cd processiq
git config user.email "<id>+<usuario>@users.noreply.github.com"   # el repositorio es público (ADR 18)
corepack enable                      # usa el pnpm de packageManager
pnpm install
cp .env.dev.example .env.dev         # configuración de la API de desarrollo
```

Levanta el Postgres de desarrollo. Está en su propio archivo de Compose, que no necesita `.env`:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Sus credenciales son fijas de desarrollo (`processiq`) y están en el propio `docker-compose.dev.yml` y en `.env.dev.example`. Por eso solo escucha en `127.0.0.1`.

Instala el navegador de las pruebas (una vez; sirve para fidelidad y E2E):

```bash
pnpm --filter @processiq/pruebas-fidelidad exec playwright install chromium
```

Comprueba que todo está bien:

```bash
pnpm fronteras && pnpm typecheck && pnpm test
```

## 3. Levantar el entorno

No hace falta levantarlo todo. Según lo que toques:

| Quieres probar | Necesitas |
|---|---|
| El editor libre (`/`) sin IA | Web |
| El editor libre con IA «Clave del equipo» | Web + intermediario |
| La plataforma (`/proyectos/`) y el editor en modo proyecto | Web + API + Postgres de desarrollo |
| La IA del servidor en los procesos de proyectos | Web + API + worker + Postgres de desarrollo |

Cada comando va en su propia terminal, desde la raíz.

### 3.1 Postgres de desarrollo

```bash
docker compose -f docker-compose.dev.yml up -d    # no necesita .env
docker compose -f docker-compose.dev.yml ps       # debe salir «healthy»
```

Postgres 17 en `127.0.0.1:5440`, con los datos en el volumen `processiq_postgres_dev` (proyecto de Compose `processiq-dev`, contenedor `processiq-postgres-dev-1`). No se usa en producción. Para pararlo, `docker compose -f docker-compose.dev.yml down`, **sin `-v`**: borraría los datos.

Si lo levantaste antes con `docker compose --profile dev up -d postgres-dev` (el que publicaba el 5440 en todas las interfaces), cámbialo una vez: [servidor-local.md](../runbooks/servidor-local.md#desarrollo-en-el-pc).

### 3.2 API

```bash
pnpm --filter @processiq/api dev
```

- `tsx watch` sobre `src/servidor.ts`: se reinicia al guardar.
- Lee `.env.dev` y **aplica las migraciones al arrancar**.
- Escucha en el 8790. Vite le reenvía `/api`.

Variables de `.env.dev`:

| Variable | Valor de la plantilla | Para qué |
|---|---|---|
| `DATABASE_URL` | Base `processiq` en el 5440 | Obligatoria |
| `ORIGEN_PUBLICO` | `http://localhost:5173` | Obligatoria. La API exige este `Origin` en toda escritura: abre la web **exactamente** en esa dirección |
| `PORT` | `8790` | Tiene que coincidir con el `proxy` de [vite.config.js](../../apps/web/vite.config.js) |
| `HORAS_SESION` | (12 por defecto) | Opcional |
| `ANTHROPIC_API_KEY` | (vacía) | Opcional. Sin ella, la IA del servidor responde `409 IA_NO_CONFIGURADA` |
| `PRESUPUESTO_IA_MENSUAL_USD`, `LIMITE_IA_USUARIO_MENSUAL_USD`, `MODELOS_IA_PERMITIDOS`, `MODELO_IA_ANALISIS` | (valores por defecto de [config.ts](../../apps/api/src/config.ts)) | Opcionales |

### 3.3 Worker de IA

```bash
pnpm --filter @processiq/api worker
```

- Ejecuta la cola `ejecuciones_ia`. Sin él, las ejecuciones se quedan «en cola».
- Lee `.env.dev`. Necesita `ANTHROPIC_API_KEY` ahí, y con una clave real **gasta de verdad**. Usa una clave de desarrollo con tope de gasto bajo.
- No aplica migraciones: arranca después de la API.

Sin gastar: las pruebas E2E ya cubren estos flujos con un Anthropic falso ([pruebas.md §9](pruebas.md#9-e2e-de-la-plataforma)). **Por confirmar (no probado):** para usarlo a mano, pon cualquier valor en `ANTHROPIC_API_KEY` de `.env.dev` (para que la API considere la IA configurada), no arranques este worker y ejecuta `E2E_DATABASE_URL=<DATABASE_URL de .env.dev> node pruebas/e2e/src/anthropic-falso.mjs`. Ese script levanta el Anthropic falso y un worker contra esa base.

### 3.4 Intermediario de IA

```bash
pnpm --filter @processiq/intermediario dev
```

- Solo lo usa el **editor libre** en el modo «Clave del equipo». El editor en modo proyecto usa la IA del servidor.
- Lee `.env.dev`, como la API. Solo si no existe, lee el `.env` de la raíz y avisa (en el servidor, ese es el de producción). Descomenta en `.env.dev` estas variables:

| Variable | Valor en desarrollo |
|---|---|
| `ANTHROPIC_API_KEY` | Tu clave de desarrollo |
| `ACCESS_CODE` | Cualquier código; el mismo que pongas en «Ajustes de IA» del editor |
| `ALLOWED_ORIGINS` | `http://localhost:5173`. Sin él, toda llamada responde 403 |

- Escucha en el 8787. Vite le reenvía `/ia/*` quitando el prefijo `/ia`. El `PORT` de `.env.dev` es el de la API y el intermediario no lo usa.
- `ANTHROPIC_API_KEY` en `.env.dev` también la ven la API y el worker de desarrollo: la IA del servidor queda configurada y gasta de verdad.

### 3.5 Web

```bash
pnpm dev
```

- Copia las librerías del navegador a `apps/web/public/vendor/` ([copiar-vendor.mjs](../../apps/web/scripts/copiar-vendor.mjs)) y arranca Vite en el 5173.
- Editor en `http://localhost:5173/`; plataforma en `http://localhost:5173/proyectos/`.
- Vite reenvía ([vite.config.js](../../apps/web/vite.config.js)):

| Ruta | Destino | Detalle |
|---|---|---|
| `/api/*` | `http://localhost:8790` | Sin `changeOrigin`: la API valida el `Origin` de la web |
| `/ia/*` | `http://localhost:8787` | Quita el prefijo `/ia` |
| `/proyectos/...` sin extensión | `proyectos/index.html` | Rutas del lado del cliente del shell (en el servidor lo hace Caddy) |

- Usa siempre `pnpm dev`, no `vite` a secas: sin la copia de `/vendor/` fallan el PPTX y la lectura de Word y PDF.

## 4. Semilla y cuentas de prueba

Con el Postgres de desarrollo en marcha:

```bash
pnpm --filter @processiq/api semilla               # cuentas y proyectos de prueba (repetible)
pnpm --filter @processiq/api semilla --desde-cero  # además vacía la base antes (y la crea si no existe)
```

- Lee `DATABASE_URL` de `.env.dev` y aplica las migraciones. No necesita la API arrancada.
- Se niega a correr si la base no está en `localhost` o si `NODE_ENV` es `production` ([seguridad.md §13](seguridad.md#13-semilla-de-desarrollo)).
- Repetirla restablece las cuentas (contraseña, rol y estado), cierra sus sesiones y rehace los proyectos de prueba.

Todas las cuentas usan la contraseña `Prueba-ProcessIQ-2026` ([semilla.ts](../../apps/api/src/semilla.ts)):

| Correo | Rol en la organización | Rol en el proyecto de prueba | Para probar |
|---|---|---|---|
| `admin@processiq.test` | admin | (todos, como propietario) | Usuarios, auditoría, «Sistema», consumo de IA, catálogos |
| `propietario@processiq.test` | consultor | propietario | Crear proyectos y gestionar miembros |
| `editor@processiq.test` | consultor | editor | Guardar revisiones y enviarlas a revisión |
| `revisor@processiq.test` | consultor | revisor | Aprobar o devolver revisiones |
| `lector@processiq.test` | lector | lector | Solo lectura; no puede crear proyectos |
| `externo@processiq.test` | consultor | — | Sin acceso al proyecto de prueba (404) |
| `nuevo@processiq.test` | consultor | — | Cambio obligatorio de contraseña al entrar |
| `inactivo@processiq.test` | consultor | — | Cuenta desactivada: no puede entrar |

Datos que crea:

- Proyecto «Siniestros — Seguros Andinos (prueba)», de un cliente ficticio:
  - «Gestión de siniestros»: v1 aprobada, v2 en revisión y v3 en borrador;
  - «Venta de lotes urbanos»: v1 en borrador;
  - «Proceso sin revisiones».
- «Proyecto archivado (prueba)»: archivado, solo lectura.

Los proyectos se crean a través de la propia API, con las mismas validaciones y la misma auditoría que en uso real.

## 5. Flujo diario

| Momento | Qué hacer |
|---|---|
| Al empezar | Traer `main` (`git fetch origin && git merge origin/main`). Si trajo migraciones, reinicia la API: las aplica al arrancar |
| Mientras programas | `pnpm --filter <paquete> exec vitest` en modo vigilancia; la web y la API se recargan solas |
| Antes de pedir revisión | Los comandos siguientes en verde, y capturas de las pantallas nuevas o cambiadas |

```bash
pnpm fronteras        # dependencias permitidas entre paquetes
pnpm typecheck        # tipos de todos los paquetes
pnpm test             # unitarias + integración de la API (necesita el Postgres de desarrollo)
pnpm e2e              # plataforma de punta a punta (~1 min; necesita el Postgres de desarrollo)
pnpm fidelidad        # si tocaste apps/web/src/app/ o packages/ (~2,5 min)
```

- Una sola prueba, depuración y artefactos: [pruebas.md](pruebas.md).
- Una pantalla nueva o cambiada se revisa con una captura (`page.screenshot`): las pruebas verdes no ven el diseño.
- La plantilla del PR ([pull_request_template.md](../../.github/pull_request_template.md)) repite esta lista. Nada de datos de clientes ni secretos, tampoco en capturas.
- Varias copias del repositorio a la vez (varias sesiones de Claude): lee la tabla de recursos compartidos de [trabajar-con-claude.md](../equipo/trabajar-con-claude.md).

## 6. Añadir una migración

Todas las tablas están en [packages/db/src/esquema.ts](../../packages/db/src/esquema.ts) y las migraciones en [packages/db/migraciones/](../../packages/db/migraciones). Las reglas completas están en [convenciones.md](../equipo/convenciones.md#migraciones-de-la-base).

1. **Trae `main` antes de generar.** La migración se genera al final del PR.
2. Cambia `esquema.ts`. Una iniciativa escribe su sección al final, con su prefijo; las columnas nuevas en tablas del núcleo son un PR de plataforma.
3. Genera la migración (no necesita base de datos: compara con el último *snapshot*):

   ```bash
   pnpm --filter @processiq/db generar --name <nombre_con_guiones_bajos>
   ```

   Crea `migraciones/NNNN_<nombre>.sql`, `migraciones/meta/NNNN_snapshot.json` y actualiza `meta/_journal.json`.
4. **Revisa el SQL.** Debe ser compatible con la versión anterior: se añaden tablas y columnas; borrar o renombrar va en un despliegue posterior. Así se puede revertir con `infra/desplegar.sh produccion <anterior>`.
5. Aplícala: reinicia la API de desarrollo (migra al arrancar). Las pruebas de la API la aplican solas desde una base vacía.
6. Añade o ajusta las pruebas de integración. `vaciar()` vacía en cascada las tablas que dependen de proyectos u organizaciones.
7. Confirma los tres archivos junto con el cambio de `esquema.ts`.

Reglas:

- **Nunca edites una migración ya fusionada en `main`.**
- **Si `main` recibe otra migración antes de fusionar, regenera la tuya.** Drizzle salta **sin avisar** una migración cuya marca de tiempo sea anterior a la última aplicada. Las pruebas no lo detectan porque parten de una base vacía. El procedimiento con `git merge` está en [convenciones.md](../equipo/convenciones.md#migraciones-de-la-base).

## 7. Añadir una dependencia

Reglas ([convenciones.md](../equipo/convenciones.md#dependencias)):

- Un solo lockfile y una sola versión de cada librería en todo el monorepo.
- Toda dependencia nueva se justifica en el PR. Si es grande o de uso general, necesita ADR y revisión de plataforma.
- Nada se carga desde un CDN: se instala por npm.
- Nada de servicios nuevos en la nube.
- `pnpm audit --prod --audit-level=high` debe seguir en verde ([ADR 17](../adr/0017-excepciones-auditoria-dependencias.md)).

Pasos:

1. Añádela al paquete que la usa:

   ```bash
   pnpm --filter @processiq/<paquete> add <libreria>        # de ejecución
   pnpm --filter @processiq/<paquete> add -D <libreria>     # de desarrollo
   ```

   - Una dependencia entre paquetes del monorepo se declara con `"workspace:*"` en el `package.json`, seguido de `pnpm install`.
   - En `packages/*`, solo se admite `@processiq/dominio` como dependencia interna. Cambiar eso es tocar [fronteras.mjs](../../herramientas/fronteras.mjs): PR de plataforma.
2. Si es una librería del navegador que se sirve como archivo aparte (como pptxgenjs o pdf.js), fíjala con versión exacta (`add -E`) y añádela a [copiar-vendor.mjs](../../apps/web/scripts/copiar-vendor.mjs). Cambiar la versión de una que ya usa el editor exige pasar la fidelidad completa.
3. Si la usa la API o el worker, esbuild la mete en el bundle ([construir.mjs](../../apps/api/scripts/construir.mjs)). Una librería con binarios nativos puede necesitar marcarse como `external`, como `pg-native`: comprueba que la imagen arranca ([§8](#8-construir-y-probar-las-imágenes-docker-en-local)).
4. Pasa `pnpm audit --prod --audit-level=high`, `pnpm fronteras`, `pnpm typecheck`, `pnpm test` y, si afecta a la web, `pnpm fidelidad`.
5. Confirma `package.json` **y** `pnpm-lock.yaml`. La CI y las imágenes instalan con `--frozen-lockfile`.

## 8. Construir y probar las imágenes Docker en local

Hay tres imágenes ([infra/](../../infra)): `web` (build de Vite servido por Caddy), `api` (bundle de esbuild; también la usa el `worker`) e `intermediario`.

### Solo construir (como la CI)

```bash
VERSION=prueba DOMINIO=ci.invalid POSTGRES_PASSWORD=solo-para-construir docker compose build
```

- Las imágenes instalan con `pnpm fetch` y `pnpm install --offline --frozen-lockfile`: un lockfile desactualizado rompe el build.
- `.dockerignore` deja fuera `node_modules`, `dist`, los `.env` y los resultados de pruebas.

> **Pon siempre `VERSION`.** Las imágenes se etiquetan `processiq/<imagen>:${VERSION}`. En un PC donde exista el `.env` del servidor, `VERSION` vale la versión desplegada en producción: construir sin cambiarla **sobrescribe las imágenes de producción** con tu copia de trabajo, y el siguiente `docker compose up` las usaría.

### Levantar la pila completa aislada

Otro proyecto de Compose (`-p processiq-prueba`), con volúmenes, red y copias propios, en `https://localhost:8443`:

```bash
VERSION=prueba DOMINIO=localhost TLS_MODO=interno PUERTO_HTTPS=8443 \
ORIGEN_PUBLICO=https://localhost:8443 ALLOWED_ORIGINS=https://localhost:8443 \
POSTGRES_PASSWORD=solo-para-probar CARPETA_RESPALDOS=./respaldos-prueba RED_BORDE=processiq-prueba-borde \
docker compose -p processiq-prueba up -d --build
```

- `TLS_MODO=interno`: certificado de la CA interna de Caddy. El navegador avisará; acéptalo.
- `ORIGEN_PUBLICO` tiene que ser la dirección exacta con la que abres la web, puerto incluido. Si no, «Entrar» responde `403 Origen no permitido`.
- Primer administrador (la semilla no existe dentro de la imagen):

  ```bash
  docker compose -p processiq-prueba exec api node dist/cli.js crear-usuario --email admin@processiq.test --nombre "Admin de prueba" --rol admin
  ```

- Estado: `docker compose -p processiq-prueba ps`. Logs: `docker compose -p processiq-prueba logs -f api`.
- Quitarlo todo, volúmenes incluidos (**solo con `-p processiq-prueba`**; en producción `down -v` borraría la base y los certificados):

  ```bash
  docker compose -p processiq-prueba down -v
  docker image rm processiq/web:prueba processiq/api:prueba processiq/intermediario:prueba
  ```

Tras editar `docker-compose.yml`, valida el archivo con `docker compose config --quiet` y revisa las líneas tocadas ([lección 22c](../lecciones-aprendidas.md)).

Staging y producción no se levantan así: se despliegan con `infra/desplegar.sh`, y eso solo lo hace el responsable de operación ([despliegue.md](../runbooks/despliegue.md)).

## 9. Problemas frecuentes

### Entorno y servicios

| Síntoma | Causa | Solución |
|---|---|---|
| `required variable DOMINIO is missing a value` al levantar el Postgres de desarrollo | Usaste `docker-compose.yml` (el del servidor) | `docker compose -f docker-compose.dev.yml up -d` |
| `Conflict. The container name "/processiq-postgres-dev-1" is already in use` | Sigue el contenedor viejo (perfil `dev` de `docker-compose.yml`) | Cámbialo una vez: [servidor-local.md](../runbooks/servidor-local.md#desarrollo-en-el-pc) |
| El puerto 5432 está ocupado | Un Postgres nativo en el PC | El de desarrollo va en el 5440; no lo cambies |
| `403 Origen no permitido` al entrar o guardar | Abriste la web con otra dirección (otra forma de escribir `localhost`, otro puerto) | Ábrela exactamente en el `ORIGEN_PUBLICO` de `.env.dev` (`http://localhost:5173`) |
| `/api` responde 502 o no conecta desde Vite | La API no está arrancada, o su `PORT` no es 8790 | Arranca la API; revisa `.env.dev` |
| `429` «Demasiados intentos fallidos» | 10 fallos de acceso en 15 minutos | Espera, o reinicia la API: el contador vive en memoria |
| La IA del servidor responde `409 IA_NO_CONFIGURADA` | Falta `ANTHROPIC_API_KEY` en `.env.dev` | Añádela y reinicia la API |
| Una ejecución de IA se queda «en cola» | El worker no está arrancado | `pnpm --filter @processiq/api worker` |
| IA del editor libre: `403 Origen no permitido` | `ALLOWED_ORIGINS` de `.env.dev` no incluye `http://localhost:5173` | Añádelo y reinicia el intermediario |
| IA del editor libre: `401 Codigo de acceso incorrecto` o `500 … secretos` | El código de «Ajustes de IA» no coincide con `ACCESS_CODE`, o falta la clave o el código | Revisa `.env.dev` |
| La semilla se niega a correr | `DATABASE_URL` no apunta a `localhost` | Es a propósito: solo corre contra el Postgres de desarrollo |
| PPTX, Word o PDF fallan en desarrollo | Arrancaste `vite` a mano y no existe `apps/web/public/vendor/` | Usa `pnpm dev` |
| Una migración nueva se aplicó en local pero staging no la ve | Su marca de tiempo es anterior a otra ya aplicada | Regenérala después de traer `main` ([§6](#6-añadir-una-migración)) |

### Pruebas

| Síntoma | Causa | Solución |
|---|---|---|
| `pnpm test` falla con `ECONNREFUSED` | El Postgres de desarrollo está apagado | `docker compose -f docker-compose.dev.yml up -d` |
| Pruebas de la API que fallan al azar con dos copias abiertas | Las dos usan y borran `processiq_pruebas` | `TEST_DATABASE_URL` distinto en cada copia ([pruebas.md §7](pruebas.md#7-integración-de-la-api)) |
| `pnpm e2e` no arranca | Puerto 4480, 8792 u 8793 ocupado, o el Postgres de desarrollo apagado | Cierra la otra corrida; levanta Postgres |
| La fidelidad pasa con código que debería fallar | Probaste un `dist` viejo o un servidor viejo en 4401/4402 | Usa `pnpm fidelidad`; cierra los servidores de otras copias |
| La fidelidad falla por décimas de píxel solo a veces | Fuentes o tiempos, no el código | `--repeat-each 5` sobre ese caso antes de tocar nada |
| Typecheck en verde y build en rojo | Dependencia sin declarar o import que solo resuelve en el editor | Revisa el `package.json` y el `index.ts` del paquete |
| No ves los `console.log` de una prueba | Vitest los oculta si la prueba pasa | `toMatchInlineSnapshot()` con `vitest run -u` |

### Windows y Git Bash

| Síntoma | Causa | Solución |
|---|---|---|
| Un script pasado por heredoc o un `sed` rompe código con `\` | La shell se come las barras invertidas | Escribe el script en un archivo con el editor y ejecútalo desde ahí. Tras generar código, `node --check` ([lecciones 1 y 2](../lecciones-aprendidas.md)) |
| `curl -w '%{http_code}' -o /dev/null` devuelve `000` | Rareza del `curl` de Git Bash | Usa `curl -v` u `-o NUL` |
| `pg_restore: did not find magic string` | Un binario pasado por tubería a `docker compose exec -T` se corrompe | Usa el archivo desde dentro del contenedor que ya monta la carpeta |
| `rm -rf resultados`: «Device or resource busy» | La shell está dentro de esa carpeta | No hagas `cd` a carpetas de resultados; usa rutas desde la raíz |
| Un archivo escrito en `/tmp` no aparece para Node | El `/tmp` de Git Bash no es el de Node | Usa el directorio temporal de Windows |
| El export PPTX no termina en el navegador | Pestaña oculta o en segundo plano: los timers se estrangulan | Deja la pestaña visible. Playwright sin interfaz no tiene el problema |

Más casos, con su historia, en [lecciones-aprendidas.md](../lecciones-aprendidas.md). Los problemas del servidor (certificado, red corporativa) están en [servidor-local.md](../runbooks/servidor-local.md#problemas-conocidos).
