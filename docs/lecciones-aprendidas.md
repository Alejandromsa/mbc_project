# Lecciones aprendidas

Errores cometidos durante el trabajo en este repositorio y la regla que los evita. **Léelo antes de empezar** y añade una entrada cada vez que un error cueste tiempo o dé un resultado falso. Formato: qué pasó → regla.

## Herramientas y entorno (Windows)

1. **Barras invertidas en scripts incrustados en la shell.** Un script de Node pasado por heredoc desde la herramienta de shell perdió una barra: `'\\n'` llegó como `'\n'` y el código generado quedó con saltos de línea reales dentro de una cadena → error de sintaxis en `ia/motor.js`.
   → **Regla:** todo script que contenga `\` se escribe primero a un archivo con el editor (en el directorio temporal) y se ejecuta desde ahí. Tras generar código, compilar o hacer `node --check` en el acto.
   **Reincidencias:** `ingesta/texto.js` y `mining/event-log.js` (saltos reales en template literals) y `exportar/ficha.js` (el regex `/\.doc$/` quedó como `/.doc$/`). → **Antes de lanzar un heredoc, buscar `\` en su contenido; si aparece, NO usar heredoc.**
   También en expresiones de `jq`/`gh --jq`: `test("^v[0-9]+\.0")` falló por la barra. → En regex dentro de comandos de shell, usar clases de caracteres (`[.]`) en lugar de escapes.

2. **`sed` con barras y regex complejas no coincidió y no avisó.** Varias sustituciones con `/` y `\s` escapados no se aplicaron.
   → **Regla:** para reemplazos exactos usar el editor. Si se usa `sed`, verificar siempre después con `grep` que el cambio está.
   **Reincidencia (portado de Word/Ficha):** un `sed` con `\\n` dentro de un script de Node partió una línea en dos y rompió el script. → **Nunca usar `sed` sobre código que contenga barras invertidas, comillas o `\n`; en esos casos, siempre el editor.**

3. **`rm -rf resultados` falló porque la shell estaba dentro de esa carpeta** ("Device or resource busy") y la cadena `&&` se cortó sin que se notara.
   → **Regla:** no hacer `cd` a carpetas de resultados. Inspeccionarlas con rutas absolutas o subshells `( … )`.
   **Reincidencia:** un `cd …/resultados/loadComplex6 && diff …` dejó ahí la carpeta de trabajo de la sesión (el `cd` persiste entre comandos). → **Usar variables de ruta (`R=…; diff $R/a $R/b`), nunca `cd`.**
   **Otras dos reincidencias** (`cd apps/api/src`, `cd /c/Users/usuario`). → Si un comando necesita `cd`, empezarlo por `cd /c/Users/usuario/processiq && …` y usar rutas relativas a la raíz.

4c. **Casi creo el registro DNS en el sitio equivocado.**
    - Se pidió crear `mbc.asissoft.com` con la API de name.com, porque el dominio está registrado allí.
    - Pero `asissoft.com` usa los nameservers de Cloudflare: la zona se movió para otro proyecto. Un registro en el DNS de name.com no lo vería nadie.
    - Devolver los nameservers a name.com rompería `portal.asissoft.com` y el correo.

    → **Regla:** antes de tocar DNS, `nslookup -type=NS <dominio> 8.8.8.8` para saber qué proveedor sirve la zona. El registrador y el proveedor de DNS pueden ser distintos.

4. **`curl -w '%{http_code}' -o /dev/null` devolvió `000` en Git Bash** aunque el servidor respondía bien.
   → **Regla:** en esta máquina usar `curl -v` o `-o NUL` para ver el código real.

4b. **Pasar un binario por stdin a `docker compose exec -T` desde Git Bash lo corrompe** (`pg_restore: did not find magic string`): la restauración de prueba falló aunque el respaldo estaba bien.
   → **Regla:** los archivos binarios se usan desde dentro del contenedor que ya tiene la carpeta montada (el servicio `respaldo` monta `/respaldos`), nunca por tubería desde la shell de Windows.

5. **Salida de pruebas invisible:** Vitest oculta `console.log` de las pruebas que pasan, y `/tmp` de Git Bash no es el mismo `/tmp` para Node.
   → **Regla:** para ver la salida real de una función, usar `toMatchInlineSnapshot()` con `vitest run -u` y revisar el snapshot. Si hace falta un archivo, usar rutas de Windows del directorio temporal.

5b. **`@ts-nocheck` oculta imports rotos:** `word.ts` importaba `contarTraspasos`, que no estaba exportado en el índice del dominio, y `pnpm typecheck` pasó en verde. Lo detectó el build de Vite.
   → **Regla:** tras tocar un archivo con `@ts-nocheck`, el control es el build (`pnpm fidelidad` lo incluye), no el typecheck. Al añadir una función a un paquete, exportarla en su `index.ts` en el mismo paso.

5c. **`structuredClone` en `dominio` rompió el typecheck de todos los paquetes que dependen de él**: cada paquete compila la fuente TS de sus dependencias con su propia configuración (`lib: ES2022`, sin tipos de DOM ni de Node).
   → **Regla:** los paquetes compartidos (`dominio` sobre todo) solo usan ECMAScript estándar: nada de globales del navegador ni de Node en `src/`. Tras tocar `dominio`, correr `pnpm typecheck` en la raíz, no solo en el paquete.

5d. **La herramienta de escritura de archivos convirtió las secuencias de escape Unicode en el carácter literal.** Un `/[\u0300-\u036f]/g` para quitar tildes llegó al archivo con los dos caracteres combinantes reales, y un `'\ufeff…'` de una prueba, con un BOM invisible dentro de la cadena. Funcionaba igual, pero no se veía. `\s`, `\r` y `\n` sí llegaron intactos.
    → **Regla:** no escribir `\uXXXX` en código a través de la herramienta de escritura. Usar propiedades Unicode (`/\p{M}/gu` para quitar tildes tras `normalize('NFD')`) o `String.fromCharCode(0xfeff)`. Tras escribir, comprobar con `od -c` o `grep` que no quedaron caracteres invisibles.

## Pruebas de fidelidad

6. **Verde falso por `dist` desactualizado.** Se ejecutó Playwright directamente tras un build que había fallado y las pruebas pasaron contra la versión anterior.
   → **Regla:** usar siempre `pnpm fidelidad` (hace build y luego prueba). Si se lanza Playwright a mano, comprobar antes que el build terminó sin error.

7. **Diferencias sub-píxel intermitentes en `edge-label-bg`** (dos valores que alternan). No eran del portado: la fuente de las etiquetas (Montserrat 500 y subconjuntos Unicode de Google Fonts) cargaba tarde según el timing.
   → **Regla:** si un artefacto difiere por décimas de píxel o alterna entre dos valores, sospechar primero de fuentes, transiciones o timing. Reproducir con `--repeat-each 5` antes de tocar código. El arnés carga todas las caras de Montserrat y emula `prefers-reduced-motion`.

7b. **Tras `page.reload()` las fuentes no estaban precargadas** y la app pinta desde `localStorage` antes de que el arnés pueda cargarlas: el SVG de ese primer pintado dependía del timing.
    → **Regla:** después de cada recarga, llamar a `cargarFuentes(page)`; y en el paso inmediatamente posterior a una recarga, comparar solo artefactos que no midan texto (resumen, BPMN con coordenadas).

7c. **La fidelidad falló de forma intermitente en corridas completas**: primero `loadComplex6` y minería, luego `loadComplex12`. Repetidos solos, pasaron 10 de 10.
    - Siempre `edge-label-bg`, solo en etiquetas largas ("SLA 2h vencido", "No conforme"), y siempre la misma app midiendo un poco menos: hasta un 0,06 % (0,0535 px en 89,6 px).
    - Fijé una primera tolerancia de 0,05 px a partir de los dos primeros casos y el tercero la superó. **Una tolerancia no se calibra con dos muestras.**
    - Supuse que era el zoom y lo descarté midiendo: el ancho es idéntico al 47 %, 69 %, 100 % y 120 %. La causa sigue abierta.
    → **Regla:**
    - `comparar.mjs` acepta ±0,25 px solo en `x` y `width` de `rect.edge-label-bg`, unas 4 veces lo máximo observado; todo lo demás sigue byte a byte.
    - Cualquier tolerancia nueva va igual de acotada, con su motivo en el código, calibrada con varias corridas completas y con una prueba de que sigue detectando cambios reales (+0,3 px, otra `y`, otro texto, una etiqueta menos).
    - Un fallo que solo aparece en la corrida completa se reproduce con `--repeat-each 5` antes de tocar nada.
    - Una hipótesis se comprueba midiendo antes de escribirla como causa en el código.

8. **Captura a mitad de un proceso asíncrono.** Un comando del copiloto lanzaba una ingesta y la captura llegaba a los 150 ms.
   → **Regla:** tras una acción que dispara trabajo asíncrono, esperar a una condición observable (mensaje, modal, nodo) o dar margen suficiente, y verificar con repeticiones.

9. **Minificar CSS cambió los artefactos:** Lightning CSS pasa a minúsculas los colores de las variables CSS, y la app los copia a los SVG.
   → **Regla:** cualquier cambio de build o de dependencias puede alterar la salida. Pasar la fidelidad completa antes de darlo por bueno (`cssMinify: false` se queda así durante la fase 1).

10. **Escenarios que no ejercitan nada.** El primer texto de prueba del modo básico no producía actividades ("No pude extraer…"), así que la prueba pasaba sin cubrir el intérprete.
    → **Regla:** al añadir un escenario, ejecutarlo con `GUARDAR_TODO=1` y comprobar que los artefactos tienen contenido significativo (nodos, mensajes, peticiones), no solo que coinciden.

11. **Los errores de página también son comportamiento.** El export PPTX con To-Be falla en el MVP (`M_PRUNO is not defined`, ver `docs/fase1-divergencias.md`); solo se vio porque la prueba esperaba una descarga que nunca llegó.
    → **Regla:** los escenarios comparan los errores de JavaScript de ambas apps. Ante un timeout, depurar mirando `pageerror` y la consola.

## Web y pruebas E2E

17. **«Salir» no llevaba a la pantalla de entrar.** `QueryClient.clear()` borra las consultas y deja a los componentes montados observando una consulta que ya no existe: la guardia nunca vio la sesión en `null`. Lo detectó la prueba E2E, no el typecheck.
    → **Regla:** al cerrar sesión, recargar la página (`location.assign`), que además no deja datos del usuario anterior en memoria. No usar `clear()` con componentes montados.

18. **La barra del editor cortaba el nombre del proceso** («Gestión de s…»). Un elemento absoluto centrado con `left: 50%` + `translateX(-50%)` calcula su ancho con solo la mitad del contenedor.
    → **Regla:** para centrar algo absoluto con ancho según su contenido, usar `left: 0; right: 0; margin: 0 auto; width: fit-content`.

19. **Las pruebas pasaron en verde y la interfaz tenía tres defectos visibles:** el nombre cortado, fechas partidas en dos líneas y el menú sin resaltar. Solo se vieron en las capturas.
    → **Regla:** toda pantalla nueva o cambiada se revisa con una captura (`page.screenshot`) antes de darla por terminada.

20. **`getByLabel('Contraseña nueva')` también encontró «Repite la contraseña nueva»**: Playwright busca por subcadena.
    → **Regla:** con etiquetas que comparten palabras, `{ exact: true }`. Lo mismo con `locator('tbody')` en una página con dos tablas: acotar con `getByRole('table').first()` / `.last()`.
    **Reincidencia (E2E de la IA):** `#notesInput` está dentro de un `<details>` plegado del modal de ingesta y la prueba esperó 60 s a que fuera visible. → Antes de escribir una prueba sobre la interfaz del editor, mirar el marcado (`index.html`) de lo que se va a tocar.

21. **Los diálogos del editor no restauran el texto de sus botones:** cada uno pone el suyo (`Generar`, `Guardar`, `Usar estos roles`…). El diálogo nuevo de «IA del proyecto» salió con «Generar», heredado del anterior. Se vio en una captura, no en las pruebas.
    → **Regla:** un diálogo nuevo que use `openModal` pone siempre el texto de `#modalOk`.

22b. **Dos defectos de CSS en el editor de temas, vistos solo en capturas.**
    - El diálogo ancho salía estrecho: `.dialogo-ancho` y `.dialogo` tienen la misma especificidad, y gana la que va después en el archivo.
    - La fila de imágenes se salía por la derecha: un `<fieldset>` tiene por defecto un ancho mínimo igual al de su contenido, y los `input type=file` no encogen en una rejilla `1fr`.
    → **Regla:** una variante de un componente se escribe con los dos selectores (`.dialogo.dialogo-ancho`). En rejillas con campos, usar `minmax(0, 1fr)`, y poner `min-width: 0` a los `fieldset`.

22c. **Editar YAML con un regex genérico metió una línea donde no tocaba.** Para añadir `logging:` a cada servicio del compose usé `^  ([a-z-]+):$`, que también coincidió con `options:` dentro del ancla `x-registro`. Los volúmenes se salvaron solo porque llevan `_`.
    → **Regla:** después de editar el compose con un script, `docker compose config --quiet` y revisar las líneas tocadas. Mejor aún: reemplazos exactos de bloques conocidos.

22d. **Hono no admite rutas nuevas después de la primera petición** («Can not add a route since the matcher is already built»).
    → **Regla:** en las pruebas, las rutas auxiliares (p. ej. una que falla a propósito) se añaden a la app antes de iniciar sesión o de hacer cualquier petición.

22e. **La primera copia de seguridad de producción estaba vacía (846 bytes) y nadie lo supo hasta la prueba de restauración.**
    - El servicio de copias hace una al arrancar, y arrancó antes de que la API creara las tablas.
    - La siguiente no llegaba hasta 24 h después.
    - Las pruebas de copias habían usado una base ya poblada, así que no lo detectaron.

    → **Regla:**
    - Una copia no está probada hasta que se restaura: la prueba trimestral del runbook es obligatoria.
    - El servicio de copias espera antes de la primera (`RESPALDO_ESPERA_INICIAL_S`).
    - «Sistema» avisa si la última copia pesa menos de 10 kB.

22f. **Fusionar PR apilados con `--delete-branch` cerró el siguiente PR.** Al borrar la rama base del #1, GitHub cerró el #2 en lugar de reapuntarlo a `main`. Se recuperó restaurando la rama, reabriendo y cambiando la base.
    → **Regla:** para fusionar una pila, por cada PR en orden: `gh pr edit N --base main` y después `gh pr merge N --merge`, **sin** `--delete-branch`. Las ramas se borran al final, cuando todos estén fusionados. Comprobar después con `git diff origin/main <última rama>` que el contenido es el verificado.

22g. **Casi publico el repositorio creyendo que reescribir `main` bastaba para ocultar un dato.**
    - El correo personal del autor estaba en 13 commits. El plan era reescribir el historial y forzar el push.
    - Pero GitHub guarda las referencias de cada PR (`refs/pull/N/head`) con los commits originales, y no se pueden borrar sin el soporte de GitHub.
    - Se publicó como repositorio nuevo con el mismo nombre (ADR 18).

    → **Regla:** antes de hacer público un repositorio, auditar el historial completo y no solo el árbol actual: valores reales de los `.env` contra todos los blobs, patrones de claves, correos de autor y datos de red. Si hay que ocultar algo que ya pasó por un PR, reescribir en un repositorio nuevo; en el mismo repositorio, el dato sigue visible en los PR.

22i. **La guía de módulos decía montar el módulo con `<Route nest>` en `main.tsx`, y eso rompe el menú.** La escribí sin probarla. El primer agente que la siguió (portafolio) vio en su E2E que «Proyectos» llevaba a `/proyectos/portafolio/`: con `nest`, la cabecera del shell queda dentro del router del módulo.
    → **Regla:** un ejemplo de código de una guía se prueba antes de publicarlo, como cualquier código. Los módulos se montan sin `nest` (`<Route path="/clave/*?">`) y abren su `<Router base>` dentro; su E2E comprueba los enlaces del menú.

22. **Reincidencia de la 5c:** la API compila la fuente de `@processiq/ia` con los tipos de Node, donde `Response.json()` devuelve `unknown`, y un código que compilaba en su paquete dejó de hacerlo.
    → **Regla:** al hacer que un app nuevo dependa de un paquete, correr su typecheck enseguida. En el código compartido, tipar explícitamente lo que cambia según el entorno (`const j: any = await res.json()`).

22h. **Un aviso de la barra del proyecto no se ve durante una generación.** El aviso de «modelo sustituido» se mostraba con `avisar()` al encolar, pero el diálogo de ingesta (z-index 1000, fondo desenfocado) tapa la barra (z-index 60), y al terminar el aviso de «guardado como vN» lo reemplaza. La E2E pasaba igual: `toContainText` no exige que el elemento se vea. Lo mostró la captura.
    → **Regla:** lo que la persona deba leer mientras genera va también en el progreso de la ingesta (`onEstado`). Un aviso nuevo se comprueba con una captura en el momento en que debería verse, no solo con `toContainText`.

22j. **Postgres 17 ejecuta las funciones de un índice con un `search_path` seguro.** Una función IMMUTABLE que envuelve `unaccent` sin calificar el esquema funciona en una consulta normal, pero `CREATE INDEX` falla con «function unaccent(text) does not exist». Pasa también en `REINDEX`, `VACUUM`, `ANALYZE` y en la restauración de una copia. Se comprobó con un control en el Postgres de desarrollo (ADR 19).
    → **Regla:** toda función usada en un índice (o en una vista materializada) califica cada objeto que usa: `public.unaccent('public.unaccent'::regdictionary, …)`. Falla incluso con la tabla vacía, así que la propia migración lo delata en las pruebas; aun así, probar `pg_dump` y `pg_restore` con datos.

22k. **La vista previa de la Ficha deja sus estilos en toda la página del editor.** `openFichaPreview()` mete en `#modalBody` un `<style>` con reglas de elemento (`body`, `h1`, `h2`, `p`, `table`, `td`…) y al cerrar el modal solo lo oculta. En la vista del invitado, el título del panel de comentarios salió subrayado en azul después de abrir la ficha. Las pruebas pasaban; se vio en una captura.
    → **Regla:** lo que se añada al editor fija con su clase los márgenes, bordes y tipografía de sus títulos, párrafos y tablas (una clase gana a esas reglas de elemento), y se revisa con una captura tomada **después** de abrir la Ficha.

22l. **Una casilla controlada por datos del servidor no cambia al hacer clic.** «Resuelto» usaba `checked={!!c.resueltoEn}` y solo cambiaba al volver la consulta; `check()` de Playwright falló con «Clicking the checkbox did not change its state», y la persona veía la casilla inmóvil un momento.
    → **Regla:** una casilla o un conmutador que guarda en la API lleva estado local (cambia al clic y vuelve atrás si la API falla) y, al responder, se actualiza la caché con `setQueryData` en lugar de esperar a que se vuelva a consultar.

22m. **La ADR 17 decía que el aviso de `image-size` «desaparece al actualizar pptxgenjs», y era falso.**
    - La última pptxgenjs (4.0.1) sigue pidiendo `image-size ^1.2.1`, y el arreglo solo existe en la 2.0.3.
    - Además, pptxgenjs ni siquiera usa `image-size`: ningún archivo de su `dist/` la menciona.
    - Actualizar habría costado un cambio en la copia del vendor y no habría quitado el aviso.

    → **Regla:** antes de escribir que un aviso se arregla actualizando X:
    - mirar el rango vulnerable y la primera versión corregida (`gh api advisories/<GHSA>`) y compararlos con el rango que pide la última versión de X (`pnpm view X dependencies`);
    - buscar en el código publicado de X si de verdad usa la dependencia. Si no la usa, se quita con `pnpm.overrides` (`"X>dep": "-"`) en lugar de aceptarla.

22n. **Un símbolo Unicode como icono se vio como una mancha.** El «✎» delante de «Ana está editando» (barra del editor, colaboración) no está en Montserrat: el navegador lo pintó con una fuente de reserva, borroso y sin forma de lápiz. Las pruebas pasaban; se vio al ampliar la captura. En la misma tarea, un `\\|` dentro de un script pasado por heredoc llegó como `\|` y dejó una tabla Markdown con una columna de más (reincidencia de la 1).
    → **Regla:** los iconos pequeños de la interfaz se dibujan (SVG en línea o una máscara CSS con `currentColor`), no con caracteres de símbolo. Una captura con un icono nuevo se revisa ampliada. Y la 1 sigue valiendo: nada de heredoc si el contenido lleva `\`.

22o. **Dos trampas al poner la CSP obligatoria.**
    - **Un `eval` capturado también es una violación.** zod prueba `new Function` dentro de un `try` al crear cada esquema. No rompe nada, pero el navegador lo informaba en cada carga del editor y del shell. Solo se vio porque la CSP estuvo primero en modo de solo informe, con los informes recogidos.
    - **`page.evaluate` no está sujeto a `'unsafe-eval'`.** DevTools deja pasar `eval` dentro de lo que ejecuta Playwright. En modo de solo informe, el `new Function` de la prueba de control se informó; en modo obligatorio, ni se bloqueó ni se informó. La prueba parecía demostrar que `eval` estaba prohibido y no demostraba nada.

    → **Regla:**
    - Una CSP nueva empieza en `Content-Security-Policy-Report-Only`, con los informes recogidos (en la E2E, `report-uri`), y no se hace obligatoria hasta que no quede ninguno. Que las pruebas pasen no basta.
    - Las librerías que sondean `eval` se configuran para no hacerlo (zod: `jitless`, ver `apps/web/public/zod-sin-eval.js`).
    - Lo que prohíbe la CSP se prueba con código que corre la propia página (`setTimeout('…')`, un `<script>` insertado), nunca con el código de `page.evaluate`. Y siempre con un control que demuestre que la política bloquea: sin él, «cero violaciones» puede ser una CSP que no se aplica.

22p. **La herramienta de edición se comió un espacio al final del reemplazo.** Para cambiar «crítico bloquea export · » en `index.html`, el texto buscado terminaba en espacio y el nuevo también. El buscado coincidió con su espacio, pero el nuevo llegó sin él: quedó «exportar) ·<span…», pegado a la etiqueta siguiente. El build y las pruebas pasaban; se vio al revisar `git diff` con `cat -A`.
    → **Regla:** un reemplazo con la herramienta de edición no empieza ni termina en espacio: se alarga hasta un carácter visible (`· <span class=…`). Después de editar textos de interfaz, revisar el diff con los espacios a la vista (`git diff | cat -A`).

22q. **Una medición salió idéntica a la de referencia porque el editor deshizo el cambio.** Para medir con `quality()` un BPMN importado con las coordenadas de su dibujo, cambié `x`/`y` en `processiq.v1`, puse `lanes: null` y recargué. Dio exactamente lo mismo que el auto-layout: al arrancar, si hay nodos y no hay carriles, `inicio.js` vuelve a aplicar el auto-layout y pisa las coordenadas. Con los carriles presentes (lista vacía), las coordenadas del dibujo dieron 8 flechas sobre cajas.
    → **Regla:** en una comparación, un resultado idéntico al de la otra variante es sospechoso hasta demostrar que la variante se aplicó (una captura, o leer las coordenadas después). Para medir un estado guardado a mano, conservar `lanes` en lo guardado.

## Portado de código

12. **Expectativas de pruebas escritas de memoria.** Supuse que "hacer" era un verbo fuera de catálogo (es prohibido), que la ruta crítica incluía el Fin (no, la comparación es estricta) y conté nodos de un escenario que ya incluía las ramas de `ensureDecisionBranches`.
    → **Regla:** antes de afirmar cómo se comporta el MVP, leer el código o los datos, o capturar la salida real con un snapshot y revisarla.

13. **El orden de las claves importa.** El JSON exportado refleja el orden en que se crean las propiedades de cada nodo, y cada cargador de ejemplo del MVP las crea distinto.
    → **Regla:** al portar fábricas de nodos, conservar el orden exacto de las claves y la presencia de claves vacías (`marker: ''`). Por eso los ejemplos no se unificaron.

14. **Los mensajes y prompts se comparan byte a byte.** Las peticiones a Claude forman parte de la fidelidad.
    → **Regla:** los textos largos (prompts, mensajes) se extraen del código con un script que copia el texto tal cual, nunca se transcriben a mano. Después, `diff` contra el original.

15. **Valores que se leen en el momento del error, no al empezar.** El cliente de IA consulta la cancelación de la ingesta cuando falla, no cuando arranca.
    → **Regla:** al inyectar dependencias en una función portada, respetar cuándo se lee cada valor; pasar funciones (`cancelado()`) en lugar de valores capturados cuando el original lee un binding vivo.

16. **El corte automático de `app.js` separó los comentarios de final de línea** (`const X = 1;  // explicación` quedó en dos líneas). El código funcionaba igual, pero se leía mal.
    → **Regla:** en un codemod que trocea por sentencias, el comentario que está en la MISMA línea que el final de una sentencia pertenece a esa sentencia. Tras cualquier transformación automática, revisar un diff de muestra, no solo que compile y pase las pruebas.
