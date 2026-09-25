# ProcessIQ

### 🌐 App en vivo → **https://nelson2206.github.io/process-iq/**

Herramienta web de **diagramación, diagnóstico y reingeniería de procesos** con nomenclatura **BPMN 2.0**, para acelerar el levantamiento de procesos en **Minsait Business Consulting · Perú**.

Convierte **audio de entrevistas, notas o event logs (CSV)** en flujogramas automáticamente, detecta *pains*, referencia KPIs de industria, simula escenarios To-Be y exporta a **PPTX / BPMN / SVG / PNG / Word** — todo client-side, sin backend.

## ✨ Capacidades clave

- **BPMN 2.0 completo y editable** — tareas (user/manual/service/send/script), gateways **XOR / AND / OR**, eventos (mensaje / timer / error / señal / terminación, *catch* + *throw*), **eventos de borde**, marcadores (subproceso / loop / multi-instancia) y **swimlanes** por responsable. Consistente en canvas, leyenda y export.
- **Ingesta multi-formato** — voz (audio), notas (NLP), **event log CSV → process discovery** (alpha-miner) y **carga de documentos**: **Word (.docx) · PDF · PowerPoint (.pptx) · texto** (se extraen a texto para revisar) y **BPMN 2.0 (.bpmn/.xml)** (import directo del diagrama, round-trip verificado).
- **Ficha de Proceso corporativa** — genera el documento formal de 12 bloques (gobernanza, objetivo, alcance, indicadores, responsabilidades, **detalle de actividades con ruteo derivado del flujo**, sistemas, términos, anexos, control de cambios) con vista previa y export a Word. Entrenada con una ficha real (PR-DU-COM-02).
- **Analítica 2026** — comparador **What-If**, scoring de **automatización**, **cuello de botella** + ruta crítica, **variantes**, mapa de valor **Lean (VA/NVA)**, **backlog** de iniciativas y edición por **lenguaje natural**.
- **12 ejemplos demo** en 8 verticales (Banca · Seguros · Retail · Manufactura · Salud · Utilities · Telecom · Sector Público) + un showcase de 27 nodos.
- **Export** a SVG · PNG · **BPMN 2.0** (Bizagi/Camunda) · **PPTX** (con slide de leyenda) · Word · **Ficha de Proceso** · JSON.
- **UX** — auto-layout sin cruces, zoom (rueda/atajos/ajustar), **deshacer/rehacer**, paneles colapsables, leyenda BPMN y atajos de teclado.

## ▶️ Cómo usar

Abre el **[link en vivo](https://nelson2206.github.io/process-iq/)** en una laptop o monitor. En la pantalla inicial elige: **Cargar ejemplo** (explora un demo completo), **Ingestar** (audio / notas / CSV) o **Dibujar manual** (arrastra shapes). *Optimizado para escritorio.*

---

<details>
<summary>📜 <b>Historial de versiones</b> (notas detalladas de cada release)</summary>

> 🩹 **Ingesta en un solo gesto + fin de los cuelgues con PDF grandes (v2.0.0)**: reportado que "*la app se moría al cargar un PDF grande*". Medido con un PDF real de 150 páginas: no era un crash sino **13,8 s de UI congelada sin ningún aviso** (4,5 s cargando pdf.js + 8,5 s extrayendo, bloqueando el hilo). Arreglado: **progreso real página a página** con cesión del hilo cada 3 páginas (125 actualizaciones visibles en la prueba), **botón Cancelar** que aborta de verdad (extracción y llamada a la IA vía `AbortController`) sin destruir el diagrama actual, **guardia de tamaño** (aviso claro >40 MB en vez de colgar el navegador), **timeout de 3 min** en la llamada a la IA, tope de **120 páginas** anunciado en pantalla (antes truncaba a 60 en silencio) y mensajes de error en cristiano para PDF **escaneado sin capa de texto**, **protegido con contraseña** o **dañado**. También se acotó la explosión de nodos del modo sin IA (un documento largo generaba cientos de nodos ilegibles: ahora tope de 60 con recomendación de activar la IA). **UX simplificada**: el panel de ingesta pasa de 4 botones a **una zona de arrastrar y soltar + un único botón "Generar proceso"**; el texto manual queda plegado en "o pega el texto a mano", y una línea indica si se usará IA o el modo básico. Verificado: cancelar → reintentar funciona, guardias y errores muestran el mensaje correcto, 0 errores inesperados en consola.

> 🤖 **Interpretación con IA — Claude API (v1.9.0)**: la ingesta de documentos deja de ser sólo heurística. Con el botón **⚙ Ajustes de IA** configuras tu **API key de Anthropic** (modo **BYOK** — la key se guarda *solo en tu navegador*, nunca pasa por un servidor) y eliges el modelo (**Claude Opus** por defecto · Sonnet · Haiku). Luego, al cargar un Word/PDF/PPTX o pegar notas, el botón **✨ Interpretar con IA** manda el texto a Claude, que **reconstruye el flujo BPMN completo** — actividades, roles (carriles), sistemas, decisiones, loops y metadatos de ficha (código/objetivo/alcance/sistemas/glosario) — en vez de la extracción por regex. La llamada es directa desde el navegador (`anthropic-dangerous-direct-browser-access`), con manejo de errores 401/429 y botón *Probar conexión*. Se mantiene la opción **Sin IA (heurístico)** para uso sin key. Verificado headless: payload correcto (endpoint, headers, modelo `claude-opus-5`), mapeo de la respuesta a nodos/edges/carriles/ficha, panel de ajustes y badge de estado, 0 errores.

> 📋 **Generador de Fichas de Proceso + ingesta multi-formato (v1.8.0)**: nueva pestaña **Ficha** y export **"Ficha de Proceso · formato corporativo"** que arma el documento formal completo (12 bloques) a partir del modelo. El **Detalle de Actividades** se deriva del grafo: numera las actividades en orden de flujo y genera el **ruteo real** desde las compuertas (*"Sí → continuar en la actividad 7"*, *"No → Fin del proceso"*); los **sistemas** son la unión de los declarados por nodo + los de nivel proceso; **responsabilidades** salen de los swimlanes. Los metadatos (código, versión, objetivo, alcance, **gobernanza** Dueño/Editor/Revisor/Aprobador, términos, anexos, control de cambios) se editan en la pestaña. Incluye vista previa con el diagrama embebido y descarga a Word. **Ingesta ampliada** a los formatos habituales de un proyecto de procesos: **Word (.docx)** vía mammoth, **PDF** vía pdf.js, **PowerPoint (.pptx)** vía JSZip (todas se extraen a texto para revisar antes de generar) y **BPMN 2.0 (.bpmn/.xml)** con importador nativo (sin librerías) que reconstruye tasks/gateways/eventos/flujos. Entrenado y validado con la ficha real **PR-DU-COM-02 Venta de Lotes Urbanos (Centenario)** — nuevo demo de 33 nodos / 4 roles / 2 loops / 3 ramas de firma. Verificado headless: flujo armado correcto, **round-trip BPMN sin pérdida** (33 nodos ↔ 33), extracción del Word real (39.7k caracteres), ficha con 30 actividades y ruteo correcto, 0 errores.

> ♿ **Fix de contraste WCAG AA (v1.6.1)**: audit de contraste (computado headless) encontró que el **naranja de marca #FF4713 (3.41:1)** se usaba como **texto pequeño** sobre blanco en 4 sitios (headers de la leyenda BPMN, benchmark de KPIs, target del linter, estado de grabación) — por debajo del mínimo AA de 4.5:1. Se añadió un token **--indra-primary-text (#C2330C, 5.57:1)** para esos textos, manteniendo el naranja brillante para rellenos/bordes/acentos/iconos (donde 3:1 basta). Los grises del sistema ya cumplían (gray-500 = 5.33:1). El header oscuro: 19.8:1.

> 🗂️ **Galería de ejemplos accesible + limpieza de emojis (v1.6.0)**: el selector de los **12 ejemplos demo** ahora se abre también desde **Ingestar → "Ver ejemplos"** (antes solo desde la pantalla inicial vacía) — útil para explorar varios procesos en el demo público sin pasar por "Nuevo". Se reemplazaron los últimos emojis del modal de ingesta (✨/📄) y el título de la galería por iconos SVG / texto. Verificado headless: la galería abre con 13 entradas, 0 emojis en el toolbar, 0 errores.

> 🔬 **v1.0** añade las 4 funcionalidades del benchmark 2026 ([`BENCHMARK_NUEVAS_FUNCIONALIDADES.md`](BENCHMARK_NUEVAS_FUNCIONALIDADES.md)):
> - **Comparador What-If** — compara escenarios To-Be (FTE/lead time/costo/ahorro) eligiendo palancas.
> - **Scoring de automatización** — rankea tareas por potencial RPA/IDP/IA con ahorro anual y payback.
> - **Cuello de botella + ruta crítica** — identifica el constraint (carga = tiempo×volumen) y lo resalta en el diagrama.
> - **Análisis de variantes** — del event log, muestra happy path vs excepciones/reprocesos con frecuencia.
>
> - **Mapa de valor Lean (VA/NVA)** — tinta el diagrama por valor añadido (verde/amarillo/rojo) + % de carga en desperdicio.
> - **Backlog de iniciativas** — consolida pains + oportunidades de automatización + gaps de KPI en un roadmap priorizado (impacto/esfuerzo, horizonte, owner), exportable a CSV.
> - **Edición por lenguaje natural** (AI-agent) — comandos en el copiloto: `agregar X después de Y`, `eliminar Z`, `renombrar X a Y`, `conectar X con Y`, `marcar X como automático`. Aplicados al diagrama al instante.
>
> 🐛 **Fix crítico**: el auto-layout entraba en bucle infinito con procesos cíclicos (event logs con reprocesos) → corregido con tope de rank.
> 🐛 **Fix layout complejo (v1.1)**: en procesos con loops de reproceso, los back-edges inflaban los ranks y causaban superposición de nodos. Ahora se detectan back-edges con DFS y se calcula el rank con **longest-path sobre el DAG** → sin solapamientos. Espaciado más generoso (colW 240, laneH 170) y reparto vertical centrado para múltiples nodos por carril. **PPTX**: 4 ranks por slide (cajas más anchas) y fuente 8pt adaptativa cuando hay >5 actores. Probado con un proceso de 8 actores / 23 nodos / loop.

> 🔷 **Gateways BPMN (v1.2)**: las decisiones soportan los 3 tipos de gateway BPMN 2.0 con su marca: **✕ Exclusivo (XOR)** un solo camino, **＋ Paralelo (AND)** todos los caminos (fork/join), **○ Inclusivo (OR)** uno o varios. Marcador renderizado en el rombo (canvas y PPTX) y editable en el panel Props. Los gateways paralelos no fuerzan Sí/No. Nuevo ejemplo **Onboarding de Personal** (7 actores, gateway paralelo que provisiona IT/Legal/Finanzas/Seguridad simultáneamente) — accesible vía `ProcessIQ.loadComplex2()`.

> 🟡 **Eventos BPMN (v1.3)**: el modelo soporta **eventos de inicio, intermedios y de fin** con sus subtipos BPMN 2.0 y la iconografía estándar: **✉ Mensaje** (catch=contorno / throw=relleno), **⏱ Temporizador** (esperas/SLA), **⚡ Error** (fin de excepción), **▲ Señal**. Los **eventos intermedios** se renderizan con el **doble anillo** característico de BPMN. Todo editable en el panel Props (nuevo selector "Tipo de evento" que aparece para inicio/intermedio/fin) y exportado al PPTX. El botón **"Cargar ejemplo"** del onboarding ahora abre un **selector con los procesos demo** (Reclamos · Hipotecario · Onboarding · Devolución · Siniestros · Emergencia). Nuevo ejemplo **Gestión de Devolución y Reembolso (Retail)** — 5 actores, 17 nodos, **3 eventos intermedios** (2 timer ⏱ que modelan las esperas de lead time + 1 mensaje ✉), inicio de mensaje, fin de error ⚡ y fin de mensaje ✉ — accesible vía `ProcessIQ.loadComplex3()`. Los timers hacen explícito el tiempo de espera como fuente directa de mejora.

> 🟢 **Marcadores de actividad BPMN + gateway inclusivo (v1.3)**: las tareas soportan los **marcadores de actividad BPMN 2.0** en la base (centro inferior): **⊞ Subproceso** (colapsado), **↻ Loop** (actividad cíclica), **‖ Multi-instancia paralela**, **≡ Multi-instancia secuencial**. Editables desde el panel Props (selector "Marcador de actividad", visible solo para tareas). Hacen explícito el patrón de ejecución —insumo directo para dimensionar automatización y SLA. Nuevo ejemplo **Gestión de Siniestros de Seguros** — 7 actores, 18 nodos, primer uso del **gateway inclusivo ○ (OR)** (abre documentación y/o peritaje), 3 marcadores de actividad (loop en *Solicitar documentación*, multi-instancia en *Cotizar talleres*, subproceso en *Evaluar cobertura*), 2 timers ⏱, inicio de mensaje, fin de error ⚡ — accesible vía `ProcessIQ.loadComplex4()`. Se añadieron al catálogo el vertical **Seguros** y los macroprocesos **Siniestros/Suscripción** con 6 KPIs de referencia (loss ratio, ratio combinado, lead time de siniestro, etc.). Los includes locales llevan ahora `?v=…` para forzar recarga sin caché.

> 🔺 **Eventos throw + señal (v1.3.1)**: los **eventos intermedios de tipo *throw* (lanzar)** se renderizan **rellenos** (BPMN distingue catch=contorno / throw=relleno) vía flag `throw`. Se estrena el **evento de señal ▲** (broadcast 1→N, distinto del mensaje 1→1). Nuevo ejemplo **Atención Hospitalaria de Emergencia (Salud)** — 6 actores, 21 nodos, con **gateway paralelo ＋ fork/join** (triaje + signos vitales simultáneos), **evento de señal throw** (*Difundir código rojo*), timer ⏱ (esperar resultados), los 3 marcadores de actividad, inicio de mensaje, fin de error ⚡ (derivación) y fin de mensaje ✉ (alta) — accesible vía `ProcessIQ.loadComplex5()`. El selector de onboarding lista **6 procesos demo**. Verificado en navegador: 0 solapamientos, 0 líneas diagonales, 0 errores de consola.

> ⬤ **Evento de terminación + legibilidad de conectores (v1.3.2)**: nuevo **evento de fin de terminación BPMN ⬤** (disco relleno — corta toda la instancia, distinto de un fin de path normal) vía flag `terminate`, editable con un checkbox en el panel Props (visible solo para eventos de fin). **Mejora transversal**: las **etiquetas de los conectores** (Sí/No/ramas) ahora llevan un **fondo "pill"** blanco con borde sutil, medido con `getBBox`, para que no se confundan con las líneas — aplica a todos los diagramas. Nuevo ejemplo **Orden de Producción a Despacho (Manufactura)** — 7 actores, 20 nodos, con **evento de terminación** (*Orden cancelada* por crédito rechazado), convivencia de **make-to-stock vs make-to-order** (dos rutas que convergen en *Despachar*), gateway paralelo ＋ (compra ∥ preparación de línea), timer ⏱ y los 3 marcadores de actividad — accesible vía `ProcessIQ.loadComplex6()`. El selector de onboarding lista **7 procesos demo** (Banca · Retail · Seguros · Salud · Manufactura). Verificado en navegador: 0 solapamientos, 0 diagonales, 0 errores; pills funcionando en todos los ejemplos sin regresión.

> 📑 **Iconografía BPMN completa en el export PPTX (v1.3.3)**: el export a PowerPoint ahora **dibuja toda la nomenclatura BPMN** que antes solo existía en el canvas: **eventos intermedios** (elipse con doble anillo), **subtipos de evento** con su glyph (✉ mensaje, ⌛ timer, ⚡ error, ▲ señal), **evento de terminación ⬤** (disco relleno) y **marcadores de actividad** en la base de las tareas (⊞ subproceso, ↻ loop, ‖ multi-instancia). Verificado generando el .pptx en memoria: los glyphs ✉ ⌛ ⊞ ↻ ⚡ se inyectan en los slides y el deck se construye sin errores (13 slides para Manufactura). Resuelve la observación previa de que *"la exportación a PPTX no se visualiza bien"* para los elementos BPMN nuevos. Nuevo ejemplo **Gestión de Avería Telecom — Trouble-to-Resolve** — 5 actores, 18 nodos, con escalamiento **L1→L2→cuadrilla de campo** (3 gateways exclusivos), timer ⏱ (ventana SLA), inicio de mensaje, fin de error ⚡ (reapertura) y fin de mensaje ✉ (resuelta), los 3 marcadores de actividad — accesible vía `ProcessIQ.loadComplex7()`. Se añadió el vertical **Telecomunicaciones** con 5 KPIs (MTTR, FCR, cumplimiento SLA, churn, tiempo de activación). El selector de onboarding lista **8 procesos demo** (Banca · Retail · Seguros · Salud · Manufactura · Telecom). Verificado: 0 solapamientos, 0 diagonales, 0 errores.

> 🗂️ **Slide de leyenda BPMN + gateway exclusivo en PPTX (v1.3.4)**: el export a PowerPoint incluye ahora una **slide de leyenda** que documenta toda la nomenclatura BPMN en 3 columnas (formas y flujos · eventos y subtipos · gateways y marcadores), con la regla *contorno = catch / relleno = throw* — para que el cliente lea el diagrama sin conocer BPMN. Además el **gateway exclusivo (XOR)** ahora muestra su marca **✕** en el rombo del PPTX (antes solo parallel/inclusive tenían marca). Nuevo ejemplo **Licencia de Funcionamiento Municipal (Sector Público)** — 6 actores, 17 nodos, con gateways exclusivos, **timer ⏱ del plazo legal TUPA** (la inspección que lo excede modela el cuello del *silencio administrativo*), inicio de mensaje, **dos fines de error ⚡** (expediente observado · licencia denegada) y fin de mensaje ✉ (otorgada), marcadores ⊞/↻ — accesible vía `ProcessIQ.loadComplex8()`. El selector de onboarding lista **9 procesos demo** (Banca · Retail · Seguros · Salud · Manufactura · Telecom · Sector Público). Verificado: 0 solapamientos, 0 diagonales, 0 errores; PPTX genera 13 slides con la leyenda incluida.

> 🔭 **Zoom y ajuste a pantalla (v1.3.6–1.3.7)**: control completo del zoom sobre el flujo donde se trabaja:
> - **Controles sobre el lienzo** (− · nivel% · ＋ · **⤢ Ajustar**). "Ajustar" encuadra **todo el proceso en una sola vista** (clave para revisar flujos anchos de 8 actores sin scrollear).
> - **Rueda del mouse Ctrl/⌘ + scroll → zoom hacia el cursor** (como Figma/draw.io; el pinch del trackpad también funciona). Verificado: el punto bajo el cursor permanece fijo con **deriva 0 px**.
> - **Atajos de teclado**: `Ctrl/⌘ +` acercar · `Ctrl/⌘ −` alejar · `Ctrl/⌘ 0` a 100% · `F` ajustar.
> - Para habilitarlo de forma segura se refactorizó la conversión de coordenadas del lienzo a **base-matriz (`getScreenCTM`)** — verificado que el **arrastre manual de nodos sigue siendo exacto a cualquier nivel de zoom** (error 0 px medido al 25%, drag real confirmado al 100%). El zoom usa el `viewBox` del SVG (no rompe el scroll, el grid ni el export PPTX).
>
> Mejora de calidad transversal medida en v1.3.6: en los ejemplos complejos hay **0 cruces de líneas** y **~0 aristas sobre nodos** (1 roce marginal), confirmando que el auto-layout ortogonal por carriles ya es limpio.

> 🧹 **Zoom en la barra de estado + ocultar panel derecho (v1.3.8)**: el control de zoom se **integró en la barra de estado inferior** (alineado a la derecha) — antes flotaba sobre el lienzo y se encimaba con el indicador de modo/guardado. Nuevo botón **"⇥ Ocultar panel"** que **colapsa el panel derecho** (Props · Pains · KPIs · Sim · Lint · IA) para que el lienzo ocupe todo el ancho disponible — ideal para revisar flujos anchos o presentar; un clic lo restaura ("⇤ Mostrar panel"). Verificado: el lienzo reajusta su ancho al colapsar, el zoom sigue funcionando y no hay solapamientos.

> 🛣️ **Swimlanes en el export BPMN XML (v1.5.4)**: el `.bpmn` ahora incluye un **`<bpmn:laneSet>`** con un **`<bpmn:lane>` por responsable** (carril), cada uno con sus `<bpmn:flowNodeRef>` (incluidos los eventos de borde en el carril de su tarea), más el **DI de los carriles** (bandas horizontales con bounds calculados desde los nodos miembros). Así Bizagi/Camunda **preserva los actores/swimlanes** al importar, en vez de aplanar el proceso. Verificado con test de Node: cada nodo cae en su carril correcto. Completa el export de alta fidelidad de v1.5.3.

> 💾 **QA de analítica (14/14) + persistencia de la UI (v1.5.9)**: QA headless de **las 14 acciones del copiloto** (generate, pains, KPIs, to-be, RACI, SIPOC, impacto-esfuerzo, what-if, automatización, cuello de botella, variantes, mapa de valor, backlog, resumen ejecutivo): **0 errores en todas** — la suite de analítica del app público está sana. Mejora: el **estado colapsado de los paneles** (barra de shapes / panel derecho) ahora **persiste entre recargas** (localStorage), continuidad UX. Verificado con dos cargas que comparten storage: la 2ª restaura el colapso.

> 📊 **Event log de muestra enriquecido — showcase de process mining (v1.5.8)**: la muestra de "Cargar event log" pasó de 4 casos a **15 casos con 4 variantes** realistas (happy path 53% · rechazo 20% · reproceso con "Solicitar info adicional" 13% · escalamiento a "Revisar riesgo" 13%), 8 actividades y 5 roles. Hace mucho más impactante el diferenciador "data-mining → flujograma" en el link público: el descubrimiento genera 10 nodos y el **análisis de variantes** muestra la distribución real (happy 53% vs 47% en excepciones — el insight consultivo clave). Verificado headless: discovery 10 nodos, modal de variantes con los % exactos, 0 errores.

> 📱 **Aviso para móvil en el link público (v1.5.7)**: ProcessIQ es una herramienta de escritorio (grid toolbar + lienzo + panel); al compartir el **link público**, alguien podría abrirlo en el teléfono y ver una UI rota. Se añadió un **overlay branded** que aparece solo en pantallas **< 720px** ("ProcessIQ está optimizado para escritorio") con un botón **"Continuar de todos modos"** (dismissible). Verificado headless en dos tamaños: a 478px aparece y se cierra al continuar; a 1258px no aparece. Evita una mala primera impresión a visitantes móviles sin afectar el uso en escritorio.

> 🔎 **Core "data-mining → flujograma" verificado + auto-encuadre en ingesta (v1.5.6)**: se verificó end-to-end (headless) el **diferenciador que el cliente pidió desde el inicio**: desde un **event log CSV**, el alpha-miner **descubre el proceso** (9 nodos, con variantes aprobar/rechazar y reproceso) sin errores; y la **ingesta por notas/audio (NLP)** genera el flujo (9 nodos del texto en español). Mejora añadida: tras **cualquier ingesta** (event log, notas o audio) el proceso resultante se **auto-encuadra** si desborda la pantalla, igual que al cargar un ejemplo — para ver el resultado completo de inmediato. Verificado: CSV→20% fit, notas→9 nodos, 0 errores.

> ✅ **Regresión 13/13 + página 404 (v1.5.5)**: smoke test headless (Chrome CLI) sobre **los 13 ejemplos** (demo + 12 complejos) tras los muchos cambios recientes: **0 errores de consola, 0 solapamientos en todos**, node counts correctos (9 a 27). Confirma que el app público quedó sólido en todos los flujos. Como pulido del sitio público se añadió una **página 404 branded** (marca M, fondo oscuro, botón "Ir a ProcessIQ") en vez del 404 genérico de GitHub.

> ⌨️ **Panel de atajos de teclado (v1.5.4)**: nuevo botón **"?"** (junto a deshacer/rehacer) y tecla **`?`** que abren un panel con todos los atajos —deshacer/rehacer, zoom (＋/−/0/rueda), ajustar (F), conectar (C), eliminar (Supr), Esc— con teclas estilo `<kbd>`. Mejora la descubribilidad del set de shortcuts acumulado. Verificado headless (Chrome CLI): abre/cierra sin errores, 11 filas, botón con estado activo. Empujado al sitio en vivo.

> 📤 **Export BPMN 2.0 XML de alta fidelidad (v1.5.3)**: el export a `.bpmn` (para **Bizagi/Camunda**) ahora emite los **elementos BPMN correctos** en vez de genéricos: gateways por tipo (**exclusiveGateway / parallelGateway / inclusiveGateway** según el gateway), **eventos intermedios** como `intermediateCatchEvent`/`intermediateThrowEvent` (antes caían erróneamente a `task`), **event definitions** (`timerEventDefinition` / `messageEventDefinition` / `errorEventDefinition` / `signalEventDefinition` / `terminateEventDefinition`) en inicio/intermedio/fin, **loop characteristics** (`standardLoopCharacteristics` / `multiInstanceLoopCharacteristics`) para los marcadores, subtipos de tarea (`userTask`/`manualTask`/`sendTask`/`serviceTask`/`scriptTask`) por tipo de ejecución, y los **eventos de borde** como `<bpmn:boundaryEvent attachedToRef cancelActivity>` con su event definition y DI. Verificado: 12/12 casos de mapeo correctos en un test de Node — el diagrama importa con semántica real, no como cajas genéricas.

> ✏️ **Boundary events editables en el panel Props (v1.5.2)**: se cerró el último hueco de edición — ahora los **eventos de borde se configuran desde la UI** (no solo en datos de demo). Nuevo selector **"Evento de borde BPMN"** en el panel Props (visible para tareas), con las combinaciones type|interrupting: *⏱ Timer interrumpe / no interrumpe*, *⚡ Error interrumpe*, *✉ Mensaje no interrumpe*. Con esto **toda la vocabulario BPMN es editable por UI** (tipo de bloque, evento, gateway, marcador de actividad, terminación y ahora boundary). Replica el patrón ya verificado de los demás selectores de Props. *Verificación visual pendiente de selección de navegador (dos Chrome conectados durante la iteración autónoma).*

> 🔗 **Boundary events integrados en PPTX y leyendas (v1.5.1)**: se completó la integración de los eventos de borde en **todas las salidas** para consistencia de nomenclatura: ahora se **dibujan en el export PPTX** (círculo ámbar punteado con glyph timer/error/mensaje en la esquina inf-izquierda de la tarea), y aparecen como fila en la **leyenda del canvas** y en la **slide de leyenda del PPTX** (con la nota "Punteado = no interrumpe"). Verificado en memoria: leyenda del canvas y del PPTX con la fila boundary, 3 elipses ámbar punteadas en el deck (2 en tareas + 1 en leyenda), 0 errores.

> ◎ **Eventos de borde (boundary events) — el último elemento BPMN (v1.5.0)**: se completó el set BPMN 2.0 con los **eventos de borde**, que modelan el manejo de excepciones por SLA/timeout sin romper el camino feliz. Se renderizan como un **círculo de evento sobre el borde de la tarea** (esquina inferior-izquierda, libre de colisión con el badge de pain y el marcador de actividad): **anillo simple = interrumpe**, **anillo punteado = no interrumpe**, con glyph **timer ⏱ / error ⚡ / mensaje ✉**. Nuevo ejemplo **Fulfillment E-commerce con SLA (Retail)** — 6 actores, 16 nodos, con **2 eventos de borde de temporizador no-interrumpentes**: *Preparar pedido (picking)* → si vence el **SLA de 2h** escala a *Priorizar pedido* (el picking continúa en paralelo); *Despachar a ruta* → si hay **demora >24h** dispara *Notificar retraso*. Gateways exclusivos, timer intermedio, marcador ↻ loop, inicio/fin de mensaje, fin de error. Accesible vía `ProcessIQ.loadComplex12()`. Verificado: 2 boundary events renderizados (timer no-interrumpente), **sin colisión con el badge de pain**, 0 solapamientos, 0 diagonales, 0 errores. El selector lista **12 procesos demo**.

> 🧭 **Header reestructurado — 3 grupos, menos congestión (v1.4.8)**: la barra de acciones tenía 8 botones de peso visual similar amontonados. Se reorganizó en **3 grupos con jerarquía** aplicando taste/ui-ux-pro-max: **(1)** toggle limpio `[As-Is │ To-Be]` (se sacaron Clonar y To-Be IA del pill, que no eran segmentos de vista); **(2)** acciones de reingeniería To-Be: **Clonar** ahora es **icono compacto** + **To-Be IA** (emoji ✨ reemplazado por icono SVG sparkle); un **separador vertical │**; **(3)** documento: Nuevo · **Ingestar** (primario, único CTA naranja) · **Importar** ahora **icono compacto** · Exportar. Resultado: 2 etiquetas de texto menos, agrupación visual clara y una sola acción primaria destacada. Verificado: 2 segmentos en el toggle, separador presente, Clonar/Importar icon-only con `aria-label`, sin emoji, todo cabe (1246 ≤ 1266), handlers intactos (ids preservados), 0 errores.

> 🧰 **Fix: barra de herramientas del header ya no se corta (v1.4.7)**: en pantallas ~1280px los botones de la derecha (Importar/Exportar) se **recortaban** porque el contenido (1332px) superaba el viewport (1266px) y la sección de metadatos crecía sin ceder espacio. Se protegió `.header-actions` con `flex-shrink: 0` (los botones nunca se cortan) y se hizo **encogible** la sección de metadatos (`min-width: 0`, inputs/selects con `flex` y `min-width` reducido). Ahora la meta cede el ancho (510→352px, el nombre del proceso se trunca en pantalla pero conserva su valor) y **todos los botones quedan visibles** (As-Is · To-Be · Clonar · To-Be IA · Nuevo · Ingestar · Importar · Exportar). Verificado: las acciones terminan en 1246px ≤ 1266 viewport (antes 1408, se salían 142px); 0 errores.

> ↩️ **Deshacer / Rehacer (v1.4.6)**: nuevos botones **↶ Deshacer / ↷ Rehacer** (arriba-izquierda del lienzo) + atajos **Ctrl/⌘ Z** (deshacer) y **Ctrl/⌘ Y · Ctrl/⌘ Shift Z** (rehacer). Historial de hasta 60 snapshots del estado completo (nodos, conexiones, vistas As-Is/To-Be, RACI/SIPOC/KPIs/lanes), enganchado en `persist()` —el punto central tras cada mutación— con **dedupe** de estados idénticos. Cubre cualquier edición: mover nodos, agregar/eliminar, cambiar propiedades, comandos del copiloto, transformaciones To-Be. **Cargar un ejemplo o "Nuevo" reinicia el historial a una sola línea base** (un microtask captura el estado final tras la carga, ignorando los `persist()` intermedios). Los botones se deshabilitan en los extremos del historial. Verificado: mover nodo → undo lo devuelve a su posición exacta → redo lo reaplica; borrar nodo (17→16) → undo lo restaura (17); baseline tras demo deja ambos botones deshabilitados; 0 errores.

> 📌 **Fix: barra de estado y botones anclados al lienzo (v1.4.5)**: la barra de estado (nodos · conexiones · modo · zoom) y los botones flotantes (Presentar · Leyenda · Ocultar panel) **se desplazaban con el flujo** al hacer scroll vertical —quedaban flotando a media pantalla— porque vivían dentro del contenedor con scroll. Se separó el scroll en una **capa interna** (`.canvas-scroll`, que conserva el id `canvasWrapper`) y el contenedor externo dejó de scrollear, de modo que la barra queda **pegada al fondo** y los botones al tope sin importar cómo navegues el diagrama. Verificado: con scroll a 400px la barra sigue al fondo del área, el zoom-to-fit y el arrastre de nodos siguen exactos (error 0 px), 0 errores.

> ★ **Ejemplo showcase — todos los elementos BPMN en un flujo (v1.4.4)**: undécimo demo **Originación de Crédito Comercial PYME (Banca)** — el más grande: **9 actores · 27 nodos · 30 conexiones**. Ejercita TODA la nomenclatura BPMN en un solo proceso: nodos **Documento ▤** (expediente) y **Data ▱** (score crediticio) —antes sin usar en ejemplos complejos—, los **3 gateways** (exclusivo ✕ / paralelo ＋ fork-join / inclusivo ○ garantías y/o legal), **timer ⏱** (esperar comité), **señal ▲ throw** (difundir aprobación), **terminación ⬤** (cancelación del cliente), **2 fines de error ⚡**, inicio/fin de mensaje ✉, y los 3 marcadores (⊞ subproceso, ‖ multi-instancia, ↻ loop con back-edge de subsanación). Accesible vía `ProcessIQ.loadComplex11()`. **Sirve de stress-test del auto-layout**: verificado a escala con **0 solapamientos, 0 diagonales y solo 1 cruce de línea** (inevitable por el back-edge del loop) en 30 aristas — confirma que el layout ortogonal por carriles aguanta procesos grandes. El selector lista **11 procesos demo**.

> 🖌️ **Pase de diseño profundo — emojis → iconos SVG (v1.4.3)**: hallazgo principal de las 3 skills sobre la UI real: el **panel Copiloto (14 acciones) y el onboarding (3 cards) usaban emojis como iconos** (🧠🔍📊🚀…), que las tres prohíben explícitamente (**ui-ux-pro-max** Regla #4 `no-emoji-icons`; **taste-skill** 3.D *Emoji Policy*; **emil** iconografía consistente y tokenizable). Se reemplazaron los **17 emojis por iconos SVG estilo Lucide** (viewBox 24, stroke 2, tamaño uniforme 17px, color gris-500 que pasa a magenta Indra en hover) — el panel pasa de "emoji-cluttered" a una iconografía monocroma consistente Linear/Raycast-tier. Verificado: 14/14 acciones y 3/3 onboarding con SVG, 0 emojis restantes, handlers (`data-action`) intactos, 0 errores. Auditoría confirmó que modal (`scale(0.97)`+opacity+spring) y dropdown (origin-aware `top right`) ya cumplían emil — no se tocaron.

> 🎨 **Pase de diseño con 3 skills reales (v1.4.2)**: se ejecutaron las skills **`emil-design-eng`** (Emil Kowalski), **`taste-skill`** y **`ui-ux-pro-max`** sobre la UI. Hallazgos aplicados (review en formato Before/After de Emil):
> - **Anti-patrón `transition: all`** en los 3 botones de chrome (Presentar/Leyenda/Panel) → reemplazado por propiedades específicas (`background, border-color, color, box-shadow, transform`).
> - **Falta de feedback `:active`** en chrome y zoom → añadido `scale(0.97)` / `scale(0.94)` al presionar ("los botones deben sentirse").
> - **Accesibilidad (ui-ux-pro-max)**: `aria-label` en botones solo-símbolo (zoom −/＋, cerrar leyenda) que los lectores de pantalla leían mal; `title` en cada shape del rail compacto.
> - Auditoría confirmó que el sistema ya cumplía los *locks* de taste-skill (un acento, una escala de radios), `:focus-visible` completo, tokens de easing `--ease-out` (cubic-bezier 0.32,0.72,0,1) y `prefers-reduced-motion` — no se reescribió, se reforzó. 0 errores.

> 🔁 **Ejemplo P2P (Transversal) + auto-encuadre al cargar (v1.4.1)**: décimo proceso demo **Procure-to-Pay (P2P)** — 7 actores, 19 nodos, proceso **cross-funcional** (Solicitante → Compras → Aprobador → Proveedor → Almacén → Cuentas por Pagar → Tesorería) con el **3-way match como subproceso ⊞**, gateways exclusivos (umbral, recepción, match), timer ⏱, dos fines de error ⚡ (recepción rechazada, factura en disputa). Vertical **Transversal** con 5 KPIs nuevos (cycle time P2P, 3-way match automático, costo por OC, DSO, time-to-hire). Accesible vía `ProcessIQ.loadComplex10()`. **Mejora UX**: al cargar un ejemplo del selector, si el proceso es **más ancho que la pantalla se auto-encuadra** (zoom-to-fit) para verlo completo de inmediato; los pequeños se quedan a 100%. Verificado: 0 solapamientos, 0 diagonales, 0 errores.

> 🎛️ **Barra de shapes comprimible + pase de diseño (v1.4.0)**: la **barra de shapes** ahora se **comprime a un rail compacto solo-iconos** (~56 px) con un botón de chevron; los iconos BPMN siguen siendo reconocibles y arrastrables, con tooltip por forma. Combinada con el colapso del panel derecho, el lienzo gana el **máximo ancho** (verificado: todo un proceso de 8 actores se ve completo y más legible —"Ajustar" sube de 25% a 34%). **Pase de diseño** aplicando los principios de *Emil Kowalski* (movimiento con propósito), *taste* (minimalismo, jerarquía) y *UX/UI Pro Max* (affordances, accesibilidad):
> - **`prefers-reduced-motion`**: se respeta la preferencia del sistema desactivando animaciones/transiciones (a11y).
> - **Micro-interacciones**: en el rail compacto el hover usa una **escala sutil** (no desplazamiento) con el easing `--ease-out` (cubic-bezier 0.32,0.72,0,1, firma tipo Vaul).
> - Se confirmó que el sistema ya tenía `:focus-visible` completo, tokens de easing/duración y spring — se mantuvo la **consistencia** sin reescribir.
> - Estados de colapso independientes y combinables (toolbar y/o panel); el SVG reajusta su ancho en cada combinación. 0 errores de consola.

> 🔎 **Leyenda BPMN en el canvas (v1.3.5)**: nuevo botón **"⌕ Leyenda BPMN"** sobre el lienzo que abre un **panel overlay** con la nomenclatura completa (3 columnas: formas y flujos · eventos con sus iconos · gateways y marcadores) — espeja la slide de leyenda del PPTX para que el consultor la consulte **mientras edita**. Nuevo ejemplo **Conexión de Nuevo Suministro Eléctrico (Utilities)** — 6 actores, 19 nodos, que ejercita **todos** los elementos BPMN en un solo flujo: **gateway paralelo ＋** (obra de conexión ∥ actualización de catastro GIS, fork/join), gateways exclusivos, timer ⏱ (esperar pago), **evento de terminación ⬤** (solicitud archivada), inicio de mensaje, fin de error ⚡ (no factible) y fin de mensaje ✉ (energizado), marcadores ⊞/↻. El **tiempo de conexión (18 días vs <7 OSINERGMIN)** es el cuello. Accesible vía `ProcessIQ.loadComplex9()`. El selector de onboarding lista **10 procesos demo** que cubren **los 8 verticales** del catálogo (Banca · Seguros · Retail · Manufactura · Salud · Utilities · Telecom · Sector Público). Verificado en navegador: 0 solapamientos, 0 diagonales, 0 errores; leyenda abre con 18 filas en 3 columnas.

**Las 7 funcionalidades del benchmark 2026 quedan implementadas** (F1 What-If · F2 Automatización · F3 Cuello de botella · F4 Variantes · F5 Mapa de valor · F6 Backlog · F7 Edición NL). El copiloto tiene 14 acciones cubriendo todo el ciclo consultivo.

> 🏆 **Senior Manager BC** (review consultivo): **46/50** — *"herramienta de diagnóstico consultivo genuina."*
> ✅ **QA + Reingeniería**: aprobada sin críticos.
> 🎨 **UX/UI** (lente Emil Kowalski / Linear / Raycast): **37/40** — *"Linear-tier alcanzado."*
> 📘 **Playbook MBB v1.0** codificado: 18 reglas como validador automático, catálogo de verbos, iconografía, auto-layout.
> 🔷 **BPMN 2.0** (v0.8): marcadores de tipo de tarea, códigos de actividad `[USR-27]`, message flows, edición manual — alineado a **MBC Process Disruptor**.

---

## ✅ v0.9 — Versión presentable a cliente (client-ready)

ProcessIQ cubre el ciclo completo del consultor: **levantar → diagramar → diagnosticar → reingenierizar → documentar**, reduciendo el tiempo de cada fase.

**Onboarding y demo (reduce time-to-value):**
- **Empty-state de onboarding** con 3 rutas accionables (Ingestar fuente · Cargar ejemplo · Dibujar manual).
- **"Cargar ejemplo" (1 click)** → proceso demo bancario completo: 7 actividades BPMN, 4 swimlanes, pains (1 crítico), KPIs con gap vs benchmark, tiempos/volúmenes y simulación auto-ejecutada (FTE 5.9 → ahorro S/123.900/año). Ideal para demostrar valor a un cliente en segundos.
- **Modo presentación** (⛶): oculta paneles y maximiza el diagrama a pantalla completa. Sale con `Esc`.

**Ingesta para reducir el relevamiento:**
- Audio de entrevista (Web Speech) · Notas · **Documento `.txt/.md/.csv`** · Event log CSV (process mining).

**QA end-to-end verificado** (proceso demo, Lint MBB = 0 issues): los 6 formatos de export generan archivos válidos — JSON, SVG, PNG, BPMN 2.0, PPTX (con marcadores+códigos BPMN), Word.

**Flujo de valor por fase:**
| Fase | Cómo lo acelera ProcessIQ |
|---|---|
| Relevamiento | Audio/notas/documento → flujograma BPMN en segundos |
| Diseño To-Be | Botón ✨ To-Be IA por nivel (Operativo/Táctico/Estratégico) + edición manual |
| Identificación de pains | Captura por nodo + heatmap + matriz impacto-esfuerzo + detección automática |
| Mejoras de procesos | Simulador FTE/costo/ahorro + KPIs benchmark + recomendaciones por horizonte |
| Documentación | Export a PPTX (entregable) y Word (informe), as-is vs to-be comparativo |

---

## 🔷 v0.8 — Nomenclatura BPMN 2.0 (alineado a MBC Process Disruptor)

Benchmark de herramientas de IA → [`BENCHMARK_AI_TOOLS.md`](BENCHMARK_AI_TOOLS.md).

- **Marcadores de tipo de tarea BPMN** en esquina superior-izquierda (estándar BPMN 2.0): User Task (persona), Manual Task (mano), Service Task (engranajes), Script/IA Task, Send/Receive Task (sobre), Documental, RPA/Bot.
- **Códigos de actividad** auto-numerados estilo MBC: `[USR-01]`, `[RCV-18]`, `[SRV-03]`, `[MAN-05]`, `[DOC-02]`, `[IA-01]`, `[BOT-01]`, `[TEL-01]`. Prefijo por tipo + correlativo izquierda→derecha.
- **Colores por tipo de tarea** (tinte normativo): azul=User, amarillo=mensaje, verde=Service, púrpura=IA, etc.
- **Message Flow vs Sequence Flow**: línea **punteada** con flecha abierta cuando cruza entre lanes/responsables distintos; **sólida** dentro de la misma lane.
- **Edición manual completa** desde panel Props: cambiar tipo de bloque BPMN (Inicio/Actividad/Sistema/Decisión/Documento/Data/Fin), editar código de actividad, cambiar tipo de tarea (re-asigna prefijo del código automáticamente), editar etiqueta, responsable, sistema, tiempos, SLA, docs, reglas. También: doble-click en nodo para editar etiqueta, drag para mover, modo Conectar, Eliminar.
- **NLP mejorado**: salta verbos parásitos (Realizar, Hacer, Proceder…) y extrae el verbo de acción real. Labels concisas verbo + objeto.
- **Export PPTX con nomenclatura BPMN**: cada tarea lleva su chip de tipo (USR/RCV/SRV/MAN/BOT/DOC/IA) + código de actividad `[BOT-01]` + tinte de color. Message flows punteados entre lanes. Multi-slide con conectores A/B/C.
- **Generar To-Be por nivel** (botón `✨ To-Be IA`, inspirado en MBC): clona el As-Is y aplica palancas de reingeniería según nivel:
  - **Operativo** (quick wins): automatiza tareas manuales rule-based → RPA/Service Task.
  - **Táctico** (rediseño): digitaliza manuales → User Task, marca decisiones para codificar como reglas DMN.
  - **Estratégico** (reimaginar): self-service en captura, IA-assisted en validaciones/scoring.
  - Resultado editable manualmente; el comparativo As-Is vs To-Be sale en el PPTX.
- **Export a Informe Word** (`.doc`, inspirado en MBC "Generar Informe Word"): documento consultivo con portada Minsait, resumen ejecutivo, ficha del proceso, tabla de actividades BPMN (código + tipo + responsable + sistema + tiempo + VA/NVA), pain points priorizados, KPIs con benchmark, RACI/SIPOC/simulador (si existen), diagnóstico + recomendaciones por horizonte y guía de implementación. 100% local (HTML compatible con Word).

</details>

---

## ¿Qué es?

ProcessIQ es la herramienta interna que acompaña al consultor de Minsait BC durante todo el ciclo de un engagement de procesos:

`Levantar → Diagramar → Diagnosticar → Reingenierizar → Presentar`

Este MVP **corre 100% local en tu navegador**, sin servidor, sin red. Pensado para usarse en talleres en planta de cliente.

---

## Cómo abrirlo

1. Abre `index.html` con doble click (Chrome o Edge recomendado).
2. La aplicación arranca y autosaves en LocalStorage del navegador.

> ⚠️ No es necesario instalar nada. No hay dependencias externas.

---

## Funcionalidades del MVP

### 📥 INGESTA MULTI-FUENTE (núcleo de la herramienta)
Botón **"📥 Ingestar"** en el header. ProcessIQ construye el flujograma automáticamente desde 3 fuentes:

**🎤 Audio / Transcripción**
- Grabación en vivo con micrófono (Web Speech API, Chrome/Edge, español Perú).
- Status visual de grabación + transcripción editable en tiempo real.
- También acepta pegar transcripción de Otter/Fireflies/Teams/Zoom.

**📝 Notas / Documentación**
- Pega manuales, notas de entrevista, descripciones del cliente.
- NLP heurístico detecta:
  - **Actividades** por verbos en infinitivo/imperativo (registrar, validar, aprobar, escalar, conciliar…).
  - **Gateways de decisión** por marcadores ("si", "cuando", "en caso", "¿?").
  - **Responsables** por menciones de roles (cliente, asesor, gerente, back office, compliance…).
  - **Sistemas** por menciones (SAP, Salesforce, CRM, ERP, Core, WMS…).
- Genera nodos clasificados (task / system / decision) con metadata pre-llenada.

**🗄 Event Log (Process Mining ligero)**
- Sube CSV/TSV con columnas: `case_id, activity, timestamp, resource` (opcional).
- Auto-detección de columnas + mapeo manual ajustable.
- Botón "Usar muestra" con dataset de ejemplo (gestión de solicitudes).
- Algoritmo alpha-miner simplificado:
  - Identifica actividades únicas y su frecuencia.
  - Descubre transiciones directly-follows con frecuencia ≥ 10% del top.
  - Detecta actividades inicio/fin más comunes.
  - Etiquetas de aristas = # de cases que siguen esa transición.
  - Actividades recurrentes en el mismo caso → indicio de reproceso (pain candidato).

### 🎨 Diagramación
- 7 shapes: Inicio, Actividad, Decisión, Documento, Data, Sistema, Fin.
- **Drag & drop** desde la barra izquierda al lienzo.
- Mover nodos arrastrándolos.
- **Modo conexión** (botón "Conectar" o tecla **C**): click en nodo origen, click en nodo destino.
- Auto-layout sencillo.
- Eliminar con tecla **Supr** o botón Eliminar.

### 📋 Panel de propiedades
Por cada actividad capturas: etiqueta, responsable/rol, sistema soporte, tiempo (min), volumen mensual, clasificación VA/BVA/NVA, notas.

### 😣 Pain points
Por nodo seleccionado puedes capturar pains con:
- 8 categorías predefinidas (handoff, reproceso, espera, control duplicado, sistema, regulatorio, manual, datos)
- Severidad (1-5) y Frecuencia (1-5)
- Score automático = sev × frec
- Badge visual en el nodo con # de pains

### 📊 Librería de KPIs
- 40+ KPIs precargados cubriendo 6 industrias: Banca, Retail, Manufactura, Salud, Utilities, Sector Público + transversales (P2P, R2R, H2R, TI).
- Filtro por industria y búsqueda libre.
- Click en un KPI lo envía al panel del copiloto con su benchmark sectorial.

### 🤖 Copiloto IA (mock en MVP)
Acciones rápidas:
- **🧠 Generar proceso desde descripción** — genera plantillas reconociendo: reclamos, O2C, P2P, onboarding/KYC, genérico.
- **🔍 Detectar pains en el diagrama** — análisis automático: handoffs, decisiones, actividades sin sistema + pains típicos del sector.
- **📊 Sugerir KPIs aplicables** — recomienda KPIs según industria y macroproceso seleccionado.
- **🚀 Proponer reingeniería to-be** — palancas de mejora y beneficios estimados.
- **📝 Resumen ejecutivo** — diagnóstico estructurado listo para vestir.

> En esta v0.1 las respuestas son template-based locales. En v1 se conecta a **Claude API** para respuestas contextualizadas.

### 💾 Persistencia y exportación
- Autosave en LocalStorage.
- **Import JSON** (recupera proyectos previos).
- Menú **⤵ Exportar** con 5 formatos:
  - **JSON** (proyecto completo para versionado).
  - **SVG** (diagrama vectorial editable en Illustrator/Inkscape).
  - **PNG** (imagen para pegar en documentos).
  - **BPMN 2.0 XML** (compatible con Bizagi Modeler, Camunda, Signavio, ARIS). Incluye visual DI (BPMN Diagram Interchange) y los pain points como `<documentation>`.
  - **PPTX (entregable Minsait)** — 5 slides listos para presentar:
    1. Portada con branding Indra/Minsait.
    2. Mapa del proceso As-Is.
    3. Tabla de pain points priorizados por score (sev × frec).
    4. Tabla de KPIs sugeridos con benchmark sectorial.
    5. Diagnóstico ejecutivo: hallazgos + palancas de reingeniería + impacto estimado.

### ⌨ Atajos
| Tecla | Acción |
|---|---|
| `C` | Toggle modo conexión |
| `Supr` / `Backspace` | Eliminar selección |
| `Esc` | Limpiar selección |

---

## Estructura del proyecto

```
ProcessIQ/
├── index.html         # Shell de la aplicación
├── styles.css         # Sistema de diseño Minsait/Indra
├── app.js             # Lógica completa (canvas, panels, copilot, export)
├── kpi-library.js     # Base de datos de KPIs por industria
├── PROMPT_MAESTRO.md  # Prompt de referencia para el equipo de desarrollo
├── BENCHMARK.md       # Análisis competitivo del mercado BPM
└── README.md          # Este archivo
```

---

## Roadmap

### ✅ v0.1 — MVP base (entregado)
Diagramación + pains + KPIs + copiloto mock + persistencia + export JSON/SVG/PNG.

### ✅ v0.2 — Ingesta multi-fuente y exports consultivos (entregado)
- Ingesta desde audio, notas/documentación y event logs CSV.
- Export BPMN 2.0 XML (compatible Bizagi/Camunda).
- Export PPTX con 5 slides (entregable Minsait).
- Process mining ligero (alpha miner).

### ✅ v0.3 — Cobertura consultiva (entregado tras feedback ronda 1)
- **Simulador FTE / lead time / costo** con cálculo data-driven.
- **Generador RACI** (matriz responsable / accountable / consultado / informado).
- **Generador SIPOC**.
- **Matriz impacto-esfuerzo** de pains (cuadrantes MBB).
- **Heatmap visual** de pains en el diagrama.
- **KPIs Perú regulatorios** (SBS, Indecopi, OSINERGMIN, SUNAT, MTC).
- **PPTX ampliado**: 10 slides incluyendo SIPOC, RACI, simulador, narrativa pains, impacto-esfuerzo.
- Fixes críticos: BPMN export robusto, CSV parser RFC 4180, NLP corregido, debounce.

### ✅ v0.5 — UX/UI refoundation (Phase 1 + 2 + 3)
Tras auditoría del agente UX/UI especialista (Emil Kowalski / Linear / Raycast):
- **Foundational**: escala tipográfica modular (xs→3xl) con Inter desde Google Fonts; escala de grises de 13 pasos (50→950) reemplaza los 5 anteriores; 4pt grid de spacing; sombras dual-layer; motion tokens (`--duration-fast/base/slow`, `--ease-out/spring`); dosificación del magenta (header rule 3px → 1px gradiente lateral).
- **Micro-interacciones**: modal con `backdrop-filter: blur(6px) saturate(1.2)` + spring entry; tabs con underline expandible desde el centro; dropdown con scale + slideDown; copilot messages con `msgEnter` fade; pain card translateX hover; KPI card translateY hover; shape-btn translateX hover; status saving con dot pulsante; focus-visible global con magenta glow.
- **Iconografía SVG**: header buttons (Nuevo, Ingestar, Importar, Exportar + chevron rotativo) y dropdown export con SVG inline 14px stroke-2; marker arrow refinado (refX 8 markerWidth 6); grid pattern de dots (no líneas); canvas-hint y empty-state con SVG en círculo gris.

### ✅ v0.7 — Playbook MBB enforced
Tras encargar al Senior MBB Manager el `PLAYBOOK_MBB.md` (35+ páginas, 18 reglas), implementamos:

- **Catálogo de verbos**: 50+ verbos permitidos, 13 prohibidos (gestionar, procesar, ser…). Live hints en el input de etiqueta (verde=OK, amarillo=fuera de catálogo, rojo=prohibido).
- **Iconografía de tipos de ejecución**: 8 categorías con icono SVG en esquina del nodo + tinte de fondo del shape: Manual · Soportado x sistema · Automático · Asistido por IA · Vía correo · Vía teléfono · Documental · RPA/Bot.
- **Tab "Lint"** en panel derecho con badge de cuenta de issues + score 0-100. Detecta antipatrones del playbook: gateway sin "?", actividad huérfana, sin responsable, sin tipo de ejecución, verbo prohibido, etiqueta >50 char/8 palabras, automático con responsable humano, manual >120 min, gateway sin etiquetar, >4 salidas, etc.
- **Click en issue** → jumps al nodo afectado en el canvas.
- **Auto-layout BFS top-to-bottom** (reemplaza el grid simple): asigna ranks por nivel, centra cada fila, separación 200×140 px. Se ejecuta automáticamente tras generar proceso desde plantilla o desde notas.
- **Metadata extendida en Props**: tipo de ejecución, SLA, documentos entrada/salida, reglas de negocio, comentarios.
- **Plantillas mejoradas**: las 5 plantillas (reclamos, O2C, P2P, KYC, genérico) ahora vienen con `executionType` pre-asignado por actividad y nombres alineados al playbook (verbo + objeto específico).
- **NLP de notas mejorado**: infiere tipo de ejecución automáticamente desde marcadores ("correo", "llamada", "automático", "IA", "papel/firma", "bot/RPA", o sistema mencionado).

📘 Archivo: [PLAYBOOK_MBB.md](PLAYBOOK_MBB.md) — estándar oficial del área.

### ✅ v0.6 — Linear-tier polish
- **Buttons** con translateY(-1px) hover + scale(0.97) active + triple box-shadow magenta.
- **Pain remove** rediseñado como botón circular 22×22 con bg magenta hover y scale(0.85) active.
- **Scrollbar ghost mode**: thumb invisible por defecto, aparece sutil en hover del padre.
- **Dropdown exit animation** con clase `.closing` + setTimeout 120ms.
- **Tobe-indicator** pulso refinado: ring scale-out con box-shadow (estilo Linear/Stripe notification dot) en lugar de opacity flicker.
- **Sim-savings** con depth real: triple gradient (radial luz + radial sombra + linear base) + triple box-shadow + ::after overlay.
- **Header inputs** elevation en hover.

### ✅ v0.4 — Pulido funcional (entregado tras feedback ronda 2 del consultor senior)
- **Heatmap MUY visible**: nodos con pains críticos pulsan en rojo (stroke 4px + drop-shadow + animación).
- **Wizard rápido de tiempos**: captura tiempo + volumen de todas las actividades en tabla única; auto-ejecuta simulación al cerrar.
- **Comparador As-Is / To-Be**: toggle en header + botón "⎘ Clonar" que duplica el as-is para reingenierar. PPTX incluye slide comparativo lado a lado con conteo de deltas.
- **Captura valor actual + gap automático** en KPIs: click en KPI abre modal de captura; gap se calcula numéricamente si aplica.
- **Narrativa de pains estructurada**: cada top-3 pain en PPTX muestra "Situación observada / Riesgo / Recomendación" diferenciada por severidad.
- **Slide 1-pager ejecutivo final**: carga e impacto, KPIs, top 3 dolores, quick wins, siguiente paso. Optimizado para CEO/CFO en 30 segundos.

### 🔜 v0.5 (backlog post-aprobación)
- [ ] Critical path real en simulador (hoy suma lineal).
- [ ] Análisis de sensibilidad (slider de reducción ±10%).
- [ ] Case study pre-cargado "Gestión de Reclamos — Banca Minorista Perú" como demo.
- [ ] Dark mode para presentación con proyector.
- [ ] Transcripción de archivos de audio subidos → integración Whisper API.
- [ ] Conexión real con **Claude API** (Anthropic SDK) — reemplazar mock del copiloto y mejorar el NLP de ingesta de texto.
- [ ] Process mining más robusto (heuristic miner, inductive miner).
- [ ] Multi-usuario real-time (v2).

### 🔭 v2 (visión)
- Multi-usuario en tiempo real (Y.js + WebRTC).
- Repositorio central con SSO Microsoft Entra ID.
- Process mining ligero desde event logs CSV.
- Comparativo automático contra APQC PCF.
- RAG sobre entregables históricos del área (memoria institucional).

---

## Trade-offs del MVP (decisiones explícitas)

1. **SVG vanilla vs. librerías (bpmn-js, React-Flow):** elegí SVG nativo para máxima portabilidad y cero dependencias. Trade-off: menos rico visualmente que bpmn-js, pero permite distribuir como un solo `.html`.

2. **Copiloto mock vs. integración Claude API ya en MVP:** opté por mock local para que el demo funcione **sin red ni API key**. El esqueleto del copiloto (chat, acciones rápidas, formato de respuestas) ya está listo para conectar Claude API en v1 cambiando solo la función `mockCopilotResponse()`.

3. **LocalStorage vs. backend:** sin backend para acelerar el primer demo y permitir uso offline. Trade-off: no hay colaboración multi-usuario hasta v2.

---

## Cómo conectar Claude API en v1 (guía rápida)

1. Crear `config.js` con la API key (NUNCA commitear al repo).
2. En `app.js`, reemplazar `mockCopilotResponse()` por una llamada al SDK Anthropic:

```js
async function callClaude(prompt, context) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: 'Eres un Senior Consultant de Minsait Business Consulting...',
      messages: [{ role: 'user', content: buildPrompt(prompt, context) }]
    })
  });
  const data = await res.json();
  return data.content[0].text;
}
```

3. Incluir en `system prompt`: la `meta` del proceso, los nodos, edges y pains actuales como contexto.

---

## Métricas de éxito sugeridas

- Tiempo de levantamiento por proceso: **5 días → 2 días** (-60%).
- % entregables que parten de plantilla previa: **> 70%**.
- NPS interno del consultor: **> 50**.
- Time-to-propuesta (kickoff → diagnóstico preliminar): **3 semanas → 1.5 semanas**.

---

## Contacto

Equipo Minsait Business Consulting · Perú
