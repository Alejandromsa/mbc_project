/* ============================================================
 * ProcessIQ — Banco de pruebas de regresión
 *
 * Mide la calidad del diagrama y del export PPTX sobre un juego de
 * ficheros BPMN reales, para poder comparar versión contra versión en vez
 * de opinar. Nació de contrastar ProcessIQ con los BPMN generados por
 * MBC Process Disruptor (59-154 nodos, hasta 29 carriles), una escala que
 * el ejemplo propio de 33 nodos nunca llegaba a tocar.
 *
 * USO
 *   1. Deja los .bpmn en bench/fixtures/ (esa carpeta NO se versiona:
 *      suele contener procesos reales de cliente).
 *   2. Abre la app, abre la consola y pega este archivo.
 *   3. await PIQBench.correr()            // usa bench/fixtures/manifest.json
 *      await PIQBench.correr(['a.bpmn'])  // o una lista explícita
 *
 * Devuelve un objeto con una fila por fichero y un resumen. Guarda el JSON
 * y compáralo tras cada cambio: si una métrica empeora, es una regresión.
 * ============================================================ */
(function () {
  'use strict';

  var DIR = 'bench/fixtures/';
  var ALTO_UTIL = 5.35;          // alto útil de la lámina, en pulgadas
  var LAMINA_W = 13.33, LAMINA_H = 7.5;

  // ── Geometría ──────────────────────────────────────────────
  // Una caja rotada 270 grados ocupa el rectángulo con w y h intercambiados
  // sobre el mismo centro. Sin esto, el chip de rol da falsos positivos.
  function caja(p) {
    var x = p.x || 0, y = p.y || 0, w = p.w || 0, h = p.h || 0;
    if (p.rotate === 270 || p.rotate === 90) {
      var cx = x + w / 2, cy = y + h / 2;
      return { x: cx - h / 2, y: cy - w / 2, w: h, h: w };
    }
    return { x: x, y: y, w: w, h: h };
  }
  function solapan(a, b) {
    var x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    var x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    return (x2 - x > 0.02 && y2 - y > 0.02) ? (x2 - x) * (y2 - y) : 0;
  }
  function contenido(a, b) {
    return a.x >= b.x - 0.06 && a.y >= b.y - 0.06 &&
           a.x + a.w <= b.x + b.w + 0.06 && a.y + a.h <= b.y + b.h + 0.06;
  }

  // ── Medición de una presentación capturada ────────────────
  function medirPptx(pres) {
    var r = { laminas: pres.slides.length, flujo: 0, txtTxt: 0, txtFig: 0,
              fueraDeLamina: 0, uso: [], fuentes: {}, fueraDePaleta: {} };
    var PALETA = ['4F062A','260717','E3E2DA','FFFFFF','FF0054','D0CEC1','F7C29E',
                  '00B0BD','E4E3DD','44B757','F05C95','926979','A40037','E56813',
                  '8661F5','FFBAD1','FBE1CF','D9F1DD','BFFBFF','E7DFFD','F9F9F8','B8879E'];

    pres.slides.forEach(function (s) {
      var objs = s._slideObjects || [];
      // Identidad corporativa: se mide en TODAS las láminas, no solo las de flujo
      objs.forEach(function (o) {
        var p = o.options || {};
        var runs = Array.isArray(o.text) ? o.text : [];
        var fo = (runs[0] && runs[0].options) || p;
        if (p.fontFace) r.fuentes[p.fontFace] = 1;
        [p.color, p.fill && p.fill.color, p.line && p.line.color, fo.color]
          .forEach(function (c) {
            if (c && typeof c === 'string') {
              var k = c.replace('#', '').toUpperCase();
              if (PALETA.indexOf(k) < 0) r.fueraDePaleta[k] = (r.fueraDePaleta[k] || 0) + 1;
            }
          });
      });

      // Una lámina es "de flujo" si tiene una banda de carril blanca ancha
      var esFlujo = objs.some(function (o) {
        var p = o.options || {};
        return p.fill && p.fill.color === 'FFFFFF' && (p.w || 0) > 10;
      });
      if (!esFlujo) return;
      r.flujo++;

      var etiquetas = [], figuras = [], chips = [], conMasa = [];
      objs.forEach(function (o) {
        if (o._type === 'image' || o.shape === 'line') return;
        var p = o.options || {};
        var runs = Array.isArray(o.text) ? o.text : [];
        var txt = runs.map(function (q) { return q.text; }).join('');
        var R = caja(p); R.t = txt;
        var fill = p.fill && p.fill.color;

        // El chrome (antetítulo, título, pie, número) vive fuera del área de
        // dibujo por diseño: no cuenta como solape ni como fuga.
        var esChrome = R.y < 1.05 || R.y + R.h > 6.9;
        if (R.x < -0.005 || R.x + R.w > LAMINA_W + 0.01 ||
            R.y < -0.005 || R.y + R.h > LAMINA_H + 0.01) r.fueraDeLamina++;

        if (fill === 'FFFFFF' && (p.w || 0) > 10) return;   // banda de carril
        if (esChrome) return;
        if (fill === 'F7C29E') { chips.push(R); return; }    // chip de rol
        if (p.rotate === 270) { etiquetas.push(R); return; } // texto del chip
        if (o.shape === 'diamond' || o.shape === 'ellipse' || fill === 'E4E3DD') {
          figuras.push(R); conMasa.push(R); return;
        }
        if (txt) etiquetas.push(R);
      });

      if (conMasa.length) {
        var y1 = Math.min.apply(null, conMasa.map(function (f) { return f.y; }));
        var y2 = Math.max.apply(null, conMasa.map(function (f) { return f.y + f.h; }));
        r.uso.push(Math.round((y2 - y1) / ALTO_UTIL * 100));
      }
      for (var i = 0; i < etiquetas.length; i++) {
        for (var j = i + 1; j < etiquetas.length; j++) {
          if (solapan(etiquetas[i], etiquetas[j]) > 0.004) r.txtTxt++;
        }
      }
      etiquetas.forEach(function (e) {
        figuras.concat(chips).forEach(function (f) {
          if (!contenido(e, f) && solapan(e, f) > 0.004) r.txtFig++;
        });
      });
    });

    r.fuentes = Object.keys(r.fuentes);
    r.fueraDePaleta = Object.keys(r.fueraDePaleta);
    r.usoMedio = r.uso.length ? Math.round(r.uso.reduce(function (a, b) { return a + b; }, 0) / r.uso.length) : 0;
    r.usoMax = r.uso.length ? Math.max.apply(null, r.uso) : 0;
    return r;
  }

  // ── Un caso ────────────────────────────────────────────────
  function unCaso(url, esperaMs, nivel) {
    var nombre = decodeURIComponent(url.split('/').pop());
    var fila = { archivo: nombre };
    var original = PptxGenJS.prototype.writeFile;
    var errores = [];
    var onerrPrev = window.onerror;
    window.onerror = function (m) { errores.push(String(m)); };

    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (xml) {
      fila.bytes = xml.length;
      ProcessIQ.importBpmnXml(xml);
      var snap = ProcessIQ.snapshot();
      fila.nodos = snap.nodes; fila.aristas = snap.edges;
      if (!fila.nodos) throw new Error('importó 0 nodos');

      // Vista pedida. El banco medía siempre en detalle y no veía la mejora
      // que aporta colapsar: es justo donde el diagrama se vuelve presentable.
      if (nivel && nivel < 3 && ProcessIQ.nivel) {
        var pr = ProcessIQ.nivel(nivel);
        if (pr) { fila.nivel = nivel; fila.nodosEnVista = pr.nodos; }
      }
      var t0 = performance.now();
      ProcessIQ.autoFit({ silent: true });
      fila.autoFitMs = Math.round(performance.now() - t0);
      var q = ProcessIQ.quality();
      fila.lienzo = { sobreCajas: q.sobreCajas, cruces: q.cruces };

      var capturada = null;
      PptxGenJS.prototype.writeFile = function () { capturada = this; return Promise.resolve('bench'); };
      var t1 = performance.now();
      var boton = [].slice.call(document.querySelectorAll('button'))
        .filter(function (b) { return /PPTX/i.test(b.textContent); })[0];
      if (!boton) throw new Error('no encuentro el botón de export PPTX');
      boton.click();

      return new Promise(function (resolve) {
        setTimeout(function () {
          fila.pptxMs = Math.round(performance.now() - t1);
          fila.pptx = capturada ? medirPptx(capturada) : 'sin captura';
          resolve();
        }, esperaMs);
      });
    }).catch(function (e) {
      fila.error = e.message;
    }).then(function () {
      PptxGenJS.prototype.writeFile = original;
      window.onerror = onerrPrev;
      if (errores.length) fila.erroresConsola = errores;
      return fila;
    });
  }

  // ── API ────────────────────────────────────────────────────
  window.PIQBench = {
    /**
     * @param {string[]} [archivos] nombres dentro de bench/fixtures/.
     *        Si se omite, se lee bench/fixtures/manifest.json
     * @param {number}   [esperaMs] margen para que termine el export (def. 15000)
     * @param {number}   [nivel]    vista a medir: 1 ejecutivo, 2 actividad, 3 detalle (def. 3)
     */
    correr: function (archivos, esperaMs, nivel) {
      esperaMs = esperaMs || 15000;
      var lista = archivos
        ? Promise.resolve(archivos)
        : fetch(DIR + 'manifest.json').then(function (r) { return r.json(); });

      return lista.then(function (nombres) {
        var filas = [], i = 0;
        function siguiente() {
          if (i >= nombres.length) return Promise.resolve();
          var n = nombres[i++];
          console.log('[bench] ' + i + '/' + nombres.length + '  ' + n);
          return unCaso(DIR + encodeURIComponent(n), esperaMs, nivel).then(function (f) {
            filas.push(f);
            return siguiente();
          });
        }
        return siguiente().then(function () {
          var ok = filas.filter(function (f) { return !f.error && f.pptx && f.pptx.laminas; });
          var suma = function (sel) { return ok.reduce(function (a, f) { return a + sel(f); }, 0); };
          var resumen = {
            casos: filas.length,
            importados: ok.length,
            conError: filas.filter(function (f) { return f.error; })
                           .map(function (f) { return f.archivo + ': ' + f.error; }),
            nodosTotales: suma(function (f) { return f.nodos || 0; }),
            txtSobreTxt: suma(function (f) { return f.pptx.txtTxt; }),
            txtSobreFig: suma(function (f) { return f.pptx.txtFig; }),
            fueraDeLamina: suma(function (f) { return f.pptx.fueraDeLamina; }),
            flechaSobreCaja: suma(function (f) { return f.lienzo ? f.lienzo.sobreCajas : 0; }),
            cruces: suma(function (f) { return f.lienzo ? f.lienzo.cruces : 0; }),
            laminas: suma(function (f) { return f.pptx.laminas; }),
            usoMedio: ok.length ? Math.round(suma(function (f) { return f.pptx.usoMedio; }) / ok.length) : 0
          };
          console.table(filas.map(function (f) {
            return {
              archivo: f.archivo.slice(0, 34),
              nodos: f.nodos, error: f.error || '',
              flechaSobreCaja: f.lienzo && f.lienzo.sobreCajas,
              cruces: f.lienzo && f.lienzo.cruces,
              laminas: f.pptx && f.pptx.laminas,
              txtTxt: f.pptx && f.pptx.txtTxt,
              txtFig: f.pptx && f.pptx.txtFig,
              fuera: f.pptx && f.pptx.fueraDeLamina,
              usoMedio: f.pptx && f.pptx.usoMedio
            };
          }));
          console.log('[bench] RESUMEN', resumen);
          resumen.nivel = nivel || 3;
          return { version: (document.querySelector('script[src*="app.js"]') || {}).src || '?',
                   resumen: resumen, filas: filas };
        });
      });
    }
  };

  console.log('[bench] listo. Ejecuta:  await PIQBench.correr()');
})();
