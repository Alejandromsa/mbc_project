# Pendientes

Todo lo que queda por hacer, con quién lo tiene y en qué estado está. Lo mantiene plataforma: el PR que cierra un punto lo marca aquí (✅) y, en la siguiente limpieza, lo quita.

Actualizado: 28-sep-2026.

**Estados:** ⏳ en curso · 🔜 siguiente ola · ⛔ bloqueado · 🙋 lo hace una persona · ✅ hecho.

## 1. Equipo de agentes (en curso)

Cada agente trabaja en su propia copia (`git worktree`), en su rama y solo en sus zonas; abre un PR y no lo fusiona. Plataforma revisa, fusiona de uno en uno (regenerando migraciones si hace falta) y despliega. Reglas: [docs/equipo/](equipo/README.md).

| Agente | Qué hace | Rama | Zonas | Estado |
|---|---|---|---|---|
| Tipado | Quitar `@ts-nocheck` de `pptx.ts`, `word.ts`, `ficha.ts` y `extraccion.ts` sin cambiar el JS emitido | `plataforma/tipar-nocheck` | `packages/exportar`, `packages/documentos` | ✅ PR #4 |
| IA | Correcciones del núcleo de IA ([§5.1](#51-ia)) | `plataforma/ia-robustez` | `packages/ia`, `apps/api/src/ia/`, `rutas/ia.ts`, `worker.ts` | ✅ PR #7 |
| Operación | Seguridad y operación del servidor ([§5.2](#52-seguridad-y-operación)), despliegue automático a staging | `plataforma/operacion` | `infra/`, `docker-compose*.yml`, `.env*.example`, `config.ts`, `cli.ts`, `rutas/auditoria.ts`, `rutas/sistema.ts`, runbooks | ⏳ |
| Portafolio | Iniciativa `portafolio`: tablero por cliente e indicadores | `portafolio/tablero` | [ficha](iniciativas/portafolio.md) | ✅ PR #6 |
| Conocimiento | Iniciativa `conocimiento`: búsqueda sobre entregables y comparativo APQC | `conocimiento/busqueda` | [ficha](iniciativas/conocimiento.md) | ⏳ |
| Invitados (ola 2) | Iniciativa `invitados`: enlace de solo lectura con caducidad y comentarios del cliente | `invitados/enlaces` | [ficha](iniciativas/invitados.md) | ⏳ |
| Colaboración (ola 2) | Núcleo: presencia, «editando» y aviso de revisiones nuevas | `plataforma/colaboracion` | [ficha](iniciativas/colaboracion.md) | ⏳ incremento 1 en revisión (PR #15) |

## 2. Del dueño del proyecto y del responsable de operación 🙋

| Pendiente | Por qué importa | Cómo |
|---|---|---|
| Crear tu cuenta de administrador en producción y en staging | Sin ella nadie puede entrar: producción no tiene usuarios | `docker compose exec api node dist/cli.js crear-usuario --email … --nombre "…" --rol admin` (staging: con `-p processiq-staging --env-file .env.staging -f docker-compose.yml -f docker-compose.staging.yml`) |
| Pegar `ANTHROPIC_API_KEY` en `.env` y `.env.staging` | Sin ella no funciona la IA (el resto sí) | Crear la clave en un workspace con tope de gasto; después `docker compose up -d intermediario api worker` |
| Excepción de Netskope para `mbc.asissoft.com` y `staging.mbc.asissoft.com` | La red corporativa bloquea los dominios nuevos | Pedido a TI |
| Copiar `respaldos/` fuera del PC | Si falla el disco, se pierden la base y sus copias a la vez | OneDrive o disco externo, con la frecuencia que se acuerde |
| Dar acceso al repositorio a cada persona del equipo | Solo el dueño tiene escritura | GitHub → Settings → Collaborators |
| Nombrar el equipo de plataforma y el responsable de operación | Revisiones del núcleo y despliegues ([arquitectura §15](arquitectura.md#15-decisiones-pendientes)) | Decisión del proyecto; luego, `CODEOWNERS` |
| Decidir si un `lector` de organización puede editar un proyecto donde tiene rol `editor` | Hoy puede; el rol `lector` solo impide crear proyectos | Decisión de producto |
| Periodicidad de rotación de secretos | La arquitectura dice 90 días; el runbook, al menos una vez al año | Decisión; se ajusta el runbook |
| Aportar los BPMN reales de cliente para el banco de calidad | El banco solo corre con ejemplos | Carpeta `bench/fixtures/` en local, nunca en el repositorio |
| Aportar el archivo APQC PCF (con su licencia) | El comparativo APQC necesita el marco | Descarga de APQC con registro; se importa desde la pantalla de la iniciativa `conocimiento` |
| Un servidor de correo (SMTP) o un webhook (p. ej. Teams) | Para enviar alertas; hoy solo se ven en «Sistema» | Datos de conexión en `.env` |

## 3. Bloqueado por terceros ⛔

| Pendiente | Espera a | Mientras tanto |
|---|---|---|
| Inicio de sesión con Entra ID | Registro de la aplicación por TI | Cuentas locales ([ADR 12](adr/0012-cuentas-locales.md)) |
| Guardar fuentes y documentos originales (almacén) | Política de datos con Legal | Los originales no salen del navegador; el texto de la IA se borra al terminar |
| Política de datos para la IA (Ley 29733) | Legal y Seguridad | La interfaz dice qué se envía |
| Corte a `procesos.mbc-latam.com` | El dueño de ese dominio | La plataforma está en `mbc.asissoft.com` |
| Retirar GitHub Pages y el Worker de Cloudflare para ProcessIQ | Decisión del proyecto (hoy se mantienen) | — |
| Entornos de vista previa por PR | Un PaaS con presupuesto | Staging en el mismo servidor ([ADR 16](adr/0016-staging-mismo-servidor.md)) |

## 4. Fase 4: evolución del producto

| Iniciativa | Tipo | Estado |
|---|---|---|
| Portafolio de procesos por cliente e indicadores | Módulo `portafolio` | ✅ PR #6 |
| Búsqueda sobre entregables anteriores y comparativo APQC PCF | Módulo `conocimiento` | ⏳ ola 1 (el comparativo necesita el archivo APQC) |
| Comentarios y revisión por invitados externos (enlace de solo lectura con caducidad) | Módulo `invitados` | ⏳ ola 2 |
| Colaboración en tiempo real (presencia, aviso de revisiones nuevas, bloqueo suave) | Núcleo (`colaboracion`) | ⏳ ola 2: incremento 1 en revisión ([ADR 21](adr/0021-presencia-y-eventos-por-sse.md)) |
| Edición simultánea del mismo diagrama (CRDT u operaciones en vivo) | Núcleo | 🔜 por decidir, sobre la base de `colaboracion` (necesitaría canal en los dos sentidos: otra ADR) |
| Interfaz en inglés: la plataforma (shell y pantallas de los módulos) | Núcleo | ⏳ ola 3: español e inglés, en revisión (`plataforma/i18n-shell`) |
| Interfaz en inglés: el editor | Núcleo | 🔜 lo cubre la fidelidad byte a byte: hay que traducirlo sin cambiar el editor en español, que es el que se compara con el MVP |

## 5. Deuda técnica y hallazgos abiertos

Los hallazgos salen de la revisión del código hecha al documentar (secciones «Puntos por confirmar» de [docs/tecnica/](README.md#si-desarrollas-en-processiq)).

### 5.1 IA

- ✅ Los tokens de entrada de una llamada cortada ya se suman al coste y a Pulse (PR #7). Queda estimar la salida, que Anthropic casi nunca informa en ese caso.
- ✅ El presupuesto y el límite por persona se vuelven a comprobar antes de cada llamada (PR #7).
- ✅ Si el servidor no permite el modelo elegido, usa otro y el editor lo avisa (PR #7).
- ✅ Un aviso `ia_cola` despierta a todos los bucles del worker (PR #7).
- ✅ `clasificarErrorIa` decide por la clase marcada en el error; el texto queda solo como respaldo (PR #7).
- ✅ La cabecera del intermediario ya no dice que es temporal (PR de operación).
- 🔜 Salida estructurada, caché de prompts y versión del prompt en `ejecuciones_ia` (previstas en la arquitectura).
- 🔜 Dibujar en el servidor el proceso generado por la IA (hoy lo dibuja el editor al abrirlo).

### 5.2 Seguridad y operación

- ✅ `GET /api/auditoria` filtra por la organización del administrador. «Sistema» sigue siendo del servidor entero, documentado ([seguridad.md §8](tecnica/seguridad.md#8-auditoría-y-registros)).
- ✅ Lo que se hace con `cli.js` queda en la auditoría (`cli.…`).
- ✅ El Postgres de desarrollo está en `docker-compose.dev.yml`, solo en `127.0.0.1:5440` y sin `.env`.
- ✅ El contenedor `api` recibe `IA_CONFIGURADA`, no `ANTHROPIC_API_KEY`.
- ✅ El intermediario en desarrollo lee `.env.dev` (o `.env` si no existe); `ALLOWED_ORIGINS` documentada.
- ✅ `HORAS_SESION` y `PORT` validadas; `RESPALDO_ESPERA_INICIAL_S` llega al contenedor; `desplegar.sh` lee `RED_BORDE` también de los `.env`.
- ✅ Despliegue automático a staging desde `main`, por sondeo desde el servidor (`infra/sondear-main.sh`; sin runners propios: [ADR 18](adr/0018-repositorio-publico.md)). Producción sigue siendo manual. 🙋 Falta instalar la tarea programada en el servidor (`infra/instalar-sondeo.ps1`).
- ✅ `Content-Security-Policy` obligatoria y `Permissions-Policy` en Caddy; Montserrat servida desde la propia web; la E2E corre con la CSP y falla con cualquier violación (PR #16). Queda `style-src 'unsafe-inline'`, que necesita el editor portado ([seguridad.md §16](tecnica/seguridad.md#16-qué-no-está-cubierto-todavía)).
- 🔜 Alertas por correo o webhook (necesita el SMTP o el webhook).
- 🔜 `CODEOWNERS` real y revisión obligatoria (necesita el equipo).

### 5.3 Editor y dominio

- 🔜 El esquema v1 valida poco: no revisa `views`, `lanes`, `raci`, `sipoc` ni `simResults`, y si la entrada ya es v1 conserva las claves efímeras.
- 🔜 Guardar en el nivel 1 o 2 guarda la vista resumida: el detalle completo (`_modeloCompleto`) se pierde (heredado del MVP).
- 🔜 Los borradores locales `processiq.proceso.<id>` (y `.base`) nunca se borran del navegador.
- 🔜 «Exportar → JSON» solo lleva la vista activa: no la otra vista, ni KPIs, RACI, SIPOC o la simulación.
- 🔜 RACI y SIPOC con IA devuelven un informe en texto, no las matrices editables que usa el PPTX.
- 🔜 El panel «Lint» dice que lo crítico «bloquea export», pero no lo bloquea.
- 🔜 Textos sin tilde en la interfaz del editor («Anadir», «Analisis»): cambiarlos exige registrar la divergencia con el MVP.
- 🔜 El importador BPMN aplana los subprocesos y no lee carriles ni posiciones.
- ✅ `herramientas/fronteras.mjs` detecta `import './x.js'` sin `from` (`export * from` ya lo detectaba) y comprueba su extractor con casos de ejemplo (PR #16).
- 🔜 Colaboración: cambiar el estado de la última revisión (enviar a revisión, aprobar) no avisa con `NOTIFY`; la página del proceso lo ve en el sondeo de 5 s del SSE. Añadir el aviso en `POST /api/revisiones/:id/estado` si hace falta al momento.
- 🔜 Colaboración: la presencia no dice qué versión tiene abierta cada persona (solo si está viendo o editando).
- ✅ Avisos de la auditoría de pptxgenjs y mammoth ([ADR 17](adr/0017-excepciones-auditoria-dependencias.md)), sin excepciones: mammoth pasa a 1.13.0 (divergencia D6), e `image-size`, que pptxgenjs declara pero no usa, se quita con un override. pptxgenjs sigue en 3.12.0, porque la 4.0.1 no quita el aviso; da el mismo `.pptx` y está evaluada en la ADR.
- 🔜 Con mammoth 1.13 el texto extraído de un Word pierde el símbolo de las casillas (`☒`/`☐`), así que «marcado» y «sin marcar» se leen igual (divergencia D6). Evaluar si recuperarlo con una opción de mammoth o un preproceso.

### 5.4 Documentación

- 🔜 `arquitectura.md` §7 y §8 describen tablas y rutas previstas que no coinciden con las reales (`/api/ia/analisis/{tipo}`, SSE con `Last-Event-ID`, `fuentes`, `exportaciones`…): marcar qué está hecho y cómo.
- 🔜 Comentario desfasado en `esquema.ts` sobre las claves de `ejecuciones_ia.tarea`.
- ✅ La fidelidad no borra las carpetas de resultados entre corridas: quedan restos que parecen fallos (`plataforma/operacion`).
