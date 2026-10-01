# Runbook — despliegue: staging, producción y reversión

Todo se hace en el servidor, en la carpeta del repositorio, con Git Bash. El diseño está en `docs/adr/0016-staging-mismo-servidor.md`.

| Entorno | Dirección | Configuración | Datos |
|---|---|---|---|
| Producción | `https://mbc.asissoft.com` | `.env` | Reales (volumen `processiq_postgres_datos`, copias en `respaldos/`) |
| Staging | `https://staging.mbc.asissoft.com` | `.env.staging` | Propios de staging (volumen `processiq-staging_postgres_datos`, copias en `respaldos-staging/`) |

## Flujo normal

1. **Fusionar el PR en `main`** (con la CI en verde).
2. **Staging:** lo despliega solo el [sondeo](#despliegue-automático-a-staging-sondeo) en 10 minutos como mucho; `infra/sondear-main.sh --estado` dice en qué va. A mano, con el sondeo en pausa (construye las imágenes con la versión = commit y las levanta):
   ```bash
   git switch main && git pull
   infra/desplegar.sh staging
   ```
3. **Validar en staging:** entrar, abrir un proceso, guardar una revisión y mirar «Sistema». Anotar la versión validada (`infra/desplegar.sh versiones`).
4. **Promover a producción la MISMA imagen** (no reconstruye), con la versión validada:
   ```bash
   infra/promover.sh <version>
   ```
   [infra/promover.sh](../../infra/promover.sh) solo promueve si todo lo anterior sale bien; si algo falla, se detiene y producción no cambia:
   - espera a que el sondeo termine si está desplegando;
   - comprueba que staging está en esa versión, con sus cinco contenedores en marcha, la API sana y respondiendo desde fuera;
   - pasa la **prueba de humo** ([infra/humo.mjs](../../infra/humo.mjs), 26 comprobaciones de la API: proyectos, plantillas, KPIs, módulos, invitados sin sesión, presencia, sesiones, IA y «Sistema») con una cuenta de administrador temporal, que queda desactivada al terminar pase lo que pase. La salida queda en `.git/processiq-humo.salida`;
   - promueve con `infra/desplegar.sh produccion <version>` y comprueba que producción responde.

   Indica siempre la versión: con el sondeo activo, staging puede tener ya otra más nueva que llegó mientras validabas. La API aplica las migraciones nuevas al arrancar.

   **No promuevas con `infra/desplegar.sh produccion` encadenado tras una prueba a mano** (lección 23): si la prueba falla, la promoción corre igual. `desplegar.sh produccion` directo queda para revertir.
5. Comprobar `https://mbc.asissoft.com/proyectos/admin/sistema`.

`infra/desplegar.sh versiones` muestra qué versión corre en cada entorno y el registro de despliegues (`despliegues.log`).

## Despliegue automático a staging (sondeo)

El servidor mira `main` cada 10 minutos y, si avanzó, despliega staging. Es el servidor quien pregunta a GitHub: no hay runners propios de GitHub Actions, que en un repositorio público dejarían a un PR ejecutar código en el servidor ([ADR 18](../adr/0018-repositorio-publico.md)). **Producción sigue siendo manual.**

Cada consulta ([infra/sondear-main.sh](../../infra/sondear-main.sh)):

1. Se niega si la carpeta no está en `main`, si tiene cambios sin confirmar o si falta `.env.staging`.
2. Toma su cerrojo (`.git/processiq-sondeo.cerrojo`). Si hay otra consulta en curso, no hace nada. Un cerrojo de más de 2 horas se da por abandonado.
3. `git fetch`. Si `origin/main` es la versión de staging (`VERSION` de `.env.staging`), termina.
4. Si no: `git pull --ff-only` e `infra/desplegar.sh staging`. Se niega si el `main` local tiene commits que no están en `origin/main`, y no hace nada si staging va por delante.
5. Si el despliegue falla, no lo reintenta con ese commit: espera al siguiente, o a que lo despliegues a mano. La salida del último despliegue queda en `.git/processiq-sondeo.salida`.

Registro en `despliegues.log`, con líneas `sondeo: …`: cada despliegue (bien o mal) y cada cambio de situación (pausa, rechazo). Las consultas sin cambios no se anotan, y un rechazo que se repite se anota una sola vez.

### Vigilancia de los contenedores

Antes de todo lo anterior, también con el sondeo en pausa, cada consulta comprueba que producción y staging siguen en marcha:
- **Qué mira:** los seis servicios de cada uno (`web`, `api`, `worker`, `intermediario`, `postgres`, `respaldo`), que estén `running` y sin la salud en `unhealthy`. Si Docker no responde, también avisa.
- **Excepciones:** staging no se mira mientras el sondeo lo está desplegando. El Postgres de desarrollo no se vigila.
- **Falsas alarmas:** si algo falla, vuelve a mirar al minuto. Así un despliegue a mano, que recrea los contenedores unos segundos, no da aviso.
- **Cómo avisa:** solo cuando cambia la situación, al pararse y al recuperarse:
  - una línea `vigilancia: ALERTA …` o `vigilancia: de nuevo todo en marcha` en `despliegues.log`;
  - una ventana en la sesión de Windows de quien instaló la tarea (`msg.exe`), que queda abierta hasta que alguien la cierre.
- **Dónde se ve:** la última situación, en `infra/sondear-main.sh --estado` («Vigilancia»).

Avisa solo a quien está delante del servidor. Las alertas por correo o webhook siguen pendientes ([pendientes.md](../pendientes.md#52-seguridad-y-operación)).

```bash
infra/sondear-main.sh --estado            # último resultado, pausa, cerrojo, commit fallido y versiones
infra/sondear-main.sh --simular           # qué haría ahora, sin pull ni despliegue (sí hace git fetch)
infra/sondear-main.sh --pausar "motivo"   # deja de desplegar (queda en .git/processiq-sondeo.pausa)
infra/sondear-main.sh --reanudar
```

**Pausarlo** antes de:
- desplegar staging a mano, o trabajar en la carpeta del servidor en otra rama (si no, lo rechaza y lo anota);
- validar una versión con calma: así staging no cambia mientras tanto.

También se puede desactivar la tarea: `Disable-ScheduledTask -TaskName 'ProcessIQ - sondeo de main a staging'` (y `Enable-ScheduledTask` para volver).

### Instalación (una vez, en el servidor)

En PowerShell, **con la cuenta que tiene Docker Desktop** y sin permisos de administrador, en la carpeta del repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File infra\instalar-sondeo.ps1          # registra la tarea (o la sustituye)
powershell -ExecutionPolicy Bypass -File infra\instalar-sondeo.ps1 -Quitar  # la borra
```

- La tarea se llama «ProcessIQ - sondeo de main a staging». Ejecuta Git Bash sin ventana cada 10 minutos (`-Minutos` para cambiarlo), una sola vez a la vez, y la corta a la hora.
- Solo corre con la sesión iniciada, igual que Docker Desktop.
- `origin` tiene que poder leerse sin credenciales: el repositorio es público y se usa por HTTPS.
- Antes, comprueba que la carpeta está en `main` y limpia: `infra/sondear-main.sh --simular`.
- Después: `Get-ScheduledTaskInfo -TaskName 'ProcessIQ - sondeo de main a staging'` (`LastTaskResult` 0 = bien, 1 = rechazo o fallo) e `infra/sondear-main.sh --estado`.

## Reversión

```bash
infra/desplegar.sh versiones                 # ver la versión anterior
infra/desplegar.sh produccion <version>      # vuelve a esa imagen
```

Las imágenes anteriores siguen en el servidor, así que revertir tarda lo que tarda arrancar un contenedor. Revertir no pasa por `infra/promover.sh`: va directo, sin prueba de humo.

**Condición:** las migraciones deben ser compatibles con la versión anterior. Se añaden columnas y tablas; no se borran ni se renombran en el mismo despliegue en que el código deja de usarlas. Si una migración no lo es, **antes de promover**:
- hacer una copia manual (ver «Copias de seguridad» en `servidor-local.md`);
- anotar que revertir exige restaurar esa copia.

## Primera vez (ya hecho el 26-sep-2026)

1. Registro DNS **A** `staging.mbc` → la IP pública, **solo DNS** (Cloudflare, igual que `mbc`).
2. `.env.staging` a partir de `.env.staging.example`, con contraseña de base y código de equipo propios.
3. Producción con la configuración que crea la red compartida (`docker compose up -d`).
4. `infra/desplegar.sh staging`.
5. Primer administrador de staging:
   ```bash
   docker compose -p processiq-staging --env-file .env.staging -f docker-compose.yml -f docker-compose.staging.yml \
     exec api node dist/cli.js crear-usuario --email correo@dominio --nombre "Nombre" --rol admin
   ```

## Si algo falla

- **La API no queda sana:** `docker compose logs api`, o `docker compose -p processiq-staging logs api` para staging. Si fue en producción: revertir.
- **`No existe la imagen processiq/…:<version>`:** esa versión no pasó por staging. Desplegar antes en staging.
- **`Hay cambios sin confirmar`:** la versión se identifica por el commit. Confirmar o descartar los cambios.
- **Staging responde 502:** su pila está parada (`infra/desplegar.sh staging`) o producción no tiene la red (`docker compose up -d`).
- **`RED_BORDE no coincide`:** producción (`.env`) y staging (`.env.staging`) tienen que usar la misma red. Pon el mismo valor en los dos archivos, o quítalo de los dos. Una `RED_BORDE` exportada en la terminal gana a los archivos, como en Compose.
- **El sondeo no despliega:** `infra/sondear-main.sh --estado` y las líneas `sondeo:` de `despliegues.log` dicen por qué (pausa, otra rama, cambios sin confirmar, commit fallido). Si falló un despliegue, su salida está en `.git/processiq-sondeo.salida`; arreglado el problema, `infra/desplegar.sh staging` (con el sondeo en pausa) o el siguiente commit de `main`.
- **Espacio en disco:** `infra/desplegar.sh produccion` borra solo las imágenes viejas al terminar. También se puede lanzar a mano con `infra/desplegar.sh limpiar [n]`. Siempre conserva:
  - las versiones de producción y de staging;
  - la versión anterior de producción, para poder revertir;
  - las `n` más recientes (5 por defecto);
  - las etiquetas `local`.

  También borra la caché de construcción de más de 7 días. «Sistema» avisa cuando queda menos del 10 % de disco.
