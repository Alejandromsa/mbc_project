# Lecciones aprendidas

Errores cometidos durante el trabajo en este repositorio y la regla que los evita. **Léelo antes de empezar** y añade una entrada cada vez que un error cueste tiempo o dé un resultado falso. Formato: qué pasó → regla.

## Herramientas y entorno (Windows)

1. **Barras invertidas en scripts incrustados en la shell.** Un script de Node pasado por heredoc desde la herramienta de shell perdió una barra: `'\\n'` llegó como `'\n'` y el código generado quedó con saltos de línea reales dentro de una cadena → error de sintaxis en `ia/motor.js`.
   → **Regla:** todo script que contenga `\` se escribe primero a un archivo con el editor (en el directorio temporal) y se ejecuta desde ahí. Tras generar código, compilar o hacer `node --check` en el acto.
   **Reincidencias:** `ingesta/texto.js` y `mining/event-log.js` (saltos reales en template literals) y `exportar/ficha.js` (el regex `/\.doc$/` quedó como `/.doc$/`). → **Antes de lanzar un heredoc, buscar `\` en su contenido; si aparece, NO usar heredoc.**

2. **`sed` con barras y regex complejas no coincidió y no avisó.** Varias sustituciones con `/` y `\s` escapados no se aplicaron.
   → **Regla:** para reemplazos exactos usar el editor. Si se usa `sed`, verificar siempre después con `grep` que el cambio está.
   **Reincidencia (portado de Word/Ficha):** un `sed` con `\\n` dentro de un script de Node partió una línea en dos y rompió el script. → **Nunca usar `sed` sobre código que contenga barras invertidas, comillas o `\n`; en esos casos, siempre el editor.**

3. **`rm -rf resultados` falló porque la shell estaba dentro de esa carpeta** ("Device or resource busy") y la cadena `&&` se cortó sin que se notara.
   → **Regla:** no hacer `cd` a carpetas de resultados. Inspeccionarlas con rutas absolutas o subshells `( … )`.

4. **`curl -w '%{http_code}' -o /dev/null` devolvió `000` en Git Bash** aunque el servidor respondía bien.
   → **Regla:** en esta máquina usar `curl -v` o `-o NUL` para ver el código real.

5. **Salida de pruebas invisible:** Vitest oculta `console.log` de las pruebas que pasan, y `/tmp` de Git Bash no es el mismo `/tmp` para Node.
   → **Regla:** para ver la salida real de una función, usar `toMatchInlineSnapshot()` con `vitest run -u` y revisar el snapshot. Si hace falta un archivo, usar rutas de Windows del directorio temporal.

5b. **`@ts-nocheck` oculta imports rotos:** `word.ts` importaba `contarTraspasos`, que no estaba exportado en el índice del dominio, y `pnpm typecheck` pasó en verde. Lo detectó el build de Vite.
   → **Regla:** tras tocar un archivo con `@ts-nocheck`, el control es el build (`pnpm fidelidad` lo incluye), no el typecheck. Al añadir una función a un paquete, exportarla en su `index.ts` en el mismo paso.

5c. **`structuredClone` en `dominio` rompió el typecheck de todos los paquetes que dependen de él**: cada paquete compila la fuente TS de sus dependencias con su propia configuración (`lib: ES2022`, sin tipos de DOM ni de Node).
   → **Regla:** los paquetes compartidos (`dominio` sobre todo) solo usan ECMAScript estándar: nada de globales del navegador ni de Node en `src/`. Tras tocar `dominio`, correr `pnpm typecheck` en la raíz, no solo en el paquete.

## Pruebas de fidelidad

6. **Verde falso por `dist` desactualizado.** Se ejecutó Playwright directamente tras un build que había fallado y las pruebas pasaron contra la versión anterior.
   → **Regla:** usar siempre `pnpm fidelidad` (hace build y luego prueba). Si se lanza Playwright a mano, comprobar antes que el build terminó sin error.

7. **Diferencias sub-píxel intermitentes en `edge-label-bg`** (dos valores que alternan). No eran del portado: la fuente de las etiquetas (Montserrat 500 y subconjuntos Unicode de Google Fonts) cargaba tarde según el timing.
   → **Regla:** si un artefacto difiere por décimas de píxel o alterna entre dos valores, sospechar primero de fuentes, transiciones o timing. Reproducir con `--repeat-each 5` antes de tocar código. El arnés carga todas las caras de Montserrat y emula `prefers-reduced-motion`.

7b. **Tras `page.reload()` las fuentes no estaban precargadas** y la app pinta desde `localStorage` antes de que el arnés pueda cargarlas: el SVG de ese primer pintado dependía del timing.
    → **Regla:** después de cada recarga, llamar a `cargarFuentes(page)`; y en el paso inmediatamente posterior a una recarga, comparar solo artefactos que no midan texto (resumen, BPMN con coordenadas).

8. **Captura a mitad de un proceso asíncrono.** Un comando del copiloto lanzaba una ingesta y la captura llegaba a los 150 ms.
   → **Regla:** tras una acción que dispara trabajo asíncrono, esperar a una condición observable (mensaje, modal, nodo) o dar margen suficiente, y verificar con repeticiones.

9. **Minificar CSS cambió los artefactos:** Lightning CSS pasa a minúsculas los colores de las variables CSS, y la app los copia a los SVG.
   → **Regla:** cualquier cambio de build o de dependencias puede alterar la salida. Pasar la fidelidad completa antes de darlo por bueno (`cssMinify: false` se queda así durante la fase 1).

10. **Escenarios que no ejercitan nada.** El primer texto de prueba del modo básico no producía actividades ("No pude extraer…"), así que la prueba pasaba sin cubrir el intérprete.
    → **Regla:** al añadir un escenario, ejecutarlo con `GUARDAR_TODO=1` y comprobar que los artefactos tienen contenido significativo (nodos, mensajes, peticiones), no solo que coinciden.

11. **Los errores de página también son comportamiento.** El export PPTX con To-Be falla en el MVP (`M_PRUNO is not defined`, ver `docs/fase1-divergencias.md`); solo se vio porque la prueba esperaba una descarga que nunca llegó.
    → **Regla:** los escenarios comparan los errores de JavaScript de ambas apps. Ante un timeout, depurar mirando `pageerror` y la consola.

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
