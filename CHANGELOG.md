# Registro de cambios

Versiones con [SemVer](https://semver.org/lang/es/). Cada versión desplegada se identifica además por su commit (`infra/desplegar.sh versiones`).

## Sin publicar

- **Trabajo en equipo:** guías en `docs/equipo/` (convenciones, nueva iniciativa o aplicación, Claude Code), registro de iniciativas y reservas en `docs/iniciativas/`, plantilla de PR.
- **Operación:** copias de seguridad a hora fija (03:00 de Lima; staging a las 03:30), con una copia inmediata si la última tiene más de 24 h. Limpieza automática de imágenes viejas al promover a producción (`infra/desplegar.sh limpiar`).
- **Correcciones** (encontradas al documentar la API):
  - desactivar un KPI ya no borra su unidad, benchmark, macroproceso y descripción;
  - no se puede bajar de rol al único propietario de un proyecto;
  - quien no tiene acceso a una revisión recibe 404 sin saber en qué estado está;
  - un tipo de análisis como `constructor` ya no se encola;
  - al terminar una ejecución de IA se borran también los nombres de los participantes;
  - un límite no numérico en la auditoría ya no da error 500;
  - el worker purga cada hora las sesiones caducadas.

## 4.4.0 — 26-sep-2026 · Fase 2.4 y fase 3 (en curso)

- **Catálogos administrables:** KPIs, verbos del Playbook y temas PPTX de cliente por organización. El editor los usa en los procesos de proyectos.
- **Observabilidad propia:** errores de API, web, editor y worker en la base; latidos; pantalla «Sistema» con avisos; rotación de logs.
- **Importación asistida:** lo del editor libre de cada navegador, o JSON exportados, pasa a un proyecto.
- **Staging** en el mismo servidor detrás del Caddy de producción; imágenes versionadas por commit y promoción o reversión con `infra/desplegar.sh`.
- **Operación:** runbooks de despliegue, rotación de secretos e incidente de IA; ADR 12 a 17; auditoría de dependencias en la CI.
- **Corrección:** un proyecto archivado es de solo lectura también para aprobar y para gestionar miembros.

## 4.3.0 — 25-sep-2026 · Fase 2.3

- **IA en el servidor** para los procesos de proyectos:
  - trabajos en cola (tabla `ejecuciones_ia` y servicio `worker`);
  - progreso por SSE, reintentos, reparación del JSON y cancelación;
  - coste por ejecución, presupuesto mensual y límite por persona;
  - pantalla «Consumo de IA».
- El editor, en modo proyecto, genera y analiza por el servidor; lo generado se guarda como revisión.

## 4.2.0 — 25-sep-2026 · Fase 2.2

- **Plataforma web** en `/proyectos/` (React): acceso, proyectos, miembros, procesos, revisiones con aprobación, usuarios y auditoría.
- **Editor conectado:** abre y guarda revisiones (`/?proceso=`, `/?revision=`), con aviso de conflicto y borrador local recuperable. Sin proyecto sigue igual que el MVP.

## 4.1.0 — 25-sep-2026 · Fase 2.1

- Postgres y API con cuentas locales, proyectos, procesos, revisiones numeradas, auditoría y copias de seguridad diarias.

## 4.0.0 — 25-sep-2026 · Fase 1

- El MVP 3.8.9 portado a un monorepo TypeScript sin cambiar su comportamiento, con 32 escenarios de fidelidad frente al MVP congelado.
- Servidor propio con Docker y Caddy en `mbc.asissoft.com`.
