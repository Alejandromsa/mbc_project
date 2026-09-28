# Trabajo en equipo

Cómo sumar iniciativas y aplicaciones a ProcessIQ sin pisarse. Estas guías son para las personas del equipo y también para Claude Code: al empezar una sesión, pídele que las lea junto con la ficha de tu iniciativa ([trabajar-con-claude.md](trabajar-con-claude.md) tiene los prompts).

| Documento | Para qué |
|---|---|
| Este README | Roles, ciclo de una iniciativa y reglas para no colisionar |
| [convenciones.md](convenciones.md) | Nombres, ramas, commits, PR, migraciones, ADR y CHANGELOG |
| [nueva-iniciativa.md](nueva-iniciativa.md) | Paso a paso técnico de un módulo dentro de la plataforma (el caso normal) |
| [nueva-aplicacion.md](nueva-aplicacion.md) | Cuándo y cómo crear una app aparte o un repositorio propio |
| [trabajar-con-claude.md](trabajar-con-claude.md) | Claude Code en este repo: preparación, una copia por iniciativa, prompts y límites |
| [../iniciativas/README.md](../iniciativas/README.md) | **Registro:** qué iniciativas hay y quién usa cada nombre, ruta, tabla o puerto |
| [../iniciativas/_plantilla.md](../iniciativas/_plantilla.md) | Ficha de iniciativa |

## Roles

| Rol | Qué hace | Hoy |
|---|---|---|
| **Plataforma** | Dueña del núcleo: `packages/*`, la API común (sesión, permisos, auditoría, IA), el shell, el editor, `infra/`, la CI y estas guías. Revisa los PR que tocan el núcleo o un punto de registro y aprueba las reservas. | @Alejandromsa, hasta que se nombre el equipo (`docs/arquitectura.md` §15) |
| **Equipo de iniciativa** | Dueño de sus módulos, sus tablas y su ficha. | Ver el registro |
| **Responsable de operación** | Único que despliega en el servidor (staging y producción), crea cuentas, toca los `.env` del servidor y restaura copias. | @Alejandromsa |

## Ciclo de una iniciativa

1. **Clasificar.** ¿Módulo dentro de la plataforma (lo normal), app aparte dentro del monorepo o repositorio propio? El criterio está en [nueva-aplicacion.md](nueva-aplicacion.md).
2. **Reservar.** Un PR pequeño, `Reserva: <clave>`, que solo añade:
   - la ficha `docs/iniciativas/<clave>.md`, copiada de `_plantilla.md`;
   - la fila de la iniciativa y sus reservas en el registro (rutas, tablas, variables, puertos, número de ADR).

   Plataforma lo revisa y lo fusiona. **Gana la reserva que se fusiona primero.** Si otra ya tomó un nombre, Git marca el conflicto en el registro y se elige otro nombre antes de escribir código.
3. **Trabajar por incrementos.** Una rama por incremento (`<clave>/<tema>`) y PR pequeños que se fusionan pronto. Una rama que vive semanas acumula conflictos con todos los demás.
4. **Pull request** con la plantilla y la CI en verde. Si toca el núcleo o un punto de registro, necesita la revisión de plataforma.
5. **Fusión en `main`**, por una persona y una vez aprobado, con *merge commit* (así está la historia del repositorio).
6. **Despliegue:** lo hace el responsable de operación, siempre desde `main` ([runbook de despliegue](../runbooks/despliegue.md)).
7. **Cierre de cada incremento:** actualizar el estado en la ficha y en el registro. Las lecciones que valgan para todos van a `docs/lecciones-aprendidas.md`.

## Reglas para no colisionar

1. **Cada cosa tiene dueño.** Se trabaja dentro de las carpetas de la propia iniciativa. Fuera de ellas, solo en los *puntos de registro* ([lista](nueva-iniciativa.md#puntos-de-registro)) y solo añadiendo líneas.
2. **Reservar antes de usar un nombre** de tabla, ruta, variable de entorno, puerto, clave del navegador o número de ADR. El registro es la única fuente.
3. **Nada de cambios «de paso».** No se reformatea, reordena ni «mejora» código ajeno dentro de un PR de iniciativa. Si algo está mal, se abre un issue o un PR aparte para su dueño.
4. **El núcleo cambia por un PR propio.** Si la iniciativa necesita algo de `packages/`, del shell, del editor o de la API común, va en un PR separado (`plataforma/<tema>`), pequeño y revisado por plataforma, antes del PR que lo usa.
5. **Ningún módulo lee ni escribe las tablas de otro.** Pide los datos a través de lo que el otro módulo exporta en su `index.ts`. Las tablas del núcleo se leen con sus funciones (p. ej. `accesoProyecto`), no con SQL propio sobre ellas.
6. **La base solo crece.** Migraciones compatibles con la versión anterior, nunca editar una publicada, y se generan al final, después de traer `main` ([convenciones](convenciones.md#migraciones-de-la-base)).
7. **Traer `main` a menudo**: cada día que se trabaje y siempre antes de pedir revisión.
8. **`main` siempre desplegable.** Todo entra por PR con la CI en verde. Nadie hace push directo a `main` ni fuerza (`--force`) una rama ajena.
9. **Solo el responsable de operación despliega**, y siempre desde `main`. Staging no corre ramas: una rama con migraciones dejaría la base de staging en un estado que `main` no conoce.
10. **Nada de datos de clientes ni secretos en el repositorio**: tampoco en fichas, pruebas, capturas o mensajes de commit. El repositorio es privado, pero cualquier colaborador lee todo (GitHub no limita la lectura por carpeta).

## Qué obliga GitHub y qué es acuerdo

El repositorio es **público** (ADR 18): cualquiera puede leerlo, pero solo los colaboradores pueden escribir.

**Obligatorio (lo bloquea GitHub):**
- `main` solo acepta cambios por PR, sin push directo ni `--force`;
- el PR solo se fusiona con la CI (`verificar`) en verde y con la rama al día con `main`: si `main` avanzó, hay que traerla (y regenerar la migración si hace falta) antes de fusionar;
- el escaneo de secretos rechaza el push que contenga una clave reconocible.

La CI (`.github/workflows/ci.yml`) ejecuta en cada PR:
- auditoría de dependencias, fronteras entre paquetes, tipos y build;
- pruebas unitarias y de integración contra Postgres;
- fidelidad frente al MVP, E2E de la plataforma e imágenes Docker.

**Acuerdo del equipo (GitHub no lo impide):**
- la revisión de plataforma en los PR del núcleo: no hay aprobaciones obligatorias, porque hoy hay una sola persona con permiso de escritura;
- que solo el responsable de operación despliegue;
- los dueños de `.github/CODEOWNERS`, que se activarán cuando existan los equipos.

**Público significa público:** todo lo que se sube (código, fichas, capturas, mensajes de commit, comentarios de PR) lo puede leer cualquiera. Configura tu correo `noreply` de GitHub antes de tu primer commit (`git config user.email <id>+<usuario>@users.noreply.github.com`).
