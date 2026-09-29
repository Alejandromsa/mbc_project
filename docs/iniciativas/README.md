# Registro de iniciativas

Única fuente de quién usa qué. Antes de usar un nombre (ruta, tabla, variable de entorno, puerto, clave del navegador, número de ADR), se reserva aquí en un PR `Reserva: <clave>` ([cómo](../equipo/README.md#ciclo-de-una-iniciativa)).

- Gana la reserva que se fusiona primero. Si al traer `main` hay conflicto en este archivo, alguien reservó antes: elige otro nombre.
- Al cambiar de estado, se actualiza la fila en el mismo PR que lo provoca.
- Estados: `reservada` → `en desarrollo` → `en producción` → `retirada`.

## Iniciativas

| Clave | Nombre | Responsable | Tipo | Estado | Ficha |
|---|---|---|---|---|---|
| `nucleo` | ProcessIQ: editor, proyectos, revisiones, IA en el servidor, catálogos, observabilidad, importación | Plataforma (@Alejandromsa) | Núcleo | en producción | [arquitectura](../arquitectura.md) |
| `portafolio` | Portafolio de procesos por cliente e indicadores | @Alejandromsa (agente) | Módulo | en desarrollo | [portafolio.md](portafolio.md) |
| `conocimiento` | Búsqueda sobre entregables y comparativo APQC | @Alejandromsa (agente) | Módulo | en desarrollo | [conocimiento.md](conocimiento.md) |

## Propuestas sin reservar

Salen de la fase 4 de `docs/arquitectura.md` §13. Para tomar una, se reserva como cualquier otra.

| Propuesta | Tipo previsto | Nota |
|---|---|---|
| Comentarios y revisión por invitados externos (enlace de solo lectura con caducidad) | Módulo | Toca la sesión: las rutas públicas son del núcleo |
| Colaboración en tiempo real | Núcleo | Toca el editor y el guardado de revisiones |
| Interfaz en inglés | Núcleo | Toca todas las pantallas; el editor está cubierto por la fidelidad |

## Reservas

Todo lo que ya usa el núcleo está aquí, para que nadie lo reutilice. Al reservar, se añaden filas con la clave de la iniciativa.

### Rutas

| Ruta | Dueño |
|---|---|
| `/` (editor, también con `?proceso=` y `?revision=`), `/assets/`, `/vendor/` | `nucleo` |
| `/proyectos/` y, dentro, `/entrar`, `/clave`, `/importar`, `/p/…`, `/proceso/…`, `/admin/…` | `nucleo` |
| `/ia/*` (intermediario de IA) | `nucleo` |
| `/api/salud`, `/api/sesion`, `/api/usuarios`, `/api/directorio`, `/api/proyectos`, `/api/procesos`, `/api/revisiones`, `/api/auditoria`, `/api/ia`, `/api/catalogos`, `/api/sistema`, `/api/errores` | `nucleo` |
| `/api/portafolio/…`, `/proyectos/portafolio/…` | `portafolio` |
| `/api/conocimiento/…`, `/proyectos/conocimiento/…` | `conocimiento` |

### Base de datos

| Nombre | Tipo | Dueño |
|---|---|---|
| `organizaciones`, `usuarios`, `sesiones`, `proyectos`, `miembros_proyecto`, `procesos`, `revisiones`, `auditoria`, `ejecuciones_ia`, `kpis`, `verbos_playbook`, `temas_pptx`, `plantillas_proceso`, `errores`, `latidos` | Tablas | `nucleo` |
| `rol_organizacion`, `rol_proyecto`, `estado_revision`, `tipo_ejecucion_ia`, `estado_ejecucion_ia`, `tipo_verbo`, `origen_error` | Tipos enumerados | `nucleo` |
| `ia_cola`, `ia_ejecucion` | Canales `LISTEN/NOTIFY` | `nucleo` |
| `portafolio_…` | Tablas y tipos | `portafolio` |
| `conocimiento_…` | Tablas y tipos | `conocimiento` |
| `pg_trgm`, `unaccent` | Extensiones de Postgres | `conocimiento` (las puede usar cualquiera) |

### Navegador

| Nombre | Tipo | Dueño |
|---|---|---|
| `piq_sesion` | Cookie | `nucleo` |
| `processiq.v1`, `processiq.ui`, `processiq.ai`, `processiq.ia.costes`, `processiq.proceso.<id>`, `processiq.abriendo`, `processiq.importacion.descartado` | `localStorage` | `nucleo` |

### Variables de entorno

Todas las de `.env.example`, `.env.dev.example`, `.env.staging.example` y las de los `environment:` de `docker-compose.yml` son de `nucleo`. Cada iniciativa usa solo las de su prefijo (`<CLAVE>_…`).

### Puertos

| Puerto | Uso | Dueño |
|---|---|---|
| 443 | Caddy (servidor) | `nucleo` |
| 5432 | Postgres nativo del PC servidor (no usar) | — |
| 5440 | Postgres de desarrollo | `nucleo` |
| 5173, 4173 | Vite (desarrollo y vista previa) | `nucleo` |
| 8787 | Intermediario de IA en desarrollo | `nucleo` |
| 8790 | API en desarrollo | `nucleo` |
| 4401, 4402 | Pruebas de fidelidad | `nucleo` |
| 4480, 8792, 8793 | Pruebas E2E | `nucleo` |

### Servidor

| Nombre | Tipo | Dueño |
|---|---|---|
| `web`, `api`, `worker`, `postgres`, `respaldo`, `intermediario`, `postgres-dev` | Servicios de `docker-compose.yml` | `nucleo` |
| `processiq`, `processiq-staging` | Proyectos de Compose | `nucleo` |
| `processiq-borde` | Red Docker | `nucleo` |
| `mbc.asissoft.com`, `staging.mbc.asissoft.com` | Dominios | `nucleo` |

### Decisiones de arquitectura (ADR)

| Número | Dueño |
|---|---|
| 1 a 18 | `nucleo` (ver `docs/adr/README.md`) |
| 19 | `conocimiento` (extensiones de Postgres para la búsqueda) |
| **Siguiente libre: 20** | — |

Al reservar un número, se añade su fila y se sube el «siguiente libre».
