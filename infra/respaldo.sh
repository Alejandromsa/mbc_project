#!/bin/sh
# Copias de seguridad de Postgres: un pg_dump (formato custom) al día a la hora
# RESPALDO_HORA (hora local de TZ) en /respaldos, conservando los
# RESPALDO_CONSERVAR más recientes. Restaurar: docs/runbooks/servidor-local.md
#
# Sin RESPALDO_HORA (vacía), vuelve al modo anterior: una copia cada
# RESPALDO_CADA_HORAS horas desde el arranque.
set -eu
HORA="${RESPALDO_HORA-03:00}"
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

# Segundos que faltan hasta la próxima RESPALDO_HORA (hoy si aún no pasó; si no, mañana)
segundos_hasta_la_hora() {
  ahora=$(date +%s)
  objetivo=$(date -d "$HORA" +%s)
  [ "$objetivo" -gt "$ahora" ] || objetivo=$((objetivo + 86400))
  echo $((objetivo - ahora))
}

# Edad en horas de la copia más reciente (muy grande si no hay ninguna)
horas_desde_la_ultima() {
  ultima=$(ls -1t /respaldos/processiq-*.dump 2>/dev/null | head -n 1)
  [ -n "$ultima" ] || { echo 999999; return; }
  echo $(( ($(date +%s) - $(date -r "$ultima" +%s)) / 3600 ))
}

sleep "$ESPERA_INICIAL_S"

if [ -z "$HORA" ]; then
  while true; do
    respaldar
    sleep "$((CADA_HORAS * 3600))"
  done
fi

date -d "$HORA" +%s > /dev/null 2>&1 || { echo "{\"evento\":\"respaldo_config\",\"error\":\"RESPALDO_HORA no es HH:MM: $HORA\"}"; exit 1; }
# Si el servidor estuvo apagado a la hora de la copia, no se espera al día siguiente
[ "$(horas_desde_la_ultima)" -lt 24 ] || respaldar
while true; do
  espera=$(segundos_hasta_la_hora)
  echo "{\"evento\":\"respaldo_programado\",\"hora\":\"$HORA\",\"zona\":\"${TZ:-UTC}\",\"en_segundos\":$espera}"
  sleep "$espera"
  respaldar
done
