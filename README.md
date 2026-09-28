# ProcessIQ

Plataforma de diagramación, diagnóstico y reingeniería de procesos con BPMN 2.0, de MBC Business Consulting.

- **Arquitectura objetivo:** [docs/arquitectura.md](docs/arquitectura.md)
- **Servidor actual (PC propio, Docker):** [docs/runbooks/servidor-local.md](docs/runbooks/servidor-local.md)
- **Historia y lecciones del MVP:** [docs/mvp/HANDOFF.md](docs/mvp/HANDOFF.md)
- **Trabajo en equipo** (nuevas iniciativas o aplicaciones, convenciones, Claude Code): [docs/equipo/README.md](docs/equipo/README.md). Registro de iniciativas: [docs/iniciativas/README.md](docs/iniciativas/README.md)

## Estado

- **Fase 1 (fundaciones), terminada.** El MVP 3.8.9 (un único `app.js` de ~10.500 líneas) quedó portado a paquetes TypeScript con pruebas **sin cambiar su comportamiento**, salvo las diferencias registradas en [docs/fase1-divergencias.md](docs/fase1-divergencias.md): un fallo del MVP corregido y librerías servidas desde la propia app. Las pruebas de fidelidad lo demuestran en cada cambio.
- **Fase 2 (plataforma), en curso.**
  - Hecho:
    - Postgres y una API con cuentas locales, proyectos, procesos, revisiones versionadas con flujo de aprobación, auditoría y copias de seguridad diarias.
    - La plataforma web en `/proyectos/`: acceso, proyectos, miembros, revisiones, usuarios y auditoría.
    - El editor abre y guarda revisiones de un proyecto; sin proyecto, sigue igual que el MVP.
    - La IA en el servidor para los procesos de proyectos:
      - generación, pains y copiloto como trabajos en cola, con progreso en vivo, reintentos y coste por ejecución;
      - presupuesto mensual y pantalla de consumo.
    - Catálogos administrables: KPIs, verbos del Playbook y temas PPTX de cliente.
    - Observabilidad propia: errores, latidos y la pantalla «Sistema».
- **Fase 3 (corte), en curso:** importación asistida del trabajo que cada consultor tiene en su navegador. Hechos también los runbooks y staging.

## Estructura

```text
apps/
  web/            la app (Vite): el editor (src/app/, módulos ES) y la plataforma en /proyectos/ (src/shell/, React)
  api/            API de la plataforma (Node + Hono + Postgres): cuentas, proyectos, revisiones; worker de IA
  intermediario/  intermediario de IA (Node + Hono): guarda la clave de Anthropic
packages/
  db/             esquema de la base (Drizzle) y migraciones SQL
  dominio/        modelo, catálogos, validación del Playbook MBB, esquema v1 y migración
  motor/          auto-layout, ruteo, calidad, niveles de detalle
  bpmn/           import/export BPMN 2.0
  exportar/       PPTX, informe Word, Ficha de Proceso
  documentos/     lectura de Word/PDF/PPTX, intérprete básico de texto
  mining/         event logs -> proceso
  analitica/      simulador, cuello de botella, automatización, backlog, What-If
  ia/             prompts y cliente de Claude
pruebas/
  fidelidad/      compara la app nueva con el MVP 3.8.9 congelado (referencia-mvp/)
herramientas/     comprobación de fronteras entre paquetes
bench/            banco de calidad de layout y PPTX (fixtures reales fuera del repo)
infra/            Caddyfile y Dockerfiles
docs/             arquitectura, ADR, runbooks, trabajo en equipo (equipo/), registro de iniciativas (iniciativas/), lecciones y MVP
```

## Desarrollo

Requisitos: Node 22+, pnpm 10 y Docker Desktop.

```bash
pnpm install
pnpm dev             # web en http://localhost:5173 (con /ia → intermediario en :8787)
pnpm --filter @processiq/intermediario dev   # intermediario, lee ../../.env.dev (o ../../.env si no existe)
docker compose -f docker-compose.dev.yml up -d   # Postgres de desarrollo (127.0.0.1:5440, sin .env)
cp .env.dev.example .env.dev && pnpm --filter @processiq/api dev   # API en :8790 (/api desde la web)
pnpm --filter @processiq/api semilla   # cuentas de prueba por rol y proyectos de ejemplo (ver el runbook)
pnpm typecheck
pnpm test            # unitarias de los paquetes e integración de la API (necesita el Postgres de desarrollo)
pnpm fronteras       # dependencias permitidas entre paquetes
pnpm fidelidad       # la app frente al MVP: ejemplos, exports, interacciones, IA simulada (≈2,5 min)
pnpm e2e             # plataforma de punta a punta: acceso, proyectos, editor, revisiones (necesita el Postgres de desarrollo)
```

## Despliegue en el servidor

Producción (`https://mbc.asissoft.com`) y staging (`https://staging.mbc.asissoft.com`) corren en el mismo servidor. Cada versión pasa primero por staging y se promueve la misma imagen:

```bash
git switch main && git pull
infra/desplegar.sh staging        # construye el commit y lo levanta en staging
infra/desplegar.sh produccion     # la misma imagen a producción (revertir: produccion <version>)
```

Primera instalación, usuarios, copias y restauración: [docs/runbooks/servidor-local.md](docs/runbooks/servidor-local.md). Despliegue y reversión: [docs/runbooks/despliegue.md](docs/runbooks/despliegue.md). Cambios por versión: [CHANGELOG.md](CHANGELOG.md).
