# Runbook — servidor local

ProcessIQ corre en un PC propio con IP pública fija, en contenedores Docker. Es la etapa previa al PaaS descrito en `docs/arquitectura.md`: las imágenes son las mismas, así que migrar después no exige rediseñar.

## Qué corre

| Contenedor | Qué hace | Puerto |
|---|---|---|
| `web` (Caddy) | Sirve la web, obtiene y renueva el certificado HTTPS; enruta `/api/*` a la API y `/ia/*` al intermediario | 443 publicado |
| `api` (Node) | Cuentas locales, proyectos, procesos y revisiones; aplica las migraciones de la base al arrancar | 8080, solo red interna |
| `postgres` | Base de datos de la plataforma (volumen `postgres_datos`) | 5432, solo red interna |
| `respaldo` | `pg_dump` cada 24 h a la carpeta `respaldos/` del repositorio; conserva los 14 últimos | — |
| `intermediario` (Node) | Guarda la clave de Anthropic y reenvía las llamadas de IA del modo "Clave del equipo" | 8787, solo red interna |

El editor sigue funcionando sin iniciar sesión, como en el MVP: sin cuenta, el trabajo vive en el navegador (`localStorage`). Lo que se guarda en un proyecto vive en Postgres.

## Direcciones para el equipo

| Dirección | Qué es |
|---|---|
| `https://mbc.asissoft.com/proyectos/` | **Plataforma:** entrar, proyectos, procesos, revisiones y, para administradores, usuarios y auditoría |
| `https://mbc.asissoft.com/` | **Editor libre**, igual que el MVP: sin cuenta, con el trabajo guardado en el navegador |
| `https://mbc.asissoft.com/?proceso=…` / `?revision=…` | El editor abierto sobre un proceso de un proyecto. Se llega desde la plataforma, con el botón «Abrir en el editor» |

Flujo de trabajo:
1. Un consultor crea un proyecto y añade miembros con su rol.
2. Crea procesos, vacíos o importando el JSON exportado desde el editor.
3. Los abre en el editor y pulsa **«Guardar revisión»** (o Ctrl+S): cada guardado crea una versión nueva en borrador.
4. Quien edita la envía a revisión; el revisor (o el propietario) la aprueba o la devuelve.

Si se cierra el navegador con cambios sin guardar, quedan como borrador en ese navegador y el editor ofrece recuperarlos al volver a abrir el proceso.

## Usuarios

Las cuentas son locales (correo y contraseña) hasta que TI registre la aplicación en Entra ID. Cada alta genera una **contraseña temporal** que se muestra una sola vez y que el usuario debe cambiar al entrar.

- **Primer administrador** (una vez, en la carpeta del repositorio):
  ```bash
  docker compose exec api node dist/cli.js crear-usuario --email correo@dominio --nombre "Nombre Apellido" --rol admin
  ```
- **Más usuarios:** los da de alta un administrador desde la web (o con el mismo comando y `--rol consultor` o `--rol lector`).
- **Contraseña olvidada:**
  ```bash
  docker compose exec api node dist/cli.js restablecer-clave --email correo@dominio
  ```
  Cierra sus sesiones y genera una nueva contraseña temporal.

Roles de organización: `admin` (todo, incluidos usuarios y auditoría), `consultor` (crea proyectos) y `lector` (solo participa donde lo invitan). En cada proyecto: `propietario`, `editor`, `revisor` y `lector` (ver `apps/api/src/permisos.ts`).

## Copias de seguridad

- El servicio `respaldo` deja `respaldos/processiq-AAAAMMDD-HHMMSS.dump` cada 24 h (`RESPALDO_CADA_HORAS`) y conserva los 14 últimos (`RESPALDO_CONSERVAR`). Carpeta configurable con `CARPETA_RESPALDOS` en `.env`.
- **Esa carpeta está en el mismo PC: hay que copiarla fuera** (OneDrive, disco externo) con la frecuencia que se acuerde.
- **Restaurar** (desde el contenedor `respaldo`, que ya monta la carpeta; no pasar el archivo por tubería desde la shell de Windows, se corrompe):
  ```bash
  # Prueba en una base aparte
  docker compose exec respaldo sh -c "createdb restaurada && pg_restore -d restaurada /respaldos/processiq-AAAAMMDD-HHMMSS.dump"
  # Restauración real (con la API parada)
  docker compose stop api
  docker compose exec respaldo pg_restore --clean --if-exists -d processiq /respaldos/processiq-AAAAMMDD-HHMMSS.dump
  docker compose start api
  ```
- Prueba de restauración: trimestral, en una base aparte (primer comando).

## Datos del servidor actual

| | |
|---|---|
| IP pública | <IP-PUBLICA> |
| Salida a internet | Wi-Fi, IP fija <IP-LOCAL-DEL-SERVIDOR>, router <IP-DEL-ROUTER> |
| Dominio | `mbc.asissoft.com`: registro A → <IP-PUBLICA>, **solo DNS** (sin proxy), creado el 25-sep-2026 |
| DNS | `asissoft.com` está **registrado en name.com**, pero su zona la sirve **Cloudflare** (nameservers `aspen`/`roan.ns.cloudflare.com`; la movió otro proyecto). Los registros se crean en Cloudflare, no en name.com. No devolver los nameservers a name.com: dependen de ellos `portal.asissoft.com` y el correo |
| Certificado | Let's Encrypt, emitido por Caddy el 25-sep-2026; se renueva solo |
| Puerto 80 | Ocupado por IIS (W3SVC): por eso no hay redirección HTTP → HTTPS |
| Carpeta del repositorio | `C:\Users\usuario\processiq` |

## Puesta en marcha (una sola vez)

Estado al 25-sep-2026: los pasos 1 a 3 y 5 están hechos; falta el 4 (la clave de IA).

1. **DNS** ✅ Registro **A** `mbc` → `<IP-PUBLICA>` en la zona `asissoft.com` de Cloudflare, en modo **"Solo DNS" (nube gris)**. Con el proxy activado (nube naranja), el certificado no se puede validar y el tráfico pasaría por Cloudflare.
   - Antes de crear un registro, comprobar quién sirve la zona: `nslookup -type=NS asissoft.com 8.8.8.8`.
   - Se creó por la API de Cloudflare con el token de edición de DNS que ya existía para `asissoft.com`.
2. **Router (<IP-DEL-ROUTER>)** ✅ Reenvía **TCP 443** externo → `<IP-LOCAL-DEL-SERVIDOR>:443`. Lo confirmó Let's Encrypt al validar desde internet.
3. **Firewall de Windows** ✅ Regla "ProcessIQ HTTPS (443)". Si hubiera que recrearla (PowerShell **como administrador**):
   ```powershell
   New-NetFirewallRule -DisplayName "ProcessIQ HTTPS (443)" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Any
   ```
4. **Clave de IA** ⏳ En `.env`, pegar la clave en la línea `ANTHROPIC_API_KEY=`, que está marcada con `>>> PEGAR AQUI`.
   - Crearla en console.anthropic.com **dentro de un workspace**, con tope de gasto.
   - Después: `docker compose up -d intermediario`.
   - `ACCESS_CODE` ya viene generado: es el código que se reparte al equipo.
5. **Arrancar:**
   ```bash
   docker compose up -d --build
   docker compose restart web   # fuerza un nuevo intento de certificado si el DNS se acaba de crear
   ```
6. **Verificar desde fuera de la red** (datos móviles):
   - `https://mbc.asissoft.com` carga la app con candado válido;
   - `https://mbc.asissoft.com/ia/health` responde `"configurado": true, "formatoClave": "ok"`.
7. **Docker Desktop:** activar *Start Docker Desktop when you sign in* y evitar que el PC entre en suspensión. Los contenedores se reinician solos (`restart: unless-stopped`), pero solo si Docker Desktop está en marcha.

## Cambiar de dominio

1. Editar `DOMINIO` en `.env`.
2. Crear el registro A del dominio nuevo → IP pública (modo "Solo DNS"). Hay que crearlo en el proveedor que sirve la zona (`nslookup -type=NS <dominio>`), que no siempre es el registrador.
3. `docker compose up -d` — Caddy pide el certificado nuevo solo.

Nada más cambia: la web llama a la IA por su mismo origen (`/ia`) y el intermediario acepta `https://$DOMINIO` por defecto.

## Operación diaria

| Tarea | Comando (en la carpeta del repositorio) |
|---|---|
| Estado | `docker compose ps` |
| Logs | `docker compose logs -f web` · `docker compose logs -f api` · `docker compose logs -f intermediario` |
| Publicar una versión nueva | `git pull && docker compose up -d --build` (la API aplica las migraciones nuevas al arrancar) |
| Rotar el código del equipo | editar `ACCESS_CODE` en `.env` → `docker compose up -d intermediario` |
| Ver la auditoría | como administrador, en `https://mbc.asissoft.com/proyectos/admin/auditoria` |
| Último respaldo | `docker compose logs --tail 5 respaldo` |
| Parar todo | `docker compose down` — **nunca con `-v`**: borraría la base de datos y los certificados |
| Probar en local sin tocar producción | `DOMINIO=localhost TLS_MODO=interno PUERTO_HTTPS=8443 ALLOWED_ORIGINS=https://localhost:8443 CARPETA_RESPALDOS=./respaldos-prueba docker compose -p processiq-prueba up -d --build` (quitar con `docker compose -p processiq-prueba down -v`) |

El gasto de IA queda en el log del intermediario (`"evento":"gasto_ia"`). Si se configura `PULSE_URL`, también se reporta allí.

## Desarrollo en el PC

```bash
docker compose --profile dev up -d postgres-dev   # Postgres de desarrollo y pruebas, puerto 5440
cp .env.dev.example .env.dev                      # una vez
pnpm --filter @processiq/api dev                  # API en :8790 (migra al arrancar)
pnpm dev                                          # web en :5173 (editor en /, plataforma en /proyectos/); Vite reenvía /api a :8790
pnpm --filter @processiq/api semilla              # cuentas y proyectos de prueba (repetible)
pnpm --filter @processiq/api semilla --desde-cero # además vacía la base antes
pnpm e2e                                          # pruebas de punta a punta (usan su propia base, processiq_e2e)
```

**Cuentas de prueba** (solo en la base de desarrollo; la semilla se niega a correr contra otra base que no esté en `localhost`). Todas usan la contraseña `Prueba-ProcessIQ-2026`:

| Correo | Rol | Para probar |
|---|---|---|
| `admin@processiq.test` | admin | usuarios, auditoría y todos los proyectos |
| `propietario@processiq.test` | consultor · propietario | crear proyectos, gestionar miembros |
| `editor@processiq.test` | consultor · editor | guardar revisiones y enviarlas a revisión |
| `revisor@processiq.test` | consultor · revisor | aprobar o devolver revisiones |
| `lector@processiq.test` | lector · lector | solo lectura; no puede crear proyectos |
| `externo@processiq.test` | consultor | sin acceso al proyecto de prueba (404) |
| `nuevo@processiq.test` | consultor | cambio obligatorio de contraseña al entrar |
| `inactivo@processiq.test` | consultor | cuenta desactivada: no puede entrar |

La semilla crea además el proyecto "Siniestros — Seguros Andinos (prueba)", con estos procesos:

- "Gestión de siniestros": v1 aprobada, v2 en revisión y v3 en borrador.
- "Venta de lotes urbanos": v1 en borrador.
- Un proceso sin revisiones.

También crea un proyecto archivado. Volver a ejecutarla restablece las cuentas y rehace esos proyectos.

Las pruebas de la API (`pnpm test`) usan la base `processiq_pruebas` de ese mismo contenedor y la recrean en cada ejecución.

## Problemas conocidos

- **Red corporativa (Netskope):** bloquea los dominios "recién observados". Hasta que TI habilite `mbc.asissoft.com`, desde la red de Indra la app puede devolver 403 o un error de certificado. Fuera de esa red funciona.
- **El certificado no se emite:** `docker compose logs web | grep -i acme`.
  - `NXDOMAIN` → falta el registro DNS.
  - `connection refused` o `timeout` → falta el reenvío del router o la regla del firewall.
  - Caddy reintenta solo con espera creciente; `docker compose restart web` fuerza el intento.
- **Si se libera el puerto 80** (IIS detenido): se puede publicar también `80:80` en `docker-compose.yml` y quitar `auto_https disable_redirects` del `Caddyfile` para redirigir HTTP → HTTPS.
