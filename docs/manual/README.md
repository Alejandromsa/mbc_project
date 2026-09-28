# Manual de uso de ProcessIQ

Guía para consultores, managers y administradores: cómo entrar, organizar proyectos, dibujar y aprobar procesos, usar la IA y exportar entregables.

Actualizado: 28-sep-2026.

Los términos del producto se explican en el [glosario](../glosario.md).

## Índice

1. [Qué es ProcessIQ](#1-qué-es-processiq)
2. [Acceso](#2-acceso)
3. [Proyectos](#3-proyectos)
4. [Procesos y revisiones](#4-procesos-y-revisiones)
5. [El editor](#5-el-editor)
6. [Inteligencia artificial](#6-inteligencia-artificial)
7. [Exportar](#7-exportar)
8. [Importar trabajo a un proyecto](#8-importar-trabajo-a-un-proyecto)
9. [Administración](#9-administración)
10. [Preguntas frecuentes y problemas comunes](#10-preguntas-frecuentes-y-problemas-comunes)

---

## 1. Qué es ProcessIQ

ProcessIQ es la herramienta de MBC para **diagramar, diagnosticar y reingenierizar procesos** con notación BPMN 2.0. Acompaña el ciclo de un levantamiento: levantar, diagramar, diagnosticar, reingenierizar y presentar.

Con ProcessIQ puedes:

- generar el diagrama a partir de documentos, transcripciones de entrevistas o event logs;
- dibujarlo y corregirlo a mano, con carriles por rol;
- capturar pains, KPIs, tiempos y volúmenes, y simular escenarios;
- proponer el To-Be;
- exportar a PowerPoint, Word, Ficha de Proceso, BPMN, imagen o JSON.

### Los dos modos

Hay un solo editor, que funciona de dos maneras:

| | Editor libre | Plataforma de proyectos |
|---|---|---|
| Dirección | `https://mbc.asissoft.com/` | `https://mbc.asissoft.com/proyectos/` |
| Cuenta | No hace falta | Sí; la crea un administrador |
| Dónde se guarda el trabajo | En tu navegador, un proceso a la vez | En el servidor, como revisiones de cada proceso |
| Compartir | Exportando archivos | Con los miembros del proyecto |
| Versiones y aprobación | No | Sí: borrador → en revisión → aprobada |
| IA | Con el código del equipo o tu propia clave | IA del servidor, con presupuesto y coste registrado |
| Catálogos (KPIs, verbos, temas PPTX) | Los de fábrica | Los de tu organización |

Sabes que estás en un proceso de proyecto porque sobre el lienzo aparece una barra con el nombre del proyecto y del proceso (ver [4.3](#43-la-barra-del-proyecto-en-el-editor)).

> ProcessIQ está pensado para escritorio. En una pantalla estrecha verás el aviso «ProcessIQ está optimizado para escritorio»; puedes pulsar «Continuar de todos modos», pero la experiencia es mejor en una laptop o un monitor.

---

## 2. Acceso

La plataforma usa **cuentas locales**: correo y contraseña, creadas por un administrador. (El inicio de sesión con la cuenta corporativa llegará más adelante.)

### 2.1 Entrar

1. Abre `https://mbc.asissoft.com/proyectos/`.
2. Escribe tu **Correo** y tu **Contraseña**.
3. Pulsa «Entrar».

Si tienes la sesión abierta en otra pestaña, entras directamente. Si llegaste desde un enlace a un proceso, al entrar vuelves a ese proceso.

¿No tienes cuenta o no recuerdas la contraseña? Pídesela a un administrador. Mientras tanto puedes usar el editor sin cuenta (el enlace está en la pantalla de acceso); el trabajo queda en tu navegador.

### 2.2 Contraseña temporal y cambio obligatorio

Cuando un administrador crea tu cuenta o restablece tu contraseña, recibes una **contraseña temporal**. Con ella solo puedes hacer una cosa: elegir una propia.

1. Entra con la contraseña temporal.
2. Verás «Estás usando una contraseña temporal. Elige una propia para continuar.»
3. Escribe la **Contraseña temporal**, la **Contraseña nueva** y repítela.
4. Pulsa «Guardar contraseña».

La contraseña nueva debe:

- tener al menos 10 caracteres;
- no ser solo números;
- no contener tu usuario de correo (lo que va antes de la @);
- ser distinta de la actual.

### 2.3 Cambiar tu contraseña

1. En la cabecera, pulsa «Cambiar contraseña».
2. Escribe la **Contraseña actual**, la nueva y repítela.
3. Pulsa «Guardar contraseña».

### 2.4 Cerrar sesión

Pulsa «Salir», a la derecha de la cabecera. La página se recarga y no queda en memoria nada de tu sesión.

### 2.5 Cuánto dura la sesión

- La sesión caduca tras unas horas (12 por defecto; lo configura quien opera el servidor). Al caducar, la plataforma te lleva a «Entrar» y después te devuelve donde estabas.
- Tras más de 10 intentos fallidos en 15 minutos, el acceso se bloquea: «Demasiados intentos fallidos. Espera 15 minutos y vuelve a intentarlo.»

### 2.6 La cabecera de la plataforma

| Elemento | Qué hace |
|---|---|
| «Proyectos» | Tu lista de proyectos |
| «Usuarios», «Catálogos», «Auditoría», «IA», «Sistema» | Solo administradores (ver [9](#9-administración)) |
| «Editor libre» | Abre el editor sin proyecto; el trabajo queda en este navegador |
| Tu nombre y tu rol | Rol en la organización: Administrador, Consultor o Lector |
| «Cambiar contraseña» · «Salir» | Ver arriba |

---

## 3. Proyectos

Un proyecto agrupa los procesos de un trabajo con un cliente y define **quién participa y con qué rol**.

### 3.1 Ver tus proyectos

En «Proyectos» ves los proyectos en los que participas. Un administrador ve todos los de la organización.

Cada tarjeta muestra el nombre, el cliente, tu rol y la fecha de creación. Los archivados se ocultan; marca «Mostrar archivados» para verlos.

### 3.2 Crear un proyecto

Pueden crear proyectos los consultores y los administradores (no los lectores).

1. En «Proyectos», pulsa «Nuevo proyecto».
2. Escribe el **Nombre** (por ejemplo, «Diagnóstico de compras»), el **Cliente** (por ejemplo, «Cliente Demo») y, si quieres, una **Descripción**.
3. Pulsa «Crear proyecto».

Quedas como **propietario**: puedes añadir miembros y aprobar revisiones.

### 3.3 Editar, archivar y reactivar

Solo el propietario (o un administrador).

- **Editar:** en el proyecto, pulsa «Ajustes», cambia nombre, cliente o descripción y pulsa «Guardar».
- **Archivar:** en «Ajustes», pulsa «Archivar proyecto» y confirma. El proyecto pasa a **solo lectura** para todos: se puede consultar, pero no se guardan revisiones, no se aprueba, no se usa la IA y no se cambian miembros.
- **Reactivar:** en «Ajustes», pulsa «Reactivar proyecto».

Los proyectos, procesos y revisiones no se borran desde la plataforma.

### 3.4 Roles en un proyecto

| Qué puedes hacer | Propietario | Editor | Revisor | Lector |
|---|---|---|---|---|
| Ver el proyecto, sus procesos y revisiones; abrirlos en el editor y exportar | Sí | Sí | Sí | Sí |
| Crear y renombrar procesos | Sí | Sí | — | — |
| Guardar revisiones desde el editor | Sí | Sí | — | — |
| Usar la IA del servidor en el editor | Sí | Sí | — | — |
| Enviar una revisión a revisión | Sí | Sí | — | — |
| Aprobar o devolver una revisión | Sí | — | Sí | — |
| Cambiar datos del proyecto, archivar o reactivar | Sí | — | — | — |
| Añadir, quitar o cambiar el rol de los miembros | Sí | — | — | — |

- Un **administrador** de la organización tiene en todos los proyectos los mismos permisos que un propietario, aunque no sea miembro.
- Un revisor o un lector pueden abrir el proceso en el editor y tocarlo, pero esos cambios **no se guardan en el proyecto**: el editor lo avisa.
- Si no eres miembro de un proyecto, no lo ves: la plataforma responde como si no existiera.

### 3.5 Añadir, cambiar o quitar miembros

Solo el propietario (o un administrador), y con el proyecto sin archivar.

**Para añadir un miembro:**

1. En el proyecto, sección «Miembros», pulsa «Añadir miembro».
2. Elige la **Persona** y su **Rol en el proyecto**.
3. Pulsa «Añadir».

Solo aparecen las cuentas activas que aún no son miembros. Si la persona no tiene cuenta, pide a un administrador que la cree.

**Para cambiar un rol:** elige el nuevo rol en la columna «Rol» de la tabla de miembros.

**Para quitar a alguien:** pulsa «Quitar» en su fila y confirma.

> Un proyecto debe conservar al menos un propietario.

---

## 4. Procesos y revisiones

Cada proceso de un proyecto guarda su historia como **revisiones** numeradas (v1, v2, v3…). Cada vez que guardas desde el editor se crea una revisión nueva; las anteriores no cambian.

### 4.1 Crear un proceso

Necesitas rol de editor o propietario.

1. En el proyecto, pulsa «Nuevo proceso».
2. En «Partir de», elige:
   - **Un proceso vacío:** lo dibujas o lo generas en el editor.
   - **Una plantilla de la organización** (solo aparece si hay alguna): elige la plantilla en «Plantilla». Debajo ves su descripción. El proceso nace con la versión 1 copiada de la plantilla, con el nombre que le des y el cliente de tu proyecto.
   - **Un JSON exportado del editor:** elige un archivo `.json` exportado con «Exportar → JSON · proyecto». Si el JSON trae nombre, se rellena solo; su contenido queda como v1.
3. Escribe el **Nombre del proceso** (por ejemplo, «Proceso de compras»).
4. Pulsa «Crear proceso».

### 4.2 Abrir un proceso en el editor

- Desde el proyecto: pulsa «Abrir en el editor» en la fila del proceso. Se abre su **última** revisión.
- Desde la página del proceso: pulsa «Abrir la última versión en el editor» (o «Empezar a dibujarlo en el editor» si aún no tiene revisiones).
- Para abrir una revisión concreta: en la tabla «Revisiones», pulsa «Abrir» en su fila.

### 4.3 La barra del proyecto en el editor

Sobre el lienzo verás una barra con:

- «←»: vuelve a la página del proceso.
- La ruta: *Proyecto › Proceso*.
- El detalle: la versión abierta y su estado (por ejemplo, «v3 · Borrador»), si hay una más nueva («la última es la v5») y tu rol, o «solo lectura».
- «Cambios sin guardar», cuando los hay.
- El botón «Guardar revisión».

> El indicador «Guardado» de la barra inferior del lienzo se refiere a **tu navegador**. El proyecto solo recibe los cambios cuando pulsas «Guardar revisión».

### 4.4 Guardar una revisión

1. Pulsa «Guardar revisión» (o `Ctrl+S`).
2. En «¿Qué cambiaste? (opcional, lo verá el equipo)», escribe un mensaje corto. Por ejemplo: «Añadida la aprobación de gerencia».
3. Pulsa «Guardar».

Se crea la versión siguiente **en borrador**. Verás «Guardada como v4 (borrador).»

Si el proceso tiene errores de estructura, no se guarda: el aviso «El proceso tiene errores y no se puede guardar:» lista qué corregir.

### 4.5 Borrador local y su recuperación

Mientras editas un proceso de proyecto, el editor guarda una copia en **tu navegador**, aparte de la del editor libre. Sirve de red de seguridad:

- Si cierras la pestaña o el navegador con cambios sin guardar, el navegador te avisa antes de salir.
- Si vuelves a abrir el proceso y hay cambios sin guardar, verás el diálogo «Tienes cambios sin guardar»:
  - «Recuperar mis cambios»: sigues donde lo dejaste.
  - «Descartarlos»: se abre la versión del servidor y la copia local se pierde.
  - Si los cambios eran sobre otra versión, el botón dice «Seguir con mis cambios sobre la vN».

El borrador local solo existe en ese navegador y en ese equipo. Para que el equipo vea tu trabajo, guarda una revisión.

### 4.6 Aviso de conflicto

Nada se pierde cuando dos personas trabajan en el mismo proceso: se guardan las dos versiones y se avisa.

- **Antes de guardar:** si abriste una versión que ya no es la última, el diálogo lo dice: «Estás trabajando sobre la v3, pero la última es la v5: la versión nueva no incluirá los cambios de la v5.»
- **Después de guardar:** si alguien guardó mientras trabajabas, verás: «Guardada como v6. Mientras trabajabas, alguien guardó la v5: esta versión no incluye esos cambios. Revisa las dos en el proyecto.»
- En la tabla «Revisiones», una versión así lleva la marca «a partir de vN».

**Para resolver un conflicto:**

1. Abre las dos versiones desde la tabla «Revisiones».
2. Decide cuál es la buena y pasa a ella los cambios que falten.
3. Guarda una revisión nueva con un mensaje que lo explique.

### 4.7 Ciclo de aprobación

Cada revisión tiene uno de tres estados:

| Estado | Qué significa | Quién la mueve y cómo |
|---|---|---|
| Borrador | Trabajo en curso | Editor o propietario: «Enviar a revisión» |
| En revisión | Pendiente de aprobación | Revisor o propietario: «Aprobar» o «Devolver» (vuelve a borrador) |
| Aprobada | Versión oficial | Ya no cambia |

**Para aprobar una revisión:**

1. Abre la página del proceso.
2. Revisa la versión (pulsa «Abrir» para verla en el editor).
3. En su fila, pulsa «Aprobar». Si hay que corregirla, pulsa «Devolver».

### 4.8 Qué significa que una aprobada sea inmutable

- El contenido de **ninguna** revisión se sobrescribe: cada guardado crea una versión nueva.
- Una revisión **aprobada**, además, ya no cambia de estado: no se puede devolver ni volver a aprobar.
- Para cambiar un proceso aprobado: ábrelo en el editor, haz los cambios y pulsa «Guardar revisión». Nace una versión nueva en borrador, que sigue su propio ciclo. La aprobada queda intacta como referencia.

### 4.9 Renombrar un proceso

En la página del proceso, pulsa «Renombrar», escribe el nombre y pulsa «Guardar». Necesitas rol de editor o propietario.

---

## 5. El editor

El editor es igual en los dos modos. Esta sección describe sus partes y cómo hacer las tareas habituales.

### 5.1 La pantalla

| Zona | Qué contiene |
|---|---|
| Cabecera | Nombre del proceso; «Industria y macroproceso» (la flecha junto al nombre); vistas «As-Is» y «To-Be»; «Clonar As-Is a To-Be»; «To-Be IA»; «Nuevo»; «Ingestar»; «Importar proyecto JSON»; ✨ «Ajustes de IA»; «⛶ Presentar»; «Exportar» |
| Riel izquierdo | «Añadir», «Conectar», «Eliminar», «Ordenar» |
| Lienzo | El diagrama, con un carril por rol |
| Barra inferior | Número de nodos y conexiones, modo, estado de guardado, nivel de detalle («Ejecutivo», «Actividad», «Detalle») y zoom |
| Esquina del lienzo | Deshacer, rehacer, «Autoajustar» y atajos de teclado («?») |
| Riel derecho | Paneles «Props», «Pains», «KPIs», «Sim», «Lint», «Ficha», «IA» y «Leyenda» |

**Los paneles del riel derecho** se abren sobre el lienzo:

- Al seleccionar un nodo se abre «Props»; al deseleccionarlo, se cierra.
- Si abres un panel con su icono, queda abierto hasta que pulses el mismo icono, la ✕ o `Esc`.

### 5.2 Empezar un proceso

Con el lienzo vacío verás tres opciones:

- **«Ingestar fuente»**: genera el diagrama desde documentos, una transcripción o un event log (ver [6.2](#62-generar-un-proceso-desde-documentos-o-transcripciones) y [5.13](#513-minería-de-event-logs)).
- **«Cargar ejemplo»**: abre un proceso de ejemplo completo para explorar.
- **«Dibujar manual»**: usa «Añadir» en el riel izquierdo o el copiloto.

Completa el **nombre** del proceso en la cabecera y, con la flecha de al lado, la **Industria** y el **Macroproceso**. La industria filtra la librería de KPIs.

### 5.3 Añadir y conectar elementos

**Para añadir un elemento:**

1. Pulsa «Añadir» en el riel izquierdo.
2. Arrastra la forma al lienzo: «Inicio», «Actividad», «Decisión», «Documento», «Data», «Sistema» o «Fin».

**Para conectar dos elementos:**

1. Pulsa «Conectar» (o la tecla `C`). La barra inferior dice «Modo: conexión (click origen y destino)».
2. Haz clic en el origen y después en el destino.
3. Pulsa `Esc` o «Conectar» otra vez para salir del modo.

**Para editar textos:**

- Doble clic en un nodo: cambia su etiqueta.
- Doble clic en una conexión: cambia su etiqueta (por ejemplo, «Sí», «No», «Aprobado»).

**Para eliminar:** selecciona el elemento y pulsa «Eliminar» o `Supr`.

**Para mover:** arrastra la caja. Las flechas la siguen.

### 5.4 Propiedades de un elemento

Selecciona un nodo y usa el panel «Props»:

| Campo | Para qué |
|---|---|
| Tipo de bloque BPMN | Inicio, evento intermedio, actividad, sistema, decisión, documento, data o fin |
| Código actividad | Código como `USR-27`; se asigna solo según el tipo de tarea |
| Tipo de gateway BPMN | En decisiones: exclusivo (XOR), paralelo (AND) o inclusivo (OR) |
| Tipo de evento BPMN · Evento de terminación | En eventos: mensaje, temporizador, error, señal; terminación corta toda la instancia |
| Etiqueta | El nombre, con la forma *verbo + objeto*: «Validar identidad del cliente» |
| Tipo de tarea (marcador BPMN) | Manual, de sistema, automática, IA, etc. Define el chip y el código |
| Marcador de actividad BPMN | Subproceso, loop o multi-instancia |
| Evento de borde BPMN | Excepción o SLA sobre la tarea (timer, error, mensaje) |
| Responsable / Rol | **Define el carril** donde va la actividad |
| Sistema soporte | Por ejemplo, «ERP», «CRM» |
| Tiempo (min) · Volumen / mes | Alimentan el simulador |
| Valor añadido · SLA | VA, BVA o NVA; nivel de servicio |
| Documentos entrada · Documentos salida · Reglas / criterios de decisión · Notas | Información para la ficha y el informe |

### 5.5 Carriles

Cada **rol** distinto del campo «Responsable / Rol» es un carril (swimlane). Para mover una actividad a otro carril, cambia su responsable. Para reordenar el diagrama, pulsa «Ordenar».

### 5.6 Ordenar, autoajustar y navegar

- **«Ordenar»** (riel izquierdo): recalcula la disposición completa por carriles.
- **«Autoajustar»** (esquina del lienzo): prueba varias disposiciones, mide cruces y flechas sobre cajas, y aplica la mejor.
- **Zoom:** botones `−` y `＋` de la barra inferior, `Ctrl` + rueda del ratón (acerca hacia el cursor), o `Ctrl +` / `Ctrl −`. Clic en el porcentaje vuelve a 100 %.
- **«⤢ Ajustar»** o la tecla `F`: encuadra todo el proceso.
- **Desplazarte:** arrastra sobre una zona vacía del lienzo; la rueda desplaza en vertical y, al llegar al final, en horizontal; `Shift` + rueda desplaza en horizontal.

### 5.7 Niveles de detalle

En la barra inferior eliges cómo ver el proceso:

| Nivel | Qué muestra | Para qué |
|---|---|---|
| «Ejecutivo» | El proceso de punta a punta en 5 a 10 etapas, sin carriles | Comité o SteerCo |
| «Actividad» | Agrupa tareas consecutivas del mismo actor | El equilibrio habitual |
| «Detalle» | Todas las tareas, como se levantaron | Manual de procedimientos o automatización |

- El proceso se guarda siempre completo. Cambiar de nivel es instantáneo, no pierde nada y **no vuelve a llamar a la IA**.
- Junto a los botones verás cuántos pasos quedan: «9 de 33 pasos».
- Lo que exportas es lo que ves: exporta en «Ejecutivo» si quieres una lámina de comité.

### 5.8 Ficha de proceso

El panel «Ficha» recoge los metadatos corporativos de la Ficha de Proceso:

- Código y Versión; Objetivo; Alcance (áreas involucradas, con qué inicia, con qué termina, qué incluye o excluye); Descripción.
- Listas, **una fila por línea y campos separados por `|`**:
  - Gobernanza: `Rol | Cargo | Nombre | Fecha` (por ejemplo, `Dueño | Jefe de Compras | Nombre Apellido | 10/09/2026`).
  - Sistemas: `Sistema | Uso`.
  - Términos: `Término | Definición`.
  - Anexos: `Código | Nombre`.
  - Control de cambios: `Versión | Fecha | Descripción`.

Las actividades, los sistemas, los responsables y el diagrama se toman solos del lienzo.

**Para generar la ficha:** pulsa «Generar ficha», revisa la vista previa y pulsa «⬇️ Descargar Word».

### 5.9 Pains

Un pain es un dolor del proceso anclado a una actividad.

**Para capturar un pain:**

1. Selecciona la actividad.
2. Abre el panel «Pains».
3. Elige la categoría (traspaso, reproceso, espera, control duplicado, sistema, regulatorio, actividad manual o calidad de datos) y describe el dolor.
4. Indica **Severidad** y **Frecuencia** (de 1 a 5).
5. Pulsa «+ Agregar pain».

Cada pain muestra su puntuación: severidad × frecuencia. Para quitarlo, pulsa su ✕.

La IA también puede detectarlos (ver [6.9](#69-análisis-de-pains-con-ia)).

### 5.10 KPIs

El panel «KPIs» muestra la **Librería de KPIs**, filtrada por la industria del proceso (más los transversales). Puedes buscar con «Buscar KPI...» o cambiar el filtro de industria.

**Para registrar el valor actual de un KPI:**

1. Haz clic en la tarjeta del KPI.
2. Completa «Valor actual del cliente», «Gap vs benchmark» y «Fuente del dato».
3. Acepta. La tarjeta muestra el valor y el gap.

En un proceso de proyecto, la librería es la de tu organización (ver [9.3](#93-catálogos)).

### 5.11 Vistas As-Is y To-Be

Cada proceso tiene dos vistas: **As-Is** (cómo es hoy) y **To-Be** (cómo debería ser). Cambias con los botones «As-Is» y «To-Be» de la cabecera. En To-Be verás el rótulo «TO-BE · REINGENIERÍA» sobre el lienzo.

- **«Clonar As-Is a To-Be»** (icono de copiar): copia el As-Is al To-Be para editarlo sin tocar el original.
- **«To-Be IA»**:
  - con IA disponible, la IA redacta en el panel «IA» una propuesta de To-Be para este proceso (diagnóstico, tabla de cambios, flujo propuesto y riesgos). Es texto: el diagrama To-Be lo ajustas tú;
  - sin IA, abre «✨ Transformar a To-Be por nivel»: eliges **Operativo** (quick wins, 0-3 meses), **Táctico** (rediseño de flujo, 3-9 meses) o **Estratégico** (reimaginar, 9-18 meses) y el editor aplica palancas por reglas (automatizar, digitalizar, autoservicio…) sobre una copia del As-Is. El resumen de cambios aparece en el panel «IA».

El PPTX incluye una lámina comparativa As-Is vs To-Be cuando existe el To-Be.

### 5.12 Copiloto y comandos

El panel «IA» es el **copiloto**. Tiene acciones rápidas y un cuadro de comandos.

**Acciones rápidas:**

| Botón | Con IA disponible | Sin IA |
|---|---|---|
| «Generar proceso desde descripción» | Genera con IA por el mismo camino que la ingesta | Modo básico por palabras clave |
| «Sugerir KPIs aplicables», «Proponer reingeniería to-be», «Generar matriz RACI», «Generar SIPOC», «Matriz impacto-esfuerzo», «Oportunidades de automatización», «Cuello de botella / ruta crítica», «Backlog de iniciativas», «Resumen ejecutivo» | Informe de la IA sobre este proceso, en texto, dentro del panel | Resultado local, por reglas o plantillas; RACI, SIPOC e impacto-esfuerzo abren una matriz |
| «Analisis profundo de dolores (IA)» | Ver [6.9](#69-análisis-de-pains-con-ia) | Pide configurar la IA |
| «Detectar pains en el diagrama», «Comparador de escenarios (What-If)», «Análisis de variantes (event log)», «Mapa de valor Lean (VA/NVA)», «Autoajustar (verificar cruces)», «Reorganizar diagrama (compactar)», «Insertar compuertas de convergencia» | Siempre locales, sin IA | Igual |

> Los informes de la IA en el copiloto **no se guardan con el proceso**. Copia lo que necesites antes de cerrar.

**Comandos de edición.** Escribe en el cuadro del copiloto y pulsa «Enviar». Entiende estas órdenes (los nombres se buscan por coincidencia con la etiqueta):

| Orden | Ejemplo |
|---|---|
| Agregar antes o después | `agregar Validar presupuesto después de Registrar solicitud` |
| Eliminar | `eliminar Aprobar pedido` (reconecta el flujo) |
| Renombrar | `renombrar Revisar pedido a Validar pedido` |
| Conectar | `conectar Registrar solicitud con Emitir orden` |
| Marcar el tipo de tarea | `marcar Emitir orden como automático` (también manual, sistema, rpa, ia, correo…) |
| Generar | Un texto con «genera», «levanta» o «dibuja» inicia la generación con IA |

El cuadro no es una conversación libre con la IA: fuera de estas órdenes responde con ayudas fijas.

### 5.13 Minería de event logs

Construye el proceso a partir de los registros de un sistema.

1. Pulsa «Ingestar» y abre la pestaña «🗄 Event Log (Process Mining)».
2. Sube un CSV con las columnas `case_id`, `activity` y `timestamp` (y, si quieres, `resource`). Para probar, pulsa «📋 Usar muestra».
3. Revisa la vista previa y asigna las columnas en los selectores.
4. Pulsa «Descubrir proceso →».

El número de cada conexión es la **frecuencia observada**. Las actividades frecuentes que reaparecen indican reprocesos. Después, «Análisis de variantes (event log)» en el copiloto muestra los caminos más comunes.

### 5.14 Simulación y análisis

**Simulador de carga (panel «Sim»).**

1. Completa «Tiempo (min)» y «Volumen / mes» de cada actividad, en «Props» o con «⚡ Capturar tiempos rápido (wizard)».
2. Ajusta «Costo FTE mensual (PEN)», «Horas hábiles/mes» y «% reducción esperada to-be».
3. Pulsa «▶ Ejecutar simulación».

Obtienes esfuerzo total, FTE actual, lead time del flujo, costo mensual, FTE to-be y ahorro anual.

**Otros análisis del copiloto (locales):**

- «Comparador de escenarios (What-If)»: eliges palancas y comparas FTE, lead time y costo contra el As-Is.
- «Cuello de botella / ruta crítica», «Oportunidades de automatización», «Backlog de iniciativas», «Matriz impacto-esfuerzo», «Generar matriz RACI», «Generar SIPOC» y «Mapa de valor Lean (VA/NVA)».

Las matrices RACI y SIPOC editables y los resultados del simulador se guardan con el proceso y salen en el PPTX. Ojo: con IA disponible, «Generar matriz RACI» y «Generar SIPOC» piden a la IA un informe en texto en lugar de abrir la matriz editable, y ese informe no llega al PPTX.

### 5.15 Validación del Playbook (panel «Lint»)

El panel «Lint» revisa el diagrama contra el Playbook MBB y da un **Score MBB** de 0 a 100. El icono muestra cuántos avisos hay.

Algunas reglas:

- debe haber un Inicio y al menos un Fin; cada Fin describe un resultado distinto;
- ningún nodo sin entrada o sin salida;
- cada actividad tiene responsable y tipo de tarea;
- la etiqueta empieza por un verbo del catálogo y no es demasiado larga;
- cada decisión se formula como pregunta y etiqueta sus salidas.

Los avisos tienen severidad crítica, alta, media o baja. Haz clic en un aviso para ir al nodo.

> El panel indica que la severidad crítica «bloquea export». Hoy la exportación no se impide; aun así, no entregues un proceso con avisos críticos.

En un proceso de proyecto, los verbos permitidos y prohibidos son los de tu organización.

### 5.16 Deshacer, rehacer y atajos

- Deshacer: botón de la esquina del lienzo o `Ctrl+Z`. Rehacer: `Ctrl+Y` o `Ctrl+Shift+Z`. Guarda los últimos 60 pasos.
- Al abrir una revisión de proyecto, el historial empieza desde esa versión.
- Pulsa `?` para ver todos los atajos.

| Atajo | Acción |
|---|---|
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer |
| `Ctrl +` / `Ctrl −` / `Ctrl 0` | Acercar / alejar / zoom 100 % |
| `F` | Ajustar a la pantalla |
| `C` | Modo conectar |
| `Supr` | Eliminar selección |
| `Esc` | Deseleccionar, salir de un modo o cerrar el panel |
| `Ctrl+S` | Guardar revisión (solo en procesos de proyecto) |

### 5.17 Presentar y leyenda

- **«⛶ Presentar»** oculta paneles y barras para mostrar el diagrama a pantalla completa. Sal con «✕ Salir» o `Esc`.
- **«Leyenda»** (riel derecho) muestra la nomenclatura BPMN: formas, eventos, gateways y marcadores.

### 5.18 Nuevo proceso e importar JSON en el editor

- **«Nuevo»** vacía el lienzo. En el editor libre, lo actual se pierde si no lo exportaste.
- **«Importar proyecto JSON»** (icono de subida) carga un JSON exportado y **reemplaza** el proceso abierto.

En un proceso de proyecto, ambos cambios solo llegan al proyecto si después guardas una revisión.

---

## 6. Inteligencia artificial

La IA (modelos Claude, de Anthropic) interpreta documentos y transcripciones para dibujar el proceso, detecta pains y redacta análisis. Funciona distinto según el modo.

### 6.1 Dónde funciona la IA

| | Editor libre | Proceso de proyecto |
|---|---|---|
| Quién llama a la IA | Tu navegador, a través del intermediario de MBC (con el código del equipo) o directo a Anthropic (con tu propia clave) | El servidor de ProcessIQ |
| Qué necesitas | El **código de acceso del equipo** o tu **API key** | Tener rol de editor o propietario y que el proyecto no esté archivado |
| Coste | Estimado y registrado en tu navegador | Registrado por ejecución; presupuesto mensual y límite por persona |
| Si cierras la pestaña | La generación se pierde | El servidor sigue y el resultado te espera |

**Ajustes de IA (botón ✨ de la cabecera):**

- En el editor libre: eliges el modo «Clave del equipo (intermediario MBC)» (con el «Código de acceso del equipo») o «Mi propia API key», el modelo, y pulsas «Probar conexión». La clave propia se guarda solo en tu navegador; úsala para trabajo interno o demos.
- En un proceso de proyecto: la ventana «IA del proyecto» solo informa. Muestra el estado, los modelos disponibles, el modelo de análisis, el gasto de la organización este mes y tu gasto.

La primera vez que generas en el editor libre sin código, aparece «Interpretar con IA»: escribe el código y pulsa «Usar IA», o pulsa «Modo básico» para seguir sin IA.

### 6.2 Generar un proceso desde documentos o transcripciones

1. Pulsa «Ingestar». Se abre la pestaña «📝 Notas / Documentación».
2. Suelta tus documentos en la zona «Suelta aquí tus documentos» o haz clic para elegirlos. Admite Word (`.docx`), PDF, PowerPoint (`.pptx`), texto y BPMN. Puedes elegir varios a la vez.
3. Para sumar más material, pulsa «+ Anadir otra fuente». También puedes abrir «o pega el texto a mano».
4. Para una entrevista, usa la pestaña «🎤 Audio / Transcripción»: pega la transcripción (o grábala con «🔴 Grabar» en Chrome o Edge) y pulsa «Generar proceso desde transcripción →».
5. Pulsa «Generar proceso» (con varias fuentes, «Combinar N fuentes y generar»).
6. Si hay una transcripción con participantes, aparece «👥 ¿Quién es quién en la reunión?». Escribe el **rol** de cada persona (el rol será el carril, no el nombre) y pulsa «Usar estos roles». Deja en blanco a quien no participa en el proceso (por ejemplo, quien facilita la reunión).
7. En «Nivel de detalle y modelo», elige el nivel y el modelo, revisa el coste estimado y pulsa «Generar».
8. Espera. Al terminar se dibuja el diagrama, se abre el panel «Ficha» y el copiloto resume lo generado y su coste.

En un proceso de proyecto, el resultado **se guarda solo** como una revisión nueva en borrador, con el mensaje «Proceso generado con IA desde…».

Consejos:

- Varias fuentes se combinan en **un solo As-Is**. Si se contradicen, prevalece la más reciente (por ejemplo, la transcripción del levantamiento sobre un diagrama antiguo).
- Un único archivo `.bpmn` sin otras fuentes se importa directamente como diagrama, sin IA.
- Límites por archivo: 40 MB y 120 páginas de PDF. Un PDF escaneado necesita OCR antes; un PDF protegido, que le quites la contraseña.
- La IA lee hasta 180.000 caracteres entre todas las fuentes. Si se superan, verás un aviso ámbar y se recorta el final de las fuentes más largas. Quita lo que no aporte o deja solo los capítulos del proceso.
- El reconocimiento de voz de «🔴 Grabar» lo hace el propio navegador. *Por confirmar:* dónde procesa el audio cada navegador; consúltalo antes de grabar reuniones de clientes.

### 6.3 Qué se envía y qué no

**Se envía a la IA:**

- el **texto extraído** de las fuentes (no los archivos), con su nombre y tipo;
- los roles que indicaste para los participantes;
- el nivel de detalle elegido.

**No se envía:**

- los archivos originales: Word, PDF y PowerPoint se leen **en tu navegador**;
- nada, si usas el modo básico.

**En los análisis** (pains y copiloto) se envía el proceso dibujado (actividades, roles, sistemas, tiempos, decisiones), no las fuentes.

**En un proceso de proyecto**, el servidor borra el texto de las fuentes al terminar la ejecución; solo conserva el nombre y el tamaño de cada una.

### 6.4 Niveles y modelos

El proceso se genera **siempre completo**. El nivel («Ejecutivo», «Actividad» o «Detalle») indica con cuánto detalle lo mira la IA y en qué vista se abre. Después cambias de vista cuando quieras, sin volver a generar (ver [5.7](#57-niveles-de-detalle)).

| Modelo | Cuándo usarlo |
|---|---|
| Claude Opus 5 | Máxima calidad. Procedimientos largos, ambiguos o con muchas decisiones |
| Claude Sonnet 5 | Más rápido y 2,5 veces más barato por token. Suele bastar con textos claros y bien estructurados |

- El modelo que eliges queda como preferencia en tu navegador.
- En un proceso de proyecto solo puedes usar los modelos que permite el servidor. Los análisis (pains y copiloto) usan el modelo de análisis que fija el servidor.
- En el editor libre, «Ajustes de IA» ofrece además Claude Haiku 4.5.

### 6.5 Estimación de coste

Antes de generar, la ventana «Nivel de detalle y modelo» muestra:

- el **rango estimado** de cada modelo para el nivel marcado;
- el **máximo posible**, si la IA usara toda la respuesta;
- el precio de lista por millón de tokens de entrada y de salida.

La primera estimación es inicial; se afina con tus ejecuciones reales en ese navegador. Al terminar, el copiloto muestra el **coste real** («Coste de esta ejecución: US$ …»). Una ejecución que falla a medias también consume: el aviso de error lo indica.

### 6.6 Progreso y cancelar

Durante la generación verás una barra, un cronómetro y mensajes como:

- «En cola en el servidor de IA…»;
- «Interpretando con IA en el servidor… (puede tardar unos minutos)»;
- «Recibiendo el proceso de la IA… N caracteres»;
- «Reintentando en el servidor…», si hubo un corte.

Para parar, pulsa «Cancelar». En un proceso de proyecto, el servidor aborta la llamada.

Reintentos automáticos:

- **Proyecto:** el servidor reintenta hasta 3 veces ante cortes o saturación.
- **Editor libre:** el navegador reintenta una vez si falla la conexión inicial.

### 6.7 Si cierras la pestaña

**En un proceso de proyecto,** la IA sigue trabajando en el servidor. Al volver a abrir el proceso verás «Hay un proceso generado con IA sin guardar»:

- «Dibujarlo y guardarlo»: se dibuja y se guarda como versión nueva; las anteriores no cambian.
- «Descartarlo»: se descarta el resultado.

Si se corta la conexión con el servidor mientras esperas, verás: «Se perdió la conexión con el servidor. La IA sigue trabajando: vuelve a abrir el proceso para recuperar el resultado.»

**En el editor libre,** cerrar la pestaña corta la llamada: el resultado se pierde y lo consumido hasta ese momento se cobra.

### 6.8 Modo básico (sin IA)

Si no hay IA disponible, el editor extrae actividades por **palabras clave**. El copiloto lo dice: «Proceso generado en modo básico (sin IA)». Revisa roles y decisiones a mano. En un proceso de proyecto se usa el modo básico cuando la IA del servidor no está disponible (sin configurar, presupuesto agotado, tu límite alcanzado o tu rol no lo permite).

### 6.9 Análisis de pains con IA

En el copiloto, pulsa «Analisis profundo de dolores (IA)». La respuesta separa dos cosas:

1. **Dolores detectados en el flujo**, con evidencia del propio proceso. Se añaden a sus actividades; los ves en el panel «Pains».
2. **Hipótesis del sector**, que la IA no encontró en este flujo. Solo aparecen en el copiloto, como preguntas para validar con el cliente. No se añaden al diagrama.

### 6.10 Tareas del copiloto con IA

Con IA disponible, estos botones piden a la IA un informe sobre **este** proceso: «Sugerir KPIs aplicables», «Proponer reingeniería to-be», «Generar matriz RACI», «Generar SIPOC», «Matriz impacto-esfuerzo», «Oportunidades de automatización», «Cuello de botella / ruta crítica», «Backlog de iniciativas» y «Resumen ejecutivo». El botón «To-Be IA» de la cabecera hace lo mismo que «Proponer reingeniería to-be».

El informe aparece en el panel «IA», con tablas cuando corresponde. No se guarda con el proceso: cópialo si lo vas a usar.

### 6.11 Límites de gasto

En los procesos de proyecto hay dos topes mensuales, en dólares a precio de lista:

- **Presupuesto de la organización.** Al alcanzarlo: «Se alcanzó el presupuesto mensual de IA de la organización.»
- **Límite por persona.** Al alcanzarlo: «Alcanzaste tu límite mensual de IA.»

Los fija quien opera el servidor. Puedes ver cuánto llevas gastado en ✨ «Ajustes de IA», dentro de un proceso de proyecto. Si necesitas más, habla con un administrador.

---

## 7. Exportar

Pulsa «Exportar» en la cabecera. La exportación se hace **en tu navegador** y el archivo se descarga directamente, con un nombre como `ProcessIQ_Proceso_de_compras_2026-09-28.pptx`.

Se exporta lo que ves: la vista (As-Is o To-Be) y el nivel de detalle activos.

| Opción del menú | Qué obtienes | Para qué |
|---|---|---|
| «JSON · proyecto» | Archivo `.json` con los datos, la ficha y el diagrama de la vista activa | Copia de respaldo; llevar el trabajo a otro equipo o a un proyecto |
| «SVG · vectorial» | Imagen vectorial del diagrama | Documentos y ediciones sin pérdida |
| «PNG · imagen» | Imagen del diagrama con fondo blanco | Correos, chats, documentos |
| «BPMN 2.0 · Bizagi/Camunda» | Archivo BPMN 2.0 estándar | Abrirlo en otras herramientas BPMN |
| «PPTX · MBC» (azul, Montserrat) | Presentación editable con el tema MBC | Entregables de MBC |
| «PPTX · cliente BBVA» (plantilla Flow Value) | Presentación con el tema BBVA | Entregables para ese cliente |
| «PPTX · cliente …» (tema de la organización) | Presentación con un tema creado por tu organización | Solo en procesos de proyecto (ver [9.3](#93-catálogos)) |
| «Word · informe del proceso» | Informe del proceso para Word (`.doc`) | Documentación detallada |
| «Ficha de Proceso · formato corporativo» | Vista previa de la ficha y botón «⬇️ Descargar Word» | Ficha de 12 bloques en formato corporativo |

**Sobre el PPTX:**

- Incluye portada, el flujo (en una o varias láminas), KPIs y, cuando existen, As-Is vs To-Be, SIPOC, RACI y la simulación. Algunos temas añaden una lámina de cierre.
- Es **editable**: cada tarea es un solo objeto con su texto, y las flechas son conectores anclados. Si mueves una caja en PowerPoint, la flecha la sigue.
- Si el flujo no cabe en una lámina, se reparte en bandas y las flechas entre láminas se unen con círculos con letra.
- Las tipografías del tema deben estar instaladas en el equipo donde abras el archivo; si no, PowerPoint las sustituye.
- Si el diagrama es muy denso, exporta en nivel «Actividad» o «Ejecutivo».
- Deja la pestaña de ProcessIQ en primer plano mientras se genera: en una pestaña en segundo plano, el navegador frena la generación.

---

## 8. Importar trabajo a un proyecto

Si trabajaste en el editor libre o tienes JSON exportados, puedes llevarlos a un proyecto. **Nada se borra de tu navegador** salvo que lo pidas.

### 8.1 Desde el editor libre de este navegador

Si el editor libre de tu navegador tiene un proceso dibujado, la lista de proyectos lo avisa: «En el editor libre de este navegador tienes «…» (N elementos).»

1. Pulsa «Llevarlo a un proyecto» (o «Importar procesos» en la lista de proyectos). Pulsa «No, gracias» si no quieres importarlo.
2. En «Qué importar» aparece la fila «Editor libre de este navegador». Puedes cambiar el nombre del proceso.
3. En «A qué proyecto», elige el proyecto de destino.
4. Pulsa «Importar el proceso».
5. Opcional: pulsa «Vaciar el editor libre» para dejar vacío el editor libre de este navegador.

El proceso se crea con su v1 («Importado del editor libre de un navegador»), con todo lo que tenía el editor libre, incluidas las dos vistas.

### 8.2 Desde archivos JSON

Útil para el trabajo hecho en otros equipos.

1. En el otro equipo, exporta cada proceso con «Exportar → JSON · proyecto».
2. En «Proyectos», pulsa «Importar procesos».
3. En «Añadir archivos JSON exportados del editor», elige uno o varios archivos.
4. Revisa la lista: nombre, origen, número de elementos y último cambio. Pulsa «Quitar» en los que sobren.
5. Elige el proyecto y pulsa «Importar N procesos».

Cada archivo se convierte en un proceso con su v1. Al terminar, cada uno ofrece «Abrir en el editor» y «Ver sus revisiones».

> El JSON exportado solo contiene la vista activa (As-Is o To-Be) con su ficha. Para conservar las dos vistas, importa desde el editor libre del mismo navegador (8.1).

Solo puedes importar a proyectos donde eres editor o propietario y que no estén archivados. Para un solo JSON también sirve «Nuevo proceso» dentro del proyecto (ver [4.1](#41-crear-un-proceso)).

---

## 9. Administración

Esta sección es solo para administradores. Las pantallas están en la cabecera: «Usuarios», «Catálogos», «Auditoría», «IA» y «Sistema».

### 9.1 Roles de organización

| Rol | Qué puede hacer |
|---|---|
| Administrador | Todo: gestiona usuarios, catálogos, auditoría, consumo de IA y sistema; ve y gestiona todos los proyectos |
| Consultor | Crea proyectos y participa en los que lo añaden |
| Lector | No crea proyectos; participa donde lo añaden, con el rol de proyecto que le den |

### 9.2 Usuarios

**Para crear una cuenta:**

1. En «Usuarios», pulsa «Nuevo usuario».
2. Escribe **Nombre y apellido**, **Correo** y elige el **Rol**.
3. Pulsa «Crear cuenta».
4. Aparece la **contraseña temporal**. Solo se muestra esta vez: pulsa «Copiar» y entrégala por un canal seguro. Pulsa «Hecho».

La persona deberá cambiarla al entrar (ver [2.2](#22-contraseña-temporal-y-cambio-obligatorio)).

**Otras acciones, en la fila de cada usuario:**

- **Cambiar el rol:** elige otro en la columna «Rol».
- **«Restablecer contraseña»:** genera una contraseña temporal nueva y cierra sus sesiones.
- **«Desactivar»:** impide el acceso y cierra sus sesiones al instante. «Reactivar» lo deshace.

La columna «Estado» muestra «Activa», «Contraseña temporal» o «Desactivada», y verás también el «Último acceso». No puedes cambiar tu propio rol ni desactivarte.

### 9.3 Catálogos

«Catálogos» define lo que usa el editor **en los procesos de proyectos** de tu organización. El editor libre sigue con los catálogos de fábrica. Los cambios se aplican la próxima vez que alguien abra un proceso.

#### KPIs

- Filtra por industria o busca con «Buscar KPI…».
- «Nuevo KPI»: Nombre, Industria, Macroproceso, Unidad, Referencia (benchmark) y Descripción. Pulsa «Crear KPI».
- «Editar» cambia sus datos; el **código** del KPI no cambia, porque los procesos guardan sus valores con él.
- «Desactivar» lo retira de la librería sin borrarlo; «Activar» lo recupera.

#### Verbos del Playbook

El linter exige que cada actividad empiece por un verbo en infinitivo.

- **Prohibidos:** escribe el verbo y el motivo que verá el consultor («Por qué no se usa y qué poner en su lugar») y pulsa «Prohibir». En la tabla puedes «Editar», «Permitir» o «Quitar».
- **Permitidos:** escribe el verbo y pulsa «Añadir». Para quitarlo, pulsa su ×.

#### Temas PPTX

Además de MBC y BBVA, cada tema activo aparece en el menú «Exportar» del editor como «PPTX · cliente *Nombre*».

Para crear un tema:

1. Pulsa «Nuevo tema».
2. Escribe el **Nombre del cliente** (por ejemplo, «Cliente Demo»). La **Clave** se rellena sola: minúsculas, números y guiones; no se puede cambiar después.
3. En «Partir de», elige MBC (carátula con foto) o BBVA (carátula de color y lámina de cierre).
4. Pulsa «Crear y editar».
5. Ajusta:
   - Nombre, Pie de lámina y Autor (propiedades del archivo);
   - los colores (principal, acento, fondos, textos, separadores, etiqueta de rol, estados, círculos y carátula);
   - las tipografías de texto y de títulos (deben estar instaladas donde se abra el PPTX);
   - los logotipos sobre fondo claro y oscuro, la foto de carátula (opcional) y el tamaño del logo, en pulgadas. Imágenes PNG o JPEG de hasta 1,4 MB;
   - el estilo de carátula («Con foto» o «De color») y si lleva «Lámina de cierre».
6. Pulsa «Guardar tema».

En la lista de temas, «Ocultar» lo quita del menú sin borrarlo, «Mostrar» lo devuelve y «Eliminar» lo borra.

#### Plantillas de proceso

Una plantilla es un proceso de referencia del que se parte al crear otro («Nuevo proceso → Partir de → Una plantilla de la organización»).

Para crear una:

1. Abre el proceso que quieres usar como referencia (su página, con la lista de revisiones).
2. En la versión que quieras, pulsa «Guardar como plantilla».
3. Escribe el **Nombre de la plantilla**, la **Industria** (si la dejas vacía, se toma la del proceso) y una **Descripción** que ayude a elegirla.
4. Pulsa «Guardar plantilla».

La plantilla copia el diagrama, la ficha y las vistas de esa versión, **sin** el cliente, las personas de la gobernanza, el historial de cambios de la ficha ni los valores medidos de KPI. Los textos libres (objetivo, notas de las tareas) se copian tal cual: **revisa que no nombren al cliente** antes de guardarla.

En «Catálogos → Plantillas de proceso», «Editar» cambia el nombre, la industria o la descripción; «Ocultar» deja de ofrecerla sin borrarla; «Mostrar» la devuelve y «Eliminar» la borra. Los procesos creados con una plantilla no cambian si la plantilla cambia o se borra.

### 9.4 Auditoría

«Auditoría» muestra quién hizo qué y cuándo: los 200 eventos más recientes, con fecha, usuario, acción y detalle. Filtra con «Mostrar»: todo, usuarios y sesiones, proyectos, procesos o revisiones.

### 9.5 Consumo de IA

La pantalla «IA» (título «Consumo de IA») muestra lo que costó la IA del servidor este mes, a precio de lista:

- el **gasto del mes** frente al presupuesto y el tope por persona, con una barra;
- **Por persona:** ejecuciones y gasto; la etiqueta «en el tope» marca a quien llegó a su límite;
- **Últimas ejecuciones:** fecha, persona, qué se pidió, modelo, estado (En cola, Ejecutando, Completada, Fallida, Cancelada), tokens y coste. Si una falló, verás el error.

Si la IA del servidor no está configurada, la pantalla lo avisa. El presupuesto y los topes se cambian en la configuración del servidor; pídeselo al responsable de operación.

### 9.6 Sistema

«Sistema» resume la salud de la plataforma y se actualiza cada 15 segundos. Si hay un problema grave, el menú «Sistema» muestra un **punto rojo**.

Tarjetas, con semáforo «Bien», «Revisar» o «Problema»:

- **API:** desde cuándo está activa.
- **Base de datos:** tiempo de respuesta, tamaño y migraciones.
- **Worker de IA:** último latido y trabajos en curso.
- **IA:** si hay clave, cuántas ejecuciones hay en cola o en curso, y completadas o fallidas en 24 h.
- **Copias de seguridad:** la última, cuántas hay y el disco libre.

Debajo, «Errores de los últimos 7 días», agrupados. Pulsa uno para ver cada repetición: fecha, usuario, pantalla y, si la hay, la **referencia** del error.

**Avisos y qué hacer:**

| Aviso | Qué hacer |
|---|---|
| «El worker de IA no ha dado señales nunca…» o «…no da señales desde hace N min.» | Las generaciones se quedan en cola. Avisa al responsable de operación |
| «Hay ejecuciones de IA esperando desde hace N min.» | Revisa el worker y la pantalla «IA» |
| «La IA del servidor no tiene clave de Anthropic…» | La IA de los proyectos no funciona; pide que se configure |
| «No hay ninguna copia de seguridad.», «La última copia de seguridad es de hace N h.» o «…pesa solo N bytes…» | Avisa al responsable de operación de inmediato |
| «Queda menos del 10 % de disco libre.» | Avisa al responsable de operación |
| «N error(es) en la última hora.» | Revisa la lista de errores |
| «La base de datos responde lento (N ms).» | Si persiste, avisa al responsable de operación |

Si alguien te cita una referencia de error («Error interno del servidor (referencia …)»), búscala en el detalle de los errores. Los procedimientos de operación están en los [runbooks](../runbooks/) (por ejemplo, [incidente de IA](../runbooks/incidente-ia.md)).

---

## 10. Preguntas frecuentes y problemas comunes

**No puedo abrir la plataforma desde la red de la empresa (error 403 o de certificado).**
El proxy corporativo bloquea los dominios nuevos. Pide a TI que habilite `mbc.asissoft.com`. Fuera de la red corporativa (por ejemplo, con datos móviles) funciona.

**Olvidé mi contraseña.**
Pide a un administrador que pulse «Restablecer contraseña». Recibirás una temporal y deberás cambiarla al entrar.

**«Demasiados intentos fallidos».**
Espera 15 minutos y vuelve a intentarlo.

**Mi sesión caducó mientras editaba.**
Tus cambios siguen en el navegador. Verás «Tu sesión caducó. Tus cambios siguen guardados en este navegador: entra de nuevo y vuelve a pulsar «Guardar revisión».» Pulsa «Entrar», vuelve al proceso, elige «Recuperar mis cambios» si te lo pregunta y guarda.

**Al guardar me dice que alguien guardó antes.**
No se perdió nada: hay dos versiones. Sigue los pasos de [4.6](#46-aviso-de-conflicto).

**No veo el botón «Guardar revisión».**
Tu rol es revisor o lector, o el proyecto está archivado. La barra del editor dice «solo lectura». Pide al propietario el rol de editor o que reactive el proyecto.

**«No se encontró ese proceso o no tienes acceso a él».**
No eres miembro del proyecto o el enlace es incorrecto. Pide al propietario que te añada.

**No encuentro un proyecto.**
Puede estar archivado: marca «Mostrar archivados». Si no aparece, no eres miembro.

**La generación con IA falla.**

| Mensaje | Qué hacer |
|---|---|
| «La IA del servidor no está configurada todavía…» | Avisa a un administrador |
| «Se alcanzó el presupuesto mensual de IA de la organización.» / «Alcanzaste tu límite mensual de IA.» | Espera al mes siguiente o pide a un administrador que lo amplíe |
| «Se perdió la conexión con el servidor. La IA sigue trabajando…» | Vuelve a abrir el proceso para recuperar el resultado |
| La respuesta se cortó o el proceso sale incompleto | Genera en nivel «Actividad» o «Ejecutivo», o divide el documento |
| «El PDF no tiene texto seleccionable…» | El PDF está escaneado: pásalo por OCR o pega el texto |
| «El archivo pesa … MB (máximo 40 MB)» | Divídelo o exporta solo el capítulo del proceso |
| «El PDF está protegido con contraseña» | Quítale la contraseña y reintenta |
| «El formato .doc antiguo no se pudo leer» / «El formato .ppt antiguo no es compatible» | Guárdalo como `.docx`, `.pptx` o PDF |
| En el editor libre, «No se pudo conectar con el servicio de IA … tras dos intentos» | Puede ser un corte, el proxy corporativo o un bloqueador de anuncios. Vuelve a intentarlo o prueba desde otra red |
| En el editor libre, «La IA dejó de responder durante N s y se canceló» | Reintenta con un documento más corto o con el modelo Sonnet |

**La IA no se usó y el proceso salió «en modo básico».**
En el editor libre, falta el código del equipo o la clave: configúralo en ✨ «Ajustes de IA». En un proceso de proyecto, mira el estado en esa misma ventana.

**¿Dónde está mi trabajo del editor libre?**
Solo en ese navegador. Si borras los datos del navegador, se pierde. Exporta el JSON con regularidad o llévalo a un proyecto (ver [8](#8-importar-trabajo-a-un-proyecto)).

**El diagrama es muy ancho y no lo veo entero.**
Pulsa `F` o «⤢ Ajustar». Arrastra sobre una zona vacía para desplazarte o cambia a nivel «Actividad».

**Las flechas se cruzan mucho.**
Pulsa «Autoajustar». Si sigue denso, cambia a nivel «Actividad» o «Ejecutivo»: menos cajas, menos cruces.

**El PPTX se ve con otra letra.**
La tipografía del tema no está instalada en ese equipo. Instálala o elige otro tema.

**El PPTX no se descarga.**
Deja la pestaña en primer plano mientras se genera. Si ves «La librería PPTX no se cargó», revisa tu conexión y recarga la página.

**No aparece el tema de mi cliente en «Exportar».**
Los temas de la organización solo aparecen en procesos de proyecto, y solo si están activos. Si se creó hace poco, vuelve a abrir el proceso.

**«No se pudieron cargar los catálogos de la organización: se usan los de por defecto.»**
El editor funciona con los catálogos de fábrica. Vuelve a abrir el proceso más tarde; si persiste, avisa a un administrador.

**Veo «Algo salió mal» o «Error interno del servidor (referencia …)».**
Ya quedó registrado. Recarga la página. Si se repite, pasa la referencia a un administrador.
