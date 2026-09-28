# Seguridad

## Cómo informar de una vulnerabilidad

**No abras un issue público.** Usa el reporte privado de GitHub: pestaña **Security** del repositorio → **Report a vulnerability**. Solo lo ven los responsables del proyecto.

Incluye, si puedes:
- qué parte afecta (API, web, editor, intermediario de IA, infraestructura);
- cómo reproducirlo, paso a paso;
- qué impacto crees que tiene;
- versión o commit, si lo sabes.

Respondemos en cuanto podamos, confirmamos si es reproducible y te avisamos cuando esté corregido.

## Alcance

- El código de este repositorio y la plataforma desplegada con él (`https://mbc.asissoft.com` y `https://staging.mbc.asissoft.com`).
- El MVP (`procesos.mbc-latam.com`) vive en otro repositorio y queda fuera de este reporte.

No hagas pruebas que degraden el servicio, accedan a datos de otras personas o gasten la IA de la organización. Usa tu propio entorno de desarrollo (`docs/tecnica/desarrollo.md`), con sus cuentas de prueba.

## Cómo está protegida la plataforma

El modelo completo está en [docs/tecnica/seguridad.md](docs/tecnica/seguridad.md). En resumen:
- **Cuentas:** locales con contraseña scrypt, sesión por cookie `httpOnly` y protección CSRF por origen.
- **Permisos:** por organización y por proyecto, comprobados en cada endpoint.
- **IA:** la clave de Anthropic solo vive en el servidor, el cliente nunca envía prompts y hay topes de gasto.
- **Repositorio sin secretos:** los secretos no están en el repositorio y el escaneo de secretos de GitHub bloquea el push que los contenga ([ADR 18](docs/adr/0018-repositorio-publico.md)).
