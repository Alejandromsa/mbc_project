# Convenciones

Todo en **español**: código, identificadores, comentarios, textos de interfaz, documentación, commits y PR, igual que el núcleo.

## Clave de la iniciativa

Una o dos palabras en minúsculas, sin tildes ni eñes, unidas por guion: `portafolio`, `portal-cliente`. Se reserva en el [registro](../iniciativas/README.md) y de ella salen todos los nombres de la iniciativa.

No se pueden usar como clave las rutas y ámbitos del núcleo: `api`, `ia`, `admin`, `proyectos`, `p`, `proceso`, `entrar`, `clave`, `importar`, `plataforma`, `nucleo`, `fix`, `docs`, `reserva`.

## Nombres que salen de la clave

| Qué | Formato | Ejemplo con `portal-cliente` |
|---|---|---|
| Carpeta en la API | `apps/api/src/modulos/<clave>/` | `apps/api/src/modulos/portal-cliente/` |
| Carpeta en la web | `apps/web/src/modulos/<clave>/` | `apps/web/src/modulos/portal-cliente/` |
| Rutas de la API | `/api/<clave>/…` | `/api/portal-cliente/enlaces` |
| Rutas del shell | `/proyectos/<clave>/…` | `/proyectos/portal-cliente/enlaces` |
| Tablas y tipos enumerados | `<clave con _>_<nombre>` | `portal_cliente_enlaces` |
| Canales `LISTEN/NOTIFY` | `<clave con _>_<evento>` | `portal_cliente_comentario` |
| Acciones de auditoría | `<clave>.<entidad>.<acción>` | `portal-cliente.enlace.alta` |
| Códigos de error (`ErrorHttp`) | MAYÚSCULAS con prefijo | `PORTAL_CLIENTE_ENLACE_CADUCADO` |
| Variables de entorno | `<CLAVE CON _>_<NOMBRE>` | `PORTAL_CLIENTE_DIAS_ENLACE` |
| Claves de `localStorage` | `processiq.<clave>.<nombre>` | `processiq.portal-cliente.filtro` |
| Clases CSS | `.<clave>-<nombre>` | `.portal-cliente-tarjeta` |
| Pruebas E2E | `pruebas/e2e/<clave>.spec.mjs` | `pruebas/e2e/portal-cliente.spec.mjs` |
| Paquete nuevo (solo si hace falta) | `packages/<clave>/`, `@processiq/<clave>` | `@processiq/portal-cliente` |
| Ficha | `docs/iniciativas/<clave>.md` | `docs/iniciativas/portal-cliente.md` |

Los nombres del núcleo que ya existen no llevan prefijo (`proyectos`, `/api/ia`, `catalogo.kpi.alta`…). Están listados en el registro.

## Ramas

| Rama | Para |
|---|---|
| `<clave>/<tema>` | Un incremento de una iniciativa: `portafolio/tablero-cliente` |
| `<clave>/reserva` | El PR de reserva |
| `plataforma/<tema>` | Cambios del núcleo, aunque los pida una iniciativa |
| `fix/<tema>` | Correcciones |
| `docs/<tema>` | Solo documentación general |

- Salen de `main` actualizado y viven días, no semanas.
- Se borran después de fusionar el PR.
- **PR apilados** (uno sobre la rama de otro): antes de fusionar el de abajo, cambiar la base del de arriba a `main` (`gh pr edit <n> --base main`) y no borrar ramas hasta fusionar toda la pila. Si se borra antes, GitHub cierra los PR que dependían de ella (lección 22f).

## Commits

`<Ámbito>: <qué cambia>`, en español y en una línea. El ámbito es la clave de la iniciativa o el área del núcleo (`API`, `Shell`, `Editor`, `Infra`, `CI`, `Docs`, `Lecciones`).

```text
Portafolio: tablero de procesos por cliente
API: exporta pedir() para los módulos del shell
```

- Un commit es un cambio con sentido. No se mezclan cambios de formato con cambios de lógica.
- Si el commit lo hace Claude, deja su línea `Co-Authored-By`: así queda a la vista qué se hizo con IA.

## Pull requests

- La plantilla (`.github/pull_request_template.md`) se rellena entera. El título sigue el formato de los commits.
- Base `main`. Un PR por incremento, idealmente de menos de 400 líneas sin contar pruebas.
- **Revisión:**
  - de plataforma, si toca el núcleo o un punto de registro;
  - de otra persona del equipo de la iniciativa, en lo demás.
  - Nadie aprueba su propio PR de núcleo.
- Se fusiona con *merge commit* y después se borra la rama.

## Migraciones de la base

Todas las tablas están en `packages/db/src/esquema.ts` y las migraciones en `packages/db/migraciones/` (drizzle).

1. **Tu sección, al final** de `esquema.ts`, con un comentario de cabecera `// ===== <clave> =====`. Tablas y tipos con tu prefijo.
   - Las filas que pertenecen a un proyecto o a una organización llevan su clave foránea con `onDelete: 'cascade'`.
   - Nada de columnas nuevas en tablas del núcleo: eso es un PR de plataforma.
2. **La migración se genera al final del PR**, después de traer `main`, y se revisa el SQL:
   ```bash
   pnpm --filter @processiq/db generar --name <clave con _>_<tema>
   ```
3. **Si `main` recibe otra migración después de generar la tuya, regenera la tuya.**

   Por qué: drizzle solo aplica las migraciones cuya marca de tiempo (`when` en `meta/_journal.json`) es posterior a la última aplicada en la base. Si tu migración conserva una marca más antigua que otra ya desplegada, **staging y producción la saltan sin avisar**. Las pruebas no lo detectan, porque siempre parten de una base vacía.

   Cómo, con `merge` (no con `rebase`, que invierte `--ours` y `--theirs`):
   ```bash
   git fetch origin && git merge origin/main
   # Git marca conflicto en migraciones/meta/: te quedas con lo de main y quitas tu migración
   git checkout --theirs -- packages/db/migraciones/meta/_journal.json packages/db/migraciones/meta/<NNNN>_snapshot.json
   git rm packages/db/migraciones/<NNNN>_<tu_migracion>.sql
   # en esquema.ts conservas las dos secciones; después generas de nuevo
   pnpm --filter @processiq/db generar --name <clave con _>_<tema>
   git add packages/db && git commit
   ```
4. **Compatibles con la versión anterior**: se añaden tablas y columnas; borrar o renombrar se hace en un despliegue posterior, cuando ya ningún código lo usa. Así se puede revertir con `infra/desplegar.sh produccion <anterior>`.
5. **Nunca se edita una migración ya fusionada en `main`.**
6. **Pruebas:** `vaciar()` (`apps/api/src/pruebas/entorno.ts`) vacía las tablas del núcleo con `cascade`, así que las tuyas que dependen de proyectos u organizaciones se vacían solas. Las que no dependan de ellas se vacían en tus propias pruebas; no se añaden a `vaciar()`.

## Decisiones de arquitectura (ADR)

- Se escribe una cuando la decisión dura: tablas compartidas, una dependencia nueva de peso, un servicio o contenedor nuevo, un cambio del modelo de dominio, una excepción de seguridad.
- **Número:** el siguiente libre según el registro, reservado en el PR de reserva o en uno de plataforma. Si al traer `main` otra ya usa tu número, renumeras la tuya (cede quien llega segundo) y actualizas `docs/adr/README.md`.
- Formato: el de las existentes (contexto, decisión, alternativas, consecuencias). Una decisión sustituida no se borra: se marca «Sustituida por N».

## Versiones y CHANGELOG

- Las iniciativas **no cambian** las versiones de los `package.json`. Las fija el responsable de operación al publicar.
- Cada PR con algo visible para el usuario añade una línea bajo `## Sin publicar` en `CHANGELOG.md`, empezando por la clave: `- **portafolio:** tablero por cliente.` Al publicar, el responsable convierte esa sección en la versión nueva.
- `CHANGELOG.md` y `docs/lecciones-aprendidas.md` son de solo añadir. Si hay conflicto, se conservan las dos entradas.

## Dependencias

- Un solo lockfile y una sola versión de cada librería en todo el monorepo.
- Una dependencia nueva se justifica en el PR. Si es grande o de uso general, necesita ADR y a plataforma.
- `pnpm audit --prod --audit-level=high` debe seguir en verde (excepciones en la ADR 17).
- Nada se carga desde un CDN: se instala por npm.
- **Nada de servicios nuevos en la nube** (no hay presupuesto): ni SaaS de monitorización, ni colas, ni almacenamiento externo.

## Documentación

| Qué | Dónde | Quién |
|---|---|---|
| Objetivo, alcance, zonas, incrementos y decisiones de la iniciativa | Su ficha, `docs/iniciativas/<clave>.md` | Equipo de la iniciativa |
| Reglas y trampas de un módulo (las lee Claude al trabajar ahí) | `CLAUDE.md` dentro de la carpeta del módulo | Equipo de la iniciativa |
| Arquitectura, ADR, runbooks, estas guías, `CLAUDE.md` raíz | `docs/`, raíz | Plataforma (o con su revisión) |
| Errores que pueden repetirse en todo el repositorio | `docs/lecciones-aprendidas.md` (qué pasó → regla) | Cualquiera |
