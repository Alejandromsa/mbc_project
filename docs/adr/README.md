# Decisiones de arquitectura (ADR)

Cada decisión con consecuencias duraderas queda registrada: contexto, decisión, alternativas y consecuencias. Las ADR 1 a 11 son las de la arquitectura objetivo y están resumidas en la tabla de `docs/arquitectura.md` §14. Las siguientes se tomaron durante la fase 2, sobre el servidor propio.

| # | Decisión | Estado |
|---|---|---|
| 1–11 | Ver `docs/arquitectura.md` §14 | Vigentes |
| [12](0012-cuentas-locales.md) | Cuentas locales mientras no haya registro en Entra ID | Vigente (temporal) |
| [13](0013-cola-ia-en-postgres.md) | La cola de IA es la tabla de ejecuciones (sin pg-boss) | Vigente |
| [14](0014-catalogos-en-sitio.md) | Los catálogos de la organización se aplican reemplazando en sitio los del dominio | Vigente |
| [15](0015-observabilidad-propia.md) | Observabilidad propia en la base, sin servicios en la nube | Vigente (mientras no haya presupuesto) |
| [16](0016-staging-mismo-servidor.md) | Staging en el mismo servidor, detrás del Caddy de producción | Vigente (mientras no haya PaaS) |
| [17](0017-excepciones-auditoria-dependencias.md) | Excepciones de la auditoría de dependencias | Vigente; revisar en cada actualización |

Plantilla para una nueva: copiar cualquiera de las anteriores y numerar la siguiente. Una decisión que se sustituye no se borra: se marca «Sustituida por N».
