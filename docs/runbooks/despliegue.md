# Runbook — despliegue: staging, producción y reversión

Todo se hace en el servidor, en la carpeta del repositorio, con Git Bash. El diseño está en `docs/adr/0016-staging-mismo-servidor.md`.

| Entorno | Dirección | Configuración | Datos |
|---|---|---|---|
| Producción | `https://mbc.asissoft.com` | `.env` | Reales (volumen `processiq_postgres_datos`, copias en `respaldos/`) |
| Staging | `https://staging.mbc.asissoft.com` | `.env.staging` | Propios de staging (volumen `processiq-staging_postgres_datos`, copias en `respaldos-staging/`) |

## Flujo normal

1. **Fusionar el PR en `main`** (con la CI en verde) y actualizar el servidor:
   ```bash
   git switch main && git pull
   ```
2. **Staging** (construye las imágenes con la versión = commit y las levanta):
   ```bash
   infra/desplegar.sh staging
   ```
3. **Validar en staging:** entrar, abrir un proceso, guardar una revisión y mirar «Sistema».
4. **Promover a producción la MISMA imagen** (no reconstruye):
   ```bash
   infra/desplegar.sh produccion
   ```
   La API aplica las migraciones nuevas al arrancar.
5. Comprobar `https://mbc.asissoft.com/proyectos/admin/sistema`.

`infra/desplegar.sh versiones` muestra qué versión corre en cada entorno y el registro de despliegues (`despliegues.log`).

## Reversión

```bash
infra/desplegar.sh versiones                 # ver la versión anterior
infra/desplegar.sh produccion <version>      # vuelve a esa imagen
```

Las imágenes anteriores siguen en el servidor, así que revertir tarda lo que tarda arrancar un contenedor.

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
- **Espacio en disco:** `infra/desplegar.sh produccion` borra solo las imágenes viejas al terminar. También se puede lanzar a mano con `infra/desplegar.sh limpiar [n]`. Siempre conserva:
  - las versiones de producción y de staging;
  - la versión anterior de producción, para poder revertir;
  - las `n` más recientes (5 por defecto);
  - las etiquetas `local`.

  También borra la caché de construcción de más de 7 días. «Sistema» avisa cuando queda menos del 10 % de disco.
