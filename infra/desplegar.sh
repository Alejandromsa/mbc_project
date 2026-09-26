#!/usr/bin/env bash
# Despliegues en el servidor (docs/runbooks/despliegue.md). Desde la carpeta del
# repositorio, con Git Bash:
#
#   infra/desplegar.sh staging                construye el commit actual y lo levanta en staging
#   infra/desplegar.sh produccion             promueve a producción la versión de staging (la MISMA imagen)
#   infra/desplegar.sh produccion <version>   promueve, o revierte, a una versión concreta
#   infra/desplegar.sh versiones              qué versión corre en cada entorno y qué imágenes hay
#
# La versión es el commit (8 caracteres). Las migraciones de la base las aplica
# la API al arrancar: deben ser compatibles con la versión anterior, para poder
# revertir sin tocar la base.
set -euo pipefail
cd "$(dirname "$0")/.."

REGISTRO=despliegues.log
RED="${RED_BORDE:-processiq-borde}"

version_de() { grep -E '^VERSION=' "$1" 2>/dev/null | tail -1 | cut -d= -f2 || true; }

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
  docker network inspect "$RED" >/dev/null 2>&1 || {
    echo "No existe la red $RED: arranca antes producción con esta configuración (docker compose up -d)."; exit 1; }
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
}

versiones() {
  echo "Producción: $(version_de .env)"
  echo "Staging:    $(version_de .env.staging 2>/dev/null)"
  echo "Imágenes disponibles (api):"
  docker image ls processiq/api --format '  {{.Tag}}  {{.CreatedSince}}'
  if [ -f "$REGISTRO" ]; then echo "Últimos despliegues:"; tail -5 "$REGISTRO"; fi
}

case "${1:-}" in
  staging) staging ;;
  produccion) produccion "${2:-}" ;;
  versiones) versiones ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
