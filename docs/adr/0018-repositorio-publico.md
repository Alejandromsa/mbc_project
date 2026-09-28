# 18. Repositorio público

**Estado:** vigente. **Fecha:** 28-sep-2026.

## Contexto

- El repositorio nació privado. `docs/arquitectura.md` §5 decía que los prompts, la lógica del servidor y los fixtures de evaluación no debían estar en un repositorio público.
- En el plan gratuito de GitHub, un repositorio privado no tiene protección de ramas ni revisión por `CODEOWNERS`. Con varios equipos trabajando a la vez (`docs/equipo/`), esas protecciones hacen falta.
- El proyecto decide publicarlo.

## Decisión

- **El repositorio es público y no tiene licencia**, es decir, todos los derechos reservados: se puede leer, pero no reutilizar sin permiso. Elegir una licencia abierta sería una decisión legal de MBC.
- **Antes de publicar se auditó el historial completo:**
  - no contenía secretos: se compararon los valores reales de los `.env` y el token de DNS con todos los objetos del historial, y se buscaron patrones de claves;
  - no contenía documentos de clientes; los ejemplos del MVP ya eran públicos en su propio repositorio.
- **El historial se reescribió** para usar el correo `noreply` de GitHub del autor y para quitar los datos de red del servidor.
- **Se publicó como repositorio nuevo con el mismo nombre.** Los PR de GitHub guardan sus commits originales, así que publicar el repositorio anterior habría dejado visibles esos datos. El anterior sigue **privado y archivado** como `mbc_project-historico`, con los PR 1 a 10 y sus revisiones.
- **Protecciones activadas**, que GitHub da gratis a los repositorios públicos:
  - `main` solo acepta cambios por PR, con la CI (`verificar`) en verde y la rama al día con `main`;
  - escaneo de secretos con bloqueo del push;
  - avisos de Dependabot;
  - reporte privado de vulnerabilidades (`SECURITY.md`).
- **Siguen fuera del repositorio:** los secretos (`.env*`), los procesos reales de cliente (`bench/fixtures/`), los datos del servidor (`*.local.md`) y cualquier dato de clientes.

## Alternativas descartadas

- **Publicar el repositorio existente tras reescribir `main`:** los PR 1 a 10 seguirían mostrando los commits originales. Solo el soporte de GitHub puede purgarlos, y sin plazo garantizado.
- **Seguir privado y pagar GitHub Pro o Team:** lo descartó el proyecto.

## Consecuencias

- Los prompts de `packages/ia`, la API y la infraestructura quedan a la vista. La seguridad de la IA no dependía de ocultarlos:
  - la clave de Anthropic solo existe en el servidor;
  - el cliente nunca envía prompts;
  - hay presupuesto mensual y límite por persona.
- **Nadie de fuera puede escribir en el repositorio.** Los PR desde forks ejecutan la CI sin secretos (la CI no usa ninguno).
- **No se usan runners propios de GitHub Actions** (*self-hosted*): en un repositorio público, un PR desde un fork podría ejecutar código en el servidor. Si se automatiza el despliegue, será el servidor quien consulte `main`, no GitHub quien le envíe trabajos.
- **Los identificadores de commit cambiaron.** La versión desplegada `40f0bd53` (26-sep-2026) corresponde en el historial nuevo al commit que indica `CHANGELOG.md`. Las imágenes Docker siguen etiquetadas con el identificador antiguo, así que la reversión funciona igual.
- Los commits nuevos deben usar el correo `noreply` de GitHub (`git config user.email`), no uno personal.
