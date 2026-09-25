// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $, canvas, canvasHint, edgesLayer, laneHeadersLayer, nodesLayer, swimlanesLayer } from '../dom.js';
import { state } from '../estado.js';
import { abrirPanel, cerrarPanel } from '../paneles/cajon.js';
import { renderPains } from '../paneles/pains.js';
import { renderProperties } from '../paneles/propiedades.js';
import { persist } from '../persistencia.js';
import { runLinter } from '../validacion/lint.js';
import { addEdge, getNode, svgPoint, updateStickyHeaders } from './interaccion.js';
import { LOOP_GAP, invalidarRutas, loopCorridors, smartEdgePath } from './ruteo.js';

// =================== RENDER ===================
function render() {
  // Panel contextual: se abre solo al seleccionar algo y se cierra solo al
  // deseleccionar, SI fue él quien lo abrió. Si el usuario lo abrió a mano
  // desde el riel, se queda. Así el lienzo ocupa todo el ancho en reposo.
  const selAhora = state.selectedNodeId || state.selectedEdgeId || null;
  if (selAhora && selAhora !== state._selPrev) abrirPanel('properties', true);
  else if (!selAhora && state._selPrev && state._panelAuto) cerrarPanel();
  state._selPrev = selAhora;

  nodesLayer.innerHTML = '';
  edgesLayer.innerHTML = '';
  swimlanesLayer.innerHTML = '';
  laneHeadersLayer.innerHTML = '';

  // Render de swimlanes (carreteras) si están definidas
  if (state._lanes && state._lanes.list.length > 0) {
    const L = state._lanes;
    const ns = 'http://www.w3.org/2000/svg';
    // En modo envolvente el bloque de carriles se repite en cada banda
    const bandCount = Math.max(1, L.bands || 1);
    const bandH = L.bandH || (L.list.length * L.laneH + 70);
    // Alturas por carril (v3.8.3); un snapshot viejo sin laneHs cae en el fijo
    const altoDe = (idx) => (L.laneHs && L.laneHs[idx]) || L.laneH;
    const topDe = (idx) => (L.laneTops && L.laneTops[idx] != null) ? L.laneTops[idx] : idx * L.laneH;
    for (let band = 0; band < bandCount; band++) {
    // Ancho de esta banda: cubre sus propios nodos
    let maxRight = L.padX + L.headerW + L.innerPadL + 240;
    state.nodes.forEach(n => {
      if ((n._band || 0) !== band) return;
      maxRight = Math.max(maxRight, n.x + n.w + 40);
    });
    const lanesWidth = maxRight - L.padX;

    L.list.forEach((laneName, idx) => {
      const y = L.padY + band * bandH + topDe(idx);
      const lh = altoDe(idx);

      // ===== Capa fondo (bg + separadores) =====
      const bg = document.createElementNS(ns, 'rect');
      bg.setAttribute('x', L.padX);
      bg.setAttribute('y', y);
      bg.setAttribute('width', lanesWidth);
      bg.setAttribute('height', lh);
      bg.setAttribute('fill', idx % 2 === 0 ? 'rgba(247, 247, 247, 0.45)' : 'rgba(255, 255, 255, 0.0)');
      bg.setAttribute('stroke', '#E5E5E5');
      bg.setAttribute('stroke-width', '1');
      swimlanesLayer.appendChild(bg);

      // ===== Capa headers (sticky — se traslada con scroll) =====
      // Header background (con shadow para destacarse cuando scroll)
      const header = document.createElementNS(ns, 'rect');
      header.setAttribute('x', L.padX);
      header.setAttribute('y', y);
      header.setAttribute('width', L.headerW);
      header.setAttribute('height', lh);
      header.setAttribute('fill', '#FFFFFF');
      header.setAttribute('stroke', '#D6D6D6');
      header.setAttribute('stroke-width', '1');
      header.setAttribute('filter', 'drop-shadow(2px 0 4px rgba(0,0,0,0.08))');
      laneHeadersLayer.appendChild(header);

      // Acento color
      const accent = document.createElementNS(ns, 'rect');
      accent.setAttribute('x', L.padX);
      accent.setAttribute('y', y);
      accent.setAttribute('width', 4);
      accent.setAttribute('height', lh);
      accent.setAttribute('fill', laneColor(laneName, idx));
      laneHeadersLayer.appendChild(accent);

      // Texto del rol — wrap si es largo
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', L.padX + L.headerW / 2 + 2);
      label.setAttribute('y', y + lh / 2);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-family', "'Inter', -apple-system, sans-serif");
      label.setAttribute('font-size', '12');
      label.setAttribute('font-weight', '600');
      label.setAttribute('fill', '#3A3A3A');
      label.setAttribute('text-rendering', 'geometricPrecision');
      const words = laneName.split(' ');
      if (laneName.length > 14 && words.length > 1) {
        const mid = Math.ceil(words.length / 2);
        const line1 = words.slice(0, mid).join(' ');
        const line2 = words.slice(mid).join(' ');
        const t1 = document.createElementNS(ns, 'tspan');
        t1.setAttribute('x', L.padX + L.headerW / 2 + 2);
        t1.setAttribute('dy', '-0.5em');
        t1.textContent = line1;
        const t2 = document.createElementNS(ns, 'tspan');
        t2.setAttribute('x', L.padX + L.headerW / 2 + 2);
        t2.setAttribute('dy', '1.2em');
        t2.textContent = line2;
        label.appendChild(t1);
        label.appendChild(t2);
      } else {
        label.textContent = laneName;
      }
      laneHeadersLayer.appendChild(label);
    });
    }   // fin bandas

    // Activa sticky: traslada laneHeadersLayer en X según scrollLeft
    updateStickyHeaders();
  }

  // Edges. Los paths se cachean por arista para que repintar sea gratis, PERO
  // la caché sólo se invalidaba en autoLayout(): al arrastrar una caja a mano
  // las flechas se quedaban en el aire (regresión de la v2.8). Cualquier
  // cambio de geometría —arrastre, undo, resize, edición— invalida las rutas.
  const firmaGeom = state.nodes.map(n => n.id + ':' + (n.x | 0) + ',' + (n.y | 0) + ',' + (n.w | 0) + ',' + (n.h | 0)).join('|');
  if (firmaGeom !== state._firmaGeom) { state._firmaGeom = firmaGeom; invalidarRutas(); }
  state.edges.forEach(e => {
    const a = getNode(e.from), b = getNode(e.to);
    if (!a || !b) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', smartEdgePath(a, b, e));
    // Message flow (punteado) si cruza lanes/responsables distintos; sequence flow (sólido) si no
    const laneOfA = state._lanes?.laneOf?.[a.id];
    const laneOfB = state._lanes?.laneOf?.[b.id];
    const isMessageFlow = laneOfA && laneOfB && laneOfA !== laneOfB &&
                          a.type !== 'start' && b.type !== 'end';
    path.setAttribute('class', 'edge-path' +
      (isMessageFlow ? ' edge-message' : '') +
      (e.id === state.selectedEdgeId ? ' selected' : ''));
    path.setAttribute('marker-end', isMessageFlow ? 'url(#arrow-open)' : 'url(#arrow)');
    path.addEventListener('click', ev => {
      ev.stopPropagation();
      state.selectedEdgeId = e.id;
      state.selectedNodeId = null;
      render();
    });
    path.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      const v = prompt('Etiqueta de la conexión (ej. "Sí", "No", "Aprobado", o frecuencia):', e.label || '');
      if (v !== null) { e.label = v.trim(); persist(); render(); }
    });
    // Capa invisible más ancha para facilitar el click (hit area)
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', path.getAttribute('d'));
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '12');
    hit.style.cursor = 'pointer';
    hit.addEventListener('click', ev => {
      ev.stopPropagation();
      state.selectedEdgeId = e.id;
      state.selectedNodeId = null;
      render();
    });
    hit.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      const v = prompt('Etiqueta de la conexión:', e.label || '');
      if (v !== null) { e.label = v.trim(); persist(); render(); }
    });
    edgesLayer.appendChild(hit);
    edgesLayer.appendChild(path);

    if (e.label) {
      const lp = edgeLabelPoint(a, b, e);
      const mx = lp.x, my = lp.y;
      const nsv = 'http://www.w3.org/2000/svg';
      const txt = document.createElementNS(nsv, 'text');
      txt.setAttribute('x', mx);
      txt.setAttribute('y', my - 4);
      txt.setAttribute('class', 'edge-label');
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = e.label;
      edgesLayer.appendChild(txt);
      // Fondo "pill" para legibilidad (insertado DETRÁS del texto, medido con getBBox)
      try {
        const bb = txt.getBBox();
        const padX = 4, padY = 1.5;
        const pill = document.createElementNS(nsv, 'rect');
        pill.setAttribute('x', bb.x - padX);
        pill.setAttribute('y', bb.y - padY);
        pill.setAttribute('width', bb.width + padX * 2);
        pill.setAttribute('height', bb.height + padY * 2);
        pill.setAttribute('rx', '4');
        pill.setAttribute('class', 'edge-label-bg');
        edgesLayer.insertBefore(pill, txt);
      } catch (_) { /* getBBox puede fallar si no está en layout */ }
    }
  });

  // Nodes
  state.nodes.forEach(n => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    // Heatmap: clasifica por max score de pains
    let painClass = '';
    if (n.pains && n.pains.length > 0) {
      const maxScore = Math.max(...n.pains.map(p => p.severity * p.frequency));
      if (maxScore >= 16) painClass = ' pain-high';
      else if (maxScore >= 9) painClass = ' pain-med';
      else painClass = ' pain-low';
    }
    g.setAttribute('class', 'node-group' +
      (n.id === state.selectedNodeId ? ' selected' : '') +
      (n.id === state.connectSourceId ? ' connect-source' : '') +
      (n.id === state._bottleneckId ? ' bottleneck' : '') +
      painClass);
    g.setAttribute('transform', `translate(${n.x},${n.y})`);

    const shape = createShape(n);
    shape.setAttribute('class', 'node-shape');
    g.appendChild(shape);

    const ns = 'http://www.w3.org/2000/svg';
    const isTask = (n.type === 'task' || n.type === 'system');
    const exec = isTask ? (window.EXECUTION_TYPES || []).find(t => t.id === n.executionType) : null;

    // ─────────── EVENTOS (start/intermediate/end): icono de subtipo BPMN + label ───────────
    if (n.type === 'start' || n.type === 'end' || n.type === 'intermediate') {
      const cx = n.w / 2, cy = n.h / 2;
      const ev = n.eventType || 'none';
      const stroke = n.type === 'start' ? '#2E7D32' : (n.type === 'end' ? '#B91C1C' : '#B45309');
      // Catch (start / intermediate catch) = icono outline; Throw (end / intermediate throw) = icono relleno
      const filled = n.type === 'end' || n.throw === true;
      const evGlyphs = {
        message: 'M -7 -5 H 7 V 5 H -7 Z M -7 -5 L 0 1 L 7 -5',
        timer:   'M 0 -8 A 8 8 0 1 1 0 8 A 8 8 0 1 1 0 -8 M 0 -4 V 0 L 3 2',
        error:   'M -6 6 L -2 -3 L 1 1 L 5 -6',
        signal:  'M 0 -7 L 7 6 H -7 Z'
      };
      if (n.type === 'end' && n.terminate) {
        // Evento de terminación BPMN: disco relleno (termina toda la instancia)
        const disc = document.createElementNS(ns, 'circle');
        disc.setAttribute('cx', cx); disc.setAttribute('cy', cy);
        disc.setAttribute('r', Math.min(cx, cy) - 7);
        disc.setAttribute('fill', stroke);
        g.appendChild(disc);
        const tt = document.createElementNS(ns, 'title');
        tt.textContent = 'Evento de terminación (fin inmediato de la instancia)';
        g.appendChild(tt);
      } else if (ev !== 'none' && evGlyphs[ev]) {
        const ic = document.createElementNS(ns, 'path');
        ic.setAttribute('d', evGlyphs[ev]);
        ic.setAttribute('transform', `translate(${cx},${cy})`);
        ic.setAttribute('fill', (filled && (ev === 'message' || ev === 'signal')) ? stroke : 'none');
        ic.setAttribute('stroke', stroke);
        ic.setAttribute('stroke-width', ev === 'timer' ? '1.4' : '1.8');
        ic.setAttribute('stroke-linecap', 'round');
        ic.setAttribute('stroke-linejoin', 'round');
        g.appendChild(ic);
      } else {
        const lbl = document.createElementNS(ns, 'text');
        lbl.setAttribute('x', cx); lbl.setAttribute('y', cy);
        lbl.setAttribute('class', 'node-label'); lbl.setAttribute('font-size', '13');
        lbl.textContent = n.type === 'start' ? '▶' : (n.type === 'end' ? '■' : '◇');
        g.appendChild(lbl);
      }
      const sub = document.createElementNS(ns, 'text');
      sub.setAttribute('x', cx); sub.setAttribute('y', n.h + 13);
      sub.setAttribute('class', 'node-label'); sub.setAttribute('font-size', '10.5');
      sub.textContent = truncate(n.label, 26);
      g.appendChild(sub);
    }
    // ─────────── GATEWAY BPMN: marcador (X/+/O) + label ───────────
    else if (n.type === 'decision') {
      const gw = n.gatewayType || 'exclusive';
      if (gw === 'parallel' || gw === 'inclusive') {
        // Marcador grande al centro del rombo + label DEBAJO (estilo BPMN)
        const mk = document.createElementNS(ns, 'g');
        mk.setAttribute('transform', `translate(${n.w / 2}, ${n.h / 2})`);
        if (gw === 'parallel') {
          const plus = document.createElementNS(ns, 'path');
          plus.setAttribute('d', 'M -10 0 H 10 M 0 -10 V 10');
          plus.setAttribute('stroke', '#C68400'); plus.setAttribute('stroke-width', '3.5');
          plus.setAttribute('stroke-linecap', 'round'); plus.setAttribute('fill', 'none');
          mk.appendChild(plus);
        } else {
          const circ = document.createElementNS(ns, 'circle');
          circ.setAttribute('r', '9'); circ.setAttribute('fill', 'none');
          circ.setAttribute('stroke', '#C68400'); circ.setAttribute('stroke-width', '3');
          mk.appendChild(circ);
        }
        g.appendChild(mk);
        const sub = document.createElementNS(ns, 'text');
        sub.setAttribute('x', n.w / 2); sub.setAttribute('y', n.h + 13);
        sub.setAttribute('class', 'node-label'); sub.setAttribute('font-size', '10.5');
        sub.textContent = truncate(n.label, 30);
        g.appendChild(sub);
      } else {
        // Exclusivo: X sutil al fondo + label dentro
        const xMk = document.createElementNS(ns, 'path');
        xMk.setAttribute('d', `M ${n.w/2-7} ${n.h/2-7} L ${n.w/2+7} ${n.h/2+7} M ${n.w/2+7} ${n.h/2-7} L ${n.w/2-7} ${n.h/2+7}`);
        xMk.setAttribute('stroke', '#E0B84D'); xMk.setAttribute('stroke-width', '2.5');
        xMk.setAttribute('stroke-linecap', 'round'); xMk.setAttribute('fill', 'none');
        xMk.setAttribute('opacity', '0.45');
        g.appendChild(xMk);
        wrapLabelInto(g, n.label, n.w / 2, n.h / 2, n.w - 18, 10.5, 3);
      }
    }
    // ─────────── TAREAS: marcador BPMN + código + label envuelto ───────────
    else if (isTask) {
      // Marcador BPMN top-left (icono de línea)
      if (exec) {
        const mk = document.createElementNS(ns, 'g');
        mk.setAttribute('class', 'bpmn-marker');
        mk.setAttribute('transform', 'translate(6, 6)');
        const icon = document.createElementNS(ns, 'path');
        icon.setAttribute('d', exec.marker || exec.glyph);
        icon.setAttribute('fill', exec.filled ? exec.stroke : 'none');
        icon.setAttribute('stroke', exec.stroke || exec.color);
        icon.setAttribute('stroke-width', '1.1');
        icon.setAttribute('stroke-linecap', 'round');
        icon.setAttribute('stroke-linejoin', 'round');
        mk.appendChild(icon);
        const ttl = document.createElementNS(ns, 'title');
        ttl.textContent = exec.bpmn + ' — ' + exec.desc;
        mk.appendChild(ttl);
        g.appendChild(mk);
      }
      // Código de actividad (top-left, después del marcador)
      if (n.activityCode) {
        const code = document.createElementNS(ns, 'text');
        code.setAttribute('x', exec ? 26 : 8);
        code.setAttribute('y', 15);
        code.setAttribute('class', 'node-code');
        code.setAttribute('fill', exec ? exec.color : '#6B7280');
        code.textContent = '[' + n.activityCode + ']';
        g.appendChild(code);
      }
      // Label envuelto, centrado en el espacio inferior
      wrapLabelInto(g, n.label, n.w / 2, (n.h + 18) / 2 + 6, n.w - 16, 11, 3);
      // Marcador de actividad BPMN (base, centrado abajo): subproceso ＋, loop ↻, multi-instancia ‖
      if (n.marker && n.marker !== 'none') {
        const am = document.createElementNS(ns, 'g');
        am.setAttribute('class', 'bpmn-activity-marker');
        am.setAttribute('transform', `translate(${n.w / 2 - 7}, ${n.h - 17})`);
        const mp = document.createElementNS(ns, 'path');
        mp.setAttribute('fill', 'none');
        mp.setAttribute('stroke', '#5B6472');
        mp.setAttribute('stroke-width', '1.4');
        mp.setAttribute('stroke-linecap', 'round');
        let d = '', boxed = true, mt = '';
        if (n.marker === 'subprocess') {            // ＋ en caja → subproceso colapsado
          d = 'M 7 3 V 11 M 3 7 H 11'; mt = 'Subproceso (colapsado)';
        } else if (n.marker === 'loop') {           // ↻ → actividad cíclica
          d = 'M 11 5 A 4.5 4.5 0 1 0 11.5 9 M 11 2 V 5 H 8'; boxed = false; mt = 'Actividad de loop';
        } else if (n.marker === 'multiinstance') {  // ‖‖‖ paralelo
          d = 'M 3 3 V 11 M 7 3 V 11 M 11 3 V 11'; boxed = false; mt = 'Multi-instancia (paralela)';
        } else if (n.marker === 'multiinstance-seq') { // ≡ secuencial
          d = 'M 3 4 H 11 M 3 7 H 11 M 3 10 H 11'; boxed = false; mt = 'Multi-instancia (secuencial)';
        }
        if (boxed) {
          const box = document.createElementNS(ns, 'rect');
          box.setAttribute('x', '0'); box.setAttribute('y', '0');
          box.setAttribute('width', '14'); box.setAttribute('height', '14');
          box.setAttribute('rx', '1.5'); box.setAttribute('fill', 'none');
          box.setAttribute('stroke', '#5B6472'); box.setAttribute('stroke-width', '1.2');
          am.appendChild(box);
        }
        mp.setAttribute('d', d);
        am.appendChild(mp);
        const mtt = document.createElementNS(ns, 'title');
        mtt.textContent = mt;
        am.appendChild(mtt);
        g.appendChild(am);
      }
      // Evento de borde BPMN (boundary): círculo pequeño sobre el borde de la tarea.
      // Anillo simple = interrumpe; anillo punteado = no interrumpe. Glyph timer/error/message.
      if (n.boundary) {
        const bt = typeof n.boundary === 'string' ? n.boundary : (n.boundary.type || 'timer');
        const interrupting = (typeof n.boundary === 'object') ? n.boundary.interrupting !== false : true;
        const br = 11, bcx = 10, bcy = n.h - 3;   // esquina inferior izquierda (libre de pain/marcador), sobre el borde
        const bg = document.createElementNS(ns, 'g');
        bg.setAttribute('class', 'bpmn-boundary');
        const outer = document.createElementNS(ns, 'circle');
        outer.setAttribute('cx', bcx); outer.setAttribute('cy', bcy); outer.setAttribute('r', br);
        outer.setAttribute('fill', '#FEF7E0'); outer.setAttribute('stroke', '#B45309'); outer.setAttribute('stroke-width', '1.4');
        if (!interrupting) outer.setAttribute('stroke-dasharray', '3 2');
        bg.appendChild(outer);
        const inner = document.createElementNS(ns, 'circle');
        inner.setAttribute('cx', bcx); inner.setAttribute('cy', bcy); inner.setAttribute('r', br - 3);
        inner.setAttribute('fill', 'none'); inner.setAttribute('stroke', '#B45309'); inner.setAttribute('stroke-width', '1');
        if (!interrupting) inner.setAttribute('stroke-dasharray', '3 2');
        bg.appendChild(inner);
        const bGlyphs = {
          timer:   'M 0 -5 A 5 5 0 1 1 0 5 A 5 5 0 1 1 0 -5 M 0 -3 V 0 L 2 1.5',
          error:   'M -4 4 L -1.3 -2 L 0.7 0.7 L 3.3 -4',
          message: 'M -4.5 -3 H 4.5 V 3 H -4.5 Z M -4.5 -3 L 0 0.7 L 4.5 -3'
        };
        const bp = document.createElementNS(ns, 'path');
        bp.setAttribute('d', bGlyphs[bt] || bGlyphs.timer);
        bp.setAttribute('transform', `translate(${bcx},${bcy})`);
        bp.setAttribute('fill', 'none'); bp.setAttribute('stroke', '#B45309');
        bp.setAttribute('stroke-width', bt === 'timer' ? '1' : '1.3');
        bp.setAttribute('stroke-linecap', 'round'); bp.setAttribute('stroke-linejoin', 'round');
        bg.appendChild(bp);
        const btt = document.createElementNS(ns, 'title');
        btt.textContent = 'Evento de borde ' + (interrupting ? '(interrumpe)' : '(no interrumpe)') + ' — ' + bt;
        bg.appendChild(btt);
        g.appendChild(bg);
      }
    }
    // ─────────── DOCUMENTO / DATA: label centrado ───────────
    else {
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', n.w / 2);
      lbl.setAttribute('y', n.h / 2 - 4);
      lbl.setAttribute('class', 'node-label');
      lbl.textContent = truncate(n.label, 20);
      g.appendChild(lbl);
    }

    // Meta debajo del nodo: responsable · sistema
    if (n.owner && n.type !== 'start' && n.type !== 'end' && n.type !== 'intermediate') {
      const meta = document.createElementNS(ns, 'text');
      meta.setAttribute('x', n.w / 2);
      meta.setAttribute('y', n.h + 12);
      meta.setAttribute('class', 'node-meta');
      meta.textContent = n.owner + (n.system ? ' · ' + n.system : '');
      g.appendChild(meta);
    }

    // Badge de owner inferido → esquina superior DERECHA (alerta validación manual)
    if (n._inferredOwner && (isTask || n.type === 'decision')) {
      const alertG = document.createElementNS(ns, 'g');
      alertG.setAttribute('class', 'owner-alert-badge');
      alertG.setAttribute('transform', `translate(${n.w - 18}, 4)`);
      const circ = document.createElementNS(ns, 'circle');
      circ.setAttribute('cx', 7); circ.setAttribute('cy', 7); circ.setAttribute('r', 7);
      circ.setAttribute('fill', '#B45309');
      circ.setAttribute('stroke', '#FFFFFF');
      circ.setAttribute('stroke-width', '1.5');
      alertG.appendChild(circ);
      const tri = document.createElementNS(ns, 'path');
      tri.setAttribute('d', 'M 7 3 L 11 10 L 3 10 Z M 7 5.5 V 7.5 M 7 8.5 V 8.8');
      tri.setAttribute('fill', 'none');
      tri.setAttribute('stroke', '#FFFFFF');
      tri.setAttribute('stroke-width', '1.2');
      tri.setAttribute('stroke-linecap', 'round');
      tri.setAttribute('stroke-linejoin', 'round');
      alertG.appendChild(tri);
      const title = document.createElementNS(ns, 'title');
      title.textContent = `Responsable inferido: "${state._lanes?.laneOf?.[n.id] || ''}" — validar manualmente`;
      alertG.appendChild(title);
      g.appendChild(alertG);
    }

    // Badge de pains → esquina inferior derecha
    if (n.pains && n.pains.length > 0) {
      const badge = document.createElementNS(ns, 'g');
      const cx = n.w - 9, cy = n.h - 9;
      const circ = document.createElementNS(ns, 'circle');
      circ.setAttribute('cx', cx); circ.setAttribute('cy', cy); circ.setAttribute('r', 9);
      circ.setAttribute('fill', '#FF0054');
      circ.setAttribute('stroke', '#FFFFFF');
      circ.setAttribute('stroke-width', '1.5');
      badge.appendChild(circ);
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', cx); txt.setAttribute('y', cy);
      txt.setAttribute('class', 'node-pain-badge');
      txt.textContent = n.pains.length;
      badge.appendChild(txt);
      g.appendChild(badge);
    }

    // Badge de cuello de botella (F3) — esquina inferior izquierda
    if (n.id === state._bottleneckId) {
      const b = document.createElementNS(ns, 'g');
      b.setAttribute('transform', `translate(4, ${n.h - 20})`);
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('width', 64); r.setAttribute('height', 16); r.setAttribute('rx', 3);
      r.setAttribute('fill', '#B91C1C');
      b.appendChild(r);
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', 32); t.setAttribute('y', 8);
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('font-size', '9'); t.setAttribute('font-weight', '700'); t.setAttribute('fill', '#fff');
      t.textContent = '⛔ CUELLO';
      b.appendChild(t);
      g.appendChild(b);
    }

    g.addEventListener('mousedown', ev => {
      ev.stopPropagation();
      if (state.mode === 'connect') {
        if (!state.connectSourceId) {
          state.connectSourceId = n.id;
          render();
        } else {
          addEdge(state.connectSourceId, n.id);
          state.connectSourceId = null;
          render();
        }
        return;
      }
      state.selectedNodeId = n.id;
      state.selectedEdgeId = null;
      const pt = svgPoint(ev.clientX, ev.clientY);
      state.drag = { id: n.id, offsetX: pt.x - n.x, offsetY: pt.y - n.y };
      render();
    });

    g.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      // Edición rápida de etiqueta del nodo
      const v = prompt('Etiqueta del nodo:', n.label || '');
      if (v !== null) { n.label = v.trim(); persist(); render(); }
    });

    nodesLayer.appendChild(g);
  });

  // Hint
  canvasHint.style.display = state.nodes.length === 0 ? 'block' : 'none';

  // Ajusta dimensiones del SVG al bounding box del contenido (con padding) para habilitar scroll
  const wrapperRect = $('#canvasWrapper').getBoundingClientRect();
  let needW = wrapperRect.width, needH = wrapperRect.height;
  if (state.nodes.length > 0) {
    const padding = 120;
    let maxX = 0, maxY = 0;
    state.nodes.forEach(n => {
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h + 20);
    });
    needW = Math.max(needW, maxX + padding);
    needH = Math.max(needH, maxY + padding);
  }
  // Guarda extensión de contenido para el zoom-to-fit
  state._contentW = needW; state._contentH = needH;
  const zoom = state.zoom || 1;
  // viewBox en unidades de contenido; width/height escalados por zoom → SVG escala el dibujo.
  // getScreenCTM refleja esta escala, por lo que svgPoint (matriz) sigue siendo exacto.
  canvas.setAttribute('viewBox', `0 0 ${needW} ${needH}`);
  canvas.setAttribute('width', needW * zoom);
  canvas.setAttribute('height', needH * zoom);
  canvas.style.minWidth = (needW * zoom) + 'px';
  canvas.style.minHeight = (needH * zoom) + 'px';
  // El grid background necesita cubrir todo el SVG (en unidades de contenido)
  const gridBg = $('#gridBg');
  if (gridBg) { gridBg.setAttribute('width', needW); gridBg.setAttribute('height', needH); }

  // Status
  $('#statusNodes').textContent = `${state.nodes.length} nodos`;
  $('#statusEdges').textContent = `${state.edges.length} conexiones`;

  renderProperties();
  renderPains();
  runLinter();
}

function createShape(n) {
  const ns = 'http://www.w3.org/2000/svg';
  let el;
  switch (n.type) {
    case 'start':
      el = document.createElementNS(ns, 'ellipse');
      el.setAttribute('cx', n.w / 2); el.setAttribute('cy', n.h / 2);
      el.setAttribute('rx', n.w / 2); el.setAttribute('ry', n.h / 2);
      el.setAttribute('fill', getCss('--node-start-fill'));
      el.setAttribute('stroke', getCss('--node-start-stroke'));
      el.setAttribute('stroke-width', 2);
      break;
    case 'end':
      el = document.createElementNS(ns, 'ellipse');
      el.setAttribute('cx', n.w / 2); el.setAttribute('cy', n.h / 2);
      el.setAttribute('rx', n.w / 2); el.setAttribute('ry', n.h / 2);
      el.setAttribute('fill', getCss('--node-end-fill'));
      el.setAttribute('stroke', getCss('--node-end-stroke'));
      el.setAttribute('stroke-width', 3);
      break;
    case 'intermediate': {
      // Evento intermedio BPMN: doble anillo
      el = document.createElementNS(ns, 'g');
      const outer = document.createElementNS(ns, 'circle');
      outer.setAttribute('cx', n.w / 2); outer.setAttribute('cy', n.h / 2); outer.setAttribute('r', n.w / 2);
      outer.setAttribute('fill', '#FEF7E0'); outer.setAttribute('stroke', '#B45309'); outer.setAttribute('stroke-width', 1.8);
      const inner = document.createElementNS(ns, 'circle');
      inner.setAttribute('cx', n.w / 2); inner.setAttribute('cy', n.h / 2); inner.setAttribute('r', n.w / 2 - 4);
      inner.setAttribute('fill', 'none'); inner.setAttribute('stroke', '#B45309'); inner.setAttribute('stroke-width', 1.5);
      el.appendChild(outer); el.appendChild(inner);
      break;
    }
    case 'decision':
      el = document.createElementNS(ns, 'polygon');
      el.setAttribute('points', `${n.w/2},0 ${n.w},${n.h/2} ${n.w/2},${n.h} 0,${n.h/2}`);
      el.setAttribute('fill', getCss('--node-decision-fill'));
      el.setAttribute('stroke', getCss('--node-decision-stroke'));
      el.setAttribute('stroke-width', 1.5);
      break;
    case 'document':
      el = document.createElementNS(ns, 'path');
      el.setAttribute('d', `M 0 0 L ${n.w} 0 L ${n.w} ${n.h-10} Q ${n.w*0.75} ${n.h+6} ${n.w/2} ${n.h-6} Q ${n.w*0.25} ${n.h-18} 0 ${n.h-6} Z`);
      el.setAttribute('fill', getCss('--node-doc-fill'));
      el.setAttribute('stroke', getCss('--node-doc-stroke'));
      el.setAttribute('stroke-width', 1.5);
      break;
    case 'data':
      el = document.createElementNS(ns, 'path');
      el.setAttribute('d', `M 15 0 L ${n.w} 0 L ${n.w-15} ${n.h} L 0 ${n.h} Z`);
      el.setAttribute('fill', getCss('--node-data-fill'));
      el.setAttribute('stroke', getCss('--node-data-stroke'));
      el.setAttribute('stroke-width', 1.5);
      break;
    case 'system':
      el = document.createElementNS(ns, 'rect');
      el.setAttribute('width', n.w); el.setAttribute('height', n.h);
      el.setAttribute('rx', 3); el.setAttribute('ry', 3);
      el.setAttribute('fill', getCss('--node-system-fill'));
      el.setAttribute('stroke', getCss('--node-system-stroke'));
      el.setAttribute('stroke-width', 1.5);
      el.setAttribute('stroke-dasharray', '4 3');
      break;
    case 'task':
    default:
      el = document.createElementNS(ns, 'rect');
      el.setAttribute('width', n.w); el.setAttribute('height', n.h);
      el.setAttribute('rx', 6); el.setAttribute('ry', 6);
      // Modo mapa de valor Lean (F5): tinta por VA/BVA/NVA. Si no, tinte por tipo de ejecución.
      let fill = getCss('--node-task-fill');
      if (state._valueMode) {
        fill = n.va === 'VA' ? '#DCFCE7' : (n.va === 'BVA' ? '#FEF3C7' : (n.va === 'NVA' ? '#FEE2E2' : '#F3F4F6'));
      } else if (n.executionType) {
        const exec = (window.EXECUTION_TYPES || []).find(t => t.id === n.executionType);
        if (exec) fill = exec.tint;
      }
      el.setAttribute('fill', fill);
      el.setAttribute('stroke', getCss('--node-task-stroke'));
      el.setAttribute('stroke-width', 1.5);
  }
  return el;
}

function nodeCenter(n) {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

function orthoPath(p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    const mx = p1.x + dx / 2;
    return `M ${p1.x} ${p1.y} L ${mx} ${p1.y} L ${mx} ${p2.y} L ${p2.x} ${p2.y}`;
  } else {
    const my = p1.y + dy / 2;
    return `M ${p1.x} ${p1.y} L ${p1.x} ${my} L ${p2.x} ${my} L ${p2.x} ${p2.y}`;
  }
}

// Punto medio real del recorrido (para colocar la etiqueta sin pisar cajas)
function edgeLabelPoint(a, b, edge) {
  const ac = nodeCenter(a), bc = nodeCenter(b);
  const forward = b.x >= a.x + a.w - 4;
  const backward = (b.x + b.w) <= (a.x + 4);
  if (forward) {
    const fx = a.x + a.w, tx = b.x;
    const mx = fx + (tx - fx) / 2;
    // si hay codo, la etiqueta va en el tramo horizontal de salida
    return Math.abs(ac.y - bc.y) < 2
      ? { x: mx, y: ac.y }
      : { x: fx + (mx - fx) / 2, y: ac.y };
  }
  if (backward) {
    const y = (loopCorridors()[edge && edge.id]) || (Math.max(a.y + a.h, b.y + b.h) + LOOP_GAP);
    return { x: (ac.x + bc.x) / 2, y };
  }
  return { x: (ac.x + bc.x) / 2, y: (ac.y + bc.y) / 2 };
}

function getCss(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function truncate(s, n) { return !s ? '' : (s.length > n ? s.slice(0, n - 1) + '…' : s); }

// Envuelve texto en varias líneas dentro de un <text> centrado en (cx, cy).
// maxW = ancho disponible en px; charPx ≈ ancho medio de carácter a fontSize 11 ≈ 6px.
function wrapLabelInto(g, text, cx, cy, maxW, fontSize, maxLines) {
  const ns = 'http://www.w3.org/2000/svg';
  text = (text || '').trim();
  const charPx = fontSize * 0.55;
  const maxChars = Math.max(6, Math.floor(maxW / charPx));
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; }
    else if ((cur + ' ' + w).length <= maxChars) { cur += ' ' + w; }
    else { lines.push(cur); cur = w; }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // Si quedó texto fuera, añade elipsis a la última línea
  if (lines.length === maxLines) {
    const used = lines.join(' ').length;
    if (used < text.length) {
      let last = lines[maxLines - 1];
      if (last.length > maxChars - 1) last = last.slice(0, maxChars - 1);
      lines[maxLines - 1] = last.replace(/\s*\S*$/, '') + '…';
    }
  }
  const lineH = fontSize + 2;
  const startY = cy - ((lines.length - 1) * lineH) / 2;
  const txt = document.createElementNS(ns, 'text');
  txt.setAttribute('x', cx);
  txt.setAttribute('y', startY);
  txt.setAttribute('class', 'node-label');
  txt.setAttribute('font-size', fontSize);
  lines.forEach((ln, i) => {
    const tspan = document.createElementNS(ns, 'tspan');
    tspan.setAttribute('x', cx);
    tspan.setAttribute('dy', i === 0 ? 0 : lineH);
    tspan.textContent = ln;
    txt.appendChild(tspan);
  });
  g.appendChild(txt);
  return txt;
}

// Paleta para acentos de swimlanes — colores estables por nombre
const LANE_PALETTE = ['#1E5BAA', '#2E7D32', '#B45309', '#6D28D9', '#B91C1C', '#0F766E', '#9D174D', '#374151', '#1F2937', '#0D9488'];
function laneColor(name, idx) {
  if (name === '— Proceso —') return '#9CA3AF';
  if (name === 'Sistema') return '#37474F';
  if (name === 'Sin asignar') return '#D6D6D6';
  // Hash simple para color estable por nombre
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return LANE_PALETTE[h % LANE_PALETTE.length];
}

export { nodeCenter, render };
