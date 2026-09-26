# Runbook — incidente de IA

Síntomas habituales: «la IA no responde», generaciones que no terminan, errores de IA en «Sistema» o un gasto que se dispara. Primero, mirar **«Sistema»** (worker y cola) y **«IA»** (últimas ejecuciones, con su error).

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Ejecuciones «En cola» que no avanzan; en «Sistema», «El worker no da señales» | Worker parado | `docker compose ps worker`; `docker compose logs --tail 50 worker`; `docker compose up -d worker`. Lo que estaba a medias vuelve solo a la cola |
| Todas fallan con «La clave de Anthropic del servidor no es válida (401)» | Clave revocada o mal copiada | Rotar la clave (`rotacion-secretos.md`) |
| Fallan con «Límite de uso alcanzado (429)» o «Error 529/Overloaded» | Límite de la cuenta o saturación de Anthropic | El worker reintenta solo (3 intentos). Si persiste: esperar, bajar `IA_CONCURRENCIA` o revisar los límites del workspace en la consola |
| «Se alcanzó el presupuesto mensual» | Tope de `PRESUPUESTO_IA_MENSUAL_USD` | Decisión de negocio: subirlo en `.env` y `docker compose up -d api`, o esperar al mes siguiente |
| Una persona no puede usar la IA | Su límite mensual (`LIMITE_IA_USUARIO_MENSUAL_USD`) | Igual que el anterior; en «IA» se ve cuánto gastó |
| Gasto anómalo | Uso excesivo o un bucle | En «IA», ver quién y qué. Parar el worker (`docker compose stop worker`) corta todo al momento: lo encolado queda esperando. Bajar el presupuesto antes de volver a arrancarlo |
| El proceso generado sale mal (sin actividades o incompleto) | Documento muy largo, o respuesta cortada | Regenerar con nivel «Actividad» o «Ejecutivo», o dividir el documento. Si fue «no se pudo interpretar ni reparar», el error está en «IA» |

## Cortar la IA por completo

```bash
docker compose stop worker        # IA de los proyectos
docker compose stop intermediario # IA del editor libre
```

La plataforma y el editor siguen funcionando, con el modo básico sin IA. Para volver: `docker compose start worker intermediario`.

## Después del incidente

Anotar en el registro del equipo: qué pasó, cuánto duró, el coste afectado (pantalla «IA») y qué se cambió.
