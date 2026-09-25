# ProcessIQ

Plataforma de diagramación, diagnóstico y reingeniería de procesos con BPMN 2.0, de MBC Business Consulting.

- **Arquitectura objetivo:** [docs/arquitectura.md](docs/arquitectura.md)
- **Servidor actual (PC propio, Docker):** [docs/runbooks/servidor-local.md](docs/runbooks/servidor-local.md)
- **Historia y lecciones del MVP:** [docs/mvp/HANDOFF.md](docs/mvp/HANDOFF.md)

## Estado: fase 1 (fundaciones) terminada

El MVP 3.8.9 (un único `app.js` de ~10.500 líneas) quedó portado a paquetes TypeScript con pruebas **sin cambiar su comportamiento**, salvo las diferencias registradas en [docs/fase1-divergencias.md](docs/fase1-divergencias.md): un fallo del MVP corregido y librerías servidas desde la propia app. Las pruebas de fidelidad lo demuestran en cada cambio.

## Estructura

```text
apps/
  web/            la app (Vite). src/app/ = interfaz en módulos ES sobre los paquetes
  intermediario/  intermediario de IA (Node + Hono): guarda la clave de Anthropic
packages/
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
docs/             arquitectura, runbooks, lecciones aprendidas y documentación del MVP
```

## Desarrollo

Requisitos: Node 22+, pnpm 10 y Docker Desktop.

```bash
pnpm install
pnpm dev             # web en http://localhost:5173 (con /ia → intermediario en :8787)
pnpm --filter @processiq/intermediario dev   # intermediario, lee ../../.env
pnpm typecheck
pnpm test            # pruebas unitarias de los paquetes
pnpm fronteras       # dependencias permitidas entre paquetes
pnpm fidelidad       # la app frente al MVP: ejemplos, exports, interacciones, IA simulada (≈2,5 min)
```

## Despliegue en el servidor

```bash
cp .env.example .env   # completar DOMINIO, ANTHROPIC_API_KEY, ACCESS_CODE
docker compose up -d --build
```

El dominio se cambia solo en `.env` (ver el runbook).
