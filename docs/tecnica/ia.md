# La IA en ProcessIQ

Cómo usa ProcessIQ los modelos Claude: los dos caminos (editor libre y modo proyecto), la cola y el worker del servidor, los costes, el intermediario, cómo se prueba sin gastar y qué hacer ante un incidente.

**Actualizado:** 1-oct-2026.

---

## 1. Dos caminos

La IA hace tres cosas: **generar un proceso** a partir de documentos, **analizar sus dolores** y resolver **tareas analíticas del copiloto** (KPIs, To-Be, RACI…). Según cómo se abra el editor, lo hace por uno de dos caminos:

| | Editor libre (`/`) | Modo proyecto (`/?proceso=…`, `/?revision=…`) |
|---|---|---|
| Quién llama a Claude | El navegador | El worker de la API |
| Credencial | Código de equipo (la clave vive en el intermediario) o clave propia (BYOK, guardada en el navegador) | `ANTHROPIC_API_KEY` del servidor. El navegador nunca la ve |
| Quién arma el prompt | El navegador, con `@processiq/ia` | El servidor, con `@processiq/ia` |
| Si se cierra la pestaña | Se pierde la generación | Sigue en el servidor y se ofrece al volver |
| Reintentos | Uno, ante un fallo de red al conectar | Ese y, además, hasta 3 intentos con esperas de 15 y 60 s |
| Validación de la respuesta | `extraerJson`; las matrices RACI y SIPOC, además, esquema Zod y una reparación | `extraerJson`, esquema Zod y una reparación |
| Coste | Estimado y registrado en el navegador | Registrado por ejecución, con presupuesto mensual y límite por persona |
| Gasto a Pulse | Solo en modo equipo, desde el intermediario | Desde el worker |
| Sin IA disponible | Modo básico por palabras clave | Igual |

El punto de enganche es [ia/remota.js](../../apps/web/src/app/ia/remota.js). `aiBuildProcess`, `aiAnalyzePains` y `runAiTask` preguntan primero `iaRemota()`. Si [plataforma/ia.js](../../apps/web/src/app/plataforma/ia.js) registró la IA remota (modo proyecto), la petición va a la API. Si no, se comportan igual que el MVP.

```mermaid
flowchart LR
    subgraph nav["Navegador"]
      L["Editor libre"]
      P["Editor en modo proyecto"]
    end
    L -->|"código de equipo"| I["Intermediario (/ia)"]
    L -->|"clave propia (BYOK)"| AN[("API de Anthropic")]
    I -->|"clave central"| AN
    P -->|"datos, nunca prompts"| API["API (/api/ia)"]
    API --> BD[("Postgres: ejecuciones_ia")]
    BD --> W["Worker"]
    W -->|"clave del servidor"| AN
    W -.->|"SSE vía API"| P
```

---

## 2. Mapa del código

| Pieza | Archivo | Qué hace |
|---|---|---|
| Prompts | [packages/ia/src/prompts.ts](../../packages/ia/src/prompts.ts) | Prompts de sistema y tareas del copiloto |
| Construcción | [packages/ia/src/construccion.ts](../../packages/ia/src/construccion.ts) | Mensajes de usuario, combinación de fuentes, resumen del proceso, lectura de los dolores |
| Cliente | [packages/ia/src/cliente.ts](../../packages/ia/src/cliente.ts) | `llamarClaude` (streaming SSE) y `extraerJson` |
| Costes | [packages/ia/src/costes.ts](../../packages/ia/src/costes.ts) | Modelos, precios, `usd`, estimación previa |
| Especificación | [packages/ia/src/especificacion.ts](../../packages/ia/src/especificacion.ts) | `validarEspecGeneracion`, `promptReparacion`, `clasificarErrorIa` |
| Matrices | [packages/ia/src/matrices.ts](../../packages/ia/src/matrices.ts) | RACI y SIPOC editables (sección 3.1): `PROMPT_MATRICES`, `MATRICES_IA`, `validarMatrizIa`, `pedirMatrizIa` |
| Versión de los prompts | [packages/ia/src/version.ts](../../packages/ia/src/version.ts) | `versionPrompt` (sección 3.2) y los parámetros de las llamadas del worker (`LLAMADAS_IA`) |
| Rutas | [apps/api/src/rutas/ia.ts](../../apps/api/src/rutas/ia.ts) | Endpoints de negocio, SSE, cancelación, consumo |
| Cola | [apps/api/src/ia/cola.ts](../../apps/api/src/ia/cola.ts) | Tomar un trabajo y reencolar huérfanas |
| Ejecución | [apps/api/src/ia/ejecutar.ts](../../apps/api/src/ia/ejecutar.ts) | Llamada, validación, reparación, reintentos, coste |
| Avisos | [apps/api/src/ia/avisos.ts](../../apps/api/src/ia/avisos.ts) | `LISTEN/NOTIFY`: canales `ia_cola` e `ia_ejecucion` |
| Worker | [apps/api/src/worker.ts](../../apps/api/src/worker.ts) | Bucle de la cola, latido, parada ordenada, gasto a Pulse (`tokensParaPulse` en [ia/gasto.ts](../../apps/api/src/ia/gasto.ts)) |
| Configuración | [apps/api/src/config.ts](../../apps/api/src/config.ts) | Variables de entorno de la API y del worker |
| Editor | [apps/web/src/app/ia/](../../apps/web/src/app/ia/) | Ajustes, diálogos, generación, dolores, tareas, motor |
| Editor en proyecto | [apps/web/src/app/plataforma/ia.js](../../apps/web/src/app/plataforma/ia.js) | IA remota: ejecuciones y seguimiento por SSE |
| Consumo | [apps/web/src/shell/paginas/Ia.tsx](../../apps/web/src/shell/paginas/Ia.tsx) | Pantalla «Consumo de IA» |
| Intermediario | [apps/intermediario/src/index.ts](../../apps/intermediario/src/index.ts) | Proxy con código de equipo para el editor libre |

Decisión de diseño de la cola: [ADR 13](../adr/0013-cola-ia-en-postgres.md). Objetivo y contexto: [arquitectura.md §8](../arquitectura.md).

---

## 3. Prompts y parámetros

Los textos viven en [prompts.ts](../../packages/ia/src/prompts.ts) y [construccion.ts](../../packages/ia/src/construccion.ts) y se comparan byte a byte con el MVP (fidelidad). **Cambiar un prompt exige pasar la fidelidad** y, según la arquitectura, la evaluación de IA.

| Constante o función | Para qué |
|---|---|
| `PROMPT_GENERACION` | Sistema de la generación. Rol de analista BPMN; fija el JSON de salida (`meta`, `ficha`, `nodes` con `k`, `type`, `label`, `owner`, `system`, `exec`, `gateway`, `notes`, `nivel`, `padre`; `edges` con `from`, `to`, `label`) y las reglas: un inicio y al menos un fin, tipos de compuerta, paralelismo, bucles y los tres niveles con su padre |
| `promptGeneracion(texto, etiqueta, opciones)` | Mensaje de usuario: la petición, las reglas de fusión si hay varias fuentes (`REGLAS_FUSION`), quién es quién (persona → rol) y la profundidad pedida (1, 2 o 3). El contenido se recorta a `maxChars` |
| `combinarFuentes(fuentes, maxChars)` | Une varias fuentes con una cabecera cada una. Si superan el tope, reparto justo: las cortas entran enteras y el resto se divide entre las largas |
| `timeoutGeneracion(prompt)` | Límite de inactividad: 90 s + 0,5 s por cada 1 000 caracteres, con techo de 180 s |
| `PROMPT_PAINS` | Sistema del análisis de dolores. Pide un JSON con dolores **detectados** (anclados a un nodo, con evidencia) e **hipótesis del sector** (nunca se mezclan) |
| `interpretarPains(datos, nodos, siguienteId)` | Ignora nodos inexistentes y duplicados y acota severidad y frecuencia |
| `ROL_ANALISTA` + `TAREAS_IA` | Sistema de las tareas del copiloto (Markdown) y la instrucción de cada tarea |
| `resumenProcesoParaIa(proceso)` y `promptTarea` | Resumen del proceso en orden de flujo que reciben dolores y tareas |
| `PROMPT_REPARACION` y `promptReparacion(respuesta, problema)` | Solo en el servidor: pide devolver el JSON corregido sin inventar actividades |
| `PROMPT_MATRICES` + `MATRICES_IA` | Sistema e instrucciones de las matrices RACI y SIPOC en JSON, con su reparación (`sistemaReparacionMatriz`, `promptReparacionMatriz`), en los dos caminos (sección 3.1) |

Tareas del copiloto (`TAREAS_IA`):

| Clave | Qué pide |
|---|---|
| `suggest-kpis` | KPIs aplicables |
| `propose-tobe` | Reingeniería To-Be (también la usa el botón «Transformar a To-Be») |
| `raci` | Matriz RACI. Con IA llega como matriz editable (sección 3.1); este informe es el respaldo |
| `impact-effort` | Matriz impacto-esfuerzo |
| `automation` | Oportunidades de automatización |
| `backlog` | Backlog de iniciativas |
| `exec-summary` | Resumen ejecutivo |
| `sipoc` | SIPOC. Como la RACI: matriz editable y, si falla, este informe |
| `bottleneck` | Cuello de botella y ruta crítica |

Parámetros de cada llamada (iguales en los dos caminos, salvo la reparación de la generación, que solo existe en el servidor; la de las matrices está en los dos):

| Llamada | Sistema | Esfuerzo | `max_tokens` | Inactividad |
|---|---|---|---|---|
| Generar proceso | `PROMPT_GENERACION` | `medium` | 64 000 (`GEN_MAX_TOKENS`) | `timeoutGeneracion` |
| Reparar el JSON (servidor) | `PROMPT_REPARACION` | `low` | 64 000 | 120 s |
| Dolores | `PROMPT_PAINS` | `high` | 8 000 | 90 s |
| Tarea del copiloto | `ROL_ANALISTA` | `high` | 8 000 | 90 s |
| Matriz RACI o SIPOC | `PROMPT_MATRICES` | `high` | 8 000 (`MAX_TOKENS_MATRIZ`) | 90 s |
| Reparar una matriz | `sistemaReparacionMatriz(tipo)` | `low` | 8 000 | 120 s |
| Probar conexión (editor libre) | — | `low` | 256 | 90 s |

Con un modelo `claude-opus-5*`, la petición lleva `fallbacks: 'default'`: si los clasificadores declinan, la API de Anthropic repite con el modelo de respaldo en la misma llamada.

En el worker, sistema, esfuerzo y tope salen de `LLAMADAS_IA` ([version.ts](../../packages/ia/src/version.ts)) y, en las matrices, de `LLAMADA_MATRIZ` y `llamadaReparacionMatriz` ([matrices.ts](../../packages/ia/src/matrices.ts)): son los mismos datos que entran en la versión de los prompts (sección 3.2). El editor libre usa los mismos valores, escritos en su código portado del MVP (la fidelidad los compara). Las reparaciones llevan además `reparacion: true`, que no viaja en la petición: el worker lo usa para contarlas.

### 3.1 Matrices RACI y SIPOC

Con IA disponible, «Generar matriz RACI» y «Generar SIPOC» no piden el informe en Markdown del MVP: piden **la matriz editable** que usan el PPTX, el informe Word y la Ficha (divergencia D12, [fase1-divergencias.md](../fase1-divergencias.md)). Todo está en [matrices.ts](../../packages/ia/src/matrices.ts) y lo usan igual el editor libre y el worker.

| Tipo | Sustituye a | Forma del JSON (la de `state`) | Qué se valida |
|---|---|---|---|
| `matriz-raci` | `TAREAS_IA.raci` | `state._raci`: `{ "<id de la actividad>": { "<rol>": "R" \| "A" \| "R/A" \| "C" \| "I" } }` | Las filas son actividades reales (tipo `task`, `system` o `decision`, `actividadesRaci`): las de otros id se descartan y, si no queda ninguna, es un error que dice qué id usar. Letras normalizadas (`a` → `A`, `A/R` o `R, A` → `R/A`, `-` o `null` → vacía); al menos una; hasta 20 roles (`MAX_ROLES_RACI`) |
| `matriz-sipoc` | `TAREAS_IA.sipoc` | `state._sipoc`: `{ suppliers, inputs, process, outputs, customers }`, textos con los elementos separados por comas | Las cinco columnas, sin vaciar y de hasta 2 000 caracteres; una lista se une con comas; las claves de más se quitan |

`pedirMatrizIa(tipo, { resumen, actividades }, llamar)`:

1. Pide la matriz con `PROMPT_MATRICES` (el analista de las tareas, pero solo JSON) y `promptMatriz(tipo, resumen)`: la instrucción de `MATRICES_IA[tipo]` y el mismo resumen del proceso que las tareas (`resumenProcesoParaIa`), tras `=== PROCESO A ANALIZAR ===`.
2. `extraerJson` y `validarMatrizIa`.
3. Si no vale y la respuesta no pasa de `MAX_CHARS_REPARACION`, **una** reparación: `sistemaReparacionMatriz(tipo)` con la forma, y `promptReparacionMatriz`, que añade al pedido de reparación de siempre el proceso (para los id y los roles).
4. Si tampoco vale, lanza «La IA devolvió una matriz que no se pudo interpretar ni reparar: …», marcado como definitivo. Los errores de la llamada pasan tal cual, con su clase.

`llamar` es `callClaude` en el editor libre y, en el worker, su llamada con el presupuesto comprobado antes de cada intento y el coste sumado (sección 5).

En el editor ([ia/tareas.js](../../apps/web/src/app/ia/tareas.js)), `runAiTask('raci' | 'sipoc')`:

- con IA remota, encola `matriz-raci` o `matriz-sipoc` (sección 5.1); si no, llama a `pedirMatrizIa` desde el navegador;
- con la matriz, `cargarRaciIa` o `cargarSipocIa` ([analitica/](../../apps/web/src/app/analitica/)) la guardan en el proceso (`persist()`: deshacer la quita), avisan en el copiloto y abren el diálogo editable de siempre, con «Guardar cambios». Las columnas de la RACI son los roles de la IA, primero en el orden de los carriles, y las filas, todas las actividades (vacías si la IA no las trajo);
- si falla cualquier cosa, el copiloto dice por qué y pide **el informe en texto** de siempre (`TAREAS_IA`), con la misma petición que el MVP;
- una RACI de un proceso sin actividades va directa al informe; sin IA, las heurísticas.

### 3.2 Versión de los prompts

Cada ejecución del servidor guarda en `ejecuciones_ia.version_prompt` con qué prompts se hizo, para comparar resultados, coste y reparaciones cuando cambie un prompt. Es `versionPrompt(tipo, tarea)` de [version.ts](../../packages/ia/src/version.ts): una huella de 12 caracteres hexadecimales.

| | |
|---|---|
| Qué entra | Por tipo de ejecución, todo lo que decide **cómo** se pregunta: el prompt de sistema, el esfuerzo y el tope de tokens de cada llamada, también los de su reparación; y la plantilla del mensaje pintada con marcadores fijos (`{{CONTENIDO}}`, `{{RESUMEN}}`…): el texto que rodea los datos (instrucción de la tarea, reglas de fusión, quién es quién, profundidad, separadores) y el formato del resumen del proceso que reciben dolores, tareas y matrices |
| Qué no entra | Los datos de cada ejecución (documentos, proceso) y el modelo, que tiene su columna |
| Cuántas | Una por tipo: generación, dolores, cada tarea de `TAREAS_IA` y cada matriz. Cambiar el prompt del To-Be no cambia la versión de los KPIs |
| Quién la pone | El worker, al empezar cada intento. Si un reintento lo toma un worker con prompts nuevos, queda la de ese intento. Nula en las filas anteriores al 1-oct-2026 y en las que se cancelaron en cola. El editor libre no la guarda: no hay fila |
| Dónde se ve | `GET /api/ia/ejecuciones/:id` y `GET /api/ia/consumo` (`recientes`). La pantalla «Consumo de IA» no la muestra: con la API o una consulta basta para comparar |

**Por qué una huella y no un número de versión escrito a mano:** no se puede olvidar subirla, cambia con cualquier byte del prompt (la fidelidad ya los trata así) y es la misma en el navegador y en el servidor. Es cyrb53 recortado a 48 bits: síncrona, sin dependencias y sin APIs de Node ni del navegador. Para que un cambio no pase desapercibido, [version.test.ts](../../packages/ia/src/version.test.ts) fija las huellas actuales: quien cambie un prompt, una plantilla, el resumen del proceso o los parámetros ve fallar esa prueba, la actualiza en el mismo PR (`vitest run -u`) y lo anota en esta tabla. Los parámetros del worker salen de `LLAMADAS_IA` y `LLAMADA_MATRIZ`, así que la huella no puede desviarse de lo que se envía.

| Desde | Generación | Dolores | Matriz RACI | Matriz SIPOC | Tareas |
|---|---|---|---|---|---|
| 1-oct-2026 (primera versión registrada) | `e4da075ec104` | `2d28ee4d8616` | `f3ec07811977` | `3b0c4073e30a` | en `version.test.ts` (una por tarea) |

Para comparar versiones (solo ejecuciones terminadas):

```sql
select tipo, coalesce(tarea, '') as tarea, modelo, version_prompt, count(*) as ejecuciones,
       round(avg(coste_usd)::numeric, 4) as coste_medio, round(avg(tokens_salida)) as salida_media,
       round(avg((reparaciones > 0)::int), 3) as con_reparacion
  from ejecuciones_ia
 where estado in ('completada', 'fallida') and version_prompt is not null
 group by 1, 2, 3, 4 order by 1, 2, 3, 4;
```

### 3.3 Caché de prompts: medición y decisión

Medido el 1-oct-2026, antes de activarla. Reglas de la [documentación de Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) que importan aquí:

- La caché es un **prefijo**: herramientas, sistema y mensajes, en ese orden, hasta la marca `cache_control`. Cualquier byte distinto antes de la marca la invalida, y cambiar el esfuerzo (`output_config.effort`) invalida los mensajes.
- **Mínimo de tokens del prefijo** (por debajo no se guarda y no da error): **512 en Claude Opus 5, 1 024 en Claude Sonnet 5 y 4 096 en Claude Haiku 4.5**.
- Escribir cuesta 1,25 × la entrada (TTL de 5 min) o 2 × (1 h); leer, 0,1 ×. El TTL corre desde el **inicio** de la petición que escribe o lee, y la entrada se puede leer solo cuando la primera respuesta ya empezó.

Medición: caracteres exactos de [prompts.ts](../../packages/ia/src/prompts.ts), [matrices.ts](../../packages/ia/src/matrices.ts) y del resumen de los dos procesos de ejemplo de `packages/dominio/src/__fixtures__`; los tokens, estimados entre 2,8 y 4 caracteres por token (sin clave no se puede llamar a `count_tokens`).

| Llamada | Qué se repite de una llamada a otra (prefijo) | Tamaño | ¿Llega al mínimo? Opus 5 · Sonnet 5 · Haiku 4.5 | Ahorro si se activara |
|---|---|---|---|---|
| Generación | El sistema `PROMPT_GENERACION`, igual en todas. El mensaje cambia enseguida: la etiqueta y la profundidad van antes del documento (dos niveles comparten 128 caracteres) | 3 902 car. ≈ 980–1 390 tokens | Sí · solo si está en la parte alta del rango · no | Opus 5: unos US$ 0,005 por acierto y US$ 0,0015 de recargo por fallo. Una generación cuesta US$ 0,30–1,50: menos del 2 % aunque acertara siempre. Empata con un 22 % de aciertos (dos generaciones con la misma clave a menos de 5 min) |
| Reparación de la generación | Nada: otro sistema, y el mensaje es la respuesta nueva | — | — | 0 |
| Reintento de una generación | El prompt entero (documento incluido, hasta unos 60 000 tokens), 15 o 60 s después | Hasta ≈ 60 000 tokens | Sí | Habría que pagar la escritura (+25 % de toda la entrada) en todas las generaciones para ahorrar solo en los reintentos tras un corte a mitad de respuesta (antes de responder no se escribe nada): empata si el 28 % de las generaciones se cortara así. Además, una generación larga dura más de 5 min y la entrada caduca |
| Dolores | El sistema `PROMPT_PAINS` | 1 526 car. ≈ 380–545 tokens | Al límite · no (Sonnet 5 es el modelo de análisis) · no | ≈ 0 |
| Tareas del copiloto | El sistema `ROL_ANALISTA` | 426 car. ≈ 110–150 tokens | No · no · no | 0. El resumen del proceso (2 665–9 223 car. ≈ 670–3 300 tokens en los ejemplos) se repite entre tareas seguidas, pero va **después** de la instrucción: dos tareas comparten 0 caracteres del mensaje |
| Matrices | El sistema `PROMPT_MATRICES` | 468 car. ≈ 120–170 tokens | No · no · no | 0 |
| Reparación de una matriz | Nada en el prefijo: otro sistema (≈ 105–160 tokens) y el resumen va al final | — | — | 0 |

**Decisión: no se activa.** Donde llega al mínimo (el sistema de la generación) ahorra menos del 2 % de una generación en el mejor caso, y con poco tráfico pierde: con 100 generaciones al mes en Opus 5 serían unos +US$ 0,06 con un 30 % de aciertos y −US$ 0,08 con un 10 %, frente a un presupuesto de US$ 100. En el editor libre, además, cambiaría la petición que la fidelidad compara con el MVP.

Qué la haría rentable: reordenar los prompts para que lo variable vaya al final. En las tareas, el resumen del proceso antes de la instrucción (o en el sistema): las tareas seguidas sobre el mismo proceso leerían de la caché 1 000–3 300 tokens (en Sonnet 5, hasta unos US$ 0,006 por tarea: casi toda su entrada, en torno al 10–15 % de lo que cuesta la tarea, que es sobre todo salida). En la generación, el documento antes de la profundidad, para regenerar a otro nivel. Es cambiar prompts: evaluación de IA ([arquitectura §10](../arquitectura.md#10-calidad-y-pruebas)), una divergencia en la fidelidad y comparar después con `version_prompt`.

Lo que sí queda hecho: si una respuesta trae tokens de caché, se cobran a su precio en el editor (D21), el worker, el presupuesto y «Consumo de IA» (sección 8.1), y van aparte a Pulse (sección 8.4). El intermediario deja pasar `cache_control` tal cual.

### 3.4 Salida estructurada: evaluación

La API de Anthropic ofrece hoy, sin cabecera beta y en los tres modelos, **JSON con esquema** (`output_config.format` con `type: "json_schema"`) y **herramientas estrictas** (`strict: true`) ([documentación](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). Funciona en streaming, no limita el razonamiento y compila una gramática por esquema (la primera vez tarda más; se guarda 24 h). Límites: `additionalProperties: false` obligatorio; sin `minLength`, `maxLength`, `minimum` ni `maximum`; `minItems` solo 0 o 1; como mucho 24 parámetros opcionales y 16 con uniones por petición, y un tope interno de complejidad («Schema is too complex for compilation», 400). Añade un prompt de sistema propio (más entrada). Una respuesta rechazada o cortada por `max_tokens` puede no cumplir el esquema.

| | Generación | Matriz RACI | Matriz SIPOC |
|---|---|---|---|
| ¿Cabe en un esquema? | Al límite: 21 parámetros opcionales de 24 (`meta` 3; `ficha` 10, el objeto y sus 9 campos; `sistemas` 1; nodos 6; aristas 1), `k` como texto. Cada opcional dobla parte de la gramática: sin una llamada real no se sabe si compila | No con su forma: las claves son dinámicas (id → rol → letra) y `additionalProperties` tiene que ser `false`. Habría que cambiar el JSON a una lista (prompt y D12) y los id como `enum` darían un esquema por proceso, que se compila con cada proceso nuevo | Sí, trivial |
| Qué evitaría | JSON mal formado y la falta de `nodes` o `k`. No el fallo más caro, la respuesta cortada por `max_tokens` en procesos largos (ya es un error definitivo, sin reparación), ni el rechazo | Id que no son actividades y letras fuera de la lista | Columnas que faltan (las vacías las sigue viendo Zod: no admite `minLength`) |
| Coste | Más entrada (el prompt del esquema) y, si se hacen obligatorios los opcionales para simplificar la gramática, más salida: claves vacías en cada nodo, y la salida es lo caro (US$ 25 por millón en Opus 5) | — | — |

**Decisión: no se implementa por ahora.**

- No hay datos de cuántas generaciones o matrices necesitan reparación, que es lo único que ahorraría. Desde el 1-oct-2026, `ejecuciones_ia.reparaciones` lo cuenta (la consulta de la sección 3.2 da el porcentaje por tipo y versión).
- El esquema de la generación roza los límites y no se puede comprobar que compile ni que no empeore el proceso: aquí no hay clave para llamar a la API y la evaluación de IA con procesos reales ([arquitectura §10](../arquitectura.md#10-calidad-y-pruebas)) no se puede correr. Un 400 del esquema rompería todas las generaciones si no hubiera respaldo.
- La RACI necesitaría otra forma de JSON; el SIPOC sí cabe, pero es el que menos falla.
- En el editor libre cambiaría la petición que la fidelidad compara con el MVP.
- El streaming no es el problema: funciona igual.

Cuándo revisarlo: con unas 50 generaciones con versión, si más de un 5 % necesitan reparación. Entonces, detrás de una opción que se pueda apagar: esquema de la generación sin uniones, la petición sin `output_config.format` como respaldo ante un 400 del esquema, la reparación de siempre como red y la evaluación de IA antes de activarla.

---

## 4. Editor libre (como el MVP)

### 4.1 Configuración

- Se guarda en `localStorage['processiq.ai']`: `modo` (`equipo` o `propia`), `codigo`, `key`, `proxyUrl` y `model`. Sin `modo` guardado se asume clave propia (configuraciones viejas).
- `aiReady()` ([ia/motor.js](../../apps/web/src/app/ia/motor.js)): en modo equipo hace falta el código; en modo propio, la clave.
- **Primera ingesta sin configurar:** `runIngest` pide el código de equipo ([ia/dialogos.js](../../apps/web/src/app/ia/dialogos.js)). Si lo das, guarda el modo equipo y, si no había otros, el intermediario por defecto y Opus 5 como modelo. Si eliges «Modo básico» o cierras el diálogo, sigue sin IA.
- **Ajustes de IA** (botón ✨, [ia/ajustes.js](../../apps/web/src/app/ia/ajustes.js)): modo, código y dirección del intermediario o clave propia, modelo, y «Probar conexión».

### 4.2 La llamada

`callClaude()` llama a `llamarClaude()` con la configuración del navegador y el botón Cancelar de la ingesta como señal.

| | Modo equipo | Clave propia (BYOK) |
|---|---|---|
| Destino | `proxyUrl` o, por defecto, `location.origin + '/ia'`, más `/v1/messages` | `https://api.anthropic.com/v1/messages` |
| Cabeceras | `content-type`, `x-processiq-code` | `content-type`, `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access` |
| Cabecera beta del respaldo | La pone el intermediario | La pone el navegador |

- El intermediario por defecto es el del mismo origen, no `api.mbc-latam.com` (divergencia D2 en [fase1-divergencias.md](../fase1-divergencias.md)).
- **Modo básico:** sin IA lista, la generación usa el intérprete por palabras clave de `@processiq/documentos` ([ingesta/texto.js](../../apps/web/src/app/ingesta/texto.js)) y el copiloto, sus heurísticas. El copiloto avisa de que no hubo IA.

### 4.3 Coste en el navegador

- **Antes de generar:** el diálogo «Nivel de detalle y modelo» ofrece Opus 5 y Sonnet 5 con el coste estimado de cada uno (rango probable y máximo posible).
- **Estimación** (`estimarCosteGeneracion`):
  - tokens de entrada = (caracteres del texto hasta 180 000 + largo del prompt de sistema + 800) ÷ caracteres por token;
  - caracteres por token: la mediana del historial de ese modelo, o 3 sin historial;
  - tokens de salida: la relación salida/entrada mediana de ese nivel y modelo, ±30 %; sin historial, un rango por nivel (1: 5–15 mil; 2: 10–30 mil; 3: 20–50 mil), acotado entre 500 y 64 000;
  - máximo posible: entrada + 64 000 tokens de salida.
- **Después:** el uso real se guarda en `processiq.ia.costes` (últimas 20 ejecuciones) y el copiloto muestra el coste. Si la ejecución falla después de consumir, el error lo dice.

---

## 5. Modo proyecto: IA en el servidor

### 5.1 Tipos de ejecución

Cada petición es una fila de `ejecuciones_ia`.

| `tipo` | `tarea` | Quién la pide en el editor | Modelo | `resultado` |
|---|---|---|---|---|
| `generacion` | — | «Generar proceso» de la ingesta (también una descripción escrita en el copiloto) | El elegido, si está permitido | La especificación del proceso, validada |
| `pains` | — | «Analizar dolores» | `MODELO_IA_ANALISIS` | `{ datos }`: el JSON de dolores |
| `tarea` | Una clave de `TAREAS_IA` | Acciones del copiloto y «Transformar a To-Be» | `MODELO_IA_ANALISIS` | `{ markdown }` |
| `tarea` | `matriz-raci` o `matriz-sipoc` | «Generar matriz RACI» y «Generar SIPOC» (sección 3.1) | `MODELO_IA_ANALISIS` | `{ matriz }`: la de `state._raci` o `state._sipoc`, validada |

Estados: `en_cola`, `ejecutando`, `completada`, `fallida` y `cancelada` (sección 6.1).

### 5.2 Qué envía el cliente y qué decide el servidor

**El cliente nunca envía prompts.** Envía datos:

| Petición | Campos |
|---|---|
| `POST /api/ia/generaciones` | `procesoId`, `texto` (las fuentes ya combinadas; 1 a 1 000 000 caracteres), `etiqueta` (hasta 200), `vista` (1, 2 o 3), `roles` (persona → rol, de las transcripciones), `variasFuentes`, `fuentes` (nombre, tipo y caracteres de cada una; hasta 50), `modelo` (opcional) |
| `POST /api/ia/analisis` | `procesoId`, `tipo` (`pains`, una clave de `TAREAS_IA`, `matriz-raci` o `matriz-sipoc`), `contenido` (el proceso del editor, normalizado a v1) |

El servidor decide:

| Decisión | Cómo |
|---|---|
| Prompt | El de `@processiq/ia` para cada tipo (sección 3). En los análisis, el resumen lo calcula el servidor a partir de `contenido`, validado con `migrarProyecto`. En las matrices guarda además en `parametros.actividades` los id de las actividades, contra los que valida el worker; una `matriz-raci` sin actividades se rechaza con 400 `PROCESO_SIN_ACTIVIDADES`, antes de gastar |
| Modelo de la generación | El pedido si está en `MODELOS_IA_PERMITIDOS`. Si no lo está, el primero permitido, y la respuesta lo dice en `modeloSustituido: { pedido, usado }`: el editor muestra el aviso en la barra y en el progreso. Sin pedir, el primero permitido |
| Modelo de los análisis | Siempre `MODELO_IA_ANALISIS` |
| Esfuerzo, `max_tokens`, inactividad | Los de la tabla de la sección 3 |
| Tope de texto | Recorta las fuentes a 180 000 caracteres (`MAX_CHARS_FUENTES`, el mismo `MAX_AI_CHARS` del editor) |
| Si se puede gastar | Comprueba al encolar: clave configurada (409 `IA_NO_CONFIGURADA`), presupuesto mensual de la organización (409 `PRESUPUESTO`) y límite mensual de la persona (409 `LIMITE_USUARIO`). El worker lo vuelve a comprobar antes de cada llamada ([§8.2](#82-presupuesto-y-límite-por-persona)) |
| Quién puede | Capacidad `escribir` sobre el proceso (propietario o editor; el administrador cuenta como propietario). Proyecto archivado: 409. Sin acceso: 404 |

### 5.3 Endpoints

Todos bajo `/api/ia` y con sesión ([rutas/ia.ts](../../apps/api/src/rutas/ia.ts)).

| Método y ruta | Capacidad | Qué hace |
|---|---|---|
| `GET /estado` | Sesión | Si hay clave, modelos permitidos con su precio, modelo de análisis, presupuesto y gasto del mes (organización y tú) |
| `POST /generaciones` | `escribir` | Encola una generación. Responde 202 con la ejecución |
| `POST /analisis` | `escribir` | Encola dolores o una tarea. Responde 202 |
| `GET /ejecuciones/:id` | `leer` | La ejecución, con su resultado |
| `GET /ejecuciones/:id/eventos` | `leer` | Progreso en vivo (SSE, sección 6.7) |
| `POST /ejecuciones/:id/cancelar` | `escribir` | Cancela (sección 6.5) |
| `POST /ejecuciones/:id/descartar` | `escribir` | Marca una generación terminada como descartada: deja de ofrecerse |
| `GET /procesos/:id` | `leer` | Últimas 20 ejecuciones del proceso y las generaciones pendientes |
| `GET /consumo` | Administrador | Gasto del mes por persona y las últimas 50 ejecuciones |

- Una ejecución nunca devuelve el texto de las fuentes ni la organización (`publica()`). El resultado solo va en `GET /ejecuciones/:id`, en las pendientes y en el último evento del SSE.
- Auditoría: `ia.generacion` (modelo, caracteres y nombres de las fuentes), `ia.analisis` e `ia.cancelacion`. Guardar la revisión generada registra `revision.alta` con `ejecucionIaId`.

### 5.4 Secuencia de una generación

```mermaid
sequenceDiagram
    autonumber
    actor U as Consultor
    participant E as Editor (navegador)
    participant A as API
    participant BD as Postgres
    participant W as Worker
    participant C as Anthropic
    participant P as Pulse

    U->>E: Reúne fuentes y pulsa Generar proceso
    E->>E: Extrae el texto en el navegador y pide nivel y modelo
    E->>A: POST /api/ia/generaciones (texto, etiqueta, vista, roles, fuentes, modelo)
    A->>A: Permiso escribir, modelo permitido, presupuesto y límite
    A->>BD: INSERT en ejecuciones_ia (en_cola, con el texto)
    A->>BD: NOTIFY ia_cola
    A-->>E: 202 con la ejecución
    E->>A: GET /api/ia/ejecuciones/ID/eventos (EventSource)
    A-->>E: evento estado (en_cola)
    BD-->>W: aviso ia_cola
    W->>BD: UPDATE con FOR UPDATE SKIP LOCKED (ejecutando, intentos + 1)
    W->>BD: NOTIFY ia_ejecucion
    W->>C: POST /v1/messages en streaming (prompt del servidor)
    loop Mientras llega el texto
        C-->>W: text_delta
        W->>BD: progreso, como mucho una vez por segundo, y NOTIFY ia_ejecucion
        BD-->>A: aviso ia_ejecucion
        A-->>E: evento estado (caracteres recibidos)
    end
    Note over W,BD: Cada 2 s, latido y comprobación de cancelación
    C-->>W: message_delta con los tokens de salida
    W->>W: extraerJson y validarEspecGeneracion
    alt La respuesta no es válida
        W->>C: Una llamada de reparación
        C-->>W: JSON corregido
        W->>W: Se valida otra vez
    end
    W->>BD: completada, resultado, tokens y coste sumados, texto borrado
    W->>BD: NOTIFY ia_ejecucion
    W-)P: gasto de cada llamada (opcional)
    A-->>E: evento estado (completada, con el resultado)
    E->>E: buildProcessFromAiSpec, auto-layout y nivel elegido
    E->>A: POST /api/procesos/ID/revisiones (contenido, mensaje, padreId, ejecucionIaId)
    A->>BD: Nueva revisión y ejecuciones_ia.revision_id en la misma transacción
    A-->>E: 201 con la revisión y si hubo conflicto
    E-->>U: Aviso: proceso generado con IA y guardado como vN
```

### 5.5 El editor durante la ejecución

En [plataforma/ia.js](../../apps/web/src/app/plataforma/ia.js):

- **`generar()`** envía la petición y sigue la ejecución con `seguir(id)`:
  - abre un `EventSource` sobre `/api/ia/ejecuciones/:id/eventos` y traduce cada estado a un texto de progreso («En cola…», «Reintentando en el servidor… (motivo)», «Recibiendo el proceso de la IA… N caracteres»);
  - `completada` resuelve; `fallida` rechaza con el error; `cancelada` rechaza con `CANCELLED`;
  - el botón Cancelar de la ingesta cierra el `EventSource`, pide `POST …/cancelar` y rechaza con `CANCELLED`;
  - si el servidor cierra la conexión (por ejemplo, sesión caducada), avisa de que la IA sigue trabajando y de que el resultado estará al volver a abrir el proceso.
- Si el modelo elegido en el diálogo no está permitido en el servidor, envía el primero permitido.
- Con el resultado, [ia/generacion.js](../../apps/web/src/app/ia/generacion.js):
  - registra el coste en `processiq.ia.costes`, para calibrar la estimación del navegador;
  - dibuja con `buildProcessFromAiSpec` (el mismo código que el MVP);
  - llama a `alGenerar`, que programa el guardado como revisión con el mensaje «Proceso generado con IA desde…» y el `ejecucionIaId`. La ingesta aplica antes el nivel elegido (es síncrona), así que se guarda la vista de ese nivel.
- **`analizar(tipo)`** envía el proceso actual y devuelve el `resultado`: `markdown` (tareas) o `datos` (dolores), que el editor interpreta igual que en el MVP, o `matriz` (RACI y SIPOC, sección 3.1).
- **Si la IA no está disponible** (sin clave, presupuesto o límite agotados, o rol sin `escribir`): `lista()` es falso, la ingesta avisa y sigue en modo básico, y el copiloto usa sus heurísticas. «Ajustes de IA» solo informa: estado, modelos, modelo de análisis y gasto del mes de la organización y tuyo.

### 5.6 Generaciones pendientes

Si la pestaña se cerró durante la generación:

1. Al abrir el proceso, el editor pide `GET /api/ia/procesos/:id`. Son **pendientes** las generaciones `completada` sin `revision_id` y no descartadas.
2. Si hay una (y puedes escribir), pregunta «Dibujarlo y guardarlo» o «Descartarlo».
3. «Dibujarlo» aplica la especificación, el nivel pedido (`parametros.vista`) y guarda una revisión con `ejecucionIaId`. «Descartarlo» llama a `POST …/descartar`.

Al guardar con `ejecucionIaId`, la API enlaza la ejecución (`revision_id`) en la misma transacción que crea la revisión. Solo acepta una generación `completada` del mismo proceso; si no, responde 400 `EJECUCION_INVALIDA` y no guarda nada.

---

## 6. Cola y worker

El worker es el mismo código e imagen que la API ([worker.ts](../../apps/api/src/worker.ts)); en Docker es el servicio `worker`. Las migraciones las aplica la API; el worker arranca después.

### 6.1 Estados de una ejecución

```mermaid
stateDiagram-v2
    [*] --> en_cola: POST generaciones o analisis
    en_cola --> ejecutando: el worker la toma
    en_cola --> cancelada: cancelar mientras espera
    ejecutando --> completada: resultado válido
    ejecutando --> en_cola: error transitorio con intentos libres, huérfana o parada del worker
    ejecutando --> fallida: error definitivo o tercer intento
    ejecutando --> cancelada: cancelar, el worker aborta la llamada
    completada --> [*]
    fallida --> [*]
    cancelada --> [*]
```

### 6.2 Tomar un trabajo

`tomarSiguiente()` ([cola.ts](../../apps/api/src/ia/cola.ts)) hace un solo `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)`:

- elige la fila `en_cola` más antigua con `disponible_en <= now()` y sin `cancelar`;
- la pasa a `ejecutando`, suma un intento, pone el progreso a 0 y fija `iniciado_en` (solo la primera vez) y `actualizado_en`.

`SKIP LOCKED` garantiza que dos workers (o dos bucles) nunca toman la misma fila. Índice: `ejecuciones_ia_cola_idx` sobre `(estado, disponible_en)`.

### 6.3 Latido y huérfanas

- Mientras ejecuta, una **vigilancia** cada 2 s actualiza `actualizado_en` (latido de la ejecución) y lee `cancelar`.
- `reencolarHuerfanas()` devuelve a la cola las ejecuciones `ejecutando` con más de **120 s** sin latido (worker caído o reiniciado). **No cuentan el intento.** Se ejecuta al arrancar el worker y cada 60 s.
- Aparte, el worker deja su propio latido en la tabla `latidos` cada `LATIDO_SEGUNDOS` (30 s por defecto), con su concurrencia, lo que tiene en curso y si tiene clave. La pantalla «Sistema» avisa si pasan más de 120 s sin latido.

### 6.4 Concurrencia, espera y parada

- `IA_CONCURRENCIA` bucles en paralelo (2 por defecto; 1 en staging). El pool de la base admite hasta `concurrencia + 2` conexiones.
- Cada bucle: toma una ejecución; si no hay, espera hasta 10 s o hasta un aviso `ia_cola`. Un aviso despierta a **todos** los bucles que esperan (`despertador()` en [avisos.ts](../../apps/api/src/ia/avisos.ts)). Al terminar una, despierta a los demás.
- **Parada** (`SIGINT` o `SIGTERM`): deja de tomar trabajo, aborta lo que está en curso y lo devuelve a la cola sin contar el intento (se suman los tokens de las llamadas que ya terminaron). Espera hasta 15 s a que acaben los bucles.

### 6.5 Reintentos

`MAX_INTENTOS = 3`. Tras un fallo, `clasificarErrorIa()` ([especificacion.ts](../../packages/ia/src/especificacion.ts)) decide. Primero mira la clase que `llamarClaude` marca en el propio error (`claseIa`, con `marcarErrorIa`, sin cambiar el mensaje): los HTTP 429 y 5xx son transitorios y el resto definitivos; a mitad del stream decide el `error.type` de Anthropic. Solo si el error no trae marca, decide por el texto:

| Clase | Errores | Qué pasa |
|---|---|---|
| `transitorio` | «Error 5xx» o 529, `overloaded`, 429, «No se pudo conectar», «Se cortó la conexión», «dejó de responder», «tardó más de» | Si quedan intentos, vuelve a `en_cola` con `disponible_en` = ahora + **15 s** (tras el primero) o **60 s** (tras el segundo). El error queda como «… (reintento n de 3)» |
| `definitivo` | Clave inválida (401), rechazo del modelo, respuesta que supera `max_tokens`, JSON que no se pudo reparar, cualquier otro | `fallida`, con el mensaje |
| `cancelado` | Cancelación | `cancelada` |

- Además, `llamarClaude` reintenta **una vez**, tras 1,2 s, un fallo de red al conectar.
- El worker sondea la cola cada 10 s como mucho, así que un reintento arranca poco después de su `disponible_en`.
- Si falla la llamada de reparación con un error transitorio, se repite la generación entera en el siguiente intento.

### 6.6 Cancelación

- **En cola:** `POST …/cancelar` la pasa a `cancelada` al momento y borra el texto.
- **Ejecutando:** marca `cancelar = true`. La vigilancia del worker lo ve en 2 s como mucho, aborta la llamada y la ejecución queda `cancelada`.
- En los dos casos avisa por `ia_ejecucion` y lo registra en la auditoría.

### 6.7 Validación y reparación

En las generaciones ([ejecutar.ts](../../apps/api/src/ia/ejecutar.ts)):

1. `extraerJson()` toma el primer objeto JSON (tolera bloques de código y prosa alrededor).
2. `validarEspecGeneracion()` comprueba con Zod la forma mínima que necesita el editor: `nodes` con al menos un elemento y `k` en cada uno; `edges` opcional con `from` y `to`; `meta` y `ficha` opcionales. Admite campos de más. Devuelve hasta 10 errores.
3. Si falla y la respuesta tiene como mucho 200 000 caracteres (`MAX_CHARS_REPARACION`), hace **una** llamada de reparación con la respuesta y el problema.
4. Si la reparación tampoco valida, o la respuesta era más grande, la ejecución falla.

Las matrices RACI y SIPOC siguen los mismos pasos con `pedirMatrizIa` (sección 3.1), validadas contra `parametros.actividades`. Si no se consigue la matriz, la ejecución falla con un error definitivo (sin reintentos) y el editor pide el informe en texto, que es otra ejecución.

Cada llamada de reparación que llega a hacerse (la que el presupuesto detiene antes no cuenta) suma 1 en `reparaciones`, también en los intentos que después fallan: es el dato para decidir la salida estructurada (sección 3.4).

Los dolores solo pasan por `extraerJson`; las demás tareas devuelven Markdown sin validar.

### 6.8 Avisos (`LISTEN/NOTIFY`) y SSE

| Canal | Quién avisa | Quién escucha | Para qué |
|---|---|---|---|
| `ia_cola` | La API al encolar | El worker | Despertarlo sin esperar al sondeo |
| `ia_ejecucion` | Worker (cada cambio y el progreso) y API (cancelar) | La API | Empujar el SSE |

- `Escucha` ([avisos.ts](../../apps/api/src/ia/avisos.ts)) abre **una** conexión dedicada por servicio de Node (una en la API, otra en el worker; no una por cliente) y reparte los avisos. Si se cae, se reconecta a los 2 s.
- El SSE (`GET /ejecuciones/:id/eventos`):
  - lee la fila y, si cambió, envía un evento `estado` con el **estado completo** (el resultado solo en el estado final);
  - si no cambió, envía un comentario de latido;
  - espera al siguiente aviso de esa ejecución o, como respaldo, 5 s;
  - termina en un estado final o cuando el cliente se va.
- Como cada evento lleva el estado completo, **reconectar es seguro**: `EventSource` se reconecta solo ante cortes de red y recibe el estado actual.

### 6.9 Tokens, coste y purga del texto

- Tokens y coste se **suman** en la fila con cada llamada que informa su uso, reparación e intentos fallidos incluidos. Las llamadas abortadas o cortadas a mitad solo informan la entrada (sección 13). La entrada incluye los tokens de la caché de prompts, si los hubo, y el coste los cobra a su precio (sección 8.1).
- Al empezar cada intento, el worker guarda la versión de los prompts (`version_prompt`, sección 3.2); al terminarlo, suma sus reparaciones (`reparaciones`).
- Al terminar (`completada`, `fallida` o `cancelada`), `texto` pasa a `null`: **el texto de las fuentes no se conserva**. Mientras está en cola o ejecutando se guarda, porque hace falta para reintentar.
- Se quedan `parametros` (etiqueta, nivel, roles, fuentes con nombre, tipo y tamaño, caracteres) y `resultado`.
- Cada evento del worker va al log en JSON (`arranque`, `inicio`, `fin`, `error`, `gasto_ia`, `reencoladas`). Sus errores inesperados van también a la tabla `errores` (pantalla «Sistema»).

---

## 7. Cliente de Claude (`llamarClaude`)

[cliente.ts](../../packages/ia/src/cliente.ts) es el mismo en los tres usos. Lo que depende del entorno llega como parámetro (`Entorno`: intermediario por defecto, señal de cancelación, `fetch`, espera, URL de la API).

| Modo (`cfg.modo`) | Destino | Autenticación | Lo usa |
|---|---|---|---|
| `equipo` | Intermediario + `/v1/messages` | `x-processiq-code` | Editor libre con código de equipo |
| `servidor` | `ANTHROPIC_BASE_URL` o `https://api.anthropic.com` | `x-api-key` del servidor, sin la cabecera de acceso directo del navegador | Worker |
| Otro (clave propia) | `https://api.anthropic.com` | `x-api-key` + `anthropic-dangerous-direct-browser-access` | Editor libre con BYOK |

Cómo lee la respuesta:

- Siempre en **streaming** (`stream: true`). El límite es de **inactividad**: se rearma con cada trozo que llega.
- Solo acumula los deltas de texto (el razonamiento se ignora). Un bloque `fallback` descarta lo recibido: el modelo de respaldo repite la respuesta entera.
- Tokens: la entrada sale de `message_start` y `message_delta` (incluye la caché de prompts si la hubiera); la salida, de `message_delta`. Si hubo caché, el uso (`UsoIa`) trae además `cacheEscritura` (`cache_creation_input_tokens`), `cacheEscritura1h` (la parte con TTL de 1 hora) y `cacheLectura` (`cache_read_input_tokens`), que forman parte de la entrada; sin caché esos campos no aparecen. Llama a `onUsage` antes de lanzar los errores del final de la respuesta, porque una respuesta cortada también se cobra.
- **Uso de una respuesta cortada a mitad** (cancelación, inactividad, corte de red, apagado del worker): si quien llama pasa `onUsoParcial`, recibe la entrada de `message_start` y la salida de `message_delta` si llegó. Solo lo pasa el worker, que lo suma al coste de la ejecución y lo informa a Pulse (en el log, `parcial: true`); el editor libre no lo pasa y se comporta como el MVP. En la práctica la salida de una respuesta cortada casi nunca se conoce: Anthropic la informa en el `message_delta` final.

Errores que traduce:

| Situación | Mensaje (resumen) |
|---|---|
| 401 | Código de equipo incorrecto; clave propia inválida; o, en el servidor, clave del servidor inválida o revocada |
| 403 en modo equipo | El intermediario rechazó el origen (no está en `ALLOWED_ORIGINS`) |
| 429 | Límite de uso alcanzado |
| Sin conexión tras dos intentos | No se pudo conectar |
| Inactividad | La IA tardó o dejó de responder y se canceló |
| Corte a mitad | Se cortó la conexión mientras la IA respondía |
| `stop_reason: refusal` | El modelo rechazó la solicitud |
| `stop_reason: max_tokens` | El proceso es más largo de lo que cabe en una respuesta: generar en nivel Actividad o Ejecutivo, o dividir el documento |
| Evento `error` en el SSE | Error a mitad de la respuesta |

---

## 8. Costes

### 8.1 Precios

Precios de lista por millón de tokens, en US$ (`PRECIOS_IA`, tabla oficial del 24-jun-2026; los de la caché de prompts, de su documentación, consultada el 1-oct-2026):

| Modelo | Entrada | Salida | Escribir en caché (5 min) | Escribir en caché (1 h) | Leer de la caché |
|---|---|---|---|---|---|
| `claude-opus-5` | 5 | 25 | 6,25 | 10 | 0,50 |
| `claude-sonnet-5` | 2 | 10 | 2,50 | 4 | 0,20 |
| `claude-haiku-4-5` | 1 | 5 | 1,25 | 2 | 0,10 |

- `usd(entrada, salida, modelo, cache?)` = (entrada normal × precio de entrada + escritos en caché × su precio + leídos × su precio + salida × precio de salida) ÷ 1 000 000, donde la entrada normal es la entrada menos lo escrito y lo leído de la caché. Sin `cache` (o sin esos campos), todo a precio de entrada, como antes. Un modelo desconocido se cobra como Opus 5.
- Lo usan igual el editor (coste de la generación, divergencia D21: el MVP cobraba la caché como entrada), y el worker (`coste_usd`, de donde salen el presupuesto y «Consumo de IA»); la estimación previa (sección 4.3) no cuenta caché. Hoy ninguna petición pide la caché (sección 3.3), así que el coste es el mismo que antes; el cálculo queda bien si alguna respuesta la trae.
- El respaldo automático de Opus 5 usa modelos de la misma tarifa.
- Si cambian los precios, se cambia `PRECIOS_IA`: lo usan el editor, la API (validación de modelos) y el worker.

### 8.2 Presupuesto y límite por persona

- **Gasto del mes:** suma de `coste_usd` de las ejecuciones de la organización creadas desde el día 1 del mes, hora de Lima (`America/Lima`). El de la persona es la misma suma filtrada por su usuario.
- **Topes** (US$, `.env`): `PRESUPUESTO_IA_MENSUAL_USD` (100 por defecto) para la organización y `LIMITE_IA_USUARIO_MENSUAL_USD` (25 por defecto) para cada persona.
- Se comprueban **al encolar**. Si se alcanzó alguno, la API responde 409 y el editor sigue en modo básico.
- Red final: el tope de gasto de la consola de Anthropic.

### 8.3 Pantalla «Consumo de IA»

`/proyectos/admin/ia`, solo administradores ([Ia.tsx](../../apps/web/src/shell/paginas/Ia.tsx)). Se refresca cada 15 s.

- Gasto del mes frente al presupuesto, con una barra (resaltada desde el 90 %) y el tope por persona.
- Por persona: ejecuciones y gasto del mes, con la marca «en el tope».
- Últimas 50 ejecuciones: fecha, persona, qué hizo, modelo, estado (con intentos y error), tokens de entrada y salida, y coste.
- Aviso si falta `ANTHROPIC_API_KEY`.

`GET /api/ia/consumo` trae además, en cada ejecución reciente, `versionPrompt` y `reparaciones` (secciones 3.2 y 3.4). La pantalla no los muestra: sirven para comparar versiones desde la API o con la consulta de la sección 3.2.

La pantalla «Sistema» añade la cola: en cola, ejecutando, fallidas y completadas en 24 h, y avisos si el worker no da señales, si hay ejecuciones esperando más de 5 min o si falta la clave.

### 8.4 Pulse

| Origen | Cuándo | Cuerpo |
|---|---|---|
| Worker | En cada llamada a Claude (`onUsage`) | `tool`, `provider`, `model`, `inputTokens`, `outputTokens`, `origen: 'servidor'` y, si hubo caché, los campos de abajo |
| Intermediario | Al terminar cada respuesta (lee una copia del stream) | `tool`, `provider`, `model`, `inputTokens`, `outputTokens` y, si hubo caché, los campos de abajo |

- `POST` a `PULSE_URL` con `authorization: Bearer <PULSE_TOKEN>` si hay token. Es opcional: sin `PULSE_URL`, solo queda la línea `gasto_ia` en el log.
- `inputTokens` son todos los tokens de entrada, también los de la caché de prompts. Si la hubo, van además aparte `cacheCreationInputTokens` (escritos), `cacheCreation1hInputTokens` (de ellos, los de TTL de 1 hora) y `cacheReadInputTokens` (leídos), que Anthropic cobra a otro precio (sección 8.1). Sin caché, el cuerpo es el de siempre. Hasta el 1-oct-2026 el intermediario informaba solo `input_tokens` (sin la caché) y el worker, la entrada total; ahora los dos informan la total.
- Nunca afecta a la ejecución ni a la respuesta: los fallos se ignoran.
- El editor con clave propia no informa a Pulse.

---

## 9. El intermediario

Proxy Node (Hono) con el **mismo contrato que el Worker de Cloudflare del MVP**, para que el editor libre no cambie ([index.ts](../../apps/intermediario/src/index.ts)). Caddy lo publica en `/ia/*` del mismo origen y quita el prefijo.

| Ruta pública | Ruta en el contenedor | Qué hace |
|---|---|---|
| `POST /ia/v1/messages` | `POST /v1/messages` | Cabecera `x-processiq-code` + cuerpo JSON de la API de Anthropic. Devuelve la respuesta de Anthropic tal cual, SSE incluido |
| `GET /ia/health` | `GET /health` | `{ ok, servicio, configurado, formatoClave }`: dice si la clave tiene formato válido, sin revelarla. No pide código |
| `OPTIONS /ia/*` | `OPTIONS *` | CORS: 204 para orígenes permitidos, 403 para el resto |

Comprobaciones de `POST /v1/messages`, en orden:

| # | Comprobación | Si falla |
|---|---|---|
| 1 | `Origin` en `ALLOWED_ORIGINS` | 403 |
| 2 | Clave y código configurados | 500 |
| 3 | Código de equipo correcto (comparación en tiempo constante) | 401 |
| 4 | Cuerpo de 2 MB como mucho (cabecera y tamaño real) | 413 |
| 5 | JSON válido | 400 |
| 6 | Modelo en `claude-opus-5`, `claude-sonnet-5` o `claude-haiku-4-5` | 400 |

Después:

- acota `max_tokens` entre 1 y 64 000 (1 024 si no viene);
- solo admite `fallbacks: 'default'` (cualquier otro valor se quita) y, si viene, añade la cabecera beta del respaldo;
- llama a Anthropic con la clave central y el resto del cuerpo tal cual (también `cache_control` y `output_config`); si el navegador corta, la llamada se aborta;
- si Anthropic responde 401, devuelve **502**: falla la clave central, no el código del usuario.

Los errores propios tienen la forma de los de Anthropic (`type: 'error'`, `error.type: 'processiq_proxy'`).

Límite conocido: con el código de equipo se puede enviar **cualquier** prompt con la clave de la empresa. Por eso el tope de gasto en la consola de Anthropic y la rotación del código ([runbooks/rotacion-secretos.md](../runbooks/rotacion-secretos.md)).

---

## 10. Configuración

Nombres de las variables. Los valores van en `.env` del servidor, nunca en el repositorio.

| Variable | Servicio | Por defecto | Para qué |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | API, worker, intermediario | — | Clave de Anthropic. La API solo mira si existe (y no encola sin ella) |
| `MODELOS_IA_PERMITIDOS` | API | `claude-opus-5,claude-sonnet-5` | Modelos para generar. Uno desconocido impide arrancar |
| `MODELO_IA_ANALISIS` | API | `claude-sonnet-5` | Modelo de dolores y tareas |
| `PRESUPUESTO_IA_MENSUAL_USD` | API | 100 | Tope de la organización por mes |
| `LIMITE_IA_USUARIO_MENSUAL_USD` | API | 25 | Tope por persona y mes |
| `IA_CONCURRENCIA` | Worker | 2 | Ejecuciones a la vez |
| `LATIDO_SEGUNDOS` | Worker | 30 | Cada cuánto deja su latido |
| `ANTHROPIC_BASE_URL` | Worker | API real | Solo pruebas (Anthropic falso) |
| `PULSE_URL`, `PULSE_TOKEN` | Worker, intermediario | — | Registro de gasto (opcional) |
| `ACCESS_CODE` | Intermediario | — | Código de equipo |
| `ALLOWED_ORIGINS` | Intermediario | `https://${DOMINIO}` (en `docker-compose.yml`) | Orígenes permitidos, separados por coma |

Staging usa topes más bajos y una sola ejecución a la vez ([ADR 16](../adr/0016-staging-mismo-servidor.md), `.env.staging.example`).

---

## 11. Cómo se prueba sin gastar

| Nivel | Archivo | Cómo evita la red | Qué cubre |
|---|---|---|---|
| Unitarias del paquete | [packages/ia/src/ia.test.ts](../../packages/ia/src/ia.test.ts), [matrices.test.ts](../../packages/ia/src/matrices.test.ts) y [version.test.ts](../../packages/ia/src/version.test.ts) | `fetch` falso o `llamar` falso | Modos de `llamarClaude`, respaldo, reintento de red, errores, `extraerJson`, costes (también con caché de prompts) y estimación, prompts, validación y clasificación de errores; esquema, validación contra el proceso y reparación de las matrices; la versión de los prompts y sus huellas actuales |
| Intermediario | [apps/intermediario/src/index.test.ts](../../apps/intermediario/src/index.test.ts) | `fetch` falso | `health`, orígenes, código, modelos, JSON, tope de `max_tokens`, `fallbacks`, 401 → 502, `cache_control` tal cual y el gasto informado (`extraerUso`, con y sin caché) |
| Fidelidad | [pruebas/fidelidad/interacciones.spec.mjs](../../pruebas/fidelidad/interacciones.spec.mjs) y [divergencias.spec.mjs](../../pruebas/fidelidad/divergencias.spec.mjs) | Playwright intercepta la URL del intermediario | Editor libre: generación, niveles, tareas y dolores, con las **peticiones** comparadas byte a byte con el MVP. La RACI y el SIPOC, en `D12`: la matriz, el diálogo, el PPTX y, si falla, la misma petición del informe que el MVP. En `D21`, el coste de una generación cuya respuesta informa caché de prompts |
| Integración de la API | [apps/api/src/ia.test.ts](../../apps/api/src/ia.test.ts) | `fetch` falso que imita el SSE de Anthropic; esperas instantáneas; vigilancia cada 20 ms | Contra Postgres real: generar, reintentar, reparar, errores definitivos, cancelar, permisos y presupuesto, análisis (también las matrices, con su reparación y su fallo), SSE, consumo y huérfanas; la versión de los prompts y las reparaciones de cada tipo; el coste con caché de prompts en la fila, el consumo y el gasto informado |
| E2E | [pruebas/e2e/ia.spec.mjs](../../pruebas/e2e/ia.spec.mjs) con [anthropic-falso.mjs](../../pruebas/e2e/src/anthropic-falso.mjs) | Servidor HTTP local que responde `/v1/messages` en SSE, en trozos y con pausas | Con la web construida, la API, Postgres y el **worker real** (apuntado al falso con `ANTHROPIC_BASE_URL`): generación guardada como revisión, generación pendiente (con su coste con caché, su versión y sus reparaciones), copiloto y dolores, la RACI y el SIPOC editables y en el PPTX, consumo, y que quien solo lee no usa la IA |

- El Anthropic falso elige la respuesta según la petición: un proceso de 3 elementos para la generación, Markdown para una tarea, un JSON de dolores para el análisis y, con el sistema de las matrices, un SIPOC fijo o una RACI hecha con el resumen que recibe (R/A al rol de cada actividad y la auditoría interna informada). La generación informa 1 200 tokens de entrada de los que 400 se escriben y 600 se leen de la caché de prompts; lo demás, 1 200 sin caché.
- Para gastar de verdad en local: `pnpm --filter @processiq/api worker` con `ANTHROPIC_API_KEY` en `.env.dev`.

---

## 12. Ante un incidente

Resumen de [runbooks/incidente-ia.md](../runbooks/incidente-ia.md). Mira primero **«Sistema»** (worker y cola) e **«IA»** (últimas ejecuciones, con su error).

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Ejecuciones «En cola» que no avanzan; «El worker no da señales» | Worker parado | Revisar y levantar el servicio `worker`. Lo que estaba a medias vuelve solo a la cola |
| Todas fallan con clave inválida (401) | Clave revocada o mal copiada | Rotar la clave |
| 429, 529 u `overloaded` | Límite de la cuenta o saturación | El worker reintenta solo. Si persiste: esperar, bajar `IA_CONCURRENCIA` o revisar los límites en la consola |
| «Se alcanzó el presupuesto mensual» | `PRESUPUESTO_IA_MENSUAL_USD` | Decisión de negocio: subirlo y reiniciar la API, o esperar al mes siguiente |
| Una persona no puede usar la IA | `LIMITE_IA_USUARIO_MENSUAL_USD` | Igual; en «IA» se ve cuánto gastó |
| Gasto anómalo | Uso excesivo o un bucle | Ver en «IA» quién y qué. Parar el worker corta todo al momento (lo encolado espera). Bajar el presupuesto antes de volver a arrancarlo |
| Proceso generado incompleto o vacío | Documento muy largo o respuesta cortada | Regenerar en nivel Actividad o Ejecutivo, o dividir el documento |

- **Cortar la IA por completo:** parar `worker` (IA de los proyectos) e `intermediario` (IA del editor libre). La plataforma y el editor siguen en modo básico.
- **Después:** anotar qué pasó, cuánto duró, el coste afectado y qué se cambió.

---

## 13. Diferencias con la arquitectura y puntos por confirmar

- **Rutas distintas de las de [arquitectura.md §8](../arquitectura.md).** La tabla «Endpoints de negocio» nombra `POST /api/ia/analisis/pains` y `POST /api/ia/analisis/{tipo}`, y un SSE en `/api/ia/generaciones/{id}/eventos` con `Last-Event-ID`. El código usa `POST /api/ia/analisis` con `tipo` en el cuerpo y `/api/ia/ejecuciones/:id/eventos`, que no usa `Last-Event-ID` porque cada evento lleva el estado completo.
- **Caché de prompts y salida estructurada: medidas y descartadas por ahora** (las prevé la arquitectura). La caché no ahorra con los prompts de hoy (sección 3.3) y la salida estructurada no se puede validar sin datos de reparaciones ni llamadas reales (sección 3.4). La generación y las matrices piden JSON en el prompt y lo validan con Zod y una reparación. La versión del prompt sí se registra (`version_prompt`, sección 3.2), como huella y no como número.
- **No implementado todavía:** `sourceRefs`.
- **Salida de las respuestas cortadas.** Desde el 28-sep-2026 se suma la entrada de una llamada cortada ([§7](#7-cliente-de-claude-llamarclaude)), pero su salida casi nunca se conoce: el consumo registrado puede quedar algo por debajo del real. Para acercarlo habría que estimar la salida a partir del texto recibido.
- **Datos personales en `parametros`.** Al terminar una ejecución (completada, fallida o cancelada) se borran el texto y `parametros.roles` (nombres de los participantes). Quedan los nombres de los archivos de las fuentes. Por confirmar con la política de datos pendiente con Legal.
- **Modelo elegido y permitido.** En modo proyecto, el diálogo ofrece Opus 5 y Sonnet 5 con la estimación del navegador, aunque el servidor permita otros. Si pide uno no permitido, el servidor usa el primero permitido y el editor lo avisa (`modeloSustituido`).
- **Pulse sin precio.** Pulse recibe tokens, no dólares: con caché de prompts necesita los campos aparte (sección 8.4) para cobrarlos bien. Si Pulse no los lee, sobrevalora lo leído de la caché (que hoy nadie pide).
