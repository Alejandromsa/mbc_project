# Glosario de ProcessIQ

Los términos de negocio y técnicos que aparecen en el producto y en su documentación, con enlace al documento donde se detallan.

Actualizado: 28-sep-2026.

[A](#a) · [B](#b) · [C](#c) · [D](#d) · [E](#e) · [F](#f) · [G](#g) · [H](#h) · [I](#i) · [K](#k) · [L](#l) · [M](#m) · [N](#n) · [O](#o) · [P](#p) · [R](#r) · [S](#s) · [T](#t) · [V](#v) · [W](#w)

---

## A

**Actividad (tarea).** Un paso del proceso que ejecuta un rol; en el diagrama es una caja. Su etiqueta sigue la forma *verbo + objeto*: «Validar identidad del cliente». → [Manual §5.4](manual/README.md#54-propiedades-de-un-elemento)

**Administrador.** Rol de organización con todos los permisos: gestiona usuarios, catálogos, auditoría, consumo de IA y la pantalla «Sistema», y actúa como propietario en todos los proyectos. → [Manual §9.1](manual/README.md#91-roles-de-organización)

**ADR (registro de decisión de arquitectura).** Documento breve que deja constancia de una decisión técnica, sus alternativas y su motivo. Se numeran y viven en `docs/adr/`. → [Índice de ADR](adr/README.md)

**API.** El servicio del servidor que atiende a la plataforma: sesiones, usuarios, proyectos, procesos, revisiones, IA, catálogos, auditoría y sistema. → [API](tecnica/api.md)

**Aprobación (revisión aprobada).** Paso en que un revisor o el propietario da por buena una revisión «en revisión». La revisión aprobada es la versión oficial del proceso: ya no cambia de estado y, para modificarla, se guarda una revisión nueva. → [Manual §4.8](manual/README.md#48-qué-significa-que-una-aprobada-sea-inmutable)

**Archivado (proyecto).** Proyecto en solo lectura: se consulta, pero no se guardan revisiones, no se aprueba, no se usa la IA ni se cambian miembros. El propietario lo reactiva. → [Manual §3.3](manual/README.md#33-editar-archivar-y-reactivar)

**As-Is.** La vista del proceso tal como funciona hoy. Es el punto de partida del diagnóstico. → [Manual §5.11](manual/README.md#511-vistas-as-is-y-to-be)

**Auditoría.** Registro de quién hizo qué y cuándo (accesos, proyectos, procesos, revisiones). Los administradores lo consultan en la pantalla «Auditoría». → [Manual §9.4](manual/README.md#94-auditoría) · [Seguridad](tecnica/seguridad.md)

**Autoajustar.** Botón del editor que prueba varias disposiciones del diagrama, mide cruces y flechas sobre cajas, y aplica la mejor. → [Manual §5.6](manual/README.md#56-ordenar-autoajustar-y-navegar)

**Auto-layout («Ordenar»).** Cálculo automático de la posición de cada elemento: carriles por rol, flujo de izquierda a derecha y reducción de cruces. → [Manual §5.6](manual/README.md#56-ordenar-autoajustar-y-navegar) · [Paquetes](tecnica/paquetes.md)

## B

**Banco de calidad (bench).** Conjunto de mediciones del diagrama y del PPTX (textos que se pisan, elementos fuera de la lámina…) que se comparan con una línea base antes y después de tocar el layout o la exportación. → [Pruebas](tecnica/pruebas.md)

**Borrador (estado).** Primer estado de toda revisión recién guardada. Un editor o el propietario la envía a revisión. → [Manual §4.7](manual/README.md#47-ciclo-de-aprobación)

**Borrador local.** Copia de un proceso de proyecto que el editor guarda en tu navegador mientras trabajas. Si cierras sin guardar, al volver te ofrece recuperarla. No la ve nadie más. → [Manual §4.5](manual/README.md#45-borrador-local-y-su-recuperación)

**BPMN 2.0.** Notación estándar para modelar procesos de negocio: actividades, eventos, gateways, carriles y flujos. ProcessIQ dibuja en BPMN y exporta el archivo BPMN 2.0 para otras herramientas. → [Manual §5](manual/README.md#5-el-editor)

**BYOK (*bring your own key*).** Modo del editor libre en el que usas tu propia clave de la API de Anthropic. La clave se guarda solo en tu navegador y la llamada va directa a Anthropic. No existe en los procesos de proyecto. → [Manual §6.1](manual/README.md#61-dónde-funciona-la-ia) · [IA](tecnica/ia.md)

## C

**Carril (swimlane).** Franja horizontal del diagrama que agrupa las actividades de un mismo rol. En ProcessIQ, cada valor distinto de «Responsable / Rol» es un carril. → [Manual §5.5](manual/README.md#55-carriles)

**Catálogo.** Lista de referencia que usa el editor: KPIs, verbos del Playbook y temas PPTX. Cada organización administra los suyos; el editor libre usa los de fábrica. → [Manual §9.3](manual/README.md#93-catálogos) · [ADR 14](adr/0014-catalogos-en-sitio.md)

**Clave de iniciativa.** Nombre corto en minúsculas y con guiones (por ejemplo, `portafolio`) que identifica una iniciativa. De ella salen sus carpetas, rutas, tablas y variables. → [Convenciones](equipo/convenciones.md)

**Código de actividad.** Identificador de una actividad formado por el prefijo de su tipo de tarea y un número, como `USR-02` o `MAN-11`. Aparece en el panel de propiedades y en el informe Word. → [Manual §5.4](manual/README.md#54-propiedades-de-un-elemento)

**Código de equipo (código de acceso del equipo).** Contraseña compartida que permite al editor libre usar la IA a través del intermediario de MBC, sin exponer la clave de Anthropic. Se guarda en tu navegador. → [Manual §6.1](manual/README.md#61-dónde-funciona-la-ia)

**Cola de IA.** Lista de ejecuciones de IA pendientes en el servidor. El worker las toma una a una; si nadie las atiende, «Sistema» avisa. → [IA](tecnica/ia.md) · [ADR 13](adr/0013-cola-ia-en-postgres.md)

**Conector anclado.** Flecha del PPTX unida a sus dos cajas: al mover una caja en PowerPoint, la flecha la sigue. → [Manual §7](manual/README.md#7-exportar)

**Conflicto.** Situación en la que guardas una revisión a partir de una versión que ya no era la última. Se conservan las dos y se avisa; en la lista de revisiones aparece «a partir de vN». → [Manual §4.6](manual/README.md#46-aviso-de-conflicto)

**Consultor.** Rol de organización que puede crear proyectos y participa en los que lo añaden. → [Manual §9.1](manual/README.md#91-roles-de-organización)

**Contraseña temporal.** Contraseña que genera un administrador al crear una cuenta o restablecerla. Se muestra una sola vez y obliga a elegir una propia al entrar. → [Manual §2.2](manual/README.md#22-contraseña-temporal-y-cambio-obligatorio)

**Copia de seguridad.** Copia diaria de la base de datos de la plataforma. «Sistema» avisa si falta o es antigua. → [Manual §9.6](manual/README.md#96-sistema) · [Runbook del servidor](runbooks/servidor-local.md)

**Copiloto.** Panel «IA» del editor: acciones rápidas de análisis, comandos de edición en lenguaje natural y los mensajes de la herramienta. → [Manual §5.12](manual/README.md#512-copiloto-y-comandos)

**Cuello de botella.** La actividad que más frena el proceso, por tiempo × volumen, esperas o dependencia de un rol. La **ruta crítica** es la cadena de actividades que determina el tiempo total. → [Manual §5.14](manual/README.md#514-simulación-y-análisis)

**Cuenta local.** Cuenta de la plataforma con correo y contraseña, creada por un administrador. Sustituye por ahora al inicio de sesión corporativo (Entra ID). → [Manual §2](manual/README.md#2-acceso) · [ADR 12](adr/0012-cuentas-locales.md)

## D

**Dolor.** Ver *Pain*.

## E

**Editor (rol de proyecto).** Miembro que crea procesos, guarda revisiones, usa la IA del servidor y envía revisiones a revisión. No aprueba. → [Manual §3.4](manual/README.md#34-roles-en-un-proyecto)

**Editor libre.** El editor usado sin cuenta ni proyecto, en `https://mbc.asissoft.com/`. Guarda un proceso en tu navegador y usa los catálogos de fábrica. → [Manual §1](manual/README.md#1-qué-es-processiq)

**Ejecución de IA.** Cada trabajo que la plataforma encarga a la IA (generar un proceso, analizar pains, una tarea del copiloto). Queda registrada con su modelo, estado, tokens y coste. → [Manual §6](manual/README.md#6-inteligencia-artificial) · [IA](tecnica/ia.md)

**En revisión.** Estado intermedio de una revisión: espera que un revisor o el propietario la apruebe o la devuelva a borrador. → [Manual §4.7](manual/README.md#47-ciclo-de-aprobación)

**Entra ID.** El servicio de identidad corporativo de Microsoft. Está previsto para el inicio de sesión; mientras TI no registre la aplicación se usan cuentas locales. → [Arquitectura](arquitectura.md) · [ADR 12](adr/0012-cuentas-locales.md)

**Esquema del proceso (v1).** Formato versionado del contenido de un proceso (datos, ficha, nodos, conexiones, vistas…). Toda revisión se valida contra él y los formatos antiguos se migran. → [Modelo de datos](tecnica/modelo-de-datos.md)

**Evento.** Círculo del diagrama que marca algo que ocurre: **inicio**, **fin**, **intermedio** (mensaje, temporizador, error, señal) o **de borde** (excepción o SLA sobre una tarea). Un fin de **terminación** corta toda la instancia. → [Manual §5.4](manual/README.md#54-propiedades-de-un-elemento)

**Event log.** Registro exportado de un sistema con una fila por evento: caso (`case_id`), actividad (`activity`), fecha y hora (`timestamp`) y, opcionalmente, quién lo hizo (`resource`). Es la entrada de la minería de procesos. → [Manual §5.13](manual/README.md#513-minería-de-event-logs)

## F

**Ficha de iniciativa.** Documento de cada iniciativa del equipo, en `docs/iniciativas/`, con su alcance, zonas del código y reservas. → [Registro de iniciativas](iniciativas/README.md)

**Ficha de Proceso.** Documento corporativo de 12 bloques (objetivo, alcance, gobernanza, actividades, sistemas, términos, anexos, control de cambios…). Se completa en el panel «Ficha» y se descarga en Word. → [Manual §5.8](manual/README.md#58-ficha-de-proceso)

**Fidelidad (pruebas de).** Pruebas automáticas que comparan la aplicación actual con el MVP original congelado, para garantizar que el editor se comporta igual. → [Pruebas](tecnica/pruebas.md) · [Diferencias con el MVP](fase1-divergencias.md)

**FTE (*full-time equivalent*).** Personas a tiempo completo que requiere el proceso, calculadas con tiempos, volúmenes y horas hábiles. → [Manual §5.14](manual/README.md#514-simulación-y-análisis)

**Fuente.** Cada documento, transcripción, texto pegado o diagrama que se añade a la ingesta. Varias fuentes se combinan en un solo As-Is. → [Manual §6.2](manual/README.md#62-generar-un-proceso-desde-documentos-o-transcripciones)

## G

**Gateway (compuerta, decisión).** Rombo que divide o une el flujo. **Exclusivo (XOR):** un solo camino. **Paralelo (AND):** todos los caminos a la vez. **Inclusivo (OR):** uno o varios. Se formula como pregunta y etiqueta sus salidas. → [Manual §5.4](manual/README.md#54-propiedades-de-un-elemento)

## H

**Hipótesis del sector.** Dolores típicos de la industria que la IA sugiere pero no encontró en el flujo. Son preguntas para validar con el cliente; no se añaden al diagrama. → [Manual §6.9](manual/README.md#69-análisis-de-pains-con-ia)

## I

**Ingesta («Ingestar»).** Construir el proceso a partir de fuentes: documentos, transcripciones, texto o event logs. → [Manual §6.2](manual/README.md#62-generar-un-proceso-desde-documentos-o-transcripciones)

**Iniciativa.** Línea de trabajo de un equipo que suma funciones a ProcessIQ, normalmente como módulo dentro de la plataforma. Se registra y reserva sus nombres antes de escribir código. → [Trabajo en equipo](equipo/README.md) · [Nueva iniciativa](equipo/nueva-iniciativa.md)

**Intermediario.** Servicio de MBC que guarda la clave de Anthropic y reenvía las llamadas de IA del editor libre, que se identifica con el código de equipo. El navegador nunca ve la clave. → [IA](tecnica/ia.md) · [Arquitectura](arquitectura.md)

## K

**KPI (indicador clave).** Métrica que mide la salud del proceso, con unidad y referencia (benchmark). El editor ofrece una librería por industria y permite registrar el valor actual del cliente y su brecha. → [Manual §5.10](manual/README.md#510-kpis)

## L

**Latido.** Señal periódica con la que el worker de IA indica que está vivo. Si deja de llegar, «Sistema» avisa. → [Manual §9.6](manual/README.md#96-sistema)

**Lead time.** Tiempo total que tarda el proceso de principio a fin. El simulador lo calcula sumando los tiempos del flujo. → [Manual §5.14](manual/README.md#514-simulación-y-análisis)

**Lector.** Como rol de organización: no crea proyectos y participa donde lo añaden. Como rol de proyecto: solo consulta. → [Manual §3.4](manual/README.md#34-roles-en-un-proyecto)

**Lint (validación del Playbook).** Panel del editor que revisa el diagrama contra las reglas del Playbook MBB y lista los avisos por severidad (crítica, alta, media, baja). → [Manual §5.15](manual/README.md#515-validación-del-playbook-panel-lint)

## M

**Macroproceso.** Gran área de procesos a la que pertenece el proceso (por ejemplo, abastecimiento o ventas). Se elige junto a la industria y da nombre al carril único de la vista Ejecutivo. → [Manual §5.2](manual/README.md#52-empezar-un-proceso)

**Mapa de valor Lean (VA/BVA/NVA).** Clasificación de cada actividad según el valor que aporta: **VA** (añade valor al cliente), **BVA** (necesaria para el negocio) o **NVA** (no añade valor). → [Manual §5.14](manual/README.md#514-simulación-y-análisis)

**Marcador de actividad.** Símbolo BPMN que indica cómo se ejecuta una tarea: **subproceso** (agrupa otro flujo), **loop** (se repite) o **multi-instancia** (varias a la vez o en secuencia). → [Manual §5.4](manual/README.md#54-propiedades-de-un-elemento)

**Miembro.** Persona añadida a un proyecto con un rol: propietario, editor, revisor o lector. → [Manual §3.5](manual/README.md#35-añadir-cambiar-o-quitar-miembros)

**Migración.** Cambio versionado de la estructura de la base de datos, que se aplica al desplegar y nunca se edita una vez publicado. También se llama así a la conversión de un proceso de un formato antiguo al esquema v1. → [Modelo de datos](tecnica/modelo-de-datos.md) · [Convenciones](equipo/convenciones.md)

**Minería de procesos (*process mining*).** Técnica que descubre el proceso real a partir de un event log: actividades, transiciones y su frecuencia. → [Manual §5.13](manual/README.md#513-minería-de-event-logs)

**Modelo de IA.** Versión de Claude que hace el trabajo: **Opus 5** (máxima calidad), **Sonnet 5** (más rápido y barato) o **Haiku 4.5** (solo en el editor libre). → [Manual §6.4](manual/README.md#64-niveles-y-modelos)

**Modo básico.** Generación sin IA: el editor extrae actividades por palabras clave. Nada sale del navegador. → [Manual §6.8](manual/README.md#68-modo-básico-sin-ia)

**Modo proyecto.** El editor abierto sobre un proceso de un proyecto. Guarda revisiones en el servidor, usa la IA del servidor y los catálogos de la organización. → [Manual §1](manual/README.md#1-qué-es-processiq)

**Monorepo.** Un solo repositorio con todas las piezas de ProcessIQ (web, API, intermediario y paquetes compartidos). → [Arquitectura](arquitectura.md) · [Desarrollo](tecnica/desarrollo.md)

## N

**Nivel de detalle (niveles de granularidad).** Tres formas de ver el mismo proceso: **Ejecutivo** (5 a 10 etapas, sin carriles), **Actividad** (tareas consecutivas del mismo actor agrupadas) y **Detalle** (todas las tareas). El proceso se guarda completo y cambiar de nivel no llama a la IA. → [Manual §5.7](manual/README.md#57-niveles-de-detalle)

## O

**Observabilidad.** Lo que permite saber si la plataforma funciona: errores registrados, latidos del worker, estado de copias y avisos, reunidos en la pantalla «Sistema». → [Manual §9.6](manual/README.md#96-sistema) · [ADR 15](adr/0015-observabilidad-propia.md)

**Organización.** Unidad a la que pertenecen usuarios, proyectos y catálogos (por ejemplo, un país o una práctica de MBC). Hoy hay una. → [Modelo de datos](tecnica/modelo-de-datos.md)

## P

**Pain (dolor).** Problema del proceso anclado a una actividad, con categoría (traspaso, reproceso, espera, control duplicado, sistema, regulatorio, actividad manual, calidad de datos), severidad y frecuencia. Su puntuación es severidad × frecuencia. → [Manual §5.9](manual/README.md#59-pains) · [§6.9](manual/README.md#69-análisis-de-pains-con-ia)

**Palanca (de reingeniería).** Tipo de cambio que mejora el proceso: eliminar, automatizar, simplificar, paralelizar o reasignar. Se usan en el To-Be y en el comparador What-If. → [Manual §5.11](manual/README.md#511-vistas-as-is-y-to-be)

**Paquete.** Bloque de código compartido del monorepo (modelo, motor de diagrama, BPMN, exportación, documentos, minería, analítica, IA, base de datos). → [Paquetes](tecnica/paquetes.md)

**Plantilla de proceso.** Proceso de referencia de la organización del que se parte al crear otro en un proyecto. La crea un administrador desde una revisión («Guardar como plantilla»), sin el cliente ni las personas de la gobernanza. → [Manual §4.1](manual/README.md#41-crear-un-proceso) · [§9.3](manual/README.md#93-catálogos) · [API](tecnica/api.md#plantillas-de-proceso)

**Playbook MBB.** Estándar de MBC para levantar y diagramar procesos: nombres de actividades y decisiones, granularidad, layout, tipos de ejecución y metadatos obligatorios. El panel «Lint» aplica sus reglas. → [Playbook MBB](mvp/PLAYBOOK_MBB.md) · [Manual §5.15](manual/README.md#515-validación-del-playbook-panel-lint)

**Presupuesto de IA.** Tope mensual de gasto en IA de la organización, en dólares a precio de lista. Hay además un **límite por persona**. Al alcanzarlos, la IA del servidor deja de estar disponible hasta el mes siguiente o hasta que se amplíen. → [Manual §6.11](manual/README.md#611-límites-de-gasto)

**Proceso.** Un flujo de trabajo modelado en ProcessIQ. Dentro de un proyecto, guarda su historia como revisiones. → [Manual §4](manual/README.md#4-procesos-y-revisiones)

**Producción.** El entorno que usan los consultores, en `https://mbc.asissoft.com`. Recibe la misma versión que antes se validó en staging. → [Runbook de despliegue](runbooks/despliegue.md)

**Propietario.** Rol de proyecto con todas las capacidades: editar, aprobar, gestionar miembros, archivar y reactivar. Todo proyecto conserva al menos uno. → [Manual §3.4](manual/README.md#34-roles-en-un-proyecto)

**Proxy corporativo.** Filtro de la red de la empresa que puede bloquear dominios recién creados. Si bloquea la plataforma, TI debe habilitar el dominio. → [Manual §10](manual/README.md#10-preguntas-frecuentes-y-problemas-comunes)

**Proyecto.** Espacio de trabajo de un encargo con un cliente: agrupa procesos y define quién participa y con qué rol. → [Manual §3](manual/README.md#3-proyectos)

**Punto de registro.** Archivo del núcleo donde una iniciativa puede añadir sus propias líneas (una ruta, una entrada de menú, sus tablas) sin tocar nada más. → [Nueva iniciativa](equipo/nueva-iniciativa.md#puntos-de-registro)

## R

**RACI.** Matriz que asigna a cada actividad quién la ejecuta (**R**esponsable), quién rinde cuentas (**A**probador), a quién se consulta (**C**) y a quién se informa (**I**). → [Manual §5.12](manual/README.md#512-copiloto-y-comandos)

**Referencia de error.** Código que acompaña a un error inesperado del servidor («Error interno del servidor (referencia …)»). Sirve para localizarlo en la pantalla «Sistema». → [Manual §9.6](manual/README.md#96-sistema)

**Reserva.** Anotación en el registro de iniciativas de un nombre (ruta, tabla, variable, puerto, clave del navegador, número de ADR) antes de usarlo, para que dos equipos no choquen. → [Registro de iniciativas](iniciativas/README.md)

**Revisión.** Versión numerada (v1, v2…) de un proceso de proyecto, con autor, fecha, mensaje y estado. Cada «Guardar revisión» crea una nueva; su contenido nunca se sobrescribe. → [Manual §4](manual/README.md#4-procesos-y-revisiones) · [Modelo de datos](tecnica/modelo-de-datos.md)

**Revisor.** Rol de proyecto que consulta y aprueba o devuelve revisiones. No guarda cambios. → [Manual §3.4](manual/README.md#34-roles-en-un-proyecto)

**Rol de organización.** Administrador, Consultor o Lector: define qué puede hacer una persona en toda la plataforma. → [Manual §9.1](manual/README.md#91-roles-de-organización) · [Seguridad](tecnica/seguridad.md)

**Rol de proyecto.** Propietario, Editor, Revisor o Lector: define qué puede hacer una persona dentro de un proyecto. → [Manual §3.4](manual/README.md#34-roles-en-un-proyecto) · [Seguridad](tecnica/seguridad.md)

**Runbook.** Procedimiento paso a paso para una tarea de operación: desplegar, rotar secretos, atender un incidente de IA, restaurar copias. → [Runbooks](runbooks/)

## S

**Score MBB.** Puntuación de 0 a 100 del panel «Lint»: parte de 100 y resta según la gravedad de cada aviso. → [Manual §5.15](manual/README.md#515-validación-del-playbook-panel-lint)

**Sesión.** Tu acceso abierto en la plataforma tras entrar. Caduca tras unas horas y se cierra con «Salir». → [Manual §2.5](manual/README.md#25-cuánto-dura-la-sesión) · [Seguridad](tecnica/seguridad.md)

**Shell (plataforma de proyectos).** Las pantallas de `/proyectos/`: acceso, proyectos, procesos, revisiones, importación y administración. El editor es una página aparte. → [Web](tecnica/web.md)

**Simulador.** Panel «Sim» del editor: con tiempos y volúmenes de cada actividad calcula esfuerzo, FTE, lead time, costo y ahorro esperado. → [Manual §5.14](manual/README.md#514-simulación-y-análisis)

**SIPOC.** Vista de alto nivel del proceso en cinco columnas: proveedores (*Suppliers*), entradas (*Inputs*), proceso (*Process*), salidas (*Outputs*) y clientes (*Customers*). → [Manual §5.12](manual/README.md#512-copiloto-y-comandos)

**Sistema (pantalla).** Pantalla de administración con el estado de la API, la base de datos, el worker y la IA, las copias de seguridad y los errores recientes, con avisos. → [Manual §9.6](manual/README.md#96-sistema)

**SLA (acuerdo de nivel de servicio).** Plazo comprometido para una actividad (por ejemplo, «≤ 2 h»). Se anota en sus propiedades y puede modelarse con un evento de borde temporizador. → [Manual §5.4](manual/README.md#54-propiedades-de-un-elemento)

**Staging.** Entorno de prueba, en `https://staging.mbc.asissoft.com`, donde se valida cada versión antes de pasarla a producción. → [Runbook de despliegue](runbooks/despliegue.md) · [ADR 16](adr/0016-staging-mismo-servidor.md)

**Swimlane.** Ver *Carril*.

## T

**Tema PPTX.** Conjunto de colores, tipografías, logotipos, carátula y lámina de cierre con que se exporta la presentación. De fábrica hay MBC y BBVA; los administradores crean temas de cliente para su organización. → [Manual §7](manual/README.md#7-exportar) · [§9.3](manual/README.md#93-catálogos)

**Tipo de tarea (tipo de ejecución).** Cómo se ejecuta una actividad: manual, de usuario en sistema, automática (servicio), con IA, entre otras. Define el chip de color y el prefijo del código de actividad. → [Manual §5.4](manual/README.md#54-propiedades-de-un-elemento)

**To-Be.** La vista del proceso rediseñado, como debería funcionar. Se crea clonando el As-Is o con «To-Be IA». → [Manual §5.11](manual/README.md#511-vistas-as-is-y-to-be)

**Token.** Unidad en que los modelos de IA miden el texto que leen (entrada) y escriben (salida). El coste de cada ejecución depende de los tokens. → [Manual §6.5](manual/README.md#65-estimación-de-coste) · [IA](tecnica/ia.md)

**Transcripción.** Texto de una entrevista o reunión. Si trae nombres de participantes, el editor pide el rol de cada uno para usarlo como carril. → [Manual §6.2](manual/README.md#62-generar-un-proceso-desde-documentos-o-transcripciones)

## V

**Variables de entorno.** Ajustes del servidor que no están en el código: dominio, base de datos, clave de IA, presupuestos, duración de la sesión. → [Configuración](tecnica/configuracion.md)

**Verbos del Playbook.** Catálogo de verbos en infinitivo con que deben empezar las actividades. Los **permitidos** no generan aviso; los **prohibidos** muestran en «Lint» el motivo y la alternativa. → [Manual §9.3](manual/README.md#93-catálogos) · [Playbook MBB](mvp/PLAYBOOK_MBB.md)

**Vista.** Cada una de las dos versiones del proceso en el editor: As-Is o To-Be. → [Manual §5.11](manual/README.md#511-vistas-as-is-y-to-be)

## W

**What-If.** Comparador de escenarios: aplicas palancas al As-Is y ves cómo cambian FTE, lead time y costo. → [Manual §5.14](manual/README.md#514-simulación-y-análisis)

**Worker (de IA).** Servicio del servidor que toma las ejecuciones de la cola, llama a la IA, reintenta ante cortes y registra tokens y coste. → [IA](tecnica/ia.md) · [Manual §9.6](manual/README.md#96-sistema)
