# 12. Cuentas locales mientras no haya registro en Entra ID

**Estado:** vigente, temporal. **Fecha:** 25-sep-2026.

## Contexto
La arquitectura (ADR 8) prevé iniciar sesión con Entra ID por OIDC. El registro de la aplicación depende de TI y todavía no existe. El equipo necesita usar la plataforma ya.

## Decisión
Cuentas locales (correo y contraseña) administradas en la propia plataforma:
- **Contraseñas:** scrypt (N=2^15). Toda alta y todo restablecimiento generan una contraseña temporal que se muestra una sola vez y que el usuario debe cambiar al entrar.
- **Sesión:** cookie `httpOnly`, `Secure` y `SameSite=Lax`. En la base solo se guarda el hash del token.
- **Protecciones:** límite de intentos (10 cada 15 minutos, por correo y por IP) y comprobación de `Origin` en las escrituras.
- **Primer administrador:** se crea por línea de comandos (`dist/cli.js crear-usuario`); el resto, desde la plataforma.

## Consecuencias
- Cuando exista Entra ID, **la sesión no cambia**: solo cambia cómo se obtiene. Se añade el inicio con OIDC y las cuentas locales quedan como respaldo o se desactivan.
- Recuperar una contraseña requiere a un administrador: no hay servidor de correo.
