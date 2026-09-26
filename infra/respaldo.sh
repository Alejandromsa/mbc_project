#!/bin/sh
# Copias de seguridad de Postgres: un pg_dump (formato custom) cada
# RESPALDO_CADA_HORAS horas en /respaldos, conservando los RESPALDO_CONSERVAR
# más recientes. Restaurar: docs/runbooks/servidor-local.md
set -eu
CADA_HORAS="${RESPALDO_CADA_HORAS:-24}"
CONSERVAR="${RESPALDO_CONSERVAR:-14}"
# La primera copia espera a que la API haya creado o migrado las tablas: si no,
# sale una copia vacía (pasó el 25-sep-2026: 846 bytes).
ESPERA_INICIAL_S="${RESPALDO_ESPERA_INICIAL_S:-300}"

respaldar() {
  archivo="/respaldos/processiq-$(date -u +%Y%m%d-%H%M%S).dump"
  if pg_dump --format=custom --file="$archivo.parcial"; then
    mv "$archivo.parcial" "$archivo"
    echo "{\"evento\":\"respaldo\",\"archivo\":\"$(basename "$archivo")\",\"bytes\":$(wc -c < "$archivo")}"
  else
    rm -f "$archivo.parcial"
    echo "{\"evento\":\"respaldo_fallido\"}"
  fi
  # Conserva los N más recientes
  ls -1t /respaldos/processiq-*.dump 2>/dev/null | tail -n +"$((CONSERVAR + 1))" | xargs -r rm -f
}

sleep "$ESPERA_INICIAL_S"
while true; do
  respaldar
  sleep "$((CADA_HORAS * 3600))"
done
