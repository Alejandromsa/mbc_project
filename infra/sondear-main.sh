#!/usr/bin/env bash
# Despliegue automático de main a staging por sondeo (docs/runbooks/despliegue.md).
# El servidor consulta GitHub; GitHub no le envía trabajos (ADR 18: sin runners
# propios). Lo ejecuta cada 10 minutos una tarea programada de Windows
# (infra/instalar-sondeo.ps1), en la carpeta del repositorio del servidor:
#
#   infra/sondear-main.sh              si origin/main avanzó respecto a staging: git pull --ff-only
#                                      e infra/desplegar.sh staging
#   infra/sondear-main.sh --simular    dice qué haría, sin pull ni despliegue (sí hace git fetch)
#   infra/sondear-main.sh --estado     último resultado, pausa, cerrojo y versiones
#   infra/sondear-main.sh --pausar [motivo]   deja de desplegar hasta --reanudar
#   infra/sondear-main.sh --reanudar
#
# Producción sigue siendo manual: infra/desplegar.sh produccion <version>.
# Se niega si la carpeta no está en main o tiene cambios. Tiene su propio
# cerrojo, y un commit cuyo despliegue falló no se reintenta hasta el siguiente.
# Registro: despliegues.log (despliegues y cambios de situación, no cada consulta).
set -euo pipefail
cd "$(dirname "$0")/.."

uso() { sed -n '2,17p' "$0" | sed -E 's/^# ?//'; }

SIMULAR=0
case "${1:-}" in
  '' | --estado | --pausar | --reanudar) ;;
  --simular) SIMULAR=1 ;;
  -h | --help) uso; exit 0 ;;
  *) uso; exit 2 ;;
esac

REGISTRO=despliegues.log
GIT_DIR=$(git rev-parse --absolute-git-dir)
CERROJO="$GIT_DIR/processiq-sondeo.cerrojo"   # carpeta: mkdir es atómico
PAUSA="$GIT_DIR/processiq-sondeo.pausa"       # si existe, no se despliega
ESTADO="$GIT_DIR/processiq-sondeo.estado"     # fecha y mensaje del último resultado
FALLIDO="$GIT_DIR/processiq-sondeo.fallido"   # commit cuyo despliegue falló
SALIDA="$GIT_DIR/processiq-sondeo.salida"     # salida del último despliegue
CERROJO_VIEJO_MIN=120                         # la tarea programada se corta a la hora

ahora() { date -u +%FT%TZ; }
version_de() { grep -E '^VERSION=' "$1" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '\r' || true; }
corto() { git rev-parse --short=8 "$1" 2>/dev/null || true; }

# Termina con un mensaje. Nivel: «siempre» (despliegues) va al registro;
# «cambio» (rechazos, pausa) solo si difiere del resultado anterior, para no
# repetirlo cada 10 minutos; «nunca» (sin cambios) solo queda en el estado.
terminar() {   # codigo nivel mensaje
  local codigo=$1 nivel=$2 mensaje=$3 anterior
  echo "$mensaje"
  if [ "$SIMULAR" = 1 ]; then exit "$codigo"; fi
  anterior=$(cut -d' ' -f2- "$ESTADO" 2>/dev/null || true)
  if [ "$nivel" = siempre ] || { [ "$nivel" = cambio ] && [ "$mensaje" != "$anterior" ]; }; then
    echo "$(ahora) sondeo: $mensaje" >> "$REGISTRO"
  fi
  echo "$(ahora) $mensaje" > "$ESTADO"
  exit "$codigo"
}

en_pausa() { echo "en pausa desde $(cat "$PAUSA"); reanudar: infra/sondear-main.sh --reanudar"; }

case "${1:-}" in
  --pausar)
    printf '%s %s\n' "$(ahora)" "${2:-sin motivo}" > "$PAUSA"
    terminar 0 cambio "$(en_pausa)" ;;
  --reanudar)
    [ -f "$PAUSA" ] || { echo "El sondeo no estaba en pausa."; exit 0; }
    rm -f "$PAUSA"
    terminar 0 cambio "reanudado: en la próxima consulta despliega si main avanzó" ;;
  --estado)
    echo "Último resultado:  $(cat "$ESTADO" 2>/dev/null || echo '(ninguno)')"
    echo "Pausa:             $(cat "$PAUSA" 2>/dev/null || echo no)"
    echo "Cerrojo:           $([ -d "$CERROJO" ] && echo "sí (pid $(cat "$CERROJO/pid" 2>/dev/null))" || echo no)"
    echo "Commit fallido:    $(cat "$FALLIDO" 2>/dev/null || echo ninguno)"
    echo "Staging:           $(version_de .env.staging)"
    echo "origin/main:       $(corto origin/main) (sin consultar; la próxima consulta hace git fetch)"
    if [ -f "$REGISTRO" ]; then echo "Registro del sondeo:"; grep ' sondeo: ' "$REGISTRO" | tail -5 || true; fi
    exit 0 ;;
esac

[ ! -f "$PAUSA" ] || terminar 0 cambio "$(en_pausa)"

rama=$(git symbolic-ref --quiet --short HEAD || echo '(sin rama)')
[ "$rama" = main ] || terminar 1 cambio "rechazado: la carpeta está en la rama $rama, no en main"
[ -z "$(git status --porcelain --untracked-files=no)" ] || terminar 1 cambio "rechazado: hay cambios sin confirmar en la carpeta"
[ -f .env.staging ] || terminar 1 cambio "rechazado: falta .env.staging"

if [ "$SIMULAR" = 1 ]; then
  [ ! -d "$CERROJO" ] || echo "(Ahora mismo hay otro sondeo en curso: una ejecución real no haría nada.)"
else
  if ! mkdir "$CERROJO" 2>/dev/null; then
    if [ -n "$(find "$CERROJO" -maxdepth 0 -mmin +"$CERROJO_VIEJO_MIN" 2>/dev/null)" ]; then
      echo "$(ahora) sondeo: cerrojo abandonado (más de $CERROJO_VIEJO_MIN min); se retira" >> "$REGISTRO"
      rm -rf "$CERROJO"
      mkdir "$CERROJO" 2>/dev/null || terminar 0 nunca "otro sondeo en curso"
    else
      terminar 0 nunca "otro sondeo en curso"
    fi
  fi
  echo $$ > "$CERROJO/pid"
  trap 'rm -rf "$CERROJO"' EXIT
fi

git fetch --quiet origin main || terminar 1 cambio "no se pudo consultar origin (git fetch falló)"
remoto=$(corto origin/main)
staging=$(version_de .env.staging)

if [ "$staging" = "$remoto" ]; then
  # Si falló un despliegue, ya se arregló (p. ej. a mano con infra/desplegar.sh staging)
  [ "$SIMULAR" = 1 ] || rm -f "$FALLIDO"
  terminar 0 nunca "sin cambios: staging ya está en $remoto"
fi
if [ -n "$staging" ] && git merge-base --is-ancestor origin/main "$staging" 2>/dev/null; then
  terminar 0 cambio "staging ($staging) va por delante de origin/main ($remoto): no se despliega"
fi
git merge-base --is-ancestor HEAD origin/main ||
  terminar 1 cambio "rechazado: main local tiene commits que no están en origin/main"
if [ "$(cat "$FALLIDO" 2>/dev/null)" = "$remoto" ]; then
  terminar 1 cambio "el despliegue de $remoto ya falló; se reintentará con el siguiente commit de main (o a mano: infra/desplegar.sh staging)"
fi

if [ "$SIMULAR" = 1 ]; then
  terminar 0 nunca "haría: git pull --ff-only ($(corto HEAD) → $remoto) e infra/desplegar.sh staging (staging: ${staging:-sin versión} → $remoto)"
fi

git pull --ff-only --quiet origin main || terminar 1 cambio "rechazado: git pull --ff-only falló"
nueva=$(corto HEAD)
if infra/desplegar.sh staging > "$SALIDA" 2>&1; then
  rm -f "$FALLIDO"
  terminar 0 siempre "staging ${staging:-sin versión} → $nueva: desplegado"
else
  codigo=$?
  echo "$nueva" > "$FALLIDO"
  terminar 1 siempre "staging ${staging:-sin versión} → $nueva: falló el despliegue (código $codigo; salida en .git/processiq-sondeo.salida)"
fi
