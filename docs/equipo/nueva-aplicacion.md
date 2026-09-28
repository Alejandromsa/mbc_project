# Nueva aplicación o repositorio propio

Por defecto, una iniciativa es un **módulo** dentro de la plataforma ([nueva-iniciativa.md](nueva-iniciativa.md)). Una app aparte o un repositorio propio suman cosas que operar, así que hay que justificarlos en la ficha y, en el caso de una app aparte, con una ADR.

## Módulo, app o repositorio propio

| Es un… | Cuando | Ejemplos |
|---|---|---|
| **Módulo** (lo normal) | Lo usan las mismas personas, con la misma sesión, dentro del flujo de proyectos y procesos | Tablero de portafolio, informes, un análisis nuevo |
| **App aparte en `apps/<nombre>/`** | Usa el modelo de procesos, pero tiene otros usuarios (p. ej. clientes externos) o debe desplegarse o escalar por separado | Portal donde el cliente revisa sus procesos |
| **Repositorio propio** | Es otro producto, con su base y su ciclo de versiones, o quien lo desarrolla no debe ver el resto del código (p. ej. un proveedor) | Radar de Prospectos, Pulse |

Criterio completo: `docs/arquitectura.md` §5. Ante la duda, módulo: pasar de módulo a app más adelante es mover una carpeta; lo contrario cuesta más.

## App aparte dentro del monorepo

Todo esto toca el núcleo (`infra/`, CI, despliegue): se hace con plataforma, en PR de plataforma, y con una ADR.

1. **Paquete** `apps/<nombre>/`:
   - `package.json` con `"name": "@processiq/<nombre>"`, `"private": true`, `"type": "module"` y los scripts `build`, `typecheck` y `test` (Turborepo y la CI los ejecutan solos);
   - dependencias del monorepo con `workspace:*`.

   Las apps pueden usar los paquetes; los paquetes nunca importan de una app (`pnpm fronteras`).
2. **Imagen**: `infra/<nombre>.Dockerfile`, con el mismo patrón que `infra/api.Dockerfile` (argumento `VERSION`).
3. **Servicio** en `docker-compose.yml`:
   - `image: processiq/<nombre>:${VERSION:-local}`;
   - `logging: *registro` (rotación de logs);
   - `restart: unless-stopped`;
   - `expose` del puerto interno, nunca `ports`: solo Caddy publica.

   Si tiene volúmenes o redes propias, revisar también `docker-compose.staging.yml`, porque staging los redefine.
4. **Despliegue**: añadir la imagen a la lista que comprueba `infra/desplegar.sh` al promover (`for imagen in web api intermediario`). Si no, producción podría arrancar sin ella.
5. **Entrada web**, en `infra/Caddyfile`:
   - **Ruta bajo el mismo dominio (recomendado):** `handle /<nombre>/* { reverse_proxy <servicio>:<puerto> }`. Comparte origen, así que comparte la sesión (`piq_sesion`) y puede preguntar a `/api/sesion` quién es el usuario.
   - **Subdominio (solo si hace falta):** necesita un registro DNS «solo DNS» en Cloudflare, la excepción de Netskope y su propia sesión (la cookie no se comparte).
6. **Variables de entorno**: con el prefijo de la clave, en `.env.example`, `.env.staging.example` y el `environment:` del servicio. El responsable de operación pone los valores en el servidor.
7. **CI**: el paso `docker compose build` ya construye todas las imágenes. Sus flujos llevan E2E como el resto.
8. **Runbook**: una sección en `docs/runbooks/servidor-local.md` con qué hace, cómo se ve su salud y qué hacer si falla.

## Repositorio propio

- Se integra con ProcessIQ **solo por su API**. Nunca comparte base de datos ni copia código del monorepo.
- Hoy faltan dos piezas, previstas en `docs/arquitectura.md` §5 («Integración con productos en otros repositorios»):
  - una API pública versionada (`/api/v1/…`) con su especificación;
  - credenciales por aplicación, nunca cuentas de usuario compartidas.

  Son trabajo de plataforma y van **antes** de que el otro repositorio dependa de ProcessIQ. Mientras no existan, pedir a plataforma que las priorice en lugar de improvisar un acceso.
- Código compartido entre productos (componentes visuales MBC, clientes de Pulse o de autenticación): paquetes versionados de un futuro repositorio `mbc-plataforma`, nunca copias.
- Igualmente se registra en `docs/iniciativas/README.md` (tipo «repositorio propio»), para que se sepa que existe y qué usa de ProcessIQ.
