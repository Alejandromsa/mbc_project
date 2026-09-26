# 16. Staging en el mismo servidor, detrás del Caddy de producción

**Estado:** vigente mientras no haya PaaS. **Fecha:** 26-sep-2026.

## Contexto
La arquitectura (§11) prevé staging y promoción de la misma imagen a producción. Solo hay un servidor, con un único puerto 443 abierto en el router.

## Decisión
- Staging es otro proyecto de Docker Compose (`processiq-staging`): mismos servicios e imágenes, volúmenes propios (base y copias aparte) y configuración en `.env.staging`.
- El Caddy de **producción** es la única puerta. Obtiene el certificado de `staging.<dominio>` y reenvía al Caddy de staging por una red Docker compartida (`processiq-borde`, alias `web-staging`). El de staging escucha HTTP interno y confía en el `X-Forwarded-For` de redes privadas.
- **Versiones:** las imágenes se etiquetan con el commit. `infra/desplegar.sh staging` construye y levanta; `infra/desplegar.sh produccion` arranca producción con **la misma imagen**, sin reconstruir. Revertir es promover la versión anterior.
- Las migraciones deben ser compatibles con la versión anterior, para poder revertir sin tocar la base.

## Consecuencias
- Staging comparte máquina con producción: una carga anómala en staging afecta a producción. Staging tiene topes de IA más bajos y una sola ejecución a la vez.
- Si se cae producción, staging tampoco es accesible (depende de su Caddy).
- En un PaaS, esto se sustituye por sus entornos; las imágenes y el script de promoción siguen valiendo como idea.
