# Contribuir a ProcessIQ

ProcessIQ es un proyecto de MBC (Minsait Business Consulting). El repositorio es público para que se pueda leer, pero **no tiene licencia de uso**: todos los derechos reservados, y no se puede reutilizar el código sin permiso ([ADR 18](docs/adr/0018-repositorio-publico.md)).

## Si eres del equipo

Todo lo que necesitas está en [docs/equipo/](docs/equipo/README.md):

1. [Roles, ciclo de una iniciativa y reglas para no colisionar](docs/equipo/README.md).
2. [Convenciones](docs/equipo/convenciones.md): nombres, ramas, commits, PR, migraciones, ADR y CHANGELOG.
3. [Un módulo nuevo dentro de la plataforma](docs/equipo/nueva-iniciativa.md) o [una aplicación aparte](docs/equipo/nueva-aplicacion.md).
4. [Cómo trabajar con Claude Code](docs/equipo/trabajar-con-claude.md) en este repositorio.
5. [Registro de iniciativas](docs/iniciativas/README.md): antes de usar un nombre, resérvalo ahí.

Preparar el entorno: [docs/tecnica/desarrollo.md](docs/tecnica/desarrollo.md). Pruebas y CI: [docs/tecnica/pruebas.md](docs/tecnica/pruebas.md).

**Antes de tu primer commit**, configura tu correo `noreply` de GitHub para no publicar tu correo personal:

```bash
git config user.email "<id>+<usuario>@users.noreply.github.com"
```

## Si no eres del equipo

- **Errores o sugerencias:** abre un issue. No incluyas datos de clientes ni capturas con información real.
- **Vulnerabilidades:** nunca en un issue. Sigue [SECURITY.md](SECURITY.md).
- **Pull requests externos:** se leen, pero no garantizamos incorporarlos. Si es un cambio grande, abre antes un issue para hablarlo.
