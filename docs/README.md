# Documentación de ProcessIQ

Mapa de toda la documentación, ordenada por quién la necesita. Todo está en español.

## Si usas ProcessIQ

| Documento | Qué encuentras |
|---|---|
| [Manual de uso](manual/README.md) | Acceso, proyectos y roles, procesos y revisiones, el editor, la IA, exportar e importar, administración y preguntas frecuentes |
| [Glosario](glosario.md) | Términos de negocio (BPMN, As-Is/To-Be, pains, Ficha, Playbook MBB…) y de la plataforma |

## Si desarrollas en ProcessIQ

Empieza por [cómo trabajamos en equipo](equipo/README.md) y [cómo preparar tu entorno](tecnica/desarrollo.md).

**Trabajo en equipo**

| Documento | Qué encuentras |
|---|---|
| [equipo/README.md](equipo/README.md) | Roles, ciclo de una iniciativa, reglas para no colisionar y qué obliga GitHub |
| [equipo/convenciones.md](equipo/convenciones.md) | Nombres, ramas, commits, PR, migraciones, ADR, CHANGELOG y dependencias |
| [equipo/nueva-iniciativa.md](equipo/nueva-iniciativa.md) | Un módulo nuevo dentro de la plataforma, con sus puntos de registro |
| [equipo/nueva-aplicacion.md](equipo/nueva-aplicacion.md) | Cuándo y cómo crear una app aparte o un repositorio propio |
| [equipo/trabajar-con-claude.md](equipo/trabajar-con-claude.md) | Claude Code en este repositorio: preparación, copias de trabajo, prompts y límites |
| [iniciativas/README.md](iniciativas/README.md) | Registro de iniciativas y reservas: quién usa cada ruta, tabla, variable o puerto |

**Referencia técnica**

| Documento | Qué encuentras |
|---|---|
| [arquitectura.md](arquitectura.md) | La arquitectura objetivo, el punto de partida, la etapa actual en servidor propio y la hoja de ruta por fases |
| [tecnica/desarrollo.md](tecnica/desarrollo.md) | Entorno de desarrollo paso a paso, flujo diario y problemas frecuentes |
| [tecnica/paquetes.md](tecnica/paquetes.md) | Cada paquete del monorepo: para qué sirve, qué exporta, de qué depende y sus pruebas |
| [tecnica/web.md](tecnica/web.md) | La aplicación web: el editor (portado del MVP), el modo proyecto y el shell de React |
| [tecnica/api.md](tecnica/api.md) | Referencia completa de la API: cada endpoint con permisos, cuerpo, respuesta y errores |
| [tecnica/modelo-de-datos.md](tecnica/modelo-de-datos.md) | Tablas, relaciones, ciclos de vida, migraciones y el contenido JSON de una revisión |
| [tecnica/ia.md](tecnica/ia.md) | La IA: editor libre e IA en el servidor, cola, reintentos, costes e intermediario |
| [tecnica/seguridad.md](tecnica/seguridad.md) | Cuentas, sesión, CSRF, permisos, secretos, privacidad y lo que aún no está cubierto |
| [tecnica/pruebas.md](tecnica/pruebas.md) | Unitarias, integración, fidelidad frente al MVP, E2E y la CI paso a paso |
| [tecnica/configuracion.md](tecnica/configuracion.md) | Todas las variables de entorno, por servicio y entorno |
| [adr/](adr/README.md) | Decisiones de arquitectura (ADR 12 a 18; las 1 a 11 están resumidas en la arquitectura) |
| [lecciones-aprendidas.md](lecciones-aprendidas.md) | Errores ya cometidos en este repositorio y la regla que los evita |

## Si operas el servidor

| Documento | Qué encuentras |
|---|---|
| [runbooks/servidor-local.md](runbooks/servidor-local.md) | Qué corre, usuarios, copias de seguridad y restauración, puesta en marcha y operación diaria |
| [runbooks/despliegue.md](runbooks/despliegue.md) | Staging, promoción a producción, reversión y limpieza de imágenes |
| [runbooks/rotacion-secretos.md](runbooks/rotacion-secretos.md) | Cómo rotar cada secreto |
| [runbooks/incidente-ia.md](runbooks/incidente-ia.md) | Qué hacer si la IA falla o se dispara el gasto |

## Historia

| Documento | Qué encuentras |
|---|---|
| [mvp/HANDOFF.md](mvp/HANDOFF.md) | Bitácora del MVP 3.8.9: decisiones, regresiones y rarezas del layout, el PPTX y la IA |
| [mvp/PLAYBOOK_MBB.md](mvp/PLAYBOOK_MBB.md) | Playbook MBB de diagramación que aplica el linter |
| [mvp/README-mvp.md](mvp/README-mvp.md) | README original del MVP |
| [fase1-divergencias.md](fase1-divergencias.md) | Diferencias intencionales con el MVP |
| [../CHANGELOG.md](../CHANGELOG.md) | Cambios por versión |

## Cómo se mantiene

- La documentación cambia en el mismo PR que el código que describe.
- Cada documento técnico lleva su fecha de actualización y una sección de puntos por confirmar: lo que el código hace distinto de lo previsto o lo que falta decidir.
- Las decisiones duraderas van a una ADR; los errores que pueden repetirse, a las lecciones aprendidas.
