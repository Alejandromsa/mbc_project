#!/usr/bin/env bash
# Pasa a producción una versión ya desplegada en staging, solo si staging está
# sano y la prueba de humo (infra/humo.mjs) pasa entera. Desde la carpeta del
# repositorio, con Git Bash:
#
#   infra/promover.sh <version>
#
# Si cualquier paso falla, se detiene y producción no cambia. Para revertir no se
# usa este script: infra/desplegar.sh produccion <anterior> (sin esperas).
# Detalle en docs/runbooks/despliegue.md.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?Indica la versión validada en staging (8 caracteres): infra/promover.sh <version>}"

valor_de() {   # archivo variable (como en desplegar.sh)
  grep -E "^$2=" "$1" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E "s/^(['\"])(.*)\1$/\2/" || true
}
url_de() {   # archivo
  local o; o=$(valor_de "$1" ORIGEN_PUBLICO)
  echo "${o:-https://$(valor_de "$1" DOMINIO)}"
}
compose_staging() {
  docker compose -p processiq-staging --env-file .env.staging -f docker-compose.yml -f docker-compose.staging.yml "$@"
}
parar() { echo "$1: no se promueve."; exit 1; }

STAGING=$(url_de .env.staging)
PRODUCCION=$(url_de .env)
SALIDA="$(git rev-parse --git-common-dir)/processiq-humo.salida"
desplegando() { local e; e=$(infra/sondear-main.sh --estado 2>/dev/null || true); grep -q 'Cerrojo: *sí' <<< "$e"; }

# 1. Staging en esa versión, sin despliegue en curso, con sus contenedores en marcha y sano
for _ in $(seq 1 80); do
  desplegando || break
  echo "El sondeo está desplegando staging; espero…"
  sleep 15
done
! desplegando || parar "El sondeo sigue desplegando staging"
EN_STAGING=$(valor_de .env.staging VERSION)
[ "$EN_STAGING" = "$VERSION" ] || parar "Staging está en ${EN_STAGING:-ninguna versión}, no en $VERSION"
for servicio in web api worker intermediario postgres; do
  [ "$(docker inspect -f '{{.State.Running}}' "processiq-staging-$servicio-1" 2>/dev/null)" = true ] ||
    parar "El contenedor $servicio de staging no está en marcha (docker compose -p processiq-staging ps)"
done
[ "$(docker inspect -f '{{.State.Health.Status}}' processiq-staging-api-1)" = healthy ] || parar "La API de staging no está sana"
curl -sf --max-time 15 "$STAGING/api/salud" > /dev/null || parar "Staging no responde en $STAGING"

# 2. Prueba de humo con una cuenta temporal, que se desactiva pase lo que pase
CORREO="humo-$(date +%m%d%H%M%S)@processiq.test"
CLAVE=$(compose_staging exec -T api node dist/cli.js crear-usuario --email "$CORREO" --nombre "Humo" --rol admin 2>&1 |
  sed -n 's/^Contraseña temporal: //p' || true)
[ -n "$CLAVE" ] || parar "No se pudo crear la cuenta temporal"
desactivar() {
  compose_staging exec -T postgres psql -U processiq -d processiq -tAc \
    "update usuarios set activo=false where email='$CORREO'; delete from sesiones where usuario_id in (select id from usuarios where email='$CORREO');" \
    > /dev/null || echo "Aviso: no se pudo desactivar $CORREO en staging; hazlo a mano."
}
trap desactivar EXIT
echo "Prueba de humo contra $STAGING…"
if ! BASE="$STAGING" CORREO="$CORREO" CLAVE_TEMPORAL="$CLAVE" node infra/humo.mjs > "$SALIDA" 2>&1; then
  grep -E 'FALLA|comprobaciones|Faltan' "$SALIDA" || tail -5 "$SALIDA"
  parar "La prueba de humo falló (detalle en $SALIDA)"
fi
tail -1 "$SALIDA"

# 3. Producción (la MISMA imagen que staging)
echo "Humo en verde: promuevo $VERSION."
infra/desplegar.sh produccion "$VERSION"
curl -sf --max-time 15 "$PRODUCCION/api/salud" > /dev/null || {
  echo "Producción no responde en $PRODUCCION tras promover. Para revertir: infra/desplegar.sh produccion <anterior> (infra/desplegar.sh versiones)."
  exit 1
}
echo "Producción responde en $PRODUCCION con la versión $VERSION."
