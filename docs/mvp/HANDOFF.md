# ProcessIQ — Documento de traspaso

> Contexto completo para retomar el proyecto en una sesión nueva sin perder nada.
> **Última actualización:** v3.8.9 — reintento automático ante un corte de conexión al generar; el aviso ya no asume que el usuario está en la red de Indra; más margen para documentos grandes

---

## 0. Interfaz "Lienzo primero" (v3.3.0) y arte MBC (v3.2.0)

- **Arte MBC** (v3.2.0): azul `003478`, fucsia `FF0054`, Gris Ceramica `E3E2DA`,
  Montserrat, logotipo oficial en cabecera, favicon e imagen Open Graph
  (`og-image.png`, 1200x630, renderizada con Chrome headless). La fuente de
  verdad es `Documentos\Plantillas\MBC\Libro de estilo transitorio_V2.potx`.
  El export PPTX SIGUE en Pruno: migrarlo es decision pendiente del usuario.
- **Por que se rediseño la UI**: medido a 1440 px habia 51 controles a la vista
  y el lienzo ocupaba el 61 % del ancho; el panel derecho (380 px, 7 pestañas)
  estaba siempre abierto aunque no hubiera nada seleccionado. El usuario lo
  reporto como "muy cargada" y eligio la opcion "A - Lienzo primero" entre tres.
- **Como queda**: rejilla `48px 1fr 48px`. Riel izquierdo: `+` (desplegable
  `#shapesFlyout` con las 7 formas arrastrables), Conectar, Eliminar, Ordenar.
  Riel derecho: los 7 paneles como iconos + Leyenda; el contenido vive en
  `.drawer`, que se desliza SOBRE el lienzo (no lo encoge) cuando `body` lleva
  `panel-open`. Nivel de detalle y zoom juntos en la barra inferior. Industria y
  macroproceso en `#metaPopover` tras el nombre. Presentar pasa a la cabecera.
  Lienzo en reposo: 93 % del ancho; en Presentar, 100 %.
- **Reglas del cajon** (`abrirPanel(name, auto)` / `cerrarPanel()`):
  seleccionar un nodo lo abre en Props con `auto=true` y deseleccionar lo cierra;
  clic en un icono del riel lo abre con `auto=false` y entonces NO se cierra al
  clicar fuera, solo con el mismo icono, la X o Esc. `activateTab()` equivale a
  apertura manual. `localStorage["processiq.ui"]` guarda `{panelOpen, tab}` solo
  si fue apertura manual.
- v3.3.1 REGRESION corregida: el menu Exportar se destapaba pero quedaba
  TAPADO por el lienzo. Causa: `.app-header` tiene `backdrop-filter`, que la
  hace contexto de apilamiento propio con z-index auto; al posicionar
  `.app-main` (relative) en v3.3.0, este se pintaba encima por orden del DOM.
  Arreglo: `.app-header { z-index: 120 }`, por encima de rieles (30), cajon
  (40) y desplegables (80/90). Regla para el futuro: cualquier capa nueva
  posicionada en `.app-main` debe quedar por debajo de 120.
- OJO al medir desde el Browser pane (pestana oculta): Chrome congela las
  animaciones CSS igual que los temporizadores. `getAnimations()` reporta
  `running` con `currentTime: 0` y `getComputedStyle().opacity` devuelve el
  valor del primer fotograma (0). No es un bug de la app: confirmar con captura
  de pantalla, que si fuerza el pintado, o con `elementFromPoint`.
- Se retiraron `btnTogglePanel`, `btnToggleToolbar` y sus clases
  `panel-collapsed` / `toolbar-collapsed`; `btnLegend` vive ahora en el riel
  derecho. Nada del API `window.ProcessIQ` cambio.
- Verificado con DOM en Browser pane: apertura/cierre automatico y manual,
  desplegables que cierran al clicar fuera, 7 formas `draggable` en el
  desplegable, Presentar oculta rieles y cajon, 0 errores de consola.

## 1. Qué es y dónde vive

**ProcessIQ** — herramienta web de diagramación, diagnóstico y reingeniería de procesos con notación **BPMN 2.0**, para Minsait Business Consulting Perú.

| | |
|---|---|
| **App en vivo** | https://procesos.mbc-latam.com/ (dominio propio via CNAME desde el 3-sep-2026; nelson2206.github.io/process-iq redirige 301 alli) |
| **Repositorio** | https://github.com/nelson2206/process-iq (público) |
| **Carpeta local** | `C:\Users\nebernal\OneDrive - Indra\Documentos\Propuestas\Transformación\ProcessIQ` |
| **Stack** | HTML + CSS + JS vanilla. **Sin backend, sin build, sin npm.** |
| **Hosting** | GitHub Pages (build *legacy*, rama `main`, raíz `/`) |

### Archivos

| Archivo | Rol |
|---|---|
| `index.html` | Raíz servida por Pages. Nadie la importa. |
| `app.js` | ~7.700 líneas. **Todo** el código, dentro de un IIFE. |
| `styles.css` | Tema NEXUS + componentes. |
| `kpi-library.js` | Catálogo de KPIs por industria. |
| `favicon.svg` · `og-image.svg` · `README.md` · `HANDOFF.md` | Soporte |

> ⚠️ `app.js` es un **IIFE**: `state` es privado. Para pruebas se expone `window.ProcessIQ`.

---

## 2. Estado actual — qué YA funciona

### Diagramación
- BPMN 2.0 completo: tareas (user/manual/service/send/script), gateways **XOR/AND/OR**, eventos (mensaje/timer/error/señal/terminación, catch+throw), **eventos de borde**, marcadores (subproceso/loop/multi-instancia), **swimlanes** por rol.
- Auto-layout: detección de back-edges (DFS) + longest-path (Kahn), **anti-cruces por baricentro**, columnas compactas y **modo envolvente** (bandas) para procesos largos.
- Ruteo de flechas por bordes, codos redondeados, corredores inferiores para reprocesos.
- **Autoajustar**: mide flechas-sobre-cajas y cruces, prueba 3 disposiciones y aplica la mejor.
- Undo/redo, zoom, modo presentación, 13 ejemplos.

### Ingesta
- **Multi-formato:** Word (mammoth), PDF (pdf.js), PowerPoint (JSZip), texto, **BPMN 2.0** (importador nativo, round-trip sin pérdida).
- **Multi-fuente:** acumula documento + transcripción + diagrama antiguo y los **fusiona en un solo AS-IS** (ante contradicción prevalece lo más reciente).
- **Participantes:** detecta nombres en transcripciones Teams/Zoom, pide el **rol** de cada persona y lo usa como carril.
- Progreso página a página, botón **Cancelar** real, guardia de 40 MB, timeout de 3 min.
- Event log CSV → process mining (alpha-miner).

### IA (API de Anthropic, modo BYOK)
- Ingesta de documentos → reconstrucción del flujo BPMN.
- **9 acciones analíticas** con Claude: `suggest-kpis`, `propose-tobe`, `raci`, `impact-effort`, `automation`, `backlog`, `exec-summary`, `sipoc`, `bottleneck`.
- **Análisis profundo de dolores**, separado en (a) evidenciados en el flujo y (b) hipótesis del sector.
- Regla reforzada de **paralelismo** (fork/join en vez de secuencia).

### Nivel de granularidad
- El proceso se genera UNA vez al maximo detalle y se colapsa localmente en tres
  vistas: Ejecutivo, Actividad y Detalle. Cambiar de vista es instantaneo y no
  vuelve a llamar a la IA.
- Si la IA etiqueta los nodos con nivel y padre, manda esa jerarquia. Si no
  (proceso importado o dibujado a mano) se deduce: lo que un mismo actor hace de
  corrido entre dos decisiones es UNA actividad de negocio.
- Es ademas el remedio a la densidad. Venta de Lotes pasa de 3 flechas sobre
  cajas y 10 cruces a CERO en vista ejecutiva; un BPMN importado de 119 nodos,
  de 247/115 a 4/0.
- La IA etiqueta cada nodo con nivel (1|2|3) y padre; los hitos (start/end/
  decision) se fuerzan a nivel 1 al construir. Si faltan los campos, actua la
  heuristica por cadenas, ya probada.
- Antes de generar se pregunta la PROFUNDIDAD (modal askProfundidad). No decide
  que se genera --siempre el proceso completo-- sino con cuanto detalle mira la
  IA y en que vista se abre.
- v3.1.0: el nivel EJECUTIVO ya NO es "el BPMN con menos cajas". Es el proceso
  de punta a punta en ETAPAS: no mira carriles (una etapa cruza varios actores),
  absorbe los gateways (el "como se decide" es detalle) y conserva inicio y
  fines, incluidas las salidas tempranas. Techo EJEC_MAX_CAJAS = 10; las etapas
  se reparten por rank en tramos contiguos, con minimo 3 etapas. La proyeccion
  pone owner = macroproceso en todos los nodos: un solo carril.
  Medido en 9 procesos (ficha + 8 demos): todos entre 8 y 10 cajas, todos
  restauran el detalle exacto. Venta de Lotes: 33 -> 28 (actividad) -> 9
  (ejecutivo), y el PPTX ejecutivo cabe en UNA lamina con 0 conectores de letra
  (antes 4 laminas y 15 conectores).
  Camino recorrido, para no repetirlo: v3.0.4 agrupaba por carril + segmento
  entre hitos y se quedaba en 20 cajas; antes de eso, por cadena lineal estricta
  (1 entrada / 1 salida) y solo bajaba de 33 a 28. Con gateways de por medio
  ninguna de las dos llega a una lamina de comite.
  PENDIENTE: la etiqueta de etapa es la del primer paso + "(+N pasos)". Es
  honesta pero floja; el nombre de etapa es trabajo para la IA cuando haya clave.
- Nivel 2 (Actividad) usa cadenas de 2+ (antes 3+, casi nunca disparaba).
- v3.0.4: si al colapsar todas las ramas de un gateway exclusivo acaban en el
  mismo paso, el gateway se elimina y sus entradas van directas al destino. Sin
  esto quedaba con una sola salida y ensureDecisionBranches le inventaba una
  rama "Caso no procede" inexistente. Sigue como red de seguridad aunque en
  v3.1.0 el nivel 1 ya absorbe los gateways.
- v3.1.0 (export): sin rombos y con 1-2 carriles caben 9 columnas por banda en
  vez de 6. Con 6, un flujo ejecutivo de 8 rangos se partia en dos bandas y
  salian conectores con letra en un diagrama de 6 cajas.
- v3.0.4 REGRESION corregida: _modeloVigente ahora ignora los nodos _autoGen.
  Nacen sin sello, asi que tras colapsar el modelo se daba por ajeno y se
  recapturaba la vista colapsada como si fuera el completo: volver a Detalle ya
  no restauraba los 33 nodos.
- API de pruebas: ProcessIQ.nivel(1|2|3), ProcessIQ.niveles(), ProcessIQ.askProfundidad().

> Sin probar con llamada real de IA: el etiquetado se valido con un spec
> sintetico via buildProcessFromAiSpec. Ver pendiente #2.

### PPTX editable (v3.0)
- Cada tarea es UN objeto: la forma lleva el texto dentro (antes forma + texto
  suelto encima; al mover la caja en PowerPoint el texto se quedaba atras).
- Nombres descriptivos en el panel de seleccion: Tarea USR-01 · Registrar y
  derivar lead, Decision 07 · Conforme?, Flujo A → B.
- Posiciones en grilla de 0,05 pulgadas (un cuarto de la cuadricula de PowerPoint).
- Conectores REALES anclados a las formas (cxnSp con stCxn/endCxn): al mover una
  caja, la flecha la sigue y PowerPoint la re-rutea. pptxgenjs no sabe hacerlos:
  se emite una linea con nombre Flujo|origen|destino|lado|lado y un post-proceso
  del XML (JSZip) la convierte. Decision tomada: PowerPoint decide el nuevo camino
  al mover (se pierden nuestros codos), porque corregir importa mas que la
  fidelidad al abrir.
- Medido sobre Venta de Lotes, lamina 2: 43 formas con texto dentro (antes 0),
  8 conectores anclados por ambos extremos, 14 lineas sueltas (antes 26; las que
  quedan son conectores de pagina y saltos de banda, a proposito).
- v3.0.2: los conectores de pagina y de salto de banda tambien son UN cxnSp
  anclado nodo <-> circulo (antes 3 lineas sueltas). Cada rama que sale de un
  mismo nodo lleva un codo distinto (adj1 del bentConnector3, 20-80 %): antes
  cuatro salidas de un rombo compartian el tronco y se veian como una sola.
  El paso de apilado vertical usa el alto REAL de la etiqueta (altoEtiqueta),
  no 0,52 fijo. Medido: 52/52 conectores anclados, lamina 3 con 2 lineas
  sueltas (antes 14).
- REGRESION corregida en v3.0.2: la cache de rutas del lienzo (v2.8) solo se
  invalidaba en autoLayout(); al arrastrar una caja las flechas quedaban en el
  aire. Ahora render() firma la geometria de los nodos y, si cambia, invalida.
  Probado: arrastre de +70/+110 px, 0 de 18 flechas en el aire.
- v3.0.3: dentro de cada celda del PPTX (fila x columna) las cajas se apilan
  por AFINIDAD DE FILA: la que conecta con un actor de mas abajo va abajo, y su
  flecha ya no cruza a las hermanas (antes: orden de insercion del modelo, la
  tarea que iba al Cliente quedaba en medio). Media de la fila de los vecinos,
  3 barridos, empate por y del lienzo. Pedido con captura por el usuario sobre
  Venta de Lotes 3/4: MAN-11 / USR-05 / RCV-01 ahora salen en ese orden.
- v3.0.3: el chip de tipo (USR/MAN/RCV...) es UN solo objeto: addText con
  shape roundRect, margin 0 y nombre "Tipo XXX · <tarea>". Antes eran forma +
  cuadro de texto y al moverlo en PowerPoint se separaban. El codigo [XXX-nn]
  sigue aparte pero con nombre "Codigo XXX-nn · <tarea>".
- v3.0.4: FINES ADELANTADOS. Una flecha a un fin sin salidas que cruza de banda
  ya no gasta un conector con letra para llegar al circulo de fin en la lamina
  siguiente: el fin se pinta en el pasillo de salida de la banda de ORIGEN, con
  su etiqueta, y se repite en cada banda que lo alcance (BPMN lo permite). Si un
  fin solo se alcanza asi, no se dibuja en su propia banda y su fila desaparece
  si queda vacia. Medido sobre Venta de Lotes: circulos con letra de 13 a 8.
- v3.0.5: el codigo de actividad ([USR-02]) YA NO se dibuja en la lamina. Era
  un cuadro de texto suelto de 7 pt que se montaba sobre el titulo de la tarea
  (visto por el usuario en Venta de Lotes 2/4). Decidido por el usuario: quitar,
  no fundir en el chip. Sigue en el modelo, en el panel de propiedades y como
  primera columna de la tabla de actividades del informe Word. OJO: la Ficha de
  Proceso (deriveFicha) nunca lo llevo; si hiciera falta cruzar lamina y ficha
  habria que anadirlo alli.
- v3.1.1: el lado por el que sale y entra cada flecha lo decide ladoDeArista().
  Hasta v3.1.0 mandaba la horizontal --si el destino estaba a la derecha se
  salia por la derecha aunque estuviera tres carriles abajo-- y la flecha daba
  un rodeo largo por el pasillo. Ahora, si la arista CAMBIA DE CARRIL, sale por
  el vertice inferior del rombo y entra por arriba de la caja, que es como se
  dibuja a mano. Ojo: no vale la dominancia de distancia; medido en Originacion
  de Credito, dx 2,63" y dy 2,38", asi que por dominancia seguia saliendo por la
  derecha. El criterio es el actor, no la distancia.
- v3.1.1: cuando un rombo (o un evento) saca flecha por abajo, su etiqueta sube
  ENCIMA de la figura; si no, sigue debajo. Sin esto la pregunta quedaba cruzada
  por su propia flecha.
- Medido sobre los 14 procesos de demo, ~50 laminas de flujo: solapes
  texto-sobre-texto 18 -> 7, texto-sobre-figura 8 -> 7, cero fugas de lamina.
  Comparativa hecha sirviendo el commit anterior en paralelo desde una copia
  (git show HEAD:app.js), no de memoria.
- v3.2.0: los circulos de continuidad ya NO viven siempre en el borde de la
  lamina. Si la celda contigua de la misma fila esta vacia, el circulo se pone
  ahi (columnaConector); si no, vuelve al borde. Medido en 4 procesos: mismo
  numero de circulos (53) y largo total de linea de conector 78,6" -> 56,6"
  (-28 %). Comparativa hecha sirviendo el commit anterior en paralelo.
- v3.4.0: la flecha de un conector de pagina NUNCA atraviesa una caja. Si el
  tramo recto pisa alguna (visto por el usuario: la entrada "B" cruzaba
  "Registrar solicitud"), el circulo sube o baja al pasillo del carril
  (laneY +/- 0,21") y la flecha entra por arriba/abajo del nodo: entrada
  `right|top` con adj1 100000 (horizontal primero), salida `top|left` con
  adj1 0 (vertical primero). Si ningun pasillo esta libre, se deja como estaba.
  Helpers: tramoPisaCaja(x1,x2,y,ignorar) y pasilloLibre(nodo,x1,x2).
- v3.4.0: la letra del circulo de continuidad y el glifo del rombo (x / + / O)
  van DENTRO de la figura como un solo objeto (addText con shape). Antes eran
  figura + cuadro de texto y al mover uno en PowerPoint el otro se quedaba.
  Medido en 4 procesos: letras sueltas 54 -> 0, glifos sueltos 22 -> 0.
  Pendiente: los eventos (inicio/fin con simbolo) siguen siendo dos objetos.
- v3.4.0: un fin adelantado NO recibe ademas una entrada con letra "?" en su
  propia lamina (la arista ya se dibujo como circulo de fin en la banda de
  origen). Era el "? <- 1" de Originacion 3/4.
- v3.4.0: tope de anchura por columna MAX_CELL_W = 1,95". Con 4 columnas el
  diagrama se estiraba a toda la lamina (2,63" por columna para cajas de
  1,9") y quedaba lleno de aire; ahora se compacta a la izquierda y el
  pasillo de salida (CONN_X_DER, ahora `let`) se pega al contenido. Originacion
  3/4: extension de cajas 9,05" -> 6,9", conector E de x 12,12 a 9,47.
  Ademas las columnas se renumeran por banda (colMapa) por si un rank queda sin
  nodos en la lamina; en las demos no ocurria, pero cuesta nada.
- OJO metrica "fuera de lamina": los chips de rol se definen anchos y se giran
  270 grados; su x sin girar sale negativa (-0,09) pero girados quedan dentro.
  Descontar el giro (bench/harness.js caja()) o salen falsos positivos. Las
  tablas van en EMU, no en pulgadas: excluirlas.
- v3.5.0: EXPORT PPTX POR TEMA. `exportPptx(tema)` lee una entrada de
  `TEMAS_PPTX` (paleta, tipografias, logotipos en base64, carátula, cierre).
  Las constantes M_PRUNO / M_FUCSIA / T_FONT... conservan el nombre por sus
  ~250 usos, pero su VALOR sale del tema: con 'mbc', M_PRUNO es el azul MBC
  003478. Los literales '4F062A', 'FF0054', '926979', 'D0CEC1' que quedaban
  sueltos dentro del export se sustituyeron por las constantes.
  · 'mbc' (estandar): azul 003478, Ceramica E3E2DA, Fucsia FF0054, Montserrat,
    logotipo MBC (PNG rasterizado del SVG oficial), carátula calcada de la
    "Portada Básica" del Libro de estilo transitorio V2.
  · 'bbva': calcado de Documentos\Plantillas\BBVA\Flow_Value_BBVA.pptx — dk1 001391, fondo
    F7F8F8, acento 85C8FF, Lato + Source Serif 4, logotipo BBVA azul/blanco,
    carátula con logotipo arriba-izquierda y titulo abajo, lámina de cierre
    "Gracias". Los circulos de continuidad van en 001391 (el acento claro no
    aguanta texto blanco).
  Para añadir un cliente: una entrada en TEMAS_PPTX + un boton
  `data-export="pptx" data-tema="xxx"` en el menu Exportar. Medido: ambos temas
  exportan Originacion sin rastro de Pruno; BBVA sin Fucsia.
  OJO bench: la PALETA de bench/harness.js sigue siendo la Minsait; con temas
  reportara fueraDePaleta. Actualizarla si se vuelve a correr el banco.
- Fuera del PPTX siguen diciendo Minsait el informe Word y la Ficha (cabecera
  "MINSAIT BUSINESS CONSULTING · PERÚ" y pie). No se tocaron: el pedido era el
  PPTX. Cambiarlos es trivial cuando se decida.
- v3.6.0: el tema MBC ya no sale del .potx sino del CATALOGO DE RECURSOS
  GRAFICOS MBC (Template Nuevo MBC.pptx, archivado en Documentos/Plantillas/MBC).
  Paleta cerrada: laminas BLANCAS, azul marino 003478 (titulares), acento
  147AFF (rotulos, reglas, flechas, circulos de continuidad), 33517F texto,
  7A93B5 antetitulos, A8B6C8 foliado, C9D3E0 filetes, F2F3F5 tarjeta (cajas),
  CFDDF2 chip de rol. No hay fucsia ni Ceramica. Eventos: inicio 147AFF, fin
  003478 (la paleta prohibe verdes/rosas). Caratula calcada de la lamina 1 del
  catalogo escalada 20x11,25 -> 13,33x7,5: banda blanca con logotipo, titulo
  36 pt, subtitulo, filete 7FB0FF con la fecha, foto duotono (JPEG 51 KB en
  base64) sobre panel 0A3F86 a la derecha. Chrome MBC: logotipo abajo a la
  izquierda y foliado gris a la derecha (BBVA conserva su chrome).
- v3.6.0: FUERA del deck, a pedido del usuario: leyenda BPMN, puntos
  importantes, pain points, narrativa de pains, matriz impacto-esfuerzo,
  diagnostico ejecutivo y 1-pager. Quedan: portada, flujo, KPIs, As-Is vs
  To-Be, SIPOC, RACI y simulador (antetitulo renombrado de Diagnostico a
  Simulacion para no confundir) y, en BBVA, el cierre Gracias. Los bloques se
  cortaron por sus marcadores // ==== SLIDE con una guarda que comprueba que
  ningun bloque conservado use variables declaradas en los eliminados.
- v3.5.1: el SVG/PNG exportado lleva los estilos computados INLINE. Sin
  ellos, un SVG suelto pinta cada <path> relleno de negro y el texto en serifa
  (el usuario lo vio en la descarga PNG). OJO: la rejilla #gridBg se quita
  DESPUES de recorrer original y clon en paralelo; si se quita antes, cada
  elemento hereda el estilo del anterior y todo sale negro (paso por ahi).
  Gancho de prueba: ProcessIQ.svg().
- PENDIENTE (pregunta abierta del usuario): en el LIENZO la escalera repite
  los 8 carriles aunque la segunda banda use dos; recomendado desactivar el
  wrap del lienzo por defecto (state._wrap) y dejar la escalera solo en PPTX.
- v3.6.1: el LIENZO va en UNA banda (`doWrap = state._wrap === true`): la
  escalera del lienzo repetia los 8 carriles aunque la 2a banda usara dos. La
  escalera sigue viva en el PPTX, donde cada banda repite solo sus carriles.
- v3.6.1: Word, Ficha y el rol de la IA dicen MBC (cadenas y las dos ternas
  de color de Word/Ficha: 147AFF / 003478 / 7A93B5). Solo quedan menciones a
  Minsait en comentarios.
- v3.6.1: el nombre del carril se parte en DOS lineas por el espacio mas
  central si no cabe en el chip a 8 pt, y baja de cuerpo hasta 6,5 pt como
  ultimo recurso. `fit: shrink` no servia: PowerPoint solo recalcula al editar.
  ANCHO_CAR = 0,56 (Montserrat) sustituye al 0,50 de ForFuture Sans en
  altoEtiqueta y en el chip; OJO: declarado junto a T_FONT porque el chip lo
  usa antes de que exista altoEtiqueta (un const posterior daba TDZ y el
  export moria en silencio).
- v3.6.1: la pregunta del rombo tiene b.w + 1,4" de ancho (con 0,9 y
  Montserrat se partia a mitad de palabra) y se registra en etiqAristaUsadas
  para que los rotulos Si/No la esquiven.
- v3.6.1: REPARTO DE LADOS DE SALIDA (ladoSalidaDe): si de un nodo salen
  varias flechas, cada una sale por un lado distinto — el preferido por
  geometria y, si esta ocupado, el siguiente libre entre derecha/abajo/arriba/
  izquierda. salidaAbajo se deriva de ese reparto. Medido en Originacion:
  n7 top+right, n19 bottom+right, n22 top+right.
- v3.6.2 BUG DE FONDO, corregido: los nodos-grupo de las vistas colapsadas
  (_gruposPorCadena y _etapasEjecutivas) se creaban SIN w/h. autoLayout hace
  n.x = colX[r] + (rankW[r] - n.w) / 2, asi que daba NaN, contaminaba el ancho
  de la columna entera y NINGUN nodo recibia coordenadas: el lienzo salia en
  blanco en Ejecutivo y Actividad. Arreglado dando geometria de tarea a los
  grupos y con una red de seguridad al entrar en autoLayout (normaliza w/h/x/y
  no finitos). Medido tras el arreglo: 3 procesos x 3 niveles = 9 casos, 0
  nodos sin coordenadas.
  LECCION PARA NO REPETIRLA: quality() devolvia "0 cruces, 0 flechas sobre
  cajas" para Ejecutivo y Actividad porque sin coordenadas no hay nada que
  cruzar. Aquellos ceros que celebre en v3.1.0 eran un artefacto, no calidad.
  Un contador de defectos que baja a cero de golpe merece que se compruebe
  ANTES si el diagrama existe: medir siempre nodos-sin-coordenadas junto a los
  defectos, y mirar una captura del lienzo, no solo el conteo de nodos ni el
  PPTX (que se salvo porque construye su rejilla con ranks y carriles, no con
  n.x/n.y — por eso el export se veia bien con el lienzo roto).
- v3.7.0 CLAVE CENTRALIZADA ("modo equipo"). La web es estatica y publica:
  una API key en ella la copiaria cualquiera. La clave vive como SECRETO en un
  Cloudflare Worker (worker/processiq-api.js); el dominio mbc-latam.com ya
  esta en Cloudflare (NS jarred/jean.ns.cloudflare.com), asi que no hace falta
  Vercel ni cuenta nueva. Contrato: POST {intermediario}/v1/messages con
  cabecera x-processiq-code y el JSON de Anthropic; GET /health sin codigo.
  Secretos del Worker: ANTHROPIC_API_KEY y ACCESS_CODE (los carga el usuario,
  nunca el asistente); variable ALLOWED_ORIGINS. El Worker solo acepta los
  modelos de la app, topa max_tokens a 16000, quita stream, limita el cuerpo a
  2 MB, compara el codigo en tiempo constante y traduce un 401 de Anthropic a
  502 (la clave central falla, no el usuario).
  Verificado: 12/12 casos del Worker en local con Anthropic simulado (Node 24,
  scratchpad/test_worker.mjs); en la app, modo equipo llama al intermediario
  con el codigo y SIN x-api-key, modo clave propia intacto, 401 con mensaje
  claro, aiReady exige codigo en modo equipo.
  App: aiConfig gana modo/codigo/proxyUrl (compatible: sin 'modo' se asume
  clave propia). PROXY_POR_DEFECTO = https://api.mbc-latam.com.
  DESPLEGADO el 11-sep-2026: Worker processiq-api con dominio propio
  api.mbc-latam.com (version 67f7436d, cuenta Cloudflare 0ba46cab...), con
  `npx wrangler deploy` desde worker/ (config en worker/wrangler.toml;
  workers_dev = false porque la cuenta no tiene subdominio workers.dev).
  Login de Wrangler por OAuth: da SOLO 2 MINUTOS para pulsar Allow; el primer
  intento expiro. Hacerlo con el usuario delante del navegador y pegarle el
  enlace al instante. La extension Claude in Chrome nunca conecto.
  BLOQUEO CORPORATIVO: desde la red de Indra, Netskope intercepta
  api.mbc-latam.com (politica "[SWG] RBI Compliance Policy", categoria
  "Newly Observed Domain") y devuelve 403 con su pagina HTML. Sintoma en
  curl de Windows: schannel CRYPT_E_NO_REVOCATION_CHECK (TLS interceptado);
  con --ssl-no-revoke se ve el 403. En el navegador se manifiesta como error
  de red (el bloqueo no lleva cabeceras CORS), y la app ya muestra el mensaje
  que menciona el proxy corporativo. Solucion: TI debe habilitar
  *.mbc-latam.com. WebFetch externo tambien dio 403, sin poder distinguir si
  fue Netskope o el anti-bots de Cloudflare: la verificacion decisiva es abrir
  /health desde una red que no sea la de Indra (movil con datos).
  ESTADO 11-sep-2026: FUNCIONANDO. Secretos ANTHROPIC_API_KEY y ACCESS_CODE
  cargados por el usuario como secret_text (verificado con `wrangler secret
  list`; version desplegada 89c35cdc). /health desde datos moviles (fuera de
  Indra) devuelve configurado: true — verificado por el usuario.
  PENDIENTE: (1) ticket a TI para habilitar *.mbc-latam.com en Netskope; hasta
  entonces la IA solo funciona fuera de la red de Indra; (2) primera llamada
  real desde la app: ✨ > Clave del equipo > codigo > Probar conexion, y luego
  ingestar un documento real; (3) opcional: revocar el token OAuth de Wrangler
  en Cloudflare > My Profile > API Tokens (hara falta volver a `wrangler login`
  para redesplegar).
  OJO SECRETOS (11-sep-2026): en el panel de Cloudflare el desplegable Type
  viene en Text. El usuario guardo ANTHROPIC_API_KEY como variable de TEXTO
  (visible en claro en el panel) y ACCESS_CODE no llego a guardarse; el Worker
  habria respondido 500. Se limpio redesplegando (version 4edd5a5e):
  `wrangler deploy` sin keep_vars sustituye las variables de texto del panel
  por las de wrangler.toml; los Secret sobreviven a los despliegues. Via mas
  segura para cargarlos: `npx wrangler secret put <NOMBRE> --name processiq-api`,
  que siempre crea tipo Secret y pide el valor sin mostrarlo. Verificar con
  `wrangler secret list` (solo nombres). NUNCA listar bindings sin filtrar:
  `wrangler versions view` imprime en claro el valor de las variables de texto;
  filtrar a nombres y tipos con grep -oE "env\.[A-Za-z0-9_]+|Secret|Environment Variable".
- v3.8.0 IA POR DEFECTO EN LA INGESTA. Si el navegador no tiene codigo de
  equipo ni clave propia, runIngest llama a pedirCodigoEquipo() ANTES de decidir
  el motor: el usuario escribe el codigo (se guarda en processiq.ai como modo
  equipo) o elige "Modo basico" a sabiendas. Antes caia en silencio al modo de
  palabras clave. pedirCodigoEquipo resuelve tambien con Esc o clic fuera (un
  MutationObserver vigila #modal) y restaura los textos de los botones.
- v3.8.0 callClaude EN STREAMING (SSE). Motivo: Opus 5 razona por defecto y el
  razonamiento consume max_tokens y tiempo; sin streaming una ingesta larga se
  cortaba a los 180 s. Ahora el limite es de INACTIVIDAD (90 s sin datos),
  rearmado en cada trozo; Cancelar sigue abortando durante la lectura. Se
  acumulan solo los text_delta (los bloques thinking se ignoran). stop_reason
  max_tokens y refusal dan mensajes claros. Tope de la ingesta: 32000 tokens
  (el Worker topa igual). Probar conexion: 256 tokens y effort low (con 16 el
  razonamiento podia agotarlos antes de escribir OK).
- v3.8.0 FALLBACKS: en claude-opus-5 la app envia fallbacks: "default" (beta
  server-side-fallback-2026-07-01): si un clasificador declina, la API repite la
  peticion con el modelo de respaldo en la misma llamada. En modo equipo la
  cabecera beta la pone el Worker; en clave propia, la app. En streaming el
  cambio llega como un bloque de tipo 'fallback' y lo ya recibido NO se
  invalida: callClaude vacia el texto acumulado al ver ese bloque, porque el
  modelo de respaldo repite la respuesta entera (si no, se mezclan dos JSON).
- v3.8.0 Worker: MAX_TOKENS 32000, stream permitido (el SSE se reenvia tal
  cual), fallbacks solo "default" (otro valor se elimina).
  Verificado: Worker 13 casos nuevos + 12 de la bateria anterior, en local con
  Anthropic simulado; app con SSE simulado troceado en fragmentos de 37 bytes:
  proceso completo, fallback a mitad, max_tokens, refusal, primer uso pidiendo
  codigo, eleccion de modo basico y Probar conexion.
  NO verificado: una llamada real a Claude. Desde la red de Indra Netskope
  bloquea el intermediario; la primera ingesta real la hace el usuario fuera.
  Mejora pendiente: salida estructurada (output_config.format con esquema JSON)
  en lugar de parseJsonLoose sobre texto libre.
- v3.8.1: el usuario vio "se cortó por longitud" al pegar un procedimiento y
  lo leyo como limite de caracteres de SU texto. Era la RESPUESTA: con el
  razonamiento de Opus 5 activo (consume max_tokens) y un proceso detallado,
  32.000 tokens no bastaban. Tope subido a 64.000 en app y Worker (valor
  recomendado con streaming; se paga lo usado, no el tope) y el aviso ahora
  dice que el texto esta bien y sugiere nivel Actividad/Ejecutivo.
- v3.8.9 ERRORES DE RED AL GENERAR, reportados por un usuario real (no Nelson):
  (1) "No se pudo conectar con el intermediario... Si estas en la red de
  Indra..." con un PDF de 32.431 car. (2) "La IA dejo de responder durante
  90s" con un PDF de 88.375 car. Dos causas distintas:
  1) El mensaje de "Failed to fetch" daba por hecho que TODO usuario esta en
     la red de Indra (solo cierto para Nelson); a un cliente o colega en otra
     red esa frase no le decia nada util. El navegador oculta la causa real de
     "Failed to fetch" por seguridad (corte de conexion, proxy corporativo,
     bloqueador de anuncios/privacidad, DNS, el servicio caido): no se puede
     diagnosticar del lado del cliente.
  2) El timeout de inactividad (90s fijos, cuenta desde el ultimo byte, no
     desde el inicio) no escalaba con el tamano del documento; con ~90K
     caracteres el primer dato puede tardar mas por delante de la IA misma.
  Arreglo: callClaude reintenta UNA vez el fetch() inicial si falla por red
  (no si es cancelacion o timeout), tras 1.2s; si ambos intentos fallan, el
  aviso ya no menciona Indra --dice "corte de conexion, proxy corporativo o
  bloqueador de anuncios/privacidad; prueba desde otra red" y cuenta "dos
  intentos". aiBuildProcess calcula timeoutMs = min(180000, 90000 +
  500ms por cada 1.000 caracteres del prompt): ~91s para un texto chico,
  ~135s para 90K caracteres, techo 3 min. El aviso de inactividad tambien
  sugiere Sonnet, como el de conexion.
  Verificado en navegador con fetch simulado: (A) 1er intento falla, 2do
  responde -> genera bien, 2 llamadas, ~1.6s de espera visible; (B) ambos
  fallan -> alerta sin "Indra", con "dos intentos"; (C) el calculo del
  timeout da 91.000ms para texto chico y 135.000ms para 90K caracteres.
- v3.8.8 NAVEGACION DEL LIENZO. Sintoma: "scroll con el mouse o click para
  navegar sobre el flujo no me hace caso". Medido con raton real sobre un flujo
  de 80 cajas: #canvasWrapper SI tenia scroll (826 visibles de 1.143 px), pero
  el flujo mide 17.470 px de ANCHO y la rueda solo movia en vertical, topando a
  los 317 px; 16.136 px quedaban inalcanzables. Arrastrar en vacio no hacia
  nada: el mousedown del lienzo solo quitaba la seleccion (no habia pan).
  Arreglo:
  - wheel (attachZoomInteractions): Ctrl/Cmd = zoom como antes; Shift o deltaX
    dominante = nativo; si el vertical aun puede moverse en esa direccion, nativo;
    al llegar al tope, preventDefault y el deltaY mueve scrollLeft (deltaMode
    linea x16, pagina x clientHeight).
  - mousedown del lienzo (attachCanvasListeners): fuera de #nodesLayer y
    #edgesLayer, boton izquierdo o central, arrastrar >4 px mueve scroll con
    listeners en window (clase .panning); sin arrastre, al soltar quita la
    seleccion (antes era al pulsar y solo sobre gridBg). Las cajas cortan la
    propagacion en su propio mousedown, asi que su arrastre no cambia.
  - CSS: cursor grab en gridBg/swimlanesLayer/laneHeadersLayer (no en modo
    conexion) y grabbing durante el arrastre.
  Verificado: el diagnostico con raton real; la solucion con eventos simulados
  porque el panel no redibujaba (sin captura no hay scroll con coordenadas):
  media altura sin intervenir, tope abajo avanza 300 px con 3 pasos, arriba
  retrocede, Shift nativo, Ctrl zoom 100->112 %, arrastrar carril 300/40 px
  exactos, clic en caja y clic sin arrastre no desplazan. Sin errores.
  Pendiente de producto (no tocado): al generar con IA se abre solo el panel
  de la Ficha y tapa media pantalla del lienzo.
- v3.8.7 ELEGIR MODELO AL GENERAR. Pedido: "que el usuario pueda elegir el
  modelo de Opus o Sonnet". El selector ya existia en Ajustes de IA (con Haiku
  4.5 incluido), pero escondido. Ahora askProfundidad (titulo "Nivel de detalle
  y modelo" cuando hay IA) muestra dos tarjetas, Opus 5 y Sonnet 5, cada una con
  su rango estimado para el nivel marcado (.pm-coste), y el recuadro principal
  usa el modelo elegido: estimarCosteGeneracion(chars, nivel, modeloElegido).
  Al pulsar Generar se guarda como preferencia en processiq.ai.model (la misma
  que Ajustes), y callClaude ya lo lee de ahi: no cambio. fallbacks:'default'
  sigue solo en Opus 5. Si la preferencia era Haiku, la ventana preselecciona
  Opus 5 (Haiku sigue disponible solo en Ajustes).
  Verificado en navegador (30K car., nivel Actividad, sin historial): Opus
  US$ 0.31-0.81, Sonnet US$ 0.12-0.32; elegir Sonnet cambia el recuadro, la
  peticion sale con claude-sonnet-5 sin fallbacks, el coste real con 12.000/
  15.000 tokens es US$ 0.17 (= 0,024 + 0,15) y al reabrir recuerda Sonnet.
- v3.8.6 COSTE POR EJECUCION. Pedido: "que el usuario sepa cuanto va a costar
  aprox la ejecucion de su proceso". Solo cubre la GENERACION del proceso
  (aiBuildProcess); pains, tareas del copiloto y la prueba de Ajustes no.
  Precios de LISTA en PRECIOS_IA (US$ por millon de tokens, referencia oficial
  de la API de Claude, tabla del 24-jun-2026): Opus 5 5/25, Sonnet 5 2/10,
  Haiku 4.5 1/5. Si Anthropic cambia tarifas, se actualiza ahi.
  ANTES: askProfundidad(info) pinta #profCoste con estimarCosteGeneracion:
  - entrada = (min(chars, MAX_AI_CHARS) + AI_SYSTEM + 800) / car-por-token
  - rango de salida: sin historial, SALIDA_INICIAL por nivel (1: 5-15K,
    2: 10-30K, 3: 20-50K tokens; la salida incluye el razonamiento); con
    historial del mismo nivel y modelo, mediana(salida/entrada) aplicada al
    texto +-30%; car-por-token tambien sale de la mediana real (inicial 3).
  - "maximo posible" = entrada + GEN_MAX_TOKENS (64K) completos: es exacto.
  El recuadro se recalcula al cambiar de nivel y dice si es estimacion
  inicial o ajustada con N ejecuciones reales.
  DESPUES: callClaude lee usage de message_start (input + cache) y de
  message_delta (output_tokens acumulado), toma el maximo y llama a
  opts.onUsage ANTES de lanzar errores (una respuesta cortada tambien se
  cobra). aiBuildProcess registra {fecha ISO, modelo, nivel, chars, entrada,
  salida, usd} en localStorage 'processiq.ia.costes' (ultimas 20, por
  navegador) y en state._ultimoCosteIa; runIngest lo anade al mensaje del
  copiloto y, si falla, al aviso de error. Modelo de respaldo: se usa el
  modelo que informa message_start; Opus 4.8 tiene la misma tarifa.
  Verificado en navegador con SSE simulado (14.000 entrada / 18.500 salida):
  muestra US$ 0.53 (= 0,07 + 0,4625), estimacion inicial Actividad 30K car.
  US$ 0.31-0.81 con maximo 1.66, cambia al pasar a Detalle, se calibra tras
  una ejecucion real, y el aviso de max_tokens incluye lo consumido.
- v3.8.5 VARIOS DOCUMENTOS. Pedido: "permitir anadir multiples documentos
  para el relevamiento". La base de fuentes multiples ya existia (v3.x:
  sourcesList/addSource/combinedSourceText/MERGE_RULES), pero en la practica
  solo entraba uno: el input no tenia `multiple`, el drop tomaba files[0] y
  elegir el primer archivo GENERABA al instante (el resto llegaba tarde).
  Ahora: `multiple` en #docFileInput; elegir, soltar o "+ Anadir otra fuente"
  llaman a addFilesAsSources(files), que lee cada archivo con progreso
  "Leyendo i de n", los deja en la lista y NO genera; se genera con el boton
  ("Combinar N fuentes y generar"). Excepcion: un unico .bpmn sin otras
  fuentes se sigue importando directo. Salta duplicados (mismo nombre y
  largo), junta los errores por archivo en una sola alerta y, si se cancela,
  conserva lo ya leido. Tras endIngestJob se llama a renderSources porque
  ingestBusy restaura una etiqueta vieja del boton.
  Tope de entrada MAX_AI_CHARS 60K -> 180K (~45-50K tokens): antes tres
  documentos quedaban en 20K cada uno aunque sobrara espacio. combinedSourceText
  solo recorta si el total excede, y por reparto justo (ordena por largo: las
  cortas entran enteras, el presupuesto restante se divide entre las largas).
  renderSources muestra el total y #sourcesWarn (ambar) si se excede.
  Retirado window.__addOnly (ya no hace falta).
  Verificado en navegador (archivos creados con DataTransfer, IA simulada):
  .bpmn solo importa directo; 3 documentos se listan sin generar ni llamar a
  la IA; duplicado saltado y vacio avisado; quitar fuente ok; 279K car. muestra
  aviso; generar envia 181K car. con 4 cabeceras de fuente, reglas de fusion y
  las fuentes cortas enteras. Consola sin errores.
- v3.8.4 ENTRADAS SIN IA, corregido. Sintoma del usuario: "pego el texto,
  le doy procesar y genera al instante; no parece usar la API key". Habia TRES
  caminos que nunca llamaban a Claude aunque la clave estuviera lista:
  1) Ingestar abria en la pestana Audio/Transcripcion, cuya caja invita a
     pegar texto y cuyo boton llamaba a buildProcessFromText (palabras clave).
  2) Copiloto > "Generar proceso desde descripcion" llamaba a
     generateProcessFromDescription: elige una PLANTILLA de ejemplo por
     palabras clave (reclamo, compra...). Parecia IA sin serlo.
  3) El chat del copiloto con "genera/levanta/dibuja" hacia lo mismo.
  Ahora: Ingestar abre en Notas/Documentacion (primera pestana); el boton de
  Audio agrega la transcripcion como fuente y llama a runIngest; el copiloto
  (accion y chat) usa ingestarDescripcion(desc), que rellena #notesInput, abre
  Ingestar y llama a runIngest en un setTimeout (openModal cierra su ventana
  DESPUES del callback y la ingesta reutiliza #modal para el codigo/nivel; sin
  el setTimeout el MutationObserver de pedirCodigoEquipo resolveria '' y caeria
  en modo basico). Si el usuario elige Modo basico, el copiloto lo dice:
  "Proceso generado en modo basico (sin IA)".
  Unico uso restante de buildProcessFromText: esa rama de modo basico.
  generateProcessFromDescription queda sin llamadas (codigo muerto).
  Verificado en navegador con SSE simulado: A abre en notes; B audio, C accion
  y D chat llaman a api.mbc-latam.com/v1/messages con x-processiq-code y
  publican "Proceso interpretado con IA"; E sin codigo pregunta, Modo basico no
  llama a la IA y avisa. Consola sin errores.
- v3.8.3 SOLAPES EN EL LIENZO, corregido: autoLayout daba a todo carril 170px
  fijos. Con la primera ingesta real por IA (procedimiento de 86 nodos), una
  decision abria 3 ramas del mismo rol en la misma columna: la pila pedia
  ~330px y las cajas se montaban entre si y sobre el carril de abajo.
  Ahora laneHs[i] = max(170, suma de altos de la pila + 26px entre cajas +
  56px de aire) y laneTops[] acumula; render y laneGutterY leen laneHs/
  laneTops de state._lanes (con fallback a laneH para snapshots viejos de
  localStorage). La pila usa el alto de CADA caja (mezcla tarea 76 con
  documento 70 o evento 54). Verificado en navegador con un caso de 3 ramas:
  0 solapes, 0 cajas fuera de carril, hueco minimo 26px, carriles 336/234px;
  regresion en loadComplex/3/8/12 y niveles 1-2-3 sin solapes ni errores.
  El PPTX no se toca: tiene su propio apilaFila desde v3.3.
- Intermediario (Worker) v3.8.3: CLAVE y CODIGO se leen con .trim() (un salto
  de linea pegado al cargar el secreto invalidaba la clave sin que se viera);
  /health devuelve formatoClave: 'ok' | 'vacia' | 'sospechoso' (solo si el
  valor TIENE FORMATO sk-ant-…; no revela nada). Bateria test_trim.mjs (7) +
  regresion (13 + 12) en verde; desplegado como version f31fcdac.
  LECCION DE SEGURIDAD: el usuario pego la clave de Anthropic EN LUGAR del
  nombre ANTHROPIC_API_KEY en `wrangler secret put`, con lo que la clave quedo
  como NOMBRE de un secreto (visible en secret list) y en el historial de
  PowerShell. Esa clave se dio por comprometida y se elimino en la consola de
  Anthropic; queda un secreto muerto con ese nombre en el Worker (borrar desde
  el panel). Desde entonces las cargas de clave se hacen con la ventana guiada
  que valida el formato y prueba la clave contra /v1/models ANTES de subirla.
  Otra leccion: una clave creada a nivel de organizacion (sin workspace) da
  400 "not scoped to a workspace"; hay que crearla DENTRO de un workspace.
- v3.8.2 BUG DE CAPAS, corregido: #modal (ventana generica: codigo del
  equipo, nivel de detalle, roles) y #ingestModal tenian el mismo z-index
  (1000); #ingestModal va despues en el HTML y se pintaba ENCIMA. Las
  preguntas de la ingesta se abrian invisibles y "Generar proceso" parecia no
  hacer nada (esperaba respuesta a una pregunta que no se veia). Nunca se
  habia visto porque ese camino solo corre con IA configurada. Arreglo:
  #modal { z-index: 1100 }. Verificado con elementFromPoint: el cuerpo de la
  pregunta es lo que queda encima.
  Feedback anadido: ingestBusy pone spinner + "Generando…" en #btnIngestGo
  (guarda y restaura la etiqueta, que renderSources cambia), trae la barra a
  la vista, y un cronometro #ingestElapsed (0:00) corre entre startIngestJob
  y endIngestJob. Verificado con respuesta SSE simulada: boton ocupado,
  barra visible, cronometro avanzando, texto "Recibiendo el proceso de la
  IA… N caracteres", y al terminar todo restaurado (4 nodos generados).
- El banco bench/ mide el modelo ANTES de serializar: no ve el post-proceso.
  Verificar el post-proceso con el replay en worker descrito en Quirks.
- Pendiente (Tier 3): inyectar tema y patron oficial para que titulo y pie sean
  placeholders. Esperar a la plantilla MBC oficial para no hacerlo dos veces.

### Identidad visual (v3.2.0)
- La marca es **MBC**, no Minsait. Fuente de verdad: *Libro de estilo transitorio
  V2*, archivado en `Documentos\Plantillas\MBC\`. Azul MBC `003478` (dk1),
  Fucsia `FF0054`, Gris Ceramica `E3E2DA` (lt2), tipografia **Montserrat**
  (esta en Google Fonts, a diferencia de ForFuture Sans).
- La web usa el logotipo oficial como SVG inline (`logo-mbc.svg`, tres trazos
  M/C/B, viewBox 3860x856), favicon propio (`favicon.svg`: teja azul + M oficial
  + regla fucsia) e imagen Open Graph `og-image.png` 1200x630.
- La OG era un SVG y casi ningun cliente los renderiza: ahora es PNG, generado
  con Chrome headless a partir de `scratchpad/og-card.html` (asi carga Montserrat
  de verdad). Para regenerarla: `chrome --headless=new --window-size=1200,630
  --screenshot=og-image.png file:///.../og-card.html`.
- El PPTX sigue con la paleta anterior (Pruno). Migrarlo es trabajo aparte.

### Entregables
- **Ficha de Proceso** corporativa de 12 bloques (formato PR-DU-COM-*).
- Export: **SVG · PNG · BPMN 2.0 · PPTX · Word · Ficha · JSON**.

---

## 3. PENDIENTES — por prioridad

### Alta

**1. Validar visualmente el PPTX** *(bloqueante para uso con cliente)*
Nunca se pudo renderizar PowerPoint en el entorno de trabajo. El usuario reportó *"se cruzan líneas y figuras"*; se corrigieron 3 defectos (ruteo con obstáculos, nodos apilados, pie duplicado) **pero el resultado no se verificó**.
→ *Siguiente paso:* exportar el ejemplo *Venta de Lotes*, abrir el slide 2/4 y comparar contra `Ejemplo de flujos.pptx`.

**2. Prueba real con API key**
Todo el camino de IA se validó con `fetch` interceptado. **Nunca se hizo una llamada facturada real.**
→ *Siguiente paso:* configurar la key en el botón de ajustes → *Probar conexión* → ingerir un documento real y revisar la calidad del flujo generado.

**3. Ruteo A-star** — *IMPLEMENTADO Y APAGADO. No volver a intentarlo sin leer esto.*

Se construyó en v2.8: ruteo ortogonal sobre grilla de Hanan, coste por longitud,
giros y reutilización de canal, con cacheo por layout. Funciona. **No se paga.**

Medido sobre 3 procesos reales (flechas sobre cajas / cruces / tiempo de autoajuste):

| Proceso | Apagado | Encendido |
|---|---|---|
| 59 nodos | 6 / 2 · 0,3 s | 6 / 2 · 1,3 s |
| 97 nodos | 320 / 36 · 0,7 s | 317 / 39 · 9,5 s |
| 119 nodos | 200 / 65 · 0,7 s | **142 / 50** · 7,2 s |

Un caso mejora un 29 %, dos no mejoran, y todo va de 6 a 13 veces más lento.

**Por qué falla, que es lo importante:** cuando 97 nodos van apretados en el área
disponible **no existe canal libre por donde rutear**. Ningún algoritmo encuentra
un camino limpio que no está ahí. El problema no es el ruteo: es la densidad del
layout. Se probó primero aplicando A* por tipo de arista y luego sólo cuando la
heurística pisaba una caja; la segunda variante fue más lenta *y* peor.

→ *Siguiente paso real:* **bajar la densidad, no mejorar el ruteo.** Las vistas por
nivel de granularidad (macroproceso / actividad / tarea) reducen los nodos por
lámina; con 20 nodos en vista ejecutiva el problema desaparece solo. Volver a
medir el A* **después** de eso, cuando sí haya canales libres que aprovechar.

Activar para experimentar: `ProcessIQ.astar(true)`.

> Ojo con la prioridad: hasta v2.5.1 se creía que el ruteo era el problema principal
> del PPTX. Al medirlo resultó ser el 26 % de los defectos; el 74 % era texto que se
> pisaba. Eso se corrigió en v2.6.0 sin tocar el ruteo. Medir antes de invertir.

### Media

**4. Proxy seguro para la API key**
Hoy es **BYOK**: la key vive en el navegador del usuario. Sirve para uso interno y demos, **no para un link público compartido**.
→ *Siguiente paso:* función serverless (Vercel) con la key en variable de entorno; ~1 día.

**5. Acciones aún heurísticas** (no usan el API)
`detect-pains` (existe `ai-pains` aparte), `whatif`, `variants`, `value-map`, `merge-gateways`, `generate`.

**6. Web Worker para extracción de PDF**
Se mitigó cediendo el hilo cada 3 páginas, pero la extracción **sigue en el hilo principal**.

### Baja

**7. PPTX desde plantilla real** *(mitigado en v2.5.0)* — hoy el formato se replica por código; se podría partir del `.pptx` real como template.

**8. OCR para PDF escaneado** — hoy solo avisa de que hace falta OCR.

**9. Textos largos en cajas de 0,53 pulgadas** — verificar que no se corten; si pasa, subir la altura a 0,62.

---

## 3-bis. Banco de pruebas — LEER ANTES DE TOCAR EL LAYOUT

`bench/` mide la calidad del lienzo y del export PPTX sobre BPMN reales.
**Úsalo antes y después de cualquier cambio de layout, ruteo o export.**

    // en la consola de la app, pegar bench/harness.js y luego:
    const r = await PIQBench.correr();

Línea base en `bench/baseline.json` (v2.7.3, 12 casos, 1.042 nodos). Si
`txtSobreTxt`, `txtSobreFig` o `fueraDeLamina` suben, es una regresión.

> ⚠️ `bench/fixtures/` **no se versiona**: el repo es público y los ficheros
> son procesos reales de cliente. Están en local; si se pierden, se
> reextraen del ZIP de evaluación de MBC Process Disruptor.

**Hallazgo clave del banco:** `flechaSobreCaja` en el lienzo predice casi 1:1
los solapes de texto del PPTX (59 nodos: 6 → 52 solapes; 154 nodos: 366 → 344).
Arreglar el ruteo arregla el entregable.

---

## 4. API de Anthropic — integración

Endpoint y cabeceras:

    POST https://api.anthropic.com/v1/messages

    content-type: application/json
    x-api-key: <la key del usuario>
    anthropic-version: 2023-06-01
    anthropic-dangerous-direct-browser-access: true    <-- imprescindible para CORS

- **Modelos:** `claude-opus-5` (por defecto), `claude-sonnet-5`, `claude-haiku-4-5`
- **Parámetros usados:** `max_tokens`, `system`, `output_config: { effort: 'high' }`
- **Timeout propio:** 3 min + `AbortController` conectado al botón Cancelar
- **Errores manejados:** 401 (key inválida), 429 (límite), timeout, sin conexión
- **Docs:** https://platform.claude.com/docs · **Consola:** https://console.anthropic.com

**Funciones clave en `app.js`:** `callClaude()` · `aiBuildProcess()` · `runAiTask()` · `aiAnalyzePains()` · `processDigestForAi()` · `parseJsonLoose()`

---

## 5. Librerías (todas por CDN, carga bajo demanda)

| Librería | Versión | Para qué |
|---|---|---|
| pptxgenjs | 3.12.0 | Export PPTX |
| mammoth | 1.8.0 | Leer `.docx` |
| pdfjs-dist | 4.7.76 | Leer PDF (módulo ESM + worker) |
| jszip | 3.10.1 | Leer `.pptx` |

**Analítica:** Umami — `https://umami-mbc.vercel.app/script.js`, website-id `0f3aaa08-7bb8-4aec-b09b-d9c4abf3868c`

---

## 6. localStorage

| Clave | Contenido |
|---|---|
| `processiq.v1` | Proceso completo (meta, ficha, nodes, edges, views, lanes, KPIs) |
| `processiq.ui` | Estado de paneles colapsados |
| `processiq.ai` | `{ key, model }` — **la API key, solo en el navegador** |

---

## 7. Formato PPTX — referencias y medidas exactas

**Archivos de referencia:**
- `C:\Users\nebernal\Downloads\Ejemplo de flujos.pptx` — **plantilla actual**
- `C:\Users\nebernal\OneDrive - Indra\Grp_T_Telered_IA - General\02. Gobierno IA\03. Gobierno robusto\202606_Documento_Trabajo_Gobierno_IA_Telered.pptx` (slides 40-41)

**Medidas en pulgadas, extraídas del XML de la plantilla** (verificadas contra
`theme2.xml`, `slideMaster2.xml`, `slideLayout18.xml` y `slide2.xml`):

| Elemento | Medida | Color |
|---|---|---|
| Caja actividad | 1,303 x 0,531 · `roundRect` adj 5882 | `E4E3DD` |
| Diamante (gateway) | 0,315 x 0,315 | `4F062A` (Pruno) |
| Círculo inicio | 0,297 | `44B757` (accent2) |
| Círculo fin | 0,297 | `F05C95` |
| Chip de rol (rotado 270 grados) | 1,252 ancho x 0,472 alto | `F7C29E` (accent4 lumMod 40 / lumOff 60) |
| Conectores | 0,5 pt | `FF0054` (accent1) |
| Separador de carril | 1 pt | `D0CEC1` (bg2 lumMod 90) |
| Panel del flujo | `octagon` adj 2000 sobre el fondo | `FFFFFF` |
| Tipografía | 8,5 pt cajas / 8 pt etiquetas | **ForFuture Sans** |

**Chrome corporativo (layout18):** antetítulo `x 0,367 · y 0,354 · w 12,6` ·
título `y 0,6` a 28 pt Pruno · pie `y 7,001` · nº de lámina `x 12,547 · y 7,001`.
**Portada (layout42):** wordmark `minsait` en `x 0,421 · y 6,692 · 1,963 x 0,39`;
`An Indra company` en `x 8,843 · y 6,931`.

**Tema del deck:** dk1 `4F062A` (Pruno) · dk2 `260717` (Pruno Oscuro) ·
lt1 `FFFFFF` · lt2 `E3E2DA` (Gris Cerámica) · accent1 `FF0054` (Fucsia) ·
accent2 `44B757` · accent3 `8661F5` · accent4 `E56813` · accent5 `00B0BD` ·
accent6 `EF659D` · folHlink `A40037`. Fuente mayor y menor: **ForFuture Sans**.

> ⚠️ **ForFuture Sans no es una fuente de sistema.** En un equipo Minsait se ve
> correcta; fuera de la organización PowerPoint la sustituye. No es un defecto
> del export.

**Logotipos:** los tres wordmarks oficiales (`minsait` oscuro, `minsait` blanco,
`An Indra company`) están embebidos en `app.js` como data URI base64,
extraídos de `image9/11/8.png` de la propia plantilla. Pesan ~2 KB en total.

**Ficha de proceso — referencia:** `PR-DU-COM-02 Venta de Lotes Urbanos` (Grupo Centenario), 12 bloques. Está codificada como demo: `ProcessIQ.loadFichaVentaLotes()`.

---

## 8. Quirks operativos — LEER ANTES DE TRABAJAR

### Deploy

Secuencia completa (los cuatro pasos importan):

1. **Bumpear siempre** la versión de cache-busting en `index.html`
   `sed -i 's/?v=2\.4\.0/?v=2.5.0/g' index.html`
2. **Commit, push y verificar sincronía** — los push en background fallan callados
   `git add -A && git commit -m "..." && git push origin main`
   `git fetch -q origin` y comparar `git rev-parse HEAD` contra `git rev-parse origin/main`
3. **Forzar el build de Pages** cuando falle o quede en cola
   `gh api -X POST repos/nelson2206/process-iq/pages/builds`
4. **Verificar en vivo** que la versión servida es la nueva
   `curl -s --ssl-no-revoke "https://nelson2206.github.io/process-iq/index.html?cb=123"`

> ⚠️ **Desde la red corporativa el dominio nuevo esta bloqueado** (medido el 6-sep-2026):
> https://procesos.mbc-latam.com devuelve 403 con la pagina "Noncompliant action" y la
> cabecera X-Direct-Response, sin ninguna cabecera de GitHub; github.io si responde con
> Server: GitHub.com y redirige al dominio. Es un proxy de red que aun no categoriza el
> dominio, no un fallo del despliegue. Para verificar la version desplegada sin pasar por el
> dominio: gh api repos/nelson2206/process-iq/contents/index.html --jq .content | base64 -d
> | grep app.js?v= ; y comparar gh api .../pages/builds/latest --jq .commit con git rev-parse HEAD.
> Pedir a Seguridad que categorice procesos.mbc-latam.com; hasta entonces los usuarios en
> red corporativa veran el mismo 403.

### Edición de código

- **NO pasar scripts Python por stdin en Windows**: se decodifican como cp1252 y **corrompen los acentos**, rompiendo los anchors de búsqueda. Escribir el script a un `.py` y ejecutarlo.
- **Los heredocs con backticks** (template literals de JS, code fences de Markdown) **rompen bash**. Escribir ese contenido con la herramienta de escritura o a un archivo aparte.
- Los anchors de búsqueda deben ser **ASCII puro** (evitar "quedó", "según").
- Validar siempre tras editar: `node -e "new Function(require('fs').readFileSync('app.js','utf8'))"`

### Pruebas en navegador

- **El export PPTX NO se puede verificar dentro del panel del navegador de la
  sesion.** Medido el 25-ago-2026: la pestana esta siempre en document.hidden
  = true y Chrome estrangula los timers encadenados (el sexto setTimeout(0)
  espero 5,7 s). JSZip genera el zip encadenando decenas de esos timers, asi
  que pres.write() NUNCA termina ahi. No es un bug del export: en un navegador
  normal en primer plano funciona. Para verificar la serializacion, reproducir
  la presentacion en un Web Worker (no se estrangula): capturar pres
  interceptando PptxGenJS.prototype.write, serializar _slides a JSON y
  reproducirla con addText/addShape/addImage dentro del worker. Asi se valido
  la v3.0.1 (2,6 s de escritura, 28 conectores anclados).


- `window.ProcessIQ` es el hook de pruebas: `loadFichaVentaLotes()`, `snapshot()`, `quality()`, `autoFit()`, `runAiTask(k)`, `sources()`, `detectParticipants(t)`, `aiAnalyzePains()`, `importBpmnXml()`, `generateBpmnXml()`.
- **Los screenshots del preview hacen timeout** con diagramas pesados: validar con `javascript_tool`.
- **Los timers están estrangulados** en pestaña de fondo (`setTimeout` y `requestAnimationFrame` no son fiables para medir responsividad).
- Sacar archivos del navegador por POST a un servidor local funciona, pero **ojo con el envío chunked** (el receptor puede recibir 0 bytes si lee `content-length`).

---

## 9. Cómo arrancar la sesión nueva

Pega esto como primer mensaje:

> Trabajo en **ProcessIQ** (`C:\Users\nebernal\OneDrive - Indra\Documentos\Propuestas\Transformación\ProcessIQ`, repo `nelson2206/process-iq`, live en `nelson2206.github.io/process-iq`).
> Lee **`HANDOFF.md`** en la raíz del repo: tiene el estado completo, los pendientes y los quirks operativos.
> Hoy quiero atacar: **[pendiente número N]**.

**Orden recomendado:** #2 (probar con key real) → #1 (validar PPTX) → #3 (ruteo A-star) → #4 (proxy seguro).
