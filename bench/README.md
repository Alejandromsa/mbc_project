# Banco de pruebas de regresión

Mide la calidad del diagrama y del export PPTX sobre procesos **reales**, para
poder comparar versión contra versión con números en vez de con impresiones.

## Por qué existe

Hasta la v2.7 toda la calidad se validaba contra *Venta de Lotes*: 33 nodos,
3 carriles. Al contrastar ProcessIQ con los BPMN que genera **MBC Process
Disruptor** —59 a 154 nodos, hasta 29 carriles— aparecieron cuatro defectos que
ese ejemplo nunca llegaba a tocar: bandas que desbordaban la lámina, círculos de
conector fuera de la diapositiva y etiquetas empujadas por encima del título.

Un ejemplo pequeño no prueba nada sobre un proceso de cliente.

## Los fixtures NO se versionan

`bench/fixtures/` está en `.gitignore` y debe seguir estando.

> **El repositorio es público.** Los BPMN de prueba contienen detalle real de
> procesos de cliente (reclamos, contracargos, conciliación bancaria, nombres de
> sistemas internos). No los subas. Si necesitas compartir el banco, comparte el
> arnés y que cada quien ponga sus propios ficheros.

## Cómo se usa

1. Deja los `.bpmn` en `bench/fixtures/`.
2. Crea `bench/fixtures/manifest.json` con la lista de nombres:
   ```json
   ["caso-01.bpmn", "caso-02.bpmn"]
   ```
3. Abre la app, abre la consola del navegador y pega el contenido de
   `bench/harness.js`.
4. Ejecuta:
   ```js
   const r = await PIQBench.correr();
   copy(JSON.stringify(r, null, 2));   // al portapapeles, para archivar
   ```

Se puede pasar una lista explícita y un margen de espera distinto:

```js
await PIQBench.correr(['caso-01.bpmn'], 20000);
```

## Qué mide

| Métrica | Qué significa | Hacia dónde |
|---|---|---|
| `flechaSobreCaja` | flechas que atraviesan una caja en el lienzo | ↓ |
| `cruces` | cruces flecha-flecha en el lienzo | ↓ |
| `txtSobreTxt` | pares de etiquetas que se pisan en el PPTX | ↓ **debe ser 0** |
| `txtSobreFig` | etiquetas encima de una figura | ↓ **debe ser 0** |
| `fueraDeLamina` | elementos que se salen de la diapositiva | **siempre 0** |
| `usoMedio` | % del alto de lámina que ocupa el contenido | ~90 % |
| `laminas` | láminas del deck | ↓ a igualdad de lo demás |
| `fuentes` | tipografías usadas | solo *ForFuture Sans* |
| `fueraDePaleta` | colores ajenos al tema Minsait | vacío |

Un caso con `error` no importó: mira `conError` en el resumen. Un fixture de XML
inválido **debe fallar** — sirve para comprobar que el importador rechaza basura
en vez de tragarla.

## Cómo se lee un resultado

Guarda el JSON de cada corrida junto al commit correspondiente. Ante un cambio:

- Si `txtSobreTxt`, `txtSobreFig` o `fueraDeLamina` **suben**, es una regresión;
  no se despliega.
- `cruces` puede subir legítimamente si a la vez bajan las `laminas`: significa
  que cada lámina lleva más proceso. Compara `cruces / laminas`.
- `usoMedio` por encima de 100 % significa que el contenido **desborda**.

## Límite conocido

A la escala de estos procesos (100+ nodos, 13+ carriles) el export todavía deja
del orden de 150 solapamientos de texto por caso. Las cotas de la v2.7.3 evitan
que algo se salga de la lámina, pero no ordenan el flujo. La causa es el ruteo
—pendiente #3 del `HANDOFF.md`—, que en el ejemplo de 33 nodos parecía menor y a
esta escala deja de serlo.
