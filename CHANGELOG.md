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
- **Dependencias:** la auditoría ya no tiene excepciones (ADR 17). mammoth pasa de 1.8.0 a 1.13.0, con arreglos de seguridad. Además lee mejor los Word revisados: controles de contenido, párrafos movidos, filas eliminadas y documentos que antes fallaban; las casillas de los Word (☒/☐), que mammoth 1.13 ya no emitía, se recuperan con un preproceso (divergencia D6). `image-size`, que pptxgenjs declaraba sin usarla, sale del árbol. pptxgenjs sigue en 3.12.0 y los PPTX no cambian.
- **colaboracion:** en el editor de un proyecto se ve quién más tiene abierto el proceso (iniciales) y quién está editando, con un aviso suave que no bloquea; cuando alguien guarda una revisión, llega un aviso al momento con «Cargar la nueva versión» o «Seguir con la mía». La página del proceso muestra quién lo tiene abierto y su lista de revisiones se actualiza sola. Presencia por latido que caduca sola y sin histórico; eventos por SSE con `LISTEN/NOTIFY` (ADR 21).
- **Seguridad web:** `Content-Security-Policy` obligatoria en todo el sitio (solo scripts, estilos, fuentes y conexiones del propio sitio, sin `eval`; con clave propia, también Anthropic) y `Permissions-Policy` (sin cámara ni ubicación; micrófono solo para la grabación de voz). Montserrat se sirve desde la propia web y ya no desde Google Fonts, con los mismos archivos: diagramas y exportaciones no cambian. Toda la E2E corre con la CSP de producción y falla si alguna prueba la viola. `pnpm fronteras` detecta también los `import '…'` sin `from`.
- **Editor:** «Exportar → JSON» lleva las dos vistas, los KPIs, RACI, SIPOC, la simulación y los carriles, y se importa entero en el editor, en «Nuevo proceso → JSON» y en la importación asistida (divergencia D7). Los borradores locales de los procesos de un proyecto se borran al guardar la revisión que los contiene y se purgan a los 30 días. El esquema v1 quita las cachés de pintado también de un v1 y normaliza las vistas en vez de rechazarlas. Las casillas de Word vuelven a leerse con su símbolo `☒`/`☐` (D6). El panel «Validaciones» ya no dice que lo crítico bloquea el export (D8) y la interfaz del editor lleva sus tildes (D9).
- **Shell:** la plataforma (`/proyectos/`) en español e inglés, con «ES / EN» en la cabecera y en «Entrar». La elección se recuerda en el navegador (`processiq.idioma`); por defecto, español, aunque el navegador esté en inglés. Se traducen las pantallas del shell y de Portafolio, Conocimiento e Invitados, los estados, los roles, las fechas y los números, y los errores habituales de la API. El editor sigue en español, y los enlaces que llevan a él lo avisan en inglés.
- **Editor:** importar un BPMN de Bizagi, Signavio, Camunda o bpmn.io conserva los carriles (o el pool), los subprocesos con su contenido (se pliega en los niveles Actividad y Ejecutivo), los tipos de tarea y de evento, los eventos de borde, los datos y las anotaciones, y el copiloto avisa de lo que no se pudo representar. Un XML que no es BPMN da un mensaje claro y ya no borra el proceso abierto. Un BPMN exportado por ProcessIQ se importa igual que antes.
- **Cuentas y colaboración:** página «Sesiones» en el nuevo menú del usuario (su nombre abre «Cambiar contraseña» y «Sesiones»; «Salir» sigue al lado): cada persona ve dónde tiene abierta la cuenta («Chrome en Windows», IP, inicio y caducidad) y cierra una sesión o todas menos la actual; el otro navegador vuelve a «Entrar». En «Usuarios», el administrador cierra todas las sesiones de una cuenta sin desactivarla. Cada cierre queda en la auditoría; cambiar la contraseña y desactivar la cuenta ya las cerraban. En la página del proceso, enviar a revisión, aprobar o devolver se ve al momento (`NOTIFY` y evento `estado` del SSE), y la presencia dice qué versión tiene abierta cada persona («Ana (v3)», «versión anterior» si ya no es la última).
- **Editor:** en español e inglés, con el mismo idioma que la plataforma (`processiq.idioma`) y «ES / EN» en su cabecera; lo siguen el modo proyecto y la vista del invitado. Se traducen menús, paneles, diálogos, avisos, el copiloto sin IA, el linter y los errores habituales. Las exportaciones, el diagrama, los ejemplos, los catálogos y lo que responde la IA no se traducen, y el editor en español no cambia (fidelidad 37/37).
- **Colaboración:** el título de cada avatar del editor dice qué versión tiene abierta esa persona («(v3)», «(v2, versión anterior)»). En inglés, la plataforma ya no avisa de que el editor abre en español.
- **IA:** con IA, «Generar matriz RACI» y «Generar SIPOC» traen la matriz editable (validada, con una reparación) en lugar de un informe en texto: se abre en su diálogo, se puede ajustar y llega al PPTX, al informe Word y a la Ficha. Igual en el editor libre y en los proyectos (en el servidor); si falla, el informe de siempre (divergencia D12). Los títulos de las tareas de IA del copiloto llevan sus tildes.
- **Operación:** `infra/promover.sh <version>` pasa a producción una versión de staging solo si staging está en esa versión, en marcha y sano, y si la prueba de humo (`infra/humo.mjs`, 26 comprobaciones con una cuenta temporal que se desactiva al terminar) pasa entera. El runbook del servidor avisa de no parar los contenedores desde Docker Desktop.
- **IA:** en «Consumo de IA», las matrices RACI y SIPOC con IA se nombran como su tarea («Matriz RACI», «SIPOC») en lugar de «Análisis (matriz-raci)». La referencia de la API y el manual las documentan.
- **Motor del diagrama:** una compuerta de convergencia (varias entradas y una salida, o las que inserta el copiloto con «Insertar compuertas de convergencia») ya no recibe un fin «Caso no procede» inventado (divergencia D13). El nivel Ejecutivo no pasa de 10 cajas tampoco con los subprocesos de un BPMN importado ni con la jerarquía de la IA: se agrupa en etapas (D14). El auto-layout respeta el orden de carriles que traiga el proceso (`meta.ordenCarriles`); sin él, todo sigue igual.
- **Dependencias:** `drizzle-kit` (solo para generar migraciones) ya no arrastra `esbuild` 0.18 con su aviso moderado GHSA-67mh-4wv8-2f99: un override fuerza la 0.25 en esa ruta (ADR 17). `pnpm audit`, también con las dependencias de desarrollo, queda limpio.
- **Operación:** el sondeo vigila que producción y staging sigan en marcha. Si un servicio está parado o con la salud en rojo más de un minuto, lo anota en `despliegues.log` y abre una ventana en la sesión de Windows del servidor; avisa también cuando se recupera. `infra/sondear-main.sh --estado` muestra la última situación.
- **Copiloto:** con el editor en inglés entiende las órdenes de edición en inglés («add X after Y», «delete X», «rename X to Y», «connect X to Y», «mark X as automatic»…) y también las de siempre en español, y responde en inglés; su ayuda sale en inglés. Los nombres de las actividades se escriben tal cual. Con el editor en español no cambia nada (divergencia D15).

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
