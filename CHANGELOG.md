# Registro de cambios

Versiones con [SemVer](https://semver.org/lang/es/). Cada versión desplegada se identifica además por su commit (`infra/desplegar.sh versiones`).

## Sin publicar

- **Trabajo en equipo:** guías en `docs/equipo/` (convenciones, nueva iniciativa o aplicación, Claude Code), registro de iniciativas y reservas en `docs/iniciativas/`, plantilla de PR.
- **Repositorio público** (28-sep-2026, ADR 18):
  - historial auditado y reescrito: correo `noreply` del autor y sin datos de red del servidor;
  - `main` protegida, escaneo de secretos, avisos de Dependabot y reporte privado de vulnerabilidades;
  - `SECURITY.md` y `CONTRIBUTING.md`;
  - el repositorio anterior queda privado y archivado como `mbc_project-historico`.

  **Los identificadores de commit cambiaron.** La versión desplegada `40f0bd53` (imagen `processiq/*:40f0bd53`) es el commit `cc23c141` del historial público.
- **Deuda técnica:** los cuatro archivos portados con @ts-nocheck (PPTX, Word, Ficha y extracción de documentos) ya están tipados, sin cambios de comportamiento (el JS construido es idéntico).
- **Plantillas de proceso:** un administrador guarda una revisión como plantilla (sin datos del cliente) y cualquiera crea con ella un proceso nuevo, que nace con la versión 1 copiada. Se gestionan en «Catálogos».
- **Operación:** copias de seguridad a hora fija (03:00 de Lima; staging a las 03:30), con una copia inmediata si la última tiene más de 24 h. Limpieza automática de imágenes viejas al promover a producción (`infra/desplegar.sh limpiar`).
- **Correcciones** (encontradas al documentar la API):
  - desactivar un KPI ya no borra su unidad, benchmark, macroproceso y descripción;
  - no se puede bajar de rol al único propietario de un proyecto;
  - quien no tiene acceso a una revisión recibe 404 sin saber en qué estado está;
  - un tipo de análisis como `constructor` ya no se encola;
  - al terminar una ejecución de IA se borran también los nombres de los participantes;
  - un límite no numérico en la auditoría ya no da error 500;
  - el worker purga cada hora las sesiones caducadas.
- **IA:** el consumo de las llamadas cortadas a mitad (cancelación, inactividad, corte de red o parada del worker) se suma al coste de la ejecución y llega a Pulse; el worker vuelve a comprobar el presupuesto mensual y el límite por persona antes de cada llamada, reintentos incluidos; si el modelo elegido no está permitido, el servidor usa otro y el editor lo avisa; un aviso de la cola despierta a todos los bucles del worker; los reintentos se deciden por la clase marcada en el error, no por su texto.
- **portafolio:** tablero por cliente en «Portafolio»: avance de los procesos hacia la aprobación e indicadores de su última revisión (actividades, roles, pains, tipo de ejecución, KPIs con valor y hallazgos del Playbook), solo con los proyectos que cada uno puede ver.
- **conocimiento:** buscador en «Conocimiento» sobre la última revisión de los procesos de mis proyectos (actividades, sistemas, roles y ficha; sin tildes ni mayúsculas y con tolerancia a erratas), procesos parecidos de otros proyectos y comparativo con el marco APQC PCF, que importa un administrador desde un CSV con vista previa. Sin IA: `pg_trgm` y `unaccent` (ADR 19).
- **Operación y seguridad:** cada administrador ve solo la auditoría de su organización, y lo hecho por la línea de comandos queda auditado (`cli.…`). La API ya no recibe la clave de Anthropic, solo si la hay (`IA_CONFIGURADA`). El Postgres de desarrollo pasa a `docker-compose.dev.yml`, solo en `127.0.0.1:5440` y sin `.env`. Staging se despliega solo desde `main` por sondeo cada 10 minutos (`infra/sondear-main.sh`, tarea programada); producción sigue siendo manual. Además: `HORAS_SESION` y `PORT` validadas, `RESPALDO_ESPERA_INICIAL_S` llega al contenedor de copias, `infra/desplegar.sh` lee `RED_BORDE` de los `.env`, el intermediario de desarrollo lee `.env.dev` y la fidelidad borra los resultados anteriores al empezar.
- **Shell:** las pantallas de administración pasan a un desplegable «Administración»; con Portafolio y Conocimiento la cabecera ya no cabía en una línea.
- **invitados:** «Compartir con el cliente» en la página del proceso: un enlace de solo lectura a una versión, con caducidad (14 días por defecto, 90 como máximo) y revocable, que se muestra una sola vez. Quien lo abre, sin cuenta, ve el diagrama en «Presentar» y la ficha y deja comentarios, también sobre un paso concreto; el equipo los ve junto a la versión y los marca como resueltos. Rutas públicas bajo `/api/publico/` con token propio y límite de uso por IP (ADR 20).
- **colaboracion:** en el editor de un proyecto se ve quién más tiene abierto el proceso (iniciales) y quién está editando, con un aviso suave que no bloquea; cuando alguien guarda una revisión, llega un aviso al momento con «Cargar la nueva versión» o «Seguir con la mía». La página del proceso muestra quién lo tiene abierto y su lista de revisiones se actualiza sola. Presencia por latido que caduca sola y sin histórico; eventos por SSE con `LISTEN/NOTIFY` (ADR 21).

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
