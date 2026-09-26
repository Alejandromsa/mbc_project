// Integración del editor con la plataforma (fase 2.2).
//
//   /?proceso=<id>    abre la última revisión de un proceso (o el proceso vacío)
//   /?revision=<id>   abre una revisión concreta
//
// Sin esos parámetros este módulo no hace nada: el editor funciona como en el
// MVP, con el trabajo en este navegador ('processiq.v1').
//
// Con ellos:
// - el trabajo se guarda en local en una clave propia del proceso (un borrador
//   que sobrevive a recargas y no pisa el trabajo libre);
// - «Guardar revisión» (o Ctrl+S) crea una versión nueva en el servidor, con la
//   revisión abierta como punto de partida (si alguien guardó antes, se avisa);
// - una barra sobre el lienzo dice qué se está editando y si hay cambios sin guardar.
import { CLAVES_EFIMERAS, migrarProyecto } from '@processiq/dominio';
import { api, ErrorApi } from '../../shell/api';
import { ESTADOS, ROLES_PROYECTO, fecha } from '../../shell/formato';
import { puede } from '../../shell/permisos';
import { alCambiar } from '../cambios.js';
import { $ } from '../dom.js';
import { normalizeFicha, state, usarClaveAlmacen } from '../estado.js';
import { resetHistory } from '../historial.js';
import { updateAiUi } from '../ia/ajustes.js';
import { buildProcessFromAiSpec } from '../ia/generacion.js';
import { usarIaRemota } from '../ia/remota.js';
import { autoLayout } from '../layout/auto-layout.js';
import { aplicarNivel } from '../layout/niveles.js';
import { render } from '../lienzo/render.js';
import { maybeFitOnLoad } from '../lienzo/zoom.js';
import { renderProperties } from '../paneles/propiedades.js';
import { persist } from '../persistencia.js';
import { runLinter } from '../validacion/lint.js';
import { updateViewUi } from '../vistas/comparador.js';
import './barra.css';
import { aplicarCatalogos } from './catalogos.js';
import { crearIaRemota } from './ia.js';

const parametros = new URLSearchParams(location.search);
const pedidoRevision = parametros.get('revision');
const pedidoProceso = parametros.get('proceso');

const CLAVE_ABRIENDO = 'processiq.abriendo';
const claveBorrador = (procesoId) => `processiq.proceso.${procesoId}`;

const ctx = {
  proceso: null, proyecto: null, rol: null,
  base: null,          // revisión abierta o última guardada: { id, numero, estado } (null = proceso sin revisiones)
  ultima: null,        // última revisión del servidor al abrir: { id, numero }
  huellaGuardada: '',  // huella del contenido de ctx.base, para saber si hay cambios
  sucio: false,
  guardando: false
};

if (pedidoRevision || pedidoProceso) {
  // Mientras llega la revisión, el editor arranca vacío (sin cargar el trabajo libre).
  // inicio.js registra su arranque antes que este módulo: abrir() corre después.
  try { localStorage.removeItem(CLAVE_ABRIENDO); } catch { /* sin almacenamiento */ }
  usarClaveAlmacen(CLAVE_ABRIENDO);
  document.addEventListener('DOMContentLoaded', () => { abrir(); });
}

// =================== Contenido y huella ===================

const sinCaches = (lista) => (Array.isArray(lista)
  ? lista.map((o) => { const r = { ...o }; for (const k of CLAVES_EFIMERAS) delete r[k]; return r; })
  : lista);

/** El proceso tal como se guarda, a partir de un snapshot con la forma de persist(). */
function contenidoDe(s) {
  const views = s.views && typeof s.views === 'object'
    ? Object.fromEntries(Object.entries(s.views).map(([k, v]) => [k, v && typeof v === 'object' ? { ...v, nodes: sinCaches(v.nodes), edges: sinCaches(v.edges) } : v]))
    : undefined;
  return {
    meta: s.meta, ficha: s.ficha, nodes: sinCaches(s.nodes || []), edges: sinCaches(s.edges || []),
    activeView: s.activeView, views,
    raci: s.raci ?? null, sipoc: s.sipoc ?? null, simResults: s.simResults ?? null,
    kpiValues: s.kpiValues ?? null, lanes: s.lanes ?? null
  };
}

function snapshotDelEstado() {
  return {
    meta: state.meta, ficha: state.ficha, nodes: state.nodes, edges: state.edges,
    activeView: state.activeView,
    views: { ...state._views, [state.activeView]: { nodes: state.nodes, edges: state.edges } },
    raci: state._raci || null, sipoc: state._sipoc || null, simResults: state._simResults || null,
    kpiValues: state._kpiValues || null, lanes: state._lanes || null
  };
}

/** Hash de 53 bits (cyrb53): basta para saber si dos contenidos son iguales. */
function hash(texto) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Contenido normalizado (v1) de un snapshot, o null si no es válido. */
function normalizado(snapshot) {
  const r = migrarProyecto(contenidoDe(snapshot));
  return r.ok ? r.proyecto : null;
}

function huellaDe(snapshot) {
  return hash(JSON.stringify(normalizado(snapshot) ?? contenidoDe(snapshot)));
}

const leer = (clave) => { try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch { return null; } };
const escribir = (clave, valor) => { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* cuota llena */ } };

// =================== Cargar en el editor ===================

function siguienteId(minimo) {
  let max = 0;
  const ver = (lista) => (lista || []).forEach((o) => {
    const m = /(\d+)$/.exec(String(o && o.id != null ? o.id : ''));
    if (m) max = Math.max(max, Number(m[1]));
  });
  ver(state.nodes); ver(state.edges);
  Object.values(state._views || {}).forEach((v) => { if (v) { ver(v.nodes); ver(v.edges); } });
  return Math.max(max + 1, Number(minimo) || 1);
}

function aplicarContenido(c) {
  state.meta = { name: '', industry: '', macroprocess: '', client: '', owner: '', ...(c.meta || {}) };
  state.ficha = normalizeFicha(c.ficha);
  state.nodes = c.nodes || [];
  state.edges = c.edges || [];
  state.activeView = c.activeView || 'asis';
  state._views = c.views || { asis: null, tobe: null };
  state._raci = c.raci || null;
  state._sipoc = c.sipoc || null;
  state._simResults = c.simResults || null;
  state._kpiValues = c.kpiValues || {};
  state._lanes = c.lanes || null;
  state.nextId = siguienteId(c.nextId);
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  $('#processName').value = state.meta.name || '';
  $('#processIndustry').value = state.meta.industry || '';
  $('#processMacro').value = state.meta.macroprocess || '';
  updateViewUi();
  if (state.nodes.length > 0 && !state._lanes) autoLayout(); else render();
  renderProperties();
  runLinter();
  maybeFitOnLoad();
}

async function abrir() {
  pintarBarra();
  try {
    let revision = null;
    let datos;
    if (pedidoRevision) {
      revision = (await api.revision(pedidoRevision)).revision;
      datos = await api.proceso(revision.procesoId);
    } else {
      datos = await api.proceso(pedidoProceso);
      if (datos.revisiones[0]) revision = (await api.revision(datos.revisiones[0].id)).revision;
    }
    const { proyecto } = await api.proyecto(datos.proceso.proyectoId);
    // Catálogos de la organización (KPIs, verbos, temas PPTX) antes de pintar: el linter ya los usa
    try {
      aplicarCatalogos(await api.catalogos());
    } catch {
      avisar('atencion', 'No se pudieron cargar los catálogos de la organización: se usan los de por defecto.');
    }
    Object.assign(ctx, {
      proceso: datos.proceso, proyecto, rol: datos.rol,
      base: revision && { id: revision.id, numero: revision.numero, estado: revision.estado },
      ultima: datos.revisiones[0] ? { id: datos.revisiones[0].id, numero: datos.revisiones[0].numero } : null
    });

    // ¿Quedaron en este navegador cambios sin guardar de este proceso?
    const clave = claveBorrador(ctx.proceso.id);
    const borrador = leer(clave);
    const infoBase = leer(clave + '.base');
    let contenido = revision ? revision.contenido : { meta: { name: ctx.proceso.nombre } };
    let recuperado = false;
    if (borrador && infoBase && huellaDe(borrador) !== infoBase.huella) {
      const deOtra = infoBase.revisionId !== (revision ? revision.id : null);
      const suya = datos.revisiones.find((r) => r.id === infoBase.revisionId) || null;
      const nombreSuya = suya ? `la v${suya.numero}` : 'el proceso vacío';
      recuperado = await preguntar({
        titulo: 'Tienes cambios sin guardar',
        texto: deOtra
          ? `En este navegador hay cambios sobre ${nombreSuya} de este proceso que no se guardaron en el proyecto (último cambio: ${fecha(borrador.savedAt)}). Si abres ${revision ? `la v${revision.numero}` : 'esta versión'}, se perderán.`
          : `En este navegador hay cambios sobre esta versión que no se guardaron en el proyecto (último cambio: ${fecha(borrador.savedAt)}).`,
        si: deOtra ? `Seguir con mis cambios sobre ${nombreSuya}` : 'Recuperar mis cambios',
        no: 'Descartarlos'
      });
      if (recuperado) {
        contenido = borrador;
        if (deOtra) {
          ctx.base = suya && { id: suya.id, numero: suya.numero, estado: suya.estado };
          history.replaceState(null, '', suya ? `/?revision=${encodeURIComponent(suya.id)}` : `/?proceso=${encodeURIComponent(ctx.proceso.id)}`);
        }
      }
    }

    usarClaveAlmacen(clave);
    aplicarContenido(contenido);
    if (recuperado) {
      ctx.huellaGuardada = infoBase.huella;
    } else {
      ctx.huellaGuardada = huellaDe(snapshotDelEstado());
      escribir(clave + '.base', { revisionId: ctx.base ? ctx.base.id : null, huella: ctx.huellaGuardada });
    }
    resetHistory();   // la revisión abierta es la línea base de deshacer
    persist();
    ctx.sucio = recuperado;
    alCambiar(programarRevision);
    pintarBarra();
    if (!puedeGuardar()) avisar('info', motivoSoloLectura());
    await activarIa();
    await ofrecerGeneracionPendiente();
  } catch (e) {
    errorAlAbrir(e);
  }
}

function volverA(ruta) {
  return `${ruta}?volver=${encodeURIComponent(location.pathname + location.search)}`;
}

function errorAlAbrir(e) {
  if (e instanceof ErrorApi && e.estado === 401) { location.assign(volverA('/proyectos/entrar')); return; }
  if (e instanceof ErrorApi && e.codigo === 'CAMBIAR_CLAVE') { location.assign(volverA('/proyectos/clave')); return; }
  const mensaje = e instanceof ErrorApi && e.estado === 404
    ? 'No se encontró ese proceso o no tienes acceso a él.'
    : (e && e.message) || 'No se pudo abrir el proceso.';
  pintarBarra({ error: mensaje });
}

// =================== Cambios sin guardar ===================

let temporizador = null;
function programarRevision() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    const sucio = huellaDe(snapshotDelEstado()) !== ctx.huellaGuardada;
    if (sucio !== ctx.sucio) { ctx.sucio = sucio; pintarBarra(); }
  }, 250);
}

window.addEventListener('beforeunload', (e) => {
  if (ctx.sucio) { e.preventDefault(); e.returnValue = ''; }
});

document.addEventListener('keydown', (e) => {
  if (!ctx.proceso || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
  e.preventDefault();
  if (puedeGuardar()) guardar();
});

// =================== Guardar revisión ===================

function puedeGuardar() {
  return !!ctx.proceso && puede(ctx.rol, 'escribir') && !(ctx.proyecto && ctx.proyecto.archivado);
}

function motivoSoloLectura() {
  if (ctx.proyecto && ctx.proyecto.archivado) return 'El proyecto está archivado: puedes ver el proceso, pero no guardar cambios.';
  return `Tu rol en el proyecto (${ROLES_PROYECTO[ctx.rol] || ctx.rol}) no permite guardar revisiones: los cambios que hagas aquí no se guardarán en el proyecto.`;
}

async function guardar() {
  if (ctx.guardando) return;
  const partida = ctx.base;
  const noEsLaUltima = partida && ctx.ultima && partida.id !== ctx.ultima.id;
  const mensaje = await pedirMensaje({
    siguiente: (ctx.ultima ? ctx.ultima.numero : 0) + 1,
    aviso: noEsLaUltima
      ? `Estás trabajando sobre la v${partida.numero}, pero la última es la v${ctx.ultima.numero}: la versión nueva no incluirá los cambios de la v${ctx.ultima.numero}.`
      : ''
  });
  if (mensaje === null) return;
  await guardarContenido(mensaje);
}

/**
 * Crea una revisión con lo que hay en el lienzo. `ejecucionIaId`: la generación
 * de IA de la que sale (queda enlazada y deja de ofrecerse como pendiente).
 */
async function guardarContenido(mensaje, ejecucionIaId = null) {
  // Un guardado en curso (p. ej. el usuario pulsó «Guardar» mientras terminaba la IA): se espera
  while (ctx.guardando) await new Promise((r) => setTimeout(r, 200));
  const partida = ctx.base;
  const contenido = normalizado(snapshotDelEstado());
  if (!contenido) {
    const r = migrarProyecto(contenidoDe(snapshotDelEstado()));
    avisar('error', 'El proceso tiene errores y no se puede guardar:', r.ok ? [] : r.errores);
    return;
  }
  ctx.guardando = true;
  pintarBarra();
  try {
    const res = await api.guardarRevision(ctx.proceso.id, { contenido, mensaje, padreId: partida ? partida.id : null, ejecucionIaId });
    ctx.base = { id: res.revision.id, numero: res.revision.numero, estado: res.revision.estado };
    ctx.ultima = { id: res.revision.id, numero: res.revision.numero };
    ctx.huellaGuardada = hash(JSON.stringify(contenido));
    escribir(claveBorrador(ctx.proceso.id) + '.base', { revisionId: ctx.base.id, huella: ctx.huellaGuardada });
    history.replaceState(null, '', `/?revision=${encodeURIComponent(res.revision.id)}`);
    const que = ejecucionIaId ? 'Proceso generado con IA y guardado' : 'Guardada';
    if (res.conflicto) {
      avisar('atencion', `${que} como v${res.revision.numero}. Mientras trabajabas, alguien guardó la v${res.ultimaAnterior ? res.ultimaAnterior.numero : '?'}: esta versión no incluye esos cambios. Revisa las dos en el proyecto.`);
    } else {
      avisar('ok', `${que} como v${res.revision.numero} (borrador).`);
    }
  } catch (e) {
    if (e instanceof ErrorApi && (e.estado === 401 || e.codigo === 'CAMBIAR_CLAVE')) {
      avisar('error', 'Tu sesión caducó. Tus cambios siguen guardados en este navegador: entra de nuevo y vuelve a pulsar «Guardar revisión».', [], { texto: 'Entrar', href: volverA('/proyectos/entrar') });
    } else {
      avisar('error', (e && e.message) || 'No se pudo guardar.', e instanceof ErrorApi && Array.isArray(e.detalles) ? e.detalles : []);
    }
  } finally {
    ctx.guardando = false;
    ctx.sucio = huellaDe(snapshotDelEstado()) !== ctx.huellaGuardada;
    pintarBarra();
  }
}

// =================== IA del servidor (fase 2.3) ===================

async function activarIa() {
  let estado;
  try {
    estado = await api.estadoIa();
  } catch {
    estado = { configurada: false, modelos: [], modeloAnalisis: '', presupuesto: { mensualUsd: 0, gastadoUsd: 0, limiteUsuarioUsd: 0, gastadoUsuarioUsd: 0 } };
  }
  usarIaRemota(crearIaRemota({
    procesoId: ctx.proceso.id,
    estado,
    soloLectura: puedeGuardar() ? '' : 'Tu rol o el estado del proyecto no permiten usar la IA aquí.',
    contenidoActual: () => normalizado(snapshotDelEstado()) || contenidoDe(snapshotDelEstado()),
    // Tras dibujar lo generado (el resto de la ingesta es síncrono), se guarda como revisión
    alGenerar: (ejecucionId, etiqueta) => { setTimeout(() => { guardarContenido(`Proceso generado con IA desde ${etiqueta}`, ejecucionId); }, 0); },
    avisar
  }));
  updateAiUi();
}

/** Una generación que terminó con la pestaña cerrada: se ofrece dibujarla y guardarla. */
async function ofrecerGeneracionPendiente() {
  if (!puedeGuardar()) return;
  let pendientes = [];
  try { pendientes = (await api.iaDelProceso(ctx.proceso.id)).pendientes; } catch { return; }
  const e = pendientes[0];
  if (!e || !e.resultado) return;
  const etiqueta = (e.parametros && e.parametros.etiqueta) || 'documento';
  const dibujar = await preguntar({
    titulo: 'Hay un proceso generado con IA sin guardar',
    texto: `El ${fecha(e.terminadoEn)} la IA generó este proceso desde «${etiqueta}», pero no llegó a guardarse en el proyecto (se cerró la pestaña antes). ¿Lo dibujamos ahora? Se guardará como una versión nueva; las anteriores no cambian.`,
    si: 'Dibujarlo y guardarlo',
    no: 'Descartarlo'
  });
  if (!dibujar) { await api.descartarIa(e.id).catch(() => {}); return; }
  buildProcessFromAiSpec(e.resultado, etiqueta);
  const vista = Number(e.parametros && e.parametros.vista) || 3;
  if (vista < 3) aplicarNivel(vista, { silent: true });
  maybeFitOnLoad();
  await guardarContenido(`Proceso generado con IA desde ${etiqueta}`, e.id);
}

// =================== Barra, avisos y diálogos ===================

let barra = null;
let avisoEl = null;

function crearBarra() {
  const zona = $('#canvasArea') || document.body;
  barra = document.createElement('div');
  barra.className = 'piq-proyecto';
  barra.setAttribute('role', 'region');
  barra.setAttribute('aria-label', 'Proceso del proyecto');
  barra.innerHTML = `
    <a class="piq-proyecto-volver" data-ref="volver" href="/proyectos/" title="Volver al proyecto" aria-label="Volver al proyecto">←</a>
    <div class="piq-proyecto-texto">
      <span class="piq-proyecto-ruta" data-ref="ruta"></span>
      <span class="piq-proyecto-detalle" data-ref="detalle"></span>
    </div>
    <span class="piq-proyecto-cambios" data-ref="cambios" hidden>Cambios sin guardar</span>
    <button type="button" class="piq-proyecto-guardar" data-ref="guardar" hidden title="Crea una versión nueva en el proyecto (Ctrl+S)">Guardar revisión</button>`;
  barra.querySelector('[data-ref="guardar"]').addEventListener('click', () => guardar());
  avisoEl = document.createElement('div');
  avisoEl.className = 'piq-proyecto-aviso';
  avisoEl.hidden = true;
  zona.appendChild(barra);
  zona.appendChild(avisoEl);
}

function pintarBarra(opciones = {}) {
  if (!barra) crearBarra();
  const ref = (n) => barra.querySelector(`[data-ref="${n}"]`);
  const ruta = ref('ruta'), detalle = ref('detalle'), cambios = ref('cambios'), boton = ref('guardar'), volver = ref('volver');
  barra.classList.toggle('piq-proyecto-error', !!opciones.error);
  if (opciones.error) {
    ruta.textContent = 'No se pudo abrir el proceso';
    detalle.textContent = opciones.error;
    volver.href = '/proyectos/';
    cambios.hidden = true;
    boton.hidden = true;
    return;
  }
  if (!ctx.proceso) {
    ruta.textContent = 'Abriendo el proceso…';
    detalle.textContent = '';
    return;
  }
  volver.href = `/proyectos/proceso/${encodeURIComponent(ctx.proceso.id)}`;
  ruta.textContent = '';
  const proyecto = document.createElement('span');
  proyecto.textContent = ctx.proyecto ? ctx.proyecto.nombre : 'Proyecto';
  const nombre = document.createElement('strong');
  nombre.textContent = ctx.proceso.nombre;
  ruta.append(proyecto, ' › ', nombre);

  const partes = [];
  if (ctx.base) {
    partes.push(`v${ctx.base.numero} · ${ESTADOS[ctx.base.estado] || ctx.base.estado}`);
    if (ctx.ultima && ctx.ultima.id !== ctx.base.id) partes.push(`la última es la v${ctx.ultima.numero}`);
  } else {
    partes.push('sin revisiones todavía');
  }
  partes.push(puedeGuardar() ? `tu rol: ${ROLES_PROYECTO[ctx.rol] || ctx.rol}` : 'solo lectura');
  detalle.textContent = partes.join(' · ');

  cambios.hidden = !ctx.sucio;
  boton.hidden = !puedeGuardar();
  boton.disabled = ctx.guardando;
  boton.textContent = ctx.guardando ? 'Guardando…' : 'Guardar revisión';
  boton.classList.toggle('piq-proyecto-guardar-destacado', ctx.sucio);
}

let ocultarAviso = null;
/** tipo: ok | info | atencion | error. */
function avisar(tipo, texto, detalles = [], enlace = null) {
  if (!avisoEl) crearBarra();
  clearTimeout(ocultarAviso);
  avisoEl.className = `piq-proyecto-aviso piq-aviso-${tipo}`;
  avisoEl.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  avisoEl.textContent = '';
  const p = document.createElement('p');
  p.textContent = texto;
  avisoEl.appendChild(p);
  if (detalles && detalles.length) {
    const ul = document.createElement('ul');
    detalles.slice(0, 6).forEach((d) => { const li = document.createElement('li'); li.textContent = String(d); ul.appendChild(li); });
    avisoEl.appendChild(ul);
  }
  if (enlace) {
    const a = document.createElement('a');
    a.href = enlace.href;
    a.textContent = enlace.texto;
    avisoEl.appendChild(a);
  }
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'piq-aviso-cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar aviso');
  cerrar.textContent = '×';
  cerrar.addEventListener('click', () => { avisoEl.hidden = true; });
  avisoEl.appendChild(cerrar);
  avisoEl.hidden = false;
  if (tipo === 'ok') ocultarAviso = setTimeout(() => { avisoEl.hidden = true; }, 6000);
}

/** Diálogo modal nativo. Devuelve el botón pulsado ('si' | 'no') y el texto escrito. */
function dialogo({ titulo, texto, aviso = '', campo = null, si, no, obligatorio = false }) {
  return new Promise((resolver) => {
    const d = document.createElement('dialog');
    d.className = 'piq-dialogo';
    const form = document.createElement('form');
    form.method = 'dialog';
    const h = document.createElement('h2');
    h.textContent = titulo;
    form.appendChild(h);
    if (texto) { const p = document.createElement('p'); p.textContent = texto; form.appendChild(p); }
    if (aviso) { const p = document.createElement('p'); p.className = 'piq-dialogo-aviso'; p.textContent = aviso; form.appendChild(p); }
    let area = null;
    if (campo) {
      const label = document.createElement('label');
      label.textContent = campo;
      area = document.createElement('textarea');
      area.rows = 3;
      area.maxLength = 500;
      label.appendChild(area);
      form.appendChild(label);
    }
    const acciones = document.createElement('div');
    acciones.className = 'piq-dialogo-acciones';
    const bNo = document.createElement('button');
    bNo.value = 'no';
    bNo.textContent = no;
    const bSi = document.createElement('button');
    bSi.value = 'si';
    bSi.className = 'piq-dialogo-principal';
    bSi.textContent = si;
    acciones.append(bNo, bSi);
    form.appendChild(acciones);
    d.appendChild(form);
    // Si hay que elegir sí o sí (p. ej. recuperar o descartar), Esc no cierra
    if (obligatorio) d.addEventListener('cancel', (e) => e.preventDefault());
    d.addEventListener('close', () => {
      const r = { boton: d.returnValue || 'no', texto: area ? area.value.trim() : '' };
      d.remove();
      resolver(r);
    });
    document.body.appendChild(d);
    d.showModal();
    (area || bSi).focus();
  });
}

async function pedirMensaje({ siguiente, aviso }) {
  const r = await dialogo({
    titulo: 'Guardar revisión',
    texto: `Se creará la v${siguiente} de «${ctx.proceso.nombre}», en borrador. Las versiones anteriores no cambian.`,
    aviso,
    campo: '¿Qué cambiaste? (opcional, lo verá el equipo)',
    si: 'Guardar',
    no: 'Cancelar'
  });
  return r.boton === 'si' ? r.texto : null;
}

async function preguntar({ titulo, texto, si, no }) {
  const r = await dialogo({ titulo, texto, si, no, obligatorio: true });
  return r.boton === 'si';
}
