# Pendientes

Todo lo que queda por hacer, con quién lo tiene y en qué estado está. Lo mantiene plataforma: el PR que cierra un punto lo marca aquí (✅) y, en la siguiente limpieza, lo quita.

Actualizado: 1-oct-2026.

**Estados:** ⏳ en curso · 🔜 siguiente ola · ⛔ bloqueado · 🙋 lo hace una persona · ✅ hecho.

## 1. Equipo de agentes

Cada agente trabaja en su propia copia (`git worktree`), en su rama y solo en sus zonas; abre un PR y no lo fusiona. Plataforma revisa, fusiona de uno en uno (regenerando migraciones si hace falta) y despliega. Reglas: [docs/equipo/](equipo/README.md).

| Agente | Qué hace | Rama | Zonas | Estado |
|---|---|---|---|---|
| Tipado | Quitar `@ts-nocheck` de `pptx.ts`, `word.ts`, `ficha.ts` y `extraccion.ts` sin cambiar el JS emitido | `plataforma/tipar-nocheck` | `packages/exportar`, `packages/documentos` | ✅ PR #4 |
| IA | Correcciones del núcleo de IA ([§5.1](#51-ia)) | `plataforma/ia-robustez` | `packages/ia`, `apps/api/src/ia/`, `rutas/ia.ts`, `worker.ts` | ✅ PR #7 |
| Operación | Seguridad y operación del servidor ([§5.2](#52-seguridad-y-operación)), despliegue automático a staging | `plataforma/operacion` | `infra/`, `docker-compose*.yml`, `.env*.example`, `config.ts`, `cli.ts`, `rutas/auditoria.ts`, `rutas/sistema.ts`, runbooks | ✅ PR #9 |
| Portafolio | Iniciativa `portafolio`: tablero por cliente e indicadores | `portafolio/tablero` | [ficha](iniciativas/portafolio.md) | ✅ PR #6 |
| Conocimiento | Iniciativa `conocimiento`: búsqueda sobre entregables y comparativo APQC | `conocimiento/busqueda` | [ficha](iniciativas/conocimiento.md) | ✅ PR #11 |
| Invitados (ola 2) | Iniciativa `invitados`: enlace de solo lectura con caducidad y comentarios del cliente | `invitados/enlaces` | [ficha](iniciativas/invitados.md) | ✅ PR #13 |
| Colaboración (ola 2) | Núcleo: presencia, «editando» y aviso de revisiones nuevas | `plataforma/colaboracion` | [ficha](iniciativas/colaboracion.md) | ✅ PR #15 |
| Librerías (ola 2) | Evaluar pptxgenjs y mammoth: auditoría sin excepciones | `plataforma/librerias` | `apps/web/package.json`, ADR 17 | ✅ PR #14 |
| Seguridad web (ola 2) | Montserrat propia, CSP obligatoria, `Permissions-Policy`, `fronteras.mjs` | `plataforma/csp` | `infra/Caddyfile`, fuentes, `herramientas/` | ✅ PR #16 |
| Editor (ola 2) | Borradores locales, JSON completo, esquema v1, texto de Lint, tildes, casillas de Word | `plataforma/editor-pendientes` | `apps/web/src/app/`, `packages/dominio` | ✅ PR #17 |
| Idiomas (ola 3) | La plataforma en español e inglés | `plataforma/i18n-shell` | `apps/web/src/shell/`, pantallas de los módulos | ✅ PR #18 |
| BPMN | Importador: carriles, subprocesos, tipos y robustez | `plataforma/bpmn-importador` | `packages/bpmn`, `apps/web/src/app/bpmn/` | ✅ PR #20 |
| Cuentas y avisos (ola 4) | Sesiones visibles y cerrables, aviso en vivo del cambio de estado y versión abierta en la presencia | `plataforma/sesiones-y-avisos` | `rutas/sesion.ts`, el cambio de estado de `rutas/procesos.ts`, `apps/api/src/colaboracion/`, `presencias`, `apps/web/src/shell/`, el latido de `colaboracion.js` | ✅ PR #21 |
| Editor en inglés (ola 4) | El editor en español e inglés; en español, ni un byte distinto | `plataforma/i18n-editor` | `apps/web/src/app/` (textos), `app/i18n.js` | ✅ PR #22 (seguimiento: #23) |
| Matrices con IA (ola 5) | RACI y SIPOC con IA como matrices editables que llegan al PPTX (D12) | `plataforma/ia-matrices` | `packages/ia`, `apps/api/src/ia/`, `rutas/ia.ts`, `app/ia/` | ✅ PR #24 |
| Motor (ola 5) | Fines «Caso no procede» en compuertas de convergencia, tope del nivel Ejecutivo con subprocesos importados y orden de carriles del BPMN importado | `plataforma/motor-ajustes` | `packages/motor`, `apps/web/src/app/{layout,lienzo,proceso}/` | ⏳ |
| Copiloto en inglés (ola 5) | Comandos del copiloto en inglés («add X after Y»), su ayuda y su `placeholder` | `plataforma/copiloto-ingles` | `apps/web/src/app/copiloto/` y sus textos | ⏳ |

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
| Búsqueda sobre entregables anteriores y comparativo APQC PCF | Módulo `conocimiento` | ✅ PR #11 (el comparativo necesita el archivo APQC: §2) |
| Comentarios y revisión por invitados externos (enlace de solo lectura con caducidad) | Módulo `invitados` | ✅ PR #13 |
| Colaboración en tiempo real (presencia, aviso de revisiones nuevas, bloqueo suave) | Núcleo (`colaboracion`) | ✅ PR #15 ([ADR 21](adr/0021-presencia-y-eventos-por-sse.md)) |
| Edición simultánea del mismo diagrama (CRDT u operaciones en vivo) | Núcleo | 🔜 por decidir, sobre la base de `colaboracion` (necesitaría canal en los dos sentidos: otra ADR) |
| Interfaz en inglés: la plataforma (shell y pantallas de los módulos) | Núcleo | ✅ PR #18 |
| Interfaz en inglés: el editor | Núcleo | ✅ PR #22: editor libre, modo proyecto y vista del invitado, con el idioma de la plataforma; el español no cambia (fidelidad 37/37). No se traducen, por diseño: exportaciones, lienzo, prompts y respuestas de la IA, ejemplos y catálogos ([web.md §5.11](tecnica/web.md#511-el-editor-en-español-e-inglés)) |
| Interfaz en inglés: lo que queda del editor | Núcleo | 🔜 (1) el shell aún dice en inglés que el editor abre en español (`EnlaceEditor`, «Editor libre», «Entrar») y cita sus menús en español: quitarlo (zona del shell); (2) comandos del copiloto en inglés («add X after Y»): hoy solo entiende español; (3) mensajes del servidor que no están en `mensajes.ts` (detalles de validación, error de una ejecución de IA) y errores de paquetes no listados en `ERRORES_EN` salen en español; (4) los nombres y descripciones de la galería de ejemplos siguen en español (son ejemplos) |

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
- ✅ A producción solo con `infra/promover.sh`: staging sano y prueba de humo entera en verde, o no promueve ([despliegue.md](runbooks/despliegue.md#flujo-normal), lección 23).
- ✅ El sondeo vigila que producción y staging sigan en marcha (el 30-sep-2026 alguien los paró desde Docker Desktop y nada avisó): si un servicio está parado o sin salud más de un minuto, lo anota en `despliegues.log` y abre una ventana en la sesión de Windows del servidor ([vigilancia](runbooks/despliegue.md#vigilancia-de-los-contenedores)). Solo lo ve quien está delante del servidor: el aviso a distancia necesita el punto siguiente.
- 🔜 Alertas por correo o webhook (necesita el SMTP o el webhook), también para la vigilancia de los contenedores.
- 🔜 `CODEOWNERS` real y revisión obligatoria (necesita el equipo).

### 5.3 Editor y dominio

- ✅ Esquema v1: `migrarProyecto` quita las claves efímeras también si la entrada ya es v1 (en `nodes`, `edges` y cada vista) y valida `views` de forma tolerante: la normaliza como el primer nivel en vez de rechazarla ([modelo de datos §8.7](tecnica/modelo-de-datos.md#87-vistas-as-is-y-to-be)). Ningún contenido aceptado antes se rechaza (comprobado con los fixtures, los v1 guardados antes y lo que envía el editor).
- 🔜 El esquema v1 sigue sin revisar `lanes`, `raci`, `sipoc` ni `simResults`.
- 🔜 Guardar en el nivel 1 o 2 guarda la vista resumida: el detalle completo (`_modeloCompleto`) se pierde (heredado del MVP).
- ✅ Los borradores locales `processiq.proceso.<id>` (y `.base`) se borran al guardar una revisión que los contiene, y al abrir un proceso se purgan los de otros procesos con más de 30 días ([web §4.2 y §4.4](tecnica/web.md#42-abrir-el-proceso)).
- ✅ «Exportar → JSON» lleva lo mismo que una revisión: las dos vistas, KPIs, RACI, SIPOC, la simulación y los carriles; se importa entero en el editor, «Nuevo proceso → JSON» y la importación asistida (divergencia D7).
- ✅ RACI y SIPOC con IA llegan como matrices editables (JSON validado con Zod y una reparación, en el editor libre y en el servidor): el editor las abre en su diálogo y las usan el PPTX, el Word y la Ficha; si fallan, el informe en texto de siempre (divergencia D12, [ia.md §3.1](tecnica/ia.md#31-matrices-raci-y-sipoc)).
- ✅ El panel «Lint» ya no dice que lo crítico «bloquea export»: dice que conviene resolverlo antes de exportar, y la exportación sigue sin bloquearse (divergencia D8).
- ✅ Tildes de la interfaz del editor («Añadir», «Análisis»…) (divergencia D9).
- ✅ Las etiquetas de las tareas de IA del copiloto llevan sus tildes («Proponer reingeniería To-Be», «Oportunidades de automatización», «Cuello de botella y ruta crítica»), en el chat y en «Consumo de IA». Los prompts no cambian: la etiqueta no viaja en la petición (divergencia D9).
- 🔜 El diálogo de la matriz RACI (también el de la heurística, heredado del MVP) no cabe a lo ancho con 6 roles o más: la tabla se desplaza en horizontal y los desplegables estrechos cortan su texto («I · Info…»). Pasa más con la IA, que puede añadir roles que no son carriles.
- ✅ Importar un BPMN de otra herramienta (Bizagi, Signavio, Camunda, bpmn.io) conserva carriles, pools, subprocesos (su contenido se pliega con los niveles), tipos de tarea y de evento, eventos de borde, datos y anotaciones, y avisa de lo que ignora; un XML que no es BPMN ya no borra el proceso abierto (divergencia D10, [paquetes §5.3](tecnica/paquetes.md#53-processiqbpmn)). Las posiciones del dibujo se midieron y solo se usan como desempate y como respaldo del carril.
- 🔜 El BPMN que exporta el propio ProcessIQ se sigue importando como en el MVP: plano y **sin carriles** (los responsables se pierden al exportar y volver a importar). Leerlo con la lectura completa sería otra divergencia: cambian los 14 casos de «importación BPMN» de la fidelidad. Decidirlo.
- 🔜 `asegurarRamasDeDecision` (motor) añade una rama «No» hacia un fin «Caso no procede» a toda compuerta exclusiva con una sola salida, también a las de convergencia. Le pasa a la acción del copiloto «Insertar compuertas de convergencia», que las crea con `_merge: true` y una salida: con `loadComplex` y `loadComplex4` inserta 2 y deja 2 fines «Caso no procede» colgando de ellas, en el MVP y en la app (comprobado el 29-sep-2026). El importador de BPMN externos las quita para evitarlo; lo correcto sería que el motor no las tocara (cambia la fidelidad de esa acción).
- 🔜 El auto-layout ordena los carriles por baricentro y no por el orden del archivo importado (en el fixture de Signavio, «Finanzas» sube por encima de «Jefe de compras»). Si se quiere respetar, `calcularLayout` necesitaría un orden preferido como desempate.
- 🔜 Con subprocesos importados, el nivel Ejecutivo usa la jerarquía explícita (el nivel superior, en un carril) y no tiene el tope de 10 cajas de las etapas deducidas. Si el nivel superior del BPMN es largo, la vista ejecutiva también lo es.
- ✅ `herramientas/fronteras.mjs` detecta `import './x.js'` sin `from` (`export * from` ya lo detectaba) y comprueba su extractor con casos de ejemplo (PR #16).
- ✅ Colaboración: cambiar el estado de una revisión (enviar a revisión, aprobar, devolver) avisa con `NOTIFY` dentro de la transacción y el SSE lo entrega en el evento `estado`; la página del proceso lo refleja al momento (`plataforma/sesiones-y-avisos`). La barra del editor también: `colaboracion.js` pasa `alEstado` y, si cambia el de la revisión abierta, `proyecto.js` actualiza `ctx.base.estado` y repinta (`plataforma/editor-ingles`, con su E2E en `editor-idioma.spec.mjs`). 🔜 Que el `title` de cada avatar del editor diga qué versión tiene abierta cada uno, como el shell («… (v3, versión anterior)»): está hecho y probado, pero cambia el `title` que comprueba `colaboracion.spec.mjs` (línea 73), de la iniciativa `colaboracion`; se deja para un PR que ajuste también esa prueba.
- ✅ Colaboración: la presencia dice qué versión tiene abierta cada persona en el editor, y si ya no es la última («Ana (v2, versión anterior)») (`plataforma/sesiones-y-avisos`). 🔜 El editor no lo muestra todavía en los avatares de la barra.
- ✅ Sesiones: cada persona ve sus sesiones abiertas y las cierra (una o todas menos la actual), el administrador cierra las de una cuenta, y cambiar la contraseña y desactivar la cuenta ya las cerraban (`plataforma/sesiones-y-avisos`, [seguridad §4](tecnica/seguridad.md#4-sesión)).
- 🔜 La semilla de desarrollo deja abiertas las sesiones con las que crea los proyectos de prueba (propietario, editor y revisor): en «Sesiones» salen como «Navegador desconocido» con IP `local`. Bastaría con borrarlas al final de `sembrar()`.
- ✅ Avisos de la auditoría de pptxgenjs y mammoth ([ADR 17](adr/0017-excepciones-auditoria-dependencias.md)), sin excepciones: mammoth pasa a 1.13.0 (divergencia D6), e `image-size`, que pptxgenjs declara pero no usa, se quita con un override. pptxgenjs sigue en 3.12.0, porque la 4.0.1 no quita el aviso; da el mismo `.pptx` y está evaluada en la ADR.
- ✅ Con mammoth 1.13 el texto extraído de un Word perdía el símbolo de las casillas (`☒`/`☐`). mammoth no tiene opción para eso en `extractRawText`, así que el editor quita antes la marca de casilla del documento (preproceso con JSZip) y el símbolo se lee como con 1.8.0 (divergencia D6).

### 5.4 Documentación

- 🔜 `arquitectura.md` §7 y §8 describen tablas y rutas previstas que no coinciden con las reales (`/api/ia/analisis/{tipo}`, SSE con `Last-Event-ID`, `fuentes`, `exportaciones`…): marcar qué está hecho y cómo.
- 🔜 Comentario desfasado en `esquema.ts` sobre las claves de `ejecuciones_ia.tarea`.
- ✅ La fidelidad no borra las carpetas de resultados entre corridas: quedan restos que parecen fallos (`plataforma/operacion`).
