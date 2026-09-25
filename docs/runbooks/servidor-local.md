# Runbook — servidor local (fase 1)

ProcessIQ corre en un PC propio con IP pública fija, en contenedores Docker. Es la etapa previa al PaaS descrito en `docs/arquitectura.md`: las imágenes son las mismas, así que migrar después no exige rediseñar.

## Qué corre

| Contenedor | Qué hace | Puerto |
|---|---|---|
| `web` (Caddy) | Sirve la web, obtiene y renueva el certificado HTTPS, enruta `/ia/*` al intermediario | 443 publicado |
| `intermediario` (Node) | Guarda la clave de Anthropic y reenvía las llamadas de IA del modo "Clave del equipo" | 8787, solo red interna |

En la fase 1 **no hay base de datos**: igual que en el MVP, el trabajo de cada consultor vive en su navegador (`localStorage`). Recomendar exportar a JSON lo importante.

## Datos del servidor actual

| | |
|---|---|
| IP pública | <IP-PUBLICA> |
| Salida a internet | Wi-Fi, IP fija <IP-LOCAL-DEL-SERVIDOR>, router <IP-DEL-ROUTER> |
| Dominio | `mbc.asissoft.com` (DNS de `asissoft.com` en Cloudflare) |
| Puerto 80 | Ocupado por IIS (W3SVC): por eso no hay redirección HTTP → HTTPS |
| Carpeta del repositorio | `C:\Users\usuario\processiq` |

## Puesta en marcha (una sola vez)

1. **DNS:** crear un registro **A** `mbc` → `<IP-PUBLICA>` en la zona `asissoft.com`, en modo **"Solo DNS" (nube gris)**. Con el proxy de Cloudflare activado (nube naranja) el certificado no se puede validar.
2. **Router (<IP-DEL-ROUTER>):** reenviar **TCP 443** externo → `<IP-LOCAL-DEL-SERVIDOR>:443`.
3. **Firewall de Windows** (PowerShell **como administrador**):
   ```powershell
   New-NetFirewallRule -DisplayName "ProcessIQ HTTPS (443)" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Any
   ```
4. **Clave de IA:** en `.env`, completar `ANTHROPIC_API_KEY` (creada en console.anthropic.com **dentro de un workspace**, con tope de gasto). `ACCESS_CODE` ya viene generado: es el código que se reparte al equipo.
5. **Arrancar:**
   ```bash
   docker compose up -d --build
   docker compose restart web   # fuerza un nuevo intento de certificado si el DNS se acaba de crear
   ```
6. **Verificar desde fuera de la red** (datos móviles):
   - `https://mbc.asissoft.com` carga la app con candado válido;
   - `https://mbc.asissoft.com/ia/health` responde `"configurado": true, "formatoClave": "ok"`.
7. **Docker Desktop:** activar *Start Docker Desktop when you sign in* y evitar que el PC entre en suspensión. Los contenedores se reinician solos (`restart: unless-stopped`), pero solo si Docker Desktop está en marcha.

## Cambiar de dominio

1. Editar `DOMINIO` en `.env`.
2. Crear el registro A del dominio nuevo → IP pública (modo "Solo DNS").
3. `docker compose up -d` — Caddy pide el certificado nuevo solo.

Nada más cambia: la web llama a la IA por su mismo origen (`/ia`) y el intermediario acepta `https://$DOMINIO` por defecto.

## Operación diaria

| Tarea | Comando (en la carpeta del repositorio) |
|---|---|
| Estado | `docker compose ps` |
| Logs | `docker compose logs -f web` · `docker compose logs -f intermediario` |
| Publicar una versión nueva | `git pull && docker compose up -d --build` |
| Rotar el código del equipo | editar `ACCESS_CODE` en `.env` → `docker compose up -d intermediario` |
| Parar todo | `docker compose down` (sin `-v`: conserva los certificados) |
| Probar en local sin tocar producción | `DOMINIO=localhost TLS_MODO=interno PUERTO_HTTPS=8443 ALLOWED_ORIGINS=https://localhost:8443 docker compose -p processiq-prueba up -d --build` |

El gasto de IA queda en el log del intermediario (`"evento":"gasto_ia"`). Si se configura `PULSE_URL`, también se reporta allí.

## Problemas conocidos

- **Red corporativa (Netskope):** bloquea los dominios "recién observados". Hasta que TI habilite `mbc.asissoft.com`, desde la red de Indra la app puede devolver 403 o un error de certificado. Fuera de esa red funciona.
- **El certificado no se emite:** `docker compose logs web | grep -i acme`.
  - `NXDOMAIN` → falta el registro DNS.
  - `connection refused` o `timeout` → falta el reenvío del router o la regla del firewall.
  - Caddy reintenta solo con espera creciente; `docker compose restart web` fuerza el intento.
- **Si se libera el puerto 80** (IIS detenido): se puede publicar también `80:80` en `docker-compose.yml` y quitar `auto_https disable_redirects` del `Caddyfile` para redirigir HTTP → HTTPS.
