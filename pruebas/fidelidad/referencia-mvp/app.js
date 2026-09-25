/* ============================================================
   ProcessIQ — App logic
   MVP: canvas, paneles, copiloto (mock), persistencia y export.
   ============================================================ */

(() => {
  'use strict';

  // =================== STATE ===================
  const STORAGE_KEY = 'processiq.v1';
  const state = {
    meta: { name: '', industry: '', macroprocess: '', client: '', owner: '' },
    // Ficha de proceso corporativa (formato Minsait/cliente) — ver deriveFicha()/exportFicha()
    ficha: {
      code: '',            // p.ej. PR-DU-COM-02
      version: '',         // p.ej. 6
      objetivo: '',
      alcanceAreas: '',    // áreas involucradas
      alcanceDesde: '',    // hito de inicio (autosugerido del nodo start)
      alcanceHasta: '',    // hito de fin (autosugerido del nodo end)
      alcanceIncluye: '',  // qué abarca / excluye
      descripcion: '',
      gobernanza: [],      // [{ rol:'Dueño|Editor|Revisor|Aprobador', cargo, nombre, fecha }]
      sistemas: [],        // [{ nombre, uso }] — sistemas a nivel proceso (además de los de cada nodo)
      terminos: [],        // [{ termino, definicion }]
      anexos: [],          // [{ codigo, nombre }]
      cambios: []          // [{ version, fecha, descripcion }]
    },
    nodes: [],   // { id, type, x, y, w, h, label, owner, system, time, volume, va, notes, pains:[] }
    edges: [],   // { id, from, to, label }
    activeView: 'asis',         // 'asis' | 'tobe'
    _views: { asis: null, tobe: null },  // snapshots de la vista inactiva
    selectedNodeId: null,
    selectedEdgeId: null,
    mode: 'edit', // 'edit' | 'connect'
    connectSourceId: null,
    drag: null,   // { id, offsetX, offsetY }
    nextId: 1
  };

  const SHAPE_DEFAULTS = {
    start:        { w: 54,  h: 54,  label: 'Inicio' },
    end:          { w: 54,  h: 54,  label: 'Fin' },
    intermediate: { w: 54,  h: 54,  label: 'Evento' },
    task:         { w: 158, h: 76,  label: 'Actividad' },
    decision:     { w: 110, h: 80,  label: '¿Decisión?' },
    document:     { w: 110, h: 70,  label: 'Documento' },
    data:         { w: 110, h: 60,  label: 'Data' },
    system:       { w: 158, h: 76,  label: 'Sistema' }
  };

  // Factory de ficha vacía (reutilizado en init/reset/restore para no arrastrar referencias)
  function emptyFicha() {
    return {
      code: '', version: '', objetivo: '',
      alcanceAreas: '', alcanceDesde: '', alcanceHasta: '', alcanceIncluye: '',
      descripcion: '', gobernanza: [], sistemas: [], terminos: [], anexos: [], cambios: []
    };
  }
  // Normaliza una ficha parcial (de storage/import) rellenando claves faltantes
  function normalizeFicha(f) {
    return Object.assign(emptyFicha(), f || {});
  }

  // =================== DOM ===================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const canvas = $('#canvas');
  const nodesLayer = $('#nodesLayer');
  const edgesLayer = $('#edgesLayer');
  const swimlanesLayer = $('#swimlanesLayer');
  const laneHeadersLayer = $('#laneHeadersLayer');
  const canvasHint = $('#canvasHint');

  // =================== INIT ===================
  function init() {
    populateSelects();
    populateKpiLibrary();
    populatePainCategories();
    populateExecutionTypes();
    attachHeaderListeners();
    attachToolbarListeners();
    attachCanvasListeners();
    attachTabListeners();
    attachPropertyListeners();
    attachPainListeners();
    attachCopilotListeners();
    attachKpiListeners();
    attachSimulatorListeners();
    attachKeyboardShortcuts();
    attachOnboardListeners();
    attachZoomInteractions();
    attachPresentListeners();
    attachMobileNotice();
    restoreUiState();   // restaura paneles colapsados antes del primer render
    loadFromStorage();
    // Si hay nodos pero faltan lanes (versión vieja en localStorage), genera layout
    if (state.nodes.length > 0 && !state._lanes) {
      autoLayout();
    } else {
      render();
    }
    resetHistory();   // línea base del historial (estado al abrir)
    attachUndoRedoListeners();
    attachFichaListeners();
    attachAiListeners();
    updateAiUi();
    // Hook para demos/pruebas (cargadores de ejemplo)
    window.ProcessIQ = { loadDemo: loadDemoProcess, loadComplex: loadComplexDemo, loadComplex2: loadComplexDemo2, loadComplex3: loadComplexDemo3, loadComplex4: loadComplexDemo4, loadComplex5: loadComplexDemo5, loadComplex6: loadComplexDemo6, loadComplex7: loadComplexDemo7, loadComplex8: loadComplexDemo8, loadComplex9: loadComplexDemo9, loadComplex10: loadComplexDemo10, loadComplex11: loadComplexDemo11, loadComplex12: loadComplexDemo12, loadFichaVentaLotes: loadFichaVentaLotes, exportFicha: exportFicha, openFichaPreview: openFichaPreview, deriveFicha: deriveFicha, importBpmnXml: (xml) => importBpmnXml(xml), generateBpmnXml: () => generateBpmnXml(), snapshot: () => ({ nodes: state.nodes.length, edges: state.edges.length, tasks: state.nodes.filter(n => n.type==='task'||n.type==='system').length, decisions: state.nodes.filter(n => n.type==='decision').length, name: state.meta.name }), aiReady: () => aiReady(), openAiSettings: openAiSettings, buildProcessFromAiSpec: (s) => buildProcessFromAiSpec(s, 'test'), addSource: (t,n,x) => addSource(t,n,x), sources: () => sourcesList(), runAiTask: (k) => runAiTask(k), aiTasks: () => Object.keys(AI_TASKS), aiAnalyzePains: () => aiAnalyzePains(), detectParticipants: (t) => detectParticipants(t), autoFit: (o) => autoFitDiagram(o), quality: () => diagramQuality(), runIngest: (src) => runIngest(src), cancelIngest: () => cancelIngestJob(), astar: (on) => { state._astar = !!on; invalidarRutas(); return !!on; }, nivel: (n) => aplicarNivel(n), niveles: () => NIVELES, askProfundidad: () => askProfundidad(), sinDescarga: (on) => { state._sinDescarga = !!on; }, ultimoPptx: () => state._ultimoPptx, nombresPptx: () => state._nombresPorNodo, modeloCompleto: () => state._modeloCompleto ? state._modeloCompleto.nodes.length : 0, svg: () => serializeCanvasSvg() };
  }

  function populateSelects() {
    const ind = $('#processIndustry');
    const mac = $('#processMacro');
    const filt = $('#kpiFilterIndustry');
    window.INDUSTRIES.forEach(i => {
      ind.insertAdjacentHTML('beforeend', `<option value="${i}">${i}</option>`);
      filt.insertAdjacentHTML('beforeend', `<option value="${i}">${i}</option>`);
    });
    window.MACROPROCESSES.forEach(m => {
      mac.insertAdjacentHTML('beforeend', `<option value="${m}">${m}</option>`);
    });
  }

  function populatePainCategories() {
    const sel = $('#painCategory');
    window.PAIN_CATEGORIES.forEach(c => {
      sel.insertAdjacentHTML('beforeend', `<option value="${c.id}">${c.icon} ${c.label}</option>`);
    });
  }

  function populateExecutionTypes() {
    const sel = $('#propExecType');
    if (!sel) return;
    (window.EXECUTION_TYPES || []).forEach(t => {
      sel.insertAdjacentHTML('beforeend', `<option value="${t.id}">${t.label}</option>`);
    });
  }

  // =================== HEADER ===================
  function attachHeaderListeners() {
    $('#processName').addEventListener('input', e => { state.meta.name = e.target.value; persist(); });
    $('#processIndustry').addEventListener('change', e => { state.meta.industry = e.target.value; persist(); renderKpiLibrary(); });
    $('#processMacro').addEventListener('change', e => { state.meta.macroprocess = e.target.value; persist(); });

    $('#btnNew').addEventListener('click', () => {
      if (confirm('¿Crear un nuevo proceso? Se perderá el actual si no fue exportado.')) resetState();
    });

    // View toggle as-is / to-be
    $('#btnViewAsIs').addEventListener('click', () => setView('asis'));
    $('#btnViewToBe').addEventListener('click', () => setView('tobe'));
    $('#btnCloneToBe').addEventListener('click', cloneAsIsToToBe);
    $('#btnTransformToBe').addEventListener('click', () => {
      // Con API key el To-Be lo disena Claude sobre ESTE proceso; sin key, reglas fijas
      if (aiReady() && state.nodes.length) {
        activateTab('copilot');
        copilotPost('user', 'Disenar el proceso To-Be (IA).');
        runAiTask('propose-tobe');
        return;
      }
      (openTransformToBeModal)();
    });

    $('#btnIngest').addEventListener('click', openIngestModal);
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', importJson);

    // Export dropdown
    const dd = $('#exportDropdown');
    const ddBtn = $('#btnExportMenu');
    const setDdOpen = (open) => {
      ddBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      const ch = ddBtn.querySelector('.chevron');
      if (ch) ch.style.transform = open ? 'rotate(180deg)' : 'rotate(0)';
      if (open) {
        dd.classList.remove('closing');
        dd.hidden = false;
      } else if (!dd.hidden) {
        dd.classList.add('closing');
        setTimeout(() => { dd.hidden = true; dd.classList.remove('closing'); }, 120);
      }
    };
    ddBtn.addEventListener('click', e => {
      e.stopPropagation();
      setDdOpen(dd.hidden);
    });
    document.addEventListener('click', () => setDdOpen(false));
    dd.addEventListener('click', e => e.stopPropagation());
    dd.querySelectorAll('button[data-export]').forEach(b => {
      b.addEventListener('click', () => {
        setDdOpen(false);
        switch (b.dataset.export) {
          case 'json': exportJson(); break;
          case 'svg':  exportSvg();  break;
          case 'png':  exportPng();  break;
          case 'bpmn': exportBpmn(); break;
          case 'pptx': exportPptx(b.dataset.tema || 'mbc'); break;
          case 'word': exportWord(); break;
          case 'ficha': openFichaPreview(); break;
        }
      });
    });
  }

  // =================== TOOLBAR ===================
  function attachToolbarListeners() {
    $$('.shape-btn[data-shape]').forEach(btn => {
      btn.addEventListener('dragstart', e => {
        e.dataTransfer.setData('shape', btn.dataset.shape);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });

    $('#btnConnect').addEventListener('click', toggleConnectMode);
    $('#btnDelete').addEventListener('click', deleteSelection);
    $('#btnAutoLayout').addEventListener('click', autoLayout);
    cablearSelectorNivel();
  }

  function toggleConnectMode() {
    state.mode = state.mode === 'connect' ? 'edit' : 'connect';
    state.connectSourceId = null;
    $('#btnConnect').classList.toggle('active', state.mode === 'connect');
    canvas.classList.toggle('connect-mode', state.mode === 'connect');
    $('#statusMode').textContent = `Modo: ${state.mode === 'connect' ? 'conexión (click origen y destino)' : 'edición'}`;
    render();
  }

  // =================== CANVAS ===================
  function updateStickyHeaders() {
    if (!laneHeadersLayer || !state._lanes) return;
    const wrapper = $('#canvasWrapper');
    if (!wrapper) return;
    laneHeadersLayer.setAttribute('transform', `translate(${wrapper.scrollLeft}, 0)`);
  }

  function attachCanvasListeners() {
    canvas.addEventListener('dragover', e => e.preventDefault());

    // Sticky headers de swimlanes: se trasladan con el scroll horizontal
    const wrapper = $('#canvasWrapper');
    if (wrapper) {
      wrapper.addEventListener('scroll', updateStickyHeaders, { passive: true });
    }
    canvas.addEventListener('drop', e => {
      e.preventDefault();
      const shape = e.dataTransfer.getData('shape');
      if (!shape) return;
      const pt = svgPoint(e.clientX, e.clientY);
      addNode(shape, pt.x, pt.y);
    });

    // v3.8.8: arrastrar sobre un espacio vacio (fondo, carril o su cabecera)
    // desplaza el lienzo, como en draw.io o Miro. Antes solo quitaba la
    // seleccion y un flujo de izquierda a derecha no se podia recorrer con el
    // raton. Un clic SIN arrastrar sigue quitando la seleccion.
    canvas.addEventListener('mousedown', e => {
      if (e.target.closest && (e.target.closest('#nodesLayer') || e.target.closest('#edgesLayer'))) return;
      if (e.button !== 0 && e.button !== 1) return;
      const wrap = $('#canvasWrapper');
      if (!wrap) return;
      e.preventDefault();   // que no se seleccione texto mientras se arrastra
      const ini = { x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
      let movio = false;
      const mover = (ev) => {
        const dx = ev.clientX - ini.x, dy = ev.clientY - ini.y;
        if (!movio && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (!movio) { movio = true; wrap.classList.add('panning'); }
        wrap.scrollLeft = ini.left - dx;
        wrap.scrollTop = ini.top - dy;
      };
      const soltar = () => {
        window.removeEventListener('mousemove', mover);
        window.removeEventListener('mouseup', soltar);
        wrap.classList.remove('panning');
        if (!movio && (state.selectedNodeId || state.selectedEdgeId)) {
          state.selectedNodeId = null;
          state.selectedEdgeId = null;
          render();
        }
      };
      window.addEventListener('mousemove', mover);
      window.addEventListener('mouseup', soltar);
    });

    canvas.addEventListener('mousemove', e => {
      if (!state.drag) return;
      const pt = svgPoint(e.clientX, e.clientY);
      const n = getNode(state.drag.id);
      if (!n) return;
      n.x = pt.x - state.drag.offsetX;
      n.y = pt.y - state.drag.offsetY;
      render();
    });

    canvas.addEventListener('mouseup', () => {
      if (state.drag) { state.drag = null; persist(); }
    });
    canvas.addEventListener('mouseleave', () => {
      if (state.drag) { state.drag = null; persist(); }
    });
  }

  function svgPoint(clientX, clientY) {
    // Conversión robusta vía matriz: respeta viewBox/zoom y scroll (necesario para el zoom).
    if (canvas.getScreenCTM) {
      const ctm = canvas.getScreenCTM();
      if (ctm) {
        const p = canvas.createSVGPoint();
        p.x = clientX; p.y = clientY;
        const inv = p.matrixTransform(ctm.inverse());
        return { x: inv.x, y: inv.y };
      }
    }
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function addNode(type, x, y) {
    const def = SHAPE_DEFAULTS[type];
    // Tipo de ejecución por defecto según shape
    const defaultExec = type === 'system' ? 'system' : (type === 'task' ? 'manual' : '');
    const node = {
      id: 'n' + (state.nextId++),
      type,
      x: x - def.w / 2,
      y: y - def.h / 2,
      w: def.w,
      h: def.h,
      label: def.label,
      executionType: defaultExec,
      activityCode: '',
      owner: '', system: '', time: '', volume: '', va: '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '',
      pains: []
    };
    state.nodes.push(node);
    state.selectedNodeId = node.id;
    assignActivityCodes();   // asigna [PREFIX-NN] al nuevo nodo
    persist();
    render();
  }

  function addEdge(fromId, toId) {
    if (fromId === toId) return;
    const exists = state.edges.some(e => e.from === fromId && e.to === toId);
    if (exists) return;
    state.edges.push({ id: 'e' + (state.nextId++), from: fromId, to: toId, label: '' });
    persist();
    render();
  }

  function deleteSelection() {
    if (state.selectedNodeId) {
      state.nodes = state.nodes.filter(n => n.id !== state.selectedNodeId);
      state.edges = state.edges.filter(e => e.from !== state.selectedNodeId && e.to !== state.selectedNodeId);
      state.selectedNodeId = null;
    } else if (state.selectedEdgeId) {
      state.edges = state.edges.filter(e => e.id !== state.selectedEdgeId);
      state.selectedEdgeId = null;
    }
    persist();
    render();
  }

  function getNode(id) { return state.nodes.find(n => n.id === id); }
  function getEdge(id) { return state.edges.find(e => e.id === id); }

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

  // ============================================================
  // RUTEO DE FLECHAS (calidad BPMN)
  // Las flechas salen y entran por los BORDES de las cajas (no por el centro),
  // el codo se coloca en el hueco ENTRE columnas (nunca dentro de una caja) y
  // los retornos de reproceso viajan por un corredor inferior despejado.
  // ============================================================
  const EDGE_RADIUS = 10;             // radio del codo redondeado
  const LOOP_GAP = 26;                // separación del primer corredor de retorno
  const LOOP_LANE_H = 16;             // separación entre corredores de retorno

  // Convierte una polilínea en un path con esquinas redondeadas
  function roundedPath(pts, r) {
    pts = pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) > 0.5 || Math.abs(p.y - pts[i - 1].y) > 0.5);
    if (pts.length < 3) return `M ${pts[0].x} ${pts[0].y} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
    const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const toward = (from, to, d) => {
      const len = dist(from, to) || 1;
      return { x: from.x + (to.x - from.x) * (d / len), y: from.y + (to.y - from.y) * (d / len) };
    };
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], prev = pts[i - 1], next = pts[i + 1];
      const rr = Math.min(r, dist(prev, p) / 2, dist(p, next) / 2);
      const a = toward(p, prev, rr), b = toward(p, next, rr);
      d += ` L ${a.x} ${a.y} Q ${p.x} ${p.y} ${b.x} ${b.y}`;
    }
    const last = pts[pts.length - 1];
    return d + ` L ${last.x} ${last.y}`;
  }

  // Reserva un "carril" por cada flecha de retorno para que no se solapen
  function loopCorridors() {
    if (state._loopSlots && state._loopSlotsFor === state.edges.length) return state._loopSlots;
    const slots = {};
    // Un corredor por banda: el retorno viaja justo debajo de SU banda, no al
    // fondo del documento (si no, en modo envolvente cruzaría todo el diagrama).
    const bandBottom = {};
    state.nodes.forEach(n => {
      const bd = n._band || 0;
      bandBottom[bd] = Math.max(bandBottom[bd] || 0, n.y + n.h);
    });
    const backs = state.edges.filter(e => {
      const a = getNode(e.from), b = getNode(e.to);
      return a && b && (b.x + b.w) <= (a.x + 4);
    });
    const perBand = {};
    backs.map(e => {
      const a = getNode(e.from), b = getNode(e.to);
      // Banda SUPERIOR: el corredor va justo debajo de la banda de origen, de modo
      // que un salto de banda baja una sola vez y entra por arriba del destino.
      return { id: e.id, band: Math.min(a._band || 0, b._band || 0), span: Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)) };
    }).sort((p, q) => p.span - q.span)
      .forEach(it => {
        const i = (perBand[it.band] = (perBand[it.band] || 0)) ;
        perBand[it.band]++;
        slots[it.id] = (bandBottom[it.band] || 0) + LOOP_GAP + i * LOOP_LANE_H;
      });
    state._loopSlots = slots;
    state._loopSlotsFor = state.edges.length;
    return slots;
  }

  // ¿La flecha salta columnas? (hay cajas intermedias que esquivar)
  function longSpan(a, b) {
    const R = state._lanes && state._lanes.ranks;
    if (R && R[a.id] != null && R[b.id] != null) return (R[b.id] - R[a.id]) > 1;
    return (b.x - (a.x + a.w)) > 260;
  }

  // Ejes verticales SEGUROS: el centro del hueco entre columnas. Usar el borde del
  // nodo no basta: los nodos estrechos van centrados en su columna, así que a su
  // lado queda espacio que ocupan las cajas anchas de otros carriles.
  function colGapAfter(node) {
    const L = state._lanes, r = L && L.ranks ? L.ranks[node.id] : null;
    if (L && L.colX && L.rankW && r != null && L.colX[r] != null) return L.colX[r] + L.rankW[r] + 29;
    return node.x + node.w + 18;
  }
  function colGapBefore(node) {
    const L = state._lanes, r = L && L.ranks ? L.ranks[node.id] : null;
    if (L && L.colX && r != null && L.colX[r] != null) return L.colX[r] - 29;
    return node.x - 18;
  }

  // Franja inferior libre del carril de un nodo (autopista para tramos largos)
  function laneGutterY(node) {
    const L = state._lanes;
    if (!L || !L.list || !L.laneOf) return null;
    const idx = L.list.indexOf(L.laneOf[node.id]);
    if (idx < 0) return null;
    const bandY = (node._band || 0) * (L.bandH || 0);
    const top = (L.laneTops && L.laneTops[idx] != null) ? L.laneTops[idx] : idx * L.laneH;
    const lh = (L.laneHs && L.laneHs[idx]) || L.laneH;
    return L.padY + bandY + top + lh - 13;      // dentro del carril, bajo las cajas
  }

  // ============================================================
  // RUTEO ORTOGONAL A* CON EVASIÓN DE OBSTÁCULOS
  //
  // Las heurísticas de codo de más abajo resuelven bien el caso corriente,
  // pero se rompen cuando varias aristas comparten la misma "autopista":
  // medido sobre 12 procesos reales (1.042 nodos) dejaban 1.804 flechas
  // encima de cajas. Aquí se rutea sobre una grilla de Hanan —las líneas que
  // pasan por los bordes de las cajas— buscando el camino de menor coste,
  // donde el coste penaliza la longitud, los giros y, sobre todo, reutilizar
  // un canal que ya ocupa otra arista.
  // ============================================================
  const AST_PAD = 10;      // holgura alrededor de cada caja
  const AST_TURN = 18;     // coste de un giro
  const AST_REUSE = 40;    // coste de meterse en un canal ya ocupado
  const AST_MARGEN = 140;  // margen de la ventana de búsqueda
  const AST_MAX_NODOS = 9000;   // tope de expansión: si se pasa, cae a la heurística

  // ── APAGADO POR DEFECTO. Medido sobre 3 procesos reales (v2.8.2):
  //      59 nodos    6/2   -> 6/2      en 283ms -> 1.686ms
  //      97 nodos  320/36  -> 317/39   en ~700ms -> 9.515ms
  //     119 nodos  200/65  -> 142/50   en 676ms -> 5.463ms
  //   Un caso mejora un 29 %, dos no mejoran, y todo va 6-13 veces más lento.
  //   El diagnóstico: cuando 97 nodos van apretados en el área disponible NO
  //   EXISTE canal libre por donde rutear, y ningún ruteador puede encontrar un
  //   camino limpio que no está ahí. El problema es la densidad del layout, no
  //   el ruteo. Se conserva el código porque a baja densidad sí ordena
  //   (119 nodos: -29 % flechas sobre cajas), y volverá a ser útil cuando las
  //   vistas por nivel de granularidad reduzcan los nodos por lámina.
  //   Activar con:  ProcessIQ.astar(true)

  let _astCanales = null;  // 'H:y' | 'V:x'  ->  nº de aristas que lo usan
  let _rutaSerie = 0;      // sube con cada relayout: invalida los paths cacheados

  function astReset() { _astCanales = new Map(); }
  function invalidarRutas() { _rutaSerie++; _astCanales = null; }
  function _astCarga(clave) { return _astCanales ? (_astCanales.get(clave) || 0) : 0; }
  function _astOcupa(clave) { if (_astCanales) _astCanales.set(clave, _astCarga(clave) + 1); }

  // ¿El segmento recto p→q atraviesa alguna caja que no sea origen ni destino?
  function _astChoca(p, q, exentos) {
    const x1 = Math.min(p.x, q.x), x2 = Math.max(p.x, q.x);
    const y1 = Math.min(p.y, q.y), y2 = Math.max(p.y, q.y);
    for (let i = 0; i < state.nodes.length; i++) {
      const n = state.nodes[i];
      if (exentos.indexOf(n.id) >= 0) continue;
      if (x1 < n.x + n.w + 2 && x2 > n.x - 2 && y1 < n.y + n.h + 2 && y2 > n.y - 2) return true;
    }
    return false;
  }

  // Líneas candidatas: bordes de cada caja (con holgura) dentro de la ventana
  function _astLineas(a, b) {
    const x0 = Math.min(a.x, b.x) - AST_MARGEN, x1 = Math.max(a.x + a.w, b.x + b.w) + AST_MARGEN;
    const y0 = Math.min(a.y, b.y) - AST_MARGEN, y1 = Math.max(a.y + a.h, b.y + b.h) + AST_MARGEN;
    const xs = new Set(), ys = new Set();
    state.nodes.forEach(n => {
      const cx1 = n.x - AST_PAD, cx2 = n.x + n.w + AST_PAD;
      const cy1 = n.y - AST_PAD, cy2 = n.y + n.h + AST_PAD;
      if (cx1 > x0 && cx1 < x1) xs.add(cx1);
      if (cx2 > x0 && cx2 < x1) xs.add(cx2);
      if (cy1 > y0 && cy1 < y1) ys.add(cy1);
      if (cy2 > y0 && cy2 < y1) ys.add(cy2);
    });
    return { xs: [...xs].sort((p, q) => p - q), ys: [...ys].sort((p, q) => p - q) };
  }

  // Polilínea de menor coste, o null si no encuentra o se pasa del tope
  function rutaAStar(a, b, desde, hasta) {
    const L = _astLineas(a, b);
    const xs = [...new Set(L.xs.concat([desde.x, hasta.x]))].sort((p, q) => p - q);
    const ys = [...new Set(L.ys.concat([desde.y, hasta.y]))].sort((p, q) => p - q);
    if (xs.length * ys.length > AST_MAX_NODOS) return null;

    const ix = (v) => xs.indexOf(v), iy = (v) => ys.indexOf(v);
    const si = ix(desde.x), sj = iy(desde.y), ti = ix(hasta.x), tj = iy(hasta.y);
    if (si < 0 || sj < 0 || ti < 0 || tj < 0) return null;

    const exentos = [a.id, b.id];
    const key = (i, j, d) => (j * xs.length + i) * 3 + d;   // d: 0 inicio, 1 horiz, 2 vert
    const g = new Map(), padre = new Map();
    const h = (i, j) => Math.abs(xs[i] - hasta.x) + Math.abs(ys[j] - hasta.y);

    const cola = [{ i: si, j: sj, d: 0, f: h(si, sj) }];
    g.set(key(si, sj, 0), 0);
    let expandidos = 0;

    while (cola.length) {
      let mejor = 0;
      for (let k = 1; k < cola.length; k++) if (cola[k].f < cola[mejor].f) mejor = k;
      const cur = cola.splice(mejor, 1)[0];
      const ck = key(cur.i, cur.j, cur.d);
      if (cur.i === ti && cur.j === tj) {
        const pts = [];
        let k = ck;
        while (k !== undefined) {
          const d = k % 3, resto = (k - d) / 3;
          const i = resto % xs.length, j = (resto - i) / xs.length;
          pts.unshift({ x: xs[i], y: ys[j] });
          k = padre.get(k);
        }
        return pts;
      }
      if (++expandidos > AST_MAX_NODOS) return null;
      const gc = g.get(ck);

      const vecinos = [
        { i: cur.i + 1, j: cur.j, d: 1 }, { i: cur.i - 1, j: cur.j, d: 1 },
        { i: cur.i, j: cur.j + 1, d: 2 }, { i: cur.i, j: cur.j - 1, d: 2 }
      ];
      for (const v of vecinos) {
        if (v.i < 0 || v.j < 0 || v.i >= xs.length || v.j >= ys.length) continue;
        const p = { x: xs[cur.i], y: ys[cur.j] }, q = { x: xs[v.i], y: ys[v.j] };
        if (_astChoca(p, q, exentos)) continue;
        const largo = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        const giro = (cur.d !== 0 && cur.d !== v.d) ? AST_TURN : 0;
        const canal = v.d === 1 ? ('H:' + Math.round(q.y)) : ('V:' + Math.round(q.x));
        const reuso = _astCarga(canal) * AST_REUSE;
        const ng = gc + largo + giro + reuso;
        const vk = key(v.i, v.j, v.d);
        if (g.has(vk) && g.get(vk) <= ng) continue;
        g.set(vk, ng); padre.set(vk, ck);
        cola.push({ i: v.i, j: v.j, d: v.d, f: ng + h(v.i, v.j) });
      }
    }
    return null;
  }

  // Marca como ocupados los canales que usa una polilínea ya trazada
  function _astRegistra(pts) {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      if (Math.abs(p.y - q.y) < 1) _astOcupa('H:' + Math.round(q.y));
      else _astOcupa('V:' + Math.round(q.x));
    }
  }

  // ¿Este path pisa alguna caja que no sea su origen o su destino?
  function _pathPisaCaja(d, a, b) {
    const segs = _segsOfD(d);
    for (let i = 0; i < segs.length; i++) {
      for (let k = 0; k < state.nodes.length; k++) {
        const n = state.nodes[k];
        if (n.id === a.id || n.id === b.id) continue;
        if (_segHitsBox(segs[i][0], segs[i][1], n, 2)) return true;
      }
    }
    return false;
  }
  function _astRegistraPath(d) {
    const segs = _segsOfD(d);
    segs.forEach(sg => {
      if (Math.abs(sg[0].y - sg[1].y) < 1) _astOcupa('H:' + Math.round(sg[1].y));
      else if (Math.abs(sg[0].x - sg[1].x) < 1) _astOcupa('V:' + Math.round(sg[1].x));
    });
  }

  // Path entre dos nodos. Primero la heurística, que es barata y en la mayoría
  // de aristas ya sale limpia; el A* sólo entra cuando esa heurística pisa una
  // caja. Aplicarlo a todas las aristas multiplicaba por 15 el tiempo de
  // autoajuste sin mejorar las que ya estaban bien.
  function smartEdgePath(a, b, edge) {
    // Cacheado por layout: repintar (zoom, scroll, selección) no debe reroutear.
    if (edge && edge._dSerie === _rutaSerie && edge._d) return edge._d;
    const d = _calculaEdgePath(a, b, edge);
    if (edge) { edge._d = d; edge._dSerie = _rutaSerie; }
    return d;
  }

  function _calculaEdgePath(a, b, edge) {
    const heur = _pathHeuristico(a, b, edge);
    if (!_astCanales) return heur;
    if (!_pathPisaCaja(heur, a, b)) { _astRegistraPath(heur); return heur; }

    const ac = nodeCenter(a), bc = nodeCenter(b);
    const forward = b.x >= a.x + a.w - 4;
    const desde = forward ? { x: a.x + a.w + AST_PAD, y: ac.y } : { x: a.x - AST_PAD, y: ac.y };
    const hasta = forward ? { x: b.x - AST_PAD, y: bc.y } : { x: b.x + b.w + AST_PAD, y: bc.y };
    const pts = rutaAStar(a, b, desde, hasta);
    if (pts && pts.length >= 2) {
      const salida = { x: forward ? a.x + a.w : a.x, y: ac.y };
      const entrada = { x: forward ? b.x : b.x + b.w, y: bc.y };
      const d = roundedPath([salida].concat(pts, [entrada]), EDGE_RADIUS);
      // Sólo se acepta si de verdad mejora: si el A* también pisa, no gana nada
      if (!_pathPisaCaja(d, a, b)) { _astRegistraPath(d); return d; }
    }
    _astRegistraPath(heur);
    return heur;
  }

  // Heurística de codos: la de siempre, ahora como plan A
  function _pathHeuristico(a, b, edge) {
    const ac = nodeCenter(a), bc = nodeCenter(b);
    const forward = b.x >= a.x + a.w - 4;
    const backward = (b.x + b.w) <= (a.x + 4);

    if (forward) {
      const from = { x: a.x + a.w, y: ac.y };
      const to = { x: b.x, y: bc.y };
      if (Math.abs(from.y - to.y) < 2 && !longSpan(a, b)) {
        return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      }
      // Tramo largo (salta columnas): la recta pisaría las cajas intermedias.
      // Se desvía por la franja libre del carril y sólo entra al destino al final.
      if (longSpan(a, b)) {
        const gy = laneGutterY(a);
        if (gy != null && Math.abs(gy - from.y) > 8) {
          const x1 = colGapAfter(a), x2 = colGapBefore(b);
          if (x2 > x1 + 10) {
            return roundedPath([from, { x: x1, y: from.y }, { x: x1, y: gy },
                                { x: x2, y: gy }, { x: x2, y: to.y }, to], EDGE_RADIUS);
          }
        }
      }
      // codo en el hueco entre columnas => nunca cae dentro de una caja
      const mx = from.x + (to.x - from.x) / 2;
      return roundedPath([from, { x: mx, y: from.y }, { x: mx, y: to.y }, to], EDGE_RADIUS);
    }

    if (backward) {
      // Retorno: baja al corredor, viaja horizontal y entra al destino.
      // Clave: si el destino está DEBAJO del corredor (salto de banda en modo
      // envolvente) hay que entrar por ARRIBA; si no, la flecha lo atravesaría.
      const y = (loopCorridors()[edge && edge.id]) ||
                (Math.max(a.y + a.h, b.y + b.h) + LOOP_GAP);
      // Sale por abajo, se desplaza al hueco entre columnas (sin cajas), baja al
      // corredor, vuelve y entra al destino por su lado izquierdo — la flecha
      // apunta en el sentido del flujo, como se dibuja un reproceso en BPMN.
      const xOut = colGapAfter(a);                    // hueco tras la columna origen
      const xIn = colGapBefore(b);                    // hueco antes de la columna destino
      // El corredor puede quedar ARRIBA del origen (retorno que sube de banda):
      // en ese caso hay que salir por el techo, no por el suelo.
      const exitTop = y < a.y;
      const from = { x: ac.x, y: exitTop ? a.y : a.y + a.h };
      const to = { x: b.x, y: bc.y };
      return roundedPath([from, { x: xOut, y: from.y }, { x: xOut, y },
                          { x: xIn, y }, { x: xIn, y: to.y }, to], EDGE_RADIUS);
    }

    // misma columna (o solape): conexión vertical por bordes
    if (bc.y >= ac.y) {
      const from = { x: ac.x, y: a.y + a.h }, to = { x: bc.x, y: b.y };
      if (Math.abs(from.x - to.x) < 2) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      const my = from.y + (to.y - from.y) / 2;
      return roundedPath([from, { x: from.x, y: my }, { x: to.x, y: my }, to], EDGE_RADIUS);
    }
    const from = { x: ac.x, y: a.y }, to = { x: bc.x, y: b.y + b.h };
    if (Math.abs(from.x - to.x) < 2) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    const my = from.y + (to.y - from.y) / 2;
    return roundedPath([from, { x: from.x, y: my }, { x: to.x, y: my }, to], EDGE_RADIUS);
  }

  // ============================================================
  // AUTOAJUSTE — mide la calidad del diagrama y elige la mejor disposición
  // Cuenta flechas que pisan cajas y cruces flecha-flecha sobre el ruteo REAL
  // (el mismo que dibuja el canvas), prueba variantes de layout y aplica la
  // que menos defectos produce. Es lo que corre el botón "Autoajustar".
  // ============================================================
  function _segsOfD(d) {
    const pts = [], re = /([MLQ])\s*(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+)\s+(-?[\d.]+))?/g;
    let m;
    while ((m = re.exec(d))) {
      if (m[1] === 'Q') pts.push({ x: +m[4], y: +m[5] });
      else pts.push({ x: +m[2], y: +m[3] });
    }
    const segs = [];
    for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
    return segs;
  }
  function _segHitsBox(a, b, n, pad) {
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    return x1 < n.x + n.w + pad && x2 > n.x - pad && y1 < n.y + n.h + pad && y2 > n.y - pad;
  }
  function _segCross(s1, s2) {
    const isH = s => Math.abs(s[0].y - s[1].y) < 1.5, isV = s => Math.abs(s[0].x - s[1].x) < 1.5;
    let a = s1, b = s2;
    if (!((isH(a) && isV(b)) || (isV(a) && isH(b)))) return false;
    if (isV(a)) { const t = a; a = b; b = t; }
    const ax1 = Math.min(a[0].x, a[1].x), ax2 = Math.max(a[0].x, a[1].x), ay = a[0].y;
    const bx = b[0].x, by1 = Math.min(b[0].y, b[1].y), by2 = Math.max(b[0].y, b[1].y);
    return bx > ax1 + 1 && bx < ax2 - 1 && ay > by1 + 1 && ay < by2 - 1;
  }
  // Diagnóstico de calidad del diagrama actual
  function diagramQuality() {
    invalidarRutas();
    if (state._astar) astReset();   // el A* sólo entra si está activado
    const paths = [];
    state.edges.forEach(e => {
      const a = getNode(e.from), b = getNode(e.to);
      if (!a || !b) return;
      paths.push({ segs: _segsOfD(smartEdgePath(a, b, e)), ends: [e.from, e.to] });
    });
    let sobreCajas = 0;
    paths.forEach(p => state.nodes.forEach(n => {
      if (p.ends.indexOf(n.id) >= 0) return;
      p.segs.forEach(sg => { if (_segHitsBox(sg[0], sg[1], n, 2)) sobreCajas++; });
    }));
    let cruces = 0;
    for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
      if (paths[i].ends.some(x => paths[j].ends.indexOf(x) >= 0)) continue;
      paths[i].segs.forEach(s1 => paths[j].segs.forEach(s2 => { if (_segCross(s1, s2)) cruces++; }));
    }
    let ancho = 0, alto = 0;
    state.nodes.forEach(n => { ancho = Math.max(ancho, n.x + n.w); alto = Math.max(alto, n.y + n.h); });
    // Penaliza sobre todo pisar cajas; luego cruces; y un poco el exceso de ancho
    const score = sobreCajas * 10 + cruces * 3 + Math.max(0, ancho - 3500) / 500;
    return { sobreCajas, cruces, ancho: Math.round(ancho), alto: Math.round(alto), score };
  }
  // Prueba variantes de disposición y se queda con la mejor
  function autoFitDiagram(opts) {
    opts = opts || {};
    if (state.nodes.length === 0) { if (!opts.silent) alert('No hay diagrama que ajustar.'); return null; }
    const variantes = [undefined, true, false];   // wrap: auto / forzado / desactivado
    let mejor = null;
    variantes.forEach(w => {
      state._wrap = w;
      autoLayout();
      const q = diagramQuality();
      if (!mejor || q.score < mejor.q.score) mejor = { wrap: w, q };
    });
    state._wrap = mejor.wrap;
    autoLayout();
    const q = mejor.q;
    if (!opts.silent) {
      maybeFitOnLoad();
      const L = state._lanes || {};
      const limpio = (q.sobreCajas === 0 && q.cruces === 0);
      copilotPost('ai',
        `**Diagrama autoajustado.**\n\n` +
        (limpio
          ? `Sin flechas sobre cajas ni cruces. Disposición: ${L.wrap ? `${L.bands} bandas de hasta ${L.wrapAt} columnas` : 'una sola banda'}, ${(L.list || []).length} carriles.\n\n`
          : `Quedan **${q.sobreCajas} flecha(s) sobre cajas** y **${q.cruces} cruce(s)**; es la mejor de ${variantes.length} disposiciones probadas. Suele deberse a varias ramas que apuntan al mismo nodo final.\n\n`) +
        `Tamaño: ${q.ancho} × ${q.alto} px. Pulsa **deshacer** (Ctrl+Z) si prefieres la disposición anterior.`);
    }
    return q;
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

  // =================== TABS ===================
  function attachTabListeners() {
    // Riel: clic en el icono activo con el cajón abierto lo cierra; cualquier
    // otro clic abre ese panel (y lo deja fijo aunque se deseleccione).
    $$('.tab[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        const abierto = document.body.classList.contains('panel-open');
        if (abierto && tab.classList.contains('active')) cerrarPanel();
        else abrirPanel(target, false);
      });
    });
    const cierra = $('#btnDrawerClose');
    if (cierra) cierra.addEventListener('click', () => cerrarPanel());
  }

  // =================== PROPERTIES PANEL ===================
  function attachPropertyListeners() {
    const fields = [
      ['Label', 'label'],
      ['ExecType', 'executionType'],
      ['Owner', 'owner'],
      ['System', 'system'],
      ['Time', 'time'],
      ['Volume', 'volume'],
      ['VA', 'va'],
      ['Sla', 'sla'],
      ['DocsIn', 'docsIn'],
      ['DocsOut', 'docsOut'],
      ['Rules', 'rules'],
      ['Notes', 'notes']
    ];
    fields.forEach(([id, key]) => {
      const el = $('#prop' + id);
      if (!el) return;
      el.addEventListener('input', () => {
        const n = getNode(state.selectedNodeId);
        if (!n) return;
        n[key] = el.value;
        if (id === 'Label')    showLabelHint(el.value);
        if (id === 'ExecType') {
          showExecHint(el.value);
          // Re-asigna código si cambia el tipo de tarea (prefijo nuevo)
          const exec = (window.EXECUTION_TYPES || []).find(t => t.id === el.value);
          if (exec && n.activityCode) {
            const numMatch = n.activityCode.match(/-(\d+)$/);
            const num = numMatch ? numMatch[1] : '01';
            n.activityCode = exec.codePrefix + '-' + num;
            $('#propActivityCode').value = n.activityCode;
          }
        }
        persist();
        render();
        runLinter();
      });
    });

    // Edición manual del código de actividad
    const codeEl = $('#propActivityCode');
    if (codeEl) {
      codeEl.addEventListener('input', () => {
        const n = getNode(state.selectedNodeId);
        if (!n) return;
        n.activityCode = codeEl.value.trim().toUpperCase().replace(/[\[\]]/g, '');
        persist();
        render();
      });
    }

    // Edición manual del tipo de bloque BPMN (start/task/decision/…)
    const typeEl = $('#propNodeType');
    if (typeEl) {
      typeEl.addEventListener('change', () => {
        const n = getNode(state.selectedNodeId);
        if (!n) return;
        const newType = typeEl.value;
        const def = SHAPE_DEFAULTS[newType];
        n.type = newType;
        // Ajusta tamaño al nuevo tipo (preserva posición del centro)
        if (def) {
          const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
          n.w = def.w; n.h = def.h;
          n.x = cx - n.w / 2; n.y = cy - n.h / 2;
        }
        // Si pasa a evento, limpia tipo de ejecución y código
        if (newType === 'start' || newType === 'end' || newType === 'decision' || newType === 'intermediate') {
          n.executionType = ''; n.activityCode = '';
        } else if (!n.executionType) {
          n.executionType = newType === 'system' ? 'system' : 'manual';
        }
        // Limpia eventType si deja de ser evento
        if (newType !== 'start' && newType !== 'end' && newType !== 'intermediate') {
          n.eventType = '';
        } else if (!n.eventType) {
          n.eventType = 'none';
        }
        persist();
        renderProperties();
        render();
        runLinter();
      });
    }

    // Tipo de gateway BPMN (exclusivo/paralelo/inclusivo)
    const gwEl = $('#propGatewayType');
    if (gwEl) {
      gwEl.addEventListener('change', () => {
        const n = getNode(state.selectedNodeId);
        if (!n) return;
        n.gatewayType = gwEl.value;
        persist();
        autoLayout();   // re-evalúa ramas (paralelo no fuerza Sí/No)
      });
    }

    // Tipo de evento BPMN (mensaje/timer/error/señal) para start/end/intermediate
    const evEl = $('#propEventType');
    if (evEl) {
      evEl.addEventListener('change', () => {
        const n = getNode(state.selectedNodeId);
        if (!n) return;
        n.eventType = evEl.value === 'none' ? '' : evEl.value;
        persist();
        render();
      });
    }

    // Marcador de actividad BPMN (subproceso/loop/multi-instancia) para tareas
    const mkEl = $('#propMarker');
    if (mkEl) {
      mkEl.addEventListener('change', () => {
        const n = getNode(state.selectedNodeId);
        if (!n) return;
        n.marker = mkEl.value === 'none' ? '' : mkEl.value;
        persist();
        render();
      });
    }

    // Evento de borde BPMN (boundary) para tareas: "tipo|interrumpe"
    const bdEl = $('#propBoundary');
    if (bdEl) {
      bdEl.addEventListener('change', () => {
        const n = getNode(state.selectedNodeId);
        if (!n) return;
        if (bdEl.value === 'none') {
          n.boundary = undefined;
        } else {
          const [type, interr] = bdEl.value.split('|');
          n.boundary = { type, interrupting: interr === 'true' };
        }
        persist();
        render();
      });
    }

    // Evento de terminación BPMN (solo para fin)
    const termEl = $('#propTerminate');
    if (termEl) {
      termEl.addEventListener('change', () => {
        const n = getNode(state.selectedNodeId);
        if (!n) return;
        n.terminate = termEl.checked || undefined;
        persist();
        render();
      });
    }
  }

  function showLabelHint(value) {
    const hint = $('#propLabelHint');
    if (!hint) return;
    const v = (value || '').trim();
    if (!v) { hint.hidden = true; return; }

    const lower = v.toLowerCase();
    const firstWord = lower.split(/\s+/)[0].replace(/[^a-záéíóúñ]/g, '');

    // Verbo prohibido?
    const forbidden = window.VERBS_FORBIDDEN || {};
    if (forbidden[firstWord]) {
      hint.hidden = false;
      hint.className = 'field-hint error';
      hint.textContent = `"${firstWord}" → ${forbidden[firstWord]}`;
      return;
    }

    // Verbo permitido?
    const allowed = window.VERBS_ALLOWED || [];
    const isAllowed = allowed.some(a => firstWord.startsWith(a));

    // Longitud
    const words = v.split(/\s+/).length;
    if (v.length > 50 || words > 8) {
      hint.hidden = false;
      hint.className = 'field-hint warn';
      hint.textContent = `Demasiado larga (${v.length} car, ${words} pal). Máx 50 car / 8 palabras — considera descomponer.`;
      return;
    }

    if (!isAllowed) {
      hint.hidden = false;
      hint.className = 'field-hint warn';
      hint.textContent = `"${firstWord}" no está en el catálogo MBB. Prefiere: registrar, validar, aprobar, escalar, notificar, calcular…`;
      return;
    }

    hint.hidden = false;
    hint.className = 'field-hint ok';
    hint.textContent = 'Naming OK · verbo permitido + longitud adecuada';
  }

  function showExecHint(value) {
    const hint = $('#propExecHint');
    if (!hint) return;
    if (!value) { hint.hidden = true; return; }
    const t = (window.EXECUTION_TYPES || []).find(x => x.id === value);
    if (!t) { hint.hidden = true; return; }
    hint.hidden = false;
    hint.className = 'field-hint info';
    hint.textContent = t.desc;
  }

  function renderProperties() {
    const n = getNode(state.selectedNodeId);
    if (!n) {
      $('#propsEmpty').hidden = false;
      $('#propsForm').hidden = true;
      return;
    }
    $('#propsEmpty').hidden = true;
    $('#propsForm').hidden = false;
    if ($('#propNodeType')) $('#propNodeType').value = n.type || 'task';
    // Muestra el selector de gateway solo para decisiones
    if ($('#propGatewayWrap')) {
      $('#propGatewayWrap').hidden = n.type !== 'decision';
      if (n.type === 'decision' && $('#propGatewayType')) $('#propGatewayType').value = n.gatewayType || 'exclusive';
    }
    // Muestra el selector de evento solo para start/end/intermediate
    if ($('#propEventWrap')) {
      const isEvent = n.type === 'start' || n.type === 'end' || n.type === 'intermediate';
      $('#propEventWrap').hidden = !isEvent;
      if (isEvent && $('#propEventType')) $('#propEventType').value = n.eventType || 'none';
    }
    // Checkbox de terminación solo para eventos de fin
    if ($('#propTerminateWrap')) {
      $('#propTerminateWrap').hidden = n.type !== 'end';
      if (n.type === 'end' && $('#propTerminate')) $('#propTerminate').checked = !!n.terminate;
    }
    // Muestra el selector de marcador de actividad solo para tareas
    if ($('#propMarkerWrap')) {
      const isTaskType = n.type === 'task' || n.type === 'system';
      $('#propMarkerWrap').hidden = !isTaskType;
      if (isTaskType && $('#propMarker')) $('#propMarker').value = n.marker || 'none';
    }
    // Selector de evento de borde (boundary) solo para tareas
    if ($('#propBoundaryWrap')) {
      const isTaskType = n.type === 'task' || n.type === 'system';
      $('#propBoundaryWrap').hidden = !isTaskType;
      if (isTaskType && $('#propBoundary')) {
        const b = n.boundary;
        $('#propBoundary').value = b ? `${(typeof b === 'string' ? b : b.type)}|${(typeof b === 'object' ? b.interrupting !== false : true)}` : 'none';
      }
    }
    if ($('#propActivityCode')) $('#propActivityCode').value = n.activityCode || '';
    $('#propLabel').value = n.label || '';
    $('#propExecType').value = n.executionType || '';
    $('#propOwner').value = n.owner || '';
    $('#propSystem').value = n.system || '';
    $('#propTime').value = n.time || '';
    $('#propVolume').value = n.volume || '';
    $('#propVA').value = n.va || '';
    $('#propSla').value = n.sla || '';
    $('#propDocsIn').value = n.docsIn || '';
    $('#propDocsOut').value = n.docsOut || '';
    $('#propRules').value = n.rules || '';
    $('#propNotes').value = n.notes || '';
    showLabelHint(n.label || '');
    showExecHint(n.executionType || '');
  }

  // =================== PAINS PANEL ===================
  function attachPainListeners() {
    $('#btnAddPain').addEventListener('click', () => {
      const n = getNode(state.selectedNodeId);
      if (!n) return;
      const desc = $('#painDescription').value.trim();
      if (!desc) { alert('Describe el pain.'); return; }
      n.pains.push({
        id: 'p' + (state.nextId++),
        category: $('#painCategory').value,
        description: desc,
        severity: parseInt($('#painSeverity').value, 10),
        frequency: parseInt($('#painFrequency').value, 10)
      });
      $('#painDescription').value = '';
      persist();
      render();
    });
  }

  function renderPains() {
    const list = $('#painsList');
    const add = $('#painsAdd');
    list.innerHTML = '';
    const n = getNode(state.selectedNodeId);
    if (!n) {
      add.hidden = true;
      list.innerHTML = '<div class="empty-state">Selecciona un nodo para capturar sus pain points.</div>';
      return;
    }
    add.hidden = false;
    if (n.pains.length === 0) {
      list.innerHTML = '<div class="panel-hint">Sin pains capturados aún.</div>';
    } else {
      n.pains.forEach(p => {
        const cat = window.PAIN_CATEGORIES.find(c => c.id === p.category) || { label: '?', color: '#999', icon: '•' };
        const score = p.severity * p.frequency;
        const card = document.createElement('div');
        card.className = 'pain-card';
        card.style.borderLeftColor = cat.color;
        card.innerHTML = `
          <div class="pain-cat" style="color:${cat.color}">${cat.icon} ${cat.label}</div>
          <div class="pain-desc">${escapeHtml(p.description)}</div>
          <div class="pain-meta">Sev ${p.severity} · Frec ${p.frequency} · Score ${score}</div>
          <button class="pain-remove" data-id="${p.id}" title="Eliminar">✕</button>`;
        card.querySelector('.pain-remove').addEventListener('click', () => {
          n.pains = n.pains.filter(x => x.id !== p.id);
          persist(); render();
        });
        list.appendChild(card);
      });
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // =================== KPI LIBRARY ===================
  function attachKpiListeners() {
    $('#kpiSearch').addEventListener('input', renderKpiLibrary);
    $('#kpiFilterIndustry').addEventListener('change', renderKpiLibrary);
  }

  function populateKpiLibrary() { renderKpiLibrary(); }

  function renderKpiLibrary() {
    const q = ($('#kpiSearch').value || '').toLowerCase();
    const ind = $('#kpiFilterIndustry').value || state.meta.industry || '';
    const list = $('#kpiList');
    list.innerHTML = '';
    const filtered = window.KPI_LIBRARY.filter(k => {
      const okInd = !ind || k.industry === ind || k.industry === 'Transversal';
      const okQ = !q || k.name.toLowerCase().includes(q) || k.description.toLowerCase().includes(q);
      return okInd && okQ;
    });
    if (filtered.length === 0) {
      list.innerHTML = '<div class="panel-hint">Sin coincidencias.</div>';
      return;
    }
    filtered.forEach(k => {
      const card = document.createElement('div');
      card.className = 'kpi-card';
      card.innerHTML = `
        <div class="kpi-name">${escapeHtml(k.name)} <span style="color:#7A7A7A;font-weight:400">(${escapeHtml(k.unit)})</span></div>
        <div class="kpi-tags">
          <span class="kpi-tag">${escapeHtml(k.industry)}</span>
          <span class="kpi-tag">${escapeHtml(k.macroprocess)}</span>
        </div>
        <div class="kpi-bench">Benchmark: ${escapeHtml(k.benchmark)}</div>
        <div class="kpi-desc">${escapeHtml(k.description)}</div>`;
      // KPI status badge si ya fue capturado
      state._kpiValues = state._kpiValues || {};
      const captured = state._kpiValues[k.id];
      if (captured) {
        card.innerHTML += `<div style="margin-top:6px;padding:4px 8px;background:#FFF3E0;border-radius:3px;font-size:11px;color:#E65100"><strong>Valor actual:</strong> ${escapeHtml(captured.value)} · <strong>Gap:</strong> ${escapeHtml(captured.gap || '—')}</div>`;
      }
      card.addEventListener('click', () => {
        openKpiCaptureModal(k);
      });
      list.appendChild(card);
    });
  }

  // Modal: capturar valor actual del cliente + calcular gap
  function openKpiCaptureModal(k) {
    state._kpiValues = state._kpiValues || {};
    const current = state._kpiValues[k.id] || {};
    const html = `
      <div style="margin-bottom:10px"><strong>${escapeHtml(k.name)}</strong> <span style="color:#7A7A7A">(${escapeHtml(k.unit)})</span></div>
      <div style="background:#F8F8F8;padding:10px;border-radius:4px;margin-bottom:12px;font-size:12px">
        ${escapeHtml(k.description)}
        <div style="margin-top:6px;color:#5B4FCF;font-weight:600">Benchmark sectorial: ${escapeHtml(k.benchmark)}</div>
      </div>
      <label style="display:block;margin-bottom:8px;font-size:12px;font-weight:600">Valor actual del cliente
        <input type="text" id="kpiActualValue" value="${escapeHtml(current.value || '')}" placeholder="ej. 6.2" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:3px;margin-top:3px" />
      </label>
      <label style="display:block;margin-bottom:8px;font-size:12px;font-weight:600">Gap vs benchmark (calculado o manual)
        <input type="text" id="kpiGap" value="${escapeHtml(current.gap || '')}" placeholder="ej. -2.2 pp (por encima del benchmark)" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:3px;margin-top:3px" />
      </label>
      <label style="display:block;font-size:12px;font-weight:600">Fuente del dato
        <input type="text" id="kpiSource" value="${escapeHtml(current.source || '')}" placeholder="ej. Dashboard SBS, reporte interno BO 04/2026" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:3px;margin-top:3px" />
      </label>
      <p class="panel-hint" style="margin-top:10px">Los KPIs capturados aparecen en el slide PPTX con su gap. El gap se calcula automáticamente si valor y benchmark son numéricos.</p>`;

    openModal('Capturar valor actual · KPI', html, () => {
      const v = $('#kpiActualValue').value.trim();
      let g = $('#kpiGap').value.trim();
      const src = $('#kpiSource').value.trim();
      // Auto-calcular gap si ambos son números
      if (!g && v) {
        const numActual = parseFloat(v.replace(/[^\d.\-]/g, ''));
        const numBench = parseFloat(k.benchmark.replace(/[^\d.\-]/g, ''));
        if (!isNaN(numActual) && !isNaN(numBench)) {
          const diff = numActual - numBench;
          const sign = diff >= 0 ? '+' : '';
          g = `${sign}${diff.toFixed(2)} ${k.unit}`;
        }
      }
      if (v) {
        state._kpiValues[k.id] = { name: k.name, unit: k.unit, benchmark: k.benchmark, value: v, gap: g, source: src };
      } else {
        delete state._kpiValues[k.id];
      }
      persist();
      renderKpiLibrary();
      copilotPost('ai', `KPI capturado: **${k.name}** = ${v || '—'} (gap ${g || '—'}). Se incluirá en el slide de KPIs del PPTX.`);
    });
  }

  // =================== COPILOT (mock) ===================
  function attachCopilotListeners() {
    $$('.copilot-action').forEach(b => {
      b.addEventListener('click', () => handleCopilotAction(b.dataset.action));
    });
    $('#btnCopilotSend').addEventListener('click', () => {
      const txt = $('#copilotPrompt').value.trim();
      if (!txt) return;
      copilotPost('user', txt);
      $('#copilotPrompt').value = '';
      setTimeout(() => copilotPost('ai', mockCopilotResponse(txt)), 350);
    });
    copilotPost('ai',
      '¡Hola! Soy tu copiloto **ProcessIQ**.\n\n' +
      'Estoy aquí para ayudarte a levantar, diagnosticar y reingenierizar procesos más rápido.\n' +
      'Empieza completando el **nombre, industria y macroproceso** arriba, y luego usa las acciones rápidas o pídeme algo en lenguaje natural.\n\n' +
      'Ejemplo: *"Levanta el proceso de gestión de reclamos para un banco minorista peruano."*');
  }

  function handleCopilotAction(action) {
    if (aiReady() && AI_TASKS[action]) { copilotPost('user', AI_TASKS[action].etiqueta + ' (IA).'); runAiTask(action); return; }

    activateTab('copilot');
    switch (action) {
      case 'generate':
        openModal('Generar proceso desde descripción',
          '<textarea id="modalInput" placeholder="Describe el proceso a levantar..."></textarea>',
          () => {
            const desc = $('#modalInput').value.trim();
            if (!desc) return;
            copilotPost('user', 'Generar proceso: ' + desc);
            ingestarDescripcion(desc);
          });
        break;
      case 'detect-pains':
        copilotPost('user', 'Detecta pains en el diagrama actual.');
        setTimeout(detectPainsMock, 300);
        break;
      case 'suggest-kpis':
        copilotPost('user', 'Sugiere KPIs aplicables.');
        setTimeout(suggestKpisMock, 300);
        break;
      case 'propose-tobe':
        copilotPost('user', 'Propón reingeniería to-be.');
        setTimeout(proposeToBeMock, 300);
        break;
      case 'raci':
        copilotPost('user', 'Generar matriz RACI.');
        setTimeout(generateRaci, 250);
        break;
      case 'sipoc':
        copilotPost('user', 'Generar SIPOC del proceso.');
        setTimeout(generateSipoc, 250);
        break;
      case 'impact-effort':
        copilotPost('user', 'Generar matriz impacto-esfuerzo.');
        setTimeout(generateImpactEffort, 250);
        break;
      case 'whatif':
        copilotPost('user', 'Comparar escenarios What-If.');
        setTimeout(openWhatIfModal, 250);
        break;
      case 'automation':
        copilotPost('user', 'Detectar oportunidades de automatización.');
        setTimeout(analyzeAutomation, 250);
        break;
      case 'bottleneck':
        copilotPost('user', 'Identificar cuello de botella y ruta crítica.');
        setTimeout(analyzeBottleneck, 250);
        break;
      case 'variants':
        copilotPost('user', 'Analizar variantes del proceso.');
        setTimeout(analyzeVariants, 250);
        break;
      case 'value-map':
        copilotPost('user', 'Mostrar mapa de valor Lean (VA/NVA).');
        setTimeout(toggleValueMap, 250);
        break;
      case 'backlog':
        copilotPost('user', 'Generar backlog de iniciativas.');
        setTimeout(generateBacklog, 250);
        break;
      case 'exec-summary':
        copilotPost('user', 'Resumen ejecutivo del diagnóstico.');
        setTimeout(execSummaryMock, 300);
        break;
      case 'merge-gateways':
        copilotPost('user', 'Insertar compuertas de convergencia.');
        setTimeout(insertMergeGateways, 250);
        break;
      case 'ai-pains':
        copilotPost('user', 'Analisis profundo de dolores (IA).');
        setTimeout(aiAnalyzePains, 200);
        break;
      case 'autofit':
        copilotPost('user', 'Autoajustar el diagrama.');
        setTimeout(() => autoFitDiagram(), 220);
        break;
      case 'relayout':
        copilotPost('user', 'Reorganizar el diagrama.');
        setTimeout(() => {
          state._wrap = undefined;          // vuelve a decidir automáticamente
          autoLayout();
          maybeFitOnLoad();
          const L = state._lanes || {};
          copilotPost('ai', `**Diagrama reorganizado.** ${L.wrap ? `Modo envolvente activo: ${L.bands} bandas de hasta ${L.wrapAt} columnas (evita el diagrama kilométrico).` : 'Disposición en una sola banda.'} Carriles ordenados para minimizar cruces y retornos de reproceso por corredor inferior.`);
        }, 200);
        break;
    }
  }

  function copilotPost(who, text) {
    const wrap = $('#copilotMessages');
    const div = document.createElement('div');
    div.className = 'copilot-msg ' + who;
    if (who === 'ai') {
      div.innerHTML = `<div class="author">ProcessIQ · IA</div><div class="bubble">${formatMd(text)}</div>`;
    } else {
      div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
    }
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
  }

  function formatMd(s) {
    return escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // Quien pide una pestaña quiere verla: el cajón se abre y queda fijo.
  function activateTab(name) {
    abrirPanel(name, false);
  }

  // Cajón derecho. `auto` marca que lo abrió la selección (y que por tanto
  // puede cerrarse solo al deseleccionar).
  function abrirPanel(name, auto) {
    document.body.classList.add('panel-open');
    state._panelAuto = !!auto;
    $$('.tab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    const t = $('.tab[data-tab="' + name + '"]');
    const titulo = $('#drawerTitle');
    if (t && titulo) titulo.textContent = t.dataset.title || t.textContent.trim();
    if (name === 'ficha') renderFichaTab();
    saveUiState();
  }
  function cerrarPanel() {
    document.body.classList.remove('panel-open');
    state._panelAuto = false;
    saveUiState();
  }

  // =================== FICHA DE PROCESO — edición ===================
  // Listas editadas como texto: una fila por línea, campos separados por "|".
  function parsePipeLines(text, keys) {
    return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.split('|').map(s => s.trim());
      const o = {}; keys.forEach((k, i) => o[k] = parts[i] || ''); return o;
    });
  }
  function serializePipeLines(arr, keys) {
    return (arr || []).map(o => keys.map(k => o[k] || '').join(' | ')).join('\n');
  }
  function renderFichaTab() {
    const f = state.ficha || (state.ficha = emptyFicha());
    const set = (id, v) => { const el = $('#' + id); if (el && document.activeElement !== el) el.value = v || ''; };
    set('fichaCode', f.code); set('fichaVersion', f.version); set('fichaObjetivo', f.objetivo);
    set('fichaAlcanceAreas', f.alcanceAreas); set('fichaAlcanceDesde', f.alcanceDesde);
    set('fichaAlcanceHasta', f.alcanceHasta); set('fichaAlcanceIncluye', f.alcanceIncluye);
    set('fichaDescripcion', f.descripcion);
    set('fichaGobernanza', serializePipeLines(f.gobernanza, ['rol', 'cargo', 'nombre', 'fecha']));
    set('fichaSistemas', serializePipeLines(f.sistemas, ['nombre', 'uso']));
    set('fichaTerminos', serializePipeLines(f.terminos, ['termino', 'definicion']));
    set('fichaAnexos', serializePipeLines(f.anexos, ['codigo', 'nombre']));
    set('fichaCambios', serializePipeLines(f.cambios, ['version', 'fecha', 'descripcion']));
  }
  function attachFichaListeners() {
    const f = () => (state.ficha || (state.ficha = emptyFicha()));
    const bindText = (id, key) => { const el = $('#' + id); if (el) el.addEventListener('input', e => { f()[key] = e.target.value; persist(); }); };
    bindText('fichaCode', 'code'); bindText('fichaVersion', 'version'); bindText('fichaObjetivo', 'objetivo');
    bindText('fichaAlcanceAreas', 'alcanceAreas'); bindText('fichaAlcanceDesde', 'alcanceDesde');
    bindText('fichaAlcanceHasta', 'alcanceHasta'); bindText('fichaAlcanceIncluye', 'alcanceIncluye');
    bindText('fichaDescripcion', 'descripcion');
    const bindList = (id, key, keys) => { const el = $('#' + id); if (el) el.addEventListener('input', e => { f()[key] = parsePipeLines(e.target.value, keys); persist(); }); };
    bindList('fichaGobernanza', 'gobernanza', ['rol', 'cargo', 'nombre', 'fecha']);
    bindList('fichaSistemas', 'sistemas', ['nombre', 'uso']);
    bindList('fichaTerminos', 'terminos', ['termino', 'definicion']);
    bindList('fichaAnexos', 'anexos', ['codigo', 'nombre']);
    bindList('fichaCambios', 'cambios', ['version', 'fecha', 'descripcion']);
    const prev = $('#btnFichaPreview'); if (prev) prev.addEventListener('click', openFichaPreview);
  }

  // -------- Mock generation: detecta verbos comunes para crear actividades --------
  function generateProcessFromDescription(desc) {
    const lower = desc.toLowerCase();
    let template;
    if (lower.includes('reclamo') || lower.includes('queja')) {
      template = [
        { type: 'start',    label: 'Reclamo recibido' },
        { type: 'task',     label: 'Registrar reclamo en CRM', owner: 'Asesor Call Center', system: 'CRM', executionType: 'system' },
        { type: 'decision', label: '¿Se resuelve en primera línea?' },
        { type: 'task',     label: 'Resolver y cerrar caso', owner: 'Asesor Call Center', executionType: 'phone' },
        { type: 'task',     label: 'Escalar a back office', owner: 'Asesor Call Center', system: 'Workflow', executionType: 'system' },
        { type: 'task',     label: 'Investigar caso', owner: 'Analista Back Office', executionType: 'manual' },
        { type: 'task',     label: 'Aprobar resolución', owner: 'Jefe Back Office', executionType: 'manual' },
        { type: 'task',     label: 'Notificar al cliente', owner: 'Asesor Call Center', executionType: 'email' },
        { type: 'end',      label: 'Reclamo resuelto a favor cliente' },
        { type: 'end',      label: 'Reclamo desestimado' }
      ];
    } else if (lower.includes('cobranza') || lower.includes('o2c') || lower.includes('ventas')) {
      template = [
        { type: 'start',    label: 'Pedido recibido' },
        { type: 'task',     label: 'Validar crédito del cliente', owner: 'Riesgos', system: 'ERP', executionType: 'system' },
        { type: 'task',     label: 'Registrar pedido', owner: 'Comercial', system: 'ERP', executionType: 'system' },
        { type: 'task',     label: 'Despachar mercadería', owner: 'Logística', system: 'WMS', executionType: 'system' },
        { type: 'task',     label: 'Emitir factura', owner: 'Facturación', system: 'ERP', executionType: 'automatic' },
        { type: 'task',     label: 'Aplicar cobro', owner: 'Tesorería', executionType: 'manual' },
        { type: 'end',      label: 'Cobro aplicado' }
      ];
    } else if (lower.includes('compra') || lower.includes('p2p') || lower.includes('proveedor')) {
      template = [
        { type: 'start',    label: 'Necesidad identificada' },
        { type: 'task',     label: 'Crear requisición', owner: 'Solicitante', system: 'ERP', executionType: 'system' },
        { type: 'task',     label: 'Aprobar requisición', owner: 'Gerencia', executionType: 'manual' },
        { type: 'task',     label: 'Emitir orden de compra', owner: 'Compras', system: 'ERP', executionType: 'system' },
        { type: 'task',     label: 'Recibir bien o servicio', owner: 'Almacén', system: 'WMS', executionType: 'system' },
        { type: 'task',     label: 'Conciliar 3-way match', owner: 'Cuentas por Pagar', executionType: 'manual' },
        { type: 'task',     label: 'Liberar pago a proveedor', owner: 'Tesorería', system: 'ERP', executionType: 'system' },
        { type: 'end',      label: 'Pago liberado' }
      ];
    } else if (lower.includes('onboarding') || lower.includes('alta de cliente') || lower.includes('kyc')) {
      template = [
        { type: 'start',    label: 'Cliente solicita alta' },
        { type: 'task',     label: 'Capturar datos del cliente', owner: 'Comercial', system: 'CRM', executionType: 'system' },
        { type: 'task',     label: 'Validar identidad y AML', owner: 'Compliance', system: 'KYC Tool', executionType: 'ai' },
        { type: 'decision', label: '¿KYC aprobado?' },
        { type: 'task',     label: 'Notificar rechazo al cliente', owner: 'Compliance', executionType: 'email' },
        { type: 'task',     label: 'Crear cliente en core bancario', owner: 'Operaciones', system: 'Core', executionType: 'automatic' },
        { type: 'task',     label: 'Activar productos contratados', owner: 'Operaciones', system: 'Core', executionType: 'system' },
        { type: 'end',      label: 'Cliente activo' },
        { type: 'end',      label: 'Cliente rechazado por KYC' }
      ];
    } else {
      template = [
        { type: 'start',    label: 'Solicitud recibida' },
        { type: 'task',     label: 'Validar requisitos', executionType: 'manual' },
        { type: 'task',     label: 'Registrar caso', executionType: 'system' },
        { type: 'decision', label: '¿Cumple criterios?' },
        { type: 'task',     label: 'Procesar aprobación', executionType: 'system' },
        { type: 'task',     label: 'Notificar rechazo', executionType: 'email' },
        { type: 'end',      label: 'Caso aprobado' },
        { type: 'end',      label: 'Caso rechazado' }
      ];
    }

    // Limpia y dibuja
    state.nodes = [];
    state.edges = [];
    state.selectedNodeId = null;
    let x = 80, y = 100;
    const created = [];
    template.forEach((t, idx) => {
      const def = SHAPE_DEFAULTS[t.type];
      const defaultExec = t.type === 'system' ? 'system' : (t.type === 'task' ? 'manual' : '');
      const node = {
        id: 'n' + (state.nextId++),
        type: t.type,
        x, y,
        w: def.w, h: def.h,
        label: t.label,
        executionType: t.executionType || defaultExec,
        owner: t.owner || '', system: t.system || '',
        time: '', volume: '', va: '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: []
      };
      state.nodes.push(node);
      created.push(node);
      x += def.w + 60;
      if ((idx + 1) % 5 === 0) { x = 80; y += 140; }
    });

    // Conecta linealmente (sin encadenar end → end)
    for (let i = 0; i < created.length - 1; i++) {
      if (created[i + 1].type === 'end' && created[i].type === 'end') continue;
      state.edges.push({ id: 'e' + (state.nextId++), from: created[i].id, to: created[i + 1].id, label: '' });
    }

    // Reconecta ends huérfanos desde el último gateway disponible (rama "No")
    const inDegMap = {};
    state.edges.forEach(e => inDegMap[e.to] = (inDegMap[e.to] || 0) + 1);
    created.forEach((n, idx) => {
      if (n.type !== 'end' || inDegMap[n.id]) return;
      for (let j = idx - 1; j >= 0; j--) {
        if (created[j].type === 'decision') {
          state.edges.push({ id: 'e' + (state.nextId++), from: created[j].id, to: n.id, label: 'No' });
          // Etiqueta también la rama positiva del gateway si está vacía
          const positiveBranch = state.edges.find(e => e.from === created[j].id && !e.label && e.to !== n.id);
          if (positiveBranch) positiveBranch.label = 'Sí';
          break;
        }
      }
    });

    ensureDecisionBranches();
    persist();
    autoLayout();  // ← aplica top-to-bottom MBB
    render();
    copilotPost('ai',
      `He generado un proceso as-is con **${created.length} actividades** basado en patrones APQC PCF + playbook MBB.\n\n` +
      `Sugerencias inmediatas:\n` +
      `• Completa los **responsables** y **sistemas soporte** en cada actividad.\n` +
      `• Captura **pain points** (handoffs, esperas, reprocesos) — son el insumo del diagnóstico.\n` +
      `• Revisa la pestaña **KPIs** para vincular indicadores sectoriales.\n\n` +
      `¿Quieres que detecte pains típicos del sector?`);
  }

  function detectPainsMock() {
    if (state.nodes.length === 0) { copilotPost('ai', 'No hay un diagrama aún. Genera o dibuja un proceso primero.'); return; }
    const handoffs = countHandoffs();
    const decisions = state.nodes.filter(n => n.type === 'decision').length;
    const manual = state.nodes.filter(n => n.type === 'task' && !n.system).length;

    let msg = `**Diagnóstico automático del as-is**\n\n`;
    msg += `• **${handoffs} handoff(s)** detectados entre roles distintos. Cada handoff agrega ~10-15% de lead time y riesgo de pérdida de información.\n`;
    msg += `• **${decisions} punto(s) de decisión**. Si carecen de criterios documentados, son fuente de variabilidad e inequidad.\n`;
    msg += `• **${manual} actividad(es) sin sistema soporte** — candidatas a automatización (RPA / workflow).\n\n`;
    msg += `**Pain points típicos del sector ${state.meta.industry || '(define industria)'}:**\n`;
    if (state.meta.industry === 'Banca') {
      msg += `• Reproceso por documentación incompleta del cliente.\n• Tiempos de respuesta heterogéneos según canal.\n• Validaciones manuales duplicadas entre frontline y back office.`;
    } else if (state.meta.industry === 'Retail') {
      msg += `• Quiebres de stock por baja sincronización tienda-CD.\n• Devoluciones sin trazabilidad financiera.\n• Promociones ejecutadas con desfase entre canales.`;
    } else if (state.meta.industry === 'Manufactura') {
      msg += `• Paradas no planificadas por mantenimiento reactivo.\n• Inventario en proceso sobre-dimensionado.\n• Calidad detectada al final de línea, no en estación.`;
    } else if (state.meta.industry === 'Sector Público') {
      msg += `• Trámites con múltiples ventanillas (one-stop-shop ausente).\n• Documentación física que duplica registros digitales.\n• Plazos TUPA incumplidos por handoffs inter-áreas.`;
    } else {
      msg += `• Define la industria del proceso para sugerencias específicas.`;
    }
    copilotPost('ai', msg);
  }

  function countHandoffs() {
    let count = 0;
    state.edges.forEach(e => {
      const a = getNode(e.from), b = getNode(e.to);
      if (a && b && a.owner && b.owner && a.owner !== b.owner) count++;
    });
    return count;
  }

  function suggestKpisMock() {
    const ind = state.meta.industry;
    const mac = state.meta.macroprocess;
    let kpis = window.KPI_LIBRARY.filter(k => (k.industry === ind || k.industry === 'Transversal') && (!mac || k.macroprocess === mac)).slice(0, 5);
    if (kpis.length === 0) kpis = window.KPI_LIBRARY.slice(0, 5);
    let msg = `**KPIs recomendados** para ${ind || 'tu proceso'}${mac ? ' (' + mac + ')' : ''}:\n\n`;
    kpis.forEach(k => {
      msg += `• **${k.name}** (${k.unit}) — benchmark: ${k.benchmark}\n`;
    });
    msg += `\nRevisa la pestaña **KPIs** para ver la librería completa y hacer click en cada uno para agregarlo al diagnóstico.`;
    copilotPost('ai', msg);
  }

  function proposeToBeMock() {
    if (state.nodes.length === 0) { copilotPost('ai', 'Necesito un diagrama as-is para proponer el to-be.'); return; }
    const manual = state.nodes.filter(n => n.type === 'task' && !n.system);
    const handoffs = countHandoffs();
    let totalPains = 0;
    state.nodes.forEach(n => totalPains += (n.pains?.length || 0));

    let msg = `**Propuesta de reingeniería (to-be)**\n\n`;
    msg += `Lectura del as-is: ${state.nodes.length} actividades, ${handoffs} handoffs entre roles, ${manual.length} sin sistema, ${totalPains} pains capturados.\n\n`;
    msg += `**Palancas sugeridas:**\n`;
    msg += `1. **Automatización RPA** en las ${manual.length} actividades sin sistema soporte → ahorro estimado 0.3-0.5 FTE por actividad de alto volumen.\n`;
    msg += `2. **Eliminar handoffs** mediante célula multifuncional o workflow orquestado → reducción 20-30% en lead time.\n`;
    msg += `3. **Self-service / canal digital** en las actividades de captura → reducción 40-60% en errores de origen.\n`;
    msg += `4. **Reglas de decisión codificadas** (DMN / motor de reglas) en los puntos de gateway → consistencia y trazabilidad.\n`;
    msg += `5. **KPIs en tiempo real** con dashboard único → ciclos de mejora mensuales en lugar de trimestrales.\n\n`;
    msg += `**Beneficios estimados** (rango referencia industria):\n`;
    msg += `• Lead time: -35% a -50%\n• FTE liberados: 15-25% de la dotación actual\n• Calidad (errores): -60%\n• CSAT/NPS: +10 a +20 puntos\n\n`;
    msg += `Dime "dibuja el to-be" si quieres que genere la versión optimizada en un nuevo lienzo.`;
    copilotPost('ai', msg);
  }

  function execSummaryMock() {
    const name = state.meta.name || '[Nombre del proceso]';
    const ind = state.meta.industry || '[Industria]';
    const mac = state.meta.macroprocess || '[Macroproceso]';
    const nodes = state.nodes.length;
    const handoffs = countHandoffs();
    let painsTotal = 0, painsCrit = 0;
    state.nodes.forEach(n => (n.pains || []).forEach(p => {
      painsTotal++;
      if (p.severity >= 4) painsCrit++;
    }));

    const msg =
`**RESUMEN EJECUTIVO — DIAGNÓSTICO DE PROCESO**

**Proceso:** ${name}
**Industria / Macroproceso:** ${ind} · ${mac}

**Hallazgos clave:**
• El proceso comprende ${nodes} actividades con ${handoffs} handoffs inter-rol.
• Se identificaron ${painsTotal} pain points (${painsCrit} críticos, severidad ≥ 4).
• Existe oportunidad de automatización en actividades sin sistema soporte.

**Recomendaciones priorizadas:**
1. Quick wins (0-3 meses): estandarización de criterios de decisión + eliminación de controles duplicados.
2. Mediano plazo (3-9 meses): automatización RPA/IDP en actividades manuales de alto volumen.
3. Estructural (9-18 meses): rediseño organizacional hacia células multifuncionales + dashboard en tiempo real.

**Impacto estimado:**
Lead time -40%, FTE liberados 15-25%, mejora de CSAT/NPS doble dígito.

**Próximo paso sugerido:**
Validar hallazgos con sponsor, priorizar oportunidades en matriz impacto-esfuerzo, y construir business case.`;

    copilotPost('ai', msg);
  }

  // F7 — Edición por lenguaje natural. Interpreta comandos y los aplica al diagrama.
  // Devuelve un string de confirmación, o null si no es un comando de edición.
  function tryNlCommand(prompt) {
    const p = prompt.trim();
    const low = p.toLowerCase();
    // Busca nodo por coincidencia de etiqueta (substring, case-insensitive)
    const findNode = (q) => {
      if (!q) return null;
      const ql = q.toLowerCase().trim().replace(/^["']|["']$/g, '');
      // exacto primero, luego substring
      return state.nodes.find(n => (n.label || '').toLowerCase() === ql) ||
             state.nodes.find(n => (n.label || '').toLowerCase().includes(ql)) ||
             state.nodes.find(n => ql.includes((n.label || '').toLowerCase()) && n.label);
    };
    const clean = (s) => s.replace(/^["']|["']$/g, '').replace(/^(el |la |paso |actividad |tarea |la actividad |el paso )/i, '').trim();

    // 1) Agregar/insertar X después/antes de Y
    let m = low.match(/^(?:agregar|añadir|anadir|insertar|crear)\s+(?:paso|actividad|tarea)?\s*(.+?)\s+(despu[eé]s|antes)\s+de\s+(.+)$/i);
    if (m) {
      const after = m[2].startsWith('desp');
      const ref = findNode(m[3]);
      if (!ref) return `No encontré la actividad "${clean(m[3])}". Verifica el nombre.`;
      const def = SHAPE_DEFAULTS.task;
      const node = { id: 'n' + (state.nextId++), type: 'task', x: ref.x, y: ref.y, w: def.w, h: def.h,
        label: titleCaseFirst(clean(m[1])), executionType: 'manual', activityCode: '',
        owner: ref.owner || '', system: '', time: '', volume: '', va: '', sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: [] };
      state.nodes.push(node);
      if (after) {
        // Redirige las salidas de ref hacia el nuevo nodo
        const outs = state.edges.filter(e => e.from === ref.id);
        outs.forEach(e => { e.from = node.id; });
        state.edges.push({ id: 'e' + (state.nextId++), from: ref.id, to: node.id, label: '' });
      } else {
        const ins = state.edges.filter(e => e.to === ref.id);
        ins.forEach(e => { e.to = node.id; });
        state.edges.push({ id: 'e' + (state.nextId++), from: node.id, to: ref.id, label: '' });
      }
      ensureDecisionBranches(); persist(); autoLayout();
      return `✅ Agregué "${node.label}" ${after ? 'después' : 'antes'} de "${ref.label}".`;
    }

    // 2) Eliminar / borrar / quitar X
    m = low.match(/^(?:eliminar|borrar|quitar|remover)\s+(?:el |la |paso |actividad |tarea )?(.+)$/i);
    if (m) {
      const ref = findNode(m[1]);
      if (!ref) return `No encontré "${clean(m[1])}" para eliminar.`;
      // Reconecta: predecesores → sucesores
      const preds = state.edges.filter(e => e.to === ref.id).map(e => e.from);
      const succs = state.edges.filter(e => e.from === ref.id).map(e => e.to);
      state.edges = state.edges.filter(e => e.from !== ref.id && e.to !== ref.id);
      preds.forEach(pr => succs.forEach(su => {
        if (!state.edges.some(e => e.from === pr && e.to === su)) state.edges.push({ id: 'e' + (state.nextId++), from: pr, to: su, label: '' });
      }));
      state.nodes = state.nodes.filter(n => n.id !== ref.id);
      persist(); autoLayout();
      return `✅ Eliminé "${ref.label}" y reconecté el flujo.`;
    }

    // 3) Renombrar / cambiar X a/por Y
    m = low.match(/^(?:renombrar|renombra|cambiar|cambia)\s+(.+?)\s+(?:a|por)\s+(.+)$/i);
    if (m) {
      const ref = findNode(m[1]);
      if (!ref) return `No encontré "${clean(m[1])}" para renombrar.`;
      const oldL = ref.label;
      ref.label = titleCaseFirst(clean(m[2]));
      persist(); render();
      return `✅ Renombré "${oldL}" → "${ref.label}".`;
    }

    // 4) Conectar X con/a Y
    m = low.match(/^(?:conectar|conecta|une|unir)\s+(.+?)\s+(?:con|a|hacia|y)\s+(.+)$/i);
    if (m) {
      const a = findNode(m[1]), b = findNode(m[2]);
      if (!a || !b) return `No encontré ${!a ? '"' + clean(m[1]) + '"' : '"' + clean(m[2]) + '"'}.`;
      if (!state.edges.some(e => e.from === a.id && e.to === b.id)) {
        state.edges.push({ id: 'e' + (state.nextId++), from: a.id, to: b.id, label: '' });
        persist(); autoLayout();
        return `✅ Conecté "${a.label}" → "${b.label}".`;
      }
      return `Ya existe esa conexión.`;
    }

    // 5) Marcar X como [tipo de ejecución]
    m = low.match(/^(?:marcar|marca|cambiar tipo de|poner)\s+(.+?)\s+como\s+(autom[aá]tic[oa]|manual|sistema|rpa|bot|ia|correo|email|tel[eé]fono|documental)/i);
    if (m) {
      const ref = findNode(m[1]);
      if (!ref) return `No encontré "${clean(m[1])}".`;
      const map = { 'automatico':'automatic','manual':'manual','sistema':'system','rpa':'rpa','bot':'rpa','ia':'ai','correo':'email','email':'email','telefono':'phone','documental':'document' };
      // Normaliza acentos para el lookup (automático → automatico)
      const key = m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const exec = map[key] || 'manual';
      ref.executionType = exec; ref.activityCode = '';
      ensureDecisionBranches(); persist(); autoLayout();
      const t = (window.EXECUTION_TYPES || []).find(x => x.id === exec);
      return `✅ "${ref.label}" marcada como ${t ? t.bpmn : exec}.`;
    }

    return null; // no es un comando de edición
  }

  function titleCaseFirst(s) { s = (s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); }

  // v3.8.4: una descripcion escrita en el copiloto se interpreta con Claude por
  // la misma ingesta que un documento (codigo del equipo, nivel, progreso).
  // Antes elegia una PLANTILLA de ejemplo por palabras clave y parecia IA sin
  // serlo. setTimeout: openModal cierra su ventana DESPUES del callback y la
  // ingesta reutiliza esa misma ventana para pedir el codigo o el nivel.
  function ingestarDescripcion(desc) {
    const notas = $('#notesInput');
    if (notas) notas.value = desc;
    openIngestModal();
    const mas = document.querySelector('#ingestModal .ingest-more');
    if (mas) mas.open = true;
    setTimeout(() => runIngest(null), 0);
  }

  function mockCopilotResponse(prompt) {
    // F7: intenta interpretar como comando de edición primero
    const cmd = tryNlCommand(prompt);
    if (cmd !== null) return cmd;
    const p = prompt.toLowerCase();
    if (p.includes('hola') || p.includes('buenos') || p.includes('buenas')) return '¡Hola! ¿En qué proceso te ayudo hoy?';
    if (p.includes('genera') || p.includes('levanta') || p.includes('dibuja')) { ingestarDescripcion(prompt); return 'Interpretando tu descripción con IA…'; }
    if (p.includes('pain') || p.includes('dolor')) { detectPainsMock(); return ''; }
    if (p.includes('kpi') || p.includes('indicador')) { suggestKpisMock(); return ''; }
    if (p.includes('to-be') || p.includes('tobe') || p.includes('reingenier')) { proposeToBeMock(); return ''; }
    if (p.includes('resumen') || p.includes('ejecutivo')) { execSummaryMock(); return ''; }
    return `Entiendo tu pedido. En el MVP el copiloto trabaja con plantillas locales — al conectar Claude API en v1 daré respuestas contextualizadas a tu diagrama, industria y entregables previos del área.\n\nPrueba con las acciones rápidas arriba: generar, detectar pains, sugerir KPIs, to-be, o resumen ejecutivo.`;
  }

  // =================== MODAL ===================
  function openModal(title, bodyHtml, onOk) {
    const modal = $('#modal');
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    modal.hidden = false;

    const cancel = () => { modal.hidden = true; };

    $('#modalCancel').onclick = cancel;
    $('#modalOk').onclick = () => {
      try { onOk(); } catch (err) { console.error('[ProcessIQ] modal onOk error:', err); alert('Error: ' + err.message); }
      cancel();
    };
    // Click outside (sobre el backdrop) cierra el modal
    modal.onclick = (e) => { if (e.target === modal) cancel(); };
    // ESC cierra
    const escHandler = (e) => { if (e.key === 'Escape') { cancel(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
    // Auto-focus primer input/textarea del body
    requestAnimationFrame(() => {
      const first = $('#modalBody').querySelector('textarea, input:not([type=hidden]), select');
      if (first) first.focus();
    });
  }

  // =================== KEYBOARD ===================
  function attachKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); e.preventDefault(); }
      if (e.key === 'c' || e.key === 'C') toggleConnectMode();
      if (e.key === 'Escape') {
        if (document.body.classList.contains('present-mode')) { togglePresentMode(false); return; }
        if (window.cerrarDesplegables) window.cerrarDesplegables();
        const habiaSeleccion = !!(state.selectedNodeId || state.selectedEdgeId);
        state.selectedNodeId = null; state.selectedEdgeId = null; state.connectSourceId = null; render();
        // Esc sin selección cierra el cajón (con selección, primero deselecciona)
        if (!habiaSeleccion && document.body.classList.contains('panel-open')) cerrarPanel();
      }
    });
  }

  // Onboarding: botones del empty-state
  function attachOnboardListeners() {
    const onb = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };
    onb('onbIngest', () => openIngestModal());
    onb('onbDemo', () => openExamplesModal());
    onb('onbDraw', () => { activateTab('copilot'); });

    // Toggle de la leyenda BPMN sobre el canvas
    const legend = $('#bpmnLegend'), legendBtn = $('#btnLegend');
    const setLegend = (show) => {
      if (!legend) return;
      legend.hidden = !show;
      if (legendBtn) legendBtn.classList.toggle('active', show);
    };
    if (legendBtn) legendBtn.addEventListener('click', () => setLegend(legend.hidden));
    onb('btnLegendClose', () => setLegend(false));

    // Controles de zoom
    onb('btnZoomIn', () => setZoom((state.zoom || 1) * 1.2));
    onb('btnZoomOut', () => setZoom((state.zoom || 1) / 1.2));
    onb('btnZoomLevel', () => setZoom(1));
    onb('btnZoomFit', () => zoomToFit());

    // Desplegables: formas (riel izquierdo) e industria/macroproceso (cabecera).
    // Se cierran al hacer clic fuera, con Esc, y el de formas al empezar a arrastrar.
    const flyout = $('#shapesFlyout'), btnShapes = $('#btnShapes');
    const popover = $('#metaPopover'), btnMeta = $('#btnMeta');
    const pon = (btn, caja, abierto) => {
      if (!btn || !caja) return;
      caja.hidden = !abierto;
      btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    };
    window.cerrarDesplegables = () => { pon(btnShapes, flyout, false); pon(btnMeta, popover, false); };
    onb('btnShapes', () => { const ab = flyout && flyout.hidden; pon(btnMeta, popover, false); pon(btnShapes, flyout, !!ab); });
    onb('btnMeta',   () => { const ab = popover && popover.hidden; pon(btnShapes, flyout, false); pon(btnMeta, popover, !!ab); });
    if (flyout) flyout.addEventListener('dragstart', () => setTimeout(() => pon(btnShapes, flyout, false), 0));
    document.addEventListener('mousedown', (ev) => {
      if (flyout && !flyout.hidden && !flyout.contains(ev.target) && !(btnShapes && btnShapes.contains(ev.target))) pon(btnShapes, flyout, false);
      if (popover && !popover.hidden && !popover.contains(ev.target) && !(btnMeta && btnMeta.contains(ev.target))) pon(btnMeta, popover, false);
    });
  }

  // Persistencia del estado de la UI (paneles colapsados) entre recargas
  const UI_KEY = 'processiq.ui';
  function saveUiState() {
    try {
      const activa = $('.tab[data-tab].active');
      localStorage.setItem(UI_KEY, JSON.stringify({
        // Solo se recuerda un cajón abierto A MANO; el automático (selección) no
        panelOpen: document.body.classList.contains('panel-open') && !state._panelAuto,
        tab: activa ? activa.dataset.tab : 'properties'
      }));
    } catch (e) { /* ignore */ }
  }
  function restoreUiState() {
    try {
      const ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      if (ui.panelOpen && ui.tab) abrirPanel(ui.tab, false);
    } catch (e) { /* ignore */ }
  }

  const ZOOM_MIN = 0.2, ZOOM_MAX = 3;
  // setZoom(z, opts): opts puede ser {keepScroll:true} o {anchor:{clientX,clientY}} para zoom hacia el cursor.
  function setZoom(z, opts) {
    opts = opts || {};
    z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const wrap = $('#canvasWrapper');
    if (!wrap) { state.zoom = z; render(); return; }
    const wrect = wrap.getBoundingClientRect();
    // Punto de contenido que debe quedar fijo tras el zoom
    let fixCx, fixCy, fixVpX, fixVpY;   // contenido (fix*) y su posición en viewport (fixVp*)
    if (opts.anchor) {
      // Zoom hacia el cursor: el punto bajo el cursor permanece bajo el cursor
      fixVpX = opts.anchor.clientX - wrect.left;
      fixVpY = opts.anchor.clientY - wrect.top;
    } else if (!opts.keepScroll) {
      // Zoom con botones: mantén el centro del viewport
      fixVpX = wrap.clientWidth / 2;
      fixVpY = wrap.clientHeight / 2;
    }
    const prev = state.zoom || 1;
    if (fixVpX != null) {
      fixCx = (wrap.scrollLeft + fixVpX) / prev;
      fixCy = (wrap.scrollTop + fixVpY) / prev;
    }
    state.zoom = z;
    render();
    const lvl = $('#btnZoomLevel');
    if (lvl) lvl.textContent = Math.round(z * 100) + '%';
    if (fixCx != null) {
      wrap.scrollLeft = fixCx * z - fixVpX;
      wrap.scrollTop = fixCy * z - fixVpY;
    }
  }
  // Atajos y rueda del mouse para manejar el zoom sobre el flujo
  function attachZoomInteractions() {
    const wrap = $('#canvasWrapper');
    if (!wrap) return;
    // Ctrl/⌘ + rueda → zoom hacia el cursor (igual que Figma/draw.io; el pinch del trackpad envía ctrlKey)
    wrap.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        setZoom((state.zoom || 1) * factor, { anchor: { clientX: e.clientX, clientY: e.clientY } });
        return;
      }
      // v3.8.8: el flujo crece a lo ANCHO (80 cajas = 17 m) y la rueda solo movia
      // en vertical, con unos pocos cientos de px de recorrido. Ahora la rueda
      // baja/sube mientras pueda y, al llegar al tope, sigue avanzando/retrocediendo
      // a lo largo del flujo. Shift+rueda y el trackpad (deltaX) quedan nativos.
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : (e.deltaMode === 2 ? e.deltaY * wrap.clientHeight : e.deltaY);
      const maxTop = wrap.scrollHeight - wrap.clientHeight;
      const puedeVertical = dy > 0 ? wrap.scrollTop < maxTop - 1 : wrap.scrollTop > 0;
      const maxLeft = wrap.scrollWidth - wrap.clientWidth;
      if (puedeVertical || maxLeft <= 0) return;   // scroll vertical normal del navegador
      e.preventDefault();
      wrap.scrollLeft = Math.max(0, Math.min(maxLeft, wrap.scrollLeft + dy));
    }, { passive: false });
    // Atajos de teclado: Ctrl/⌘ +/-/0 ; tecla "f" = ajustar
    document.addEventListener('keydown', (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); setZoom((state.zoom || 1) * 1.2); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setZoom((state.zoom || 1) / 1.2); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); setZoom(1); }
      else if (e.key === 'f' || e.key === 'F') { zoomToFit(); }
    });
  }
  function zoomToFit() {
    const wrap = $('#canvasWrapper');
    if (!wrap || state.nodes.length === 0) { setZoom(1); return; }
    // Extensión real del contenido (sin el padding del scroll)
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    state.nodes.forEach(n => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
    });
    const margin = 80;
    const contentW = (maxX - minX) + margin * 2;
    const contentH = (maxY - minY) + margin * 2 + 40; // +40 por labels bajo nodos
    const z = Math.min(wrap.clientWidth / contentW, wrap.clientHeight / contentH);
    setZoom(z, { keepScroll: true });
    // Lleva el scroll al inicio del contenido (arriba-izquierda)
    const wrap2 = $('#canvasWrapper');
    if (wrap2) { wrap2.scrollLeft = Math.max(0, (minX - margin) * (state.zoom || 1)); wrap2.scrollTop = Math.max(0, (minY - margin) * (state.zoom || 1)); }
  }

  // Selector de ejemplos pre-cargados
  function openExamplesModal() {
    const examples = [
      { fn: loadFichaVentaLotes, t: '★ Ficha: Venta de Lotes Urbanos (Centenario)', d: 'Ficha corporativa completa · 29 actividades · 4 roles · 2 loops + 3 ramas de firma · export a Ficha de Proceso (Word)' },
      { fn: loadDemoProcess,   t: 'Gestión de Reclamos (Banca)', d: 'Simple · 7 actividades · 4 actores · pains + KPIs + simulación' },
      { fn: loadComplexDemo,   t: 'Originación de Crédito Hipotecario', d: 'Complejo · 23 nodos · 8 actores · loop de reproceso · cuello de botella' },
      { fn: loadComplexDemo2,  t: 'Onboarding de Personal', d: 'Gateway paralelo ＋ · 7 actores · fork/join (IT/Legal/Finanzas/Seguridad)' },
      { fn: loadComplexDemo3,  t: 'Devolución y Reembolso (Retail)', d: 'Eventos BPMN · timer ⏱ + mensaje ✉ + error ⚡ · 5 actores' },
      { fn: loadComplexDemo4,  t: 'Gestión de Siniestros (Seguros)', d: 'BPMN avanzado · gateway inclusivo ○ · marcadores loop/multi-instancia/subproceso · 7 actores' },
      { fn: loadComplexDemo5,  t: 'Atención de Emergencia (Salud)', d: 'Señal ▲ broadcast · gateway paralelo ＋ fork/join · timer ⏱ · 6 actores' },
      { fn: loadComplexDemo6,  t: 'Orden a Despacho (Manufactura)', d: 'Evento de terminación ⬤ · make-to-stock vs make-to-order · gateway paralelo ＋ · 7 actores' },
      { fn: loadComplexDemo7,  t: 'Avería Telecom T2R (Telecom)', d: 'Escalamiento L1→L2→campo · timer SLA ⏱ · marcadores BPMN · export PPTX con iconografía · 5 actores' },
      { fn: loadComplexDemo8,  t: 'Licencia Municipal (Sector Público)', d: 'Plazo legal TUPA ⏱ · 2 fines de error · leyenda BPMN en PPTX · 6 actores' },
      { fn: loadComplexDemo9,  t: 'Nuevo Suministro Eléctrico (Utilities)', d: 'Gateway paralelo ＋ · terminación ⬤ · timer ⏱ · todos los elementos BPMN · 6 actores' },
      { fn: loadComplexDemo10, t: 'Procure-to-Pay P2P (Transversal)', d: '3-way match (subproceso ⊞) · 2 fines de error · timer ⏱ · proceso cross-funcional · 7 actores' },
      { fn: loadComplexDemo11, t: '★ Crédito PYME — showcase (Banca)', d: 'TODOS los elementos BPMN: doc ▤ + data ▱ + XOR/AND/OR + señal ▲ + terminación ⬤ + timer ⏱ + 3 marcadores · 9 actores, 27 nodos' },
      { fn: loadComplexDemo12, t: 'Fulfillment E-commerce SLA (Retail)', d: 'Eventos de borde ◎ (boundary timer no-interrumpente) para escalamiento por SLA · 6 actores' }
    ];
    const html = `<p class="panel-hint">Elige un proceso de ejemplo pre-cargado (con pains, KPIs y simulación) para explorar las capacidades.</p>
      <div class="examples-list">${examples.map((e, i) =>
        `<button class="example-item" data-ex="${i}"><span class="example-t">${e.t}</span><span class="example-d">${e.d}</span></button>`).join('')}</div>`;
    openModal('Procesos de ejemplo', html, () => {});
    setTimeout(() => {
      document.querySelectorAll('.example-item').forEach(b => b.addEventListener('click', () => {
        examples[+b.dataset.ex].fn();
        $('#modal').hidden = true;
        maybeFitOnLoad();   // si el proceso es más ancho que la pantalla, encuádralo para verlo completo
      }));
    }, 50);
  }

  // Encuadra automáticamente el proceso recién cargado si no cabe a 100% en el viewport
  function maybeFitOnLoad() {
    const wrap = $('#canvasWrapper');
    if (!wrap || state.nodes.length === 0) return;
    let minX = Infinity, maxX = 0, minY = Infinity, maxY = 0;
    state.nodes.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.h); });
    const contentW = (maxX - minX) + 160, contentH = (maxY - minY) + 160;
    // Solo encuadra si desborda; procesos pequeños se quedan a 100%
    if (contentW > wrap.clientWidth || contentH > wrap.clientHeight) {
      zoomToFit();
    } else {
      setZoom(1, { keepScroll: true });
    }
  }

  // Modo presentación: maximiza el lienzo ocultando paneles laterales
  function togglePresentMode(force) {
    const on = force != null ? force : !document.body.classList.contains('present-mode');
    document.body.classList.toggle('present-mode', on);
    if (on) { cerrarPanel(); if (window.cerrarDesplegables) window.cerrarDesplegables(); }
    const btn = $('#btnPresent');
    if (btn) btn.innerHTML = on ? '✕ Salir' : '⛶ Presentar';
    // Re-render para recalcular dimensiones del SVG al nuevo viewport
    setTimeout(render, 60);
  }

  function attachPresentListeners() {
    const btn = $('#btnPresent');
    if (btn) btn.addEventListener('click', () => togglePresentMode());
  }

  // =================== AUTO LAYOUT (swimlanes horizontales + flow left-to-right) ===================
  // Arriba-izquierda → abajo-derecha. Cada "carretera" horizontal = responsable.
  // Las actividades se colocan en su carretera según su rank (BFS).
  // ============================================================
  // NIVEL DE GRANULARIDAD
  //
  // El proceso se genera UNA vez al máximo detalle y se colapsa localmente.
  // Preguntar el nivel y regenerar era el bucle que hundió a la herramienta
  // que evaluamos: cada cambio de opinión costaba otra llamada de IA y varios
  // minutos. Aquí cambiar de vista es instantáneo y no gasta nada.
  //
  // Además baja la densidad, que es la causa real de que las flechas se pisen:
  // un proceso de 154 nodos en vista ejecutiva son ~20 y el ruteo deja de ser
  // un problema (ver pendiente #3 del HANDOFF).
  //
  // Si la IA etiquetó los nodos con `nivel` y `padre`, manda esa jerarquía.
  // Si no —proceso importado o dibujado a mano— se deduce: lo que un mismo
  // actor hace de corrido entre dos decisiones es UNA actividad de negocio.
  // ============================================================
  const NIVELES = [
    { id: 1, nombre: 'Ejecutivo', desc: 'Un paso por actor entre decisiones' },
    { id: 2, nombre: 'Actividad', desc: 'Agrupa tareas consecutivas del mismo actor' },
    { id: 3, nombre: 'Detalle', desc: 'Todas las tareas, como se levantó' }
  ];

  function _esHito(n) {
    return n.type === 'decision' || n.type === 'start' || n.type === 'end' ||
           n.type === 'intermediate';
  }
  function _carrilDe(n) {
    return (state._lanes && state._lanes.laneOf && state._lanes.laneOf[n.id]) ||
           n.owner || n.role || 'Sin asignar';
  }

  // Agrupa cada cadena de tareas consecutivas del mismo carril.
  // minTareas: a partir de cuántas merece la pena agrupar.
  function _gruposPorCadena(nodes, edges, minTareas) {
    const salida = {}, entrada = {};
    edges.forEach(e => {
      (salida[e.from] = salida[e.from] || []).push(e.to);
      (entrada[e.to] = entrada[e.to] || []).push(e.from);
    });
    const porId = {}; nodes.forEach(n => { porId[n.id] = n; });
    const grupoDe = {}, grupos = [], visitado = {};

    nodes.forEach(n => {
      if (visitado[n.id] || _esHito(n)) return;
      // Retrocede hasta el principio de la cadena
      let ini = n;
      for (;;) {
        const prev = (entrada[ini.id] || []).map(id => porId[id]).filter(Boolean);
        if (prev.length !== 1) break;
        const p = prev[0];
        if (_esHito(p) || _carrilDe(p) !== _carrilDe(n)) break;
        if ((salida[p.id] || []).length !== 1) break;
        if (visitado[p.id]) break;
        ini = p;
      }
      // Avanza recogiendo la cadena
      const cadena = [];
      let cur = ini;
      for (;;) {
        if (!cur || visitado[cur.id] || _esHito(cur) || _carrilDe(cur) !== _carrilDe(n)) break;
        cadena.push(cur); visitado[cur.id] = true;
        const sig = (salida[cur.id] || []).map(id => porId[id]).filter(Boolean);
        if (sig.length !== 1) break;
        if ((entrada[sig[0].id] || []).length !== 1) break;
        cur = sig[0];
      }
      if (cadena.length >= minTareas) {
        const g = {
          id: 'grp_' + cadena[0].id,
          label: cadena.length + ' pasos · ' + _carrilDe(n),
          type: 'task', marker: 'subprocess',
          // GEOMETRIA OBLIGATORIA: autoLayout hace n.x = colX + (rankW - n.w)/2.
          // Sin w/h eso da NaN, contamina el ancho de toda la columna y los
          // nodos se quedan sin coordenadas (lienzo vacio en Ejecutivo y
          // Actividad, reportado por el usuario). Hereda la posicion del primer
          // miembro para tener un valor sensato antes del layout.
          x: cadena[0].x, y: cadena[0].y,
          w: SHAPE_DEFAULTS.task.w, h: SHAPE_DEFAULTS.task.h,
          owner: cadena[0].owner, role: cadena[0].role,
          _hijos: cadena.map(c => c.id),
          _detalle: cadena.map(c => c.label).filter(Boolean),
          pains: cadena.reduce((a, c) => a.concat(c.pains || []), [])
        };
        grupos.push(g);
        cadena.forEach(c => { grupoDe[c.id] = g.id; });
      }
    });
    return { grupos, grupoDe };
  }

  // Techo de cajas de la vista Ejecutiva. Una lamina de comite se lee de un
  // vistazo; por encima de 10 cajas deja de ser ejecutiva.
  const EJEC_MAX_CAJAS = 10;

  // Rank por camino mas largo (Kahn). Los nodos en ciclo (bucles de reproceso)
  // no salen de la cola: se les asigna el rank del predecesor mas avanzado.
  function _ranksLocales(nodes, edges) {
    const salida = {}, grado = {};
    nodes.forEach(n => { grado[n.id] = 0; });
    edges.forEach(e => {
      if (grado[e.from] === undefined || grado[e.to] === undefined) return;
      (salida[e.from] = salida[e.from] || []).push(e.to);
      grado[e.to]++;
    });
    const rank = {}, cola = [];
    nodes.forEach(n => { rank[n.id] = 0; if (!grado[n.id]) cola.push(n.id); });
    const listos = {};
    while (cola.length) {
      const id = cola.shift();
      listos[id] = true;
      (salida[id] || []).forEach(t => {
        rank[t] = Math.max(rank[t], rank[id] + 1);
        if (--grado[t] === 0) cola.push(t);
      });
    }
    // Nodos en ciclo: heredan del predecesor ya resuelto mas avanzado
    nodes.forEach(n => {
      if (listos[n.id]) return;
      let m = 0;
      edges.forEach(e => { if (e.to === n.id && listos[e.from]) m = Math.max(m, rank[e.from] + 1); });
      rank[n.id] = m;
    });
    return rank;
  }

  // ETAPAS EJECUTIVAS. La vista de comite no es un BPMN con menos cajas: es el
  // proceso de punta a punta en unas pocas etapas. Por eso NO mira carriles
  // --una etapa puede cruzar varios actores-- y absorbe tambien los gateways:
  // el "como se decide" es detalle. Se conservan inicio y fines, que son los
  // que dan el marco (incluida la salida temprana "venta no concretada").
  // Antes se agrupaba por carril + segmento entre hitos y Venta de Lotes se
  // quedaba en 20 cajas: seguia sin ser una lamina de comite.
  function _etapasEjecutivas(nodes, edges, maxCajas) {
    const rank = _ranksLocales(nodes, edges);
    const eventos = nodes.filter(n => n.type === 'start' || n.type === 'end');
    const resto = nodes.filter(n => n.type !== 'start' && n.type !== 'end')
                       .sort((a, b) => (rank[a.id] - rank[b.id]) || 0);
    const grupos = [], grupoDe = {};
    if (resto.length < 2) return { grupos, grupoDe };

    // Cuantas etapas caben: el techo menos los eventos, y nunca menos de 3
    // (con 1 o 2 etapas el diagrama deja de contar una historia).
    const etapas = Math.max(3, Math.min(maxCajas - eventos.length, resto.length));
    const tam = Math.ceil(resto.length / etapas);
    for (let i = 0; i < resto.length; i += tam) {
      const miembros = resto.slice(i, i + tam);
      if (miembros.length < 2) continue;      // etapa de un solo paso: se deja tal cual
      const cabeza = miembros.find(m => m.type !== 'decision') || miembros[0];
      const g = {
        id: 'eta_' + miembros[0].id,
        label: (cabeza.label || 'Etapa') + ' (+' + (miembros.length - 1) + ' pasos)',
        type: 'task', marker: 'subprocess',
        x: miembros[0].x, y: miembros[0].y,          // ver nota en _gruposPorCadena
        w: SHAPE_DEFAULTS.task.w, h: SHAPE_DEFAULTS.task.h,
        _hijos: miembros.map(m => m.id),
        _detalle: miembros.map(m => m.label).filter(Boolean),
        pains: miembros.reduce((a, m) => a.concat(m.pains || []), [])
      };
      grupos.push(g);
      miembros.forEach(m => { grupoDe[m.id] = g.id; });
    }
    return { grupos, grupoDe };
  }

  // Si al colapsar todas las ramas de un gateway exclusivo acaban en el MISMO
  // paso, la decisión ya no decide nada: se elimina y sus entradas van directas
  // al destino. Sin esto, el gateway quedaba con una sola salida y
  // ensureDecisionBranches le inventaba una rama "Caso no procede" que no
  // existe en el proceso.
  function _colapsarGatewaysDegenerados(nodes, edges) {
    let ns = nodes.slice(), es = edges.slice();
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const cand = ns.find(n => {
        if (n.type !== 'decision' || n.gatewayType === 'parallel' || n.gatewayType === 'inclusive') return false;
        const outs = es.filter(e => e.from === n.id);
        return outs.length > 0 && new Set(outs.map(e => e.to)).size === 1;
      });
      if (!cand) break;
      const destino = es.find(e => e.from === cand.id).to;
      ns = ns.filter(n => n.id !== cand.id);
      const vistas = {};
      es = es.filter(e => e.from !== cand.id)
             .map(e => (e.to === cand.id ? { ...e, to: destino } : e))
             .filter(e => {
               if (e.from === e.to) return false;
               const k = e.from + '>' + e.to;
               if (vistas[k]) return false;
               vistas[k] = true;
               return true;
             });
    }
    return { nodes: ns, edges: es };
  }

  // Proyecta el modelo completo al nivel pedido
  function proyectarNivel(nivel) {
    const full = state._modeloCompleto;
    if (!full) return null;
    if (nivel >= 3) {
      return { nodes: full.nodes.map(n => ({ ...n })), edges: full.edges.map(e => ({ ...e })) };
    }

    const conNivel = full.nodes.filter(n => n.nivel);
    let grupos = [], grupoDe = {};
    if (conNivel.length > full.nodes.length * 0.5) {
      // Jerarquía explícita de la IA
      const visibles = {};
      full.nodes.forEach(n => { if ((n.nivel || 3) <= nivel) visibles[n.id] = true; });
      full.nodes.forEach(n => {
        if (visibles[n.id]) return;
        let p = n.padre;
        while (p && !visibles[p]) { const pn = full.nodes.find(x => x.id === p); p = pn && pn.padre; }
        if (p) grupoDe[n.id] = p;
      });
    } else {
      const r = nivel === 1
        ? _etapasEjecutivas(full.nodes, full.edges, EJEC_MAX_CAJAS)
        : _gruposPorCadena(full.nodes, full.edges, 2);
      grupos = r.grupos; grupoDe = r.grupoDe;
    }

    const repr = (id) => grupoDe[id] || id;
    const nodes = [], puestos = {};
    full.nodes.forEach(n => {
      const r = repr(n.id);
      if (r === n.id) { nodes.push({ ...n }); puestos[n.id] = true; }
      else if (!puestos[r]) {
        const g = grupos.find(x => x.id === r);
        if (g) { nodes.push({ ...g }); puestos[r] = true; }
      }
    });

    const vistas = {}, edges = [];
    full.edges.forEach(e => {
      const a = repr(e.from), b = repr(e.to);
      if (a === b) return;                       // arista interna al grupo
      const k = a + '>' + b;
      if (vistas[k]) return;
      vistas[k] = true;
      edges.push({ ...e, id: 'v_' + e.id, from: a, to: b });
    });
    if (nivel !== 1) return { nodes, edges };
    // Una etapa que cruza varios actores no cabe en el carril de ninguno de
    // ellos: la vista ejecutiva se dibuja en un solo carril, el del proceso.
    const carril = state.meta.macroprocess || 'Proceso';
    nodes.forEach(n => { n.owner = carril; n.role = ''; });
    return _colapsarGatewaysDegenerados(nodes, edges);
  }

  // ¿El modelo completo guardado sigue siendo el de este proceso? Si se cargó
  // otro proceso (demo, ingesta, JSON) hay que recapturarlo: si no, colapsar
  // devolvería los nodos del proceso anterior.
  // Comparar ids no basta: las demos y los BPMN importados usan el mismo
  // esquema de identificadores y un proceso nuevo parecia una proyeccion del
  // anterior. Cada modelo completo lleva un sello y sus proyecciones lo heredan;
  // un nodo sin sello significa que el proceso se reemplazo por otra via.
  let _selloSeq = 0;
  function _modeloVigente() {
    const full = state._modeloCompleto;
    if (!full || !full.nodes.length || !state.nodes.length) return false;
    // Los nodos que crea ensureDecisionBranches ("Caso no procede") nacen sin
    // sello: son artefactos de dibujo, no del modelo. Sin esta excepción, al
    // colapsar a nivel 1 el modelo se daba por ajeno y se recapturaba la vista
    // colapsada como si fuera el completo: volver a nivel 3 ya no restauraba.
    return state.nodes.every(n => n._autoGen || n._sello === state._selloModelo);
  }

  function aplicarNivel(nivel, opts) {
    opts = opts || {};
    if (!_modeloVigente()) { state.meta.nivelVista = 3; fijarModeloCompleto(); }
    const p = proyectarNivel(nivel);
    if (!p) return null;
    state.meta.nivelVista = nivel;
    p.nodes.forEach(n => { n._sello = state._selloModelo; });
    state.nodes = p.nodes; state.edges = p.edges;
    state._lanes = null; state._loopSlots = null;
    invalidarRutas();
    autoLayout();
    if (!opts.silent) { render(); actualizarSelectorNivel(); }
    return { nivel: nivel, nodos: p.nodes.length, aristas: p.edges.length };
  }

  // Se recaptura cada vez que el proceso cambia de verdad (ingesta, import, demo)
  function fijarModeloCompleto() {
    state._selloModelo = 'm' + (++_selloSeq);
    state.nodes.forEach(n => { n._sello = state._selloModelo; });
    state._modeloCompleto = { nodes: state.nodes.map(n => ({ ...n })), edges: state.edges.map(e => ({ ...e })) };
    state.meta.nivelVista = state.meta.nivelVista || 3;
  }

  function cablearSelectorNivel() {
    const cont = document.getElementById('nivelVista');
    if (!cont) return;
    cont.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-nivel]');
      if (!b) return;
      const n = +b.dataset.nivel;
      if (!state.nodes.length) return;
      const r = aplicarNivel(n);
      if (r) {
        const nv = NIVELES.find(x => x.id === n);
        copilotPost('ai', '**Vista ' + nv.nombre.toLowerCase() + '.** ' + nv.desc +
          '. Quedan **' + r.nodos + ' pasos** de ' + state._modeloCompleto.nodes.length +
          '. El proceso completo sigue guardado: cambiar de vista no pierde nada ni vuelve a llamar a la IA.');
      }
    });
  }

  function actualizarSelectorNivel() {
    const cont = document.getElementById('nivelVista');
    if (!cont) return;
    const activo = state.meta.nivelVista || 3;
    [].forEach.call(cont.querySelectorAll('button'), b => {
      b.classList.toggle('activo', +b.dataset.nivel === activo);
    });
    const info = document.getElementById('nivelInfo');
    if (info) {
      const full = state._modeloCompleto;
      info.textContent = full ? (state.nodes.length + ' de ' + full.nodes.length + ' pasos') : '';
    }
  }

  function autoLayout() {
    invalidarRutas();
    if (state.nodes.length === 0) return;
    // Red de seguridad: un solo nodo sin w/h finitos propaga NaN al ancho de su
    // columna y deja SIN coordenadas a todo el diagrama. Paso por ahi con los
    // nodos-grupo de las vistas colapsadas; el sintoma era un lienzo en blanco.
    state.nodes.forEach(n => {
      const d = SHAPE_DEFAULTS[n.type] || SHAPE_DEFAULTS.task;
      if (!isFinite(n.w) || n.w <= 0) n.w = d.w;
      if (!isFinite(n.h) || n.h <= 0) n.h = d.h;
      if (!isFinite(n.x)) n.x = 0;
      if (!isFinite(n.y)) n.y = 0;
    });
    ensureDecisionBranches();

    const starts = state.nodes.filter(n => n.type === 'start');
    const ranks = {};
    const outMap = {};
    state.edges.forEach(e => { (outMap[e.from] = outMap[e.from] || []).push(e.to); });

    // Raíces: starts, o nodos sin entrada si no hay start
    let roots = starts.map(n => n.id);
    if (roots.length === 0) {
      const inMap = {};
      state.edges.forEach(e => { inMap[e.to] = true; });
      const orphans = state.nodes.filter(n => !inMap[n.id]);
      roots = (orphans.length ? orphans : [state.nodes[0]]).map(n => n.id);
    }

    // 1) Detecta back-edges (aristas que cierran ciclos, ej. loop de reproceso) con DFS.
    //    Excluirlas evita que un loop infle los ranks y desordene el layout.
    const color = {};                         // 0/undef=blanco, 1=gris(en pila), 2=negro
    const backEdges = new Set();
    const dfs = (u) => {
      color[u] = 1;
      (outMap[u] || []).forEach(v => {
        if (color[v] === 1) backEdges.add(u + '->' + v);   // back-edge → ciclo
        else if (!color[v]) dfs(v);
      });
      color[u] = 2;
    };
    roots.forEach(r => { if (!color[r]) dfs(r); });
    state.nodes.forEach(n => { if (!color[n.id]) dfs(n.id); });   // componentes desconectados

    // 2) Longest-path rank sobre el DAG (sin back-edges) vía orden topológico (Kahn).
    const dagOut = {}, inDeg = {};
    state.nodes.forEach(n => { inDeg[n.id] = 0; });
    state.edges.forEach(e => {
      if (backEdges.has(e.from + '->' + e.to)) return;
      (dagOut[e.from] = dagOut[e.from] || []).push(e.to);
      inDeg[e.to] = (inDeg[e.to] || 0) + 1;
    });
    state.nodes.forEach(n => { ranks[n.id] = 0; });
    const q2 = state.nodes.filter(n => inDeg[n.id] === 0).map(n => n.id);
    const indeg2 = Object.assign({}, inDeg);
    let guard = 0, maxGuard = state.nodes.length * 4 + 10;
    while (q2.length && guard++ < maxGuard) {
      const u = q2.shift();
      (dagOut[u] || []).forEach(v => {
        if (ranks[u] + 1 > ranks[v]) ranks[v] = ranks[u] + 1;
        if (--indeg2[v] === 0) q2.push(v);
      });
    }

    // Override: ends auto-generados ("Caso no procede") → mismo rank que su decisión origen
    state.nodes.filter(n => n.type === 'end' && n._autoGen).forEach(n => {
      const edge = state.edges.find(e => e.to === n.id);
      if (edge && ranks[edge.from] !== undefined) ranks[n.id] = ranks[edge.from] + 1;
    });

    // Computa owners inferidos (sin lanes "Sistema" ni "Sin asignar")
    const ownerMap = computeOwners();
    const laneOf = (n) => ownerMap[n.id] || 'Por asignar';

    // Detecta lanes preservando orden de aparición (por rank)
    const laneOrder = [];
    const ranksList = Object.keys(ranks).map(id => ({ id, rank: ranks[id] })).sort((a, b) => a.rank - b.rank);
    ranksList.forEach(({ id }) => {
      const n = state.nodes.find(x => x.id === id);
      if (!n) return;
      const lane = laneOf(n);
      if (!laneOrder.includes(lane)) laneOrder.push(lane);
    });

    // --- Anti-cruces: reordena los carriles por baricentro (Sugiyama simplificado) ---
    // Dos carriles muy conectados deben quedar contiguos; así las flechas entre
    // responsables son cortas y se cruzan mucho menos.
    if (laneOrder.length > 2) {
      const link = {};                                   // lane -> lane -> peso
      state.edges.forEach(e => {
        const a = getNode(e.from), b = getNode(e.to);
        if (!a || !b) return;
        const la = laneOf(a), lb = laneOf(b);
        if (la === lb) return;
        (link[la] = link[la] || {})[lb] = ((link[la] || {})[lb] || 0) + 1;
        (link[lb] = link[lb] || {})[la] = ((link[lb] || {})[la] || 0) + 1;
      });
      const firstRankOf = {};                            // desempate: mantiene la lectura temporal
      laneOrder.forEach(l => { firstRankOf[l] = Infinity; });
      state.nodes.forEach(n => {
        const l = laneOf(n), r = ranks[n.id] || 0;
        if (r < firstRankOf[l]) firstRankOf[l] = r;
      });
      for (let pass = 0; pass < 4; pass++) {
        const pos = {};
        laneOrder.forEach((l, i) => { pos[l] = i; });
        const bary = laneOrder.map(l => {
          const nb = link[l] || {};
          let sum = 0, w = 0;
          Object.keys(nb).forEach(o => { sum += pos[o] * nb[o]; w += nb[o]; });
          return { lane: l, b: w ? sum / w : pos[l] };
        });
        bary.sort((p, q) => (p.b - q.b) || (firstRankOf[p.lane] - firstRankOf[q.lane]));
        const next = bary.map(x => x.lane);
        if (next.join('|') === laneOrder.join('|')) break;
        laneOrder.length = 0; next.forEach(l => laneOrder.push(l));
      }
    }

    // Layout parámetros
    const headerW = 140;            // ancho del header de la swimlane (label izquierda)
    const laneH = 170;              // altura MÍNIMA de un carril (caja 76 + meta + holgura)
    const STACK_GAP = 26;           // hueco entre cajas apiladas en la misma columna (meta debajo)
    const LANE_PAD = 56;            // aire arriba+abajo cuando el carril crece por apilado
    const padX = 30;
    const padY = 30;
    const innerPadL = 30;
    const BASE_GAP = 58;            // hueco mínimo entre columnas
    const LABEL_GAP = 96;           // hueco cuando la flecha lleva etiqueta (Sí/No…)
    const totalRanks = Math.max(...Object.values(ranks), 0) + 1;

    // --- Columnas compactas: cada rank ocupa sólo lo que necesita ---
    // (antes: 240px fijos aunque el rank sólo tuviera un evento de 54px)
    const rankW = {}, gapAfter = {};
    for (let r = 0; r < totalRanks; r++) { rankW[r] = 0; gapAfter[r] = BASE_GAP; }
    state.nodes.forEach(n => {
      const r = ranks[n.id] || 0;
      rankW[r] = Math.max(rankW[r], n.w);
    });
    state.edges.forEach(e => {
      if (!e.label) return;
      const rf = ranks[e.from], rt = ranks[e.to];
      if (rt === rf + 1) gapAfter[rf] = Math.max(gapAfter[rf], LABEL_GAP);
    });

    // --- Modo envolvente: procesos largos bajan en bandas en vez de irse a 6m de ancho ---
    const WRAP_AT = 14;                                   // ranks por banda
    const doWrap = state._wrap === true;   // v3.6.1: el lienzo va en UNA banda; la escalera es cosa del PPTX (repetia los 8 carriles aunque la 2a banda usara dos)
    const bandOf = (r) => doWrap ? Math.floor(r / WRAP_AT) : 0;

    // --- Grupos: varios nodos en el mismo rank+lane se apilan verticalmente ---
    const groups = {};
    state.nodes.forEach(n => {
      const key = laneOf(n) + '|' + (ranks[n.id] || 0);
      (groups[key] = groups[key] || []).push(n);
    });
    // v3.8.3: cada carril mide lo que pida su pila más alta. Antes eran 170px
    // fijos y tres actividades del mismo rol en una columna (ramas paralelas
    // de una decisión) se montaban entre sí y sobre el carril siguiente.
    const laneHs = laneOrder.map(() => laneH);
    Object.values(groups).forEach(grp => {
      const idx = laneOrder.indexOf(laneOf(grp[0]));
      const pila = grp.reduce((a, n) => a + n.h, 0) + (grp.length - 1) * STACK_GAP + LANE_PAD;
      if (idx >= 0) laneHs[idx] = Math.max(laneHs[idx], pila);
    });
    const laneTops = [];
    laneHs.reduce((acc, h, i) => { laneTops[i] = acc; return acc + h; }, 0);
    const bandH = laneHs.reduce((a, h) => a + h, 0) + 70;   // alto de una banda + corredor

    const colX = {};
    let cx = padX + headerW + innerPadL;
    for (let r = 0; r < totalRanks; r++) {
      if (doWrap && r % WRAP_AT === 0) cx = padX + headerW + innerPadL;   // nueva banda: vuelve a la izquierda
      colX[r] = cx;
      cx += rankW[r] + gapAfter[r];
    }

    // Posiciona cada nodo: x = columna compacta, y = su carril (+ banda)
    state.nodes.forEach(n => {
      const r = ranks[n.id] || 0;
      const laneIdx = Math.max(0, laneOrder.indexOf(laneOf(n)));
      const band = bandOf(r);
      n._band = band;
      n.x = colX[r] + (rankW[r] - n.w) / 2;               // centrado en su columna
      n.y = padY + band * bandH + laneTops[laneIdx] + (laneHs[laneIdx] - n.h) / 2;
    });

    // Colisiones: varios nodos en mismo rank+lane → reparte verticalmente DENTRO de la lane,
    // centrados, con gap suficiente (caja + meta) para que no se superpongan.
    Object.values(groups).forEach(grp => {
      if (grp.length < 2) return;
      // Anti-cruces dentro del grupo: ordena por la altura media de sus vecinos
      const neighborY = (n) => {
        const ys = [];
        state.edges.forEach(e => {
          if (e.from === n.id) { const t = getNode(e.to); if (t) ys.push(t.y); }
          else if (e.to === n.id) { const s = getNode(e.from); if (s) ys.push(s.y); }
        });
        return ys.length ? ys.reduce((a, c) => a + c, 0) / ys.length : n.y;
      };
      grp.sort((p, q) => neighborY(p) - neighborY(q));
      const laneIdx = Math.max(0, laneOrder.indexOf(laneOf(grp[0])));
      const laneTop = padY + (grp[0]._band || 0) * bandH + laneTops[laneIdx];
      // Cada caja con SU alto (una pila mezcla tareas de 76 con eventos de 54)
      const totalH = grp.reduce((a, n) => a + n.h, 0) + (grp.length - 1) * STACK_GAP;
      let y = laneTop + (laneHs[laneIdx] - totalH) / 2;
      grp.forEach(n => { n.y = y; y += n.h + STACK_GAP; });
    });

    // Guarda metadata de lanes para render
    state._lanes = {
      list: laneOrder,
      laneOf: ownerMap,
      ranks: ranks,
      headerW, colW: BASE_GAP + 158, laneH, laneHs, laneTops, padX, padY, innerPadL,
      colX, rankW, bandH, wrap: doWrap, wrapAt: WRAP_AT,
      bands: doWrap ? Math.ceil(totalRanks / WRAP_AT) : 1,
      totalRanks,
      inferredCount: state.nodes.filter(n => n._inferredOwner).length
    };
    state._loopSlots = null;   // invalida corredores de retorno tras recolocar

    // Asigna códigos de actividad BPMN ahora que existen ranks (orden izq→der)
    assignActivityCodes();

    persist();
    render();
  }

  // =================== PERSISTENCE ===================
  // Feedback visual de auto-save (estado "Guardando" → "Guardado")
  let _saveTimer = null;
  function showSaving() {
    const el = $('#statusSaved');
    if (!el) return;
    el.classList.add('saving');
    el.innerHTML = '<span class="dot"></span>Guardando';
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      el.classList.remove('saving');
      el.innerHTML = '<span class="dot"></span>Guardado';
    }, 350);
  }

  function persist() {
    try {
      // Commit del view activo a _views antes de serializar
      state._views[state.activeView] = {
        nodes: state.nodes,
        edges: state.edges
      };
      const snapshot = {
        meta: state.meta,
        ficha: state.ficha,
        nodes: state.nodes,
        edges: state.edges,
        activeView: state.activeView,
        views: state._views,
        nextId: state.nextId,
        raci: state._raci || null,
        sipoc: state._sipoc || null,
        simResults: state._simResults || null,
        kpiValues: state._kpiValues || null,
        lanes: state._lanes || null,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      showSaving();
    } catch (e) {
      $('#statusSaved').innerHTML = '<span class="dot" style="background:var(--danger)"></span>Error al guardar';
    }
    recordHistory();
  }

  // =================== HISTORIAL (DESHACER / REHACER) ===================
  let historyPaused = false;
  const HISTORY_CAP = 60;
  function buildHistorySnapshot() {
    return JSON.stringify({
      meta: state.meta, ficha: state.ficha, nodes: state.nodes, edges: state.edges,
      activeView: state.activeView, views: state._views, nextId: state.nextId,
      raci: state._raci || null, sipoc: state._sipoc || null,
      kpiValues: state._kpiValues || null, lanes: state._lanes || null
    });
  }
  function recordHistory() {
    if (historyPaused || state._restoringHistory) return;
    if (!state._history) { state._history = []; state._histIdx = -1; }
    const snap = buildHistorySnapshot();
    if (state._history[state._histIdx] === snap) return;   // dedupe estados idénticos
    state._history = state._history.slice(0, state._histIdx + 1);   // descarta rama de rehacer
    state._history.push(snap);
    if (state._history.length > HISTORY_CAP) state._history.shift();
    state._histIdx = state._history.length - 1;
    updateUndoRedoUi();
  }
  function resetHistory() {
    state._history = []; state._histIdx = -1;
    recordHistory();   // captura el estado actual como línea base
  }
  function applyHistorySnapshot(snap) {
    const data = JSON.parse(snap);
    state.nodes = data.nodes || [];
    state.edges = data.edges || [];
    state.meta = data.meta || state.meta;
    state.ficha = normalizeFicha(data.ficha);
    state.activeView = data.activeView || 'asis';
    state._views = data.views || { asis: null, tobe: null };
    state.nextId = data.nextId || 1;
    state._raci = data.raci || null;
    state._sipoc = data.sipoc || null;
    state._kpiValues = data.kpiValues || {};
    state._lanes = data.lanes || null;
    state.selectedNodeId = null; state.selectedEdgeId = null;
    state._restoringHistory = true;
    $('#processName').value = state.meta.name || '';
    $('#processIndustry').value = state.meta.industry || '';
    $('#processMacro').value = state.meta.macroprocess || '';
    updateViewUi();
    render();
    renderProperties();
    runLinter();
    persist();   // persiste el estado restaurado (recordHistory queda neutralizado por la bandera)
    state._restoringHistory = false;
    updateUndoRedoUi();
  }
  function undo() {
    if (!state._history || state._histIdx <= 0) return;
    state._histIdx--;
    applyHistorySnapshot(state._history[state._histIdx]);
  }
  function redo() {
    if (!state._history || state._histIdx >= state._history.length - 1) return;
    state._histIdx++;
    applyHistorySnapshot(state._history[state._histIdx]);
  }
  function updateUndoRedoUi() {
    const u = $('#btnUndo'), r = $('#btnRedo');
    if (u) u.disabled = !state._history || state._histIdx <= 0;
    if (r) r.disabled = !state._history || state._histIdx >= state._history.length - 1;
  }
  function attachUndoRedoListeners() {
    const u = $('#btnUndo'), r = $('#btnRedo');
    if (u) u.addEventListener('click', undo);
    if (r) r.addEventListener('click', redo);
    document.addEventListener('keydown', (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' || e.key === 'Z') && e.shiftKey || e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
    });
    updateUndoRedoUi();

    // Panel de atajos de teclado
    const panel = $('#shortcutsPanel');
    const setShortcuts = (show) => {
      if (!panel) return;
      panel.hidden = !show;
      const b = $('#btnShortcuts');
      if (b) b.classList.toggle('active', show);
    };
    const afb = $('#btnAutoFit');
    if (afb) afb.addEventListener('click', () => autoFitDiagram());

    const sbtn = $('#btnShortcuts');
    if (sbtn) sbtn.addEventListener('click', () => setShortcuts(panel.hidden));
    const sclose = $('#btnShortcutsClose');
    if (sclose) sclose.addEventListener('click', () => setShortcuts(false));
    document.addEventListener('keydown', (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      if (typing) return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShortcuts(panel && panel.hidden); }
      else if (e.key === 'Escape' && panel && !panel.hidden) { setShortcuts(false); }
    });
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.meta = data.meta || state.meta;
      state.ficha = normalizeFicha(data.ficha);
      state.nodes = data.nodes || [];
      state.edges = data.edges || [];
      state.activeView = data.activeView || 'asis';
      state._views = data.views || { asis: null, tobe: null };
      state.nextId = data.nextId || 1;
      state._raci = data.raci || null;
      state._sipoc = data.sipoc || null;
      state._simResults = data.simResults || null;
      state._kpiValues = data.kpiValues || {};
      state._lanes = data.lanes || null;
      $('#processName').value = state.meta.name || '';
      $('#processIndustry').value = state.meta.industry || '';
      $('#processMacro').value = state.meta.macroprocess || '';
      updateViewUi();
    } catch (e) { /* ignore */ }
  }

  function resetState() {
    // Pausa el historial durante la carga (demo/Nuevo) y captura UNA línea base al terminar (microtask)
    historyPaused = true;
    Promise.resolve().then(() => { historyPaused = false; resetHistory(); });
    state.meta = { name: '', industry: '', macroprocess: '', client: '', owner: '' };
    state.ficha = emptyFicha();
    state._sources = [];
    if (typeof renderSources === 'function') renderSources();
    state.nodes = [];
    state.edges = [];
    state.selectedNodeId = null;
    state.selectedEdgeId = null;
    state.nextId = 1;
    state.activeView = 'asis';
    state._views = { asis: null, tobe: null };
    state._raci = null;
    state._sipoc = null;
    state._simResults = null;
    state._kpiValues = {};
    state._bottleneckId = null;
    state._variants = null;
    state._valueMode = false;
    state._backlog = null;
    updateViewUi();
    $('#processName').value = '';
    $('#processIndustry').value = '';
    $('#processMacro').value = '';
    persist();
    render();
  }

  // Proceso demo completo pre-poblado (para presentaciones a cliente)
  function loadDemoProcess() {
    resetState();
    state.meta = { name: 'Gestión de Reclamos — Banca Minorista', industry: 'Banca', macroprocess: 'Servicio', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Banca';
    $('#processMacro').value = 'Servicio';

    const T = [
      { type: 'start', label: 'Reclamo recibido', owner: 'Cliente' },
      { type: 'task', label: 'Registrar reclamo', owner: 'Asesor Call Center', system: 'CRM', exec: 'system', time: 8, vol: 1200, va: 'BVA' },
      { type: 'decision', label: '¿Resuelve en 1ra línea?', owner: 'Asesor Call Center' },
      { type: 'task', label: 'Resolver y cerrar', owner: 'Asesor Call Center', exec: 'phone', time: 12, vol: 720, va: 'VA',
        pains: [{ category: 'rework', description: 'Reapertura por solución incompleta', severity: 3, frequency: 3 }] },
      { type: 'task', label: 'Escalar a back office', owner: 'Asesor Call Center', system: 'Workflow', exec: 'system', time: 5, vol: 480, va: 'NVA',
        pains: [{ category: 'handoff', description: 'Pérdida de contexto en traspaso a BO', severity: 5, frequency: 4 }] },
      { type: 'task', label: 'Investigar caso', owner: 'Analista Back Office', exec: 'manual', time: 45, vol: 480, va: 'VA',
        pains: [{ category: 'wait', description: 'Espera de información de otras áreas', severity: 4, frequency: 4 }] },
      { type: 'task', label: 'Aprobar resolución', owner: 'Jefe Back Office', exec: 'manual', time: 15, vol: 480, va: 'BVA' },
      { type: 'task', label: 'Notificar al cliente', owner: 'Asesor Call Center', exec: 'email', time: 6, vol: 1200, va: 'VA' },
      { type: 'end', label: 'Reclamo resuelto', owner: 'Cliente' }
    ];

    const created = [];
    let x = 80, y = 100;
    T.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x, y, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        activityCode: '', owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      state.nodes.push(node); created.push(node);
      x += def.w + 60;
    });
    // Conexión lineal + rama de decisión
    for (let i = 0; i < created.length - 1; i++) {
      if (created[i].type === 'decision') {
        state.edges.push({ id: 'e' + (state.nextId++), from: created[i].id, to: created[i + 1].id, label: 'Sí' });
        // rama No → escalar (created[i+2])
        if (created[i + 2]) state.edges.push({ id: 'e' + (state.nextId++), from: created[i].id, to: created[i + 2].id, label: 'No' });
        // saltar la conexión lineal del "resolver" hacia "escalar" para evitar duplicado
        state.edges.push({ id: 'e' + (state.nextId++), from: created[i + 1].id, to: created[created.length - 1].id, label: '' });
        i++; // ya conectamos i+1
      } else {
        state.edges.push({ id: 'e' + (state.nextId++), from: created[i].id, to: created[i + 1].id, label: '' });
      }
    }

    // KPIs capturados (gap vs benchmark) para la demo
    state._kpiValues = {
      'bnk-03': { name: 'First Contact Resolution (FCR)', unit: '%', benchmark: '> 75%', value: '60', gap: '-15 pp', source: 'Dashboard CRM Q1' },
      'per-ind-01': { name: 'Tiempo de respuesta reclamo (Indecopi)', unit: 'días hábiles', benchmark: '≤ 30 días', value: '34', gap: '+4 días', source: 'Reporte Compliance' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();   // guarda los resultados de simulación
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso demo cargado: Gestión de Reclamos — Banca Minorista.**\n\n` +
      `Incluye: 7 actividades con tipos BPMN, 4 pain points (1 crítico: handoff a BO), 2 KPIs con gap vs benchmark (FCR 60% vs >75%, Indecopi 34 vs ≤30 días), tiempos y volúmenes para el simulador.\n\n` +
      `Prueba: **Detecta pains**, **Matriz impacto-esfuerzo**, **✨ To-Be IA**, o exporta a **PPTX/Word**. Ideal para mostrar el flujo completo a un cliente.`);
  }

  // Proceso COMPLEJO de prueba: Originación de Crédito Hipotecario (8 actores, ~23 nodos, loop)
  function loadComplexDemo() {
    resetState();
    state.meta = { name: 'Originación de Crédito Hipotecario', industry: 'Banca', macroprocess: 'O2C', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Banca';
    $('#processMacro').value = 'O2C';

    // k = clave local para definir edges
    const N = [
      { k: 's',   type: 'start', label: 'Solicitud hipoteca recibida', owner: 'Cliente' },
      { k: 'a1',  type: 'task',  label: 'Presentar documentación', owner: 'Cliente', exec: 'document', time: 20, vol: 600, va: 'BVA',
        pains: [{ category: 'handoff', description: 'Documentos entregados en físico, sin trazabilidad digital', severity: 3, frequency: 4 }] },
      { k: 'a2',  type: 'task',  label: 'Registrar solicitud', owner: 'Ejecutivo Comercial', system: 'CRM', exec: 'system', time: 12, vol: 600, va: 'BVA' },
      { k: 'a3',  type: 'task',  label: 'Validar documentación', owner: 'Ejecutivo Comercial', exec: 'manual', time: 15, vol: 600, va: 'NVA',
        pains: [{ category: 'rework', description: 'Documentación incompleta genera reprocesos', severity: 4, frequency: 5 }] },
      { k: 'd1',  type: 'decision', label: '¿Documentación completa?', owner: 'Ejecutivo Comercial' },
      { k: 'a4',  type: 'task',  label: 'Solicitar subsanación', owner: 'Ejecutivo Comercial', exec: 'email', time: 8, vol: 240, va: 'NVA',
        pains: [{ category: 'wait', description: 'Espera de respuesta del cliente alarga el ciclo', severity: 3, frequency: 4 }] },
      { k: 'a5',  type: 'task',  label: 'Verificar antecedentes', owner: 'Analista de Crédito', system: 'Centrales', exec: 'system', time: 18, vol: 540, va: 'VA' },
      { k: 'a6',  type: 'task',  label: 'Evaluar capacidad pago', owner: 'Analista de Crédito', system: 'Scoring', exec: 'ai', time: 30, vol: 540, va: 'VA' },
      { k: 'd2',  type: 'decision', label: '¿Cumple política de riesgo?', owner: 'Analista de Crédito' },
      { k: 'a7',  type: 'task',  label: 'Programar tasación', owner: 'Tasador', exec: 'email', time: 8, vol: 420, va: 'NVA',
        pains: [{ category: 'handoff', description: 'Coordinación manual con perito externo', severity: 4, frequency: 4 }] },
      { k: 'a8',  type: 'task',  label: 'Tasar inmueble', owner: 'Tasador', exec: 'manual', time: 120, vol: 420, va: 'VA',
        pains: [{ category: 'wait', description: 'Disponibilidad del perito: 3-5 días de espera', severity: 5, frequency: 5 }] },
      { k: 'a9',  type: 'task',  label: 'Emitir informe tasación', owner: 'Tasador', exec: 'document', time: 30, vol: 420, va: 'BVA' },
      { k: 'a10', type: 'task',  label: 'Analizar riesgo crediticio', owner: 'Riesgos', exec: 'system', time: 45, vol: 420, va: 'VA' },
      { k: 'd3',  type: 'decision', label: '¿Monto supera umbral comité?', owner: 'Riesgos' },
      { k: 'a11', type: 'task',  label: 'Evaluar en comité', owner: 'Comité de Crédito', exec: 'manual', time: 60, vol: 200, va: 'BVA',
        pains: [{ category: 'wait', description: 'Comité sesiona 1 vez/semana: cuello de botella', severity: 5, frequency: 4 }] },
      { k: 'd4',  type: 'decision', label: '¿Aprobado por comité?', owner: 'Comité de Crédito' },
      { k: 'a12', type: 'task',  label: 'Revisar título propiedad', owner: 'Legal', exec: 'manual', time: 90, vol: 380, va: 'BVA',
        pains: [{ category: 'control', description: 'Revisión legal duplica validaciones de Riesgos', severity: 3, frequency: 3 }] },
      { k: 'a13', type: 'task',  label: 'Elaborar minuta y contrato', owner: 'Legal', exec: 'document', time: 60, vol: 380, va: 'VA' },
      { k: 'a14', type: 'task',  label: 'Constituir hipoteca', owner: 'Operaciones', system: 'Core', exec: 'system', time: 40, vol: 380, va: 'VA' },
      { k: 'a15', type: 'task',  label: 'Desembolsar crédito', owner: 'Operaciones', system: 'Core', exec: 'automatic', time: 5, vol: 380, va: 'VA' },
      { k: 'a16', type: 'task',  label: 'Notificar al cliente', owner: 'Operaciones', exec: 'email', time: 6, vol: 600, va: 'VA' },
      { k: 'e1',  type: 'end',   label: 'Crédito desembolsado', owner: 'Cliente' },
      { k: 'e2',  type: 'end',   label: 'Solicitud rechazada', owner: 'Cliente' }
    ];
    const E = [
      ['s','a1'], ['a1','a2'], ['a2','a3'], ['a3','d1'],
      ['d1','a5','Sí'], ['d1','a4','No'], ['a4','a3'],          // loop de reproceso
      ['a5','a6'], ['a6','d2'],
      ['d2','a7','Sí'], ['d2','e2','No'],
      ['a7','a8'], ['a8','a9'], ['a9','a10'], ['a10','d3'],
      ['d3','a11','Sí'], ['d3','a12','No'],
      ['a11','d4'], ['d4','a12','Sí'], ['d4','e2','No'],
      ['a12','a13'], ['a13','a14'], ['a14','a15'], ['a15','a16'], ['a16','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        activityCode: '', owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => {
      state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' });
    });

    state._kpiValues = {
      'bnk-02': { name: 'Time-to-Yes', unit: 'horas', benchmark: '< 24h banca minorista', value: '120', gap: '+96 h', source: 'Reporte Comercial' },
      'bnk-01': { name: 'Tasa de aprobación de créditos', unit: '%', benchmark: '65-75%', value: '52', gap: '-13 pp', source: 'Dashboard Riesgos' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    const tasks = state.nodes.filter(n => n.type === 'task').length;
    const lanes = (state._lanes?.list || []).length;
    copilotPost('ai',
      `**Proceso COMPLEJO cargado: Originación de Crédito Hipotecario.**\n\n` +
      `${tasks} actividades · ${lanes} actores (swimlanes) · 4 decisiones · 1 loop de reproceso · 2 ends (aprobado/rechazado).\n` +
      `Pains críticos: tasación (espera 3-5 días) y comité (sesiona 1x/semana). KPIs con gap: Time-to-Yes 120h vs <24h, aprobación 52% vs 65-75%.\n\n` +
      `Es un caso de stress: prueba **🔴 Cuello de botella**, **🔬 What-If**, **🤖 Automatización**, **📋 Backlog** y exporta a **PPTX** (multi-slide) para medir el rendimiento.`);
  }

  // Proceso COMPLEJO 2: Onboarding de Personal — con gateway PARALELO (fork/join), 7 actores
  function loadComplexDemo2() {
    resetState();
    state.meta = { name: 'Onboarding de Personal Nuevo', industry: 'Transversal', macroprocess: 'H2R', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Transversal';
    $('#processMacro').value = 'H2R';

    const N = [
      { k: 's',   type: 'start', label: 'Candidato seleccionado', owner: 'RRHH' },
      { k: 'a1',  type: 'task',  label: 'Enviar oferta laboral', owner: 'RRHH', exec: 'email', time: 10, vol: 100, va: 'VA' },
      { k: 'd1',  type: 'decision', label: '¿Oferta aceptada?', owner: 'RRHH', gateway: 'exclusive' },
      { k: 'erej',type: 'end',   label: 'Vacante reabierta', owner: 'RRHH' },
      { k: 'a2',  type: 'task',  label: 'Recopilar documentación', owner: 'Empleado', exec: 'document', time: 30, vol: 80, va: 'BVA',
        pains: [{ category: 'wait', description: 'Demora del candidato en enviar documentos', severity: 3, frequency: 4 }] },
      { k: 'a3',  type: 'task',  label: 'Registrar en sistema RRHH', owner: 'RRHH', system: 'Workday', exec: 'system', time: 15, vol: 80, va: 'BVA' },
      { k: 'g1',  type: 'decision', label: 'Iniciar provisión en paralelo', owner: 'RRHH', gateway: 'parallel' },
      { k: 'bit', type: 'task',  label: 'Crear usuario y correo', owner: 'IT', system: 'Active Directory', exec: 'system', time: 20, vol: 80, va: 'VA' },
      { k: 'bleg',type: 'task',  label: 'Preparar contrato', owner: 'Legal', exec: 'document', time: 45, vol: 80, va: 'VA',
        pains: [{ category: 'manual', description: 'Contrato redactado manualmente sin plantilla', severity: 3, frequency: 4 }] },
      { k: 'bfin',type: 'task',  label: 'Dar de alta en nómina', owner: 'Finanzas', system: 'SAP HR', exec: 'system', time: 25, vol: 80, va: 'BVA' },
      { k: 'bseg',type: 'task',  label: 'Asignar accesos físicos', owner: 'Seguridad', exec: 'manual', time: 15, vol: 80, va: 'BVA' },
      { k: 'g2',  type: 'decision', label: 'Sincronizar provisión', owner: 'RRHH', gateway: 'parallel' },
      { k: 'a4',  type: 'task',  label: 'Asignar equipo y puesto', owner: 'IT', exec: 'manual', time: 30, vol: 80, va: 'VA' },
      { k: 'a5',  type: 'task',  label: 'Firmar contrato', owner: 'Empleado', exec: 'document', time: 20, vol: 80, va: 'VA' },
      { k: 'a6',  type: 'task',  label: 'Programar inducción', owner: 'RRHH', exec: 'email', time: 10, vol: 80, va: 'BVA' },
      { k: 'a7',  type: 'task',  label: 'Realizar inducción Día 1', owner: 'Manager', exec: 'phone', time: 120, vol: 80, va: 'VA',
        pains: [{ category: 'handoff', description: 'Inducción sin material estandarizado por área', severity: 4, frequency: 3 }] },
      { k: 'a8',  type: 'task',  label: 'Asignar plan capacitación', owner: 'Manager', exec: 'ai', time: 30, vol: 80, va: 'VA' },
      { k: 'a9',  type: 'task',  label: 'Validar onboarding completo', owner: 'RRHH', exec: 'system', time: 15, vol: 80, va: 'BVA' },
      { k: 'e1',  type: 'end',   label: 'Empleado activo', owner: 'Empleado' }
    ];
    const E = [
      ['s','a1'], ['a1','d1'], ['d1','a2','Sí'], ['d1','erej','No'],
      ['a2','a3'], ['a3','g1'],
      ['g1','bit'], ['g1','bleg'], ['g1','bfin'], ['g1','bseg'],   // fork paralelo
      ['bit','g2'], ['bleg','g2'], ['bfin','g2'], ['bseg','g2'],   // join paralelo
      ['g2','a4'], ['a4','a5'], ['a5','a6'], ['a6','a7'], ['a7','a8'], ['a8','a9'], ['a9','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    state._kpiValues = {
      'trv-04': { name: 'Time-to-hire', unit: 'días', benchmark: '< 30 días', value: '45', gap: '+15 días', source: 'Dashboard RRHH' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Onboarding de Personal Nuevo** (nomenclatura BPMN completa).\n\n` +
      `7 actores · 16 actividades · gateway **exclusivo** (¿oferta aceptada?) + gateway **paralelo** ＋ (fork: IT/Legal/Finanzas/Seguridad en paralelo, luego join).\n` +
      `Formas BPMN: eventos (▶/■), tareas con marcador de tipo (User/Service/Send/Manual/Script-IA/Documental), gateways con marca (✕ exclusivo / ＋ paralelo).\n\n` +
      `El gateway paralelo muestra cómo 4 áreas provisionan al nuevo empleado simultáneamente. Edita el tipo de gateway en **Props** de cualquier decisión.`);
  }

  // Proceso COMPLEJO 3: Gestión de Devolución y Reembolso — con EVENTOS BPMN (timer/mensaje/error)
  function loadComplexDemo3() {
    resetState();
    state.meta = { name: 'Gestión de Devolución y Reembolso', industry: 'Retail', macroprocess: 'Devoluciones', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Retail';
    $('#processMacro').value = 'Devoluciones';

    const N = [
      { k: 's',   type: 'start', label: 'Solicitud de devolución', owner: 'Cliente', event: 'message' },
      { k: 'a1',  type: 'task',  label: 'Validar política de devolución', owner: 'Atención al Cliente', system: 'CRM', exec: 'system', time: 10, vol: 500, va: 'BVA' },
      { k: 'd1',  type: 'decision', label: '¿Aplica devolución?', owner: 'Atención al Cliente', gateway: 'exclusive' },
      { k: 'erej',type: 'end',   label: 'Devolución rechazada', owner: 'Atención al Cliente', event: 'error' },
      { k: 'a2',  type: 'task',  label: 'Generar guía de retorno', owner: 'Atención al Cliente', system: 'WMS', exec: 'system', time: 8, vol: 400, va: 'VA' },
      { k: 'a3',  type: 'task',  label: 'Enviar instrucciones', owner: 'Atención al Cliente', exec: 'email', time: 5, vol: 400, va: 'VA' },
      { k: 'iv1', type: 'intermediate', label: 'Esperar envío (5 días)', owner: 'Cliente', event: 'timer' },
      { k: 'iv2', type: 'intermediate', label: 'Recibir paquete devuelto', owner: 'Almacén', event: 'message' },
      { k: 'a4',  type: 'task',  label: 'Inspeccionar producto', owner: 'Calidad', exec: 'manual', time: 20, vol: 400, va: 'VA',
        pains: [{ category: 'wait', description: 'Cola de inspección en picos de devolución', severity: 4, frequency: 4 }] },
      { k: 'd2',  type: 'decision', label: '¿Producto conforme?', owner: 'Calidad', gateway: 'exclusive' },
      { k: 'a5',  type: 'task',  label: 'Registrar producto dañado', owner: 'Calidad', system: 'WMS', exec: 'system', time: 10, vol: 80, va: 'NVA' },
      { k: 'a6',  type: 'task',  label: 'Reingresar a inventario', owner: 'Almacén', system: 'WMS', exec: 'system', time: 12, vol: 320, va: 'BVA' },
      { k: 'a7',  type: 'task',  label: 'Autorizar reembolso', owner: 'Finanzas', exec: 'manual', time: 15, vol: 400, va: 'BVA',
        pains: [{ category: 'control', description: 'Autorización manual aunque el monto sea bajo', severity: 3, frequency: 5 }] },
      { k: 'a8',  type: 'task',  label: 'Procesar reembolso', owner: 'Finanzas', system: 'Pasarela', exec: 'automatic', time: 5, vol: 400, va: 'VA' },
      { k: 'iv3', type: 'intermediate', label: 'Esperar liquidación (48h)', owner: 'Finanzas', event: 'timer' },
      { k: 'a9',  type: 'task',  label: 'Notificar reembolso', owner: 'Atención al Cliente', exec: 'email', time: 4, vol: 400, va: 'VA' },
      { k: 'e1',  type: 'end',   label: 'Reembolso confirmado', owner: 'Cliente', event: 'message' }
    ];
    const E = [
      ['s','a1'], ['a1','d1'], ['d1','a2','Sí'], ['d1','erej','No'],
      ['a2','a3'], ['a3','iv1'], ['iv1','iv2'], ['iv2','a4'], ['a4','d2'],
      ['d2','a6','Conforme'], ['d2','a5','No conforme'],
      ['a6','a7'], ['a5','a7'],
      ['a7','a8'], ['a8','iv3'], ['iv3','a9'], ['a9','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    state._kpiValues = {
      'ret-07': { name: 'Tasa de devolución', unit: '%', benchmark: '< 8% retail físico', value: '11', gap: '+3 pp', source: 'Dashboard Comercial' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Gestión de Devolución y Reembolso** (eventos BPMN completos).\n\n` +
      `5 actores · 13 actividades · **3 eventos intermedios**: 2 timer ⏱ (esperar envío 5 días, liquidación 48h) + 1 mensaje ✉ (recibir paquete). Evento inicio de **mensaje** ✉, fin de **error** ⚡ y fin de **mensaje** ✉.\n\n` +
      `Nomenclatura BPMN: eventos catch (outline) vs throw (relleno), evento intermedio = doble anillo. Los timers modelan las **esperas (lead time)** del proceso — fuente directa de mejora.`);
  }

  function loadComplexDemo4() {
    resetState();
    state.meta = { name: 'Gestión de Siniestros de Seguros', industry: 'Seguros', macroprocess: 'Siniestros', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Seguros';
    $('#processMacro').value = 'Siniestros';

    const N = [
      { k: 's',   type: 'start', label: 'Aviso de siniestro', owner: 'Asegurado', event: 'message' },
      { k: 'a1',  type: 'task',  label: 'Registrar siniestro', owner: 'Contact Center', system: 'Core Seguros', exec: 'system', time: 8, vol: 1200, va: 'BVA' },
      { k: 'a2',  type: 'task',  label: 'Validar póliza vigente', owner: 'Contact Center', system: 'Core Seguros', exec: 'system', time: 5, vol: 1200, va: 'VA' },
      { k: 'd1',  type: 'decision', label: '¿Póliza cubre el siniestro?', owner: 'Suscripción', gateway: 'exclusive' },
      { k: 'erej',type: 'end',   label: 'Siniestro rechazado', owner: 'Suscripción', event: 'error' },
      { k: 'g1',  type: 'decision', label: '¿Qué acciones aplican?', owner: 'Analista de Siniestros', gateway: 'inclusive' },
      { k: 'a3',  type: 'task',  label: 'Solicitar documentación', owner: 'Analista de Siniestros', exec: 'email', time: 10, vol: 1000, va: 'BVA', marker: 'loop',
        pains: [{ category: 'rework', description: 'Reenvíos por documentación incompleta del asegurado', severity: 4, frequency: 4 }] },
      { k: 'a4',  type: 'task',  label: 'Activar peritaje', owner: 'Perito', exec: 'manual', time: 45, vol: 700, va: 'VA' },
      { k: 'a5',  type: 'task',  label: 'Cotizar talleres', owner: 'Perito', exec: 'manual', time: 30, vol: 700, va: 'BVA', marker: 'multiinstance' },
      { k: 'iv1', type: 'intermediate', label: 'Esperar informe pericial', owner: 'Perito', event: 'timer' },
      { k: 'a6',  type: 'task',  label: 'Evaluar cobertura', owner: 'Analista de Siniestros', system: 'Core Seguros', exec: 'manual', time: 25, vol: 1000, va: 'VA', marker: 'subprocess' },
      { k: 'd2',  type: 'decision', label: '¿Indemnización procede?', owner: 'Analista de Siniestros', gateway: 'exclusive' },
      { k: 'a7',  type: 'task',  label: 'Liquidar reserva', owner: 'Analista de Siniestros', system: 'Core Seguros', exec: 'system', time: 8, vol: 200, va: 'NVA' },
      { k: 'a8',  type: 'task',  label: 'Autorizar pago', owner: 'Jefe de Siniestros', exec: 'manual', time: 15, vol: 800, va: 'BVA',
        pains: [{ category: 'control', description: 'Autorización manual aun en montos menores al umbral', severity: 3, frequency: 5 }] },
      { k: 'a9',  type: 'task',  label: 'Ejecutar pago', owner: 'Tesorería', system: 'ERP', exec: 'automatic', time: 5, vol: 800, va: 'VA' },
      { k: 'iv2', type: 'intermediate', label: 'Esperar abono (48h)', owner: 'Tesorería', event: 'timer' },
      { k: 'a10', type: 'task',  label: 'Notificar al asegurado', owner: 'Contact Center', exec: 'email', time: 4, vol: 800, va: 'VA' },
      { k: 'e1',  type: 'end',   label: 'Siniestro indemnizado', owner: 'Asegurado', event: 'message' }
    ];
    const E = [
      ['s','a1'], ['a1','a2'], ['a2','d1'],
      ['d1','g1','Sí'], ['d1','erej','No'],
      ['g1','a3','Documentos'], ['g1','a4','Peritaje'],
      ['a3','a6'], ['a4','a5'], ['a5','iv1'], ['iv1','a6'],
      ['a6','d2'], ['d2','a7','No procede'], ['d2','a8','Procede'],
      ['a7','a10'], ['a8','a9'], ['a9','iv2'], ['iv2','a10'], ['a10','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, marker: t.marker || '', activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    state._kpiValues = {
      'seg-03': { name: 'Lead time de siniestro', unit: 'días', benchmark: '< 7 días (P50 mercado)', value: '12', gap: '+5 días', source: 'Core Seguros' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Gestión de Siniestros de Seguros** (BPMN avanzado).\n\n` +
      `7 actores · 14 actividades · **gateway inclusivo ○ (OR)** que abre documentación y/o peritaje en paralelo · **2 timers ⏱** (informe pericial, abono 48h) · inicio de **mensaje ✉**, fin de **error ⚡** y fin de **mensaje ✉**.\n\n` +
      `**Marcadores de actividad BPMN**: *Solicitar documentación* = ↻ loop (reenvíos), *Cotizar talleres* = ‖ multi-instancia (varios talleres), *Evaluar cobertura* = ⊞ subproceso. Estos marcadores hacen explícito el patrón de ejecución — clave para dimensionar automatización y SLA.`);
  }

  function loadComplexDemo5() {
    resetState();
    state.meta = { name: 'Atención Hospitalaria de Emergencia', industry: 'Salud', macroprocess: 'Atención', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Salud';
    $('#processMacro').value = 'Atención';

    const N = [
      { k: 's',   type: 'start', label: 'Llegada del paciente', owner: 'Paciente', event: 'message' },
      { k: 'a1',  type: 'task',  label: 'Registrar admisión', owner: 'Admisión', system: 'HIS', exec: 'system', time: 6, vol: 3000, va: 'BVA' },
      { k: 'g1',  type: 'decision', label: 'Iniciar atención', owner: 'Triaje', gateway: 'parallel' },
      { k: 'a2',  type: 'task',  label: 'Clasificar en triaje', owner: 'Triaje', exec: 'manual', time: 7, vol: 3000, va: 'VA' },
      { k: 'a3',  type: 'task',  label: 'Tomar signos vitales', owner: 'Triaje', system: 'Monitor', exec: 'manual', time: 5, vol: 3000, va: 'VA' },
      { k: 'g2',  type: 'decision', label: 'Consolidar triaje', owner: 'Triaje', gateway: 'parallel' },
      { k: 'd1',  type: 'decision', label: '¿Nivel de urgencia?', owner: 'Médico de Emergencia', gateway: 'exclusive' },
      { k: 'sig', type: 'intermediate', label: 'Difundir código rojo', owner: 'Médico de Emergencia', event: 'signal', throw: true },
      { k: 'a4',  type: 'task',  label: 'Estabilizar paciente', owner: 'Médico de Emergencia', exec: 'manual', time: 40, vol: 600, va: 'VA', marker: 'subprocess',
        pains: [{ category: 'wait', description: 'Falta de camas críticas en horas pico', severity: 5, frequency: 4 }] },
      { k: 'a5',  type: 'task',  label: 'Asignar sala de espera', owner: 'Admisión', exec: 'manual', time: 3, vol: 2400, va: 'NVA' },
      { k: 'a6',  type: 'task',  label: 'Evaluar al paciente', owner: 'Médico de Emergencia', system: 'HIS', exec: 'manual', time: 18, vol: 3000, va: 'VA' },
      { k: 'a7',  type: 'task',  label: 'Solicitar exámenes', owner: 'Médico de Emergencia', system: 'LIS', exec: 'system', time: 5, vol: 2200, va: 'BVA' },
      { k: 'a8',  type: 'task',  label: 'Procesar muestras', owner: 'Laboratorio', system: 'LIS', exec: 'automatic', time: 25, vol: 2200, va: 'VA', marker: 'multiinstance' },
      { k: 'iv1', type: 'intermediate', label: 'Esperar resultados', owner: 'Laboratorio', event: 'timer' },
      { k: 'a9',  type: 'task',  label: 'Interpretar resultados', owner: 'Médico de Emergencia', exec: 'manual', time: 12, vol: 2200, va: 'VA', marker: 'loop',
        pains: [{ category: 'rework', description: 'Reevaluación por resultados incompletos o diferidos', severity: 3, frequency: 3 }] },
      { k: 'd2',  type: 'decision', label: '¿Requiere hospitalización?', owner: 'Médico de Emergencia', gateway: 'exclusive' },
      { k: 'a10', type: 'task',  label: 'Gestionar internamiento', owner: 'Admisión', system: 'HIS', exec: 'system', time: 15, vol: 700, va: 'BVA' },
      { k: 'a11', type: 'task',  label: 'Indicar tratamiento', owner: 'Médico de Emergencia', exec: 'manual', time: 8, vol: 1500, va: 'VA' },
      { k: 'a12', type: 'task',  label: 'Dispensar medicación', owner: 'Farmacia', system: 'HIS', exec: 'system', time: 6, vol: 1500, va: 'VA' },
      { k: 'eder',type: 'end',   label: 'Derivar a otro centro', owner: 'Médico de Emergencia', event: 'error' },
      { k: 'e1',  type: 'end',   label: 'Paciente dado de alta', owner: 'Paciente', event: 'message' }
    ];
    const E = [
      ['s','a1'], ['a1','g1'],
      ['g1','a2'], ['g1','a3'],
      ['a2','g2'], ['a3','g2'],
      ['g2','d1'],
      ['d1','sig','Crítico I-II'], ['d1','a5','Estándar III-V'],
      ['sig','a4'], ['a4','a6'], ['a5','a6'],
      ['a6','a7'], ['a7','a8'], ['a8','iv1'], ['iv1','a9'], ['a9','d2'],
      ['d2','a10','Sí'], ['d2','a11','No'],
      ['a10','eder'], ['a11','a12'], ['a12','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
        marker: t.marker || '', activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    state._kpiValues = {
      'hlt-01': { name: 'Tiempo de espera en emergencia', unit: 'minutos', benchmark: '< 30 min triaje', value: '52', gap: '+22 min', source: 'HIS' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Atención Hospitalaria de Emergencia** (BPMN completo).\n\n` +
      `6 actores · 16 actividades · **gateway paralelo ＋** (triaje + signos vitales en simultáneo, fork/join) · gateways exclusivos · **evento de señal ▲ (throw, relleno)** que difunde el *código rojo* a todo el equipo · timer ⏱ (esperar resultados) · inicio de **mensaje ✉**, fin de **error ⚡** (derivación) y fin de **mensaje ✉** (alta).\n\n` +
      `**Marcadores**: *Estabilizar paciente* = ⊞ subproceso, *Procesar muestras* = ‖ multi-instancia, *Interpretar resultados* = ↻ loop. El evento de señal modela un **broadcast** (1→N) — distinto del mensaje (1→1). El tiempo puerta-médico (52 min vs <30) es el cuello visible.`);
  }

  function loadComplexDemo6() {
    resetState();
    state.meta = { name: 'Orden de Producción a Despacho', industry: 'Manufactura', macroprocess: 'Producción', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Manufactura';
    $('#processMacro').value = 'Producción';

    const N = [
      { k: 's',   type: 'start', label: 'Recepción de orden de compra', owner: 'Cliente', event: 'message' },
      { k: 'a1',  type: 'task',  label: 'Registrar pedido', owner: 'Comercial', system: 'ERP', exec: 'system', time: 8, vol: 900, va: 'BVA' },
      { k: 'd0',  type: 'decision', label: '¿Crédito aprobado?', owner: 'Comercial', gateway: 'exclusive' },
      { k: 'eterm',type: 'end',  label: 'Orden cancelada', owner: 'Comercial', terminate: true },
      { k: 'd1',  type: 'decision', label: '¿Hay stock disponible?', owner: 'Planificación', gateway: 'exclusive' },
      { k: 'a2',  type: 'task',  label: 'Reservar inventario', owner: 'Almacén', system: 'WMS', exec: 'system', time: 6, vol: 350, va: 'VA' },
      { k: 'a3',  type: 'task',  label: 'Planificar producción', owner: 'Planificación', system: 'MRP', exec: 'system', time: 25, vol: 550, va: 'VA' },
      { k: 'g1',  type: 'decision', label: 'Lanzar aprovisionamiento', owner: 'Planificación', gateway: 'parallel' },
      { k: 'a4',  type: 'task',  label: 'Comprar insumos', owner: 'Almacén', exec: 'email', time: 12, vol: 550, va: 'BVA' },
      { k: 'iv1', type: 'intermediate', label: 'Esperar materiales', owner: 'Almacén', event: 'timer' },
      { k: 'a5',  type: 'task',  label: 'Recepcionar materiales', owner: 'Almacén', system: 'WMS', exec: 'system', time: 10, vol: 550, va: 'BVA' },
      { k: 'a6',  type: 'task',  label: 'Preparar línea', owner: 'Producción', exec: 'manual', time: 40, vol: 550, va: 'BVA',
        pains: [{ category: 'wait', description: 'Setup largo por cambios de formato (SMED no aplicado)', severity: 4, frequency: 4 }] },
      { k: 'g2',  type: 'decision', label: 'Sincronizar producción', owner: 'Producción', gateway: 'parallel' },
      { k: 'a7',  type: 'task',  label: 'Fabricar lote', owner: 'Producción', exec: 'manual', time: 120, vol: 550, va: 'VA', marker: 'subprocess' },
      { k: 'a8',  type: 'task',  label: 'Inspeccionar calidad', owner: 'Calidad', exec: 'manual', time: 18, vol: 550, va: 'BVA', marker: 'multiinstance' },
      { k: 'd2',  type: 'decision', label: '¿Lote conforme?', owner: 'Calidad', gateway: 'exclusive' },
      { k: 'a9',  type: 'task',  label: 'Reprocesar lote', owner: 'Producción', exec: 'manual', time: 35, vol: 70, va: 'NVA', marker: 'loop',
        pains: [{ category: 'rework', description: 'Reprocesos por defectos de calibración', severity: 3, frequency: 3 }] },
      { k: 'a10', type: 'task',  label: 'Empacar producto', owner: 'Producción', system: 'MES', exec: 'system', time: 15, vol: 550, va: 'VA' },
      { k: 'a11', type: 'task',  label: 'Despachar pedido', owner: 'Despacho', system: 'WMS', exec: 'system', time: 12, vol: 900, va: 'VA' },
      { k: 'e1',  type: 'end',   label: 'Pedido entregado', owner: 'Cliente', event: 'message' }
    ];
    const E = [
      ['s','a1'], ['a1','d0'],
      ['d0','d1','Sí'], ['d0','eterm','No'],
      ['d1','a2','Sí'], ['d1','a3','No'],
      ['a3','g1'], ['g1','a4'], ['g1','a6'],
      ['a4','iv1'], ['iv1','a5'], ['a5','g2'], ['a6','g2'],
      ['g2','a7'], ['a7','a8'], ['a8','d2'],
      ['d2','a10','Conforme'], ['d2','a9','No conforme'],
      ['a9','a10'], ['a10','a11'], ['a2','a11'], ['a11','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
        terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Orden de Producción a Despacho** (Manufactura — BPMN completo).\n\n` +
      `7 actores · 15 actividades · **gateway paralelo ＋** (compra de insumos ∥ preparación de línea, fork/join) · gateways exclusivos (crédito, stock, calidad) · **evento de terminación ⬤** (*Orden cancelada* — corta toda la instancia, distinto de un fin normal) · timer ⏱ (esperar materiales) · inicio y fin de **mensaje ✉**.\n\n` +
      `**Marcadores**: *Fabricar lote* = ⊞ subproceso, *Inspeccionar calidad* = ‖ multi-instancia, *Reprocesar lote* = ↻ loop. El **make-to-stock** (hay stock → despacho directo) y **make-to-order** (sin stock → planificar + producir) conviven como dos rutas que convergen en *Despachar*.`);
  }

  function loadComplexDemo7() {
    resetState();
    state.meta = { name: 'Gestión de Avería Telecom (T2R)', industry: 'Telecomunicaciones', macroprocess: 'Servicio', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Telecomunicaciones';
    $('#processMacro').value = 'Servicio';

    const N = [
      { k: 's',   type: 'start', label: 'Reporte de avería', owner: 'Cliente', event: 'message' },
      { k: 'a1',  type: 'task',  label: 'Registrar ticket', owner: 'Mesa de Ayuda', system: 'CRM', exec: 'system', time: 5, vol: 4000, va: 'BVA' },
      { k: 'a2',  type: 'task',  label: 'Diagnosticar remoto', owner: 'Mesa de Ayuda', system: 'NMS', exec: 'manual', time: 12, vol: 4000, va: 'VA' },
      { k: 'd1',  type: 'decision', label: '¿Resuelto en L1?', owner: 'Mesa de Ayuda', gateway: 'exclusive' },
      { k: 'a3',  type: 'task',  label: 'Escalar a soporte L2', owner: 'Soporte L2', system: 'CRM', exec: 'system', time: 4, vol: 2200, va: 'BVA' },
      { k: 'd2',  type: 'decision', label: '¿Requiere visita técnica?', owner: 'Soporte L2', gateway: 'exclusive' },
      { k: 'a4',  type: 'task',  label: 'Resolver remoto', owner: 'Soporte L2', system: 'NMS', exec: 'manual', time: 25, vol: 1200, va: 'VA' },
      { k: 'a5',  type: 'task',  label: 'Despachar cuadrilla', owner: 'Soporte L2', exec: 'email', time: 6, vol: 1000, va: 'BVA' },
      { k: 'iv1', type: 'intermediate', label: 'Esperar ventana SLA', owner: 'Cuadrilla de Campo', event: 'timer' },
      { k: 'a6',  type: 'task',  label: 'Atender en sitio', owner: 'Cuadrilla de Campo', exec: 'manual', time: 90, vol: 1000, va: 'VA', marker: 'subprocess',
        pains: [{ category: 'wait', description: 'Tiempos de traslado largos en zonas alejadas', severity: 4, frequency: 5 }] },
      { k: 'a7',  type: 'task',  label: 'Reemplazar equipo', owner: 'Cuadrilla de Campo', system: 'Inventario', exec: 'manual', time: 30, vol: 600, va: 'VA', marker: 'multiinstance' },
      { k: 'a8',  type: 'task',  label: 'Validar restablecimiento', owner: 'Soporte L2', system: 'NMS', exec: 'manual', time: 10, vol: 1000, va: 'BVA', marker: 'loop',
        pains: [{ category: 'rework', description: 'Reintentos por restablecimiento parcial del servicio', severity: 3, frequency: 3 }] },
      { k: 'a9',  type: 'task',  label: 'Confirmar con cliente', owner: 'Mesa de Ayuda', exec: 'email', time: 5, vol: 4000, va: 'VA' },
      { k: 'd3',  type: 'decision', label: '¿Cliente conforme?', owner: 'Mesa de Ayuda', gateway: 'exclusive' },
      { k: 'ereop',type: 'end',   label: 'Reapertura del ticket', owner: 'Mesa de Ayuda', event: 'error' },
      { k: 'a10', type: 'task',  label: 'Cerrar ticket', owner: 'Mesa de Ayuda', system: 'CRM', exec: 'system', time: 4, vol: 4000, va: 'VA' },
      { k: 'a11', type: 'task',  label: 'Aplicar créditos SLA', owner: 'Facturación', system: 'ERP', exec: 'automatic', time: 6, vol: 800, va: 'BVA' },
      { k: 'e1',  type: 'end',   label: 'Avería resuelta', owner: 'Cliente', event: 'message' }
    ];
    const E = [
      ['s','a1'], ['a1','a2'], ['a2','d1'],
      ['d1','a10','Sí'], ['d1','a3','No'],
      ['a3','d2'],
      ['d2','a4','No'], ['d2','a5','Sí'],
      ['a4','a9'],
      ['a5','iv1'], ['iv1','a6'], ['a6','a7'], ['a7','a8'], ['a8','a9'],
      ['a9','d3'],
      ['d3','a10','Sí'], ['d3','ereop','No'],
      ['a10','a11'], ['a11','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
        terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    state._kpiValues = {
      'tel-01': { name: 'MTTR (tiempo medio de reparación)', unit: 'horas', benchmark: '< 8 h (avería masiva < 4 h)', value: '14', gap: '+6 h', source: 'CRM/NMS' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Gestión de Avería Telecom (Trouble-to-Resolve)** (BPMN completo).\n\n` +
      `5 actores · 14 actividades · escalamiento **L1 → L2 → campo** con gateways exclusivos (¿resuelto en L1? ¿requiere visita? ¿cliente conforme?) · timer ⏱ (ventana SLA) · inicio de **mensaje ✉**, fin de **error ⚡** (reapertura) y fin de **mensaje ✉** (resuelta).\n\n` +
      `**Marcadores**: *Atender en sitio* = ⊞ subproceso, *Reemplazar equipo* = ‖ multi-instancia, *Validar restablecimiento* = ↻ loop. El **MTTR (14 h vs <8 h)** y el traslado a zonas alejadas son los cuellos visibles. Todos estos elementos ahora también se **exportan a PPTX** con su iconografía BPMN.`);
  }

  function loadComplexDemo8() {
    resetState();
    state.meta = { name: 'Licencia de Funcionamiento Municipal', industry: 'Sector Público', macroprocess: 'Trámites', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Sector Público';
    $('#processMacro').value = 'Trámites';

    const N = [
      { k: 's',   type: 'start', label: 'Solicitud de licencia', owner: 'Ciudadano', event: 'message' },
      { k: 'a1',  type: 'task',  label: 'Recibir expediente', owner: 'Mesa de Partes', system: 'SGD', exec: 'system', time: 8, vol: 2000, va: 'BVA' },
      { k: 'a2',  type: 'task',  label: 'Verificar pago de tasa', owner: 'Caja', system: 'SIAF', exec: 'system', time: 5, vol: 2000, va: 'BVA' },
      { k: 'd1',  type: 'decision', label: '¿Expediente completo?', owner: 'Mesa de Partes', gateway: 'exclusive' },
      { k: 'eobs', type: 'end',  label: 'Expediente observado', owner: 'Mesa de Partes', event: 'error' },
      { k: 'a3',  type: 'task',  label: 'Evaluar requisitos', owner: 'Evaluación Técnica', exec: 'manual', time: 30, vol: 1700, va: 'VA' },
      { k: 'd2',  type: 'decision', label: '¿Requiere ITSE?', owner: 'Evaluación Técnica', gateway: 'exclusive' },
      { k: 'a4',  type: 'task',  label: 'Programar inspección', owner: 'Inspección ITSE', exec: 'email', time: 10, vol: 900, va: 'BVA' },
      { k: 'iv1', type: 'intermediate', label: 'Plazo legal (TUPA)', owner: 'Inspección ITSE', event: 'timer' },
      { k: 'a5',  type: 'task',  label: 'Inspeccionar local', owner: 'Inspección ITSE', exec: 'manual', time: 60, vol: 900, va: 'VA', marker: 'subprocess',
        pains: [{ category: 'wait', description: 'Agenda de inspectores saturada — excede plazo TUPA', severity: 5, frequency: 4 }] },
      { k: 'a6',  type: 'task',  label: 'Consolidar evaluación', owner: 'Evaluación Técnica', system: 'SGD', exec: 'manual', time: 15, vol: 1700, va: 'BVA' },
      { k: 'a7',  type: 'task',  label: 'Proyectar resolución', owner: 'Gerencia', exec: 'manual', time: 25, vol: 1700, va: 'BVA', marker: 'loop',
        pains: [{ category: 'control', description: 'Múltiples revisiones legales del proyecto de resolución', severity: 3, frequency: 4 }] },
      { k: 'd3',  type: 'decision', label: '¿Procede la licencia?', owner: 'Gerencia', gateway: 'exclusive' },
      { k: 'erej', type: 'end',  label: 'Licencia denegada', owner: 'Gerencia', event: 'error' },
      { k: 'a8',  type: 'task',  label: 'Emitir resolución', owner: 'Gerencia', system: 'SGD', exec: 'system', time: 6, vol: 1500, va: 'VA' },
      { k: 'a9',  type: 'task',  label: 'Notificar al ciudadano', owner: 'Mesa de Partes', exec: 'email', time: 5, vol: 1500, va: 'VA' },
      { k: 'e1',  type: 'end',   label: 'Licencia otorgada', owner: 'Ciudadano', event: 'message' }
    ];
    const E = [
      ['s','a1'], ['a1','a2'], ['a2','d1'],
      ['d1','a3','Sí'], ['d1','eobs','No'],
      ['a3','d2'],
      ['d2','a4','Sí'], ['d2','a6','No'],
      ['a4','iv1'], ['iv1','a5'], ['a5','a6'],
      ['a6','a7'], ['a7','d3'],
      ['d3','a8','Sí'], ['d3','erej','No'],
      ['a8','a9'], ['a9','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
        terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    state._kpiValues = {
      'gov-01': { name: 'Tiempo medio de resolución de trámite', unit: 'días hábiles', benchmark: 'según TUPA (15 d)', value: '38', gap: '+23 días', source: 'SGD' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Licencia de Funcionamiento Municipal** (Sector Público — BPMN completo).\n\n` +
      `6 actores · 13 actividades · gateways exclusivos (¿expediente completo? ¿requiere ITSE? ¿procede?) · **timer ⏱ del plazo legal TUPA** (la inspección que lo excede es el cuello: silencio administrativo) · inicio de **mensaje ✉**, dos fines de **error ⚡** (expediente observado, licencia denegada) y fin de **mensaje ✉** (otorgada).\n\n` +
      `**Marcadores**: *Inspeccionar local* = ⊞ subproceso, *Proyectar resolución* = ↻ loop. El **tiempo de resolución (38 días vs 15 TUPA)** evidencia el incumplimiento del plazo. El export a PPTX incluye además una **slide de leyenda BPMN** para que el cliente lea la nomenclatura.`);
  }

  function loadComplexDemo9() {
    resetState();
    state.meta = { name: 'Conexión de Nuevo Suministro Eléctrico', industry: 'Utilities', macroprocess: 'Atención', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Utilities';
    $('#processMacro').value = 'Atención';

    const N = [
      { k: 's',   type: 'start', label: 'Solicitud de suministro', owner: 'Cliente', event: 'message' },
      { k: 'a1',  type: 'task',  label: 'Registrar solicitud', owner: 'Atención Comercial', system: 'Comercial', exec: 'system', time: 8, vol: 1500, va: 'BVA' },
      { k: 'a2',  type: 'task',  label: 'Verificar concesión', owner: 'Factibilidad Técnica', system: 'GIS', exec: 'system', time: 10, vol: 1500, va: 'VA' },
      { k: 'd1',  type: 'decision', label: '¿Factible técnicamente?', owner: 'Factibilidad Técnica', gateway: 'exclusive' },
      { k: 'erej', type: 'end',  label: 'Solicitud no factible', owner: 'Factibilidad Técnica', event: 'error' },
      { k: 'a3',  type: 'task',  label: 'Elaborar presupuesto', owner: 'Factibilidad Técnica', exec: 'manual', time: 25, vol: 1300, va: 'VA' },
      { k: 'a4',  type: 'task',  label: 'Comunicar presupuesto', owner: 'Atención Comercial', exec: 'email', time: 5, vol: 1300, va: 'BVA' },
      { k: 'iv1', type: 'intermediate', label: 'Esperar pago del cliente', owner: 'Cliente', event: 'timer' },
      { k: 'd2',  type: 'decision', label: '¿Pagó el presupuesto?', owner: 'Atención Comercial', gateway: 'exclusive' },
      { k: 'earch', type: 'end',  label: 'Solicitud archivada', owner: 'Atención Comercial', terminate: true },
      { k: 'g1',  type: 'decision', label: 'Ejecutar conexión', owner: 'Cuadrilla de Obras', gateway: 'parallel' },
      { k: 'a5',  type: 'task',  label: 'Ejecutar obra de conexión', owner: 'Cuadrilla de Obras', exec: 'manual', time: 240, vol: 1100, va: 'VA', marker: 'subprocess',
        pains: [{ category: 'wait', description: 'Demoras por permisos de vía pública y clima', severity: 4, frequency: 4 }] },
      { k: 'a6',  type: 'task',  label: 'Actualizar catastro', owner: 'Catastro GIS', system: 'GIS', exec: 'system', time: 15, vol: 1100, va: 'BVA' },
      { k: 'g2',  type: 'decision', label: 'Consolidar conexión', owner: 'Cuadrilla de Obras', gateway: 'parallel' },
      { k: 'a7',  type: 'task',  label: 'Instalar medidor', owner: 'Cuadrilla de Obras', exec: 'manual', time: 30, vol: 1100, va: 'VA' },
      { k: 'a8',  type: 'task',  label: 'Inspeccionar instalación', owner: 'Factibilidad Técnica', exec: 'manual', time: 20, vol: 1100, va: 'BVA', marker: 'loop',
        pains: [{ category: 'rework', description: 'Reinspecciones por observaciones de seguridad', severity: 3, frequency: 3 }] },
      { k: 'a9',  type: 'task',  label: 'Activar suministro', owner: 'Atención Comercial', system: 'Comercial', exec: 'system', time: 6, vol: 1100, va: 'VA' },
      { k: 'a10', type: 'task',  label: 'Crear cuenta de facturación', owner: 'Facturación', system: 'ERP', exec: 'automatic', time: 5, vol: 1100, va: 'BVA' },
      { k: 'e1',  type: 'end',   label: 'Suministro energizado', owner: 'Cliente', event: 'message' }
    ];
    const E = [
      ['s','a1'], ['a1','a2'], ['a2','d1'],
      ['d1','a3','Sí'], ['d1','erej','No'],
      ['a3','a4'], ['a4','iv1'], ['iv1','d2'],
      ['d2','g1','Sí'], ['d2','earch','No'],
      ['g1','a5'], ['g1','a6'], ['a5','g2'], ['a6','g2'],
      ['g2','a7'], ['a7','a8'], ['a8','a9'], ['a9','a10'], ['a10','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
        terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    state._kpiValues = {
      'utl-05': { name: 'Tiempo de conexión nuevo suministro', unit: 'días', benchmark: '< 7 días', value: '18', gap: '+11 días', source: 'Sistema Comercial' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Conexión de Nuevo Suministro Eléctrico** (Utilities — BPMN completo).\n\n` +
      `6 actores · 14 actividades · **gateway paralelo ＋** (obra de conexión ∥ actualización de catastro GIS, fork/join) · gateways exclusivos (factibilidad, pago) · timer ⏱ (esperar pago del cliente) · **evento de terminación ⬤** (*Solicitud archivada* si no paga) · inicio de **mensaje ✉**, fin de **error ⚡** (no factible) y fin de **mensaje ✉** (energizado).\n\n` +
      `**Marcadores**: *Ejecutar obra de conexión* = ⊞ subproceso, *Inspeccionar instalación* = ↻ loop. El **tiempo de conexión (18 días vs <7)** triplica el benchmark OSINERGMIN — la obra de conexión y sus permisos son el cuello. Abre la **Leyenda BPMN** (botón sobre el lienzo) para ver toda la nomenclatura.`);
  }

  function loadComplexDemo10() {
    resetState();
    state.meta = { name: 'Procure-to-Pay (P2P)', industry: 'Transversal', macroprocess: 'P2P', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Transversal';
    $('#processMacro').value = 'P2P';

    const N = [
      { k: 's',   type: 'start', label: 'Necesidad de compra', owner: 'Solicitante', event: 'message' },
      { k: 'a1',  type: 'task',  label: 'Crear requisición', owner: 'Solicitante', system: 'ERP', exec: 'system', time: 10, vol: 2400, va: 'BVA' },
      { k: 'd1',  type: 'decision', label: '¿Supera el umbral?', owner: 'Compras', gateway: 'exclusive' },
      { k: 'a2',  type: 'task',  label: 'Aprobar requisición', owner: 'Aprobador', exec: 'manual', time: 20, vol: 900, va: 'BVA',
        pains: [{ category: 'wait', description: 'Aprobaciones detenidas por gerentes fuera de oficina', severity: 4, frequency: 4 }] },
      { k: 'a3',  type: 'task',  label: 'Generar orden de compra', owner: 'Compras', system: 'ERP', exec: 'system', time: 12, vol: 2400, va: 'VA' },
      { k: 'a4',  type: 'task',  label: 'Enviar OC al proveedor', owner: 'Compras', exec: 'email', time: 4, vol: 2400, va: 'BVA' },
      { k: 'iv1', type: 'intermediate', label: 'Esperar entrega', owner: 'Proveedor', event: 'timer' },
      { k: 'a5',  type: 'task',  label: 'Despachar mercadería', owner: 'Proveedor', exec: 'manual', time: 30, vol: 2400, va: 'VA' },
      { k: 'a6',  type: 'task',  label: 'Recepcionar mercadería', owner: 'Almacén', system: 'WMS', exec: 'manual', time: 18, vol: 2400, va: 'BVA' },
      { k: 'd2',  type: 'decision', label: '¿Recepción conforme?', owner: 'Almacén', gateway: 'exclusive' },
      { k: 'a7',  type: 'task',  label: 'Devolver al proveedor', owner: 'Almacén', exec: 'email', time: 15, vol: 200, va: 'NVA', marker: 'loop' },
      { k: 'erech', type: 'end', label: 'Recepción rechazada', owner: 'Almacén', event: 'error' },
      { k: 'a8',  type: 'task',  label: 'Validar factura', owner: 'Cuentas por Pagar', system: 'ERP', exec: 'manual', time: 22, vol: 2200, va: 'VA', marker: 'subprocess',
        pains: [{ category: 'rework', description: 'Discrepancias OC / recepción / factura (3-way match manual)', severity: 5, frequency: 4 }] },
      { k: 'd3',  type: 'decision', label: '¿Match correcto?', owner: 'Cuentas por Pagar', gateway: 'exclusive' },
      { k: 'edisp', type: 'end', label: 'Factura en disputa', owner: 'Cuentas por Pagar', event: 'error' },
      { k: 'a9',  type: 'task',  label: 'Contabilizar factura', owner: 'Cuentas por Pagar', system: 'ERP', exec: 'system', time: 8, vol: 2000, va: 'BVA' },
      { k: 'a10', type: 'task',  label: 'Programar pago', owner: 'Tesorería', system: 'ERP', exec: 'system', time: 6, vol: 2000, va: 'VA' },
      { k: 'a11', type: 'task',  label: 'Ejecutar pago', owner: 'Tesorería', system: 'Banca', exec: 'automatic', time: 4, vol: 2000, va: 'VA' },
      { k: 'e1',  type: 'end',   label: 'Pago realizado', owner: 'Proveedor', event: 'message' }
    ];
    const E = [
      ['s','a1'], ['a1','d1'],
      ['d1','a2','Sí'], ['d1','a3','No'],
      ['a2','a3'], ['a3','a4'], ['a4','iv1'], ['iv1','a5'], ['a5','a6'], ['a6','d2'],
      ['d2','a8','Sí'], ['d2','a7','No'],
      ['a7','erech'],
      ['a8','d3'],
      ['d3','a9','Sí'], ['d3','edisp','No'],
      ['a9','a10'], ['a10','a11'], ['a11','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
        terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    state._kpiValues = {
      'tx-p2p-01': { name: 'Cycle time P2P (req → pago)', unit: 'días', benchmark: '< 10 días (best-in-class)', value: '21', gap: '+11 días', source: 'ERP' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Procure-to-Pay (P2P)** (Transversal — BPMN completo).\n\n` +
      `7 actores · 15 actividades · gateways exclusivos (umbral de aprobación, recepción conforme, 3-way match) · timer ⏱ (esperar entrega del proveedor) · inicio de **mensaje ✉**, **dos fines de error ⚡** (recepción rechazada, factura en disputa) y fin de **mensaje ✉** (pago realizado).\n\n` +
      `**Marcadores**: *Validar factura* = ⊞ subproceso (el **3-way match** OC/recepción/factura) y *Devolver al proveedor* = ↻ loop. El **cycle time P2P (21 días vs <10)** y el match manual son los cuellos. Proceso clásico **transversal** que cruza Solicitante → Compras → Aprobador → Proveedor → Almacén → Cuentas por Pagar → Tesorería.`);
  }

  function loadComplexDemo11() {
    resetState();
    state.meta = { name: 'Originación de Crédito Comercial PYME', industry: 'Banca', macroprocess: 'Riesgos', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Banca';
    $('#processMacro').value = 'Riesgos';

    const N = [
      { k: 's',   type: 'start', label: 'Solicitud de crédito', owner: 'Cliente', event: 'message' },
      { k: 'a1',  type: 'task',  label: 'Registrar solicitud', owner: 'Ejecutivo Comercial', system: 'CRM', exec: 'system', time: 10, vol: 1800, va: 'BVA' },
      { k: 'doc1',type: 'document', label: 'Expediente del cliente', owner: 'Ejecutivo Comercial' },
      { k: 'd0',  type: 'decision', label: '¿Cliente continúa?', owner: 'Ejecutivo Comercial', gateway: 'exclusive' },
      { k: 'eterm',type: 'end',  label: 'Solicitud cancelada', owner: 'Ejecutivo Comercial', terminate: true },
      { k: 'a2',  type: 'task',  label: 'Validar documentación', owner: 'Plataforma Digital', system: 'BPM', exec: 'system', time: 8, vol: 1700, va: 'VA' },
      { k: 'd1',  type: 'decision', label: '¿Documentación completa?', owner: 'Plataforma Digital', gateway: 'exclusive' },
      { k: 'a3',  type: 'task',  label: 'Subsanar documentación', owner: 'Cliente', exec: 'email', time: 20, vol: 500, va: 'NVA', marker: 'loop',
        pains: [{ category: 'rework', description: 'Reenvíos por documentación incompleta', severity: 4, frequency: 4 }] },
      { k: 'g1',  type: 'decision', label: 'Iniciar evaluación', owner: 'Análisis de Crédito', gateway: 'parallel' },
      { k: 'a4',  type: 'task',  label: 'Evaluar capacidad de pago', owner: 'Análisis de Crédito', exec: 'manual', time: 35, vol: 1500, va: 'VA', marker: 'subprocess' },
      { k: 'a5',  type: 'task',  label: 'Consultar centrales de riesgo', owner: 'Riesgos', system: 'SBS/Infocorp', exec: 'automatic', time: 6, vol: 1500, va: 'VA' },
      { k: 'data1',type: 'data', label: 'Score crediticio', owner: 'Riesgos' },
      { k: 'g2',  type: 'decision', label: 'Consolidar evaluación', owner: 'Análisis de Crédito', gateway: 'parallel' },
      { k: 'd2',  type: 'decision', label: '¿Validaciones adicionales?', owner: 'Análisis de Crédito', gateway: 'inclusive' },
      { k: 'a6',  type: 'task',  label: 'Tasar garantías', owner: 'Riesgos', exec: 'manual', time: 40, vol: 900, va: 'VA', marker: 'multiinstance',
        pains: [{ category: 'wait', description: 'Disponibilidad de peritos tasadores', severity: 3, frequency: 3 }] },
      { k: 'a7',  type: 'task',  label: 'Revisar contratos', owner: 'Legal', exec: 'manual', time: 25, vol: 700, va: 'BVA' },
      { k: 'a8',  type: 'task',  label: 'Consolidar propuesta', owner: 'Análisis de Crédito', exec: 'manual', time: 18, vol: 1500, va: 'VA' },
      { k: 'd3',  type: 'decision', label: '¿Supera umbral del comité?', owner: 'Análisis de Crédito', gateway: 'exclusive' },
      { k: 'a9',  type: 'task',  label: 'Presentar a comité', owner: 'Comité de Crédito', exec: 'manual', time: 30, vol: 600, va: 'BVA',
        pains: [{ category: 'wait', description: 'Comité sesiona solo 2 veces por semana', severity: 4, frequency: 5 }] },
      { k: 'iv1', type: 'intermediate', label: 'Esperar sesión de comité', owner: 'Comité de Crédito', event: 'timer' },
      { k: 'd4',  type: 'decision', label: '¿Crédito aprobado?', owner: 'Comité de Crédito', gateway: 'exclusive' },
      { k: 'erej',type: 'end',   label: 'Crédito denegado', owner: 'Comité de Crédito', event: 'error' },
      { k: 'a10', type: 'task',  label: 'Formalizar contrato', owner: 'Legal', exec: 'manual', time: 22, vol: 1100, va: 'VA' },
      { k: 'sig', type: 'intermediate', label: 'Difundir aprobación', owner: 'Ejecutivo Comercial', event: 'signal', throw: true },
      { k: 'a11', type: 'task',  label: 'Constituir garantías', owner: 'Operaciones', system: 'Core', exec: 'system', time: 15, vol: 1100, va: 'BVA' },
      { k: 'a12', type: 'task',  label: 'Desembolsar crédito', owner: 'Tesorería', system: 'Core', exec: 'automatic', time: 5, vol: 1100, va: 'VA' },
      { k: 'e1',  type: 'end',   label: 'Crédito desembolsado', owner: 'Cliente', event: 'message' }
    ];
    const E = [
      ['s','a1'], ['a1','doc1'], ['doc1','d0'],
      ['d0','a2','Sí'], ['d0','eterm','No'],
      ['a2','d1'],
      ['d1','g1','Sí'], ['d1','a3','No'], ['a3','a2'],
      ['g1','a4'], ['g1','a5'], ['a5','data1'], ['data1','g2'], ['a4','g2'],
      ['g2','d2'],
      ['d2','a6','Garantías'], ['d2','a7','Legal'],
      ['a6','a8'], ['a7','a8'],
      ['a8','d3'],
      ['d3','a9','Sí'], ['d3','d4','No'],
      ['a9','iv1'], ['iv1','d4'],
      ['d4','a10','Sí'], ['d4','erej','No'],
      ['a10','sig'], ['sig','a11'], ['a11','a12'], ['a12','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
        terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    state._kpiValues = {
      'per-sbs-01': { name: 'Ratio de morosidad (SBS)', unit: '%', benchmark: '< 4% sistema PE', value: '6.2', gap: '+2.2 pp', source: 'Core / SBS' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Originación de Crédito Comercial PYME** (Banca — *showcase* BPMN completo).\n\n` +
      `**9 actores · 27 nodos** — ejercita TODOS los elementos BPMN en un flujo: nodos **Documento ▤** (expediente) y **Data ▱** (score crediticio) · **gateway exclusivo ✕, paralelo ＋ (fork/join) e inclusivo ○** (garantías y/o legal) · **timer ⏱** (esperar comité) · **señal ▲ throw** (difundir aprobación) · **evento de terminación ⬤** (cancelación) · 2 fines de **error ⚡** · inicio y fin de **mensaje ✉**.\n\n` +
      `**Marcadores**: ⊞ subproceso (capacidad de pago), ‖ multi-instancia (tasar garantías), ↻ loop (subsanar). Es el ejemplo más grande: úsalo para validar que el **auto-layout se mantiene limpio a escala** (0 cruces, 0 solapamientos) y que el export PPTX parte el flujo en slides legibles.`);
  }

  function loadComplexDemo12() {
    resetState();
    state.meta = { name: 'Fulfillment E-commerce con SLA', industry: 'Retail', macroprocess: 'Supply Chain', client: '', owner: '' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Retail';
    $('#processMacro').value = 'Supply Chain';

    const N = [
      { k: 's',   type: 'start', label: 'Pedido confirmado', owner: 'Cliente', event: 'message' },
      { k: 'a1',  type: 'task',  label: 'Validar pago', owner: 'Pagos', system: 'Pasarela', exec: 'automatic', time: 3, vol: 5000, va: 'BVA' },
      { k: 'd1',  type: 'decision', label: '¿Pago aprobado?', owner: 'Pagos', gateway: 'exclusive' },
      { k: 'erej',type: 'end',   label: 'Pedido rechazado', owner: 'Pagos', event: 'error' },
      { k: 'a2',  type: 'task',  label: 'Preparar pedido (picking)', owner: 'Almacén', system: 'WMS', exec: 'manual', time: 25, vol: 4600, va: 'VA',
        boundary: { type: 'timer', interrupting: false },
        pains: [{ category: 'wait', description: 'Picking excede el SLA en campañas de alta demanda', severity: 4, frequency: 4 }] },
      { k: 'aesc',type: 'task',  label: 'Priorizar pedido', owner: 'Supervisor', exec: 'manual', time: 8, vol: 600, va: 'BVA' },
      { k: 'a3',  type: 'task',  label: 'Empacar y etiquetar', owner: 'Almacén', exec: 'manual', time: 10, vol: 4600, va: 'VA' },
      { k: 'a4',  type: 'task',  label: 'Asignar transportista', owner: 'Logística', system: 'TMS', exec: 'system', time: 5, vol: 4600, va: 'BVA' },
      { k: 'iv1', type: 'intermediate', label: 'Esperar recojo', owner: 'Transportista', event: 'timer' },
      { k: 'a5',  type: 'task',  label: 'Despachar a ruta', owner: 'Transportista', exec: 'manual', time: 15, vol: 4600, va: 'VA',
        boundary: { type: 'timer', interrupting: false } },
      { k: 'anot',type: 'task',  label: 'Notificar retraso', owner: 'Logística', exec: 'email', time: 4, vol: 700, va: 'BVA' },
      { k: 'a6',  type: 'task',  label: 'Entregar pedido', owner: 'Transportista', exec: 'manual', time: 20, vol: 4600, va: 'VA' },
      { k: 'd2',  type: 'decision', label: '¿Entrega exitosa?', owner: 'Transportista', gateway: 'exclusive' },
      { k: 'a7',  type: 'task',  label: 'Reprogramar entrega', owner: 'Logística', system: 'TMS', exec: 'system', time: 12, vol: 500, va: 'NVA', marker: 'loop',
        pains: [{ category: 'rework', description: 'Reintentos por cliente ausente', severity: 3, frequency: 4 }] },
      { k: 'a8',  type: 'task',  label: 'Confirmar entrega', owner: 'Logística', system: 'TMS', exec: 'system', time: 4, vol: 4400, va: 'VA' },
      { k: 'e1',  type: 'end',   label: 'Pedido entregado', owner: 'Cliente', event: 'message' }
    ];
    const E = [
      ['s','a1'], ['a1','d1'],
      ['d1','a2','Sí'], ['d1','erej','No'],
      ['a2','a3'], ['a2','aesc','SLA 2h vencido'], ['aesc','a3'],
      ['a3','a4'], ['a4','iv1'], ['iv1','a5'],
      ['a5','a6'], ['a5','anot','Demora > 24h'], ['anot','a6'],
      ['a6','d2'],
      ['d2','a8','Sí'], ['d2','a7','No'], ['a7','a6'],
      ['a8','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
        terminate: t.terminate || undefined, marker: t.marker || '', boundary: t.boundary || undefined, activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    state._kpiValues = {
      'ret-07': { name: 'Tasa de pedidos fuera de SLA', unit: '%', benchmark: '< 5%', value: '13', gap: '+8 pp', source: 'WMS/TMS' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('copilot');
    copilotPost('ai',
      `**Proceso cargado: Fulfillment E-commerce con SLA** (Retail — estrena **eventos de borde** BPMN).\n\n` +
      `6 actores · 13 actividades · **2 eventos de borde (boundary) de temporizador ⏱ no-interrumpentes** (anillo punteado) sobre tareas: *Preparar pedido* → si vence el **SLA de 2h** escala a *Priorizar pedido*; *Despachar a ruta* → si hay **demora >24h** dispara *Notificar retraso*. El flujo principal continúa en paralelo (no-interrumpente). Gateways exclusivos (pago, entrega), timer intermedio (esperar recojo), inicio/fin de **mensaje ✉**, fin de **error ⚡**, marcador ↻ loop (reprogramar).\n\n` +
      `Los **boundary events** modelan el manejo de excepciones por SLA sin romper el camino feliz — patrón clave en operaciones. La tasa fuera de SLA (13% vs <5%) es el cuello.`);
  }

  // ============================================================
  // DEMO DE ENTRENAMIENTO — Ficha real: Venta de Lotes Urbanos (Centenario, PR-DU-COM-02)
  // ~33 nodos, 4 roles, compuertas de 2 y 3 vías, dos loops (descuento y observaciones DD)
  // y tres ramas de firma que convergen. Valida que el flujo se arma correcto y que
  // la ficha corporativa se genera completa desde el modelo.
  // ============================================================
  function loadFichaVentaLotes() {
    resetState();
    state.meta = { name: 'Venta de Lotes Urbanos', industry: 'Transversal', macroprocess: 'O2C', client: 'Centenario', owner: 'Jefe de Ventas (Urbanizaciones)' };
    $('#processName').value = state.meta.name;
    $('#processIndustry').value = 'Transversal';
    $('#processMacro').value = 'O2C';

    const N = [
      { k: 's',   type: 'start', label: 'Lead captado', owner: 'Cliente', event: 'message' },
      { k: 'a1',  type: 'task', label: 'Registrar y derivar lead', owner: 'Call Center', system: 'Salesforce (CRM)', exec: 'system', time: 5, vol: 3000, va: 'BVA',
        notes: 'Canales: Digital (derivación automática a Salesforce), Call Center y Presencial (caseta de ventas).\nAsignación de leads digitales automatizada según capacidad y asesores activos.\nSolicitar consentimiento de datos personales (Anexo N°7).' },
      { k: 'a2',  type: 'task', label: 'Elaborar perfil del cliente', owner: 'Asesor Inmobiliario', exec: 'manual', time: 20, vol: 2400, va: 'VA',
        notes: 'Validar identidad con DNI; búsqueda en Google y redes sociales.\nDetectar señales de alerta (denuncias, temas legales).\nConstruir propuesta a la medida del cliente.' },
      { k: 'a3',  type: 'task', label: 'Atención de cliente y presentación', owner: 'Asesor Inmobiliario', exec: 'manual', time: 30, vol: 2400, va: 'VA',
        notes: 'Presentación del asesor y de Grupo Centenario (brochure, Anexo N°8).\nConocimiento del cliente para prevención LAFT: reportar señales de alerta al Encargado de Prevención del Delito.' },
      { k: 'a4',  type: 'task', label: 'Gestionar visita al proyecto', owner: 'Asesor Inmobiliario', exec: 'manual', time: 10, vol: 2000, va: 'BVA',
        notes: 'Programar visita (fecha y hora), virtual o presencial.' },
      { k: 'd1',  type: 'decision', label: '¿Modalidad de visita?', owner: 'Asesor Inmobiliario', gateway: 'exclusive' },
      { k: 'a5',  type: 'task', label: 'Realizar exposición virtual del producto', owner: 'Asesor Inmobiliario', system: 'Zoom / Teams', exec: 'manual', time: 40, vol: 1000, va: 'VA',
        notes: 'Herramientas: visor de lotes, recorrido virtual, cotizador, brochure.\nEl visor puede diferir de SAP por estrategia comercial (registrar en Excel/SharePoint).' },
      { k: 'd2',  type: 'decision', label: '¿Cliente interesado en comprar? (virtual)', owner: 'Asesor Inmobiliario', gateway: 'exclusive' },
      { k: 'a6',  type: 'task', label: 'Presentación y recorrido presencial', owner: 'Asesor Inmobiliario', exec: 'manual', time: 60, vol: 1200, va: 'VA',
        notes: 'Recorrido estructurado por las amenidades; revisar lotes seleccionados.' },
      { k: 'd3',  type: 'decision', label: '¿Cliente interesado en comprar? (presencial)', owner: 'Asesor Inmobiliario', gateway: 'exclusive' },
      { k: 'a7',  type: 'task', label: 'Ofrecer propuesta comercial', owner: 'Asesor Inmobiliario', exec: 'manual', time: 25, vol: 1600, va: 'VA',
        notes: 'Negociación sobre lotes y modelo de financiamiento (Anexo N°9).\nMeta de ventas según Anexo N°11.',
        pains: [{ category: 'wait', description: 'Cliente pospone decisión; se pierde momentum de cierre', severity: 3, frequency: 4 }] },
      { k: 'd4',  type: 'decision', label: '¿Resultado de la negociación?', owner: 'Asesor Inmobiliario', gateway: 'exclusive' },
      { k: 'a8',  type: 'task', label: 'Gestionar nueva propuesta (descuento)', owner: 'Asesor Inmobiliario', exec: 'manual', time: 15, vol: 700, va: 'BVA',
        notes: 'Validar viabilidad según bolsa de descuentos, márgenes y precios (aprueba Jefe de Ventas).' },
      { k: 'd5',  type: 'decision', label: '¿Descuento viable?', owner: 'Jefe de Ventas', gateway: 'exclusive' },
      { k: 'a9',  type: 'task', label: 'Gestionar pago', owner: 'Asesor Inmobiliario', system: 'Salesforce (CRM)', exec: 'system', time: 20, vol: 900, va: 'VA',
        notes: 'Tipos: operación con depósito / pago 1ra cuota / al contado.\nMedios: POS, PagoEfectivo, transferencia, abono en cuenta, Web Terreno.\nProhibido efectivo (reglamento interno).' },
      { k: 'a10', type: 'task', label: 'Gestionar evaluación de debida diligencia', owner: 'Asesor Inmobiliario', system: 'Thomson Reuters', exec: 'manual', time: 30, vol: 900, va: 'BVA',
        notes: 'Sustento de debida diligencia (Política PO-IC-LEG-04).\nScoring de riesgo (Anexo N°6); régimen reforzado requiere aprobación VP y opinión de Legal.',
        pains: [{ category: 'handoff', description: 'Ida y vuelta con Legal/Cumplimiento en régimen reforzado', severity: 4, frequency: 3 }] },
      { k: 'a14', type: 'task', label: 'Solicitar contrato', owner: 'Asesor Inmobiliario', system: 'OnBase', exec: 'system', time: 10, vol: 900, va: 'BVA',
        notes: 'Cargar documentación de DD a OnBase; indicar contrato Presencial o No Presencial.\nEl Supervisor de Zona aprueba en el módulo comercial de OnBase.' },
      { k: 'a15', type: 'task', label: 'Revisar y liberar documentación de DD', owner: 'Administrador de Ventas', system: 'OnBase', exec: 'manual', time: 25, vol: 900, va: 'BVA',
        notes: 'Verifica que la documentación de debida diligencia esté completa.',
        pains: [{ category: 'rework', description: 'Devoluciones por documentación incompleta', severity: 3, frequency: 4 }] },
      { k: 'd6',  type: 'decision', label: '¿Documentación conforme?', owner: 'Administrador de Ventas', gateway: 'exclusive' },
      { k: 'a16', type: 'task', label: 'Generar contrato y anexos', owner: 'Administrador de Ventas', system: 'OnBase', exec: 'system', time: 20, vol: 850, va: 'VA',
        notes: 'Contrato (art. 78.1 Código de Protección al Consumidor), cronograma, hoja resumen, ROP, DJ LAFT, reporte Thomson Reuters, DJ conocimiento de cliente.' },
      { k: 'a17', type: 'task', label: 'Recibir contrato y gestionar aceptación', owner: 'Asesor Inmobiliario', exec: 'manual', time: 15, vol: 850, va: 'VA',
        notes: 'Entregar al comprador la información del art. 78.2 (resolución municipal, planos, características de HU, App Vecino Centenario).' },
      { k: 'd7',  type: 'decision', label: '¿Modalidad de firma?', owner: 'Asesor Inmobiliario', gateway: 'exclusive' },
      { k: 'a18', type: 'task', label: 'Tomar firma del cliente (presencial)', owner: 'Asesor Inmobiliario', exec: 'manual', time: 20, vol: 300, va: 'VA',
        notes: 'Firma de todos los documentos (excepto reporte Thomson Reuters). Incentivo de cierre según escala aprobada.' },
      { k: 'a19', type: 'task', label: 'Cargar documentación y archivar física', owner: 'Asesor Inmobiliario', system: 'OnBase', exec: 'system', time: 12, vol: 300, va: 'BVA',
        notes: 'Carga a OnBase Comercial; documentación física a Archivo máximo el día 7 de cada mes.' },
      { k: 'a20', type: 'task', label: 'Enviar contrato por correo al cliente', owner: 'Asesor Inmobiliario', exec: 'email', time: 10, vol: 350, va: 'VA',
        notes: 'Correo a ventadelotes@centenario.com.pe con confirmación de entrega y lectura. Correo de bienvenida.' },
      { k: 'a21', type: 'task', label: 'Acusar recibo y aceptar oferta', owner: 'Cliente', exec: 'manual', time: 5, vol: 350, va: 'VA',
        notes: 'Correo 1: acuse de recibo. Correo 2: aceptación con copia de DNI y declaración firmada con huella.' },
      { k: 'a22', type: 'task', label: 'Cargar correos de aceptación en OnBase', owner: 'Asesor Inmobiliario', system: 'OnBase', exec: 'system', time: 10, vol: 350, va: 'BVA',
        notes: 'Descargar correos (.msg) de oferta, acuse y aceptación, y subirlos a OnBase.' },
      { k: 'a23', type: 'task', label: 'Cargar documentos para firma electrónica', owner: 'Asesor Inmobiliario', system: 'Keynua', exec: 'system', time: 15, vol: 200, va: 'VA',
        notes: 'Separar en 2 grupos (firma de todas las partes / firma solo del cliente) y generar los flujos de firma en Keynua.' },
      { k: 'a24', type: 'task', label: 'Cargar documentos firmados en OnBase', owner: 'Asesor Inmobiliario', system: 'OnBase', exec: 'system', time: 8, vol: 200, va: 'BVA',
        notes: 'Al concluir el flujo de Keynua, descargar los documentos firmados y subirlos a OnBase Comercial.' },
      { k: 'a25', type: 'task', label: 'Publicar información en App Vecino Centenario', owner: 'Administrador de Ventas', system: 'App Vecino Centenario', exec: 'system', time: 5, vol: 850, va: 'BVA',
        notes: 'Tras el cierre de ventas en el ERP, publicar los documentos (Anexo 10) en el App Vecino Centenario.' },
      { k: 'a26', type: 'task', label: 'Enviar contrato, anexos y acta a Archivo', owner: 'Asesor Inmobiliario', exec: 'manual', time: 15, vol: 850, va: 'BVA',
        notes: 'Envío físico (valija/motorizado) máximo el día 7 de cada mes: contrato, ficha cliente y acta de entrega. Confirmación con cargo firmado.' },
      { k: 'e1',  type: 'end', label: 'Venta finalizada', owner: 'Cliente', event: 'message' },
      { k: 'eno', type: 'end', label: 'Fin — venta no concretada', owner: 'Asesor Inmobiliario', event: 'terminate', terminate: true }
    ];
    const E = [
      ['s','a1'], ['a1','a2'], ['a2','a3'], ['a3','a4'], ['a4','d1'],
      ['d1','a5','Virtual'], ['d1','a6','Presencial'],
      ['a5','d2'], ['d2','a7','Sí'], ['d2','eno','No'],
      ['a6','d3'], ['d3','a7','Sí'], ['d3','eno','No'],
      ['a7','d4'],
      ['d4','a8','Solicita descuento'], ['d4','a9','Acepta'], ['d4','eno','No continúa'],
      ['a8','d5'], ['d5','a7','Viable'], ['d5','eno','No viable'],
      ['a9','a10'], ['a10','a14'], ['a14','a15'], ['a15','d6'],
      ['d6','a14','Observaciones'], ['d6','a16','Conforme'],
      ['a16','a17'], ['a17','d7'],
      ['d7','a18','Presencial'], ['d7','a20','No presencial'], ['d7','a23','Firma electrónica'],
      ['a18','a19'], ['a19','a25'],
      ['a20','a21'], ['a21','a22'], ['a22','a25'],
      ['a23','a24'], ['a24','a25'],
      ['a25','a26'], ['a26','e1']
    ];

    const idMap = {};
    N.forEach(t => {
      const def = SHAPE_DEFAULTS[t.type];
      const node = {
        id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
        gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
        terminate: t.terminate || undefined, marker: t.marker || '', boundary: t.boundary || undefined, activityCode: '',
        owner: t.owner || '', system: t.system || '',
        time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: t.notes || '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

    // Ficha corporativa completa (datos reales del documento PR-DU-COM-02 v6)
    state.ficha = {
      code: 'PR-DU-COM-02', version: '6',
      objetivo: 'Describir las actividades y responsabilidades del proceso de Venta de Lotes Urbanos en Centenario.',
      alcanceAreas: 'Ventas de Lotes Urbanos y Administración de Ventas',
      alcanceDesde: 'Captación de leads a través de los canales de promoción',
      alcanceHasta: 'Firma del contrato de venta y envío de la documentación a Archivo',
      alcanceIncluye: 'Abarca lotes residenciales y de segunda vivienda',
      descripcion: '',
      gobernanza: [
        { rol: 'Dueño', cargo: 'Jefe de Ventas (Urbanizaciones)', nombre: 'Carlos Manuel Ismael Rolleri Limo', fecha: '' },
        { rol: 'Editor', cargo: 'Jefe de Ventas (Urbanizaciones)', nombre: 'Carlos Manuel Ismael Rolleri Limo', fecha: '' },
        { rol: 'Revisor', cargo: '—', nombre: 'Jaime Luis Alva Hurtado', fecha: '' },
        { rol: 'Aprobador', cargo: 'Gerente Post Venta y Atención al Cliente', nombre: 'Guillermo Jorge Segura Gomi', fecha: '' },
        { rol: 'Aprobador', cargo: 'VP Desarrollo Urbano', nombre: 'Carlos Alberto Conroy Ferreccio', fecha: '' },
        { rol: 'Aprobador', cargo: 'Gerente Comercial (DU)', nombre: '', fecha: '' }
      ],
      sistemas: [
        { nombre: 'Salesforce (CRM)', uso: 'Registro de leads, oportunidades y órdenes de pago' },
        { nombre: 'ONBASE', uso: 'Gestión documental y workflow comercial' },
        { nombre: 'SAP', uso: 'ERP — cierre de venta e inventario' },
        { nombre: 'Keynua', uso: 'Firma electrónica de contratos' },
        { nombre: 'Thomson Reuters', uso: 'Debida diligencia / listas restrictivas' },
        { nombre: 'App Vecino Centenario', uso: 'Publicación de información al cliente' },
        { nombre: 'Web Terreno', uso: 'Pago de primera cuota en línea' }
      ],
      terminos: [
        { termino: 'Lead', definicion: 'Persona u organización interesada que comparte su información de contacto (correo, teléfono, redes).' },
        { termino: 'Oportunidad', definicion: 'Potencial venta de lote a un prospecto.' }
      ],
      anexos: [
        { codigo: 'Anexo N°1', nombre: 'DJ de conocimiento de clientes PN LAFT' },
        { codigo: 'Anexo N°2', nombre: 'DJ de conocimiento de clientes PJ LAFT' },
        { codigo: 'Anexo N°3', nombre: 'DJ Origen de Fondos LAFT' },
        { codigo: 'Anexo N°4', nombre: 'DJ Accionariado de PJ LAFT' },
        { codigo: 'Anexo N°5', nombre: 'Formato de Entrevista de Cliente' },
        { codigo: 'Anexo N°6', nombre: 'Scoring de Calificación de Riesgo' },
        { codigo: 'Anexo N°7', nombre: 'Guía para Privacidad y Tratamiento de Datos Personales' },
        { codigo: 'Anexo N°8', nombre: 'Información en página web y speech de ventas' },
        { codigo: 'Anexo N°9', nombre: 'Modelo de financiamiento' },
        { codigo: 'Anexo N°10', nombre: 'Entrega de información relacionada a la venta' },
        { codigo: 'Anexo N°11', nombre: 'Asignación de meta de ventas' }
      ],
      cambios: [
        { version: '1', fecha: '10/04/2023', descripcion: 'Actualización completa del documento.' },
        { version: '2', fecha: '04/10/2023', descripcion: 'Se crea el Anexo 10 (integración OnBase – App Vecino Centenario).' },
        { version: '3', fecha: '10/11/2023', descripcion: 'Se precisa la generación de órdenes de pago y registro de pagos.' },
        { version: '4', fecha: '25/03/2024', descripcion: 'Sustento de ingresos (cuota > 1/2.5 UIT); incentivos por firma de contrato.' },
        { version: '5', fecha: '29/11/2024', descripcion: 'Aprobación de recargas por correo; envío físico el día 7; firma electrónica Keynua.' },
        { version: '6', fecha: '10/02/2026', descripcion: 'Digitalización del levantamiento y ficha en ProcessIQ.' }
      ]
    };

    state._kpiValues = {
      'vl-01': { name: 'Tasa de conversión lead → venta', unit: '%', benchmark: '≥ 4%', value: '2.8', gap: '-1.2 pp', source: 'Salesforce' },
      'vl-02': { name: 'Lead time captación → firma', unit: 'días', benchmark: '≤ 30 días', value: '41', gap: '+11 días', source: 'OnBase' }
    };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    persist();
    activateTab('ficha');
    renderFichaTab();
    copilotPost('ai',
      `**Ficha cargada: Venta de Lotes Urbanos — Centenario (PR-DU-COM-02, v6).**\n\n` +
      `Es el ejemplo de entrenamiento real: **29 actividades · 4 roles** (Cliente, Call Center, Asesor Inmobiliario, Administración de Ventas), compuertas de 2 y 3 vías, **dos loops** (descuento no viable → renegociar; observaciones de debida diligencia → subsanar) y **tres ramas de firma** (presencial, no presencial, Keynua) que convergen antes del cierre.\n\n` +
      `La pestaña **Ficha** ya trae los metadatos corporativos (gobernanza, sistemas, términos, 11 anexos, control de cambios). Pulsa **Generar ficha** o Exportar → *Ficha de Proceso* para producir el documento Word completo con el detalle de actividades y ruteo derivado del flujo.`);
  }

  // =================== EXPORT / IMPORT ===================
  function exportJson() {
    const data = { meta: state.meta, ficha: state.ficha, nodes: state.nodes, edges: state.edges, exportedAt: new Date().toISOString() };
    download(JSON.stringify(data, null, 2), filename('json'), 'application/json');
  }

  function importJson(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        state.meta = data.meta || state.meta;
        state.ficha = normalizeFicha(data.ficha);
        state.nodes = data.nodes || [];
        state.edges = data.edges || [];
        state.nextId = (Math.max(0, ...state.nodes.map(n => parseInt(n.id.slice(1), 10) || 0)) || 0) + 1;
        $('#processName').value = state.meta.name || '';
        $('#processIndustry').value = state.meta.industry || '';
        $('#processMacro').value = state.meta.macroprocess || '';
        persist();
        render();
      } catch (err) { alert('Archivo JSON inválido.'); }
    };
    reader.readAsText(f);
    e.target.value = '';
  }

  function exportSvg() {
    const svgString = serializeCanvasSvg();
    download(svgString, filename('svg'), 'image/svg+xml');
  }

  function exportPng() {
    const svgString = serializeCanvasSvg();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const cnv = document.createElement('canvas');
      const padding = 20;
      cnv.width = img.width + padding * 2;
      cnv.height = img.height + padding * 2;
      const ctx = cnv.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cnv.width, cnv.height);
      ctx.drawImage(img, padding, padding);
      cnv.toBlob(b => {
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u; a.download = filename('png'); a.click();
        URL.revokeObjectURL(u);
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function serializeCanvasSvg() {
    // Bounding box de nodos
    if (state.nodes.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"></svg>';
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h + 20);
    });
    const w = maxX - minX + 40;
    const h = maxY - minY + 40;
    const clone = canvas.cloneNode(true);
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    clone.setAttribute('viewBox', `${minX - 20} ${minY - 20} ${w} ${h}`);
    // Los estilos del lienzo viven en styles.css y el SVG serializado no los
    // lleva: sin ellos todo <path> se rellena de negro y el texto sale en
    // serifa (visto por el usuario en la descarga PNG: las flechas eran
    // poligonos negros). Se copian los estilos computados relevantes como
    // estilo inline, elemento a elemento, recorriendo original y clon en
    // paralelo (querySelectorAll devuelve el mismo orden en ambos).
    const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
                   'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style',
                   'letter-spacing', 'text-anchor', 'dominant-baseline', 'paint-order', 'text-transform'];
    const orig = canvas.querySelectorAll('*'), cop = clone.querySelectorAll('*');
    const ocultar = [];
    for (let i = 0; i < orig.length && i < cop.length; i++) {
      const cs = getComputedStyle(orig[i]);
      if (cs.display === 'none' || cs.visibility === 'hidden') { ocultar.push(cop[i]); continue; }
      let st = '';
      PROPS.forEach(p => { const v = cs.getPropertyValue(p); if (v && v !== 'normal' && v !== 'auto') st += p + ':' + v + ';'; });
      if (st) cop[i].setAttribute('style', st);
    }
    ocultar.forEach(el => el.remove());
    // La rejilla se quita DESPUES del recorrido: si se quita antes, original y
    // clon dejan de ir en paralelo y cada elemento hereda el estilo del anterior
    // (todo salia negro).
    const grid = clone.querySelector('#gridBg');
    if (grid) grid.remove();
    // Fondo blanco explicito: un SVG suelto se abre transparente
    const fondo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    fondo.setAttribute('x', minX - 20); fondo.setAttribute('y', minY - 20);
    fondo.setAttribute('width', w); fondo.setAttribute('height', h); fondo.setAttribute('fill', '#FFFFFF');
    clone.insertBefore(fondo, clone.firstChild);
    return new XMLSerializer().serializeToString(clone);
  }

  function filename(ext) {
    const name = (state.meta.name || 'proceso').replace(/[^a-zA-Z0-9-_]+/g, '_');
    const ts = new Date().toISOString().slice(0, 10);
    return `ProcessIQ_${name}_${ts}.${ext}`;
  }

  function download(content, name, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================================
  // LINTER MBB — validaciones automáticas del playbook
  // ============================================================
  const SEV = { critical: 4, high: 3, medium: 2, low: 1 };

  function lintProcess() {
    const issues = [];
    const nodes = state.nodes;
    const edges = state.edges;
    if (nodes.length === 0) return issues;

    const allowed = window.VERBS_ALLOWED || [];
    const forbidden = window.VERBS_FORBIDDEN || {};

    // Mapas de in/out grade
    const inDeg = {}, outDeg = {};
    edges.forEach(e => {
      outDeg[e.from] = (outDeg[e.from] || 0) + 1;
      inDeg[e.to] = (inDeg[e.to] || 0) + 1;
    });

    const starts = nodes.filter(n => n.type === 'start');
    const ends = nodes.filter(n => n.type === 'end');

    // R1: al menos 1 start
    if (starts.length === 0) issues.push({ sev: 'critical', title: 'Falta evento Start', detail: 'Todo proceso debe iniciar en un evento "Inicio".' });
    // R2: al menos 1 end
    if (ends.length === 0) issues.push({ sev: 'critical', title: 'Falta evento End', detail: 'Todo proceso debe cerrar en al menos un "Fin".' });
    // R3: end genérico
    ends.forEach(n => {
      const lower = (n.label || '').toLowerCase().trim();
      if (!lower || lower === 'fin' || lower === 'final' || lower === 'fin del proceso') {
        issues.push({ sev: 'medium', title: 'End event genérico', detail: 'Cada "Fin" debe describir un outcome distinto (ej. "Crédito aprobado", "Solicitud rechazada").', target: n.id });
      }
    });

    nodes.forEach(n => {
      const label = (n.label || '').trim();
      const lower = label.toLowerCase();
      const firstWord = lower.split(/\s+/)[0].replace(/[^a-záéíóúñ]/g, '');

      // R4: actividad sin etiqueta
      if (!label) issues.push({ sev: 'high', title: 'Nodo sin etiqueta', detail: 'Asigna un nombre descriptivo al nodo.', target: n.id });

      // Validaciones específicas a tasks/system
      if (n.type === 'task' || n.type === 'system') {
        // R5: verbo prohibido
        if (firstWord && forbidden[firstWord]) {
          issues.push({ sev: 'medium', title: `Verbo prohibido: "${firstWord}"`, detail: forbidden[firstWord], target: n.id });
        } else if (firstWord && !allowed.some(a => firstWord.startsWith(a))) {
          // R6: verbo fuera de catálogo (solo warning bajo)
          issues.push({ sev: 'low', title: `Verbo fuera de catálogo: "${firstWord}"`, detail: 'Considera un verbo del catálogo MBB (registrar, validar, aprobar…).', target: n.id });
        }

        // R7: longitud excesiva
        const words = label.split(/\s+/).length;
        if (label.length > 50 || words > 8) {
          issues.push({ sev: 'medium', title: 'Etiqueta demasiado larga', detail: `"${label}" tiene ${label.length} car / ${words} pal. Máx 50/8 → considera descomponer.`, target: n.id });
        }

        // R8: sin responsable
        if (!n.owner) issues.push({ sev: 'high', title: 'Actividad sin responsable', detail: `"${label}" debe tener un rol asignado.`, target: n.id });

        // R9: sin tipo de ejecución
        if (!n.executionType) issues.push({ sev: 'high', title: 'Actividad sin tipo de ejecución', detail: `Asigna manual/sistema/automático/IA/etc. a "${label}".`, target: n.id });

        // R10: actividad manual muy larga
        if (n.executionType === 'manual' && parseFloat(n.time) > 120) {
          issues.push({ sev: 'low', title: 'Actividad manual >120 min', detail: `"${label}" es manual y dura más de 2 horas — considera descomponer.`, target: n.id });
        }

        // R11: contradicción tipo automático con responsable humano
        if (n.executionType === 'automatic' && n.owner && !/sistema|bot|auto/i.test(n.owner)) {
          issues.push({ sev: 'low', title: 'Automático con responsable humano', detail: `"${label}" es automática pero tiene responsable "${n.owner}". ¿Es correcto?`, target: n.id });
        }
      }

      // R12: gateway sin "?"
      if (n.type === 'decision') {
        if (label && !label.startsWith('¿') && !label.endsWith('?')) {
          issues.push({ sev: 'medium', title: 'Gateway sin pregunta', detail: `"${label}" debe formularse como pregunta cerrada (¿Sí/No?) o ramificación (¿Qué tipo?).`, target: n.id });
        }
      }

      // R13: actividad huérfana
      if (n.type !== 'start' && (inDeg[n.id] || 0) === 0) {
        issues.push({ sev: 'critical', title: 'Nodo sin entrada', detail: `"${label || n.id}" no tiene conexión entrante. Conecta o elimina.`, target: n.id });
      }
      if (n.type !== 'end' && (outDeg[n.id] || 0) === 0) {
        issues.push({ sev: 'critical', title: 'Nodo sin salida', detail: `"${label || n.id}" no tiene conexión saliente. Conecta o márcalo como Fin.`, target: n.id });
      }
    });

    // R14: gateway con salidas sin etiquetar
    nodes.filter(n => n.type === 'decision').forEach(g => {
      const out = edges.filter(e => e.from === g.id);
      if (out.length >= 2) {
        const unlabeled = out.filter(e => !e.label || !e.label.trim()).length;
        if (unlabeled > 0) issues.push({ sev: 'medium', title: `Gateway con ${unlabeled} salida(s) sin etiquetar`, detail: `"${g.label}" — etiqueta cada salida (Sí/No o valor específico).`, target: g.id });
      }
      if (out.length > 4) issues.push({ sev: 'low', title: 'Gateway con >4 salidas', detail: `"${g.label}" tiene ${out.length} salidas. Considera descomponer o usar subproceso.`, target: g.id });
    });

    // R15: cantidad de nodos
    if (nodes.length > 15) {
      issues.push({ sev: 'low', title: `Proceso con ${nodes.length} nodos`, detail: 'Más de 15 nodos visibles → considera extraer secciones a subprocesos.' });
    }
    if (nodes.length < 3) {
      issues.push({ sev: 'low', title: 'Proceso muy simple', detail: 'Menos de 3 nodos. ¿Falta detalle?' });
    }

    // R16: roles únicos (sugerir swimlanes)
    const roles = [...new Set(nodes.map(n => n.owner).filter(Boolean))];
    if (roles.length > 6) {
      issues.push({ sev: 'low', title: `${roles.length} roles distintos`, detail: 'Considera agrupar roles o dividir el proceso para mejorar claridad.' });
    }

    return issues;
  }

  function runLinter() {
    const issues = lintProcess();
    renderLintPanel(issues);
    const critHigh = issues.filter(i => i.sev === 'critical' || i.sev === 'high').length;
    const badge = $('#lintBadge');
    if (!badge) return;
    if (issues.length === 0) {
      badge.hidden = true;
      badge.textContent = '';
    } else {
      badge.hidden = false;
      badge.textContent = issues.length;
      badge.style.background = critHigh > 0 ? 'var(--danger)' : 'var(--warning)';
    }
  }

  function renderLintPanel(issues) {
    const list = $('#lintList');
    const score = $('#lintScore');
    if (!list || !score) return;

    if (state.nodes.length === 0) {
      list.innerHTML = '<div class="panel-hint">Genera o dibuja un proceso para validar.</div>';
      score.innerHTML = '';
      return;
    }

    if (issues.length === 0) {
      list.innerHTML = '<div class="lint-empty">¡Cero issues! El proceso cumple el playbook MBB.</div>';
      score.className = 'lint-score good';
      score.innerHTML = '<div><div class="score-num">100</div><div class="score-detail">Score MBB · sin issues</div></div>';
      return;
    }

    // Score: 100 - 15*crit - 8*high - 3*medium - 1*low (mín 0)
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    issues.forEach(i => c[i.sev]++);
    const scoreVal = Math.max(0, 100 - 15 * c.critical - 8 * c.high - 3 * c.medium - 1 * c.low);
    const cls = scoreVal >= 80 ? 'good' : (scoreVal >= 50 ? 'warn' : 'bad');
    score.className = 'lint-score ' + cls;
    score.innerHTML = `
      <div><div class="score-num">${scoreVal}</div><div class="score-detail">Score MBB</div></div>
      <div style="flex:1;text-align:right">
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-bottom:3px">
          ${c.critical ? `<span class="sev-tag sev-critical">${c.critical} crit</span>` : ''}
          ${c.high ? `<span class="sev-tag sev-high">${c.high} alto</span>` : ''}
          ${c.medium ? `<span class="sev-tag sev-medium">${c.medium} medio</span>` : ''}
          ${c.low ? `<span class="sev-tag sev-low">${c.low} bajo</span>` : ''}
        </div>
        <div class="score-detail">${issues.length} issue${issues.length === 1 ? '' : 's'} detectado${issues.length === 1 ? '' : 's'}</div>
      </div>`;

    // Ordena por severidad
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = issues.slice().sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]);
    const icons = { critical: '✕', high: '!', medium: '⚠', low: 'ⓘ' };

    list.innerHTML = sorted.map(i => `
      <div class="lint-item sev-${i.sev}" data-target="${i.target || ''}">
        <div class="lint-icon">${icons[i.sev]}</div>
        <div class="lint-body">
          <div class="lint-title">${escapeHtml(i.title)}</div>
          <div class="lint-detail">${escapeHtml(i.detail)}</div>
          ${i.target ? '<div class="lint-target">→ click para ir al nodo</div>' : ''}
        </div>
      </div>`).join('');

    list.querySelectorAll('.lint-item[data-target]').forEach(el => {
      const tid = el.dataset.target;
      if (!tid) return;
      el.addEventListener('click', () => {
        state.selectedNodeId = tid;
        state.selectedEdgeId = null;
        activateTab('properties');
        render();
      });
    });
  }

  // ============================================================
  // COMPARADOR As-Is / To-Be
  // ============================================================
  function setView(view) {
    if (view === state.activeView) return;
    // Snapshot del view activo antes de cambiar
    state._views[state.activeView] = {
      nodes: JSON.parse(JSON.stringify(state.nodes)),
      edges: JSON.parse(JSON.stringify(state.edges))
    };
    state.activeView = view;
    const target = state._views[view];
    if (target) {
      state.nodes = target.nodes;
      state.edges = target.edges;
    } else {
      state.nodes = [];
      state.edges = [];
    }
    state.selectedNodeId = null;
    state.selectedEdgeId = null;
    updateViewUi();
    persist();
    render();
  }

  function updateViewUi() {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.activeView));
    let ind = document.getElementById('tobeIndicator');
    if (state.activeView === 'tobe') {
      if (!ind) {
        ind = document.createElement('div');
        ind.id = 'tobeIndicator';
        ind.className = 'tobe-indicator';
        ind.textContent = 'TO-BE · REINGENIERÍA';
        $('#canvasWrapper').appendChild(ind);
      }
    } else if (ind) ind.remove();
  }

  function cloneAsIsToToBe() {
    if (state.nodes.length === 0 && state.activeView === 'asis') {
      alert('Genera o dibuja un proceso As-Is primero.');
      return;
    }
    // Garantiza que el as-is actual esté guardado
    if (state.activeView === 'asis') {
      state._views.asis = {
        nodes: JSON.parse(JSON.stringify(state.nodes)),
        edges: JSON.parse(JSON.stringify(state.edges))
      };
    } else if (!state._views.asis) {
      alert('No hay un As-Is que clonar.');
      return;
    }
    // Clona profundo
    state._views.tobe = JSON.parse(JSON.stringify(state._views.asis));
    setView('tobe');
    activateTab('copilot');
    copilotPost('ai',
      `Cloné el As-Is al To-Be. Ahora puedes editar el flujo sin afectar el original.\n\n` +
      `**Sugerencias de reingeniería rápidas:**\n` +
      `• Elimina nodos de control duplicado.\n` +
      `• Marca actividades manuales como **sistema** (automatización).\n` +
      `• Une handoffs en una célula multifuncional.\n` +
      `• Mueve decisiones a reglas codificadas (DMN).\n\n` +
      `Cuando termines, exporta a PPTX — incluiré un slide comparativo lado a lado.`);
  }

  // ============================================================
  // TRANSFORMAR A TO-BE por nivel (Operativo / Táctico / Estratégico)
  // Inspirado en MBC Process Disruptor: "Generar To-Be · Mantener Nivel"
  // ============================================================
  const TOBE_LEVELS = {
    operativo: {
      label: 'Operativo — Quick wins',
      desc: 'Automatiza tareas manuales repetitivas, elimina reprocesos. Cambios de bajo riesgo, 0-3 meses.'
    },
    tactico: {
      label: 'Táctico — Rediseño de flujo',
      desc: 'Elimina handoffs, paraleliza, consolida controles duplicados. 3-9 meses.'
    },
    estrategico: {
      label: 'Estratégico — Reimaginar',
      desc: 'Self-service digital, elimina pasos sin valor, repensar el proceso end-to-end. 9-18 meses.'
    }
  };

  function openTransformToBeModal() {
    const asisNodes = state.activeView === 'asis' ? state.nodes : (state._views.asis?.nodes || []);
    if (asisNodes.length === 0) { alert('Genera o dibuja un proceso As-Is primero.'); return; }
    const html = `
      <p class="panel-hint" style="margin-bottom:10px">ProcessIQ clona el As-Is y aplica palancas de reingeniería según el <strong>nivel</strong> elegido. Luego puedes editar manualmente el resultado.</p>
      <label style="display:block;margin-bottom:8px;font-size:12px;font-weight:600">Nivel de transformación
        <select id="tobeLevelSel" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:6px;margin-top:3px">
          <option value="operativo">${TOBE_LEVELS.operativo.label}</option>
          <option value="tactico">${TOBE_LEVELS.tactico.label}</option>
          <option value="estrategico">${TOBE_LEVELS.estrategico.label}</option>
        </select>
      </label>
      <div id="tobeLevelDesc" class="field-hint info" style="margin-bottom:10px">${TOBE_LEVELS.operativo.desc}</div>
      <label style="display:block;font-size:12px;font-weight:600">Cambios específicos (opcional)
        <textarea id="tobeChanges" rows="3" placeholder="Ej. 'Eliminar la validación manual del paso 3', 'Añadir autoservicio en la captura'…" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-top:3px;font-family:inherit"></textarea>
      </label>`;
    openModal('✨ Transformar a To-Be por nivel', html, () => {
      const level = $('#tobeLevelSel').value;
      const changes = $('#tobeChanges').value.trim();
      transformToBe(level, changes);
    });
    // Actualiza descripción al cambiar nivel
    setTimeout(() => {
      const sel = $('#tobeLevelSel');
      if (sel) sel.addEventListener('change', () => {
        $('#tobeLevelDesc').textContent = TOBE_LEVELS[sel.value].desc;
      });
    }, 50);
  }

  function transformToBe(level, changes) {
    // Asegura as-is guardado
    if (state.activeView === 'asis') {
      state._views.asis = { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) };
    }
    if (!state._views.asis) { alert('No hay As-Is que transformar.'); return; }

    // Clona profundo
    const tobe = JSON.parse(JSON.stringify(state._views.asis));
    const changeLog = [];

    if (level === 'operativo') {
      // Automatiza tareas manuales de alto volumen / repetitivas
      tobe.nodes.forEach(n => {
        if (n.type === 'task' && n.executionType === 'manual') {
          // Convierte a RPA/automático si parece rule-based (registrar, validar, calcular…)
          const lbl = (n.label || '').toLowerCase();
          if (/registr|ingres|valid|calcul|consult|verific|notific|envi|gener/.test(lbl)) {
            n.executionType = /notific|envi|correo/.test(lbl) ? 'automatic' : 'rpa';
            n.activityCode = '';  // se re-asignará
            changeLog.push(`Automatizada: "${n.label}" → ${n.executionType === 'rpa' ? 'RPA/Bot' : 'Service Task'}`);
          }
        }
      });
    } else if (level === 'tactico') {
      // Elimina handoffs: une tareas consecutivas del mismo responsable; convierte manuales en sistema
      const owners = {};
      tobe.nodes.forEach(n => { owners[n.id] = n.owner; });
      tobe.nodes.forEach(n => {
        if (n.type === 'task' && n.executionType === 'manual') {
          n.executionType = 'system';
          n.activityCode = '';
          changeLog.push(`Digitalizada: "${n.label}" → User Task (sistema)`);
        }
      });
      // Marca decisiones para codificar como reglas (DMN)
      tobe.nodes.filter(n => n.type === 'decision').forEach(d => {
        if (!/regla|dmn/i.test(d.notes || '')) {
          d.notes = (d.notes ? d.notes + ' ' : '') + '[To-Be: codificar como regla DMN]';
          changeLog.push(`Decisión "${d.label}" → regla codificada (DMN)`);
        }
      });
    } else if (level === 'estrategico') {
      // Self-service: marca tareas de captura/cliente como automáticas/IA; elimina algunos handoffs
      tobe.nodes.forEach(n => {
        if (n.type === 'task') {
          const lbl = (n.label || '').toLowerCase();
          if (/solicit|captur|ingres|registr|complet|llen/.test(lbl)) {
            n.executionType = 'automatic';
            n.activityCode = '';
            n.label = n.label.replace(/^(Solicitar|Capturar|Ingresar|Registrar|Completar|Llenar)/i, 'Autoservicio:');
            changeLog.push(`Self-service: "${n.label}"`);
          } else if (/valid|verific|evalu|analiz|diagnostic|scoring/.test(lbl)) {
            n.executionType = 'ai';
            n.activityCode = '';
            changeLog.push(`IA-assisted: "${n.label}" → Script/IA Task`);
          }
        }
      });
    }

    if (changes) changeLog.push(`Cambios manuales solicitados: ${changes}`);

    // Aplica el to-be
    state._views.tobe = tobe;
    setView('tobe');
    autoLayout();  // re-asigna códigos y layout

    activateTab('copilot');
    const lv = TOBE_LEVELS[level];
    copilotPost('ai',
      `**To-Be generado · nivel ${lv.label.split(' — ')[0]}**\n\n` +
      `${lv.desc}\n\n` +
      `**${changeLog.length} cambio(s) aplicado(s):**\n` +
      (changeLog.slice(0, 12).map(c => '• ' + c).join('\n') || '• Sin cambios automáticos — edita manualmente.') +
      (changeLog.length > 12 ? `\n• …y ${changeLog.length - 12} más.` : '') +
      `\n\nEdita manualmente cualquier nodo en Props. Exporta a PPTX para el comparativo As-Is vs To-Be.`);
  }

  // ============================================================
  // SIMULADOR de carga (FTE, lead time, costo)
  // ============================================================
  function attachSimulatorListeners() {
    $('#btnSimRun').addEventListener('click', runSimulation);
    $('#btnSimWizard').addEventListener('click', openSimWizard);
  }

  function openSimWizard() {
    const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
    if (tasks.length === 0) { alert('Necesito actividades en el diagrama primero.'); return; }

    let html = `<p style="font-size:13px;margin:0 0 8px 0">Captura tiempo y volumen para cada actividad. Los verdes ya tienen datos, los amarillos están vacíos. Tab/Enter para avanzar rápido.</p>
      <div style="max-height:50vh;overflow:auto"><table class="sim-wizard-table">
        <thead><tr><th>#</th><th>Actividad</th><th>Responsable</th><th>Tiempo (min)</th><th>Volumen/mes</th></tr></thead>
        <tbody>`;
    tasks.forEach((t, i) => {
      const hasData = t.time && t.volume;
      html += `<tr class="${hasData ? 'has-data' : 'no-data'}">
        <td>${i + 1}</td>
        <td>${escapeHtml(t.label)}</td>
        <td>${escapeHtml(t.owner || '—')}</td>
        <td><input type="number" min="0" step="0.5" data-wid="${t.id}" data-wfield="time" value="${escapeHtml(t.time || '')}" placeholder="ej. 15" /></td>
        <td><input type="number" min="0" step="1" data-wid="${t.id}" data-wfield="volume" value="${escapeHtml(t.volume || '')}" placeholder="ej. 500" /></td>
      </tr>`;
    });
    html += '</tbody></table></div>';

    openModal(`⚡ Wizard de tiempos · ${tasks.length} actividades`, html, () => {
      document.querySelectorAll('.sim-wizard-table input').forEach(inp => {
        const n = getNode(inp.dataset.wid);
        if (n) n[inp.dataset.wfield] = inp.value;
      });
      persist();
      render();
      runSimulation();
      copilotPost('ai', `Capturé tiempos/volúmenes en ${tasks.length} actividades. Simulación actualizada automáticamente.`);
    });
  }

  function runSimulation() {
    if (state.nodes.length === 0) {
      $('#simResults').hidden = false;
      $('#simResults').innerHTML = '<div class="empty-state">Sin proceso. Genera o dibuja uno primero.</div>';
      return;
    }
    const cost = parseFloat($('#simCostFte').value) || 0;
    const hours = parseFloat($('#simHours').value) || 160;
    const reduction = (parseFloat($('#simReduction').value) || 0) / 100;
    const minPerMonth = hours * 60;

    let totalMinutes = 0;        // Σ tiempo × volumen mensual
    let leadTimeChain = 0;       // suma de tiempos del camino más largo (estimación)
    let activitiesWithData = 0;
    let totalVolume = 0;
    state.nodes.forEach(n => {
      if (n.type === 'task' || n.type === 'system') {
        const t = parseFloat(n.time) || 0;
        const v = parseFloat(n.volume) || 0;
        if (t > 0 && v > 0) { activitiesWithData++; totalMinutes += t * v; totalVolume += v; }
        leadTimeChain += t; // approximación: suma lineal
      }
    });

    const fteCurrent = totalMinutes / minPerMonth;
    const monthlyCost = fteCurrent * cost;
    const fteToBe = fteCurrent * (1 - reduction);
    const monthlySavings = (fteCurrent - fteToBe) * cost;
    const annualSavings = monthlySavings * 12;

    const fmtN = (n) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 1 }) : '—';
    const fmtCur = (n) => isFinite(n) ? n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) : '—';

    state._simResults = { fteCurrent, fteToBe, monthlyCost, monthlySavings, annualSavings, leadTimeChain, activitiesWithData };

    $('#simResults').hidden = false;
    $('#simResults').innerHTML = `
      ${activitiesWithData === 0 ? '<div class="empty-state" style="color:#C62828">⚠ Ninguna actividad tiene tiempo y volumen. Completa esos campos en Props.</div>' : ''}
      <div class="sim-metric"><span class="label">Actividades con datos</span><span class="value">${activitiesWithData} / ${state.nodes.length}</span></div>
      <div class="sim-metric"><span class="label">Esfuerzo total / mes</span><span class="value">${fmtN(totalMinutes / 60)} h</span></div>
      <div class="sim-metric highlight"><span class="label">FTE actual</span><span class="value">${fmtN(fteCurrent)}</span></div>
      <div class="sim-metric"><span class="label">Lead time del flujo (suma)</span><span class="value">${fmtN(leadTimeChain)} min</span></div>
      <div class="sim-metric"><span class="label">Costo mensual de operación</span><span class="value">${fmtCur(monthlyCost)}</span></div>
      <div class="sim-metric"><span class="label">FTE to-be (-${Math.round(reduction*100)}%)</span><span class="value">${fmtN(fteToBe)}</span></div>
      <div class="sim-savings">
        Ahorro anual estimado
        <span class="big">${fmtCur(annualSavings)}</span>
        <span style="font-size:11px;opacity:0.9">${fmtN((fteCurrent - fteToBe))} FTE liberados</span>
      </div>`;
  }

  // ============================================================
  // RACI matrix (modal)
  // ============================================================
  function generateRaci() {
    const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system' || n.type === 'decision');
    if (tasks.length === 0) { copilotPost('ai', 'Necesito actividades en el diagrama para generar RACI.'); return; }

    // Roles únicos detectados en owner; si no hay, usar genéricos
    let roles = [...new Set(tasks.map(t => t.owner).filter(Boolean))];
    if (roles.length === 0) roles = ['Frontline', 'Back Office', 'Gerencia', 'Sistemas'];

    // Inicia matriz
    state._raci = state._raci || {};
    tasks.forEach(t => {
      state._raci[t.id] = state._raci[t.id] || {};
      roles.forEach(r => {
        if (!state._raci[t.id][r]) {
          state._raci[t.id][r] = (t.owner === r) ? 'R/A' : '';
        }
      });
    });

    let html = '<table class="raci-table"><thead><tr><th>Actividad</th>';
    roles.forEach(r => html += `<th>${escapeHtml(r)}</th>`);
    html += '</tr></thead><tbody>';
    tasks.forEach(t => {
      html += `<tr><td>${escapeHtml(t.label)}</td>`;
      roles.forEach(r => {
        const val = state._raci[t.id][r] || '';
        html += `<td class="cell-center"><select class="raci-pick" data-tid="${t.id}" data-role="${escapeHtml(r)}">
          <option value="">—</option>
          <option value="R" ${val==='R'?'selected':''}>R · Responsable</option>
          <option value="A" ${val==='A'?'selected':''}>A · Accountable</option>
          <option value="R/A" ${val==='R/A'?'selected':''}>R/A</option>
          <option value="C" ${val==='C'?'selected':''}>C · Consulta</option>
          <option value="I" ${val==='I'?'selected':''}>I · Informado</option>
        </select></td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table><p class="panel-hint" style="margin-top:8px">R=Responsable · A=Accountable · C=Consultado · I=Informado. La matriz se exportará al PPTX automáticamente.</p>';

    openModal('Matriz RACI · ' + (state.meta.name || 'Proceso'), html, () => {
      // Captura cambios
      document.querySelectorAll('.raci-pick').forEach(sel => {
        const tid = sel.dataset.tid, role = sel.dataset.role;
        state._raci[tid] = state._raci[tid] || {};
        state._raci[tid][role] = sel.value;
      });
      persist();
      copilotPost('ai', `Matriz RACI guardada con ${tasks.length} actividades × ${roles.length} roles. Se incluirá en el próximo export PPTX.`);
    });
  }

  // ============================================================
  // SIPOC (modal)
  // ============================================================
  function generateSipoc() {
    if (state.nodes.length === 0) { copilotPost('ai', 'Genera o dibuja un proceso primero.'); return; }
    const dataNodes = state.nodes.filter(n => n.type === 'data' || n.type === 'document');
    const startNode = state.nodes.find(n => n.type === 'start');
    const endNode = state.nodes.find(n => n.type === 'end');
    const owners = [...new Set(state.nodes.map(n => n.owner).filter(Boolean))];
    const systems = [...new Set(state.nodes.map(n => n.system).filter(Boolean))];

    state._sipoc = state._sipoc || {
      suppliers: owners.slice(0, 3).join(', ') || 'Cliente, Proveedor',
      inputs: (dataNodes.map(d => d.label).slice(0, 4).join(', ') || 'Solicitud, Documentación'),
      process: state.meta.name || 'Proceso ProcessIQ',
      outputs: 'Resultado entregado, Notificación al cliente',
      customers: 'Cliente final, Áreas internas'
    };

    const s = state._sipoc;
    const html = `
      <table class="sipoc-table">
        <thead><tr><th>Supplier</th><th>Input</th><th>Process</th><th>Output</th><th>Customer</th></tr></thead>
        <tbody><tr>
          <td><textarea data-sipoc="suppliers" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:4px">${escapeHtml(s.suppliers)}</textarea></td>
          <td><textarea data-sipoc="inputs" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:4px">${escapeHtml(s.inputs)}</textarea></td>
          <td><textarea data-sipoc="process" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:4px">${escapeHtml(s.process)}</textarea></td>
          <td><textarea data-sipoc="outputs" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:4px">${escapeHtml(s.outputs)}</textarea></td>
          <td><textarea data-sipoc="customers" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:4px">${escapeHtml(s.customers)}</textarea></td>
        </tr></tbody>
      </table>
      <p class="panel-hint" style="margin-top:8px">SIPOC pre-llenado desde el diagrama (roles, data nodes). Edita libremente. Se incluirá en el PPTX.</p>`;

    openModal('SIPOC · ' + (state.meta.name || 'Proceso'), html, () => {
      document.querySelectorAll('[data-sipoc]').forEach(ta => {
        state._sipoc[ta.dataset.sipoc] = ta.value;
      });
      persist();
      copilotPost('ai', 'SIPOC guardado. Se exportará junto al PPTX.');
    });
  }

  // ============================================================
  // Matriz Impacto-Esfuerzo de pains
  // ============================================================
  function generateImpactEffort() {
    const allPains = [];
    state.nodes.forEach(n => (n.pains || []).forEach(p => allPains.push({ ...p, activity: n.label })));
    if (allPains.length === 0) { copilotPost('ai', 'Captura pains primero (selecciona un nodo → tab Pains).'); return; }

    // Esfuerzo estimado: si categoría incluye sistema/regulatorio → alto; manual/handoff → bajo
    const effortMap = { system: 4, regulatory: 5, control: 3, data: 3, handoff: 2, manual: 2, wait: 2, rework: 2 };

    let html = `<svg viewBox="0 0 400 320" style="width:100%;background:#FAFAFA;border:1px solid #ddd">
      <line x1="40" y1="290" x2="380" y2="290" stroke="#999" stroke-width="1"/>
      <line x1="40" y1="20" x2="40" y2="290" stroke="#999" stroke-width="1"/>
      <line x1="210" y1="20" x2="210" y2="290" stroke="#ccc" stroke-dasharray="3 3"/>
      <line x1="40" y1="155" x2="380" y2="155" stroke="#ccc" stroke-dasharray="3 3"/>
      <text x="125" y="15" font-size="10" text-anchor="middle" fill="#2E7D32">QUICK WINS</text>
      <text x="295" y="15" font-size="10" text-anchor="middle" fill="#1565C0">PROYECTOS ESTRATÉGICOS</text>
      <text x="125" y="310" font-size="10" text-anchor="middle" fill="#999">FILL-INS</text>
      <text x="295" y="310" font-size="10" text-anchor="middle" fill="#C62828">RECONSIDERAR</text>
      <text x="210" y="305" font-size="9" text-anchor="middle" fill="#666">→ Esfuerzo</text>
      <text x="15" y="155" font-size="9" text-anchor="middle" fill="#666" transform="rotate(-90 15 155)">→ Impacto</text>`;

    allPains.forEach((p, i) => {
      const impact = (p.severity * p.frequency) / 25; // 0..1
      const effort = (effortMap[p.category] || 3) / 5;  // 0..1
      const x = 40 + effort * 340;
      const y = 290 - impact * 270;
      html += `<circle cx="${x}" cy="${y}" r="${6 + impact * 8}" fill="#FF0054" opacity="0.7" stroke="#fff" stroke-width="1.5"/>
               <text x="${x}" y="${y + 3}" font-size="10" text-anchor="middle" fill="white" font-weight="700">${i + 1}</text>`;
    });

    html += '</svg><div style="margin-top:12px"><strong>Leyenda</strong><ol style="margin:4px 0;padding-left:20px;font-size:12px">';
    allPains.forEach(p => {
      html += `<li><strong>${escapeHtml(p.activity)}</strong>: ${escapeHtml(p.description)} <span style="color:#b2a5ff">(sev ${p.severity} · frec ${p.frequency})</span></li>`;
    });
    html += '</ol></div>';

    state._impactEffort = allPains;
    openModal('Matriz Impacto · Esfuerzo · ' + allPains.length + ' pains', html, () => {
      copilotPost('ai', `Matriz impacto-esfuerzo lista con ${allPains.length} oportunidades. Quick wins (alto impacto / bajo esfuerzo) = candidatos para fase 0-3 meses.`);
    });
  }

  // ============================================================
  // ANALÍTICA AVANZADA (F1-F4) — benchmark 2026
  // ============================================================

  // Helper: simulación pura sobre un set de nodos (sin tocar el DOM)
  function computeSimOn(nodes, reductionPct) {
    const cost = parseFloat($('#simCostFte')?.value) || 5000;
    const hours = parseFloat($('#simHours')?.value) || 160;
    const minPerMonth = hours * 60;
    let totalMin = 0, leadTime = 0, withData = 0;
    nodes.forEach(n => {
      if (n.type === 'task' || n.type === 'system') {
        const t = parseFloat(n.time) || 0, v = parseFloat(n.volume) || 0;
        if (t > 0 && v > 0) { withData++; totalMin += t * v; }
        leadTime += t;
      }
    });
    const fte = totalMin / minPerMonth;
    const fteToBe = fte * (1 - (reductionPct || 0) / 100);
    return {
      fte, fteToBe, leadTime, withData,
      monthlyCost: fte * cost,
      annualSavings: (fte - fteToBe) * cost * 12
    };
  }

  // F3 — Cuello de botella + ruta crítica
  function analyzeBottleneck() {
    const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
    if (tasks.length === 0) { copilotPost('ai', 'No hay actividades para analizar.'); return; }

    // Carga por actividad = tiempo × volumen (minutos/mes). El mayor = cuello.
    const withLoad = tasks.map(n => ({
      n, load: (parseFloat(n.time) || 0) * (parseFloat(n.volume) || 0), time: parseFloat(n.time) || 0
    })).filter(x => x.load > 0 || x.time > 0);

    if (withLoad.length === 0) {
      copilotPost('ai', 'Captura **tiempo** y **volumen** en las actividades (pestaña Props o wizard del simulador) para detectar el cuello de botella.');
      return;
    }

    // Cuello por carga
    withLoad.sort((a, b) => b.load - a.load);
    const bottleneck = withLoad[0];
    state._bottleneckId = bottleneck.n.id;

    // Ruta crítica = camino con mayor suma de tiempos (DFS desde start)
    const outMap = {};
    state.edges.forEach(e => { (outMap[e.from] = outMap[e.from] || []).push(e.to); });
    const timeOf = (id) => { const n = getNode(id); return n ? (parseFloat(n.time) || 0) : 0; };
    const memo = {};
    function longest(id, visited) {
      if (memo[id]) return memo[id];
      if (visited.has(id)) return { t: 0, path: [] };
      visited.add(id);
      let best = { t: timeOf(id), path: [id] };
      (outMap[id] || []).forEach(to => {
        const sub = longest(to, new Set(visited));
        if (timeOf(id) + sub.t > best.t) best = { t: timeOf(id) + sub.t, path: [id, ...sub.path] };
      });
      memo[id] = best;
      return best;
    }
    const starts = state.nodes.filter(n => n.type === 'start');
    let critical = { t: 0, path: [] };
    (starts.length ? starts : [state.nodes[0]]).forEach(s => {
      const r = longest(s.id, new Set());
      if (r.t > critical.t) critical = r;
    });
    const critLabels = critical.path.map(id => getNode(id)?.label).filter(Boolean);

    render(); // re-render para mostrar el badge de cuello

    const fmt = (n) => n.toLocaleString('es-PE', { maximumFractionDigits: 0 });
    let msg = `**🔴 Análisis de cuello de botella y ruta crítica**\n\n`;
    msg += `**Cuello de botella:** "${bottleneck.n.label}" — carga de **${fmt(bottleneck.load / 60)} h/mes** (${bottleneck.time} min × ${parseFloat(bottleneck.n.volume) || 0} casos). Es la actividad que más capacidad consume; cualquier mejora aquí tiene el mayor impacto en throughput.\n\n`;
    msg += `**Top 3 por carga:**\n` + withLoad.slice(0, 3).map((x, i) => `${i + 1}. ${x.n.label} — ${fmt(x.load / 60)} h/mes`).join('\n') + '\n\n';
    msg += `**Ruta crítica** (${fmt(critical.t)} min de lead time): ${critLabels.join(' → ')}.\n\n`;
    msg += `Recomendación: ataca primero el cuello (automatizar, paralelizar o redistribuir carga) y acorta la ruta crítica eliminando esperas/handoffs.`;
    copilotPost('ai', msg);
  }

  // F2 — Scoring de oportunidades de automatización
  function analyzeAutomation() {
    const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
    if (tasks.length === 0) { copilotPost('ai', 'No hay actividades para analizar.'); return; }

    const cost = parseFloat($('#simCostFte')?.value) || 5000;
    const hours = parseFloat($('#simHours')?.value) || 160;
    const minPerMonth = hours * 60;

    // Heurística de automatización por etiqueta + tipo de ejecución
    function candidate(n) {
      const lbl = (n.label || '').toLowerCase();
      const ex = n.executionType;
      if (ex === 'automatic' || ex === 'rpa') return null; // ya automatizado
      let tech = null, autoPct = 0;
      if (/registr|ingres|carg|copiar|trasl|consolid|calcul/.test(lbl)) { tech = 'RPA'; autoPct = 0.9; }
      else if (/valid|verific|concili|comparar|revisar/.test(lbl)) { tech = 'RPA + reglas'; autoPct = 0.7; }
      else if (/escane|adjunt|extraer|leer doc|clasific/.test(lbl)) { tech = 'IDP (doc AI)'; autoPct = 0.8; }
      else if (/evalu|analiz|diagnostic|scoring|priorizar|recomend/.test(lbl)) { tech = 'IA / ML'; autoPct = 0.5; }
      else if (/notific|enviar|comunicar|email|correo/.test(lbl)) { tech = 'Workflow/email auto'; autoPct = 0.95; }
      else if (ex === 'manual') { tech = 'Workflow'; autoPct = 0.4; }
      if (!tech) return null;
      const t = parseFloat(n.time) || 0, v = parseFloat(n.volume) || 0;
      const minSaved = t * v * autoPct;
      const fteSaved = minSaved / minPerMonth;
      const annualSaving = fteSaved * cost * 12;
      const effort = tech.startsWith('IA') ? 'Alto' : (tech.startsWith('IDP') ? 'Medio-alto' : 'Bajo-medio');
      return { n, tech, autoPct, fteSaved, annualSaving, effort };
    }

    const cands = tasks.map(candidate).filter(Boolean).sort((a, b) => b.annualSaving - a.annualSaving);
    if (cands.length === 0) { copilotPost('ai', 'No detecté tareas claramente automatizables. Asegúrate de tener actividades manuales con tiempo y volumen capturados.'); return; }

    const fmtCur = (n) => n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
    const rows = cands.map((c, i) => `<tr>
      <td>${i + 1}</td><td>${escapeHtml(c.n.label)}</td>
      <td><b>${c.tech}</b></td>
      <td style="text-align:center">${Math.round(c.autoPct * 100)}%</td>
      <td style="text-align:center">${c.fteSaved.toFixed(2)}</td>
      <td style="text-align:right;color:#1E7E34"><b>${c.annualSaving ? fmtCur(c.annualSaving) : '—'}</b></td>
      <td style="text-align:center">${c.effort}</td>
    </tr>`).join('');
    const totalSaving = cands.reduce((a, c) => a + (c.annualSaving || 0), 0);
    const totalFte = cands.reduce((a, c) => a + c.fteSaved, 0);

    const html = `<p class="panel-hint">${cands.length} actividad(es) con potencial de automatización, ordenadas por ahorro anual estimado.</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#232323;color:#fff"><th style="padding:5px">#</th><th style="padding:5px;text-align:left">Actividad</th><th style="padding:5px">Tecnología</th><th style="padding:5px">% auto</th><th style="padding:5px">FTE</th><th style="padding:5px">Ahorro/año</th><th style="padding:5px">Esfuerzo</th></tr>
        ${rows}
      </table>
      <div style="margin-top:12px;padding:10px;background:#E8F5E9;border-radius:6px;text-align:center">
        <b>Potencial total:</b> ${totalFte.toFixed(1)} FTE liberados · <b style="color:#1E7E34">${fmtCur(totalSaving)}/año</b>
      </div>`;
    openModal('🤖 Oportunidades de automatización', html, () => {
      copilotPost('ai', `Detecté **${cands.length} oportunidades de automatización** con potencial de **${totalFte.toFixed(1)} FTE** y **${fmtCur(totalSaving)}/año**. Top candidato: "${cands[0].n.label}" (${cands[0].tech}). Úsalo para priorizar el roadmap de RPA/IDP/IA.`);
    });
  }

  // F4 — Análisis de variantes (desde event log)
  function analyzeVariants() {
    if (!state._variants || state._variants.length === 0) {
      copilotPost('ai', 'No hay variantes para analizar. Ingresa un **event log CSV** (📥 Ingestar → Event Log) — las variantes se calculan de los casos reales.');
      return;
    }
    const total = state._variantsTotalCases || state._variants.reduce((a, v) => a + v.count, 0);
    const top = state._variants.slice(0, 10);
    const happyPath = state._variants[0];
    const exceptions = state._variants.length - 1;
    const exceptionCases = total - happyPath.count;

    const rows = top.map((v, i) => `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="font-size:11px">${escapeHtml(v.seq.length > 90 ? v.seq.slice(0, 88) + '…' : v.seq)}</td>
      <td style="text-align:center">${v.steps}</td>
      <td style="text-align:center"><b>${v.count}</b></td>
      <td style="text-align:center;color:#b2a5ff"><b>${v.pct}%</b></td>
    </tr>`).join('');
    const html = `<p class="panel-hint"><b>${state._variants.length} variantes</b> en ${total} casos. La variante #1 es el "happy path"; las demás son excepciones/reprocesos — fuente directa de pains.</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#232323;color:#fff"><th style="padding:5px">#</th><th style="padding:5px;text-align:left">Secuencia</th><th style="padding:5px">Pasos</th><th style="padding:5px">Casos</th><th style="padding:5px">%</th></tr>
        ${rows}
      </table>
      <div style="margin-top:12px;padding:10px;background:#FEF3C7;border-radius:6px">
        <b>Happy path:</b> ${happyPath.pct}% de los casos (${happyPath.count}). <b>Excepciones:</b> ${exceptions} variantes cubren el ${Math.round(exceptionCases / total * 100)}% restante — revisar para estandarizar y reducir reprocesos.
      </div>`;
    openModal('🔀 Análisis de variantes', html, () => {
      copilotPost('ai', `**${state._variants.length} variantes** detectadas. El happy path cubre ${happyPath.pct}% de los casos; el resto son excepciones (candidatas a estandarización). Mientras más variantes, mayor variabilidad e indisciplina del proceso.`);
    });
  }

  // F5 — Mapa de valor Lean (VA / BVA / NVA)
  function toggleValueMap() {
    const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
    if (tasks.length === 0) { copilotPost('ai', 'No hay actividades para mapear.'); return; }
    state._valueMode = !state._valueMode;
    render();
    if (!state._valueMode) { copilotPost('ai', 'Mapa de valor desactivado — vuelve a colores por tipo de tarea.'); return; }

    // Reparto de tiempo por categoría de valor
    let tVA = 0, tBVA = 0, tNVA = 0, tNA = 0, total = 0;
    tasks.forEach(n => {
      const t = (parseFloat(n.time) || 0) * (parseFloat(n.volume) || 1);
      total += t || 1;
      if (n.va === 'VA') tVA += t || 1;
      else if (n.va === 'BVA') tBVA += t || 1;
      else if (n.va === 'NVA') tNVA += t || 1;
      else tNA += t || 1;
    });
    const pct = (x) => total ? Math.round(x / total * 100) : 0;
    const nvaCount = tasks.filter(n => n.va === 'NVA').length;
    const unclass = tasks.filter(n => !n.va).length;

    let msg = `**♻ Mapa de valor Lean activado** (verde=VA · amarillo=BVA · rojo=NVA · gris=sin clasificar)\n\n`;
    msg += `**Reparto de carga por valor:**\n`;
    msg += `• 🟢 Valor Añadido (VA): **${pct(tVA)}%**\n`;
    msg += `• 🟡 Necesario sin valor (BVA): **${pct(tBVA)}%**\n`;
    msg += `• 🔴 Desperdicio (NVA): **${pct(tNVA)}%** — ${nvaCount} actividad(es)\n`;
    if (unclass) msg += `• ⚪ Sin clasificar: ${pct(tNA)}% (${unclass} actividades — asigna VA/BVA/NVA en Props)\n`;
    msg += `\n**Diagnóstico Lean:** ${pct(tNVA) >= 30 ? 'Alto desperdicio — prioriza eliminar/automatizar las actividades NVA.' : (pct(tNVA) > 0 ? 'Desperdicio moderado — revisa las actividades NVA.' : 'Sin desperdicio clasificado. Asigna VA/BVA/NVA para el análisis Lean.')}\n\nVuelve a pulsar para desactivar el mapa.`;
    copilotPost('ai', msg);
  }

  // F6 — Backlog de iniciativas auto-generado (consolida pains + automatización + gaps KPI)
  function generateBacklog() {
    const items = [];
    const cost = parseFloat($('#simCostFte')?.value) || 5000;
    const hours = parseFloat($('#simHours')?.value) || 160;
    const minPerMonth = hours * 60;

    // 1) De pain points
    const effortMap = { system: 4, regulatory: 5, control: 3, data: 3, handoff: 2, manual: 2, wait: 2, rework: 2 };
    state.nodes.forEach(n => (n.pains || []).forEach(p => {
      const impact = p.severity * p.frequency; // 1..25
      const effort = effortMap[p.category] || 3; // 1..5
      items.push({
        fuente: 'Pain', iniciativa: `Resolver: ${p.description}`, actividad: n.label,
        impacto: impact, esfuerzo: effort,
        horizonte: (impact >= 12 && effort <= 2) ? '0-3m' : (effort >= 4 ? '9-18m' : '3-9m'),
        owner: n.owner || 'Por asignar',
        beneficio: impact >= 16 ? 'Alto' : (impact >= 9 ? 'Medio' : 'Bajo')
      });
    }));

    // 2) De oportunidades de automatización
    state.nodes.filter(n => n.type === 'task' && n.executionType === 'manual').forEach(n => {
      const lbl = (n.label || '').toLowerCase();
      let tech = null, autoPct = 0;
      if (/registr|ingres|carg|consolid|calcul/.test(lbl)) { tech = 'RPA'; autoPct = 0.9; }
      else if (/valid|verific|concili|comparar/.test(lbl)) { tech = 'RPA+reglas'; autoPct = 0.7; }
      else if (/escane|adjunt|clasific/.test(lbl)) { tech = 'IDP'; autoPct = 0.8; }
      else if (/evalu|analiz|scoring/.test(lbl)) { tech = 'IA'; autoPct = 0.5; }
      else if (/notific|enviar|correo/.test(lbl)) { tech = 'Workflow'; autoPct = 0.95; }
      if (!tech) return;
      const saved = (parseFloat(n.time) || 0) * (parseFloat(n.volume) || 0) * autoPct;
      const annual = (saved / minPerMonth) * cost * 12;
      items.push({
        fuente: 'Automatización', iniciativa: `Automatizar "${n.label}" con ${tech}`, actividad: n.label,
        impacto: Math.min(25, Math.round(annual / 5000)), esfuerzo: tech.startsWith('IA') ? 4 : (tech === 'IDP' ? 3 : 2),
        horizonte: tech.startsWith('IA') ? '9-18m' : '0-3m', owner: n.owner || 'TI / RPA',
        beneficio: annual ? annual.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) + '/año' : 'Medio'
      });
    });

    // 3) De gaps de KPI
    Object.values(state._kpiValues || {}).forEach(k => {
      if (k.gap && k.gap !== '—') items.push({
        fuente: 'KPI', iniciativa: `Cerrar gap de ${k.name} (${k.value} vs ${k.benchmark})`, actividad: '—',
        impacto: 14, esfuerzo: 3, horizonte: '3-9m', owner: 'Dueño del KPI', beneficio: 'Gap: ' + k.gap
      });
    });

    if (items.length === 0) { copilotPost('ai', 'No hay insumos para el backlog. Captura pains, ten actividades manuales o KPIs con gap.'); return; }

    // Prioriza: ratio impacto/esfuerzo desc
    items.sort((a, b) => (b.impacto / b.esfuerzo) - (a.impacto / a.esfuerzo));
    items.forEach((it, i) => it.prioridad = i + 1);
    state._backlog = items;

    const fuenteColor = { 'Pain': '#B91C1C', 'Automatización': '#1E7E34', 'KPI': '#1E5BAA' };
    const rows = items.map(it => `<tr>
      <td style="text-align:center">${it.prioridad}</td>
      <td><span style="color:${fuenteColor[it.fuente]};font-weight:600">${it.fuente}</span></td>
      <td>${escapeHtml(it.iniciativa.length > 60 ? it.iniciativa.slice(0, 58) + '…' : it.iniciativa)}</td>
      <td style="text-align:center">${it.impacto}</td>
      <td style="text-align:center">${it.esfuerzo}</td>
      <td style="text-align:center"><b>${it.horizonte}</b></td>
      <td>${escapeHtml(it.owner)}</td>
      <td style="font-size:11px">${escapeHtml(String(it.beneficio))}</td>
    </tr>`).join('');
    const html = `<p class="panel-hint">${items.length} iniciativas consolidadas de pains, automatización y gaps de KPI, priorizadas por ratio impacto/esfuerzo.</p>
      <div style="max-height:50vh;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr style="background:#232323;color:#fff;position:sticky;top:0"><th style="padding:5px">#</th><th style="padding:5px">Fuente</th><th style="padding:5px;text-align:left">Iniciativa</th><th style="padding:5px">Imp</th><th style="padding:5px">Esf</th><th style="padding:5px">Horizonte</th><th style="padding:5px">Owner</th><th style="padding:5px">Beneficio</th></tr>
        ${rows}
      </table></div>
      <div style="margin-top:10px;text-align:right"><button id="blExportBtn" class="btn btn-ghost btn-mini">⤓ Exportar backlog (CSV)</button></div>`;
    openModal(`📋 Backlog de iniciativas · ${items.length}`, html, () => {
      copilotPost('ai', `**Backlog de ${items.length} iniciativas** generado y priorizado. ${items.filter(i => i.horizonte === '0-3m').length} quick wins (0-3m). Fuentes: ${items.filter(i => i.fuente === 'Pain').length} pains, ${items.filter(i => i.fuente === 'Automatización').length} automatización, ${items.filter(i => i.fuente === 'KPI').length} KPI. Úsalo como roadmap de transformación.`);
    });
    // Botón de export CSV dentro del modal
    setTimeout(() => {
      const b = $('#blExportBtn');
      if (b) b.addEventListener('click', exportBacklogCsv);
    }, 50);
  }

  function exportBacklogCsv() {
    if (!state._backlog) return;
    const head = ['Prioridad', 'Fuente', 'Iniciativa', 'Impacto', 'Esfuerzo', 'Horizonte', 'Owner', 'Beneficio'];
    const esc = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const lines = [head.join(',')].concat(state._backlog.map(it =>
      [it.prioridad, it.fuente, it.iniciativa, it.impacto, it.esfuerzo, it.horizonte, it.owner, it.beneficio].map(esc).join(',')));
    download('﻿' + lines.join('\n'), filename('csv').replace('.csv', '_backlog.csv'), 'text/csv;charset=utf-8');
  }

  // F1 — Comparador de escenarios What-If
  const WHATIF_LEVERS = {
    autom_manual:   { label: 'Automatizar tareas manuales rule-based', apply: (nodes) => nodes.forEach(n => { if (n.type === 'task' && n.executionType === 'manual' && /registr|ingres|valid|calcul|consult|verific|notific/.test((n.label || '').toLowerCase())) { n.executionType = 'rpa'; } }) },
    elim_handoff:   { label: 'Eliminar handoffs (−20% lead time)', factor: 0.8 },
    parallel:       { label: 'Paralelizar pasos (−25% lead time)', factor: 0.75 },
    selfservice:    { label: 'Self-service en captura (−40% tareas de captura)', apply: (nodes) => nodes.forEach(n => { if (n.type === 'task' && /solicit|captur|ingres|registr|complet/.test((n.label || '').toLowerCase())) { n.executionType = 'automatic'; n.volume = String(Math.round((parseFloat(n.volume) || 0) * 0.6)); } }) }
  };

  function openWhatIfModal() {
    const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
    if (tasks.length === 0) { copilotPost('ai', 'Genera un proceso primero.'); return; }
    const withData = tasks.filter(n => parseFloat(n.time) > 0 && parseFloat(n.volume) > 0).length;
    const dataWarn = withData === 0 ? '<div class="field-hint warn" style="margin-bottom:10px">⚠ Ninguna actividad tiene tiempo y volumen. Captura datos (wizard del simulador) para que la comparación tenga cifras.</div>' : '';
    const leverChecks = Object.entries(WHATIF_LEVERS).map(([k, l]) =>
      `<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-weight:400;font-size:13px;text-transform:none">
        <input type="checkbox" class="wi-lever" value="${k}" style="width:auto"> ${l.label}</label>`).join('');
    const html = `${dataWarn}
      <p class="panel-hint">Selecciona las palancas para construir un <b>escenario To-Be</b> y compáralo contra el As-Is actual.</p>
      <div style="margin-bottom:12px">${leverChecks}</div>
      <label style="display:block;font-size:12px;font-weight:600">Reducción adicional de lead time esperada (%)
        <input type="number" id="wiReduction" value="0" min="0" max="80" step="5" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:6px;margin-top:3px">
      </label>`;
    openModal('🔬 Comparador de escenarios What-If', html, () => {
      const levers = [...document.querySelectorAll('.wi-lever:checked')].map(c => c.value);
      const extraRed = parseFloat($('#wiReduction')?.value) || 0;
      runWhatIfComparison(levers, extraRed);
    });
  }

  function runWhatIfComparison(levers, extraReduction) {
    // As-Is base
    const asis = computeSimOn(state.nodes, 0);
    // To-Be: clona nodos, aplica palancas
    const clone = JSON.parse(JSON.stringify(state.nodes));
    let leadFactor = 1;
    levers.forEach(k => {
      const lever = WHATIF_LEVERS[k];
      if (lever.apply) lever.apply(clone);
      if (lever.factor) leadFactor *= lever.factor;
    });
    // Reducción de FTE por automatización: tareas ahora rpa/automatic no cuentan
    const tobe = computeSimOn(clone.map(n => {
      if (n.executionType === 'rpa' || n.executionType === 'automatic') return { ...n, time: '0' };
      return n;
    }), extraReduction);
    tobe.leadTime = asis.leadTime * leadFactor * (1 - extraReduction / 100);

    const fmt = (n) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 1 }) : '—';
    const cur = (n) => isFinite(n) ? n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) : '—';
    const delta = (a, b, inv) => { const d = b - a; const good = inv ? d < 0 : d > 0; return `<span style="color:${good ? '#1E7E34' : (d === 0 ? '#888' : '#B91C1C')}">${d > 0 ? '+' : ''}${fmt(d)}</span>`; };

    const fteSaved = asis.fte - tobe.fteToBe;
    const annual = fteSaved * (parseFloat($('#simCostFte')?.value) || 5000) * 12;

    const html = `<p class="panel-hint">${levers.length} palanca(s) aplicada(s). Comparación As-Is vs escenario To-Be:</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#232323;color:#fff"><th style="padding:6px;text-align:left">Métrica</th><th style="padding:6px">As-Is</th><th style="padding:6px">To-Be</th><th style="padding:6px">Δ</th></tr>
        <tr><td style="padding:6px;border:1px solid #eee">FTE</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(asis.fte)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(tobe.fteToBe)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${delta(asis.fte, tobe.fteToBe, true)}</td></tr>
        <tr><td style="padding:6px;border:1px solid #eee">Lead time (min)</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(asis.leadTime)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${fmt(tobe.leadTime)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${delta(asis.leadTime, tobe.leadTime, true)}</td></tr>
        <tr><td style="padding:6px;border:1px solid #eee">Costo mensual</td><td style="padding:6px;border:1px solid #eee;text-align:center">${cur(asis.monthlyCost)}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${cur(tobe.fteToBe * (parseFloat($('#simCostFte')?.value) || 5000))}</td><td style="padding:6px;border:1px solid #eee;text-align:center">—</td></tr>
      </table>
      <div style="margin-top:12px;padding:12px;background:linear-gradient(135deg,#ff0054,#b2a5ff);color:#fff;border-radius:8px;text-align:center">
        Ahorro anual del escenario<br><span style="font-size:24px;font-weight:700">${cur(annual)}</span><br>
        <span style="font-size:11px;opacity:.9">${fmt(fteSaved)} FTE liberados · lead time −${Math.round((1 - tobe.leadTime / Math.max(asis.leadTime, 0.01)) * 100)}%</span>
      </div>`;
    openModal('🔬 Resultado What-If', html, () => {
      copilotPost('ai', `**Escenario What-If:** con ${levers.length} palanca(s), el proceso pasa de ${fmt(asis.fte)} a ${fmt(tobe.fteToBe)} FTE (ahorro ${cur(annual)}/año) y reduce lead time ~${Math.round((1 - tobe.leadTime / Math.max(asis.leadTime, 0.01)) * 100)}%. Compara varios escenarios para elegir el de mejor relación impacto/esfuerzo.`);
    });
  }

  // ============================================================
  // EXPORT BPMN 2.0 XML
  // ============================================================
  // ============================================================
  // EXPORT WORD — informe del proceso (HTML compatible con Word)
  // Inspirado en MBC Process Disruptor: "Generar Informe Word"
  // ============================================================
  // ============================================================
  // DERIVACIÓN DE FICHA DE PROCESO
  // Reconstruye, a partir del grafo (nodos + edges + compuertas + lanes),
  // el "Detalle de actividades" con numeración y ruteo real, la unión de
  // sistemas, responsables y sugerencias de alcance (desde/hasta).
  // Es el motor que alimenta exportFicha() y la vista previa.
  // ============================================================
  function flowOrderNodes() {
    // Orden de recorrido siguiendo edges desde el/los nodo(s) inicio (BFS estable).
    const byId = Object.fromEntries(state.nodes.map(n => [n.id, n]));
    const out = [], seen = new Set();
    const outEdges = (id) => state.edges.filter(e => e.from === id);
    const starts = state.nodes.filter(n => n.type === 'start');
    const roots = starts.length ? starts : state.nodes.filter(n => !state.edges.some(e => e.to === n.id));
    const queue = [...(roots.length ? roots : state.nodes.slice(0, 1))];
    while (queue.length) {
      const n = queue.shift();
      if (!n || seen.has(n.id)) continue;
      seen.add(n.id); out.push(n);
      outEdges(n.id).forEach(e => { const t = byId[e.to]; if (t && !seen.has(t.id)) queue.push(t); });
    }
    // Cualquier nodo no alcanzado (islas) se agrega al final en orden de creación
    state.nodes.forEach(n => { if (!seen.has(n.id)) { seen.add(n.id); out.push(n); } });
    return out;
  }

  function deriveFicha() {
    const f = state.ficha || emptyFicha();
    const ordered = flowOrderNodes();
    const lane = state._lanes?.laneOf || {};
    const bpmnName = (n) => {
      const e = (window.EXECUTION_TYPES || []).find(t => t.id === n.executionType);
      return e ? e.bpmn : (n.type === 'system' ? 'User Task' : (n.type === 'decision' ? 'Exclusive Gateway' : 'Task'));
    };

    // Numeración: solo actividades ejecutables (task/system/decision) reciben N°
    const isStep = (n) => n.type === 'task' || n.type === 'system' || n.type === 'decision';
    const stepNum = {};
    let k = 0;
    ordered.forEach(n => { if (isStep(n)) stepNum[n.id] = ++k; });

    const targetLabel = (toId) => {
      const t = state.nodes.find(x => x.id === toId);
      if (!t) return '';
      if (t.type === 'end') return t.label ? `Fin del proceso (${t.label})` : 'Fin del proceso';
      if (stepNum[t.id]) return `continuar en la actividad ${stepNum[t.id]}`;
      return `continuar (${t.label || t.type})`;
    };

    const activities = ordered.filter(isStep).map(n => {
      const outs = state.edges.filter(e => e.from === n.id);
      // Ruteo: para compuertas o cuando hay bifurcación / salto no lineal
      let ruteo = [];
      const next = ordered[ordered.indexOf(n) + 1];
      const isLinear = outs.length === 1 && next && outs[0].to === next.id && next.type !== 'end';
      if (n.type === 'decision' || outs.length > 1) {
        ruteo = outs.map(e => `${e.label ? e.label + ': ' : ''}${targetLabel(e.to)}`);
      } else if (outs.length === 1 && !isLinear) {
        ruteo = [targetLabel(outs[0].to)];
      }
      return {
        num: stepNum[n.id],
        label: n.label || '(sin título)',
        responsable: lane[n.id] || n.owner || '',
        bpmn: bpmnName(n),
        sistema: n.system || '',
        descripcion: (n.notes || n.rules || '').trim(),
        ruteo,
        va: n.va || '',
        time: n.time || ''
      };
    });

    // Sistemas: unión de los declarados por nodo + los de nivel proceso (ficha.sistemas)
    const nodeSys = new Set();
    state.nodes.forEach(n => { if (n.system) String(n.system).split(/[,/;]+/).forEach(s => { const t = s.trim(); if (t) nodeSys.add(t); }); });
    const manualSys = (f.sistemas || []);
    const manualNames = new Set(manualSys.map(s => (s.nombre || '').trim().toLowerCase()));
    const sistemas = [
      ...manualSys.filter(s => (s.nombre || '').trim()),
      ...[...nodeSys].filter(s => !manualNames.has(s.toLowerCase())).map(s => ({ nombre: s, uso: '' }))
    ];

    // Responsables (para sección "Responsabilidades")
    const responsables = (state._lanes?.list || [...new Set(state.nodes.map(n => n.owner).filter(Boolean))]);

    // Alcance: sugerencias desde/hasta si el usuario no las escribió
    const startN = state.nodes.find(n => n.type === 'start');
    const endNs = state.nodes.filter(n => n.type === 'end');
    const alcanceDesde = f.alcanceDesde || (startN ? startN.label : '');
    const alcanceHasta = f.alcanceHasta || (endNs.length ? endNs.map(e => e.label).filter(Boolean).join(' / ') : '');

    return { f, activities, sistemas, responsables, alcanceDesde, alcanceHasta, stepCount: k };
  }

  function exportWord() {
    if (state.nodes.length === 0) { alert('No hay proceso para documentar.'); return; }
    const meta = state.meta;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    const MAGENTA = '#147AFF', DARK = '#003478', GRAY = '#7A93B5';   // paleta MBC (catalogo): acento, azul marino, secundario
    const fechaLarga = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });

    const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system');
    const decisions = state.nodes.filter(n => n.type === 'decision');
    const ownerMap = state._lanes?.laneOf || {};
    const bpmnName = (n) => {
      const e = (window.EXECUTION_TYPES || []).find(t => t.id === n.executionType);
      return e ? e.bpmn : (n.type === 'system' ? 'User Task' : 'Task');
    };

    // ── Tabla de actividades ──
    const actRows = tasks.map((n, i) => {
      const va = n.va === 'NVA' ? '<span style="color:#B91C1C">NVA</span>' : (n.va === 'VA' ? '<span style="color:#1E7E34">VA</span>' : (n.va || '—'));
      return `<tr>
        <td style="font-family:Consolas;font-size:9pt;color:${MAGENTA}"><b>${esc(n.activityCode || '—')}</b></td>
        <td>${esc(n.label)}</td>
        <td style="font-size:9pt">${esc(bpmnName(n))}</td>
        <td>${esc(ownerMap[n.id] || n.owner || '—')}</td>
        <td>${esc(n.system || '—')}</td>
        <td style="text-align:center">${esc(n.time || '—')}</td>
        <td style="text-align:center">${va}</td>
      </tr>`;
    }).join('');

    // ── Pain points priorizados ──
    const allPains = [];
    state.nodes.forEach(n => (n.pains || []).forEach(p => allPains.push({ ...p, activity: n.label })));
    allPains.sort((a, b) => (b.severity * b.frequency) - (a.severity * a.frequency));
    const painRows = allPains.map(p => {
      const cat = (window.PAIN_CATEGORIES || []).find(c => c.id === p.category);
      return `<tr>
        <td>${esc(p.activity)}</td>
        <td>${esc(cat ? cat.label : p.category)}</td>
        <td>${esc(p.description)}</td>
        <td style="text-align:center">${p.severity}</td>
        <td style="text-align:center">${p.frequency}</td>
        <td style="text-align:center"><b>${p.severity * p.frequency}</b></td>
        <td style="font-size:9pt">${esc(typeof painImplication === 'function' ? painImplication(p) : '')}</td>
      </tr>`;
    }).join('');

    // ── KPIs sugeridos ──
    const kpis = (window.KPI_LIBRARY || [])
      .filter(k => !meta.industry || k.industry === meta.industry || k.industry === 'Transversal')
      .slice(0, 10);
    const kpiRows = kpis.map(k => `<tr>
      <td>${esc(k.name)}</td><td style="text-align:center">${esc(k.unit)}</td>
      <td>${esc(k.benchmark)}</td><td style="font-size:9pt">${esc(k.description)}</td>
    </tr>`).join('');

    // ── RACI (si existe) ──
    let raciSection = '';
    if (state._raci && Object.keys(state._raci).length > 0) {
      const roles = [...new Set(Object.values(state._raci).flatMap(r => Object.keys(r)))];
      const rtasks = state.nodes.filter(n => state._raci[n.id]);
      const head = '<th>Actividad</th>' + roles.map(r => `<th style="text-align:center">${esc(r)}</th>`).join('');
      const body = rtasks.map(t => '<tr><td>' + esc(t.label) + '</td>' +
        roles.map(r => `<td style="text-align:center"><b>${esc(state._raci[t.id][r] || '')}</b></td>`).join('') + '</tr>').join('');
      raciSection = `<h2>6. Matriz RACI</h2><table><tr>${head}</tr>${body}</table>
        <p style="font-size:9pt;color:${GRAY}">R = Responsable · A = Accountable · C = Consultado · I = Informado</p>`;
    }

    // ── SIPOC (si existe) ──
    let sipocSection = '';
    if (state._sipoc) {
      const s = state._sipoc;
      sipocSection = `<h2>7. SIPOC</h2><table>
        <tr><th>Supplier</th><th>Input</th><th>Process</th><th>Output</th><th>Customer</th></tr>
        <tr><td>${esc(s.suppliers)}</td><td>${esc(s.inputs)}</td><td>${esc(s.process)}</td><td>${esc(s.outputs)}</td><td>${esc(s.customers)}</td></tr>
      </table>`;
    }

    // ── Simulador (si existe) ──
    let simSection = '';
    if (state._simResults && state._simResults.activitiesWithData > 0) {
      const r = state._simResults;
      const fmt = (n) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 1 }) : '—';
      const cur = (n) => isFinite(n) ? n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) : '—';
      simSection = `<h2>8. Cuantificación (simulador)</h2>
        <table>
          <tr><td><b>FTE actual</b></td><td>${fmt(r.fteCurrent)}</td><td><b>FTE to-be</b></td><td>${fmt(r.fteToBe)}</td></tr>
          <tr><td><b>Costo mensual</b></td><td>${cur(r.monthlyCost)}</td><td><b>Ahorro anual estimado</b></td><td style="color:${MAGENTA}"><b>${cur(r.annualSavings)}</b></td></tr>
        </table>`;
    }

    // ── Linter / hallazgos de calidad ──
    const issues = typeof lintProcess === 'function' ? lintProcess() : [];
    const handoffs = typeof countHandoffs === 'function' ? countHandoffs() : 0;
    const manualCount = tasks.filter(n => n.executionType === 'manual').length;

    // ── Resumen ejecutivo ──
    const resumen = `El proceso <b>${esc(meta.name || 'analizado')}</b> comprende <b>${tasks.length} actividades</b> y <b>${decisions.length} punto(s) de decisión</b>, distribuidas en <b>${(state._lanes?.list || []).length} responsable(s)</b>. ` +
      `Se identificaron <b>${allPains.length} pain point(s)</b>${allPains.filter(p => p.severity >= 4).length ? ` (${allPains.filter(p => p.severity >= 4).length} críticos)` : ''} y <b>${handoffs} handoff(s)</b> inter-rol. ` +
      `<b>${manualCount}</b> actividad(es) son manuales — candidatas a automatización.`;

    const guiaImpl = `<h2>10. Guía de implementación sugerida</h2>
      <p><b>Fase 0-3 meses (Quick wins):</b> estandarizar criterios de decisión, eliminar controles duplicados, automatizar tareas manuales rule-based con RPA.</p>
      <p><b>Fase 3-9 meses (Táctico):</b> eliminar handoffs mediante célula multifuncional o workflow orquestado; codificar reglas de decisión (DMN).</p>
      <p><b>Fase 9-18 meses (Estratégico):</b> self-service digital en captura, KPIs en tiempo real, rediseño organizacional.</p>`;

    // ── Documento HTML compatible con Word ──
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(meta.name || 'Proceso')}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: 'ForFuture Sans', Calibri, Arial, sans-serif; font-size: 11pt; color: ${DARK}; line-height: 1.4; }
  h1 { font-size: 24pt; color: ${DARK}; margin: 0 0 4pt 0; }
  h2 { font-size: 14pt; color: ${MAGENTA}; border-bottom: 2px solid ${MAGENTA}; padding-bottom: 3pt; margin-top: 22pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 10pt; }
  th { background: ${DARK}; color: #fff; padding: 5pt 7pt; text-align: left; font-size: 9pt; }
  td { border: 1px solid #ccc; padding: 4pt 7pt; vertical-align: top; }
  tr:nth-child(even) td { background: #f7f7f7; }
  .cover { border-left: 6px solid ${MAGENTA}; padding-left: 16pt; margin-bottom: 30pt; }
  .muted { color: ${GRAY}; font-size: 10pt; }
  .tag { display:inline-block; background:${MAGENTA}; color:#fff; padding:1pt 6pt; font-size:9pt; border-radius:3pt; }
</style></head>
<body>
  <div class="cover">
    <p class="tag">MBC BUSINESS CONSULTING · PERÚ</p>
    <h1>${esc(meta.name || 'Diagnóstico de Proceso')}</h1>
    <p class="muted">Industria: <b>${esc(meta.industry || '—')}</b> &nbsp;·&nbsp; Macroproceso: <b>${esc(meta.macroprocess || '—')}</b> &nbsp;·&nbsp; ${esc(fechaLarga)}</p>
    <p class="muted">Informe generado por <b>ProcessIQ</b> · Documento confidencial — uso interno</p>
  </div>

  <h2>1. Resumen ejecutivo</h2>
  <p>${resumen}</p>

  <h2>2. Ficha del proceso</h2>
  <table>
    <tr><td style="width:30%"><b>Proceso</b></td><td>${esc(meta.name || '—')}</td></tr>
    <tr><td><b>Industria</b></td><td>${esc(meta.industry || '—')}</td></tr>
    <tr><td><b>Macroproceso</b></td><td>${esc(meta.macroprocess || '—')}</td></tr>
    <tr><td><b>Actividades</b></td><td>${tasks.length} (${manualCount} manuales)</td></tr>
    <tr><td><b>Decisiones</b></td><td>${decisions.length}</td></tr>
    <tr><td><b>Responsables (swimlanes)</b></td><td>${esc((state._lanes?.list || []).join(', ') || '—')}</td></tr>
    <tr><td><b>Handoffs inter-rol</b></td><td>${handoffs}</td></tr>
    <tr><td><b>Score de calidad MBB</b></td><td>${Math.max(0, 100 - issues.reduce((a, i) => a + ({critical:15,high:8,medium:3,low:1}[i.sev] || 0), 0))} / 100</td></tr>
  </table>

  <h2>3. Actividades del proceso (BPMN)</h2>
  <table>
    <tr><th>Código</th><th>Actividad</th><th>Tipo BPMN</th><th>Responsable</th><th>Sistema</th><th>Min</th><th>VA</th></tr>
    ${actRows}
  </table>

  <h2>4. Pain points identificados</h2>
  ${allPains.length ? `<table>
    <tr><th>Actividad</th><th>Categoría</th><th>Descripción</th><th>Sev</th><th>Frec</th><th>Score</th><th>Implicancia</th></tr>
    ${painRows}
  </table>` : '<p class="muted">No se capturaron pain points en este levantamiento.</p>'}

  <h2>5. KPIs sugeridos (benchmark de industria)</h2>
  <table>
    <tr><th>KPI</th><th>Unidad</th><th>Benchmark</th><th>Descripción</th></tr>
    ${kpiRows}
  </table>

  ${raciSection}
  ${sipocSection}
  ${simSection}

  <h2>9. Diagnóstico y recomendaciones</h2>
  <p><b>Hallazgos clave:</b></p>
  <ul>
    <li>${tasks.length} actividades, ${handoffs} handoffs inter-rol, ${manualCount} actividades manuales.</li>
    <li>${allPains.length} pain points capturados${allPains.filter(p => p.severity >= 4).length ? `, ${allPains.filter(p => p.severity >= 4).length} críticos` : ''}.</li>
    <li>${issues.filter(i => i.sev === 'critical' || i.sev === 'high').length} issue(s) de calidad de modelado a resolver (ver linter).</li>
  </ul>
  <p><b>Recomendaciones priorizadas:</b></p>
  <ul>
    <li><b>Quick wins (0-3m):</b> automatizar las ${manualCount} actividades manuales rule-based; eliminar controles duplicados.</li>
    <li><b>Mediano plazo (3-9m):</b> eliminar handoffs con workflow orquestado; codificar decisiones como reglas (DMN).</li>
    <li><b>Estructural (9-18m):</b> self-service digital, dashboard de KPIs en tiempo real.</li>
  </ul>

  ${guiaImpl}

  <p class="muted" style="margin-top:30pt;border-top:1px solid #ccc;padding-top:8pt">Generado con ProcessIQ · MBC Business Consulting · ${esc(fechaLarga)}</p>
</body></html>`;

    download('﻿' + html, filename('doc'), 'application/msword');
  }

  // ============================================================
  // FICHA DE PROCESO — documento corporativo completo (formato Minsait/cliente)
  // Estructura de 12 bloques inspirada en el estándar PR-DU-COM-* (Centenario):
  // cabecera de gobernanza, código/versión, objetivo, alcance, indicadores,
  // responsabilidades, procedimiento (diagrama), detalle de actividades,
  // sistemas, términos clave, anexos y control de cambios.
  // ============================================================
  function buildFichaBody(opts) {
    opts = opts || {};
    const embedDiagram = opts.embedDiagram !== false;
    const meta = state.meta;
    const d = deriveFicha();
    const f = d.f;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    // Convierte texto con saltos (notas del nodo) en <li> por línea o en párrafos
    const richText = (s) => {
      if (!s) return '';
      const lines = String(s).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length <= 1) return `<span>${esc(lines[0] || '')}</span>`;
      return '<ul class="tight">' + lines.map(l => `<li>${esc(l)}</li>`).join('') + '</ul>';
    };
    const fechaLarga = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Cabecera de gobernanza ──
    const govRows = (f.gobernanza || []).length
      ? f.gobernanza.map(g => `<tr>
          <td><b>${esc(g.rol || '')}</b></td><td>${esc(g.cargo || '')}</td>
          <td>${esc(g.nombre || '')}</td><td style="text-align:center">${esc(g.fecha || '')}</td></tr>`).join('')
      : `<tr><td colspan="4" class="muted">Sin responsables de gobernanza documental registrados (edítalos en la pestaña Ficha).</td></tr>`;

    // ── Indicadores (valores capturados o librería KPI) ──
    let indicadoresRows = '';
    const kv = state._kpiValues || {};
    if (Object.keys(kv).length) {
      indicadoresRows = Object.values(kv).map(k => `<tr>
        <td>${esc(k.name)}</td><td style="text-align:center">${esc(k.unit || '')}</td>
        <td>${esc(k.benchmark || '')}</td><td style="text-align:center">${esc(k.value || '—')}</td>
        <td style="text-align:center">${esc(k.gap || '—')}</td></tr>`).join('');
    } else {
      const kpis = (window.KPI_LIBRARY || []).filter(k => !meta.industry || k.industry === meta.industry || k.industry === 'Transversal').slice(0, 6);
      indicadoresRows = kpis.length
        ? kpis.map(k => `<tr><td>${esc(k.name)}</td><td style="text-align:center">${esc(k.unit)}</td><td>${esc(k.benchmark)}</td><td style="text-align:center">—</td><td style="text-align:center">—</td></tr>`).join('')
        : `<tr><td colspan="5" class="muted">N/A</td></tr>`;
    }

    // ── Responsabilidades ──
    let respBody;
    if (state._raci && Object.keys(state._raci).length) {
      const roles = [...new Set(Object.values(state._raci).flatMap(r => Object.keys(r)))];
      const rtasks = state.nodes.filter(n => state._raci[n.id]);
      respBody = `<table><tr><th>Actividad</th>${roles.map(r => `<th style="text-align:center">${esc(r)}</th>`).join('')}</tr>
        ${rtasks.map(t => `<tr><td>${esc(t.label)}</td>${roles.map(r => `<td style="text-align:center"><b>${esc(state._raci[t.id][r] || '')}</b></td>`).join('')}</tr>`).join('')}</table>
        <p class="muted">R = Responsable · A = Accountable · C = Consultado · I = Informado</p>`;
    } else if (d.responsables.length) {
      respBody = '<ul class="tight">' + d.responsables.map(r => `<li><b>${esc(r)}</b></li>`).join('') + '</ul>';
    } else {
      respBody = '<p class="muted">N/A</p>';
    }

    // ── Procedimiento: diagrama ──
    let diagrama = '<p class="muted">Ver diagrama en la herramienta ProcessIQ.</p>';
    if (embedDiagram && state.nodes.length) {
      try {
        const svg = serializeCanvasSvg();
        diagrama = `<div class="diagram">${svg}</div>`;
      } catch (_) {}
    }

    // ── Detalle de actividades ──
    const actRows = d.activities.map(a => {
      const ruteo = a.ruteo && a.ruteo.length
        ? `<div class="ruteo"><b>Ruteo:</b><ul class="tight">${a.ruteo.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : '';
      const desc = a.descripcion ? richText(a.descripcion) : '<span class="muted">—</span>';
      return `<tr>
        <td style="text-align:center;font-weight:700;color:${'#FF0054'}">${a.num}</td>
        <td><b>${esc(a.label)}</b>${a.sistema ? `<div class="sysbadge">🖥️ ${esc(a.sistema)}</div>` : ''}</td>
        <td>${esc(a.responsable || '—')}</td>
        <td>${desc}${ruteo}</td>
      </tr>`;
    }).join('');

    // ── Sistemas ──
    const sysRows = d.sistemas.length
      ? d.sistemas.map(s => `<tr><td><b>${esc(s.nombre)}</b></td><td>${esc(s.uso || '')}</td></tr>`).join('')
      : `<tr><td colspan="2" class="muted">N/A</td></tr>`;

    // ── Términos clave ──
    const termRows = (f.terminos || []).length
      ? f.terminos.map(t => `<tr><td style="width:22%"><b>${esc(t.termino)}</b></td><td>${esc(t.definicion)}</td></tr>`).join('')
      : `<tr><td colspan="2" class="muted">N/A</td></tr>`;

    // ── Anexos ──
    const anexoRows = (f.anexos || []).length
      ? f.anexos.map(a => `<tr><td style="width:22%"><b>${esc(a.codigo || '')}</b></td><td>${esc(a.nombre || '')}</td></tr>`).join('')
      : `<tr><td colspan="2" class="muted">N/A</td></tr>`;

    // ── Control de cambios ──
    const cambioRows = (f.cambios || []).length
      ? f.cambios.map(c => `<tr><td style="text-align:center">${esc(c.version || '')}</td><td style="text-align:center">${esc(c.fecha || '')}</td><td>${esc(c.descripcion || '')}</td></tr>`).join('')
      : `<tr><td colspan="3" class="muted">Sin historial de cambios.</td></tr>`;

    return `
  <div class="ficha-cover">
    <p class="tag">MBC BUSINESS CONSULTING · PERÚ${meta.client ? ' · ' + esc(meta.client) : ''}</p>
    <div class="ficha-code">${esc(f.code || '—')}${f.version ? ` &nbsp;·&nbsp; v${esc(f.version)}` : ''}</div>
    <h1>${esc(meta.name || 'Ficha de Proceso')}</h1>
    <p class="muted">Ficha de proceso &nbsp;·&nbsp; ${esc(meta.macroprocess || '')}${meta.industry ? ' · ' + esc(meta.industry) : ''} &nbsp;·&nbsp; ${esc(fechaLarga)}</p>
  </div>

  <table class="gov">
    <tr><th>Función</th><th>Cargo</th><th>Nombre</th><th style="text-align:center">Fecha</th></tr>
    ${govRows}
  </table>

  <h2>1. Objetivo</h2>
  ${f.objetivo ? `<p>${esc(f.objetivo)}</p>` : '<p class="muted">Describir el objetivo del proceso (pestaña Ficha).</p>'}

  <h2>2. Alcance</h2>
  <table class="kv">
    <tr><td class="k">Áreas involucradas</td><td>${esc(f.alcanceAreas) || (d.responsables.join(', ') || '—')}</td></tr>
    <tr><td class="k">Inicia con</td><td>${esc(d.alcanceDesde) || '—'}</td></tr>
    <tr><td class="k">Termina con</td><td>${esc(d.alcanceHasta) || '—'}</td></tr>
    ${f.alcanceIncluye ? `<tr><td class="k">Incluye / excluye</td><td>${esc(f.alcanceIncluye)}</td></tr>` : ''}
  </table>

  <h2>3. Indicadores</h2>
  <table>
    <tr><th>Indicador</th><th style="text-align:center">Unidad</th><th>Meta / Benchmark</th><th style="text-align:center">Valor actual</th><th style="text-align:center">Gap</th></tr>
    ${indicadoresRows}
  </table>

  <h2>4. Responsabilidades</h2>
  ${respBody}

  ${f.descripcion ? `<h2>5. Descripción</h2><p>${esc(f.descripcion)}</p>` : ''}

  <h2>6. Procedimiento</h2>
  <p><b>${esc(f.code || '')}</b> ${esc(meta.name || '')}</p>
  ${diagrama}

  <h2>7. Detalle de las Actividades</h2>
  <table class="acts">
    <tr><th style="width:36px;text-align:center">N°</th><th style="width:26%">Actividad</th><th style="width:20%">Responsable</th><th>Descripción y ruteo</th></tr>
    ${actRows || '<tr><td colspan="4" class="muted">Sin actividades modeladas.</td></tr>'}
  </table>

  <h2>8. Sistemas</h2>
  <table><tr><th style="width:22%">Sistema</th><th>Uso en el proceso</th></tr>${sysRows}</table>

  <h2>9. Términos Clave</h2>
  <table>${termRows}</table>

  <h2>10. Anexos</h2>
  <table>${anexoRows}</table>

  <h2>11. Control de Cambios</h2>
  <table><tr><th style="width:60px;text-align:center">Versión</th><th style="width:120px;text-align:center">Fecha</th><th>Descripción del cambio</th></tr>${cambioRows}</table>

  <p class="muted foot">Ficha generada con ProcessIQ · MBC Business Consulting · ${esc(fechaLarga)}</p>`;
  }

  function fichaStyles(forWord) {
    const MAGENTA = '#147AFF', DARK = '#003478', GRAY = '#7A93B5';   // paleta MBC (catalogo): acento, azul marino, secundario
    return `
  ${forWord ? '@page { size: A4; margin: 1.8cm; }' : ''}
  body { font-family: 'ForFuture Sans', Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: ${DARK}; line-height: 1.4; }
  h1 { font-size: 23pt; margin: 2pt 0 4pt 0; color: ${DARK}; }
  h2 { font-size: 13.5pt; color: ${MAGENTA}; border-bottom: 2px solid ${MAGENTA}; padding-bottom: 3pt; margin: 20pt 0 8pt; }
  p { margin: 6pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 10pt; }
  th { background: ${DARK}; color: #fff; padding: 5pt 7pt; text-align: left; font-size: 9pt; }
  td { border: 1px solid #ccc; padding: 5pt 7pt; vertical-align: top; }
  table.acts td, table.acts th { font-size: 9.5pt; }
  tr:nth-child(even) td { background: #faf8f7; }
  ul.tight { margin: 3pt 0; padding-left: 16pt; }
  ul.tight li { margin: 1pt 0; }
  .ficha-cover { border-left: 6px solid ${MAGENTA}; padding-left: 16pt; margin-bottom: 18pt; }
  .ficha-code { font-family: Consolas, monospace; font-size: 10pt; color: ${MAGENTA}; font-weight: 700; letter-spacing: 1px; margin-top: 4pt; }
  .tag { display:inline-block; background:${MAGENTA}; color:#fff; padding:2pt 8pt; font-size:8.5pt; border-radius:3pt; letter-spacing:.5px; }
  .muted { color: ${GRAY}; font-size: 9.5pt; }
  table.kv .k { width: 28%; background:#f4f2f1; font-weight:600; }
  table.gov th { font-size: 8.5pt; }
  .sysbadge { display:inline-block; margin-top:3pt; font-size:8pt; color:${GRAY}; }
  .ruteo { margin-top:5pt; padding:4pt 7pt; background:#fff6f3; border-left:3px solid ${MAGENTA}; font-size:9pt; }
  .ruteo ul { margin:2pt 0; }
  .diagram { border:1px solid #e2e2e2; border-radius:6px; padding:10px; margin:8pt 0; overflow-x:auto; text-align:center; background:#fff; }
  .diagram svg { max-width:100%; height:auto; }
  .foot { margin-top:24pt; border-top:1px solid #ccc; padding-top:8pt; }`;
  }

  function exportFicha() {
    if (state.nodes.length === 0) { alert('No hay proceso para generar la ficha.'); return; }
    const meta = state.meta;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    const body = buildFichaBody({ embedDiagram: true });
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc((meta.name || 'Ficha') + ' — Ficha de Proceso')}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${fichaStyles(true)}</style></head>
<body>${body}</body></html>`;
    download('﻿' + html, filename('doc').replace(/\.doc$/, '_ficha.doc'), 'application/msword');
  }

  function openFichaPreview() {
    if (state.nodes.length === 0) { alert('No hay proceso para generar la ficha.'); return; }
    const body = buildFichaBody({ embedDiagram: true });
    const html = `<div class="ficha-preview"><style>${fichaStyles(false)}
      .ficha-preview { background:#fff; color:#232323; max-height:70vh; overflow:auto; padding:22px 26px; border-radius:8px; box-shadow: inset 0 0 0 1px #eee; }
    </style>${body}</div>`;
    openModal('📋 Ficha de Proceso · vista previa', html, () => exportFicha());
    // Ensancha el modal para la ficha y renombra el botón OK a "Descargar Word"
    const card = document.querySelector('#modal .modal-card');
    if (card) card.classList.add('modal-card-lg');
    const ok = $('#modalOk'); if (ok) ok.innerHTML = '⬇️ Descargar Word';
    const cancel = $('#modalCancel'); if (cancel) cancel.textContent = 'Cerrar';
    const restore = () => { if (card) card.classList.remove('modal-card-lg'); if (ok) ok.textContent = 'Aceptar'; if (cancel) cancel.textContent = 'Cancelar'; };
    if (ok) { const prev = ok.onclick; ok.onclick = (e) => { restore(); if (prev) prev(e); }; }
    if (cancel) { const prevc = cancel.onclick; cancel.onclick = (e) => { restore(); if (prevc) prevc(e); }; }
  }

  function exportBpmn() {
    if (state.nodes.length === 0) { alert('No hay proceso para exportar.'); return; }
    const xml = generateBpmnXml();
    download(xml, filename('bpmn'), 'application/xml');
  }

  function generateBpmnXml() {
    const procId = 'Process_' + Date.now();
    const planeId = 'Plane_' + procId;
    const meta = state.meta;
    const esc = s => String(s || '').replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;' }[c]));

    // Map ProcessIQ node -> elemento BPMN (respeta gateway/evento/tipo de tarea)
    const bpmnType = (n) => {
      const t = n.type;
      if (t === 'start') return 'startEvent';
      if (t === 'end') return 'endEvent';
      if (t === 'intermediate') return n.throw ? 'intermediateThrowEvent' : 'intermediateCatchEvent';
      if (t === 'decision') {
        return n.gatewayType === 'parallel' ? 'parallelGateway'
             : n.gatewayType === 'inclusive' ? 'inclusiveGateway'
             : 'exclusiveGateway';
      }
      if (t === 'document' || t === 'data') return 'dataStoreReference';
      // Tareas: mapea el tipo de ejecución a subtipo BPMN
      const ex = n.executionType;
      if (t === 'system' || ex === 'automatic' || ex === 'system') return 'serviceTask';
      if (ex === 'manual') return 'manualTask';
      if (ex === 'email' || ex === 'send') return 'sendTask';
      if (ex === 'receive') return 'receiveTask';
      if (ex === 'ia' || ex === 'script') return 'scriptTask';
      if (ex === 'user') return 'userTask';
      return 'task';
    };
    // Definición de evento BPMN (timer/message/error/signal/terminate) para start/end/intermediate
    const eventDef = (n) => {
      if (n.type === 'end' && n.terminate) return '      <bpmn:terminateEventDefinition />\n';
      const ev = n.eventType;
      if (!ev || ev === 'none') return '';
      const map = { message: 'messageEventDefinition', timer: 'timerEventDefinition', error: 'errorEventDefinition', signal: 'signalEventDefinition' };
      return map[ev] ? `      <bpmn:${map[ev]} />\n` : '';
    };
    // Loop characteristics para marcadores de actividad
    const loopChars = (n) => {
      if (n.marker === 'loop') return '      <bpmn:standardLoopCharacteristics />\n';
      if (n.marker === 'multiinstance') return '      <bpmn:multiInstanceLoopCharacteristics isSequential="false" />\n';
      if (n.marker === 'multiinstance-seq') return '      <bpmn:multiInstanceLoopCharacteristics isSequential="true" />\n';
      return '';
    };
    const isEventType = t => t === 'start' || t === 'end' || t === 'intermediate';

    // Construye relaciones in/out por nodo para incoming/outgoing (mejora compliance BPMN)
    const incoming = {}, outgoing = {};
    state.edges.forEach(e => {
      (outgoing[e.from] = outgoing[e.from] || []).push(e.id);
      (incoming[e.to]   = incoming[e.to]   || []).push(e.id);
    });

    // ============ FLOW ELEMENTS ============
    let processBody = '';
    state.nodes.forEach(n => {
      const t = bpmnType(n);
      const ins = (incoming[n.id] || []).map(id => `      <bpmn:incoming>${id}</bpmn:incoming>`).join('\n');
      const outs = (outgoing[n.id] || []).map(id => `      <bpmn:outgoing>${id}</bpmn:outgoing>`).join('\n');

      let docs = '';
      if (n.pains && n.pains.length > 0) {
        const painsText = n.pains.map(p =>
          `[${p.category}|sev${p.severity}|frec${p.frequency}] ${p.description}`
        ).join(' || ');
        docs = `      <bpmn:documentation>Pains: ${esc(painsText)}</bpmn:documentation>\n`;
      }
      if (n.owner || n.system || n.time || n.volume) {
        const metaLine = `Owner: ${n.owner||'-'} | System: ${n.system||'-'} | Time(min): ${n.time||'-'} | Volume: ${n.volume||'-'}`;
        docs += `      <bpmn:documentation>${esc(metaLine)}</bpmn:documentation>\n`;
      }

      processBody += `    <bpmn:${t} id="${n.id}" name="${esc(n.label)}">\n`;
      processBody += docs;
      if (ins)  processBody += ins  + '\n';
      if (outs) processBody += outs + '\n';
      if (isEventType(n.type)) processBody += eventDef(n);   // timer/message/error/signal/terminate
      else processBody += loopChars(n);                       // loop / multi-instancia (en tareas)
      processBody += `    </bpmn:${t}>\n`;
    });
    // Eventos de borde (boundary) como elementos BPMN adjuntos a su tarea
    state.nodes.forEach(n => {
      if (!n.boundary) return;
      const bt = typeof n.boundary === 'string' ? n.boundary : (n.boundary.type || 'timer');
      const interrupting = (typeof n.boundary === 'object') ? n.boundary.interrupting !== false : true;
      const defMap = { timer: 'timerEventDefinition', error: 'errorEventDefinition', message: 'messageEventDefinition' };
      processBody += `    <bpmn:boundaryEvent id="${n.id}_be" name="${esc(bt)}" attachedToRef="${n.id}" cancelActivity="${interrupting}">\n` +
                     `      <bpmn:${defMap[bt] || 'timerEventDefinition'} />\n` +
                     `    </bpmn:boundaryEvent>\n`;
    });

    state.edges.forEach(e => {
      processBody += `    <bpmn:sequenceFlow id="${e.id}" sourceRef="${e.from}" targetRef="${e.to}"${e.label ? ` name="${esc(e.label)}"` : ''} />\n`;
    });

    // ============ SWIMLANES (laneSet por responsable) ============
    const laneList = (state._lanes && state._lanes.list) ? state._lanes.list : [];
    const laneOf = (state._lanes && state._lanes.laneOf) ? state._lanes.laneOf : {};
    if (laneList.length > 0) {
      let laneSetXml = '    <bpmn:laneSet id="LaneSet_1">\n';
      laneList.forEach((laneName, li) => {
        const refs = [];
        state.nodes.forEach(n => {
          if ((laneOf[n.id] || '') === laneName) {
            refs.push(`        <bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`);
            if (n.boundary) refs.push(`        <bpmn:flowNodeRef>${n.id}_be</bpmn:flowNodeRef>`);
          }
        });
        laneSetXml += `      <bpmn:lane id="Lane_${li + 1}" name="${esc(laneName)}">\n` +
                      (refs.length ? refs.join('\n') + '\n' : '') +
                      `      </bpmn:lane>\n`;
      });
      laneSetXml += '    </bpmn:laneSet>\n';
      processBody = laneSetXml + processBody;   // laneSet va antes de los flowElements (esquema BPMN)
    }

    // ============ BPMN DI (visual interchange) ============
    let diShapes = '';
    // DI de los carriles (bandas horizontales detrás de los nodos)
    if (laneList.length > 0) {
      const allMaxX = Math.max(...state.nodes.map(n => n.x + n.w), 0);
      laneList.forEach((laneName, li) => {
        const ms = state.nodes.filter(n => (laneOf[n.id] || '') === laneName);
        if (!ms.length) return;
        const y0 = Math.min(...ms.map(n => n.y)) - 18;
        const y1 = Math.max(...ms.map(n => n.y + n.h)) + 18;
        diShapes += `      <bpmndi:BPMNShape id="Lane_${li + 1}_di" bpmnElement="Lane_${li + 1}" isHorizontal="true">\n` +
                    `        <dc:Bounds x="0" y="${Math.round(y0)}" width="${Math.round(allMaxX + 40)}" height="${Math.round(y1 - y0)}" />\n` +
                    `      </bpmndi:BPMNShape>\n`;
      });
    }
    state.nodes.forEach(n => {
      diShapes += `      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}">\n` +
                  `        <dc:Bounds x="${Math.round(n.x)}" y="${Math.round(n.y)}" width="${Math.round(n.w)}" height="${Math.round(n.h)}" />\n` +
                  `      </bpmndi:BPMNShape>\n`;
      // DI del evento de borde: sobre la esquina inferior-izquierda de la tarea (coincide con el canvas)
      if (n.boundary) {
        diShapes += `      <bpmndi:BPMNShape id="${n.id}_be_di" bpmnElement="${n.id}_be">\n` +
                    `        <dc:Bounds x="${Math.round(n.x - 2)}" y="${Math.round(n.y + n.h - 18)}" width="22" height="22" />\n` +
                    `      </bpmndi:BPMNShape>\n`;
      }
    });
    let diEdges = '';
    state.edges.forEach(e => {
      const a = getNode(e.from), b = getNode(e.to);
      if (!a || !b) return;
      const p1 = nodeCenter(a), p2 = nodeCenter(b);
      diEdges += `      <bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">\n` +
                 `        <di:waypoint x="${Math.round(p1.x)}" y="${Math.round(p1.y)}" />\n` +
                 `        <di:waypoint x="${Math.round(p2.x)}" y="${Math.round(p2.y)}" />\n` +
                 `      </bpmndi:BPMNEdge>\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="Definitions_${procId}" targetNamespace="http://processiq.minsait/bpmn"
  exporter="ProcessIQ" exporterVersion="0.3">
  <bpmn:process id="${procId}" name="${esc(meta.name || 'Proceso ProcessIQ')}" isExecutable="false">
    <bpmn:documentation>Industria: ${esc(meta.industry)} | Macroproceso: ${esc(meta.macroprocess)}</bpmn:documentation>
${processBody}  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_${procId}">
    <bpmndi:BPMNPlane id="${planeId}" bpmnElement="${procId}">
${diShapes}${diEdges}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
  }

  // ============================================================
  // EXPORT PPTX (pptxgenjs CDN)
  // ============================================================
  // Temas del export PPTX. 'mbc' es el estándar de la casa (Libro de estilo
  // transitorio V2: azul 003478, Montserrat, Gris Cerámica). Los temas de
  // cliente calcan SU plantilla: paleta, tipografías, logotipo y carátula.
  // Para añadir un cliente basta una entrada aquí y un botón en el menú.
  const TEMAS_PPTX = {
    mbc: {
      // Referencia: "Catalogo de recursos graficos MBC" (Template Nuevo MBC.pptx,
      // archivado en Documentos\Plantillas\MBC). Paleta CERRADA: dos azules
      // mandan (003478 marino, 147AFF acento) y el resto sostiene en gris frio.
      // Laminas blancas; no hay fucsia ni Ceramica de fondo.
      nombre: 'MBC', autor: 'MBC Business Consulting', pie: 'MBC',
      dk1: '003478', lt2: 'FFFFFF', acento: '147AFF', gris: '7A93B5', antetitulo: '7A93B5',
      sep: 'C9D3E0', chipRol: 'CFDDF2', teal: '7C9AC7',
      rosa: '003478', verde: '147AFF', arena: 'F2F3F5', circulo: '147AFF',
      font: 'Montserrat', fontTitulo: 'Montserrat',
      foto: 'data:image/jpeg;base64,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',
      logo: 'data:image/png;base64,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',
      logoInv: 'data:image/png;base64,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',
      logoW: 1.26, logoH: 0.28,
      portada: 'mbc', portadaFondo: '003478', portadaTexto: 'FFFFFF', portadaSub: 'CFDDF2',
      cierre: false
    },
    bbva: {
      // Referencia: Flow_Value_BBVA (2).pptx — tema "Simple Light": dk1 001391,
      // dk2 060E46, lt2 F7F8F8, accent1 85C8FF; Lato en cuerpo y Source Serif 4
      // en títulos; carátula y cierre sobre azul con logotipo blanco.
      nombre: 'BBVA', autor: 'MBC Business Consulting · BBVA', pie: 'BBVA',
      dk1: '001391', lt2: 'F7F8F8', acento: '85C8FF', gris: '5C6B8A', antetitulo: '5C6B8A',
      sep: 'ADB8C2', chipRol: 'E5F2FF', teal: '0097A7',
      rosa: 'FFB56B', verde: '88E783', arena: 'FFFFFF', circulo: '001391',
      font: 'Lato', fontTitulo: 'Source Serif 4',
      logo: 'data:image/png;base64,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',
      logoInv: 'data:image/png;base64,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',
      logoW: 1.05, logoH: 0.32,
      portada: 'bbva', portadaFondo: '001391', portadaTexto: 'FFFFFF', portadaSub: 'E5F2FF',
      cierre: true
    }
  };

  function exportPptx(tema) {
    const T = TEMAS_PPTX[tema] || TEMAS_PPTX.mbc;
    if (typeof PptxGenJS === 'undefined') {
      alert('La librería PPTX no se cargó (¿estás offline?). Conecta a internet o usa export SVG/PNG.');
      return;
    }
    if (state.nodes.length === 0) { alert('No hay proceso para exportar.'); return; }

    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 inches
    pres.title = state.meta.name || 'ProcessIQ Diagnóstico';
    pres.author = T.autor;

    // ============================================================
    // SISTEMA VISUAL DEL TEMA
    // Los nombres de las constantes se conservan (M_PRUNO, M_FUCSIA...) porque
    // los usan ~250 sitios del export; su VALOR sale del tema elegido. Con el
    // tema 'mbc', M_PRUNO ya no es Pruno sino Azul MBC.
    // Jerarquia: lt2 + dk1 + Blanco dominan (80-90 %); el acento solo resalta.
    // ============================================================
    const M_PRUNO = T.dk1;         // dk1  - titulos y texto
    const M_PRUNO_OSC = T.portadaFondo;  // portada y separadores de seccion
    const M_CERAMICA = T.lt2;      // lt2  - fondo de las slides de contenido
    const M_BLANCO = 'FFFFFF';     // lt1  - contenedores: cards, carriles, tablas
    const M_FUCSIA = T.acento;     // accent - resaltados
    const M_SEP = T.sep;           // separadores y bordes de caja
    const M_CHIP_ROL = T.chipRol;  // chip de rol del swimlane
    const M_TEAL = T.teal;         // eventos intermedios BPMN

    const MAGENTA = T.circulo;     // circulos de continuidad y flechas de secuencia
    const DARK = M_PRUNO;          // texto de cuerpo
    const GRAY = T.gris;           // texto secundario
    const T_VINO = M_PRUNO;        // decisiones (diamante) y titulos
    const T_AZUL = M_TEAL;         // eventos intermedios y artefactos
    const T_ROSA = T.rosa;         // evento de fin
    const T_VERDE = T.verde;       // evento de inicio
    const T_NARANJA = M_CHIP_ROL;  // chip de rol del swimlane
    const T_ARENA = T.arena;       // cajas de actividad
    const T_TXT = M_PRUNO;         // texto dentro de las cajas
    const T_FONT = T.font;         // tipografia de cuerpo
    const T_FONT_TITULO = T.fontTitulo;
    // Ancho medio de caracter respecto al cuerpo. Era 0,50 (ForFuture Sans);
    // Montserrat y Lato son mas anchas y con 0,50 las cajas quedaban cortas.
    // Va aqui, al principio: el chip de rol lo usa antes de que se declare altoEtiqueta.
    const ANCHO_CAR = 0.56;
    const M_ANTETITULO = T.antetitulo || M_FUCSIA;

    // ---- Chrome corporativo (medidas en pulgadas del patron oficial) ----
    const PIE_DOC = state.meta.name || 'Diagnostico de proceso';
    const PIE_FECHA = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let _sldNo = 1;   // la portada es la 1

    // Viste una slide ya creada: fondo, antetitulo, titulo, pie, logo y numero.
    // Coordenadas calcadas de slideLayout18/slideMaster2 del patron Minsait.
    function mChrome(sl, titulo, antetitulo) {
      sl.background = { color: M_CERAMICA };
      _sldNo++;
      if (antetitulo) {
        sl.addText(String(antetitulo).toUpperCase(), {
          x: 0.367, y: 0.354, w: 12.6, h: 0.2, fontSize: 9, bold: true,
          color: M_ANTETITULO, fontFace: T_FONT, charSpacing: 1.4, valign: 'middle'
        });
      }
      if (titulo) {
        sl.addText(titulo, {
          x: 0.367, y: 0.6, w: 12.6, h: 0.44, fontSize: 24, color: M_PRUNO,
          fontFace: T_FONT_TITULO, valign: 'top', wrap: false, fit: 'shrink'
        });
      }
      if (T.portada === 'mbc') {
        // Catalogo MBC: logotipo abajo a la izquierda y foliado gris a la derecha
        sl.addImage({ data: T.logo, x: 0.367, y: 6.97, w: 0.83, h: 0.19 });
        sl.addText(PIE_DOC + '  |  ' + PIE_FECHA, {
          x: 1.35, y: 6.99, w: 7.0, h: 0.18, fontSize: 7, color: GRAY, fontFace: T_FONT
        });
      } else {
        sl.addText(T.pie + '  |  ' + PIE_DOC + '  |  ' + PIE_FECHA, {
          x: 0.367, y: 6.99, w: 7.93, h: 0.18, fontSize: 7, color: GRAY, fontFace: T_FONT
        });
        // Logotipo del tema abajo a la derecha, antes del numero de lamina
        sl.addImage({ data: T.logo, x: 12.5 - T.logoW, y: 7.06 - T.logoH / 2, w: T.logoW, h: T.logoH });
      }
      sl.addText(String(_sldNo), {
        x: 12.547, y: 6.96, w: 0.42, h: 0.2, fontSize: 8, color: GRAY,
        fontFace: T_FONT, align: 'right'
      });
      return sl;
    }

    // Crea una slide de contenido ya vestida con el patron Minsait
    function mSlide(titulo, antetitulo) { return mChrome(pres.addSlide(), titulo, antetitulo); }

    // Contenedor blanco (regla Minsait: el blanco es contenedor, nunca fondo)
    function mPanel(sl, x, y, w, h) {
      sl.addShape('rect', { x: x, y: y, w: w, h: h, fill: { color: M_BLANCO }, line: { type: 'none' } });
    }

    // ============ SLIDE 1: PORTADA ============
    const s1 = pres.addSlide();
    s1.background = { color: T.portadaFondo };
    if (T.portada === 'bbva') {
      // Calco de "1_Diapositiva de título" de Flow_Value_BBVA: fondo azul,
      // logotipo blanco arriba a la izquierda, subtítulo y título grande abajo.
      s1.addImage({ data: T.logoInv, x: 0.5, y: 0.45, w: T.logoW, h: T.logoH });
      s1.addText(`Industria: ${state.meta.industry || '—'}   ·   Macroproceso: ${state.meta.macroprocess || '—'}`, {
        x: 0.5, y: 3.85, w: 12.3, h: 0.32, fontSize: 13, color: T.portadaSub, fontFace: T_FONT });
      s1.addText(state.meta.name || 'Diagnóstico de proceso', {
        x: 0.5, y: 4.25, w: 12.3, h: 1.9, fontSize: 40, color: T.portadaTexto,
        fontFace: T_FONT_TITULO, valign: 'top' });
      s1.addText(`${state.meta.client || 'BBVA'}  ·  ${PIE_FECHA}`, {
        x: 0.5, y: 6.35, w: 8, h: 0.28, fontSize: 11, color: T.portadaSub, fontFace: T_FONT });
      s1.addText('Documento confidencial — uso interno', {
        x: 8.3, y: 6.93, w: 4.6, h: 0.24, fontSize: 8, color: T.portadaSub, fontFace: T_FONT, align: 'right' });
    } else {
      // Calco de la portada del "Catalogo de recursos graficos MBC" (20x11,25"
      // escalada a 13,33x7,5"): banda blanca superior con el logotipo azul,
      // titulo y subtitulo en blanco, filete 7FB0FF con la fecha debajo y una
      // foto en duotono sobre panel 0A3F86 a la derecha.
      s1.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.97, fill: { color: 'FFFFFF' }, line: { type: 'none' } });
      s1.addImage({ data: T.logo, x: 0.37, y: 0.41, w: 1.25, h: 0.28 });
      s1.addText(state.meta.name || 'Diagnóstico de proceso', {
        x: 0.37, y: 1.63, w: 5.95, h: 1.9, fontSize: 36, bold: true, color: T.portadaTexto,
        fontFace: T_FONT_TITULO, valign: 'top' });
      s1.addText(`Industria: ${state.meta.industry || '—'}  ·  Macroproceso: ${state.meta.macroprocess || '—'}\n${state.meta.client || 'MBC Business Consulting'}`, {
        x: 0.37, y: 4.59, w: 5.95, h: 0.9, fontSize: 15, color: T.portadaTexto, fontFace: T_FONT, valign: 'top' });
      s1.addShape('rect', { x: 0.37, y: 6.59, w: 4.5, h: 0.02, fill: { color: '7FB0FF' }, line: { type: 'none' } });
      s1.addText(PIE_FECHA, { x: 0.37, y: 6.72, w: 3, h: 0.28, fontSize: 12, color: T.portadaTexto, fontFace: T_FONT });
      s1.addShape('rect', { x: 6.67, y: 1.5, w: 6.3, h: 5.54, fill: { color: '0A3F86' }, line: { type: 'none' } });
      if (T.foto) s1.addImage({ data: T.foto, x: 6.67, y: 1.5, w: 6.3, h: 5.54, sizing: { type: 'cover', w: 6.3, h: 5.54 } });
    }

    // ============ SLIDE(S): DIAGRAMA — split en múltiples para legibilidad ============
    // Fuente adaptativa: 8pt si hay muchos actores (lanes pequeñas), 9pt si no.
    const FONT_NODE = ((state._lanes?.list || []).length > 5) ? 8 : 9;
    const FONT_EDGE = 7;            // tamaño del label de aristas
    const MIN_NODE_W_IN = 0.95;     // ancho mín de nodo en pulgadas para legibilidad a 9pt
    const SLIDE_DRAW_W = 12.6;      // ancho disponible para dibujo
    const SLIDE_DRAW_H = 5.55;      // alto util bajo el titulo corporativo
    const DRAW_TOP = 1.12;          // el patron Minsait abre el contenido en y=1.095

    // ── Editabilidad en PowerPoint ──────────────────────────────
    // Grilla de 0,05": un cuarto de la cuadrícula de PowerPoint. Lo que el
    // consultor mueva después encaja con el resto sin pelear con la alineación.
    const g5 = (v) => Math.round(v * 20) / 20;
    // Nombre descriptivo por nodo: el panel de selección de PowerPoint deja de
    // ser 97 filas de "Text 12". Se guarda por id porque el post-proceso que
    // ancla los conectores necesita encontrar cada forma por su nombre.
    const nombresPorNodo = {};
    state._nombresPorNodo = nombresPorNodo;   // lo usa el banco para reproducir el post-proceso fuera de la pestaña
    let _seqNombre = 0;
    function nombreDe(n) {
      if (nombresPorNodo[n.id]) return nombresPorNodo[n.id];
      const cod = n.activityCode || ('' + (++_seqNombre)).padStart(2, '0');
      const tipo = { start: 'Inicio', end: 'Fin', decision: 'Decisión', intermediate: 'Evento',
                     document: 'Documento', data: 'Datos' }[n.type] || 'Tarea';
      // pptxgenjs escribe el nombre en el XML sin escapar: un "&" o "<" en la
      // etiqueta corrompería el archivo. Se limpian antes.
      const nom = tipo + ' ' + cod + ' · ' + String(n.label || '').replace(/[&<>"]/g, '').replace(/\s+/g, ' ').slice(0, 48);
      nombresPorNodo[n.id] = nom;
      return nom;
    }

    // Mapeo de owners → lanes para los slides (reutiliza state._lanes)
    const lanesData = state._lanes || null;
    const ranks = lanesData?.ranks || {};
    const laneList = lanesData?.list || [];

    // Bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
    });
    const srcW = Math.max(1, maxX - minX);
    const srcH = Math.max(1, maxY - minY);

    // Calcular escala que respete tamaño mínimo de nodo
    const desiredScaleByH = SLIDE_DRAW_H / srcH;
    const desiredScaleByW = SLIDE_DRAW_W / srcW;
    const fitScale = Math.min(desiredScaleByH, desiredScaleByW);

    // Si el nodo más ancho en fit-scale queda muy chico → split
    const maxNodeW = Math.max(...state.nodes.map(n => n.w));
    const nodeWAtFit = maxNodeW * fitScale;
    const needsSplit = nodeWAtFit < MIN_NODE_W_IN || srcW * desiredScaleByH > SLIDE_DRAW_W;

    // Computa scale final — FORZAR multi-slide para que cada celda tenga ancho legible (font 9pt)
    const totalRanks = lanesData?.totalRanks || 1;
    const drawableW_calc = SLIDE_DRAW_W - 0.6;
    // Menos ranks por slide cuando hay muchos actores (lanes) → cajas más grandes y legibles
    const numLanesAll = (lanesData?.list || []).length;
    // Densidad por lámina. Las decisiones son las que más espacio de texto piden
    // (su pregunta va fuera del rombo y ocupa 2-3 líneas), así que un proceso con
    // muchos gateways necesita columnas más anchas, no más columnas.
    const numDecisiones = state.nodes.filter(n => n.type === 'decision').length;
    const densidadAlta = numLanesAll > 5 || numDecisiones >= 5;
    // 4 columnas y no 6: medido sobre Venta de Lotes, 6 columnas dejaba las
    // celdas tan estrechas que las preguntas de los gateways se partían en 3-4
    // líneas y se pisaban. Con 4 el deck crece 2 láminas y los solapes caen a 0.
    // Sin rombos y con uno o dos carriles (la vista Ejecutiva es justo eso) las
    // columnas no necesitan ancho extra para las preguntas: caben 9. Con 6, un
    // flujo ejecutivo de 8 rangos se partía en dos bandas y aparecían conectores
    // con letra en un diagrama de 6 cajas.
    const maxCols = densidadAlta ? 4 : (numDecisiones === 0 && numLanesAll <= 2 ? 9 : 6);
    const ranksPerSlice = Math.max(3, Math.min(maxCols, totalRanks));
    let slicesCount = Math.ceil(totalRanks / ranksPerSlice);   // recalculado por el plan en escalera
    const colWInches_calc = drawableW_calc / ranksPerSlice;
    // Scale per slice: cada slice cubre ranksPerSlice ranks, ocupa drawableW_calc inches
    const srcColW = state._lanes?.colW || 220;
    const sliceWPixels = ranksPerSlice * srcColW;
    const scale = Math.min(SLIDE_DRAW_H / srcH, drawableW_calc / sliceWPixels);

    // Estilo Telered: actividades arena sin borde, diamante vino, inicio verde, fin rosa
    const shapeKind = { task: 'rect', system: 'rect', decision: 'diamond', start: 'ellipse', end: 'ellipse', intermediate: 'ellipse', document: 'rect', data: 'parallelogram' };
    const shapeFill = { task: T_ARENA, system: T_ARENA, decision: T_VINO, start: T_VERDE, end: T_ROSA, intermediate: 'FFFFFF', document: T_ARENA, data: T_ARENA };
    const shapeBorder = { task: M_SEP, system: '9AA4AE', decision: T_VINO, start: T_VERDE, end: T_ROSA, intermediate: T_AZUL, document: T_AZUL, data: T_AZUL };
    // Glyph unicode por subtipo de evento BPMN (render confiable en PowerPoint; Calibri/Segoe fallback)
    const EV_GLYPH = { message: '✉', timer: '⌛', error: '⚡', signal: '▲' };
    const MK_GLYPH = { subprocess: '⊞', loop: '↻', multiinstance: '|||', 'multiinstance-seq': '☰' };

    // Función helper: dibuja un slice del proceso en un slide
    function drawProcessSlice(slide, sliceIdx, bandas) {
      const rankStart = bandas[0].ini;
      const rankEnd = bandas[bandas.length - 1].fin;
      // Header estilo Telered: título vino + kicker gris uppercase, sin barras
      const subtitle = slicesCount > 1 ? ` (${sliceIdx + 1}/${slicesCount})` : '';
      mChrome(slide,
        `Flujo del proceso: ${state.meta.name || 'As-Is'}${subtitle}`,
        (state.meta.macroprocess || 'PROCESO') + '  ·  ' + (state.meta.client || state.meta.industry || T.nombre));



      // Filtra nodos en el rango de ranks del slice
      const nodesInSlice = state.nodes.filter(n => {
        if (finSoloAdelantado[n.id]) return false;   // se pinta en la banda de origen
        const r = ranks[n.id] || 0;
        return r >= rankStart && r < rankEnd;
      });
      if (nodesInSlice.length === 0) return;

      // Re-calcula bounding box solo de este slice
      let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
      nodesInSlice.forEach(n => {
        sMinX = Math.min(sMinX, n.x); sMinY = Math.min(sMinY, n.y);
        sMaxX = Math.max(sMaxX, n.x + n.w); sMaxY = Math.max(sMaxY, n.y + n.h);
      });
      const sliceW = Math.max(1, sMaxX - sMinX);
      const sliceH = Math.max(1, sMaxY - sMinY);
      const sliceScale = Math.min(SLIDE_DRAW_H / sliceH, (SLIDE_DRAW_W - 0.6) / sliceW);
      const offX = 0.4 + ((SLIDE_DRAW_W - 0.6) - sliceW * sliceScale) / 2;
      const offY = DRAW_TOP + (SLIDE_DRAW_H - sliceH * sliceScale) / 2;

      // ───── FILAS = banda × carril ─────
      // Cada banda repite los carriles de SU tramo de columnas. Una fila vacía
      // no se dibuja: es justo el hueco que antes se desperdiciaba.
      const filas = [];
      bandas.forEach((bi, bIdx) => {
        bi.lanes.forEach(laneName => {
          filas.push({ banda: bIdx, ini: bi.ini, fin: bi.fin, lane: laneName });
        });
      });
      // Si el único nodo de una fila era un fin adelantado, la fila queda vacía
      // y no se dibuja (medirBanda la contó porque no sabe de adelantos).
      for (let fi = filas.length - 1; fi >= 0; fi--) {
        const f = filas[fi];
        const conNodos = nodesInSlice.some(n => {
          const r = ranks[n.id] || 0;
          const ln = (state._lanes && state._lanes.laneOf && state._lanes.laneOf[n.id]) || 'Por asignar';
          return r >= f.ini && r < f.fin && f.lane === ln;
        });
        if (!conNodos) filas.splice(fi, 1);
      }
      const filaIdxOf = (n) => {
        const r = ranks[n.id] || 0;
        const ln = (state._lanes && state._lanes.laneOf && state._lanes.laneOf[n.id]) || 'Por asignar';
        return filas.findIndex(f => r >= f.ini && r < f.fin && f.lane === ln);
      };

      // ───── Conectores de página DENTRO del carril blanco ─────
      // Hasta v2.6.0 el círculo iba en x=0,21 y el carril empieza en x=0,4: el
      // conector quedaba flotando sobre el fondo Cerámica y no se leía a qué
      // actor pertenecía. Ahora se le reserva un pasillo dentro del carril,
      // justo después del chip de rol, y sólo cuando ese tramo tiene conectores.
      // Con escalera, un conector puede saltar de banda dentro de la MISMA
      // lámina, así que el pasillo se reserva por salto de banda, no de lámina.
      const enSlide = (r) => r >= rankStart && r < rankEnd;
      const saltaBanda = saltaBandaG;
      const hayEntradaIzq = state.edges.some(e => {
        const ra = ranks[e.from], rb = ranks[e.to];
        return ra != null && rb != null && enSlide(rb) && saltaBanda(ra, rb) && !esAristaAFinAdelantado(e);
      });
      const haySalidaDer = state.edges.some(e => {
        const ra = ranks[e.from], rb = ranks[e.to];
        return ra != null && rb != null && enSlide(ra) && saltaBanda(ra, rb);
      });
      const GUT_IZQ = hayEntradaIzq ? 1.05 : 0.55;   // 0,55 = chip de rol
      const GUT_DER = haySalidaDer ? 0.60 : 0.05;
      const CONN_X_IZQ = 0.4 + (0.44 + GUT_IZQ) / 2;                  // centro del pasillo
      let CONN_X_DER = 0.4 + (SLIDE_DRAW_W - 0.4) - GUT_DER / 2;   // se acerca al contenido más abajo

      // ───── Grid de celdas: cada nodo en su columna-de-banda × fila ─────
      // ───── Columnas compactas por banda ─────
      // Un rank sin nodos en esta lámina (un fin adelantado, un nodo que vive
      // en otra fila...) dejaba una columna vacía y el diagrama se estiraba con
      // huecos, como vio el usuario en Originación 3/4. Se renumeran solo las
      // columnas que tienen nodos, banda por banda.
      const colUsadas = {};
      nodesInSlice.forEach(n => {
        const li = filaIdxOf(n); if (li < 0) return;
        const f = filas[li];
        (colUsadas[f.banda] = colUsadas[f.banda] || new Set()).add((ranks[n.id] || 0) - f.ini);
      });
      const colMapa = {};
      Object.keys(colUsadas).forEach(bk => {
        colMapa[bk] = {};
        Array.from(colUsadas[bk]).sort((p, q) => p - q).forEach((c, i) => { colMapa[bk][c] = i; });
      });
      const sliceColCount = Math.max(1, ...Object.keys(colMapa).map(bk => Object.keys(colMapa[bk]).length));
      // Tope de anchura por columna. Con pocas columnas el diagrama se estiraba
      // a toda la lámina (2,6" por columna para cajas de 1,9") y quedaba lleno
      // de aire, como vio el usuario en Originación 3/4. Se compacta a la
      // izquierda y el pasillo de salida se pega al contenido, como lo
      // reacomodó él a mano.
      const MAX_CELL_W = 1.95;
      const cellInnerW = Math.min(MAX_CELL_W, (SLIDE_DRAW_W - 0.4 - GUT_IZQ - GUT_DER) / sliceColCount);
      CONN_X_DER = Math.min(CONN_X_DER, 0.4 + GUT_IZQ + sliceColCount * cellInnerW + GUT_DER / 2 + 0.1);
      const CELL_GAP_X = 0.18;
      const cellWFinal = cellInnerW - CELL_GAP_X;

      // Cuántos nodos comparten cada celda (fila × columna dentro de su banda)
      const cellCount = {}, cellIdx = {};
      const colOf = (n) => {
        const li = filaIdxOf(n); if (li < 0) return 0;
        const f = filas[li], c = (ranks[n.id] || 0) - f.ini;
        const m = colMapa[f.banda] || {};
        return m[c] != null ? m[c] : c;
      };
      const keyOf = (n) => filaIdxOf(n) + '|' + colOf(n);
      nodesInSlice.forEach(n => { const k = keyOf(n); cellCount[k] = (cellCount[k] || 0) + 1; });

      // ───── Alto de cada fila, proporcional a lo que apila ─────
      const apilaFila = filas.map((_, fi) => {
        let m = 1;
        Object.keys(cellCount).forEach(k => { if (+k.split('|')[0] === fi) m = Math.max(m, cellCount[k]); });
        return m;
      });
      const MIN_LANE_H = 0.82;          // mínimo para que quepa el chip de rol
      let laneH = apilaFila.map(f => MIN_LANE_H + (f - 1) * 0.62);

      // ───── (C) Si sobra alto, se agranda en vez de dejar aire muerto ─────
      // El patrón fija la caja en 0,531"; aquí se permite crecer hasta 1,45x
      // cuando la lámina va holgada, a cambio de legibilidad en proyección.
      const gapsTotales = GAP_BANDA * Math.max(0, bandas.length - 1);
      const altoContenido = laneH.reduce((a, h) => a + h, 0) + gapsTotales;
      // Tope por ARRIBA (crecer si sobra) y por ABAJO (comprimir si no cabe):
      // sin el segundo, un tramo con muchos actores se salia de la lamina.
      const escala = Math.max(0.45, Math.min(1.45, (ALTO_UTIL - gapsTotales) / Math.max(0.01, altoContenido - gapsTotales)));
      laneH = laneH.map(h => h * escala);
      // La tipografia acompana a la caja: de nada sirve una caja mas grande con
      // el texto igual de pequeno. Se topa en 11 pt para no romper la jerarquia
      // con el titulo de 24 pt.
      const FONT_NODE_S = Math.min(11, Math.round(FONT_NODE * escala * 10) / 10);

      // ───── (D) Si aun así sobra, se centra el bloque; no se estira ─────
      const altoFinal = laneH.reduce((a, h) => a + h, 0) + gapsTotales;
      const topInicial = DRAW_TOP + Math.max(0, (ALTO_UTIL - altoFinal) / 2);
      const laneY = [];
      {
        let acc = topInicial, bandaPrev = filas.length ? filas[0].banda : 0;
        filas.forEach((f, i) => {
          if (f.banda !== bandaPrev) { acc += GAP_BANDA; bandaPrev = f.banda; }
          laneY.push(acc); acc += laneH[i];
        });
      }

      // Render de filas (carril blanco + chip de rol a la izquierda)
      const LANE_HEADER_W = 0.42;  // ancho visible del chip (ref. patrón: 0.472in)
      if (filas.length > 0) {
        filas.forEach((fila, lidx) => {
          const laneName = fila.lane;
          const ly = laneY[lidx], lh = laneH[lidx];
          const primeraDeBanda = lidx === 0 || filas[lidx - 1].banda !== fila.banda;
          // Carril blanco: es el contenedor sobre el fondo Gris Cerámica
          slide.addShape('rect', { x: 0.4, y: ly, w: SLIDE_DRAW_W - 0.4, h: lh,
            fill: { color: 'FFFFFF' }, line: { type: 'none' } });
          // Separador sólo ENTRE carriles de la misma banda: entre bandas ya hay
          // un hueco de fondo Cerámica, que es la señal de "aquí baja el flujo".
          if (lidx > 0 && !primeraDeBanda) {
            slide.addShape('line', { x: 0.4, y: ly, w: SLIDE_DRAW_W - 0.4, h: 0,
              line: { color: M_SEP, width: 1 } });
          }
          // Chip de rol. El patrón Minsait define la caja ANCHA (1,252 x 0,472)
          // y la rota 270 grados. Si se define estrecha, PowerPoint maqueta el
          // texto en los 0,42" ANTES de rotar y lo desborda por arriba y abajo.
          const chipL = Math.max(0.6, Math.min(lh - 0.14, 1.45));   // longitud visible (vertical)
          const chipBox = {
            x: (0.42 + LANE_HEADER_W / 2) - chipL / 2,
            y: (ly + lh / 2) - LANE_HEADER_W / 2,
            w: chipL, h: LANE_HEADER_W, rotate: 270
          };
          slide.addShape('rect', Object.assign({}, chipBox, {
            fill: { color: T_NARANJA }, line: { type: 'none' } }));
          // El nombre debe caber en la longitud visible del chip. 'fit: shrink'
          // no basta: PowerPoint solo recalcula al editar, y hasta entonces el
          // texto se sale ("Ejecutivo Comercial" desbordaba, captura del
          // usuario). Si no cabe en una linea se parte en dos por el espacio
          // mas central; si sigue sin caber, baja el cuerpo hasta 6,5 pt.
          const cabe = (t, fs) => String(t).length * fs * ANCHO_CAR / 72 <= chipL - 0.08;
          let nombreChip = laneName, fsChip = 8;
          if (!cabe(laneName, 8) && /\s/.test(laneName)) {
            const palabras = laneName.split(/\s+/);
            let mejor = null, mejorDif = Infinity;
            for (let k = 1; k < palabras.length; k++) {
              const pa = palabras.slice(0, k).join(' '), pb = palabras.slice(k).join(' ');
              const dif = Math.abs(pa.length - pb.length);
              if (dif < mejorDif) { mejorDif = dif; mejor = [pa, pb]; }
            }
            nombreChip = mejor.join('\n');
            const masLarga = Math.max(mejor[0].length, mejor[1].length);
            while (fsChip > 6.5 && masLarga * fsChip * ANCHO_CAR / 72 > chipL - 0.08) fsChip -= 0.5;
          } else {
            while (fsChip > 6.5 && !cabe(laneName, fsChip)) fsChip -= 0.5;
          }
          slide.addText(nombreChip, Object.assign({}, chipBox, {
            fontSize: fsChip, bold: false, color: M_PRUNO, align: 'center', valign: 'middle',
            fontFace: T_FONT, wrap: true, margin: 0 }));
        });
      }

      // Tamaños por tipo, ahora EN PROPORCIÓN a la celda disponible
      // Proporciones calcadas del deck de referencia (Telered slides 40-41):
      // actividad 1.13x0.53in, diamante 0.31in, eventos 0.30in. Se topan contra
      // la celda disponible para que nunca desborden en procesos densos.
      // Alto real que necesita una etiqueta. Hasta v2.5.1 era fijo (0,3") y las
      // preguntas de 3 líneas desbordaban sobre la figura de abajo.
      // 0,50 es el ancho medio de carácter en ForFuture Sans respecto al cuerpo.
      // El catalogo EXECUTION_TYPES trae su propia paleta (azul, violeta,
      // ambar...) porque lo comparte con el lienzo. En el entregable se traduce
      // a los accents oficiales del tema Minsait, sin tocar el catalogo.
      const EXEC_A_MINSAIT = {
        '6B7280': GRAY, '1E5BAA': '00B0BD', '1E7E34': '44B757',
        '6D28D9': '8661F5', 'B45309': 'E56813', '92600A': 'E56813',
        'B91C1C': 'A40037', '78350F': GRAY, 'A16207': 'E56813'
      };
      function colorExec(hex) {
        const k = String(hex || '').replace('#', '').toUpperCase();
        return EXEC_A_MINSAIT[k] || M_PRUNO;
      }

      function altoEtiqueta(txt, ancho, fs) {
        const lineas = Math.max(1, Math.ceil(String(txt || '').length * fs * ANCHO_CAR / 72 / Math.max(ancho, 0.3)));
        return Math.max(0.2, lineas * fs * 1.25 / 72);
      }

      // Anticolisión de etiquetas de arista: dos flechas paralelas y cercanas
      // escribían su rótulo en el mismo punto ("Solicita descuento" sobre
      // "Acepta"). Se aparta la segunda en vertical.
      const etiqAristaUsadas = [];
      function sembrarCajasEnAnticolision() {
        nodeBoxes.forEach(function (b) {
          etiqAristaUsadas.push({ x: b.x + b.w / 2, y: b.y, w: b.w, h: b.h });
        });
      }
      function apartaEtiqArista(x, y, w, h) {
        // Acotado al area de dibujo: sin el, en procesos densos la busqueda
        // empujaba etiquetas por encima del titulo o por debajo del pie.
        const Y_MIN = DRAW_TOP + 0.02, Y_MAX = DRAW_TOP + SLIDE_DRAW_H - h - 0.02;
        const clamp = (v) => Math.min(Y_MAX, Math.max(Y_MIN, v));
        let yy = clamp(y);
        for (let i = 0; i < 24; i++) {
          const choca = etiqAristaUsadas.some(u =>
            Math.abs(u.x - x) < (u.w + w) / 2 && Math.abs(u.y - yy) < (u.h + h) / 2);
          if (!choca) break;
          const cand = clamp(y + (i % 2 === 0 ? -1 : 1) * (h + 0.03) * Math.ceil((i + 1) / 2));
          if (cand === yy) continue;
          yy = cand;
        }
        etiqAristaUsadas.push({ x: x, y: yy, w: w, h: h });
        return yy;
      }

      // Ahora cada carril tiene SU alto, así que el tamaño se topa contra el
      // carril del nodo, no contra un alto único para todos.
      function cellSize(n, lh) {
        const alto = lh || Math.min.apply(null, laneH);
        if (n.type === 'start' || n.type === 'end' || n.type === 'intermediate') {
          const d = Math.min(0.32, cellWFinal * 0.5, alto * 0.35);
          return { w: d, h: d };
        }
        if (n.type === 'decision') {
          const d = Math.min(0.34, cellWFinal * 0.5, alto * 0.35);
          return { w: d, h: d };
        }
        return {
          w: Math.min(cellWFinal, 1.30 * escala),             // ref: 1.303
          h: Math.min(alto * 0.42, 0.58 * escala)             // ref: 0.531
        };
      }

      // ───── Orden vertical dentro de cada celda: afinidad de fila ─────
      // Dos tareas que comparten celda se apilan según a qué fila conectan:
      // la que habla con un actor de más abajo va abajo y su flecha ya no
      // cruza a las hermanas. Hasta v3.0.2 el orden era el de inserción del
      // modelo, así que la tarea que iba al Cliente podía quedar en medio.
      // Se barre 3 veces para que la posición ya decidida de un vecino
      // (fila + fracción dentro de su celda) refine la de los demás.
      const filaDe = {};
      nodesInSlice.forEach(n => { filaDe[n.id] = filaIdxOf(n); });
      const posFila = {};
      nodesInSlice.forEach(n => { posFila[n.id] = filaDe[n.id] + 0.5; });
      const vecinosDe = {};
      state.edges.forEach(e => {
        if (posFila[e.from] === undefined || posFila[e.to] === undefined || e.from === e.to) return;
        (vecinosDe[e.from] = vecinosDe[e.from] || []).push(e.to);
        (vecinosDe[e.to] = vecinosDe[e.to] || []).push(e.from);
      });
      const porCelda = {};
      nodesInSlice.forEach(n => { const k = keyOf(n); (porCelda[k] = porCelda[k] || []).push(n); });
      const afinidad = (n) => {
        const vs = vecinosDe[n.id] || [];
        if (!vs.length) return posFila[n.id];
        return vs.reduce((a, v) => a + posFila[v], 0) / vs.length;
      };
      for (let pasada = 0; pasada < 3; pasada++) {
        Object.keys(porCelda).forEach(k => {
          const grp = porCelda[k];
          if (grp.length < 2) return;
          grp.sort((p, q) => (afinidad(p) - afinidad(q)) || (p.y - q.y));
          grp.forEach((n, i) => { posFila[n.id] = filaDe[n.id] + (i + 0.5) / grp.length; });
        });
      }
      const nodesOrdenados = [].concat.apply([], Object.keys(porCelda).map(k => porCelda[k]));

      // Posiciones
      const nodeBoxes = new Map();
      nodesOrdenados.forEach(n => {
        const li = filaIdxOf(n);
        if (li < 0) return;
        const r = colOf(n);
        const key = li + '|' + r;
        const total = cellCount[key];
        const idx = (cellIdx[key] = (cellIdx[key] === undefined ? 0 : cellIdx[key] + 1));
        const lh = laneH[li], ly = laneY[li];
        const sz = cellSize(n, lh);
        const cellX = 0.4 + GUT_IZQ + r * cellInnerW + (cellInnerW - sz.w) / 2;
        let cellY = ly + (lh - sz.h) / 2;
        if (total > 1) {
          // Paso que incluye la etiqueta bajo la figura (decisiones/eventos la
          // llevan debajo) para que dos nodos apilados no se solapen el texto.
          const labelBelow = (n.type === 'decision' || n.type === 'start' || n.type === 'end' || n.type === 'intermediate');
          // El paso incluye el alto REAL de la etiqueta: con 0,52 fijo, una
          // pregunta de 4 líneas bajo un rombo pisaba el rombo apilado debajo.
          const step = Math.min((lh - 0.1) / total, sz.h + (labelBelow ? altoEtiqueta(n.label, sz.w + 0.9, 9) + 0.12 : 0.12));
          cellY = ly + (lh - (total - 1) * step - sz.h) / 2 + idx * step;
        }
        const gx = g5(cellX), gy = g5(cellY), gw = g5(sz.w), gh = g5(sz.h);
        nodeBoxes.set(n.id, { x: gx, y: gy, w: gw, h: gh, cx: gx + gw/2, cy: gy + gh/2 });
      });

      // ───── Lado por el que sale y entra cada arista ─────
      // Hasta v3.1.0 mandaba la horizontal: si el destino estaba a la derecha
      // se salia por la derecha aunque estuviera tres carriles mas abajo, y la
      // flecha daba un rodeo largo por el pasillo (visto por el usuario en
      // Originacion de Credito Hipotecario: el rombo del umbral hasta "Evaluar
      // en comite"). Ahora manda la direccion DOMINANTE: si el salto vertical
      // supera al avance horizontal, se sale por el vertice inferior y se entra
      // por arriba, que es como se dibuja a mano.
      const carrilDeId = (id) => (state._lanes && state._lanes.laneOf && state._lanes.laneOf[id]) || null;
      function ladoDeArista(idA, idB, ba, bb) {
        const dx = bb.cx - ba.cx, dy = bb.cy - ba.cy;
        // Cambio de carril: manda la vertical aunque el destino avance mas a la
        // derecha que hacia abajo. Medido en Originacion de Credito: dx 2,63" y
        // dy 2,38", asi que por dominancia pura seguia saliendo por la derecha
        // y daba el rodeo largo. El criterio real es el actor, no la distancia.
        const lA = carrilDeId(idA), lB = carrilDeId(idB);
        const cambiaCarril = !!(lA && lB && lA !== lB);
        if (cambiaCarril || Math.abs(dy) > Math.abs(dx)) {
          return dy >= 0
            ? { ladoA: 'bottom', ladoB: 'top',
                p1: { x: ba.cx, y: ba.y + ba.h }, p2: { x: bb.cx, y: bb.y } }
            : { ladoA: 'top', ladoB: 'bottom',
                p1: { x: ba.cx, y: ba.y }, p2: { x: bb.cx, y: bb.y + bb.h } };
        }
        return dx >= 0
          ? { ladoA: 'right', ladoB: 'left',
              p1: { x: ba.x + ba.w, y: ba.cy }, p2: { x: bb.x, y: bb.cy } }
          : { ladoA: 'left', ladoB: 'right',
              p1: { x: ba.x, y: ba.cy }, p2: { x: bb.x + bb.w, y: bb.cy } };
      }

      // ───── Reparto de lados de salida por nodo ─────
      // Si de un mismo objeto salen varias flechas, cada una sale por un lado
      // distinto (pedido del usuario): el preferido por geometria y, si ya esta
      // ocupado, el siguiente libre. Un rombo con tres ramas sale por derecha,
      // abajo y arriba en vez de amontonarlas en el mismo vertice.
      const ladoSalidaDe = {}, ladosUsados = {};
      const candidatos = (ba, bb) => {
        const dx = bb.cx - ba.cx, dy = bb.cy - ba.cy;
        const h = dx >= 0 ? 'right' : 'left', v = dy >= 0 ? 'bottom' : 'top';
        const pref = Math.abs(dy) > Math.abs(dx) ? [v, h] : [h, v];
        return pref.concat(['right', 'bottom', 'top', 'left'].filter(l => pref.indexOf(l) < 0));
      };
      state.edges.forEach(e => {
        const ba = nodeBoxes.get(e.from), bb = nodeBoxes.get(e.to);
        if (!ba || !bb || e.from === e.to) return;
        const rA = ranks[e.from], rB = ranks[e.to];
        if (rA != null && rB != null && saltaBanda(rA, rB)) return;   // va por conector
        const usados = (ladosUsados[e.from] = ladosUsados[e.from] || {});
        const pref = ladoDeArista(e.from, e.to, ba, bb).ladoA;
        const lista = [pref].concat(candidatos(ba, bb).filter(l => l !== pref));
        const lado = lista.find(l => !usados[l]) || pref;   // >4 salidas: se repite
        usados[lado] = true;
        ladoSalidaDe[e.id] = lado;
      });
      // Que nodos sacan una flecha por su vertice inferior: su etiqueta (la
      // pregunta del rombo) tiene que subir encima para no quedar cruzada.
      const salidaAbajo = {};
      Object.keys(ladoSalidaDe).forEach(id => {
        if (ladoSalidaDe[id] !== 'bottom') return;
        const e = state.edges.find(x => x.id === id); if (e) salidaAbajo[e.from] = true;
      });

      // ───── Dibuja nodos ─────
      nodesInSlice.forEach(n => {
        const b = nodeBoxes.get(n.id);
        if (!b) return;
        const kind = shapeKind[n.type] || 'rect';
        const esTarea = (n.type === 'task' || n.type === 'system');
        const shapeOpts = {
          x: b.x, y: b.y, w: b.w, h: b.h,
          fill: { color: shapeFill[n.type] || 'FFFFFF' },
          line: { color: shapeBorder[n.type] || DARK, width: 1 },
          objectName: nombreDe(n)
        };
        if (kind === 'rect') shapeOpts.rectRadius = 0.08;
        if (n.type === 'decision') shapeOpts.shape = 'diamond';
        if (esTarea) {
          // La tarea es UN solo objeto: la forma lleva el texto dentro, como en
          // el patrón corporativo. Antes eran forma + texto suelto encima, y al
          // mover la caja en PowerPoint el texto se quedaba atrás.
          const execT = (window.EXECUTION_TYPES || []).find(t => t.id === n.executionType);
          const compactT = b.h < 0.62;
          const arriba = (!compactT && (!!n.activityCode || execT)) ? 0.22 : 0.03;
          const abajo = 0.03 + ((n.marker && n.marker !== 'none' && MK_GLYPH[n.marker] && !compactT) ? 0.16 : 0);
          slide.addText(n.label || '', Object.assign({}, shapeOpts, {
            shape: kind === 'rect' ? 'roundRect' : kind,
            margin: [Math.round(arriba * 72), 3, Math.round(abajo * 72), 3],
            fontSize: compactT ? 7.5 : FONT_NODE_S, align: 'center', valign: 'middle',
            color: T_TXT, fontFace: T_FONT, wrap: true, autoFit: false
          }));
        } else if (n.type === 'decision') {
          // El rombo lleva su glifo DENTRO: un solo objeto, como las tareas.
          // Antes eran rombo + cuadro de texto y al moverlo en PowerPoint la
          // "x" se quedaba atrás (pedido del usuario).
          const par = n.gatewayType === 'parallel', inc = n.gatewayType === 'inclusive';
          slide.addText(par ? '+' : (inc ? 'O' : 'x'), Object.assign({
            margin: 0, fontSize: (par || inc) ? 20 : 12, bold: true,
            color: (par || inc) ? M_PRUNO : 'FFFFFF', align: 'center', valign: 'middle', fontFace: T_FONT
          }, shapeOpts));
        } else {
          slide.addShape(kind, shapeOpts);
        }
        // Para eventos: ícono dentro + label debajo
        if (n.type === 'start' || n.type === 'end' || n.type === 'intermediate') {
          // Evento intermedio: doble anillo (anillo interior)
          if (n.type === 'intermediate') {
            slide.addShape('ellipse', { x: b.x + 0.04, y: b.y + 0.04, w: b.w - 0.08, h: b.h - 0.08,
              fill: { type: 'none' }, line: { color: shapeBorder.intermediate, width: 1 } });
          }
          // Símbolo: subtipo BPMN si lo tiene; terminate = disco; si no, ▶/■/◇
          // Formato Telered: inicio/fin son círculos planos SIN glifo; los
          // subtipos de evento sí llevan su símbolo (en blanco sobre el relleno)
          let sym, symColor = (n.type === 'intermediate') ? T_AZUL : 'FFFFFF', symBold = true, symSize = 12;
          if (n.type === 'end' && n.terminate) {
            // Disco de terminación (anillo con disco blanco interior)
            slide.addShape('ellipse', { x: b.x + b.w*0.28, y: b.y + b.h*0.28, w: b.w*0.44, h: b.h*0.44,
              fill: { color: 'FFFFFF' }, line: { type: 'none' } });
            sym = '';
          } else if (n.eventType && EV_GLYPH[n.eventType]) {
            sym = EV_GLYPH[n.eventType]; symSize = n.eventType === 'signal' ? 11 : 12;
          } else {
            sym = '';   // círculo plano, como en el deck de referencia
          }
          if (sym) {
            slide.addText(sym, { x: b.x, y: b.y, w: b.w, h: b.h,
              fontSize: symSize, color: symColor, align: 'center', valign: 'middle', bold: symBold });
          }
          // Label debajo del círculo
          if (n.label && n.label !== 'Inicio') {
            const hEv = altoEtiqueta(n.label, b.w + 0.6, FONT_NODE_S);
            const evArriba = !!salidaAbajo[n.id];
            slide.addText(n.label, {
              x: b.x - 0.3, y: evArriba ? b.y - hEv - 0.03 : b.y + b.h + 0.02,
              w: b.w + 0.6, h: hEv,
              fontSize: FONT_NODE_S, color: M_PRUNO, align: 'center', valign: evArriba ? 'bottom' : 'top',
              fontFace: T_FONT, wrap: true, autoFit: false
            });
          } else if (n.label === 'Inicio') {
            slide.addText('Inicio', { x: b.x - 0.3, y: b.y + b.h + 0.02, w: b.w + 0.6, h: 0.25,
              fontSize: FONT_NODE_S, color: M_PRUNO, align: 'center', fontFace: T_FONT });
          }
        } else if (n.type === 'task' || n.type === 'system') {
          // ── Tarea BPMN: chip de tipo + código (arriba), label (abajo) ──
          const exec = (window.EXECUTION_TYPES || []).find(t => t.id === n.executionType);
          // Caja compacta estilo Telered: el chip de tipo y el código sólo caben
          // si la caja es alta; si no, el texto usa toda la caja (como el deck ref).
          const compact = b.h < 0.62;
          if (exec && !compact) {
            // Marcador BPMN: chip de color con la sigla del tipo (USR, RCV, SRV...).
            // UN solo objeto: la forma lleva el texto dentro. Hasta v3.0.2 eran
            // dos (rectángulo + cuadro de texto) y al mover uno en PowerPoint el
            // otro se quedaba atrás.
            slide.addText((exec.codePrefix || 'ACT'), {
              shape: 'roundRect', rectRadius: 0.03,
              x: b.x + 0.05, y: b.y + 0.05, w: 0.42, h: 0.17,
              fill: { color: colorExec(exec.color) }, line: { type: 'none' }, margin: 0,
              fontSize: 6.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: T_FONT,
              objectName: 'Tipo ' + (exec.codePrefix || 'ACT') + ' · ' + nombreDe(n)
            });
          }
          // El código de actividad ([USR-02]) NO se dibuja en la lámina: era un
          // cuadro de texto suelto de 7 pt que se montaba sobre el título de la
          // tarea. Sigue en el modelo, en el panel de propiedades y como columna
          // de la Ficha de Proceso (Word), que es donde se usa para cruzar.
          // El texto de la tarea ya va DENTRO de la forma (ver arriba)
          const hasMarker = n.marker && n.marker !== 'none' && MK_GLYPH[n.marker] && !compact;
          // Marcador de actividad BPMN en la base (centro inferior)
          if (hasMarker) {
            slide.addText(MK_GLYPH[n.marker], {
              x: b.x, y: b.y + b.h - 0.20, w: b.w, h: 0.18,
              fontSize: 9, color: GRAY, align: 'center', valign: 'middle', fontFace: T_FONT, bold: true
            });
          }
          // Evento de borde BPMN (boundary): círculo en la esquina inferior-izquierda
          if (n.boundary) {
            const bt = typeof n.boundary === 'string' ? n.boundary : (n.boundary.type || 'timer');
            const interrupting = (typeof n.boundary === 'object') ? n.boundary.interrupting !== false : true;
            const bd = 0.19, bbx = b.x - bd * 0.45, bby = b.y + b.h - bd * 0.55;
            slide.addShape('ellipse', { x: bbx, y: bby, w: bd, h: bd,
              fill: { color: 'FBE1CF' }, line: { color: 'E56813', width: 1, dashType: interrupting ? 'solid' : 'dash' } });
            slide.addText(EV_GLYPH[bt] || '⌛', { x: bbx, y: bby, w: bd, h: bd,
              fontSize: 7, color: 'E56813', align: 'center', valign: 'middle' });
          }
        } else if (n.type === 'decision' && (n.gatewayType === 'parallel' || n.gatewayType === 'inclusive')) {
          // Gateway paralelo/inclusivo: marca (＋/○) al centro + label debajo
          const hPar = altoEtiqueta(n.label, b.w + 0.6, FONT_NODE_S);
          const parArriba = !!salidaAbajo[n.id];
          slide.addText(n.label || '', {
            x: b.x - 0.3, y: parArriba ? b.y - hPar - 0.03 : b.y + b.h + 0.01,
            w: b.w + 0.6, h: hPar,
            fontSize: FONT_NODE_S, align: 'center', valign: parArriba ? 'bottom' : 'top',
            color: M_PRUNO, fontFace: T_FONT, wrap: true, autoFit: false
          });
        } else if (n.type === 'decision') {
          // Gateway exclusivo formato Telered: diamante vino con "x" blanca,
          // y la pregunta FUERA del diamante como etiqueta en vino
          // 1,4" de margen extra: con 0,9" y Montserrat, "¿Documentación
          // completa?" se partia a mitad de palabra ("Documentació / n").
          const wPreg = b.w + 1.4;
          const hPreg = altoEtiqueta(n.label, wPreg, 9);
          const arriba = !!salidaAbajo[n.id];
          const yPreg = arriba ? b.y - hPreg - 0.03 : b.y + b.h + 0.01;
          slide.addText(n.label || '', {
            x: b.x - 0.7, y: yPreg, w: wPreg, h: hPreg,
            fontSize: 9, bold: true, align: 'center', valign: arriba ? 'bottom' : 'top',
            color: T_VINO, fontFace: T_FONT, wrap: true, autoFit: false
          });
          // La pregunta ocupa sitio: los rotulos Si/No de las ramas la esquivan
          etiqAristaUsadas.push({ x: b.x + b.w / 2, y: yPreg, w: wPreg, h: hPreg });
        } else {
          // Documento / data: label centrado
          slide.addText(n.label || '', {
            x: b.x + 0.08, y: b.y + 0.04, w: b.w - 0.16, h: b.h - 0.08,
            fontSize: FONT_NODE_S, align: 'center', valign: 'middle',
            color: M_PRUNO, fontFace: T_FONT, wrap: true, autoFit: false
          });
        }
        // Badge owner inferido (esquina sup-derecha para no chocar con el chip)
        if (n._inferredOwner) {
          slide.addShape('ellipse', { x: b.x + b.w - 0.14, y: b.y - 0.06, w: 0.20, h: 0.20,
            fill: { color: 'E56813' }, line: { color: 'FFFFFF', width: 1 } });
          slide.addText('!', { x: b.x + b.w - 0.14, y: b.y - 0.06, w: 0.20, h: 0.20,
            fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
        }
      });

      // ───── Dibuja edges ortogonales (horizontal + vertical, sin diagonales) ─────
      // Helper: dibuja una L (horizontal primero, luego vertical) o solo línea recta si están alineados
      function drawOrthoEdge(slide, ax, ay, aw, ah, bx, by, bw, bh, hasArrow, label, dash) {
        // Conectores rosa magenta finos (ref. Telered: accent1 FF0054 a 0.5pt)
        const EDGE_COLOR = dash ? 'B8879E' : MAGENTA, EDGE_W = dash ? 0.5 : 0.5;
        const DASH = dash ? 'dash' : 'solid';
        // Puntos de salida/entrada en bordes (no centros)
        let sx, sy, tx, ty;
        const sameRow = Math.abs((ay + ah/2) - (by + bh/2)) < 0.15;
        const sameCol = Math.abs((ax + aw/2) - (bx + bw/2)) < 0.05;
        if (sameRow) {
          // Conexión horizontal
          sx = bx > ax ? ax + aw : ax;
          sy = ay + ah / 2;
          tx = bx > ax ? bx : bx + bw;
          ty = by + bh / 2;
          // ¿Hay cajas en medio? Si la recta las atravesaría, se rodea por debajo.
          const x1 = Math.min(sx, tx), x2 = Math.max(sx, tx);
          const blockers = [...nodeBoxes.values()].filter(o =>
            sy > o.y + 0.02 && sy < o.y + o.h - 0.02 && x1 < o.x + o.w - 0.03 && x2 > o.x + 0.03);
          if (blockers.length) {
            const dy = Math.max(...blockers.map(o => o.y + o.h), ay + ah, by + bh) + 0.13;
            const exX = sx + (tx > sx ? 0.07 : -0.07);
            const enX = tx + (tx > sx ? -0.07 : 0.07);
            const seg = (X, Y, W, H, arrow, fh, fv) => slide.addShape('line', {
              x: X, y: Y, w: W, h: H,
              line: { color: EDGE_COLOR, width: EDGE_W, dashType: DASH, endArrowType: arrow ? 'triangle' : 'none' },
              flipH: !!fh, flipV: !!fv });
            seg(Math.min(sx, exX), sy, Math.abs(exX - sx) || 0.01, 0.01, false, exX < sx);   // salida
            seg(exX, sy, 0.01, dy - sy, false, false, false);                                 // baja
            seg(Math.min(exX, enX), dy, Math.abs(enX - exX) || 0.01, 0.01, false, enX < exX); // rodea
            seg(enX, ty, 0.01, dy - ty, false, false, true);                                  // sube
            seg(Math.min(enX, tx), ty, Math.abs(tx - enX) || 0.01, 0.01, hasArrow, tx < enX); // entra
            if (label) {
              slide.addText(label, { x: (exX + enX) / 2 - 0.4, y: apartaEtiqArista((exX + enX) / 2, dy - 0.20, 0.8, 0.18), w: 0.8, h: 0.18,
                fontSize: FONT_EDGE, color: T_TXT, align: 'center', fontFace: T_FONT });
            }
            return;
          }
          slide.addShape('line', {
            x: Math.min(sx, tx), y: sy, w: Math.max(Math.abs(tx - sx), 0.01), h: 0.01,
            line: { color: EDGE_COLOR, width: EDGE_W, dashType: DASH, endArrowType: hasArrow ? 'triangle' : 'none' },
            flipH: tx < sx
          });
          if (label) {
            slide.addText(label, {
              x: (sx + tx) / 2 - 0.35, y: apartaEtiqArista((sx + tx) / 2, sy - 0.15, 0.7, 0.22), w: 0.7, h: 0.22,
              fontSize: FONT_EDGE, color: T_TXT, align: 'center',
              fontFace: T_FONT, italic: false
            });
          }
        } else if (sameCol) {
          // Conexión vertical
          sx = ax + aw / 2;
          sy = by > ay ? ay + ah : ay;
          tx = bx + bw / 2;
          ty = by > ay ? by : by + bh;
          slide.addShape('line', {
            x: sx, y: Math.min(sy, ty), w: 0.01, h: Math.max(Math.abs(ty - sy), 0.01),
            line: { color: EDGE_COLOR, width: EDGE_W, dashType: DASH, endArrowType: hasArrow ? 'triangle' : 'none' },
            flipV: ty < sy
          });
          if (label) {
            slide.addText(label, {
              x: sx + 0.05, y: apartaEtiqArista(sx + 0.4, (sy + ty) / 2 - 0.11, 0.7, 0.22), w: 0.7, h: 0.22,
              fontSize: FONT_EDGE, color: T_TXT, align: 'left',
              fontFace: T_FONT, italic: false
            });
          }
        } else {
          // L-shape: horizontal primero (desde borde derecho de A hasta x del centro de B),
          //          luego vertical (desde ahí hasta borde superior/inferior de B)
          sx = bx > ax ? ax + aw : ax;
          sy = ay + ah / 2;
          tx = bx + bw / 2;
          ty = by > sy ? by : by + bh;
          const cornerX = tx;
          // Segmento 1: horizontal sx→cornerX
          slide.addShape('line', {
            x: Math.min(sx, cornerX), y: sy, w: Math.max(Math.abs(cornerX - sx), 0.01), h: 0.01,
            line: { color: EDGE_COLOR, width: EDGE_W, dashType: DASH, endArrowType: 'none' }
          });
          // Segmento 2: vertical cornerX,sy → tx,ty
          slide.addShape('line', {
            x: cornerX, y: Math.min(sy, ty), w: 0.01, h: Math.max(Math.abs(ty - sy), 0.01),
            line: { color: EDGE_COLOR, width: EDGE_W, dashType: DASH, endArrowType: hasArrow ? 'triangle' : 'none' },
            flipV: ty < sy
          });
          if (label) {
            slide.addText(label, {
              x: Math.min(sx, cornerX) + Math.abs(cornerX - sx) / 2 - 0.35, y: apartaEtiqArista(Math.min(sx, cornerX) + Math.abs(cornerX - sx) / 2, sy - 0.18, 0.7, 0.22), w: 0.7, h: 0.22,
              fontSize: FONT_EDGE, color: T_TXT, align: 'center',
              fontFace: T_FONT, italic: false
            });
          }
        }
      }

      // Una arista = UNA línea con nombre "Flujo|origen|destino|ladoA|ladoB".
      // El post-proceso del XML la convierte en un conector real anclado a las
      // dos formas: al mover una caja en PowerPoint, la flecha la sigue y
      // PowerPoint la re-rutea. Los codos que calculábamos aquí se pierden a
      // cambio de eso; es la decisión tomada (corregir > fidelidad al abrir).
      // Varias ramas saliendo del mismo nodo (un rombo) compartían el mismo codo
      // y se veían como una sola línea. Cada rama recibe un codo distinto: adj1
      // del bentConnector3, en milésimas de % del ancho del conector.
      const _ramasPorOrigen = {};
      function adjRama(idOrigen) {
        const k = (_ramasPorOrigen[idOrigen] = (_ramasPorOrigen[idOrigen] || 0) + 1);
        return [50000, 35000, 65000, 80000, 20000][(k - 1) % 5];
      }

      function emitirConector(slide, a, b, ba, bb, e, esMensaje) {
        const lados = ladoDeArista(a.id, b.id, ba, bb);
        const ladoA = ladoSalidaDe[e.id] || lados.ladoA, ladoB = lados.ladoB, p2 = lados.p2;
        const p1 = ladoA === 'right' ? { x: ba.x + ba.w, y: ba.cy }
                 : ladoA === 'left' ? { x: ba.x, y: ba.cy }
                 : ladoA === 'top' ? { x: ba.cx, y: ba.y } : { x: ba.cx, y: ba.y + ba.h };
        slide.addShape('line', {
          x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y),
          w: Math.max(Math.abs(p2.x - p1.x), 0.01), h: Math.max(Math.abs(p2.y - p1.y), 0.01),
          flipH: p2.x < p1.x, flipV: p2.y < p1.y,
          line: { color: esMensaje ? 'B8879E' : MAGENTA, width: 0.5,
                  dashType: esMensaje ? 'dash' : 'solid', endArrowType: 'triangle' },
          objectName: 'Flujo|' + a.id + '|' + b.id + '|' + ladoA + '|' + ladoB + '|' + adjRama(a.id)
        });
        if (e.label) {
          const lx = p1.x + (p2.x - p1.x) * 0.3, ly = p1.y + (p2.y - p1.y) * 0.3;
          slide.addText(e.label, {
            x: lx - 0.35, y: apartaEtiqArista(lx, ly - 0.2, 0.7, 0.22), w: 0.7, h: 0.22,
            fontSize: FONT_EDGE, color: T_TXT, align: 'center', fontFace: T_FONT,
            objectName: 'Etiqueta · ' + String(e.label).slice(0, 40)
          });
        }
      }

      // Conectores de página: dos aristas que salen a la misma altura ponían su
      // círculo y su rótulo en la misma coordenada y quedaban ilegibles. Cada
      // columna (izquierda y derecha) reserva su altura y aparta al siguiente.
      sembrarCajasEnAnticolision();
      const offPageDer = [], offPageIzq = [];
      const finesAdelantados = {};   // (idNodoFin|banda) -> {cx, cy, d, idFin, n}

      // ───── Dónde va el círculo de continuidad ─────
      // Hasta v3.1.1 vivían siempre pegados al borde izquierdo o derecho de la
      // lámina, así que un nodo de la primera columna tiraba una línea que la
      // cruzaba entera. Si la celda contigua de su misma fila está VACÍA, el
      // círculo se pone ahí: la línea se acorta y la lámina respira. Si no hay
      // hueco, vuelve al borde, que es el comportamiento de siempre.
      const usadasPorX = {};
      const usadasEn = (x) => (usadasPorX[x.toFixed(2)] = usadasPorX[x.toFixed(2)] || []);

      // ───── La flecha de un conector nunca atraviesa una caja ─────
      // Visto por el usuario en Originación 1/4: la entrada "B" cruzaba
      // "Registrar solicitud" de lado a lado. Si el tramo recto pisa alguna
      // caja, el círculo sube (o baja) al pasillo del carril y la flecha entra
      // por arriba (o abajo) del nodo, como se dibujaría a mano.
      function tramoPisaCaja(x1, x2, y, ignorar) {
        const a = Math.min(x1, x2), z = Math.max(x1, x2);
        for (const par of nodeBoxes) {
          const id = par[0], bx = par[1];
          if (ignorar[id]) continue;
          if (bx.x + bx.w <= a + 0.02 || bx.x >= z - 0.02) continue;
          if (y >= bx.y - 0.04 && y <= bx.y + bx.h + 0.04) return true;
        }
        return false;
      }
      function pasilloLibre(n, x1, x2) {
        const li = filaIdxOf(n); if (li < 0) return null;
        const arriba = laneY[li] + 0.21, abajo = laneY[li] + laneH[li] - 0.21;
        if (!tramoPisaCaja(x1, x2, arriba, {})) return { y: arriba, lado: 'top' };
        if (!tramoPisaCaja(x1, x2, abajo, {})) return { y: abajo, lado: 'bottom' };
        return null;
      }
      function columnaConector(n, dir, xBorde) {
        const li = filaIdxOf(n);
        if (li < 0) return xBorde;
        const r = colOf(n) + dir;
        if (r < 0 || r >= sliceColCount) return xBorde;
        if (cellCount[li + '|' + r]) return xBorde;          // celda ocupada
        return 0.4 + GUT_IZQ + r * cellInnerW + cellInnerW / 2;
      }
      const OFF_PAGE_SEP = 0.58;   // circulo (0,36) + rotulo debajo (0,16) + aire
      // Busca hueco alternando abajo/arriba, pero SIEMPRE dentro del area de
      // dibujo. Sin el acotado, un proceso con muchos conectores en una lamina
      // (13 carriles, 136 aristas) empujaba circulos fuera de la diapositiva.
      const OFF_MIN = DRAW_TOP + 0.20;
      const OFF_MAX = DRAW_TOP + SLIDE_DRAW_H - 0.30;
      function reservaOffPage(usadas, y) {
        const base = Math.min(OFF_MAX, Math.max(OFF_MIN, y));
        const libre = (v) => !usadas.some(u => Math.abs(u - v) < OFF_PAGE_SEP);
        if (libre(base)) { usadas.push(base); return base; }
        for (let k = 1; k <= 24; k++) {
          const abajo = base + OFF_PAGE_SEP * k;
          if (abajo <= OFF_MAX && libre(abajo)) { usadas.push(abajo); return abajo; }
          const arriba = base - OFF_PAGE_SEP * k;
          if (arriba >= OFF_MIN && libre(arriba)) { usadas.push(arriba); return arriba; }
        }
        // Sin hueco: se acepta el solape antes que salirse de la lamina
        usadas.push(base);
        return base;
      }

      state.edges.forEach(e => {
        const a = state.nodes.find(x => x.id === e.from);
        const b = state.nodes.find(x => x.id === e.to);
        if (!a || !b) return;
        // Un salto de BANDA se dibuja como conector con letra aunque los dos
        // nodos estén en la misma lámina: una flecha cruzando el escalón
        // ensuciaría el diagrama. Y si el salto es dentro de la lámina hay que
        // pintar LOS DOS extremos, por eso no es un if/else encadenado.
        const aIn = nodeBoxes.has(a.id);
        const bIn = nodeBoxes.has(b.id);
        if (!aIn && !bIn) return;
        const rA = ranks[a.id], rB = ranks[b.id];
        const cruzaBanda = rA != null && rB != null && saltaBanda(rA, rB);
        if (aIn && bIn && !cruzaBanda) {
          const ba = nodeBoxes.get(a.id), bb = nodeBoxes.get(b.id);
          const lA = state._lanes && state._lanes.laneOf ? state._lanes.laneOf[a.id] : null;
          const lB = state._lanes && state._lanes.laneOf ? state._lanes.laneOf[b.id] : null;
          const isMsg = lA && lB && lA !== lB && a.type !== 'start' && b.type !== 'end';
          emitirConector(slide, a, b, ba, bb, e, isMsg);
          return;
        }
        if (aIn && esAristaAFinAdelantado(e)) {
          // Fin adelantado: el círculo de fin se dibuja aquí, en el pasillo de
          // salida, UNA vez por banda aunque lleguen varias flechas (C y E → Fin).
          const ba = nodeBoxes.get(a.id);
          const bandaA = bandaIdxDeRank[rA];
          const kFin = b.id + '|' + bandaA;
          let fin = finesAdelantados[kFin];
          if (!fin) {
            // Centrado en la media de sus orígenes de ESTA banda
            const fuentes = state.edges
              .filter(x => x.to === b.id && nodeBoxes.has(x.from) && bandaIdxDeRank[ranks[x.from]] === bandaA)
              .map(x => nodeBoxes.get(x.from));
            const syProm = fuentes.reduce((acc, f) => acc + f.y + f.h / 2, 0) / Math.max(1, fuentes.length);
            const d = 0.32, cx = columnaConector(a, +1, CONN_X_DER);
            const cy = reservaOffPage(usadasEn(cx), syProm);
            const idFin = 'fin:' + b.id + ':' + bandaA;
            nombresPorNodo[idFin] = nombreDe(b) + ' (banda ' + (bandaA + 1) + ')';
            fin = finesAdelantados[kFin] = { cx, cy, d, idFin, n: 0 };
            slide.addShape('ellipse', { x: cx - d / 2, y: cy - d / 2, w: d, h: d,
              fill: { color: shapeFill.end }, line: { color: shapeBorder.end, width: 1 }, objectName: nombresPorNodo[idFin] });
            if (b.terminate) {
              slide.addShape('ellipse', { x: cx - d / 2 + 0.07, y: cy - d / 2 + 0.07, w: d - 0.14, h: d - 0.14,
                fill: { color: 'FFFFFF' }, line: { type: 'none' } });
            }
            const etq = b.label || 'Fin';
            // 0,8" de ancho: no pisa la última columna (acaba en 11,91") y
            // solo asoma 0,12" fuera del carril por la derecha.
            slide.addText(etq, { x: cx - 0.38, y: cy + d / 2 + 0.02, w: 0.8, h: altoEtiqueta(etq, 0.8, 7.5),
              fontSize: 7.5, color: M_PRUNO, align: 'center', valign: 'top', fontFace: T_FONT, wrap: true, autoFit: false,
              objectName: 'Etiqueta · ' + String(etq).slice(0, 40) });
          }
          const sy = ba.y + ba.h / 2;
          const adjFin = [82000, 68000, 54000, 40000, 26000][(usadasEn(fin.cx).length - 1 + fin.n) % 5];
          fin.n++;
          slide.addShape('line', {
            x: ba.x + ba.w, y: Math.min(sy, fin.cy),
            w: Math.max(fin.cx - fin.d / 2 - (ba.x + ba.w), 0.01), h: Math.max(Math.abs(fin.cy - sy), 0.01),
            flipV: fin.cy < sy, line: { color: GRAY, width: 0.85, endArrowType: 'triangle' },
            objectName: 'Flujo|' + a.id + '|' + fin.idFin + '|right|left|' + adjFin
          });
          return;
        }
        if (aIn) {
          // Off-page derecha — letra única por arista
          const ba = nodeBoxes.get(a.id);
          const letter = edgeLetters[e.id] || '?';
          const targetSlice = laminaDeRank(ranks[b.id] || 0);
          const marcaDer = targetSlice === sliceIdx + 1 ? '↓' : ('→ ' + targetSlice);
          const cx = columnaConector(a, +1, CONN_X_DER);
          const sy = ba.y + ba.h / 2;
          const usadas = usadasEn(cx);
          let cy = reservaOffPage(usadas, sy);
          let ladoA = 'right', adjDer = [82000, 68000, 54000, 40000, 26000][(usadas.length - 1) % 5];
          if (tramoPisaCaja(ba.x + ba.w, cx - 0.18, cy, { [a.id]: 1 })) {
            const p = pasilloLibre(a, ba.cx, cx - 0.18);
            if (p) { cy = p.y; ladoA = p.lado; adjDer = 0; usadas.push(cy); }   // vertical primero
          }
          const idCirc = 'conn:' + sliceIdx + ':der:' + letter + ':' + Math.round(cy * 100);
          nombresPorNodo[idCirc] = 'Conector ' + letter + ' → ' + targetSlice;
          // La letra va DENTRO del círculo: un solo objeto que se mueve entero
          slide.addText(letter, { shape: 'ellipse', x: cx - 0.18, y: cy - 0.18, w: 0.36, h: 0.36,
            fill: { color: MAGENTA }, line: { color: 'FFFFFF', width: 1.5 }, margin: 0,
            fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: T_FONT,
            objectName: nombresPorNodo[idCirc] });
          const p1 = ladoA === 'right' ? { x: ba.x + ba.w, y: sy } : { x: ba.cx, y: ladoA === 'top' ? ba.y : ba.y + ba.h };
          slide.addShape('line', {
            x: p1.x, y: Math.min(p1.y, cy),
            w: Math.max(cx - 0.18 - p1.x, 0.01), h: Math.max(Math.abs(cy - p1.y), 0.01),
            flipV: cy < p1.y, line: { color: GRAY, width: 0.85 },
            objectName: 'Flujo|' + a.id + '|' + idCirc + '|' + ladoA + '|left|' + adjDer
          });
          slide.addText(marcaDer, { x: cx - 0.2, y: cy + 0.19, w: 0.4, h: 0.16,
            fontSize: 7, color: GRAY, italic: true, align: 'center' });
        }
        if (bIn) {
          // Un fin adelantado ya se pintó como círculo de fin en la banda de
          // origen: no se le dibuja además una entrada con letra "?".
          if (esAristaAFinAdelantado(e)) return;
          // Entrada por la izquierda — misma letra que el origen
          const bb = nodeBoxes.get(b.id);
          const letter = edgeLetters[e.id] || '?';
          const sourceSlice = laminaDeRank(ranks[a.id] || 0);
          const marcaIzq = sourceSlice === sliceIdx + 1 ? '↑' : ('← ' + sourceSlice);
          const cx = columnaConector(b, -1, CONN_X_IZQ);
          const ty = bb.y + bb.h / 2;
          const usadas = usadasEn(cx);
          let cy = reservaOffPage(usadas, ty);
          let ladoB = 'left', adjIzq = [18000, 32000, 46000, 60000, 74000][(usadas.length - 1) % 5];
          if (tramoPisaCaja(cx + 0.18, bb.x, cy, { [b.id]: 1 })) {
            const p = pasilloLibre(b, cx + 0.18, bb.cx);
            if (p) { cy = p.y; ladoB = p.lado; adjIzq = 100000; usadas.push(cy); }   // horizontal primero
          }
          const idCirc = 'conn:' + sliceIdx + ':izq:' + letter + ':' + Math.round(cy * 100);
          nombresPorNodo[idCirc] = 'Conector ' + letter + ' ← ' + sourceSlice;
          slide.addText(letter, { shape: 'ellipse', x: cx - 0.18, y: cy - 0.18, w: 0.36, h: 0.36,
            fill: { color: MAGENTA }, line: { color: 'FFFFFF', width: 1.5 }, margin: 0,
            fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: T_FONT,
            objectName: nombresPorNodo[idCirc] });
          const p2 = ladoB === 'left' ? { x: bb.x, y: ty } : { x: bb.cx, y: ladoB === 'top' ? bb.y : bb.y + bb.h };
          slide.addShape('line', {
            x: cx + 0.18, y: Math.min(cy, p2.y),
            w: Math.max(p2.x - cx - 0.18, 0.01), h: Math.max(Math.abs(cy - p2.y), 0.01),
            flipV: p2.y < cy, line: { color: GRAY, width: 0.85, endArrowType: 'triangle' },
            objectName: 'Flujo|' + idCirc + '|' + b.id + '|right|' + ladoB + '|' + adjIzq
          });
          slide.addText(marcaIzq, { x: cx - 0.19, y: cy + 0.19, w: 0.38, h: 0.16,
            fontSize: 7, color: GRAY, italic: true, align: 'center' });
        }
      });

      // Nota de conectores: a la derecha, para no pisar el pie de página
      if (slicesCount > 1) {
        slide.addText('Los círculos con letra indican continuidad entre láminas.',
          { x: 8.0, y: 6.66, w: 4.9, h: 0.2, fontSize: 7.5, color: GRAY, italic: true, align: 'right', fontFace: T_FONT });
      }
    }

    // ════════════════════════════════════════════════════════════
    // PLANIFICACIÓN EN ESCALERA
    // Un tramo de 4 columnas con un solo actor ocupaba una lámina entera y
    // usaba el 30-48 % del alto. Ahora las columnas se envuelven en BANDAS
    // apiladas: cada banda repite los carriles de su tramo y continúa la
    // secuencia. Se empaquetan tantas bandas como quepan en el alto útil.
    // ════════════════════════════════════════════════════════════
    const ranksPorBanda = ranksPerSlice;
    const ALTO_UTIL = SLIDE_DRAW_H - 0.2;
    const ALTO_FILA = 0.95;      // medido: contenido real 0,54-0,65" + aire
    const GAP_BANDA = 0.12;      // respiro entre bandas

    function medirBanda(ini, fin) {
      const lanes = new Set(); const porCelda = {}; let maxApil = 1;
      state.nodes.forEach(n => {
        const r = ranks[n.id];
        if (r == null || r < ini || r >= fin) return;
        const ln = (state._lanes && state._lanes.laneOf && state._lanes.laneOf[n.id]) || 'Por asignar';
        lanes.add(ln);
        const k = ln + '|' + r;
        porCelda[k] = (porCelda[k] || 0) + 1;
        maxApil = Math.max(maxApil, porCelda[k]);
      });
      const filas = Math.max(1, lanes.size);
      return { ini, fin, lanes: laneList.filter(l => lanes.has(l)),
               alto: filas * ALTO_FILA + (maxApil - 1) * 0.55 };
    }

    // Bandas de tramo VARIABLE. Un tramo de 4 columnas que toca 13 actores
    // necesitaria 12" de alto y se salia de la lamina; se estrecha el tramo
    // hasta que quepa, porque menos columnas tocan menos actores.
    const bandaInfo = [];
    {
      let r = 0, guarda = 0;
      while (r < totalRanks && guarda++ < 400) {
        let span = ranksPorBanda;
        let bi = medirBanda(r, Math.min(totalRanks, r + span));
        while (bi.alto > ALTO_UTIL && span > 1) {
          span = Math.max(1, Math.floor(span / 2));
          bi = medirBanda(r, Math.min(totalRanks, r + span));
        }
        bandaInfo.push(bi);
        r = bi.fin;
      }
    }
    // Mapa rango -> indice de banda (los tramos ya no son uniformes)
    const bandaIdxDeRank = {};
    bandaInfo.forEach((bi, i) => { for (let k = bi.ini; k < bi.fin; k++) bandaIdxDeRank[k] = i; });
    const saltaBandaG = (ra, rb) => bandaIdxDeRank[ra] !== bandaIdxDeRank[rb];

    // ── Fines adelantados ──
    // Una flecha que va a un FIN (sin salidas) y cruza de banda no se dibuja
    // como conector con letra + círculo de fin en la lámina siguiente: el fin
    // se pinta en el pasillo de salida de la banda de ORIGEN, con su etiqueta.
    // Pedido del usuario sobre Venta de Lotes: C y E salían de la 1/4 solo para
    // llegar a "Fin — venta no concretada" en la 2/4. Si el fin recibe flechas
    // desde varias bandas, se repite en cada una (BPMN lo permite). Solo se
    // dibuja en su propia banda si alguna flecha le llega desde ahí.
    const esFinSinSalida = (id) => {
      const n = state.nodes.find(x => x.id === id);
      return !!n && n.type === 'end' && !state.edges.some(e => e.from === id);
    };
    const esAristaAFinAdelantado = (e) => {
      const ra = ranks[e.from], rb = ranks[e.to];
      return ra != null && rb != null && e.from !== e.to && esFinSinSalida(e.to) && saltaBandaG(ra, rb);
    };
    const finSoloAdelantado = {};
    state.nodes.forEach(n => {
      if (!esFinSinSalida(n.id) || ranks[n.id] == null) return;
      const entradas = state.edges.filter(e => e.to === n.id && ranks[e.from] != null && e.from !== n.id);
      if (entradas.length && entradas.every(esAristaAFinAdelantado)) finSoloAdelantado[n.id] = true;
    });

    // Empaqueta bandas en láminas hasta agotar el alto útil
    const laminasPlan = [];
    {
      let cur = [], acc = 0;
      bandaInfo.forEach(bi => {
        const coste = bi.alto + (cur.length ? GAP_BANDA : 0);
        if (cur.length && acc + coste > ALTO_UTIL) { laminasPlan.push(cur); cur = []; acc = 0; }
        acc += coste;
        cur.push(bi);
      });
      if (cur.length) laminasPlan.push(cur);
    }
    slicesCount = laminasPlan.length;

    // Las laminas ya no son de tamano fijo: hace falta un mapa rango -> lamina
    const laminaDeBanda = {};
    laminasPlan.forEach((bs, li) => bs.forEach(bi => { laminaDeBanda[bi.ini] = li + 1; }));
    const laminaDeRank = (r) => {
      const bi = bandaInfo[bandaIdxDeRank[r]];
      return bi ? (laminaDeBanda[bi.ini] || 1) : 1;
    };

    // Letra única por arista que salta de BANDA (cubre también el salto de lámina)
    const edgeLetters = {};
    let letterIdx = 0;
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    state.edges.forEach(e => {
      const ra = ranks[e.from], rb = ranks[e.to];
      if (ra === undefined || rb === undefined) return;
      if (saltaBandaG(ra, rb) && !esAristaAFinAdelantado(e)) {
        edgeLetters[e.id] = LETTERS[letterIdx % 26];
        letterIdx++;
      }
    });

    for (let si = 0; si < slicesCount; si++) {
      const slide = pres.addSlide();
      drawProcessSlice(slide, si, laminasPlan[si]);
    }

    // ============ SLIDE 4: KPIs ============
    const s4 = pres.addSlide();
    mChrome(s4, 'KPIs sugeridos (benchmark de industria)', 'Medición');

    const kpiVals = state._kpiValues || {};
    // Prioriza KPIs capturados por el cliente; complementa con sugeridos
    const capturedIds = Object.keys(kpiVals);
    const capturedKpis = window.KPI_LIBRARY.filter(k => capturedIds.includes(k.id));
    const suggestedKpis = window.KPI_LIBRARY
      .filter(k => !capturedIds.includes(k.id) && (!state.meta.industry || k.industry === state.meta.industry || k.industry === 'Transversal'))
      .slice(0, Math.max(0, 10 - capturedKpis.length));
    const kpis = [...capturedKpis, ...suggestedKpis];

    const kpiRows = [[
      { text: 'KPI', options: { bold: true, color: 'FFFFFF', fill: { color: DARK } } },
      { text: 'Unidad', options: { bold: true, color: 'FFFFFF', fill: { color: DARK } } },
      { text: 'Benchmark', options: { bold: true, color: 'FFFFFF', fill: { color: DARK } } },
      { text: 'Actual cliente', options: { bold: true, color: 'FFFFFF', fill: { color: DARK } } },
      { text: 'Gap', options: { bold: true, color: 'FFFFFF', fill: { color: DARK } } },
      { text: 'Fuente', options: { bold: true, color: 'FFFFFF', fill: { color: DARK } } }
    ]];
    kpis.forEach(k => {
      const cap = kpiVals[k.id];
      if (cap) {
        kpiRows.push([
          k.name, k.unit, k.benchmark,
          { text: cap.value, options: { bold: true, color: 'A40037' } },
          { text: cap.gap || '—', options: { align: 'center', bold: true, color: 'A40037' } },
          cap.source || `${k.industry} · ${k.macroprocess}`
        ]);
      } else {
        kpiRows.push([
          k.name, k.unit, k.benchmark,
          { text: '— por capturar —', options: { color: '999999', italic: true } },
          { text: '—', options: { align: 'center', color: '999999' } },
          `${k.industry} · ${k.macroprocess}`
        ]);
      }
    });
    s4.addTable(kpiRows, { x: 0.4, y: 1.15, w: 12.5, fontSize: 9, fontFace: T_FONT, color: M_PRUNO, border: { type: 'solid', color: M_SEP, pt: 0.5 } });
    s4.addText(`${capturedKpis.length} KPIs capturados con data del cliente · ${suggestedKpis.length} sugeridos por industria. Benchmarks de fuentes públicas (APQC, SBS, Indecopi, OSINERGMIN, sectoriales).`, { x: 0.4, y: 6.62, w: 12.5, h: 0.3, fontSize: 9, color: GRAY, italic: true });

    // ============ SLIDE: AS-IS vs TO-BE (si existe to-be) ============
    // Snapshot ambos views para comparar
    const asisData = state.activeView === 'asis' ? { nodes: state.nodes, edges: state.edges } : state._views.asis;
    const tobeData = state.activeView === 'tobe' ? { nodes: state.nodes, edges: state.edges } : state._views.tobe;

    if (tobeData && tobeData.nodes && tobeData.nodes.length > 0 && asisData && asisData.nodes.length > 0) {
      const sl = pres.addSlide();
      mChrome(sl, 'Comparativo As-Is vs To-Be', 'Rediseño');

      // Render mini-diagramas en dos columnas
      renderMiniDiagram(sl, asisData, 0.4, 1.2, 6.2, 5.5, 'AS-IS', GRAY);
      renderMiniDiagram(sl, tobeData, 6.8, 1.2, 6.2, 5.5, 'TO-BE', MAGENTA);

      // Tabla de cambios
      const deltas = computeDeltas(asisData, tobeData);
      sl.addText('Cambios clave', { x: 0.4, y: 6.6, w: 12.5, h: 0.3, fontSize: 12, color: MAGENTA, bold: true });
      sl.addText(
        `+ ${deltas.added} actividades nuevas    ·    − ${deltas.removed} eliminadas    ·    ⟳ ${deltas.changed} modificadas    ·    Δ tipos: ${deltas.typeChanges}`,
        { x: 0.4, y: 6.62, w: 12.5, h: 0.3, fontSize: 11, color: DARK, fontFace: T_FONT });
    }

    // ============ SLIDE: SIPOC (si existe) ============
    if (state._sipoc) {
      const sl = pres.addSlide();
      mChrome(sl, 'SIPOC — alcance del proceso', 'Alcance');
      const cols = ['suppliers', 'inputs', 'process', 'outputs', 'customers'];
      const headers = ['Supplier', 'Input', 'Process', 'Output', 'Customer'];
      const colW = 2.5;
      headers.forEach((h, i) => {
        sl.addShape('rect', { x: 0.4 + i * colW, y: 1, w: colW - 0.1, h: 0.5, fill: { color: MAGENTA } });
        sl.addText(h, { x: 0.4 + i * colW, y: 1, w: colW - 0.1, h: 0.5, fontSize: 14, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle' });
      });
      cols.forEach((c, i) => {
        sl.addShape('rect', { x: 0.4 + i * colW, y: 1.55, w: colW - 0.1, h: 5, fill: { color: 'FFFFFF' }, line: { color: M_SEP, width: 0.5 } });
        sl.addText(state._sipoc[c] || '—', { x: 0.5 + i * colW, y: 1.7, w: colW - 0.3, h: 4.7, fontSize: 11, color: DARK, valign: 'top', fontFace: T_FONT });
      });
    }

    // ============ SLIDE: RACI (si existe) ============
    if (state._raci && Object.keys(state._raci).length > 0) {
      const tasks = state.nodes.filter(n => state._raci[n.id]);
      const roles = [...new Set(Object.values(state._raci).flatMap(r => Object.keys(r)))];
      if (tasks.length > 0 && roles.length > 0) {
        const sl = pres.addSlide();
        mChrome(sl, 'Matriz RACI', 'Gobierno');
        const raciRows = [[
          { text: 'Actividad', options: { bold: true, color: 'FFFFFF', fill: { color: DARK } } },
          ...roles.map(r => ({ text: r, options: { bold: true, color: 'FFFFFF', fill: { color: DARK }, align: 'center' } }))
        ]];
        tasks.slice(0, 14).forEach(t => {
          raciRows.push([t.label, ...roles.map(r => ({ text: (state._raci[t.id][r] || ''), options: { align: 'center', bold: true } }))]);
        });
        sl.addTable(raciRows, { x: 0.4, y: 1.15, w: 12.5, fontSize: 10, fontFace: T_FONT, color: M_PRUNO, border: { type: 'solid', color: M_SEP, pt: 0.5 } });
        sl.addText('R = Responsable · A = Accountable · C = Consultado · I = Informado', { x: 0.4, y: 6.62, w: 12, h: 0.3, fontSize: 9, color: GRAY, italic: true });
      }
    }

    // ============ SLIDE: SIMULADOR (si se ejecutó) ============
    if (state._simResults && state._simResults.activitiesWithData > 0) {
      const r = state._simResults;
      const fmtN = (n) => isFinite(n) ? n.toLocaleString('es-PE', { maximumFractionDigits: 1 }) : '—';
      const fmtCur = (n) => isFinite(n) ? n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }) : '—';
      const sl = pres.addSlide();
      mChrome(sl, 'Cuantificación del proceso (data-driven)', 'Simulación');

      const tiles = [
        { label: 'FTE actual', value: fmtN(r.fteCurrent), fill: 'FFFFFF', color: DARK },
        { label: 'FTE to-be', value: fmtN(r.fteToBe), fill: 'FFFFFF', color: DARK },
        { label: 'Costo mensual', value: fmtCur(r.monthlyCost), fill: 'FFFFFF', color: DARK },
        { label: 'Ahorro anual estimado', value: fmtCur(r.annualSavings), fill: MAGENTA, color: 'FFFFFF' }
      ];
      tiles.forEach((t, i) => {
        const x = 0.5 + i * 3.1;
        sl.addShape('rect', { x, y: 1.2, w: 2.9, h: 2.2, fill: { color: t.fill }, line: { color: M_SEP, width: 0.5 } });
        sl.addText(t.label, { x, y: 1.3, w: 2.9, h: 0.4, fontSize: 12, color: t.color, align: 'center', bold: true });
        sl.addText(t.value, { x, y: 1.8, w: 2.9, h: 1.3, fontSize: 28, color: t.color, align: 'center', valign: 'middle', bold: true });
      });

      sl.addText('Metodología', { x: 0.5, y: 4, w: 12, h: 0.35, fontSize: 14, color: MAGENTA, bold: true });
      sl.addText(
        `• ${r.activitiesWithData} actividades con tiempo y volumen capturados.\n` +
        `• FTE actual = Σ(tiempo × volumen) / (horas hábiles × 60).\n` +
        `• FTE to-be aplica reducción objetivo del ${Math.round((1 - r.fteToBe / Math.max(r.fteCurrent, 0.0001)) * 100)}%.\n` +
        `• Lead time del flujo (suma lineal): ${fmtN(r.leadTimeChain)} minutos.\n` +
        `• Cifras estimativas; refinar con muestreo de tiempos en sitio.`,
        { x: 0.5, y: 4.4, w: 12, h: 2.5, fontSize: 12, color: DARK, fontFace: T_FONT, paraSpaceAfter: 4 }
      );
    }

    // pptxgenjs sólo sabe dibujar líneas sueltas, y una línea suelta no sigue a
    // la caja cuando el consultor la mueve. El post-proceso las convierte en
    // conectores reales anclados a las formas (cxnSp con stCxn/endCxn), como
    // en el patrón corporativo.
    if (T.cierre) {
      // "Gracias" sobre azul con el logotipo blanco, como en la plantilla del cliente
      const sc = pres.addSlide();
      sc.background = { color: T.portadaFondo };
      sc.addImage({ data: T.logoInv, x: 6.665 - T.logoW / 2, y: 2.75, w: T.logoW, h: T.logoH });
      sc.addText('Gracias', { x: 2, y: 3.35, w: 9.33, h: 0.9, fontSize: 32, color: T.portadaTexto,
        fontFace: T_FONT_TITULO, align: 'center', valign: 'middle' });
    }
    anclarConectoresYDescargar(pres, filename('pptx'), nombresPorNodo);
  }

  // Helper: renderiza un mini-diagrama dentro de un slide PPTX en un área dada.
  // ── Post-proceso del PPTX: conectores anclados ───────────────
  // Punto de conexión por lado según la geometría. rect/roundRect/diamond
  // tienen 4 (0 arriba, 1 izquierda, 2 abajo, 3 derecha); ellipse tiene 8.
  const CXN_IDX = {
    rect: { top: 0, left: 1, bottom: 2, right: 3 },
    roundRect: { top: 0, left: 1, bottom: 2, right: 3 },
    diamond: { top: 0, left: 1, bottom: 2, right: 3 },
    parallelogram: { top: 0, left: 1, bottom: 2, right: 3 },
    ellipse: { top: 0, left: 2, bottom: 4, right: 6 }
  };
  function _xmlEsc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function anclarConectoresEnXml(xml, nombresPorNodo) {
    // id y geometría de cada forma, por nombre (ya escapado como lo escribe pptxgenjs)
    const porNombre = {};
    xml.replace(/<p:sp>([\s\S]*?)<\/p:sp>/g, (m, body) => {
      const mm = /<p:cNvPr id="(\d+)" name="([^"]*)"/.exec(body);
      const g = /<a:prstGeom prst="([^"]+)"/.exec(body);
      if (mm) porNombre[mm[2]] = { id: mm[1], prst: g ? g[1] : 'rect' };
      return m;
    });
    let n = 0;
    const out = xml.replace(/<p:sp>([\s\S]*?)<\/p:sp>/g, (m, body) => {
      const mm = /<p:cNvPr id="(\d+)" name="Flujo\|([^|"]+)\|([^|"]+)\|(\w+)\|(\w+)(?:\|(\d+))?"/.exec(body);
      if (!mm) return m;
      const id = mm[1], deId = mm[2], aId = mm[3], ladoA = mm[4], ladoB = mm[5];
      const nA = nombresPorNodo[deId], nB = nombresPorNodo[aId];
      // pptxgenjs escribe los nombres sin escapar; se prueba crudo y escapado
      const fa = nA && (porNombre[nA] || porNombre[_xmlEsc(nA)]);
      const fb = nB && (porNombre[nB] || porNombre[_xmlEsc(nB)]);
      const xfrm = (/<a:xfrm[^>]*>[\s\S]*?<\/a:xfrm>/.exec(body) || [''])[0];
      const ln = (/<a:ln[\s\S]*?<\/a:ln>/.exec(body) || [''])[0];
      if (!fa || !fb || !xfrm) return m;
      const ia = (CXN_IDX[fa.prst] || CXN_IDX.rect)[ladoA];
      const ib = (CXN_IDX[fb.prst] || CXN_IDX.rect)[ladoB];
      n++;
      return '<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="' + id + '" name="Flujo ' + _xmlEsc(nA) + ' → ' + _xmlEsc(nB) + '"/>' +
        '<p:cNvCxnSpPr><a:stCxn id="' + fa.id + '" idx="' + ia + '"/><a:endCxn id="' + fb.id + '" idx="' + ib + '"/></p:cNvCxnSpPr>' +
        '<p:nvPr/></p:nvCxnSpPr><p:spPr>' + xfrm +
        '<a:prstGeom prst="bentConnector3"><a:avLst>' +
        (mm[6] ? '<a:gd name="adj1" fmla="val ' + mm[6] + '"/>' : '') +
        '</a:avLst></a:prstGeom>' + ln + '</p:spPr></p:cxnSp>';
    });
    return { xml: out, n: n };
  }

  async function anclarConectoresYDescargar(pres, fileName, nombresPorNodo) {
    let salida = await pres.write({ outputType: 'blob' });
    let anclados = 0;
    try {
      await lazyLoadScript(CDN.jszip);
      const zip = await window.JSZip.loadAsync(salida);
      const slides = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f));
      for (const f of slides) {
        const r = anclarConectoresEnXml(await zip.file(f).async('string'), nombresPorNodo);
        if (r.n) { zip.file(f, r.xml); anclados += r.n; }
      }
      salida = await zip.generateAsync({ type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      console.info('[ProcessIQ] PPTX: ' + anclados + ' conectores anclados');
    } catch (err) {
      console.warn('[ProcessIQ] no se pudieron anclar los conectores; se descarga sin anclar', err);
    }
    state._ultimoPptx = { blob: salida, conectores: anclados };
    if (state._sinDescarga) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(salida); a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  function renderMiniDiagram(slide, data, x, y, w, h, label, accentColor) {
    slide.addShape('rect', { x, y, w, h, fill: { color: 'FAFAFA' }, line: { color: 'D0CEC1', width: 0.5 } });
    slide.addText(label, { x, y, w, h: 0.35, fontSize: 12, color: accentColor, bold: true, align: 'center' });
    if (!data.nodes.length) {
      slide.addText('(vacío)', { x, y: y + h / 2 - 0.2, w, h: 0.4, fontSize: 14, color: '999999', italic: true, align: 'center' });
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    data.nodes.forEach(n => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
    });
    const srcW = Math.max(1, maxX - minX), srcH = Math.max(1, maxY - minY);
    const padTop = 0.4, padOther = 0.2;
    const dstW = w - padOther * 2, dstH = h - padTop - padOther;
    const scale = Math.min(dstW / srcW, dstH / srcH);
    const offX = x + padOther + (dstW - srcW * scale) / 2;
    const offY = y + padTop + (dstH - srcH * scale) / 2;

    const shapeKind = { task: 'rect', system: 'rect', decision: 'diamond', start: 'ellipse', end: 'ellipse', document: 'rect', data: 'parallelogram' };
    const shapeFill = { task: 'FFFFFF', system: 'F9F9F8', decision: 'FBE1CF', start: 'D9F1DD', end: 'FFBAD1', document: 'BFFBFF', data: 'E7DFFD' };
    const shapeBorder = { task: '4F062A', system: '4F062A', decision: 'E56813', start: '44B757', end: 'A40037', document: '00B0BD', data: '8661F5' };

    data.nodes.forEach(n => {
      const nx = offX + (n.x - minX) * scale;
      const ny = offY + (n.y - minY) * scale;
      const nw = n.w * scale, nh = n.h * scale;
      slide.addShape(shapeKind[n.type] || 'rect', {
        x: nx, y: ny, w: nw, h: nh,
        fill: { color: shapeFill[n.type] || 'FFFFFF' },
        line: { color: shapeBorder[n.type] || '4F062A', width: 0.8 }
      });
      slide.addText(n.label || '', {
        x: nx, y: ny, w: nw, h: nh, fontSize: 6,
        align: 'center', valign: 'middle', color: M_PRUNO, fontFace: T_FONT
      });
    });
    data.edges.forEach(e => {
      const a = data.nodes.find(n => n.id === e.from), b = data.nodes.find(n => n.id === e.to);
      if (!a || !b) return;
      const p1x = offX + (a.x + a.w / 2 - minX) * scale;
      const p1y = offY + (a.y + a.h / 2 - minY) * scale;
      const p2x = offX + (b.x + b.w / 2 - minX) * scale;
      const p2y = offY + (b.y + b.h / 2 - minY) * scale;
      const dx = p2x - p1x, dy = p2y - p1y;
      slide.addShape('line', {
        x: Math.min(p1x, p2x), y: Math.min(p1y, p2y),
        w: Math.max(Math.abs(dx), 0.01), h: Math.max(Math.abs(dy), 0.01),
        line: { color: '926979', width: 0.5, endArrowType: 'triangle' },
        flipH: dx < 0, flipV: dy < 0
      });
    });
  }

  // Helper: compara as-is vs to-be y reporta cambios.
  function computeDeltas(asis, tobe) {
    const aLabels = new Set(asis.nodes.map(n => normLabel(n.label)));
    const tLabels = new Set(tobe.nodes.map(n => normLabel(n.label)));
    let added = 0, removed = 0, typeChanges = 0, changed = 0;
    tLabels.forEach(l => { if (!aLabels.has(l)) added++; });
    aLabels.forEach(l => { if (!tLabels.has(l)) removed++; });
    // Cambios de tipo (mismo label, distinto type)
    asis.nodes.forEach(an => {
      const tn = tobe.nodes.find(x => normLabel(x.label) === normLabel(an.label));
      if (tn && tn.type !== an.type) { typeChanges++; changed++; }
    });
    return { added, removed, changed, typeChanges };
  }

  function normLabel(s) { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }

  function painImplication(p) {
    const score = p.severity * p.frequency;
    const cat = p.category;
    if (cat === 'handoff')    return 'pérdida de contexto en traspaso entre áreas; lead time +10-15% por handoff y mayor probabilidad de errores de transmisión.';
    if (cat === 'rework')     return 'duplica esfuerzo; cada reproceso cuesta 1.5-2x el tiempo del original y degrada experiencia del cliente.';
    if (cat === 'wait')       return 'eleva lead time end-to-end sin agregar valor; típicamente 60-80% del lead time total son esperas.';
    if (cat === 'control')    return 'control duplicado entre frontline y back office; redundancia sin valor agregado.';
    if (cat === 'system')     return 'limitación tecnológica que fuerza workarounds manuales; afecta escalabilidad.';
    if (cat === 'regulatory') return 'requisito regulatorio no optimizado; oportunidad de cumplir cumplimiento con menor fricción operativa.';
    if (cat === 'manual')     return 'tarea manual repetitiva propensa a error humano; candidato directo a automatización.';
    if (cat === 'data')       return 'calidad de datos pobre que propaga errores aguas abajo; afecta reportes y decisiones.';
    return score >= 16 ? 'pain crítico que afecta el flujo end-to-end y debe priorizarse.' : 'oportunidad de mejora puntual.';
  }

  function painRecommendation(p) {
    const cat = p.category;
    const sev = p.severity;
    if (cat === 'handoff')    return sev >= 4 ? 'rediseñar con célula multifuncional o workflow orquestado (BPM).' : 'estandarizar template de traspaso (briefing estructurado).';
    if (cat === 'rework')     return 'aplicar "right first time": validar en origen + checklist + capacitación + tooling.';
    if (cat === 'wait')       return sev >= 4 ? 'paralelizar o eliminar la espera (push → pull notifications).' : 'priorizar la cola con criterios SLA/severidad.';
    if (cat === 'control')    return 'eliminar control duplicado tras análisis de riesgo, o consolidar en único punto.';
    if (cat === 'system')     return 'roadmap TI: API/integración o reemplazo de sistema. Quick win: macro/RPA puente.';
    if (cat === 'regulatory') return 'rediseñar para cumplir con menor pasos; digitalizar evidencia de cumplimiento.';
    if (cat === 'manual')     return 'automatizar con RPA si es rule-based; IDP si requiere extracción de docs; workflow si necesita orquestación.';
    if (cat === 'data')       return 'data quality at source: validaciones + master data + DQ dashboard.';
    return 'analizar root cause y diseñar contramedida específica.';
  }

  // ============================================================
  // INGEST MODAL — Audio, Notas, Event Log
  // ============================================================
  let speechRecognition = null;
  let ingestInProgress = false;

  function guardIngest(fn) {
    return function (...args) {
      if (ingestInProgress) return;
      ingestInProgress = true;
      try { fn.apply(this, args); }
      finally { setTimeout(() => { ingestInProgress = false; }, 1500); }
    };
  }

  function openIngestModal() {
    $('#ingestModal').hidden = false;
    activateIngestTab('notes');   // v3.8.4: documento/texto es el camino principal (antes abria en Audio)
  }

  function closeIngestModal() {
    $('#ingestModal').hidden = true;
    stopSpeechRecognition();
  }

  function attachIngestListeners() {
    $('#ingestClose').addEventListener('click', closeIngestModal);
    $('#ingestModal').addEventListener('click', e => {
      if (e.target.id === 'ingestModal') closeIngestModal();
    });

    $$('.itab').forEach(t => t.addEventListener('click', () => activateIngestTab(t.dataset.itab)));

    // Audio
    $('#btnRecStart').addEventListener('click', startSpeechRecognition);
    $('#btnRecStop').addEventListener('click', stopSpeechRecognition);
    $('#btnIngestAudio').addEventListener('click', () => {
      const txt = $('#audioTranscript').value.trim();
      if (!txt) { alert('No hay transcripción.'); return; }
      // v3.8.4: la transcripcion va por el MISMO camino que los documentos (IA con
      // la clave del equipo). Antes llamaba al extractor por palabras clave y
      // generaba al instante sin IA aunque la clave estuviera configurada.
      if (!sourcesList().some(x => x.texto === txt)) addSource('transcripcion', 'Transcripción de audio', txt);
      activateIngestTab('notes');   // ahi viven la barra de progreso y el cronometro
      runIngest(null);
    });

    // Selección de archivo (desde la zona de arrastrar) → flujo único
    const docInput = $('#docFileInput');
    if (docInput) {
      docInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);   // copiar ANTES de vaciar el input
        e.target.value = '';
        addFilesAsSources(files);
      });
    }

    // Cargar ejemplo demo → proceso completo pre-poblado (para demostraciones a cliente)
    const sampleBtn = $('#btnLoadSample');
    if (sampleBtn) sampleBtn.addEventListener('click', () => {
      // Abre la galería completa de ejemplos (12 demos) — accesible también con un proceso ya cargado
      closeIngestModal();
      openExamplesModal();
    });

    // CSV event log
    $('#csvFile').addEventListener('change', handleCsvFile);
    $('#btnCsvSample').addEventListener('click', loadCsvSample);
    $('#btnIngestCsv').addEventListener('click', guardIngest(() => {
      const map = {
        case: $('#mapCase').value,
        act:  $('#mapAct').value,
        ts:   $('#mapTs').value,
        res:  $('#mapRes').value
      };
      buildProcessFromEventLog(window._csvData, map);
      closeIngestModal();
    }));
  }

  function activateIngestTab(name) {
    $$('.itab').forEach(t => t.classList.toggle('active', t.dataset.itab === name));
    $$('.ipanel').forEach(p => p.classList.toggle('active', p.dataset.ipanel === name));
  }

  // ----------- Speech recognition (Web Speech API) -----------
  function startSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge. También puedes pegar la transcripción manualmente.');
      return;
    }
    speechRecognition = new SR();
    speechRecognition.lang = 'es-PE';
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;

    const ta = $('#audioTranscript');
    let finalText = ta.value;

    speechRecognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      ta.value = finalText + interim;
    };

    speechRecognition.onerror = (e) => {
      $('#recStatus').textContent = 'Error: ' + e.error;
      $('#recStatus').classList.remove('recording');
    };

    speechRecognition.onend = () => {
      $('#recStatus').textContent = 'detenido';
      $('#recStatus').classList.remove('recording');
      $('#btnRecStart').disabled = false;
      $('#btnRecStop').disabled = true;
    };

    speechRecognition.start();
    $('#recStatus').textContent = 'grabando…';
    $('#recStatus').classList.add('recording');
    $('#btnRecStart').disabled = true;
    $('#btnRecStop').disabled = false;
  }

  function stopSpeechRecognition() {
    if (speechRecognition) { try { speechRecognition.stop(); } catch (e) {} speechRecognition = null; }
    $('#recStatus').textContent = 'listo';
    $('#recStatus').classList.remove('recording');
    $('#btnRecStart').disabled = false;
    $('#btnRecStop').disabled = true;
  }

  // ============================================================
  // INGESTA MULTI-FORMATO — Word / PDF / PowerPoint / texto / BPMN
  // Los formatos habituales de un proyecto de procesos. Word/PDF/PPTX se
  // extraen a texto (para revisar antes de generar); BPMN/XML se importan
  // como diagrama directo. Las librerías pesadas (mammoth/pdf.js/JSZip) se
  // cargan bajo demanda desde CDN sólo cuando el usuario sube ese formato.
  // ============================================================
  const CDN = {
    mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
    pdfjs:   'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs',
    pdfWorker:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs',
    jszip:   'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
  };
  const _loadedScripts = {};
  function lazyLoadScript(url) {
    if (_loadedScripts[url]) return _loadedScripts[url];
    _loadedScripts[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar ' + url + ' (¿sin conexión o CDN bloqueado?)'));
      document.head.appendChild(s);
    });
    return _loadedScripts[url];
  }
  function ingestStatus(msg, ok) {
    const el = $('#docFileName');
    if (el) el.textContent = msg;
  }

  // ---- Progreso visible + cancelación (evita que la app "parezca muerta") ----
  let ingestAbort = null;             // { cancelled: bool, controller: AbortController }
  const MAX_FILE_MB = 40;             // por encima de esto avisamos antes de intentar
  const MAX_PDF_PAGES = 120;          // tope de páginas a extraer
  // Lo que enviamos al modelo (~45-50K tokens). v3.8.5: de 60K a 180K para que
  // quepa un levantamiento con varios documentos; el otro limite es la
  // RESPUESTA (64K tokens), no la entrada.
  const MAX_AI_CHARS = 180000;
  function ingestBusy(on) {
    const box = $('#ingestProgress');
    if (box) {
      box.hidden = !on;
      // La barra vive mas arriba que el boton: se trae a la vista para que el
      // usuario vea que la app esta trabajando sin tener que desplazarse.
      if (on) { try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {} }
    }
    const btn = $('#btnIngestGo');
    if (btn) {
      btn.disabled = !!on;
      // Feedback en el mismo boton que se pulso: spinner + "Generando…". Se
      // guarda la etiqueta anterior porque renderSources la cambia
      // ("Combinar N fuentes y generar").
      const lbl = btn.querySelector('.go-label');
      if (on && !btn.classList.contains('is-busy')) {
        btn.classList.add('is-busy');
        if (lbl) { btn.dataset.labelPrevia = lbl.textContent; lbl.textContent = 'Generando…'; }
      } else if (!on && btn.classList.contains('is-busy')) {
        btn.classList.remove('is-busy');
        if (lbl && btn.dataset.labelPrevia) lbl.textContent = btn.dataset.labelPrevia;
      }
    }
  }
  function ingestProgress(msg, pct) {
    const t = $('#ingestProgressText');
    if (t) t.textContent = msg;
    const bar = $('#ingestProgressBar');
    if (bar) {
      const indeterminate = (pct == null);
      bar.classList.toggle('indeterminate', indeterminate);
      bar.style.width = indeterminate ? '100%' : Math.max(2, Math.min(100, pct)) + '%';
    }
  }
  // Cede el hilo para que el navegador repinte (si no, la UI se congela)
  const uiTick = () => new Promise(r => setTimeout(r, 0));
  function throwIfCancelled() {
    if (ingestAbort && ingestAbort.cancelled) throw new Error('CANCELLED');
  }
  // Cronometro del trabajo: con documentos largos la IA tarda uno o dos
  // minutos, y un contador que avanza distingue "trabajando" de "colgada".
  let ingestReloj = null;
  function startIngestJob() {
    ingestAbort = { cancelled: false, controller: new AbortController() };
    ingestBusy(true);
    const t0 = Date.now(), el = $('#ingestElapsed');
    clearInterval(ingestReloj);
    if (el) el.textContent = '0:00';
    ingestReloj = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      if (el) el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
    return ingestAbort;
  }
  function endIngestJob() {
    ingestAbort = null;
    ingestBusy(false);
    clearInterval(ingestReloj); ingestReloj = null;
    const el = $('#ingestElapsed'); if (el) el.textContent = '';
  }
  function cancelIngestJob() {
    if (!ingestAbort) return;
    ingestAbort.cancelled = true;
    try { ingestAbort.controller.abort(); } catch (_) {}
    ingestProgress('Cancelando…', null);
  }

  function readFileAs(file, how) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      if (how === 'arraybuffer') r.readAsArrayBuffer(file); else r.readAsText(file, 'utf-8');
    });
  }

  // ============================================================
  // FLUJO ÚNICO DE INGESTA — "suelta el archivo y listo"
  // Extrae -> interpreta (IA si hay key, si no heurístico) -> dibuja.
  // Todo con progreso visible y botón Cancelar, cediendo el hilo para
  // que la UI nunca parezca congelada.
  // ============================================================
  async function runIngest(source) {
    if (ingestAbort) return;                       // ya hay un trabajo corriendo
    state._ultimoCosteIa = null;
    startIngestJob();
    const t0 = Date.now();
    try {
      let text = '', label = 'documento';

      if (source && source.file) {
        ingestProgress('Abriendo ' + source.file.name + '...', 2);
        await uiTick();
        const r = await extractFileText(source.file);
        if (r.kind === 'bpmn' && sourcesList().length > 0) {
          const desc = describeCurrentProcessAsText();
          if (desc) addSource('diagrama', r.name, 'Diagrama existente del proceso:' + String.fromCharCode(10) + desc);
          ingestProgress('Diagrama anadido como fuente', 100);
          endIngestJob();
          return;
        }
        if (r.kind === 'bpmn') {
          ingestProgress('Diagrama importado', 100);
          closeIngestModal();
          maybeFitOnLoad();
          activateTab('ficha');
          copilotPost('ai', '**BPMN importado desde ' + escapeHtml(r.name) + ':** ' + r.result.count + ' elementos (' + r.result.tasks + ' actividades, ' + r.result.gateways + ' compuertas, ' + r.result.events + ' eventos) y ' + r.result.flows + ' flujos.');
          return;
        }
        const tipo = /transcrip|audio|reunion|llamada|teams|zoom/i.test(r.name) ? 'transcripcion' : 'documento';
        addSource(tipo, r.name, r.text);
        if (source.addOnly) {
          ingestProgress('Fuente anadida: ' + r.name, 100);
          endIngestJob();
          return;
        }
        text = combinedSourceText();
        label = sourcesList().length > 1 ? (sourcesList().length + ' fuentes combinadas') : r.name;
      } else {
        const pegado = ($('#notesInput').value || '').trim();
        if (pegado && !sourcesList().some(x => x.texto === pegado)) addSource('texto', 'Texto pegado', pegado);
        text = sourcesList().length ? combinedSourceText() : pegado;
        label = sourcesList().length > 1 ? (sourcesList().length + ' fuentes combinadas') : 'texto pegado';
      }
      throwIfCancelled();
      if (!text) throw new Error('No hay texto que interpretar. Carga un archivo o pega el texto del proceso.');

      // La IA es el camino por defecto. Si este navegador aun no tiene el codigo
      // del equipo (ni clave propia) se pide AHORA, en vez de caer en silencio al
      // modo basico; quien no lo tenga sigue en modo basico a sabiendas.
      if (!aiReady()) {
        ingestBusy(false);
        const codigo = await pedirCodigoEquipo();
        ingestBusy(true);
        if (codigo) {
          const c = aiConfig();
          saveAiConfig(Object.assign({}, c, { modo: 'equipo', codigo: codigo,
            proxyUrl: c.proxyUrl || PROXY_POR_DEFECTO, model: c.model || 'claude-opus-5' }));
          updateAiUi();
        }
      }
      const useAi = aiReady();
      ingestProgress(
        useAi ? 'Interpretando con IA ' + text.length.toLocaleString('es-PE') + ' caracteres... (puede tardar hasta 1 min)'
              : 'Analizando ' + text.length.toLocaleString('es-PE') + ' caracteres...',
        useAi ? null : 80);
      await uiTick();

      if (useAi) {
        let roles = null;
        const personas = detectParticipants(text);
        if (personas.length) {
          ingestProgress('Participantes detectados: ' + personas.length + '. Definiendo roles...', null);
          ingestBusy(false);
          roles = await askParticipantRoles(personas);
          ingestBusy(true);
          ingestProgress('Interpretando con IA...', null);
        }
        ingestBusy(false);
        const vista = await askProfundidad({ chars: text.length });
        ingestBusy(true);
        ingestProgress('Interpretando con IA...', null);
        const spec = await aiBuildProcess(text, label, (m) => ingestProgress(m, null), { roles, vista });
        throwIfCancelled();
        if (vista < 3) aplicarNivel(vista, { silent: true });
        ingestProgress('Proceso generado con IA', 100);
        closeIngestModal();
        maybeFitOnLoad();
        activateTab('ficha');
        renderFichaTab();
        const n = (spec.nodes || []).length;
        copilotPost('ai', `**Proceso interpretado con IA desde ${escapeHtml(label)}.** ${n} elementos con roles, sistemas y decisiones. Revisa el diagrama y completa la pestaña **Ficha**; luego exporta a **Ficha de Proceso**.` +
          (text.length > MAX_AI_CHARS ? `\n\nNota: el documento excedía ${(MAX_AI_CHARS / 1000) | 0}K caracteres, interpreté la primera parte. Si falta el final del proceso, pega esa sección y vuelve a generar.` : '') + lineaCosteIa());
      } else {
        buildProcessFromText(text, label);
        ingestProgress('Proceso generado', 100);
        closeIngestModal();
        maybeFitOnLoad();
        // Que nunca se confunda con una interpretacion por IA
        copilotPost('ai', '**Proceso generado en modo básico (sin IA)** desde ' + escapeHtml(label) +
          '. Las actividades se extrajeron por palabras clave: revisa roles y decisiones. ' +
          'Para interpretarlo con Claude, pon el código del equipo en Ajustes de IA (✨) y vuelve a generar.');
      }
      console.info('[ProcessIQ] ingesta OK en', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    } catch (err) {
      if (String(err.message) === 'CANCELLED' || err.name === 'AbortError') {
        ingestProgress('Cancelado.', 0);
        setTimeout(() => ingestBusy(false), 900);
      } else {
        console.error('[ProcessIQ] ingesta:', err);
        // Aunque falle (p. ej. respuesta cortada), lo consumido se cobra: se dice
        if (state._ultimoCosteIa) err = new Error((err.message || err) + '\n\nEsta ejecución igual consumió ' + fmtUsd(state._ultimoCosteIa.usd) + ' a precio de lista.');
        ingestProgress('', 0);
        ingestBusy(false);
        alert('No se pudo completar:\n\n' + (err.message || err));
      }
    } finally {
      if (ingestAbort) endIngestJob();
    }
  }

  // Compatibilidad: el input de archivo entra por aquí
  async function ingestDocFile(file) { return runIngest({ file }); }

  // Extrae texto de cualquier formato soportado (con progreso).
  // Devuelve { kind:'bpmn', result } cuando el archivo es un diagrama importable.
  async function extractFileText(file) {
    const name = file.name || 'documento';
    const ext = (name.split('.').pop() || '').toLowerCase();

    // Guardia de tamaño: avisa ANTES de intentar y colgar el navegador
    const mb = file.size / (1024 * 1024);
    if (mb > MAX_FILE_MB) {
      throw new Error('El archivo pesa ' + mb.toFixed(1) + ' MB (máximo ' + MAX_FILE_MB + ' MB). Divídelo o exporta solo el capítulo del proceso.');
    }
    // ---- BPMN / XML: import directo del diagrama ----
    if (ext === 'bpmn' || ext === 'xml') {
      ingestProgress('Importando diagrama BPMN...', 40);
      await uiTick();
      const xml = await readFileAs(file, 'text');
      const res = importBpmnXml(xml);
      if (!res || !res.count) throw new Error('No se encontraron elementos BPMN (actividades, eventos o compuertas) en el archivo.');
      return { kind: 'bpmn', result: res, name };
    }

    // ---- Formatos que se convierten a texto ----
    {
      let text = '';
      if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'text') {
        ingestProgress('Leyendo el archivo...', 30);
        await uiTick();
        text = await readFileAs(file, 'text');
      } else if (ext === 'docx') {
        ingestProgress('Abriendo el documento Word...', 15);
        await uiTick();
        await lazyLoadScript(CDN.mammoth);
        throwIfCancelled();
        ingestProgress('Extrayendo texto del Word...', 45);
        await uiTick();
        const buf = await readFileAs(file, 'arraybuffer');
        const out = await window.mammoth.extractRawText({ arrayBuffer: buf });
        text = out.value || '';
      } else if (ext === 'doc') {
        // .doc binario antiguo: intento de lectura best-effort (texto embebido)
        const raw = await readFileAs(file, 'text');
        text = raw.replace(/[^\x09\x0A\x0D\x20-\x7E -ɏ]+/g, ' ').replace(/\s{3,}/g, '\n').trim();
        if (text.length < 40) throw new Error('El formato .doc antiguo no se pudo leer. Guárdalo como .docx o PDF y reintenta.');
      } else if (ext === 'pdf') {
        text = await extractPdfText(file);
      } else if (ext === 'pptx') {
        ingestProgress('Abriendo la presentación...', 15);
        await uiTick();
        text = await extractPptxText(file);
      } else if (ext === 'ppt') {
        throw new Error('El formato .ppt antiguo no es compatible. Guárdalo como .pptx y reintenta.');
      } else {
        throw new Error('Formato no soportado: .' + ext + '. Admite Word, PDF, PowerPoint, texto y BPMN.');
      }

      text = (text || '').trim();
      if (!text) throw new Error('No se pudo extraer texto del documento.');
      return { kind: 'text', text, name };
    }
  }

  async function extractPdfText(file) {
    // pdf.js se importa como módulo ESM (la primera vez tarda ~4s: avisamos)
    if (!window._pdfjsLib) {
      ingestProgress('Cargando el lector de PDF (solo la primera vez)…', null);
      await uiTick();
      window._pdfjsLib = await import(/* @vite-ignore */ CDN.pdfjs);
      try { window._pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker; } catch (_) {}
    }
    throwIfCancelled();
    ingestProgress('Leyendo el archivo…', 3);
    await uiTick();
    const buf = await readFileAs(file, 'arraybuffer');
    throwIfCancelled();
    let pdf;
    try {
      pdf = await window._pdfjsLib.getDocument({ data: buf }).promise;
    } catch (e) {
      if (/password/i.test(e.message || '')) throw new Error('El PDF está protegido con contraseña. Quítasela y reintenta.');
      throw new Error('El PDF está dañado o no se puede abrir. Prueba a reguardarlo desde el visor (Archivo → Guardar como) y reintenta.');
    }
    const total = pdf.numPages;
    const maxPages = Math.min(total, MAX_PDF_PAGES);
    const out = [];
    for (let i = 1; i <= maxPages; i++) {
      throwIfCancelled();
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Reagrupa por líneas usando la coordenada Y
      let lastY = null, line = [];
      const lines = [];
      content.items.forEach(it => {
        const y = it.transform ? Math.round(it.transform[5]) : 0;
        if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(line.join('')); line = []; }
        line.push(it.str); lastY = y;
      });
      if (line.length) lines.push(line.join(''));
      out.push(lines.join('\n'));
      // Progreso real + cede el hilo cada página para que la UI respire
      ingestProgress(`Extrayendo texto… página ${i} de ${maxPages}`, 3 + (i / maxPages) * 62);
      if (i % 3 === 0 || i === maxPages) await uiTick();
    }
    const text = out.join('\n\n').trim();
    // PDF escaneado = sin capa de texto → mensaje claro en vez de un error genérico
    if (text.replace(/\s/g, '').length < 40) {
      throw new Error(`El PDF no tiene texto seleccionable (parece escaneado o son imágenes). Necesita OCR: ábrelo en Acrobat → "Reconocer texto", o pega el texto a mano.`);
    }
    if (total > maxPages) {
      out.push(`\n[… documento truncado: se procesaron ${maxPages} de ${total} páginas]`);
      return out.join('\n\n');
    }
    return text;
  }

  async function extractPptxText(file) {
    await lazyLoadScript(CDN.jszip);
    const buf = await readFileAs(file, 'arraybuffer');
    const zip = await window.JSZip.loadAsync(buf);
    // Ordena las slides por número (slide1.xml, slide2.xml, …)
    const slideNames = Object.keys(zip.files)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => (parseInt(a.match(/(\d+)/)[1], 10)) - (parseInt(b.match(/(\d+)/)[1], 10)));
    const out = [];
    for (let i = 0; i < slideNames.length; i++) {
      const xml = await zip.files[slideNames[i]].async('string');
      // Extrae el texto de los nodos <a:t>…</a:t>
      const texts = [];
      xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (m, t) => { texts.push(t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')); return m; });
      const slideText = texts.join('\n').trim();
      if (slideText) out.push(`--- Slide ${i + 1} ---\n${slideText}`);
    }
    return out.join('\n\n');
  }

  // ----------- Importador BPMN 2.0 (nativo, sin librerías) -----------
  function importBpmnXml(xmlString) {
    const doc = new DOMParser().parseFromString(xmlString, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('El XML no es válido.');
    // Selector tolerante a prefijos de namespace (bpmn:, ns0:, sin prefijo…)
    const local = (tag) => Array.from(doc.getElementsByTagName('*')).filter(el => el.localName === tag);
    const flowEls = ['task', 'userTask', 'serviceTask', 'manualTask', 'sendTask', 'receiveTask', 'scriptTask', 'businessRuleTask', 'callActivity', 'subProcess'];
    const gwEls = ['exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'complexGateway', 'eventBasedGateway'];
    const evStart = ['startEvent'], evEnd = ['endEvent'], evInt = ['intermediateCatchEvent', 'intermediateThrowEvent', 'boundaryEvent'];

    const idMap = {};        // bpmn id → nuevo node id
    const nameById = {};
    let tasks = 0, gateways = 0, events = 0;

    const execFor = (tag) => ({
      userTask: 'manual', serviceTask: 'system', manualTask: 'manual',
      sendTask: 'email', receiveTask: 'email', scriptTask: 'automatic', businessRuleTask: 'system'
    }[tag] || 'manual');
    const gwType = (tag) => ({
      exclusiveGateway: 'exclusive', parallelGateway: 'parallel', inclusiveGateway: 'inclusive',
      complexGateway: 'inclusive', eventBasedGateway: 'exclusive'
    }[tag] || 'exclusive');

    const addNode = (el, type, extra) => {
      const def = SHAPE_DEFAULTS[type] || SHAPE_DEFAULTS.task;
      const bpmnId = el.getAttribute('id') || ('bp' + state.nextId);
      const label = (el.getAttribute('name') || '').trim() || (type === 'start' ? 'Inicio' : type === 'end' ? 'Fin' : def.label);
      const node = Object.assign({
        id: 'n' + (state.nextId++), type, x: 0, y: 0, w: def.w, h: def.h,
        label, executionType: type === 'task' || type === 'system' ? (extra.exec || 'manual') : '',
        gatewayType: extra.gatewayType, eventType: extra.eventType, throw: extra.throw,
        activityCode: '', owner: '', system: '', time: '', volume: '', va: '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: []
      }, {});
      idMap[bpmnId] = node.id; nameById[bpmnId] = label;
      state.nodes.push(node);
      return node;
    };

    resetState();

    // Tareas / actividades
    flowEls.forEach(tag => local(tag).forEach(el => {
      const isSub = tag === 'subProcess' || tag === 'callActivity';
      addNode(el, 'task', { exec: execFor(tag) });
      const nd = state.nodes[state.nodes.length - 1];
      if (isSub) nd.marker = 'subprocess';
      if (tag === 'serviceTask' || tag === 'scriptTask' || tag === 'businessRuleTask') nd.type = 'task';
      tasks++;
    }));
    // Gateways
    gwEls.forEach(tag => local(tag).forEach(el => { addNode(el, 'decision', { gatewayType: gwType(tag) }); gateways++; }));
    // Eventos
    evStart.forEach(tag => local(tag).forEach(el => { addNode(el, 'start', {}); events++; }));
    evEnd.forEach(tag => local(tag).forEach(el => { addNode(el, 'end', {}); events++; }));
    evInt.forEach(tag => local(tag).forEach(el => {
      const isThrow = tag === 'intermediateThrowEvent';
      addNode(el, 'intermediate', { throw: isThrow || undefined }); events++;
    }));

    // Flujos de secuencia
    let flows = 0;
    local('sequenceFlow').forEach(el => {
      const from = idMap[el.getAttribute('sourceRef')];
      const to = idMap[el.getAttribute('targetRef')];
      if (!from || !to) return;
      const label = (el.getAttribute('name') || '').trim();
      state.edges.push({ id: 'e' + (state.nextId++), from, to, label });
      flows++;
    });

    // Metadatos: nombre del proceso
    const proc = local('process')[0];
    const procName = proc && (proc.getAttribute('name') || '').trim();
    if (procName) { state.meta.name = procName; const el = $('#processName'); if (el) el.value = procName; }
    state.ficha = state.ficha || emptyFicha();

    const count = tasks + gateways + events;
    if (count === 0) return { count: 0 };

    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    // El flujo recien importado es el modelo COMPLETO: de el cuelgan las vistas
    // por nivel. Sin esto, colapsar a ejecutivo no tendria de donde recuperar.
    state.meta.nivelVista = 3;
    fijarModeloCompleto();
    actualizarSelectorNivel();
    persist();
    return { count, tasks, gateways, events, flows };
  }

  // ============================================================
  // MOTOR DE IA — Anthropic API (BYOK, llamada directa desde el navegador)
  // La API key la pone el usuario en Ajustes y se guarda SOLO en su navegador
  // (localStorage). Nunca viaja a ningún servidor nuestro. Usa el header
  // anthropic-dangerous-direct-browser-access para permitir la llamada CORS.
  // ============================================================
  const AI_KEY = 'processiq.ai';
  // Intermediario con la clave central (worker/processiq-api.js, Cloudflare).
  const PROXY_POR_DEFECTO = 'https://api.mbc-latam.com';
  const AI_MODELS = [
    { id: 'claude-opus-5', label: 'Claude Opus — máxima calidad de interpretación' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet — rápido y económico' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku — ultrarrápido, tareas simples' }
  ];
  function aiConfig() { try { return JSON.parse(localStorage.getItem(AI_KEY)) || {}; } catch (e) { return {}; } }
  function saveAiConfig(c) { try { localStorage.setItem(AI_KEY, JSON.stringify(c)); } catch (e) {} }

  // ---- Coste por ejecucion (v3.8.6) ----
  // Precios de LISTA por millon de tokens, en US$ (referencia oficial de la API
  // de Claude, tabla del 24-jun-2026). El respaldo automatico de Opus 5 usa
  // modelos de la misma tarifa. Si Anthropic cambia precios, se actualiza aqui.
  const PRECIOS_IA = {
    'claude-opus-5':    { entrada: 5, salida: 25, nombre: 'Claude Opus 5' },
    'claude-sonnet-5':  { entrada: 2, salida: 10, nombre: 'Claude Sonnet 5' },
    'claude-haiku-4-5': { entrada: 1, salida: 5,  nombre: 'Claude Haiku 4.5' }
  };
  const COSTES_KEY = 'processiq.ia.costes';
  const GEN_MAX_TOKENS = 64000;            // tope de respuesta de la generacion (aiBuildProcess)
  // Supuestos SOLO hasta tener ejecuciones reales en este navegador: ~3
  // caracteres por token en espanol y un rango de tokens de SALIDA por nivel
  // (la salida incluye el razonamiento de la IA, que se cobra como salida).
  const CAR_POR_TOKEN_INICIAL = 3;
  const SALIDA_INICIAL = { 1: [5000, 15000], 2: [10000, 30000], 3: [20000, 50000] };

  function precioModelo(m) { return PRECIOS_IA[m] || PRECIOS_IA['claude-opus-5']; }
  function usd(tokensEntrada, tokensSalida, modelo) {
    const p = precioModelo(modelo);
    return (tokensEntrada * p.entrada + tokensSalida * p.salida) / 1e6;
  }
  function fmtUsd(v) { return 'US$ ' + (v < 0.1 ? v.toFixed(3) : v.toFixed(2)); }
  function historialCostes() { try { return JSON.parse(localStorage.getItem(COSTES_KEY)) || []; } catch (e) { return []; } }
  function registrarCoste(r) {
    try { const h = historialCostes(); h.push(r); localStorage.setItem(COSTES_KEY, JSON.stringify(h.slice(-20))); } catch (e) {}
  }
  const mediana = (a) => { const s = a.slice().sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

  // Coste ANTES de generar: rango probable + maximo posible. El maximo es
  // exacto (entrada + el tope completo de respuesta); el rango es estimado y
  // se calibra con las ejecuciones reales guardadas en este navegador.
  function estimarCosteGeneracion(charsTexto, nivel, modeloElegido) {
    const modelo = modeloElegido || aiConfig().model || 'claude-opus-5';
    const charsEntrada = Math.min(charsTexto, MAX_AI_CHARS) + AI_SYSTEM.length + 800;   // +800: reglas de fusion y profundidad
    const h = historialCostes().filter(x => x.modelo === modelo && x.entrada > 0 && x.chars > 0);
    const carPorToken = h.length ? mediana(h.map(x => x.chars / x.entrada)) : CAR_POR_TOKEN_INICIAL;
    const entrada = Math.round(charsEntrada / carPorToken);
    const delNivel = h.filter(x => x.nivel === nivel && x.salida > 0);
    let salida;
    if (delNivel.length) {
      // salida por token de entrada observada en este nivel, aplicada a este texto, +-30%
      const ratio = mediana(delNivel.map(x => x.salida / x.entrada));
      salida = [entrada * ratio * 0.7, entrada * ratio * 1.3];
    } else {
      salida = SALIDA_INICIAL[nivel] || SALIDA_INICIAL[2];
    }
    salida = salida.map(t => Math.round(Math.min(GEN_MAX_TOKENS, Math.max(500, t))));
    return {
      modelo, precio: precioModelo(modelo), entrada, salida, muestras: delNivel.length,
      min: usd(entrada, salida[0], modelo), max: usd(entrada, salida[1], modelo),
      tope: usd(entrada, GEN_MAX_TOKENS, modelo)
    };
  }
  function lineaCosteIa() {
    const c = state._ultimoCosteIa;
    return c ? '\n\nCoste de esta ejecución: **' + fmtUsd(c.usd) + '** (' + c.entrada.toLocaleString('es-PE') +
      ' tokens de entrada y ' + c.salida.toLocaleString('es-PE') + ' de salida, precio de lista de ' +
      precioModelo(c.modelo).nombre + ').' : '';
  }
  // Lista si hay forma de llegar a Claude: codigo de equipo (intermediario)
  // o clave propia. Sin 'modo' guardado se asume clave propia (configs viejas).
  function aiReady() {
    const c = aiConfig();
    return c.modo === 'equipo' ? !!(c.codigo || '').trim() : !!(c.key || '').trim();
  }

  async function callClaude(userText, opts) {
    opts = opts || {};
    const cfg = aiConfig();
    const equipo = cfg.modo === 'equipo';
    const key = (cfg.key || '').trim(), codigo = (cfg.codigo || '').trim();
    if (equipo && !codigo) throw new Error('Falta el código de acceso del equipo. Configúralo en Ajustes de IA (✨).');
    if (!equipo && !key) throw new Error('Falta la API key. Configúrala en Ajustes de IA (✨).');
    // Modo equipo: la clave NO sale del intermediario; aqui solo viaja el codigo.
    const destino = equipo
      ? (cfg.proxyUrl || PROXY_POR_DEFECTO).replace(/\/+$/, '') + '/v1/messages'
      : 'https://api.anthropic.com/v1/messages';
    const cabeceras = equipo
      ? { 'content-type': 'application/json', 'x-processiq-code': codigo }
      : { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true' };
    const body = {
      model: cfg.model || 'claude-opus-5',
      max_tokens: opts.maxTokens || 16000,
      messages: [{ role: 'user', content: userText }]
    };
    if (opts.system) body.system = opts.system;
    if (opts.effort) body.output_config = { effort: opts.effort };
    // Si los clasificadores de seguridad declinan, la API repite la peticion
    // con el modelo de respaldo recomendado dentro de la misma llamada. En modo
    // equipo la cabecera beta la pone el intermediario.
    if (String(body.model).indexOf('claude-opus-5') === 0) body.fallbacks = 'default';
    if (body.fallbacks && !equipo) cabeceras['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    // STREAMING (SSE). Con el razonamiento de Opus 5 activo y documentos largos,
    // una respuesta de 16-32K tokens puede tardar minutos: sin streaming se
    // cortaba a los 180 s. En streaming los datos fluyen desde el primer
    // segundo, asi que el limite es de INACTIVIDAD (90 s sin recibir nada), no
    // de duracion total. El boton Cancelar sigue abortando durante la lectura.
    body.stream = true;
    const ctrl = new AbortController();
    const timeoutMs = opts.timeoutMs || 90000;
    let timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const rearmar = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), timeoutMs); };
    const onCancel = () => ctrl.abort();
    if (ingestAbort) ingestAbort.controller.signal.addEventListener('abort', onCancel);
    const limpiar = () => {
      clearTimeout(timer);
      if (ingestAbort) { try { ingestAbort.controller.signal.removeEventListener('abort', onCancel); } catch (_) {} }
    };
    // v3.8.9: un fallo de RED al conectar (DNS, un corte de un segundo, un
    // proxy que descarta la primera conexion) suele ser pasajero. Antes se
    // mostraba el error a la primera; ahora se reintenta UNA vez tras una
    // breve espera. No aplica a un aborto por cancelacion o inactividad.
    const conectar = async (intento) => {
      try {
        return await fetch(destino, { method: 'POST', headers: cabeceras, body: JSON.stringify(body), signal: ctrl.signal });
      } catch (e) {
        if (e.name !== 'AbortError' && intento === 1) {
          await new Promise(r => setTimeout(r, 1200));
          throwIfCancelled();
          return conectar(2);
        }
        throw e;
      }
    };
    let res;
    try {
      res = await conectar(1);
    } catch (e) {
      limpiar();
      if (String(e.message) === 'CANCELLED') throw e;
      if (e.name === 'AbortError') {
        if (ingestAbort && ingestAbort.cancelled) throw new Error('CANCELLED');
        throw new Error('La IA tardó más de ' + Math.round(timeoutMs / 1000) + 's y se canceló. Prueba con un documento más corto o con el modelo Sonnet (más rápido) en Ajustes de IA.');
      }
      // "Failed to fetch" no distingue la causa (asi lo oculta el navegador por
      // seguridad): puede ser un corte de conexion, un proxy corporativo, un
      // bloqueador de anuncios/privacidad, o el servicio caido. Ya se reintento
      // una vez antes de llegar aqui.
      throw new Error(equipo
        ? 'No se pudo conectar con el servicio de IA (' + destino.replace('/v1/messages', '') + ') tras dos intentos. Puede ser un corte de conexión, un proxy corporativo o un bloqueador de anuncios/privacidad del navegador. Vuelve a intentarlo; si persiste, prueba desde otra red. (' + e.message + ')'
        : 'No se pudo conectar con Anthropic tras dos intentos. Revisa tu conexión a internet. (' + e.message + ')');
    }
    if (!res.ok) {
      let msg = 'Error ' + res.status;
      try { const j = await res.json(); msg += ': ' + (j.error?.message || JSON.stringify(j).slice(0, 200)); } catch (_) {}
      if (res.status === 401) msg = equipo ? 'Código de acceso del equipo incorrecto (401). Revísalo en Ajustes de IA.'
                                           : 'API key inválida o revocada (401). Revísala en Ajustes de IA.';
      if (res.status === 403 && equipo) msg = 'El intermediario rechazó este origen (403): abre la app desde procesos.mbc-latam.com.';
      if (res.status === 429) msg = 'Límite de uso alcanzado (429). Espera unos segundos y reintenta.';
      limpiar();
      throw new Error(msg);
    }

    // Lectura del stream: se acumulan solo los deltas de TEXTO (el razonamiento
    // llega en bloques thinking y se ignora). Si aparece un bloque 'fallback',
    // el modelo de respaldo repite la respuesta entera: lo recibido hasta ahi se
    // descarta para no mezclar dos JSON.
    let texto = '', stop = null, errorSse = null, buf = '';
    // Consumo real (v3.8.6): message_start trae los tokens de entrada y
    // message_delta el acumulado de salida. Se toma el maximo por si llegan en ambos.
    const uso = { modelo: body.model, entrada: 0, salida: 0 };
    const tokensEntrada = (u) => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const lector = res.body.getReader();
    const dec = new TextDecoder();
    try {
      for (;;) {
        const paso = await lector.read();
        if (paso.done) break;
        rearmar();
        buf += dec.decode(paso.value, { stream: true }).replace(/\r\n/g, '\n');
        let corte;
        while ((corte = buf.indexOf('\n\n')) !== -1) {
          const evento = buf.slice(0, corte);
          buf = buf.slice(corte + 2);
          const linea = evento.split('\n').find(l => l.indexOf('data:') === 0);
          if (!linea) continue;
          let d;
          try { d = JSON.parse(linea.slice(5).trim()); } catch (_) { continue; }
          if (d.type === 'message_start' && d.message) {
            if (d.message.usage) uso.entrada = Math.max(uso.entrada, tokensEntrada(d.message.usage));
            if (d.message.model) uso.modelo = d.message.model;
          } else if (d.type === 'content_block_start' && d.content_block && d.content_block.type === 'fallback') {
            texto = '';
          } else if (d.type === 'content_block_delta' && d.delta && d.delta.type === 'text_delta') {
            texto += d.delta.text;
            if (opts.onProgress) opts.onProgress(texto.length);
          } else if (d.type === 'message_delta') {
            if (d.delta && d.delta.stop_reason) stop = d.delta.stop_reason;
            if (d.usage) {
              uso.salida = Math.max(uso.salida, d.usage.output_tokens || 0);
              uso.entrada = Math.max(uso.entrada, tokensEntrada(d.usage));
            }
          } else if (d.type === 'error') {
            errorSse = (d.error && d.error.message) || 'error desconocido';
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        if (ingestAbort && ingestAbort.cancelled) throw new Error('CANCELLED');
        throw new Error('La IA dejó de responder durante ' + Math.round(timeoutMs / 1000) + ' s y se canceló. Vuelve a intentarlo; si se repite, prueba con un documento más corto o con el modelo Sonnet (más rápido) en Ajustes de IA.');
      }
      throw new Error('Se cortó la conexión mientras la IA respondía (' + e.message + ').');
    } finally {
      limpiar();
    }
    // Se informa ANTES de los errores: una respuesta cortada tambien se cobra.
    if (opts.onUsage && (uso.entrada || uso.salida)) { try { opts.onUsage(uso); } catch (_) {} }
    if (errorSse) throw new Error('La IA devolvió un error a mitad de la respuesta: ' + errorSse);
    if (stop === 'refusal') throw new Error('El modelo rechazó la solicitud por políticas de seguridad.');
    // Lo que se corta es la RESPUESTA (razonamiento + JSON), no el texto de
    // entrada: el aviso lo dice asi, porque "limite de caracteres" hacia pensar
    // al usuario que habia pegado demasiado texto.
    if (stop === 'max_tokens') throw new Error('El proceso que generó la IA es más largo de lo que puede devolver en una sola respuesta (' + body.max_tokens.toLocaleString('es-PE') + ' tokens). Tu texto está bien: vuelve a generarlo eligiendo el nivel "Actividad" o "Ejecutivo", o divide el procedimiento por capítulos.');
    return texto.trim();
  }

  // Extrae el primer objeto JSON de una respuesta (tolera fences ```json y prosa alrededor)
  function parseJsonLoose(txt) {
    if (!txt) throw new Error('Respuesta vacía de la IA.');
    let s = txt.replace(/```json/gi, '```').trim();
    const fence = s.match(/```([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a === -1 || b === -1) throw new Error('La IA no devolvió JSON.');
    return JSON.parse(s.slice(a, b + 1));
  }

  const AI_SYSTEM = `Eres un analista senior de procesos de negocio (estilo MBB) experto en notación BPMN 2.0. Reconstruyes flujos de proceso a partir de documentos, procedimientos o descripciones en español (Perú).

Devuelves EXCLUSIVAMENTE un objeto JSON válido (sin texto adicional, sin markdown) con esta forma:
{
  "meta": { "name": string, "industry"?: string, "macroprocess"?: string, "client"?: string },
  "ficha"?: { "code"?, "version"?, "objetivo"?, "alcanceAreas"?, "alcanceDesde"?, "alcanceHasta"?, "alcanceIncluye"?,
              "sistemas"?: [{"nombre":string,"uso"?:string}], "terminos"?: [{"termino":string,"definicion":string}] },
  "nodes": [ { "k": string (id corto único, p.ej. "a1"), "type": "start"|"end"|"task"|"system"|"decision"|"document"|"data"|"intermediate",
               "label": string, "owner"?: string (rol/área responsable = swimlane), "system"?: string (sistema/app usado),
               "exec"?: "manual"|"system"|"automatic"|"email"|"phone", "gateway"?: "exclusive"|"parallel"|"inclusive", "notes"?: string,
               "nivel": 1|2|3 (1 = hito de negocio, 2 = actividad, 3 = tarea de detalle), "padre"?: k (nodo de nivel superior del que depende) } ],
  "edges": [ { "from": k, "to": k, "label"?: string (etiqueta de la rama, p.ej. "Sí"/"No") } ]
}

Reglas:
- Exactamente un nodo "start" y al menos un "end". Nombra el inicio y el fin con un hito real.
- Cada decisión/bifurcación es un nodo "decision" con el gateway correcto y sus ramas etiquetadas en los edges:
  * "exclusive" (XOR): se toma UN solo camino según una condición. Etiqueta cada rama ("Sí"/"No", "Aprobado"/"Rechazado").
  * "parallel" (AND): varias actividades ocurren AL MISMO TIEMPO, sin condición. NO las pongas en secuencia.
  * "inclusive" (OR): pueden darse una o varias ramas a la vez según condiciones.
- PARALELISMO: es un error frecuente encadenar en secuencia cosas que en realidad pasan a la vez. Marca gateway "parallel" cuando el texto diga o implique: "en paralelo", "simultáneamente", "al mismo tiempo", "mientras tanto", "en simultáneo", "a la vez", "de forma concurrente", "por su lado", "en paralelo a esto"; o cuando varias áreas distintas trabajen sobre el MISMO caso sin esperarse entre sí, o cuando el orden entre esas actividades sea indiferente para el resultado. Abre con un nodo decision gateway "parallel" (fork), conecta desde él una rama por cada actividad concurrente SIN etiqueta de condición, y cierra con otro decision gateway "parallel" (join) al que lleguen todas las ramas antes de continuar. Sólo encadena en secuencia cuando una actividad necesita el resultado de la anterior.
- Modela loops (reprocesos) y convergencias reales del texto; no inventes pasos que el documento no menciona.
- "owner" es el rol que ejecuta cada actividad (define los carriles). "system" es la herramienta (CRM, ERP, OnBase, etc.).
- "notes" resume la actividad en 1-3 frases. Numeración y ruteo se derivan solos; no los pongas en labels.
- NIVEL (obligatorio en cada nodo): permite ver el mismo proceso a tres profundidades sin regenerarlo.
  * nivel 1 = lo que contarías a un gerente en 30 segundos. Hitos de negocio y decisiones que cambian el resultado.
  * nivel 2 = la actividad que ejecuta un rol de principio a fin ("Validar expediente").
  * nivel 3 = el paso operativo dentro de esa actividad ("Descargar el PDF del gestor documental").
  Los eventos start/end y las decisiones que abren caminos distintos son SIEMPRE nivel 1.
  Todo nodo de nivel 2 o 3 lleva "padre" apuntando al nodo inmediatamente superior del que forma parte.
  Reparte con criterio: si todo queda en nivel 1 la vista ejecutiva no resume nada, y si todo queda en nivel 3
  no hay resumen posible. Como referencia sana, en torno a 1 de cada 4 nodos debería ser nivel 1.
- Si el documento trae código de proceso, versión, objetivo, alcance, sistemas o glosario, rellénalos en "ficha".
- Responde SOLO con el JSON.`;

  // ============================================================
  // FUENTES MULTIPLES
  // Un AS-IS real casi nunca sale de un solo documento: hay un flujo antiguo,
  // la grabacion del levantamiento y algun manual. Se acumulan aqui y la IA
  // las fusiona en UN proceso, reconciliando lo que se contradiga.
  // ============================================================
  function sourcesList() { state._sources = state._sources || []; return state._sources; }

  function addSource(tipo, nombre, texto) {
    const t = String(texto || '').trim();
    if (!t) return null;
    const src = { id: 's' + (state.nextId++), tipo: tipo, nombre: nombre, texto: t, chars: t.length };
    sourcesList().push(src);
    renderSources();
    return src;
  }

  function removeSource(id) {
    state._sources = sourcesList().filter(s => s.id !== id);
    renderSources();
  }

  // v3.8.5: varios documentos a la vez para el levantamiento. Elegir o soltar
  // archivos ya NO genera el proceso: los lee y los deja en la lista de fuentes;
  // se genera con el boton cuando el usuario termino de reunir el material.
  // Excepcion: un unico .bpmn sin otras fuentes se importa directo, como antes.
  async function addFilesAsSources(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length || ingestAbort) return;
    if (files.length === 1 && /\.(bpmn|xml)$/i.test(files[0].name || '') && !sourcesList().length) {
      const n = $('#docFileName'); if (n) n.textContent = files[0].name;
      return runIngest({ file: files[0] });
    }
    startIngestJob();
    const lbl = $('#btnIngestGo .go-label');
    if (lbl) lbl.textContent = 'Leyendo documentos…';
    const fallos = [];
    let nuevos = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        throwIfCancelled();
        const f = files[i];
        ingestProgress('Leyendo ' + (i + 1) + ' de ' + files.length + ': ' + f.name, Math.round((i / files.length) * 100));
        await uiTick();
        try {
          const r = await extractFileText(f);
          if (r.kind === 'bpmn') {
            const desc = describeCurrentProcessAsText();
            if (desc && addSource('diagrama', r.name, 'Diagrama existente del proceso:' + String.fromCharCode(10) + desc)) nuevos++;
            continue;
          }
          const texto = String(r.text || '').trim();
          if (sourcesList().some(s => s.nombre === r.name && s.chars === texto.length)) continue;   // ya estaba
          const tipo = /transcrip|audio|reunion|llamada|teams|zoom/i.test(r.name) ? 'transcripcion' : 'documento';
          if (addSource(tipo, r.name, texto)) nuevos++;
          else fallos.push(f.name + ': no tiene texto legible');
        } catch (err) {
          if (String(err.message) === 'CANCELLED' || err.name === 'AbortError') throw err;
          fallos.push(f.name + ': ' + (err.message || err));
        }
      }
    } catch (err) {
      // Cancelado: se conserva lo que ya se leyo
    } finally {
      endIngestJob();
      renderSources();   // endIngestJob restaura una etiqueta vieja del boton
    }
    const n = sourcesList().length, aviso = $('#docFileName');
    if (aviso) aviso.textContent = !nuevos ? '' :
      (nuevos === 1 ? '1 documento añadido' : nuevos + ' documentos añadidos') + ' · añade más o pulsa ' +
      (n > 1 ? 'Combinar y generar' : 'Generar proceso');
    if (fallos.length) alert('No se pudieron leer ' + fallos.length + ' archivo(s):\n\n' + fallos.join('\n'));
  }

  const SRC_ICON = { documento: 'DOC', transcripcion: 'AUDIO', diagrama: 'BPMN', texto: 'TEXTO', eventlog: 'CSV' };

  function renderSources() {
    const box = $('#sourcesBox'), list = $('#sourcesList');
    if (!box || !list) return;
    const arr = sourcesList();
    box.hidden = arr.length === 0;
    list.innerHTML = arr.map(s =>
      '<li class="src-item" data-id="' + s.id + '">' +
        '<span class="src-tag">' + (SRC_ICON[s.tipo] || 'DOC') + '</span>' +
        '<span class="src-name">' + escapeHtml(s.nombre) + '</span>' +
        '<span class="src-chars">' + s.chars.toLocaleString('es-PE') + ' car.</span>' +
        '<button class="src-del" data-id="' + s.id + '" title="Quitar esta fuente" type="button">x</button>' +
      '</li>').join('');
    list.querySelectorAll('.src-del').forEach(b =>
      b.addEventListener('click', () => removeSource(b.dataset.id)));
    const n = arr.length;
    const lbl = $('#sourcesCount');
    if (lbl) lbl.textContent = n === 1 ? '1 fuente lista' : n + ' fuentes listas para combinar';
    const total = arr.reduce((a, s) => a + s.chars, 0);
    if (lbl && n > 1) lbl.textContent += ' · ' + total.toLocaleString('es-PE') + ' car.';
    const warn = $('#sourcesWarn');
    if (warn) {
      const excede = total > MAX_AI_CHARS;
      warn.hidden = !excede;
      warn.textContent = excede
        ? 'Entre todas suman ' + total.toLocaleString('es-PE') + ' caracteres y la IA lee hasta ' +
          MAX_AI_CHARS.toLocaleString('es-PE') + ': se recortará el final de las fuentes más largas. ' +
          'Quita las que no aporten o deja solo los capítulos del proceso.'
        : '';
    }
    const go = $('#btnIngestGo');
    if (go) {
      const span = go.querySelector('.go-label');
      if (span) span.textContent = n > 1 ? 'Combinar ' + n + ' fuentes y generar' : 'Generar proceso';
    }
  }

  // Describe un diagrama BPMN importado como texto, para poder fusionarlo con las demas fuentes
  function describeCurrentProcessAsText() {
    if (!state.nodes.length) return '';
    const lane = (state._lanes && state._lanes.laneOf) || {};
    const NL = String.fromCharCode(10);
    return flowOrderNodes().map(n => {
      const outs = state.edges.filter(e => e.from === n.id)
        .map(e => { const t = getNode(e.to); return (e.label ? e.label + ' -> ' : '-> ') + (t ? t.label : '?'); });
      return '- [' + n.type + '] ' + (n.label || '') +
             ' (rol: ' + (lane[n.id] || n.owner || 'sin asignar') + ')' +
             (n.system ? ' [sistema: ' + n.system + ']' : '') +
             (outs.length ? ' | ' + outs.join(' ; ') : '');
    }).join(NL);
  }

  // Une todas las fuentes en un solo texto etiquetado para la IA
  function combinedSourceText() {
    const arr = sourcesList();
    const NL = String.fromCharCode(10);
    if (arr.length === 1) return arr[0].texto;
    // v3.8.5: solo se recorta si entre todas superan el tope, y por reparto
    // justo: las fuentes cortas entran enteras y el resto del presupuesto se
    // divide entre las largas. Antes cada una quedaba en 60K/n aunque sobrara
    // espacio (tres documentos = 20K cada uno).
    const tope = {};
    let presupuesto = MAX_AI_CHARS;
    arr.slice().sort((a, b) => a.chars - b.chars).forEach((s, i, orden) => {
      tope[s.id] = Math.min(s.chars, Math.floor(presupuesto / (orden.length - i)));
      presupuesto -= tope[s.id];
    });
    return arr.map((s, i) =>
      '=== FUENTE ' + (i + 1) + ' de ' + arr.length + ': "' + s.nombre + '" (' + s.tipo + ') ===' + NL +
      s.texto.slice(0, tope[s.id])
    ).join(NL + NL);
  }

  const MERGE_RULES = [
    '',
    'ESTAS COMBINANDO VARIAS FUENTES SOBRE EL MISMO PROCESO. Reglas de fusion:',
    '- Construye UN solo proceso AS-IS consolidado, no uno por fuente.',
    '- Si dos fuentes describen el mismo paso con distinto nombre, unificalo en una sola actividad.',
    '- Ante contradicciones, prevalece lo que describa la operacion ACTUAL (una transcripcion de levantamiento reciente pesa mas que un diagrama o manual antiguo).',
    '- Un paso que aparece solo en el diagrama/manual antiguo y que la transcripcion dice que ya no se hace: NO lo incluyas.',
    '- Un paso que menciona la transcripcion y no esta en el diagrama antiguo: SI inclúyelo (es la actualizacion).',
    '- En "notes" de cada actividad, cuando una fuente aporte un detalle relevante, indica brevemente de donde sale.'
  ].join(String.fromCharCode(10));

  // ============================================================
  // COPILOTO REAL — enruta las acciones analiticas al API de Anthropic
  // Antes eran plantillas/reglas fijas. Ahora, si hay API key configurada,
  // cada accion analiza ESTE proceso con Claude; sin key cae al heuristico.
  // ============================================================
  const AI_ROLE = 'Eres un consultor senior de procesos de negocio (estilo MBB) trabajando para MBC Business Consulting Peru. Analizas el proceso concreto que se te entrega. Escribes en espanol de Peru, directo y accionable, sin relleno. Usas Markdown: negritas para lo clave, tablas cuando comparas, y numeros concretos cuando el proceso los aporta. Nunca inventes datos que el proceso no tenga: si falta un dato, dilo y explica como obtenerlo.';

  const AI_TASKS = {
    'suggest-kpis': {
      etiqueta: 'Sugerir KPIs aplicables',
      prompt: 'Propon los KPIs que de verdad miden la salud de ESTE proceso. Para cada uno: nombre, que mide, formula concreta con los datos del proceso, unidad, meta o benchmark de la industria indicada, y donde se obtiene el dato (sistema o actividad del propio flujo). Prioriza 5-8 KPIs: primero los que atacan los cuellos visibles del flujo. Presenta una tabla y despues una linea por KPI explicando por que importa para el negocio.'
    },
    'propose-tobe': {
      etiqueta: 'Proponer reingenieria To-Be',
      prompt: 'Disena el proceso To-Be. Estructura la respuesta en: (1) Diagnostico en 3 lineas de lo que hoy no funciona; (2) Tabla de cambios propuestos con columnas Actividad actual | Que cambia | Palanca (eliminar/automatizar/simplificar/paralelizar/reasignar) | Impacto esperado; (3) Como queda el flujo To-Be descrito paso a paso con sus roles; (4) Que se elimina y por que; (5) Riesgos del rediseno y como mitigarlos. Se especifico con las actividades reales del proceso, citandolas por su nombre.'
    },
    'raci': {
      etiqueta: 'Matriz RACI',
      prompt: 'Construye la matriz RACI del proceso. Devuelve una tabla Markdown con las actividades en filas y los roles reales del proceso en columnas, marcando R, A, C o I en cada celda. Reglas: exactamente un A por actividad; R es quien ejecuta. Debajo de la tabla, senala en vinetas los problemas de gobernanza que revele la matriz (actividades sin A claro, roles sobrecargados de R, exceso de C que ralentiza).'
    },
    'impact-effort': {
      etiqueta: 'Matriz impacto-esfuerzo',
      prompt: 'Lista las iniciativas de mejora que salen de este proceso y clasifícalas en una matriz impacto-esfuerzo. Tabla con columnas Iniciativa | Impacto (Alto/Medio/Bajo) | Esfuerzo (Alto/Medio/Bajo) | Cuadrante | Horizonte. Agrupa despues en Quick wins (0-3 meses), Tacticas (3-9) y Estructurales (9-18), y di con cual empezarias y por que.'
    },
    'automation': {
      etiqueta: 'Oportunidades de automatizacion',
      prompt: 'Evalua que actividades de este proceso son automatizables. Tabla con columnas Actividad | Tecnologia adecuada (RPA / workflow / integracion API / IDP-OCR / IA / reglas DMN) | Viabilidad (Alta/Media/Baja) | Ahorro estimado | Precondiciones. Justifica la viabilidad con lo que dice el proceso (volumen, si es rule-based, si el dato esta digitalizado). Cierra indicando cual automatizarias primero y que hace falta para arrancar.'
    },
    'backlog': {
      etiqueta: 'Backlog de iniciativas',
      prompt: 'Arma el backlog priorizado de iniciativas de mejora. Tabla con columnas # | Iniciativa | Problema que resuelve | Owner sugerido (rol del proceso) | Esfuerzo | Impacto | Horizonte | Criterio de exito medible. Ordena por prioridad y explica el criterio de priorizacion que usaste.'
    },
    'exec-summary': {
      etiqueta: 'Resumen ejecutivo',
      prompt: 'Escribe el resumen ejecutivo del diagnostico para un comite de direccion, en piramide (conclusion primero). Estructura: (1) Mensaje principal en 2 lineas; (2) Situacion actual con los numeros del proceso; (3) Los 3 hallazgos criticos con su impacto de negocio; (4) Recomendacion y su valor esperado; (5) Que decision se pide al comite. Maximo una pagina, sin jerga tecnica.'
    },
    'sipoc': {
      etiqueta: 'SIPOC',
      prompt: 'Construye el SIPOC del proceso. Tabla con las 5 columnas Suppliers | Inputs | Process | Outputs | Customers, con elementos concretos de este proceso (no genericos). Debajo, indica los requisitos criticos del cliente (CTQs) y como se miden hoy.'
    },
    'bottleneck': {
      etiqueta: 'Cuello de botella y ruta critica',
      prompt: 'Identifica el cuello de botella real del proceso y la ruta critica. Explica: (1) Cual es el cuello y con que evidencia del proceso lo sostienes (tiempo x volumen, esperas, dependencia de un rol); (2) La ruta critica actividad por actividad con su tiempo; (3) Cuanto mejoraria el lead time si se destraba el cuello; (4) Las 3 acciones concretas para destrabarlo.'
    }
  };

  async function runAiTask(kind) {
    const t = AI_TASKS[kind];
    if (!t) return false;
    if (state.nodes.length === 0) { alert('No hay proceso que analizar.'); return true; }
    copilotPost('ai', '_' + t.etiqueta + ': analizando el proceso con IA…_');
    try {
      const NL = String.fromCharCode(10);
      const md = await callClaude(
        t.prompt + NL + NL + '=== PROCESO A ANALIZAR ===' + NL + processDigestForAi(),
        { system: AI_ROLE, effort: 'high', maxTokens: 8000 });
      copilotPost('ai', md);
    } catch (e) {
      copilotPost('ai', '**No se pudo completar el analisis:** ' + e.message +
        String.fromCharCode(10) + String.fromCharCode(10) + '_Puedes reintentar o usar el modo basico._');
    }
    return true;
  }

  // ============================================================
  // ANALISIS DE PAINS CON IA
  // Dos salidas separadas a proposito:
  //  (a) dolores EVIDENCIADOS en el flujo -> se anclan a su actividad
  //  (b) dolores TIPICOS del sector -> hipotesis a validar, nunca se mezclan
  // ============================================================
  const PAINS_SYSTEM = [
    'Eres un consultor senior de procesos (estilo MBB). Analizas un proceso ya modelado y detectas sus dolores.',
    '',
    'Devuelves EXCLUSIVAMENTE un JSON valido con esta forma:',
    '{',
    '  "detectados": [ { "nodo": "<id exacto del nodo>", "categoria": "rework|wait|handoff|manual|control|data|compliance|cost",',
    '                    "descripcion": "<el dolor concreto, 1 frase>", "evidencia": "<que del proceso lo demuestra>",',
    '                    "severidad": 1-5, "frecuencia": 1-5, "impacto": "<consecuencia de negocio en 1 frase>" } ],',
    '  "sectoriales": [ { "titulo": "<dolor tipico del sector>", "descripcion": "<en que consiste>",',
    '                     "donde": "<en que parte de ESTE proceso podria aparecer>",',
    '                     "senal": "<que preguntar o medir para confirmarlo>", "severidad": 1-5 } ]',
    '}',
    '',
    'Reglas:',
    '- "detectados": SOLO lo que se desprende del proceso modelado (handoffs entre roles, reprocesos/loops, pasos manuales, controles duplicados, esperas, reingreso de datos, cuellos por volumen/tiempo, dependencia de una sola persona, falta de trazabilidad, retrabajos por documentacion incompleta). Cada uno DEBE citar evidencia real y apuntar a un "nodo" existente. Se exhaustivo: revisa TODAS las actividades, no solo las obvias.',
    '- "sectoriales": dolores frecuentes en la industria indicada que este proceso NO evidencia pero podrian existir. Son HIPOTESIS a validar con el cliente, nunca hallazgos. Maximo 6.',
    '- Nunca inventes evidencia. Si un dolor no se sostiene con el modelo, va en "sectoriales".',
    '- Responde SOLO con el JSON.'
  ].join(String.fromCharCode(10));

  function processDigestForAi() {
    const lane = (state._lanes && state._lanes.laneOf) || {};
    const NL = String.fromCharCode(10);
    const lineas = flowOrderNodes().map(n => {
      const outs = state.edges.filter(e => e.from === n.id)
        .map(e => { const t = getNode(e.to); return (e.label ? e.label + ' -> ' : '-> ') + (t ? t.label : '?'); });
      return [
        'id=' + n.id,
        'tipo=' + n.type + (n.gatewayType ? '/' + n.gatewayType : ''),
        'actividad=' + (n.label || ''),
        'rol=' + (lane[n.id] || n.owner || 'sin asignar'),
        n.system ? 'sistema=' + n.system : '',
        n.executionType ? 'ejecucion=' + n.executionType : '',
        n.time ? 'min=' + n.time : '',
        n.volume ? 'vol/mes=' + n.volume : '',
        n.notes ? 'detalle=' + String(n.notes).replace(/\s+/g, ' ').slice(0, 220) : '',
        outs.length ? 'salidas: ' + outs.join(' | ') : ''
      ].filter(Boolean).join(' - ');
    });
    return [
      'PROCESO: ' + (state.meta.name || 'sin nombre'),
      'INDUSTRIA: ' + (state.meta.industry || 'no indicada'),
      'MACROPROCESO: ' + (state.meta.macroprocess || 'no indicado'),
      'ROLES/CARRILES: ' + ((state._lanes && state._lanes.list) || []).join(', '),
      '', 'ACTIVIDADES:', lineas.join(NL)
    ].join(NL);
  }

  async function aiAnalyzePains() {
    if (state.nodes.length === 0) { alert('No hay proceso que analizar.'); return; }
    if (!aiReady()) {
      if (confirm('El analisis profundo de dolores usa la IA (Claude). Aun no configuraste tu API key. Abrir Ajustes de IA?')) openAiSettings();
      return;
    }
    copilotPost('ai', '_Analizando el proceso en busca de dolores..._');
    let data;
    try {
      const raw = await callClaude(processDigestForAi(), { system: PAINS_SYSTEM, effort: 'high', maxTokens: 8000 });
      data = parseJsonLoose(raw);
    } catch (e) {
      copilotPost('ai', '**No se pudo completar el analisis:** ' + e.message);
      return;
    }
    let nuevos = 0;
    (data.detectados || []).forEach(d => {
      const n = getNode(d.nodo);
      if (!n) return;
      n.pains = n.pains || [];
      const dup = n.pains.some(x => (x.description || '').toLowerCase() === String(d.descripcion || '').toLowerCase());
      if (dup) return;
      n.pains.push({
        id: 'p' + (state.nextId++),
        category: d.categoria || 'manual',
        description: d.descripcion || '',
        evidence: d.evidencia || '',
        impact: d.impacto || '',
        severity: Math.max(1, Math.min(5, +d.severidad || 3)),
        frequency: Math.max(1, Math.min(5, +d.frecuencia || 3)),
        source: 'ia'
      });
      nuevos++;
    });
    state._sectorPains = (data.sectoriales || []).slice(0, 8);
    persist(); render(); runLinter();

    const top = [];
    state.nodes.forEach(n => (n.pains || []).forEach(x => top.push({ n: n, x: x })));
    top.sort((a, b) => (b.x.severity * b.x.frequency) - (a.x.severity * a.x.frequency));
    const NL = String.fromCharCode(10);
    let msg = '**' + nuevos + ' dolor(es) detectados en el flujo** (con evidencia del propio proceso):' + NL + NL;
    top.slice(0, 8).forEach(t => {
      msg += '- **' + escapeHtml(t.n.label) + '** - ' + escapeHtml(t.x.description) +
             '  _(sev ' + t.x.severity + ' x frec ' + t.x.frequency + ' = **' + (t.x.severity * t.x.frequency) + '**)_' + NL +
             (t.x.evidence ? '  - Evidencia: ' + escapeHtml(t.x.evidence) + NL : '') +
             (t.x.impact ? '  - Impacto: ' + escapeHtml(t.x.impact) + NL : '');
    });
    if (state._sectorPains.length) {
      msg += NL + '---' + NL + NL + '**Hipotesis del sector - NO detectadas en este flujo, a validar con el cliente:**' + NL + NL;
      state._sectorPains.forEach((h, i) => {
        msg += (i + 1) + '. **' + escapeHtml(h.titulo || '') + '** - ' + escapeHtml(h.descripcion || '') + NL +
               (h.donde ? '   - Donde mirar: ' + escapeHtml(h.donde) + NL : '') +
               (h.senal ? '   - Como confirmarlo: ' + escapeHtml(h.senal) + NL : '');
      });
      msg += NL + '_Estas NO se agregaron al diagrama: son preguntas para el levantamiento, no hallazgos._';
    }
    copilotPost('ai', msg);
    activateTab('pains');
  }

  // ============================================================
  // PARTICIPANTES DE LA TRANSCRIPCION
  // En transcripciones de Teams/Zoom cada linea viene como "Nombre: texto".
  // Detectamos esos nombres, pedimos el ROL de cada persona y se lo damos a
  // la IA para que los carriles del flujo sean roles reales, no nombres.
  // ============================================================
  function detectParticipants(text) {
    const counts = {};
    const lines = String(text || '').split(/\r?\n/);
    const re = /^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?([A-ZÁÉÍÓÚÑ][\wÀ-ſ.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\wÀ-ſ.'-]+){0,3})\s*(?:\(([^)]{2,40})\))?\s*:\s*\S/;
    const RUIDO = new Set(['nota','notas','ejemplo','objetivo','alcance','proceso','paso','pasos','resumen',
      'observacion','conclusion','importante','atencion','sistema','sistemas','actividad','actividades',
      'responsable','responsables','fecha','tema','agenda','http','https','nota1','anexo']);
    lines.forEach(l => {
      const m = l.match(re);
      if (!m) return;
      const nombre = m[1].trim();
      if (nombre.length < 3 || nombre.length > 48) return;
      const first = nombre.toLowerCase().split(/\s+/)[0];
      if (RUIDO.has(first.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return;
      if (/^\d/.test(nombre)) return;
      counts[nombre] = counts[nombre] || { nombre, veces: 0, pista: '' };
      counts[nombre].veces++;
      if (m[2] && !counts[nombre].pista) counts[nombre].pista = m[2].trim();
    });
    return Object.values(counts).filter(p => p.veces >= 2)
      .sort((a, b) => b.veces - a.veces).slice(0, 12);
  }

  // Modal: pide el rol de cada persona detectada. Devuelve promesa con el mapeo.
  function askParticipantRoles(participantes) {
    return new Promise(resolve => {
      const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
      const filas = participantes.map((p, i) => `
        <tr>
          <td class="pt-name">${esc(p.nombre)}<span class="pt-count">${p.veces} intervenciones</span></td>
          <td><input type="text" class="pt-role" data-i="${i}" list="rolesComunes"
                     placeholder="¿Qué rol cumple?" value="${esc(p.pista)}" /></td>
        </tr>`).join('');
      const html = `
        <p class="panel-hint">Detecté <b>${participantes.length} persona(s)</b> en la transcripción. Indica el <b>rol</b> de cada una: la IA usará el rol (no el nombre) como <b>carril</b> del flujo, que es lo correcto en un proceso.</p>
        <datalist id="rolesComunes">
          <option value="Analista"><option value="Jefe de área"><option value="Gerente">
          <option value="Supervisor"><option value="Asesor comercial"><option value="Back office">
          <option value="Call center"><option value="Operaciones"><option value="Riesgos">
          <option value="Legal / Cumplimiento"><option value="Tecnología"><option value="Finanzas">
          <option value="Recursos Humanos"><option value="Cliente"><option value="Proveedor">
        </datalist>
        <table class="pt-table"><tbody>${filas}</tbody></table>
        <p class="ai-hint">Deja en blanco a quien no participe en el proceso (p. ej. el consultor que facilita la reunión): se omitirá.</p>`;
      openModal('👥 ¿Quién es quién en la reunión?', html, () => {
        const mapa = {};
        document.querySelectorAll('#modalBody .pt-role').forEach(inp => {
          const rol = (inp.value || '').trim();
          if (rol) mapa[participantes[+inp.dataset.i].nombre] = rol;
        });
        resolve(mapa);
      });
      const ok = $('#modalOk'); if (ok) ok.textContent = 'Usar estos roles';
      const cancel = $('#modalCancel');
      if (cancel) { cancel.textContent = 'Omitir'; const prev = cancel.onclick; cancel.onclick = (e) => { resolve({}); if (prev) prev(e); }; }
    });
  }

  // Modal: profundidad del levantamiento. NO decide QUE se genera --siempre se
  // genera el proceso completo-- sino con cuanto detalle lo mira la IA y en que
  // vista se abre. Elegir mal no cuesta nada: el selector de nivel cambia la
  // vista al instante y sin volver a llamar a la IA.
  // Pide el codigo de acceso del equipo la primera vez que se ingesta.
  // Resuelve con el codigo, o con '' si el usuario elige el modo basico (boton,
  // Esc o clic fuera: el MutationObserver cubre los cierres que no pasan por
  // los botones, para que la ingesta nunca se quede esperando).
  function pedirCodigoEquipo() {
    return new Promise(resolve => {
      const modal = $('#modal'), ok = $('#modalOk'), cancel = $('#modalCancel');
      const txtOk = ok ? ok.textContent : '', txtCancel = cancel ? cancel.textContent : '';
      let hecho = false, obs = null;
      const fin = (v) => {
        if (hecho) return;
        hecho = true;
        if (obs) obs.disconnect();
        if (ok) ok.textContent = txtOk;
        if (cancel) cancel.textContent = txtCancel;
        resolve(v);
      };
      const html =
        '<p class="panel-hint">ProcessIQ interpreta el documento con <b>IA (Claude)</b> usando la clave del equipo. ' +
        'Escribe el <b>código de acceso</b> que te dio quien administra la herramienta: se guarda solo en este ' +
        'navegador y no se te volverá a pedir.</p>' +
        '<label>Código de acceso del equipo<input type="password" id="ingestCodigo" autocomplete="off" /></label>' +
        '<p class="ai-hint">Sin código puedes seguir en <b>modo básico</b>: extrae actividades por palabras clave, sin IA.</p>';
      openModal('Interpretar con IA', html, () => fin((($('#ingestCodigo') || {}).value || '').trim()));
      if (ok) ok.textContent = 'Usar IA';
      if (cancel) {
        cancel.textContent = 'Modo básico';
        const prev = cancel.onclick;
        cancel.onclick = (e) => { fin(''); if (prev) prev(e); };
      }
      if (modal) {
        obs = new MutationObserver(() => { if (modal.hidden) setTimeout(() => fin(''), 0); });
        obs.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
      }
    });
  }

  function askProfundidad(info) {
    const chars = (info && info.chars) || 0;
    return new Promise(resolve => {
      const html =
        '<p class="panel-hint">El proceso se genera <b>completo</b> en cualquier caso. Esto define ' +
        'con cuanto detalle lo mira la IA y en que vista se abre; podras cambiar de vista cuando ' +
        'quieras con el selector <b>Nivel de detalle</b>, sin volver a generar.</p>' +
        '<div class="prof-opts">' +
        '<label class="prof-opt"><input type="radio" name="prof" value="1" />' +
        '<span><b>Ejecutivo</b><small>Los hitos y las decisiones. Para comite o SteerCo.</small></span></label>' +
        '<label class="prof-opt"><input type="radio" name="prof" value="2" checked />' +
        '<span><b>Actividad</b><small>Lo que hace cada rol de principio a fin. El equilibrio habitual.</small></span></label>' +
        '<label class="prof-opt"><input type="radio" name="prof" value="3" />' +
        '<span><b>Detalle</b><small>Cada paso operativo. Para manual de procedimientos o automatizacion.</small></span></label>' +
        '</div>' +
        // v3.8.7: el modelo se elige AQUI, viendo lo que cuesta cada uno (antes
        // solo estaba en Ajustes de IA). Se guarda como preferencia del navegador.
        (chars ? (() => {
          const actual = aiConfig().model === 'claude-sonnet-5' ? 'claude-sonnet-5' : 'claude-opus-5';
          const opcion = (id, titulo, texto) =>
            '<label class="prof-opt"><input type="radio" name="modelo" value="' + id + '"' + (actual === id ? ' checked' : '') + ' />' +
            '<span><b>' + titulo + '</b><small>' + texto + '</small><em class="pm-coste" data-modelo="' + id + '"></em></span></label>';
          return '<div class="prof-modelo"><div class="pm-titulo">Modelo de IA</div><div class="prof-opts">' +
            opcion('claude-opus-5', 'Claude Opus 5', 'Máxima calidad de interpretación. Para procedimientos largos, ambiguos o con muchas decisiones.') +
            opcion('claude-sonnet-5', 'Claude Sonnet 5', 'Más rápido y 2,5 veces más barato por token. Suele bastar con textos claros y bien estructurados.') +
            '</div></div><div id="profCoste" class="prof-coste"></div>';
        })() : '');
      openModal(chars ? 'Nivel de detalle y modelo' : 'Nivel de detalle del levantamiento', html, () => {
        const sel = document.querySelector('#modalBody input[name="prof"]:checked');
        const mod = document.querySelector('#modalBody input[name="modelo"]:checked');
        if (mod) {
          const c = aiConfig();
          if (c.model !== mod.value) { saveAiConfig(Object.assign({}, c, { model: mod.value })); updateAiUi(); }
        }
        resolve(sel ? +sel.value : 2);
      });
      // v3.8.6: coste estimado de ESTA ejecucion, antes de gastar; cambia con el nivel
      const pintarCoste = () => {
        const box = $('#profCoste');
        if (!box) return;
        const sel = document.querySelector('#modalBody input[name="prof"]:checked');
        const nivel = sel ? +sel.value : 2;
        const mod = document.querySelector('#modalBody input[name="modelo"]:checked');
        const e = estimarCosteGeneracion(chars, nivel, mod ? mod.value : undefined);
        // Rango de cada modelo en su tarjeta, para comparar antes de elegir
        document.querySelectorAll('#modalBody .pm-coste').forEach(el => {
          const x = estimarCosteGeneracion(chars, nivel, el.dataset.modelo);
          el.textContent = 'Estimado: ' + fmtUsd(x.min) + ' – ' + fmtUsd(x.max);
        });
        box.innerHTML =
          '<div class="pc-cifra">Coste estimado de esta ejecución: <b>' + fmtUsd(e.min) + ' – ' + fmtUsd(e.max) + '</b></div>' +
          '<small>Máximo posible ' + fmtUsd(e.tope) + ', si la IA usa toda la respuesta (' + GEN_MAX_TOKENS.toLocaleString('es-PE') + ' tokens). ' +
          e.precio.nombre + ' a precio de lista: US$ ' + e.precio.entrada + ' por millón de tokens de entrada y US$ ' + e.precio.salida +
          ' de salida; ~' + e.entrada.toLocaleString('es-PE') + ' tokens de entrada. ' +
          (e.muestras ? 'Rango ajustado con ' + e.muestras + (e.muestras === 1 ? ' ejecución real' : ' ejecuciones reales') + ' de este nivel en este navegador.'
                      : 'Estimación inicial: se afina con tus ejecuciones reales.') + '</small>';
      };
      pintarCoste();
      document.querySelectorAll('#modalBody input[name="prof"], #modalBody input[name="modelo"]').forEach(r => r.addEventListener('change', pintarCoste));
      const ok = $('#modalOk'); if (ok) ok.textContent = 'Generar';
      const cancel = $('#modalCancel');
      if (cancel) { const prev = cancel.onclick; cancel.onclick = (e) => { resolve(2); if (prev) prev(e); }; }
    });
  }

  async function aiBuildProcess(sourceText, sourceLabel, statusFn, opts) {
    const setStatus = statusFn || (() => {});
    setStatus('⏳ Interpretando con IA… (puede tardar unos segundos)');
    let roles = '';
    if (opts && opts.roles && Object.keys(opts.roles).length) {
      const NL = String.fromCharCode(10);
      roles = NL + NL + '=== QUIEN ES QUIEN (usa el ROL como owner/carril, nunca el nombre) ===' + NL +
        Object.entries(opts.roles).map(function(e){ return e[0] + ' = ' + e[1]; }).join(NL) + NL +
        'Persona no listada: no la conviertas en carril; asigna la actividad al rol que corresponda por contexto.';
    }
    const merge = (sourcesList().length > 1) ? MERGE_RULES : '';
    const NL2 = String.fromCharCode(10);
    const prof = (opts && opts.vista) ? (NL2 + NL2 + '=== PROFUNDIDAD PEDIDA ===' + NL2 + ({
      1: 'El consultor presentara esto a un comite. Prioriza hitos de negocio y decisiones que cambian el resultado; aun asi etiqueta con nivel 3 los pasos operativos que el texto mencione.',
      2: 'Detalle habitual de un levantamiento: la actividad que ejecuta cada rol de principio a fin.',
      3: 'Levantamiento exhaustivo: recoge cada paso operativo que el texto mencione, incluidos sistemas y validaciones intermedias.'
    })[opts.vista]) : '';
    const prompt = `Reconstruye el proceso descrito en el siguiente ${sourceLabel || 'documento'} como JSON BPMN según el formato indicado.${merge}${roles}${prof}\n\n=== CONTENIDO ===\n${String(sourceText).slice(0, MAX_AI_CHARS)}`;
    // v3.8.9: con un documento grande la IA puede tardar mas en soltar el
    // primer dato (no en total: el reloj de inactividad se reinicia con cada
    // byte). 90s fijos hacian cortar de mas un levantamiento de ~90K
    // caracteres; se amplia segun el largo, con techo de 3 min.
    const timeoutMs = Math.min(180000, 90000 + Math.floor(prompt.length / 1000) * 500);
    const raw = await callClaude(prompt, { system: AI_SYSTEM, effort: 'medium', maxTokens: GEN_MAX_TOKENS, timeoutMs,
      onProgress: (n) => setStatus('Recibiendo el proceso de la IA… ' + n.toLocaleString('es-PE') + ' caracteres'),
      onUsage: (u) => {
        const coste = { fecha: new Date().toISOString(), modelo: u.modelo, nivel: (opts && opts.vista) || 2,
          chars: prompt.length + AI_SYSTEM.length, entrada: u.entrada, salida: u.salida, usd: usd(u.entrada, u.salida, u.modelo) };
        registrarCoste(coste);
        state._ultimoCosteIa = coste;
      } });
    const spec = parseJsonLoose(raw);
    buildProcessFromAiSpec(spec, sourceLabel);
    return spec;
  }

  function buildProcessFromAiSpec(spec, sourceLabel) {
    if (!spec || !Array.isArray(spec.nodes) || !spec.nodes.length) throw new Error('La IA no devolvió un proceso con actividades.');
    resetState();
    const m = spec.meta || {};
    state.meta = { name: m.name || sourceLabel || 'Proceso (IA)', industry: m.industry || '', macroprocess: m.macroprocess || '', client: m.client || '', owner: '' };
    $('#processName').value = state.meta.name;
    if (m.industry) $('#processIndustry').value = m.industry;
    if (m.macroprocess) $('#processMacro').value = m.macroprocess;
    if (spec.ficha) state.ficha = normalizeFicha(spec.ficha);
    const idMap = {};
    spec.nodes.forEach(t => {
      const type = SHAPE_DEFAULTS[t.type] ? t.type : 'task';
      const def = SHAPE_DEFAULTS[type];
      const node = {
        id: 'n' + (state.nextId++), type, x: 0, y: 0, w: def.w, h: def.h,
        label: t.label || '(sin título)', executionType: t.exec || (type === 'task' ? 'manual' : ''),
        gatewayType: (type === 'decision' ? (t.gateway || 'exclusive') : undefined),
        activityCode: '', owner: t.owner || '', system: t.system || '',
        time: '', volume: '', va: '', sla: '', docsIn: '', docsOut: '', rules: '', notes: t.notes || '', pains: [],
        nivel: (t.nivel >= 1 && t.nivel <= 3) ? +t.nivel : undefined, _padreK: t.padre || null
      };
      idMap[t.k] = node.id;
      state.nodes.push(node);
    });
    (spec.edges || []).forEach(e => {
      const f = idMap[e.from], to = idMap[e.to];
      if (f && to) state.edges.push({ id: 'e' + (state.nextId++), from: f, to, label: e.label || '' });
    });
    // La IA referencia al padre por su id corto (a3); aquí se traduce al id real.
    // Los hitos (start/end/decision) se fuerzan a nivel 1: son los que sostienen
    // la vista ejecutiva y la IA a veces los deja en 2.
    state.nodes.forEach(n => {
      if (n._padreK && idMap[n._padreK]) n.padre = idMap[n._padreK];
      delete n._padreK;
      if (_esHito(n)) n.nivel = 1;
    });
    ensureDecisionBranches();
    persist();
    autoLayout();
    runSimulation();
    state.meta.nivelVista = 3;
    fijarModeloCompleto();
    actualizarSelectorNivel();
    persist();
  }

  // ----------- Panel de Ajustes de IA (BYOK) -----------
  function openAiSettings() {
    const cfg = aiConfig();
    const modo = cfg.modo || (cfg.key ? 'propia' : 'equipo');
    const esc = s => String(s == null ? '' : s).replace(/"/g, '&quot;');
    const opts = AI_MODELS.map(m => `<option value="${m.id}"${(cfg.model || 'claude-opus-5') === m.id ? ' selected' : ''}>${m.label}</option>`).join('');
    const html = `
      <div class="ai-settings">
        <p class="panel-hint">ProcessIQ usa el <b>API de Anthropic (Claude)</b>. En <b>modo equipo</b> la clave vive en el intermediario de MBC y en este navegador solo se guarda tu código de acceso. Con <b>tu propia API key</b>, la key se guarda solo en este navegador y va directo a Anthropic.</p>
        <label>Modo
          <select id="aiModo">
            <option value="equipo"${modo === 'equipo' ? ' selected' : ''}>Clave del equipo (intermediario MBC)</option>
            <option value="propia"${modo === 'propia' ? ' selected' : ''}>Mi propia API key</option>
          </select>
        </label>
        <div id="aiBloqueEquipo">
          <label>Código de acceso del equipo
            <input type="password" id="aiCodigo" value="${esc(cfg.codigo || '')}" autocomplete="off" />
          </label>
          <label>Dirección del intermediario
            <input type="text" id="aiProxy" value="${esc(cfg.proxyUrl || PROXY_POR_DEFECTO)}" autocomplete="off" />
          </label>
          <p class="ai-hint">El código te lo da quien administra ProcessIQ. La clave de Anthropic vive en el intermediario: tu navegador nunca la ve.</p>
        </div>
        <div id="aiBloquePropia">
        <label>API key de Anthropic
          <input type="password" id="aiKey" placeholder="sk-ant-..." value="${esc(cfg.key || '')}" autocomplete="off" />
        </label>
        <p class="ai-hint">La obtienes en <b>console.anthropic.com → API Keys</b>. Empieza con <code>sk-ant-</code>.</p>
        </div>
        <label>Modelo
          <select id="aiModel">${opts}</select>
        </label>
        <div class="ai-actions-row">
          <button id="aiTest" class="btn btn-ghost btn-mini" type="button">Probar conexión</button>
          <span id="aiTestStatus" class="ai-test-status"></span>
        </div>
        <p class="ai-hint" style="margin-top:10px">⚠️ Modo BYOK: úsalo para trabajo interno o demos. Para un link público compartido, conviene un proxy con la key en el servidor.</p>
      </div>`;
    function leerFormIa() {
      return { key: ($('#aiKey').value || '').trim(), model: $('#aiModel').value,
               modo: $('#aiModo').value, codigo: ($('#aiCodigo').value || '').trim(),
               proxyUrl: ($('#aiProxy').value || '').trim() };
    }
    openModal('⚙ Ajustes de IA (Claude)', html, () => {
      saveAiConfig(leerFormIa());
      updateAiUi();
    });
    const ok = $('#modalOk'); if (ok) ok.textContent = 'Guardar';
    const selModo = $('#aiModo');
    const pintarModo = () => {
      const eq = selModo.value === 'equipo';
      $('#aiBloqueEquipo').hidden = !eq; $('#aiBloquePropia').hidden = eq;
    };
    if (selModo) { selModo.addEventListener('change', pintarModo); pintarModo(); }
    const test = $('#aiTest');
    if (test) test.addEventListener('click', async () => {
      const st = $('#aiTestStatus');
      const prev = aiConfig();
      saveAiConfig(leerFormIa());
      st.textContent = '⏳ Probando…'; st.className = 'ai-test-status';
      try {
        const r = await callClaude('Responde solo con la palabra: OK', { maxTokens: 256, effort: 'low' });
        st.textContent = /ok/i.test(r) ? '✓ Conexión correcta' : '✓ Respondió: ' + r.slice(0, 20);
        st.className = 'ai-test-status ok';
      } catch (e) {
        st.textContent = '✕ ' + e.message; st.className = 'ai-test-status err';
        saveAiConfig(prev);
      }
    });
  }

  // Refleja en la UI si la IA está configurada (badge en el botón)
  function updateAiUi() {
    const b = $('#btnAiSettings');
    if (b) b.classList.toggle('ai-on', aiReady());
    updateAiModeHint();
  }

  function attachAiListeners() {
    const gear = $('#btnAiSettings');
    if (gear) gear.addEventListener('click', openAiSettings);

    // Botón único: "Generar proceso" (usa el texto pegado)
    const go = $('#btnIngestGo');
    if (go) go.addEventListener('click', () => runIngest(null));

    const addSrc = $('#btnAddSource');
    if (addSrc) addSrc.addEventListener('click', () => { if (!ingestAbort) $('#docFileInput').click(); });

    const cancel = $('#btnIngestCancel');
    if (cancel) cancel.addEventListener('click', cancelIngestJob);

    // Zona de arrastrar y soltar (el gesto principal)
    const dz = $('#dropZone'), fi = $('#docFileInput');
    if (dz && fi) {
      const pick = () => { if (!ingestAbort) fi.click(); };
      dz.addEventListener('click', pick);
      dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation(); dz.classList.add('over');
      }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        if (ev === 'dragleave' && dz.contains(e.relatedTarget)) return;
        dz.classList.remove('over');
      }));
      dz.addEventListener('drop', (e) => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) addFilesAsSources(files);
      });
    }
    updateAiModeHint();
  }

  // Aclara qué motor se usará al pulsar "Generar proceso"
  function updateAiModeHint() {
    const el = $('#ingestAiMode');
    if (!el) return;
    if (aiReady()) {
      const m = (aiConfig().model || 'claude-opus-5').replace('claude-', '').replace('-5', ' 5');
      el.innerHTML = `Se interpretará con <b>IA (${escapeHtml(m)})</b>: reconstruye actividades, roles y decisiones.`;
      el.className = 'ingest-mode on';
    } else {
      el.innerHTML = `Se interpretará con <b>IA (Claude)</b> usando la clave del equipo. Al generar te pediremos el código de acceso; sin él seguirá el <b>modo básico</b> por palabras clave.`;
      el.className = 'ingest-mode';
    }
  }

  // ----------- NLP heurístico: texto → actividades -----------
  function buildProcessFromText(text, source) {
    let activities = parseTextToActivities(text);
    if (activities.length === 0) {
      alert('No pude extraer actividades del texto. Intenta separar por puntos o bullets.');
      return;
    }
    // Guardia: sin IA, un documento largo genera cientos de nodos y el diagrama
    // queda inservible (y el render se arrastra). Recortamos y avisamos.
    const MAX_HEUR_NODES = 60;
    let truncatedAt = 0;
    if (activities.length > MAX_HEUR_NODES) {
      truncatedAt = activities.length;
      activities = activities.slice(0, MAX_HEUR_NODES);
    }

    state.nodes = [];
    state.edges = [];
    state.selectedNodeId = null;

    let x = 80, y = 100;
    const cols = 5;
    const created = [];
    // Inicio
    const startNode = makeNode('start', x, y, 'Inicio');
    created.push(startNode); state.nodes.push(startNode);
    x += SHAPE_DEFAULTS.start.w + 60;

    activities.forEach((a, idx) => {
      const def = SHAPE_DEFAULTS[a.type];
      const defaultExec = a.type === 'system' ? 'system' : (a.type === 'task' ? 'manual' : '');
      const node = {
        id: 'n' + (state.nextId++),
        type: a.type,
        x, y, w: def.w, h: def.h,
        label: a.label,
        executionType: a.executionType || defaultExec,
        owner: a.owner || '', system: a.system || '',
        time: '', volume: '', va: '',
        sla: '', docsIn: '', docsOut: '', rules: '',
        notes: a.note || '', pains: []
      };
      state.nodes.push(node);
      created.push(node);
      x += def.w + 60;
      if (((created.length) % cols) === 0) { x = 80; y += 150; }
    });

    // Fin
    const endNode = makeNode('end', x, y, 'Caso completado');
    created.push(endNode); state.nodes.push(endNode);

    // Conectar linealmente
    for (let i = 0; i < created.length - 1; i++) {
      state.edges.push({ id: 'e' + (state.nextId++), from: created[i].id, to: created[i + 1].id, label: '' });
    }

    ensureDecisionBranches();
    persist();
    autoLayout();  // top-to-bottom MBB
    render();
    maybeFitOnLoad();   // encuadra el proceso generado desde notas/audio si desborda
    activateTab('copilot');
    copilotPost('ai',
      `He construido el flujograma desde la fuente **${source}**.\n\n` +
      `Detecté **${activities.length} actividades** (+ inicio/fin).\n` +
      `Patrones aplicados: actividades con verbos en infinitivo/imperativo, gateways de decisión por condicionales ("si", "cuando", "en caso").\n\n` +
      `Revisa, ajusta etiquetas y completa responsables. Cuando termines pídeme: *"detecta pains"* o *"sugiere KPIs"*.` +
      (truncatedAt ? `\n\n⚠️ **El documento era muy largo** (${truncatedAt} actividades detectadas). Me quedé con las primeras ${activities.length} para que el diagrama siga siendo legible.\n\n**Recomendación:** configura la **IA (⚙ en la cabecera)** — interpreta el documento completo y arma el flujo real con roles y decisiones, en vez de esta extracción por palabras clave.` : ''));
  }

  // ============================================================
  // COMPUERTAS DE CONVERGENCIA (merge)
  // BPMN riguroso: cuando 2+ ramas abiertas por una compuerta vuelven a
  // juntarse, se dibuja la compuerta de cierre en vez de un merge implícito.
  // Es opt-in (acción del copiloto) porque cambia el número de nodos.
  // ============================================================
  function insertMergeGateways() {
    const before = state.nodes.length;
    // Candidatos: nodos con 2+ entradas que NO son compuerta ni fin
    const targets = state.nodes.filter(n => {
      if (n.type === 'decision' || n.type === 'end' || n.type === 'start') return false;
      return state.edges.filter(e => e.to === n.id).length >= 2;
    });
    let added = 0;
    targets.forEach(n => {
      const ins = state.edges.filter(e => e.to === n.id);
      if (ins.length < 2) return;
      // Sólo si alguna de las entradas viene (directa o indirectamente) de una decisión
      const fromDecision = ins.some(e => {
        const src = getNode(e.from);
        return src && (src.type === 'decision' || state.edges.some(x => x.to === src.id && (getNode(x.from) || {}).type === 'decision'));
      });
      if (!fromDecision) return;
      const def = SHAPE_DEFAULTS.decision;
      const merge = {
        id: 'n' + (state.nextId++), type: 'decision', gatewayType: 'exclusive', _merge: true,
        x: n.x - 120, y: n.y, w: def.w, h: def.h,
        label: '', executionType: '', activityCode: '',
        owner: n.owner || '', system: '', time: '', volume: '', va: '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: 'Convergencia de ramas', pains: []
      };
      state.nodes.push(merge);
      ins.forEach(e => { e.to = merge.id; });                       // las ramas entran al merge
      state.edges.push({ id: 'e' + (state.nextId++), from: merge.id, to: n.id, label: '' });
      added++;
    });
    if (!added) {
      copilotPost('ai', 'No encontré convergencias que necesiten compuerta de cierre: las ramas de este proceso terminan en fines distintos o ya convergen en una compuerta.');
      return 0;
    }
    persist();
    autoLayout();
    copilotPost('ai',
      `**${added} compuerta(s) de convergencia insertada(s).**\n\n` +
      `Donde varias ramas volvían a juntarse en una actividad, ahora se dibuja la compuerta de cierre (✕) — es lo que exige el BPMN riguroso y lo que esperan ver los comités.\n\n` +
      `Nodos: ${before} → ${state.nodes.length}. Si prefieres el merge implícito, usa **deshacer** (Ctrl+Z).`);
    return added;
  }

  // Garantiza que cada gateway de decisión tenga 2 salidas con etiquetas Sí/No
  // El end "Caso no procede" hereda el owner del decision (misma lane → sin cruces)
  function ensureDecisionBranches() {
    state.nodes.filter(n => n.type === 'decision').forEach(d => {
      // Gateways paralelos/inclusivos NO usan Sí/No — todas sus ramas se ejecutan
      if (d.gatewayType === 'parallel' || d.gatewayType === 'inclusive') return;
      const outs = state.edges.filter(e => e.from === d.id);
      if (outs.length === 0) return; // huérfano — el linter lo capta
      if (outs.length === 1) {
        if (!outs[0].label || !outs[0].label.trim()) outs[0].label = 'Sí';
        // SIEMPRE crea un end nuevo dedicado a este decision (no reusa)
        // así cada "Caso no procede" tiene rank+1 desde su decision y queda en misma lane
        const def = SHAPE_DEFAULTS.end;
        const altEnd = {
          id: 'n' + (state.nextId++),
          type: 'end',
          x: d.x + 180, y: d.y + 80,
          w: def.w, h: def.h,
          label: 'Caso no procede',
          executionType: '',
          owner: d.owner || '',           // hereda owner del decision
          system: '', time: '', volume: '', va: '',
          sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: [],
          _autoGen: true                  // marca como auto-generado
        };
        state.nodes.push(altEnd);
        state.edges.push({ id: 'e' + (state.nextId++), from: d.id, to: altEnd.id, label: 'No' });
      } else if (outs.length >= 2) {
        if (!outs[0].label || !outs[0].label.trim()) outs[0].label = 'Sí';
        if (!outs[1].label || !outs[1].label.trim()) outs[1].label = 'No';
      }
    });
  }

  // Asigna códigos de actividad estilo BPMN/MBC: [USR-27], [RCV-18], etc.
  // Estables: solo asigna a nodos que no tengan código aún. Numeración por prefijo.
  function assignActivityCodes() {
    const counters = {};
    // Inicializa contadores con códigos ya existentes (para no repetir)
    state.nodes.forEach(n => {
      if (n.activityCode) {
        const m = n.activityCode.match(/^\[?([A-Z]+)-(\d+)\]?$/);
        if (m) counters[m[1]] = Math.max(counters[m[1]] || 0, parseInt(m[2], 10));
      }
    });
    // Recorre en orden de rank (si existe) para numerar de izquierda a derecha
    const ranks = state._lanes?.ranks || {};
    const ordered = state.nodes.slice().sort((a, b) => (ranks[a.id] || 0) - (ranks[b.id] || 0));
    ordered.forEach(n => {
      if (n.type !== 'task' && n.type !== 'system') return;
      if (n.activityCode) return; // ya tiene → respeta edición manual
      const exec = (window.EXECUTION_TYPES || []).find(t => t.id === n.executionType);
      const prefix = (exec && exec.codePrefix) || 'ACT';
      counters[prefix] = (counters[prefix] || 0) + 1;
      n.activityCode = `${prefix}-${String(counters[prefix]).padStart(2, '0')}`;
    });
  }

  // Computa el owner final de cada nodo: explícito → inferido (predecesor/sucesor) → más frecuente
  // Marca n._inferredOwner = true cuando el owner se infirió (para mostrar alerta visual)
  function computeOwners() {
    const final = {};
    state.nodes.forEach(n => {
      n._inferredOwner = false;
      if (n.owner && n.owner.trim()) final[n.id] = n.owner.trim();
    });

    // Owner más frecuente (para fallback)
    const counts = {};
    Object.values(final).forEach(o => { counts[o] = (counts[o] || 0) + 1; });
    let mostFrequent = null, bestC = 0;
    Object.entries(counts).forEach(([k, c]) => { if (c > bestC) { mostFrequent = k; bestC = c; } });

    const inMap = {}, outMap = {};
    state.edges.forEach(e => {
      (outMap[e.from] = outMap[e.from] || []).push(e.to);
      (inMap[e.to] = inMap[e.to] || []).push(e.from);
    });

    // Walk predecesores buscando owner
    function walkPred(id, visited) {
      if (final[id]) return final[id];
      if (visited.has(id)) return null;
      visited.add(id);
      for (const p of (inMap[id] || [])) {
        const o = walkPred(p, visited);
        if (o) return o;
      }
      return null;
    }
    // Walk sucesores buscando owner
    function walkSucc(id, visited) {
      if (final[id]) return final[id];
      if (visited.has(id)) return null;
      visited.add(id);
      for (const s of (outMap[id] || [])) {
        const o = walkSucc(s, visited);
        if (o) return o;
      }
      return null;
    }

    // Pasa 2: nodos sin owner → inferir
    state.nodes.forEach(n => {
      if (final[n.id]) return;
      let inferred = null;
      if (n.type === 'start') {
        inferred = walkSucc(n.id, new Set());
      } else if (n.type === 'end') {
        inferred = walkPred(n.id, new Set()) || walkSucc(n.id, new Set());
      } else {
        inferred = walkPred(n.id, new Set()) || walkSucc(n.id, new Set());
      }
      if (!inferred) inferred = mostFrequent || 'Por asignar';
      final[n.id] = inferred;
      n._inferredOwner = true;
    });

    return final;
  }

  function makeNode(type, x, y, label) {
    const def = SHAPE_DEFAULTS[type];
    const defaultExec = type === 'system' ? 'system' : (type === 'task' ? 'manual' : '');
    return {
      id: 'n' + (state.nextId++), type,
      x, y, w: def.w, h: def.h,
      label, executionType: defaultExec,
      owner: '', system: '', time: '', volume: '', va: '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: []
    };
  }

  function parseTextToActivities(text) {
    const VERBS = ['registr','valid','aprob','revis','verific','captur','envi','reciv','recib','proces','genera','emit','firm','autoriz','rechaz','notific','consult','calcul','asign','clasific','derivar','escalar','conciliar','liquid','pag','cobr','despach','entreg','crear','actualiz','elimin','solicit','complet','llen','document','archiv','digit','escan','impr','contact','llamar','reun','analiz','evalu','diagnostic','transferir','elevar','ingresar','retir','depositar','girar','desembolsar','tramitar','gestionar','atender','resolver','programar','agendar','coordinar','informar','reportar','imprimir','adjunt','remitir','devolver','abrir','identificar','perfilar','navegar','alternar','explicar','simular','ofrecer','presentar','recibir','saludar','preguntar','realizar','iniciar','cerrar','seguir','continuar','proceder'];
    // Decisiones: requieren marca explícita de condición/pregunta, NO solo "cuando/dependiendo" narrativos
    const DECISION_HINTS = ['¿', 'si es', 'si no', 'sino', 'caso contrario', 'en caso de', 'de no ser'];
    const DECISION_VERBS = ['decide','cumple','aprueba','rechaza','tiene','requiere','necesita','existe','está','es elegible','es aprobado','califica','excede','supera','identifico','encuentro','detecto','identifica','encuentra','detecta','hay'];
    const NARRATIVE_STARTERS = ['cuando inicio', 'cuando un cliente', 'cuando empiezo', 'cuando termino', 'cuando llega', 'dependiendo de', 'durante', 'mientras', 'generalmente', 'normalmente', 'finalmente', 'también', 'luego', 'primero'];
    // Lista priorizada — roles más específicos primero
    const ROLES = ['ejecutivo comercial','asesor comercial','asesor bancario','agente comercial','back office','call center','recursos humanos','jefe de','gerente comercial','gerente de','analista de','coordinador','supervisor','tesorería','tesoreria','compliance','riesgos','operaciones','logística','logistica','almacén','almacen','compras','sistemas','contabilidad','auditoría','auditoria','rrhh','frontline','comercial','analista','gerente','asesor','ejecutivo','operario','jefe','cliente','usuario','proveedor'];
    const SYSTEMS = ['salesforce','servicenow','sharepoint','bizagi','sap','oracle','siebel','siaf','siga','workflow','portal','excel','jira','crm','erp','wms','tms','cms','core','motor de ofertas','motor de riesgo','scoring'];
    // Verbo en 1ra persona singular → infinitivo
    const FIRST_PERSON = {
      'abro':'Abrir','ingreso':'Ingresar','reviso':'Revisar','solicito':'Solicitar','realizo':'Realizar',
      'verifico':'Verificar','explico':'Explicar','contacto':'Contactar','navego':'Navegar','alterno':'Alternar',
      'saludo':'Saludar','identifico':'Identificar','pregunto':'Preguntar','hago':'Realizar','genero':'Generar',
      'escaneo':'Escanear','envío':'Enviar','envio':'Enviar','llamo':'Llamar','recibo':'Recibir','consulto':'Consultar',
      'analizo':'Analizar','procedo':'Proceder','continúo':'Continuar','continuo':'Continuar','registro':'Registrar',
      'valido':'Validar','apruebo':'Aprobar','rechazo':'Rechazar','asigno':'Asignar','clasifico':'Clasificar',
      'escalo':'Escalar','notifico':'Notificar','firmo':'Firmar','imprimo':'Imprimir','adjunto':'Adjuntar',
      'reciba':'Recibir','simulo':'Simular','ofrezco':'Ofrecer','presento':'Presentar','calculo':'Calcular',
      'preparo':'Preparar','redacto':'Redactar','comparo':'Comparar','evalúo':'Evaluar','evaluo':'Evaluar',
      'investigo':'Investigar','resuelvo':'Resolver','coordino':'Coordinar','informo':'Informar','reporto':'Reportar'
    };

    function isDecisionSentence(s) {
      const lower = s.toLowerCase().trim();
      if (/¿.+\?/.test(s)) return true;
      if (DECISION_HINTS.some(h => lower.startsWith(h) || lower.includes(' ' + h))) return true;
      // Patrón "si + sujeto + verbo de decisión"
      if (/^si\s+/.test(lower) && DECISION_VERBS.some(dv => lower.includes(dv))) return true;
      return false;
    }

    function isNarrativeStart(s) {
      const lower = s.toLowerCase().trim();
      return NARRATIVE_STARTERS.some(n => lower.startsWith(n));
    }

    // Estilo cavernícola: "Verbo + 1-2 objetos", máx 25 chars
    // Ej: "Ingresar carta", "Responder email", "Validar identidad", "Escalar caso"
    function extractLabel(s) {
      const STOPWORDS = new Set([
        'el','la','los','las','un','una','unos','unas','de','del','al','a','con','para','por','que','en','y','o','u',
        'su','sus','mi','mis','tu','tus','este','esta','estos','estas','ese','esa','le','les','me','te','se','lo',
        'muy','también','tambien','generalmente','normalmente','luego','después','despues','primero','finalmente',
        'siempre','algunas','algunos','veces','vez','durante','mientras','cuando','si','dependiendo','toda','todo','todas','todos',
        'esto','eso','aquí','aqui','allí','alli','aún','aun','ya','no','sí','si','muy','más','mas','menos','entre',
        'sobre','bajo','tras','según','segun','hacia','desde','sin','contra','ante','toda','todo','dos','tres','cinco','diez',
        'yo','tú','tu','él','el','ella','nosotros','ustedes','ellos','ellas','quien','quienes','cuyo','cuya',
        'pueden','puedo','puede','debe','debo','debemos','debes','va','vas','voy','vamos','vez','siguiente',
        'parte','etapa','proceso','conversación','minutos','horas','día','dia','manera','forma','momento',
        'oficina','ejecutivo','asesor','agente','cliente','clientes','banco','sistema','sistemas','plataforma',
        'información','datos','dato','aproximadamente','primer','primera','segundo','segunda','tercer','tercera',
        'mejor','peor','siguiente','anterior','algún','algun','alguna','algunos','algunas','ningún','ninguna',
        'cada','toda','todas','algo','nada','alguien','nadie','quién','cuál','cuáles','cuanto','cuanta','cuantos','cuantas'
      ]);

      // Verbos en infinitivo conocidos en el catálogo MBB (para detección rápida)
      const allowed = window.VERBS_ALLOWED || [];

      // Tokeniza limpiando puntuación
      const tokens = s.replace(/[¿?¡!.,;:()"'`""'']/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);

      // Busca el primer verbo (en orden):
      // 1) 1ra persona conjugada → infinitivo
      // 2) Verbo del catálogo (infinitivo o forma reconocida)
      // 3) Cualquier palabra que termine en -ar/-er/-ir y tenga ≥4 letras
      // Verbos parásitos: si aparecen primero, los saltamos para buscar el verbo real
      const PARASITE = new Set(['Realizar', 'Hacer', 'Gestionar', 'Procesar', 'Tratar', 'Manejar', 'Ejecutar', 'Proceder', 'Continuar', 'Comenzar', 'Empezar']);
      let verbInf = null, verbIdx = -1;
      let parasiteFallback = null, parasiteIdx = -1;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (FIRST_PERSON[t]) {
          const cand = FIRST_PERSON[t];
          if (PARASITE.has(cand)) {           // guarda como fallback, sigue buscando verbo real
            if (!parasiteFallback) { parasiteFallback = cand; parasiteIdx = i; }
            continue;
          }
          verbInf = cand; verbIdx = i; break;
        }
        // Verbos con pronombres enclíticos (contactarlos → Contactar)
        const stripped = t.replace(/(los|las|le|les|me|te|se|lo|la|nos)$/i, '');
        if (/(ar|er|ir)$/.test(stripped) && stripped.length >= 4 && allowed.some(v => stripped.startsWith(v))) {
          verbInf = stripped.charAt(0).toUpperCase() + stripped.slice(1);
          verbIdx = i; break;
        }
        if (/(ar|er|ir)$/.test(t) && t.length >= 4 && allowed.some(v => t.startsWith(v))) {
          const cand = t.charAt(0).toUpperCase() + t.slice(1);
          if (PARASITE.has(cand)) { if (!parasiteFallback) { parasiteFallback = cand; parasiteIdx = i; } continue; }
          verbInf = cand; verbIdx = i; break;
        }
      }
      // Si solo hubo verbo parásito, úsalo como último recurso
      if (!verbInf && parasiteFallback) { verbInf = parasiteFallback; verbIdx = parasiteIdx; }
      // Fallback: cualquier infinitivo aunque no esté en catálogo (stripeando enclíticos)
      if (!verbInf) {
        for (let i = 0; i < tokens.length; i++) {
          const raw = tokens[i];
          const t = raw.replace(/(los|las|le|les|me|te|se|lo|la|nos)$/i, '');
          if (/(ar|er|ir)$/.test(t) && t.length >= 5 && !STOPWORDS.has(t)) {
            const cand = t.charAt(0).toUpperCase() + t.slice(1);
            if (PARASITE.has(cand)) { if (!parasiteFallback) { parasiteFallback = cand; parasiteIdx = i; } continue; }
            verbInf = cand; verbIdx = i; break;
          }
        }
        if (!verbInf && parasiteFallback) { verbInf = parasiteFallback; verbIdx = parasiteIdx; }
      }

      if (!verbInf) return null; // sin verbo → no es actividad

      // Toma 1-2 substantivos después del verbo (descarta stopwords y preposiciones)
      const objs = [];
      for (let i = verbIdx + 1; i < tokens.length && objs.length < 2; i++) {
        const t = tokens[i];
        if (STOPWORDS.has(t)) continue;
        if (t.length < 3) continue;
        objs.push(t);
      }

      let label = (verbInf + (objs.length ? ' ' + objs.join(' ') : '')).trim();
      // Cap a 28 chars
      if (label.length > 28) label = label.slice(0, 25) + '…';
      return label;
    }

    // Limpia bullets/numeración y separa
    const cleaned = text
      .replace(/\r/g, '')
      .replace(/^[\s]*([0-9]+[\.\)]|[\-\*•·])\s*/gm, '');

    // Split por punto seguido de espacio, ; o saltos de línea
    const raw = cleaned.split(/(?:\.[\s\n]+|;[\s\n]+|\n+)/).map(s => s.trim()).filter(s => s.length >= 5);

    // Sub-split: divide oraciones largas en sub-cláusulas accionables
    // Filtra fragmentos cortos sin verbo (ej. "Teléfono", "Objetivos") que generan nodos basura
    const sentences = [];
    raw.forEach(s => {
      const subs = s.split(/(?:\.[\s]+|\s+también\s+|\s+luego\s+)/i).map(x => x.trim());
      const validSubs = subs.filter(x => {
        if (x.length < 20) return false;
        // Debe contener un verbo conocido O empezar como decisión
        const lower = x.toLowerCase();
        const hasVerbHere = VERBS.some(v => lower.includes(v)) ||
                            Object.keys(FIRST_PERSON).some(fp => new RegExp('\\b' + fp + '\\b').test(lower));
        const looksDecision = /^(si|cuando)\s+/.test(lower);
        return hasVerbHere || looksDecision;
      });
      if (validSubs.length <= 1) sentences.push(s); else sentences.push(...validSubs);
    });

    const activities = [];
    sentences.forEach(sentence => {
      const lower = sentence.toLowerCase();

      // Es decisión? (estricto)
      const isDecision = isDecisionSentence(sentence);

      // Saltar narrativas puras sin acción
      const startsNarrative = isNarrativeStart(sentence);
      const hasActionVerb = VERBS.some(v => lower.includes(v)) ||
                            Object.keys(FIRST_PERSON).some(fp => new RegExp('\\b' + fp + '\\b').test(lower));

      if (!isDecision && !hasActionVerb) return;
      // Si es narrativa pura sin acción real, skip
      if (startsNarrative && !hasActionVerb && !isDecision) return;

      // Detección de rol: prefiere "ejecutivo comercial" para textos de banca
      let owner = '';
      for (const r of ROLES) {
        // Busca el rol como palabra exacta (con bordes)
        const re = new RegExp('\\b' + r.replace(/\s+/g, '\\s+') + '\\b', 'i');
        if (re.test(lower)) {
          // Evita asignar "cliente" si la frase es claramente del ejecutivo actuando SOBRE el cliente
          if (r === 'cliente' && /\b(saludo|atiendo|identifico|registro|contacto|llamo|hablo|verifico|explico|ingreso|valido|reviso|consulto|solicito|envío|envio|escalo|notifico|genero|firmo|escaneo|adjunto|asigno|clasifico|aprueba|cumple|decide)\b/i.test(lower)) {
            // Si la frase es del ejecutivo, prefiere "Ejecutivo Comercial"
            owner = 'Ejecutivo Comercial';
            break;
          }
          owner = titleCase(r); break;
        }
      }

      // Extrae sistema
      let system = '';
      for (const s of SYSTEMS) {
        if (lower.includes(s)) { system = s.toUpperCase(); break; }
      }

      // Genera label: extraer verbo + objeto
      let label = extractLabel(sentence);
      if (!label || label.length < 4) return;

      // REGLA HARD: toda actividad (NO decisión) debe empezar con verbo en infinitivo
      if (!isDecision) {
        const firstWord = label.split(/\s+/)[0].toLowerCase().replace(/[^a-záéíóúñ]/g, '');
        const isInfinitiveEnding = /(?:ar|er|ir)$/i.test(firstWord) && firstWord.length >= 4;
        const isInCatalog = (window.VERBS_ALLOWED || []).some(v => firstWord.startsWith(v));
        if (!isInfinitiveEnding && !isInCatalog) {
          // Intento de salvataje: si la oración tiene un verbo conjugado conocido, lo reemplazo
          let salvaged = false;
          for (const conj in FIRST_PERSON) {
            if (new RegExp('\\b' + conj + '\\b', 'i').test(lower)) {
              label = FIRST_PERSON[conj] + ' ' + label.replace(/^\S+\s*/, '').trim();
              salvaged = true; break;
            }
          }
          if (!salvaged) return; // descartar — no es actividad válida
        }
      }

      // Inferir tipo de ejecución
      let executionType = '';
      if (isDecision) {
        executionType = '';
      } else if (/correo\b|email\b|e-?mail\b|notific/.test(lower)) {
        executionType = 'email';
      } else if (/\bllam[ao]|teléfono|telefono|\bcall\b|presencial/.test(lower)) {
        executionType = 'phone';
      } else if (/automátic|automatic|batch|nightly|trigger|sistema autom|motor de riesg|validaciones automátic|consultas? a motor/.test(lower)) {
        executionType = 'automatic';
      } else if (/\bia\b|inteligencia artificial|copilot|machine learn|\bml\b|modelo predict/.test(lower)) {
        executionType = 'ai';
      } else if (/firma física|papel|sello|expediente físic|contrato físic|firmar/.test(lower)) {
        executionType = 'document';
      } else if (/\brpa\b|\bbot\b/.test(lower)) {
        executionType = 'rpa';
      } else if (system) {
        executionType = 'system';
      } else {
        executionType = 'manual';
      }

      activities.push({
        type: isDecision ? 'decision' : (system ? 'system' : 'task'),
        label,
        owner,
        system,
        executionType,
        note: sentence
      });
    });

    return activities;
  }

  function titleCase(s) {
    return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ----------- CSV Event Log → Process Discovery ligero -----------
  function handleCsvFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(reader.result);
      previewCsv(parsed);
    };
    reader.readAsText(f);
  }

  function loadCsvSample() {
    // Event log de muestra: 15 casos · 4 variantes (happy 53% · rechazo 20% · reproceso 13% · riesgo 13%)
    const sample =
`case_id,activity,timestamp,resource
1001,Recibir solicitud,2026-01-10 09:00,Call Center
1001,Validar datos,2026-01-10 09:12,Analista
1001,Aprobar solicitud,2026-01-10 09:24,Gerente
1001,Procesar en core,2026-01-10 09:36,Operaciones
1001,Notificar cliente,2026-01-10 09:48,Call Center
1002,Recibir solicitud,2026-01-10 09:00,Call Center
1002,Validar datos,2026-01-10 09:12,Analista
1002,Aprobar solicitud,2026-01-10 09:24,Gerente
1002,Procesar en core,2026-01-10 09:36,Operaciones
1002,Notificar cliente,2026-01-10 09:48,Call Center
1003,Recibir solicitud,2026-01-10 09:00,Call Center
1003,Validar datos,2026-01-10 09:12,Analista
1003,Aprobar solicitud,2026-01-10 09:24,Gerente
1003,Procesar en core,2026-01-10 09:36,Operaciones
1003,Notificar cliente,2026-01-10 09:48,Call Center
1004,Recibir solicitud,2026-01-10 09:00,Call Center
1004,Validar datos,2026-01-10 09:12,Analista
1004,Aprobar solicitud,2026-01-10 09:24,Gerente
1004,Procesar en core,2026-01-10 09:36,Operaciones
1004,Notificar cliente,2026-01-10 09:48,Call Center
1005,Recibir solicitud,2026-01-11 09:00,Call Center
1005,Validar datos,2026-01-11 09:12,Analista
1005,Aprobar solicitud,2026-01-11 09:24,Gerente
1005,Procesar en core,2026-01-11 09:36,Operaciones
1005,Notificar cliente,2026-01-11 09:48,Call Center
1006,Recibir solicitud,2026-01-11 09:00,Call Center
1006,Validar datos,2026-01-11 09:12,Analista
1006,Aprobar solicitud,2026-01-11 09:24,Gerente
1006,Procesar en core,2026-01-11 09:36,Operaciones
1006,Notificar cliente,2026-01-11 09:48,Call Center
1007,Recibir solicitud,2026-01-11 09:00,Call Center
1007,Validar datos,2026-01-11 09:12,Analista
1007,Aprobar solicitud,2026-01-11 09:24,Gerente
1007,Procesar en core,2026-01-11 09:36,Operaciones
1007,Notificar cliente,2026-01-11 09:48,Call Center
1008,Recibir solicitud,2026-01-11 09:00,Call Center
1008,Validar datos,2026-01-11 09:12,Analista
1008,Aprobar solicitud,2026-01-11 09:24,Gerente
1008,Procesar en core,2026-01-11 09:36,Operaciones
1008,Notificar cliente,2026-01-11 09:48,Call Center
1009,Recibir solicitud,2026-01-12 09:00,Call Center
1009,Validar datos,2026-01-12 09:12,Analista
1009,Rechazar solicitud,2026-01-12 09:24,Analista
1009,Notificar cliente,2026-01-12 09:36,Call Center
1010,Recibir solicitud,2026-01-12 09:00,Call Center
1010,Validar datos,2026-01-12 09:12,Analista
1010,Rechazar solicitud,2026-01-12 09:24,Analista
1010,Notificar cliente,2026-01-12 09:36,Call Center
1011,Recibir solicitud,2026-01-12 09:00,Call Center
1011,Validar datos,2026-01-12 09:12,Analista
1011,Rechazar solicitud,2026-01-12 09:24,Analista
1011,Notificar cliente,2026-01-12 09:36,Call Center
1012,Recibir solicitud,2026-01-12 09:00,Call Center
1012,Validar datos,2026-01-12 09:12,Analista
1012,Solicitar info adicional,2026-01-12 09:24,Call Center
1012,Validar datos,2026-01-12 09:36,Analista
1012,Aprobar solicitud,2026-01-12 09:48,Gerente
1012,Procesar en core,2026-01-12 10:00,Operaciones
1012,Notificar cliente,2026-01-12 10:12,Call Center
1013,Recibir solicitud,2026-01-13 09:00,Call Center
1013,Validar datos,2026-01-13 09:12,Analista
1013,Solicitar info adicional,2026-01-13 09:24,Call Center
1013,Validar datos,2026-01-13 09:36,Analista
1013,Aprobar solicitud,2026-01-13 09:48,Gerente
1013,Procesar en core,2026-01-13 10:00,Operaciones
1013,Notificar cliente,2026-01-13 10:12,Call Center
1014,Recibir solicitud,2026-01-13 09:00,Call Center
1014,Validar datos,2026-01-13 09:12,Analista
1014,Aprobar solicitud,2026-01-13 09:24,Gerente
1014,Revisar riesgo,2026-01-13 09:36,Riesgos
1014,Procesar en core,2026-01-13 09:48,Operaciones
1014,Notificar cliente,2026-01-13 10:00,Call Center
1015,Recibir solicitud,2026-01-13 09:00,Call Center
1015,Validar datos,2026-01-13 09:12,Analista
1015,Aprobar solicitud,2026-01-13 09:24,Gerente
1015,Revisar riesgo,2026-01-13 09:36,Riesgos
1015,Procesar en core,2026-01-13 09:48,Operaciones
1015,Notificar cliente,2026-01-13 10:00,Call Center`;
    const parsed = parseCsv(sample);
    previewCsv(parsed);
  }

  function parseCsv(text) {
    const sep = (text.indexOf('\t') > -1 && text.indexOf(',') === -1) ? '\t' : ',';
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = parseCsvLine(lines[0], sep).map(h => h.trim());
    const rows = lines.slice(1).map(l => {
      const cells = parseCsvLine(l, sep);
      const obj = {};
      headers.forEach((h, i) => obj[h] = (cells[i] || '').trim());
      return obj;
    });
    return { headers, rows };
  }

  // RFC 4180 — respeta comillas dobles, escaped quotes (""), separadores dentro de comillas
  function parseCsvLine(line, sep) {
    const out = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === sep) { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function previewCsv(parsed) {
    window._csvData = parsed;
    const preview = $('#csvPreview');
    preview.hidden = false;
    const sample = parsed.rows.slice(0, 6);
    let txt = parsed.headers.join(' | ') + '\n' + '-'.repeat(60) + '\n';
    sample.forEach(r => { txt += parsed.headers.map(h => r[h]).join(' | ') + '\n'; });
    txt += `\n(${parsed.rows.length} filas totales)`;
    preview.textContent = txt;

    // Llena mapping selects
    const guess = (kw) => parsed.headers.find(h => kw.some(k => h.toLowerCase().includes(k))) || parsed.headers[0];
    ['mapCase', 'mapAct', 'mapTs', 'mapRes'].forEach(id => {
      const sel = $('#' + id);
      sel.innerHTML = '';
      if (id === 'mapRes') sel.insertAdjacentHTML('beforeend', '<option value="">(ninguna)</option>');
      parsed.headers.forEach(h => sel.insertAdjacentHTML('beforeend', `<option value="${h}">${h}</option>`));
    });
    $('#mapCase').value = guess(['case', 'id']);
    $('#mapAct').value  = guess(['act', 'task', 'event', 'step']);
    $('#mapTs').value   = guess(['time', 'date', 'fecha', 'ts']);
    const resGuess = parsed.headers.find(h => ['user','res','owner','role','rol','responsab'].some(k => h.toLowerCase().includes(k)));
    $('#mapRes').value = resGuess || '';

    $('#csvMapping').hidden = false;
    $('#btnIngestCsv').disabled = false;
  }

  function buildProcessFromEventLog(parsed, map) {
    if (!parsed) return;
    const { rows } = parsed;

    // Agrupa por case
    const cases = {};
    rows.forEach(r => {
      const id = r[map.case];
      if (!id) return;
      (cases[id] = cases[id] || []).push({
        activity: r[map.act],
        ts: r[map.ts],
        resource: map.res ? r[map.res] : ''
      });
    });

    // Ordena por timestamp dentro de cada case
    Object.values(cases).forEach(events => {
      events.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    });

    // ── Variantes: agrupa casos por su secuencia de actividades (F4) ──
    const variantMap = {};
    const totalCasesN = Object.keys(cases).length;
    Object.values(cases).forEach(events => {
      const seq = events.map(e => e.activity).filter(Boolean).join(' → ');
      if (!seq) return;
      variantMap[seq] = (variantMap[seq] || 0) + 1;
    });
    state._variants = Object.entries(variantMap)
      .map(([seq, count]) => ({ seq, count, pct: Math.round(count / totalCasesN * 100), steps: seq.split(' → ').length }))
      .sort((a, b) => b.count - a.count);
    state._variantsTotalCases = totalCasesN;

    // Frecuencia de actividades y de transiciones (directly-follows)
    const actFreq = {};
    const actResource = {};
    const transFreq = {};
    Object.values(cases).forEach(events => {
      events.forEach((e, i) => {
        if (!e.activity) return;
        actFreq[e.activity] = (actFreq[e.activity] || 0) + 1;
        if (e.resource && !actResource[e.activity]) actResource[e.activity] = e.resource;
        if (i > 0 && events[i-1].activity) {
          const key = events[i-1].activity + '→' + e.activity;
          transFreq[key] = (transFreq[key] || 0) + 1;
        }
      });
    });

    const allActs = Object.entries(actFreq).sort((a,b) => b[1] - a[1]).map(([n]) => n);

    // Detecta start/end (actividades con muchas como primera/última en su caso)
    const startActs = {};
    const endActs = {};
    Object.values(cases).forEach(events => {
      if (events.length === 0) return;
      const first = events[0].activity, last = events[events.length-1].activity;
      if (first) startActs[first] = (startActs[first] || 0) + 1;
      if (last)  endActs[last]    = (endActs[last]    || 0) + 1;
    });

    // Construye diagrama
    state.nodes = [];
    state.edges = [];
    state.selectedNodeId = null;

    const startNode = makeNode('start', 80, 100, 'Inicio');
    const endNode   = makeNode('end',   80, 100, 'Fin');
    state.nodes.push(startNode);

    const nodeMap = {};
    let x = 220, y = 100;
    const cols = 4;
    allActs.forEach((act, idx) => {
      const isSystem = /(sistema|sap|crm|erp|core|portal)/i.test(act);
      const def = SHAPE_DEFAULTS[isSystem ? 'system' : 'task'];
      const node = {
        id: 'n' + (state.nextId++),
        type: isSystem ? 'system' : 'task',
        x, y, w: def.w, h: def.h,
        label: act,
        owner: actResource[act] || '',
        system: '', time: '',
        volume: String(actFreq[act]),
        va: '', notes: `Frecuencia observada: ${actFreq[act]}`, pains: []
      };
      state.nodes.push(node);
      nodeMap[act] = node;
      x += def.w + 60;
      if ((idx + 1) % cols === 0) { x = 220; y += 140; }
    });

    state.nodes.push(endNode);

    // Conecta start → top-2 actividades iniciales
    Object.entries(startActs).sort((a,b)=>b[1]-a[1]).slice(0,2).forEach(([act, freq]) => {
      if (nodeMap[act]) state.edges.push({ id: 'e' + (state.nextId++), from: startNode.id, to: nodeMap[act].id, label: `${freq} cases` });
    });

    // Conecta transiciones (filtra ruido: solo las que ocurren ≥ 10% del top)
    const transitions = Object.entries(transFreq).sort((a,b)=>b[1]-a[1]);
    const threshold = Math.max(1, Math.floor(transitions[0][1] * 0.1));
    transitions.forEach(([key, freq]) => {
      if (freq < threshold) return;
      const [from, to] = key.split('→');
      if (nodeMap[from] && nodeMap[to]) {
        state.edges.push({ id: 'e' + (state.nextId++), from: nodeMap[from].id, to: nodeMap[to].id, label: String(freq) });
      }
    });

    // Conecta top actividades finales → end
    Object.entries(endActs).sort((a,b)=>b[1]-a[1]).slice(0,2).forEach(([act, freq]) => {
      if (nodeMap[act]) state.edges.push({ id: 'e' + (state.nextId++), from: nodeMap[act].id, to: endNode.id, label: `${freq} cases` });
    });

    // Reposiciona end al final
    endNode.x = x + 100;
    endNode.y = y;

    persist();
    autoLayout();
    maybeFitOnLoad();   // encuadra el proceso descubierto si desborda la pantalla

    const totalCases = Object.keys(cases).length;
    activateTab('copilot');
    copilotPost('ai',
      `**Process discovery completado** desde event log.\n\n` +
      `• **${totalCases} casos** analizados\n` +
      `• **${allActs.length} actividades únicas** detectadas\n` +
      `• **${transitions.length} transiciones** descubiertas (mostrando las más frecuentes)\n` +
      `• Top inicio: *${Object.entries(startActs).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—'}*\n` +
      `• Top fin: *${Object.entries(endActs).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—'}*\n\n` +
      `El número en cada conexión = frecuencia observada. Las actividades con alta frecuencia que reaparecen son indicio de **reprocesos** (pain candidato).`);
  }

  // Aviso para pantallas estrechas (link público abierto en móvil)
  function attachMobileNotice() {
    const notice = $('#mobileNotice');
    if (!notice) return;
    if (window.innerWidth < 720) notice.hidden = false;
    const cont = $('#btnMobileContinue');
    if (cont) cont.addEventListener('click', () => { notice.hidden = true; });
  }

  // =================== BOOT ===================
  document.addEventListener('DOMContentLoaded', () => {
    init();
    attachIngestListeners();
  });
})();
