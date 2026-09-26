# Runbook — rotación de secretos

Los secretos viven solo en `.env` (producción) y `.env.staging` (staging), nunca en el repositorio. Rotar cuando alguien con acceso deja el equipo, ante cualquier sospecha de filtración, y como mínimo una vez al año.

| Secreto | Dónde | Cómo rotar | Efecto |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | `.env` | Crear una clave nueva en console.anthropic.com (mismo workspace, con tope de gasto), pegarla, `docker compose up -d intermediario api worker` y **revocar la anterior** en la consola | Ninguno para los usuarios |
| `ACCESS_CODE` (código del equipo del editor libre) | `.env` | Generar uno nuevo (`node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"`), pegarlo y `docker compose up -d intermediario` | Quien use el editor libre con IA tendrá que poner el código nuevo (Ajustes de IA) |
| `POSTGRES_PASSWORD` | `.env` | Ver abajo: hay que cambiarla también dentro de la base | Unos segundos sin servicio |
| Contraseña de un usuario | Plataforma | Usuarios → «Restablecer contraseña» (o `dist/cli.js restablecer-clave`) | Se cierran sus sesiones y recibe una temporal |
| Sesiones de todos | Base | `docker compose exec postgres psql -U processiq -d processiq -c "delete from sesiones"` | Todos vuelven a entrar |
| Token de Cloudflare (edición de DNS) | Fuera del repositorio | En el panel de Cloudflare: crear uno nuevo con **Zone → DNS → Edit** solo para la zona y revocar el anterior | Ninguno |

## Cambiar `POSTGRES_PASSWORD`

```bash
NUEVA=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
docker compose exec -T postgres psql -U processiq -d processiq -c "alter user processiq with password '$NUEVA'"
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NUEVA/" .env
docker compose up -d api worker respaldo
unset NUEVA
```

Comprobar después «Sistema» (base de datos y worker en verde) y que la siguiente copia de seguridad se genera (`docker compose logs --tail 3 respaldo`).
