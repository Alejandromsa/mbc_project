#!/usr/bin/env bash
# Despliegues en el servidor (docs/runbooks/despliegue.md). Desde la carpeta del
# repositorio, con Git Bash:
#
#   infra/desplegar.sh staging                construye el commit actual y lo levanta en staging
#   infra/desplegar.sh produccion             promueve a producción la versión de staging (la MISMA imagen)
#   infra/desplegar.sh produccion <version>   promueve, o revierte, a una versión concreta
#   infra/desplegar.sh versiones              qué versión corre en cada entorno y qué imágenes hay
#   infra/desplegar.sh limpiar [n]            borra imágenes viejas; conserva las de producción, staging,
#                                             la anterior de producción y las n más recientes (5)
#
# La versión es el commit (8 caracteres). Las migraciones de la base las aplica
# la API al arrancar: deben ser compatibles con la versión anterior, para poder
# revertir sin tocar la base. Tras promover a producción se limpia solo.
set -euo pipefail
cd "$(dirname "$0")/.."

REGISTRO=despliegues.log

version_de() { grep -E '^VERSION=' "$1" 2>/dev/null | tail -1 | cut -d= -f2 || true; }

# Valor de una variable en un archivo de entorno, sin comillas ni \r (vacío si no está)
valor_de() {   # archivo variable
  grep -E "^$2=" "$1" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E "s/^(['\"])(.*)\1$/\2/" || true
}

# Red compartida por producción y staging. Como en Compose: la terminal gana al
# archivo (.env en producción, .env.staging en staging), y si no, la de siempre.
red_de() {   # archivo
  local r="${RED_BORDE:-$(valor_de "$1" RED_BORDE)}"
  echo "${r:-processiq-borde}"
}

fijar_version() {   # archivo version
  if grep -qE '^VERSION=' "$1"; then
    sed -i "s/^VERSION=.*/VERSION=$2/" "$1"
  else
    printf '\n# Versión desplegada (la fija infra/desplegar.sh)\nVERSION=%s\n' "$2" >> "$1"
  fi
}

compose_staging() {
  docker compose -p processiq-staging --env-file .env.staging -f docker-compose.yml -f docker-compose.staging.yml "$@"
}

esperar_api() {   # proyecto
  for _ in $(seq 1 90); do
    estado=$(docker inspect -f '{{.State.Health.Status}}' "$1-api-1" 2>/dev/null || echo desconocido)
    [ "$estado" = healthy ] && return 0
    sleep 2
  done
  return 1
}

staging() {
  [ -f .env.staging ] || { echo "Falta .env.staging (copiar de .env.staging.example y completar)."; exit 1; }
  red=$(red_de .env.staging)
  [ "$red" = "$(red_de .env)" ] || {
    echo "RED_BORDE no coincide: producción usa $(red_de .env) (.env) y staging $red (.env.staging). Pon el mismo valor en los dos."; exit 1; }
  docker network inspect "$red" >/dev/null 2>&1 || {
    echo "No existe la red $red: arranca antes producción con esta configuración (docker compose up -d)."; exit 1; }
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Hay cambios sin confirmar: la versión no correspondería a un commit. Confírmalos o descártalos."; exit 1
  fi
  version=$(git rev-parse --short=8 HEAD)
  echo "Construyendo la versión $version ($(git log -1 --format=%s))…"
  VERSION=$version compose_staging build
  fijar_version .env.staging "$version"
  compose_staging up -d --remove-orphans
  esperar_api processiq-staging || { echo "La API de staging no quedó sana: docker compose -p processiq-staging logs api"; exit 1; }
  echo "$(date -u +%FT%TZ) staging $version" >> "$REGISTRO"
  echo "Staging en la versión $version: https://$(grep -E '^DOMINIO=' .env.staging | cut -d= -f2)"
  echo "Cuando esté validada: infra/desplegar.sh produccion"
}

produccion() {
  version="${1:-$(version_de .env.staging)}"
  [ -n "$version" ] || { echo "Staging no tiene versión: indica una (infra/desplegar.sh produccion <version>)."; exit 1; }
  for imagen in web api intermediario; do
    docker image inspect "processiq/$imagen:$version" >/dev/null 2>&1 || {
      echo "No existe la imagen processiq/$imagen:$version (se construye al desplegar en staging)."; exit 1; }
  done
  anterior=$(version_de .env)
  anterior=${anterior:-local}
  echo "Producción: $anterior → $version"
  fijar_version .env "$version"
  docker compose up -d --no-build --remove-orphans
  if ! esperar_api processiq; then
    echo "La API no quedó sana con $version. Para volver: infra/desplegar.sh produccion $anterior"; exit 1
  fi
  echo "$(date -u +%FT%TZ) produccion $version (antes $anterior)" >> "$REGISTRO"
  echo "Producción en la versión $version. Para revertir: infra/desplegar.sh produccion $anterior"
  limpiar 5 || echo "Aviso: falló la limpieza de imágenes viejas (el despliegue está hecho): infra/desplegar.sh limpiar"
}

versiones() {
  echo "Producción: $(version_de .env)"
  echo "Staging:    $(version_de .env.staging 2>/dev/null)"
  echo "Imágenes disponibles (api):"
  docker image ls processiq/api --format '  {{.Tag}}  {{.CreatedSince}}'
  if [ -f "$REGISTRO" ]; then echo "Últimos despliegues:"; tail -5 "$REGISTRO"; fi
}

# Borra las imágenes processiq/* de versiones viejas para no llenar el disco.
# Nunca toca: producción, staging, la versión anterior de producción (para
# revertir), las n más recientes ni la etiqueta «local» (builds de prueba).
limpiar() {
  conservar_n="${1:-5}"
  [[ "$conservar_n" =~ ^[0-9]+$ ]] || { echo "limpiar: n debe ser un número."; exit 1; }
  [ -n "$(version_de .env)" ] || { echo "limpiar: .env no tiene VERSION; ejecútalo en la carpeta del servidor."; exit 1; }
  declare -A conservar=([local]=1)
  for v in "$(version_de .env)" "$(version_de .env.staging)"; do [ -n "$v" ] && conservar[$v]=1; done
  if [ -f "$REGISTRO" ]; then
    anterior=$(grep ' produccion ' "$REGISTRO" | tail -1 | sed -n 's/.*(antes \([^)]*\)).*/\1/p')
    [ -n "$anterior" ] && conservar[$anterior]=1
  fi
  # Etiquetas de la API de la más reciente a la más antigua (web e intermediario llevan las mismas)
  mapfile -t etiquetas < <(docker image ls processiq/api --format '{{.CreatedAt}}|{{.Tag}}' | sort -r | cut -d'|' -f2)
  recientes=0 borradas=0
  for t in "${etiquetas[@]}"; do
    [ -n "$t" ] && [ "$t" != "<none>" ] || continue
    if [ -n "${conservar[$t]:-}" ]; then continue; fi
    if [ "$recientes" -lt "$conservar_n" ]; then recientes=$((recientes + 1)); continue; fi
    for imagen in web api intermediario; do
      docker image rm "processiq/$imagen:$t" >/dev/null 2>&1 || true
    done
    echo "Borrada la versión $t"
    borradas=$((borradas + 1))
  done
  docker image prune -f >/dev/null
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
  echo "Limpieza hecha: $borradas versiones borradas; se conservan producción ($(version_de .env)), staging ($(version_de .env.staging)) y las $conservar_n más recientes."
}

case "${1:-}" in
  staging) staging ;;
  produccion) produccion "${2:-}" ;;
  versiones) versiones ;;
  limpiar) limpiar "${2:-}" ;;
  *) sed -n '2,14p' "$0"; exit 1 ;;
esac
