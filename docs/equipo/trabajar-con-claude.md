# Trabajar con Claude Code en este repositorio

Cada persona trabaja con su propia sesión de Claude Code. Para que varias sesiones no se pisen, todas parten de los mismos documentos y siguen las mismas reglas.

## Qué lee Claude y cuándo

| Archivo | Cuándo lo lee | Para qué |
|---|---|---|
| `CLAUDE.md` (raíz) | Siempre, al iniciar la sesión | Contexto, comandos y reglas del núcleo y del trabajo en equipo |
| `CLAUDE.md` de una subcarpeta, p. ej. `apps/api/src/modulos/<clave>/CLAUDE.md` | Cuando lee archivos de esa carpeta | Reglas y trampas propias de un módulo |
| `CLAUDE.local.md` (raíz) | Siempre, pero solo en tu copia (está en `.gitignore`) | Tus notas personales para este repositorio |
| Estas guías, la ficha, las lecciones | **Solo si se lo pides** | Por eso los prompts de abajo lo piden explícitamente |

La memoria automática de Claude es personal y se queda en tu equipo. **Lo que deba saber todo el equipo va a los documentos del repositorio** (ficha, `CLAUDE.md` del módulo, lecciones), nunca solo a la memoria.

## Preparación (una vez)

1. Pide a plataforma acceso al repositorio `Alejandromsa/mbc_project` y clónalo.
2. Instala Node 22 o superior, pnpm 10, Docker Desktop y Git. En Windows, Claude usa Git Bash: revisa «Rarezas del entorno» en `CLAUDE.md`.
3. Prepara el entorno:
   ```bash
   pnpm install
   docker compose --profile dev up -d postgres-dev
   cp .env.dev.example .env.dev
   pnpm --filter @processiq/api semilla
   pnpm typecheck && pnpm test
   ```
   El detalle está en `README.md` y en el runbook `docs/runbooks/servidor-local.md` (sección «Desarrollo en el PC»).

## Una copia de trabajo por iniciativa

Dos sesiones de Claude nunca trabajan en la misma carpeta: cada una cambiaría la rama y los archivos de la otra. Para trabajar en paralelo (dos iniciativas, o dos incrementos), cada una va en su propia copia con `git worktree`:

```bash
git fetch origin
git worktree add ../processiq-portafolio -b portafolio/tablero-cliente origin/main
cd ../processiq-portafolio && pnpm install
claude
# al terminar y fusionar el PR:
git worktree remove ../processiq-portafolio
```

También sirve `claude --worktree <nombre>`: crea la copia en `.claude/worktrees/<nombre>/` sobre una rama `worktree-<nombre>`. Antes de abrir el PR, cambia el nombre de la rama a la convención (`git branch -m portafolio/tablero-cliente`).

**Lo que las copias comparten en el mismo PC:**

| Recurso | Qué pasa | Qué hacer |
|---|---|---|
| Postgres de desarrollo (puerto 5440) | Las pruebas de la API **borran y recrean** la base `processiq_pruebas` | Da a cada copia su base: `TEST_DATABASE_URL=postgres://processiq:processiq@localhost:5440/processiq_pruebas_<clave> pnpm --filter @processiq/api test` (se crea sola) |
| `pnpm e2e` | Usa puertos fijos (4480, 8792, 8793) y la base `processiq_e2e` | Una sola ejecución a la vez en cada PC |
| `pnpm fidelidad` | Usa los puertos 4401 y 4402 | Una sola ejecución a la vez en cada PC |
| `pnpm dev` y la API de desarrollo | Vite (5173) reenvía `/api` al 8790 y la API solo acepta el origen `http://localhost:5173` | Un solo entorno de desarrollo levantado a la vez en cada PC |

## Cómo empezar cada sesión

Copia el prompt que toque y completa lo que está entre `< >`.

**Empezar una iniciativa (solo la reserva, sin código):**

```text
Voy a empezar la iniciativa «<nombre>» (clave propuesta: <clave>). Objetivo: <qué problema resuelve y para quién>.
Lee CLAUDE.md, docs/equipo/README.md, docs/equipo/convenciones.md, docs/equipo/nueva-iniciativa.md,
docs/equipo/nueva-aplicacion.md y docs/iniciativas/README.md.
1. Propón si es módulo, app aparte o repositorio propio, con el criterio de nueva-aplicacion.md.
2. Comprueba en el registro que la clave y los nombres que necesita están libres.
3. Crea docs/iniciativas/<clave>.md desde _plantilla.md y añade la fila y las reservas en el registro.
4. En la rama <clave>/reserva, haz commit y abre el PR «Reserva: <clave>». No escribas código todavía.
```

**Retomar el trabajo:**

```text
Trabajo en la iniciativa <clave>. Lee CLAUDE.md, docs/equipo/convenciones.md, docs/equipo/nueva-iniciativa.md
y docs/iniciativas/<clave>.md. Trae main (git fetch origin && git merge origin/main) y dime si hay conflictos antes de seguir.
Hoy toca: <incremento>. Trabaja solo en las zonas de la ficha; si necesitas tocar algo fuera, para y dime qué y por qué.
```

**Preparar el PR:**

```text
Prepara el PR de este incremento: trae main; si main trajo otra migración, regenera la nuestra
(docs/equipo/convenciones.md, «Migraciones de la base»); pasa pnpm fronteras, pnpm typecheck, pnpm test y pnpm e2e
(y pnpm fidelidad si tocaste apps/web/src/app o packages); haz capturas de las pantallas nuevas y enséñamelas;
actualiza la ficha y CHANGELOG.md (Sin publicar); abre el PR con la plantilla. No lo fusiones.
```

**Necesito un cambio en el núcleo:**

```text
Para <clave> necesito <cambio> en <archivo o paquete del núcleo>. Hazlo en una rama plataforma/<tema> que salga de main,
mínima y con sus pruebas, y abre un PR para que lo revise plataforma. Después vuelve a la rama <clave>/<tema>.
```

## Lo que Claude no hace (ni tú)

- Fusionar PR o hacer push a `main`: el PR lo fusiona una persona después de la revisión.
- Desplegar (`infra/desplegar.sh`), tocar los `.env` del servidor o crear cuentas: es del responsable de operación.
- Editar una migración ya fusionada, `pruebas/fidelidad/referencia-mvp/` o las zonas de otra iniciativa.
- Subir datos de clientes, `bench/fixtures/`, secretos o capturas con datos reales.
- `git push --force` sobre ramas compartidas, u omitir comprobaciones (`--no-verify`).
- Crear servicios en la nube.

Estas reglas ya están en `CLAUDE.md`, pero conviene repetirlas en el prompt cuando la tarea se acerque a ellas. Si usas el modo que aprueba todo sin preguntar, las reglas de permisos de Claude Code no se aplican: úsalo solo en tu propia copia y nunca en la carpeta del servidor.

## Revisa lo que hace

- Lee el diff completo antes de cada commit (`git diff`), sobre todo en los puntos de registro.
- En las pantallas, pide capturas y míralas tú: las pruebas en verde no ven el diseño.
- Si Claude comete un error que puede repetirse, pídele que lo apunte: en `docs/lecciones-aprendidas.md` si vale para todo el repositorio, o en el `CLAUDE.md` de tu módulo si solo vale ahí.
