# 15. Observabilidad propia en la base, sin servicios en la nube

**Estado:** vigente mientras no haya presupuesto. **Fecha:** 26-sep-2026.

## Contexto
La arquitectura (§11) prevé Sentry con alertas. No hay presupuesto para servicios en la nube y el servidor es un PC propio.

## Decisión
- **Errores:** los errores inesperados de la API (500), de la web, del editor en modo proyecto y del worker se guardan en la tabla `errores`. Se agrupan por huella y se purgan a los 30 días. Los 500 devuelven una referencia (`X-Request-Id`).
- **Latidos:** el worker deja su latido en la tabla `latidos`.
- **Pantalla «Sistema» para administradores:** junta API, base de datos, worker, cola de IA, copias de seguridad, disco y errores, y calcula avisos. Un punto rojo en el menú indica problemas.
- **Logs de Docker:** JSON con rotación (10 MB × 5 por servicio).

## Consecuencias
- No hay alertas activas (correo o chat): alguien tiene que mirar «Sistema». Con un servidor de correo o un webhook se pueden añadir sin cambiar el modelo.
- Pasar a Sentry u otro servicio es añadir un transporte más en `observabilidad.ts` (API) y `shell/observabilidad.ts` (web).
