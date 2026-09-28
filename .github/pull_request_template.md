## Qué cambia

<!-- Una o dos frases. Iniciativa: `<clave>` (ficha: docs/iniciativas/<clave>.md), o núcleo. -->

## Cómo se probó

<!-- Pruebas añadidas y qué se revisó a mano (capturas si hay pantallas nuevas o cambiadas). -->

## Lista

- [ ] Solo cambian las zonas de la iniciativa; fuera de ellas, solo líneas añadidas en los puntos de registro (docs/equipo/nueva-iniciativa.md)
- [ ] Los nombres nuevos están reservados en docs/iniciativas/README.md
- [ ] Migración generada después de traer `main`, compatible con la versión anterior y con el SQL revisado (o no hay migración)
- [ ] En verde: `pnpm fronteras`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`; y `pnpm fidelidad` si toca `apps/web/src/app/` o `packages/`
- [ ] Sin datos de clientes ni secretos (tampoco en capturas)
- [ ] Ficha y `CHANGELOG.md` («Sin publicar») al día
- [ ] Si toca el núcleo o un punto de registro: revisión de plataforma
