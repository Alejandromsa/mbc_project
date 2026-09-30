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
import { fecha as fechaEnIdioma, textosDominio } from '../../shell/formato';
import { mensajeDeError } from '../../shell/mensajes';
import { capturarErrores } from '../../shell/observabilidad';
import { puede } from '../../shell/permisos';
import { alCambiar } from '../cambios.js';
import { $ } from '../dom.js';
import { normalizeFicha, state, usarClaveAlmacen } from '../estado.js';
import { resetHistory } from '../historial.js';
import { alCambiarIdioma, idioma, traducirDe, tr } from '../i18n.js';
import { updateAiUi } from '../ia/ajustes.js';
import { buildProcessFromAiSpec } from '../ia/generacion.js';
import { usarIaRemota } from '../ia/remota.js';
import { autoLayout } from '../layout/auto-layout.js';
import { aplicarNivel } from '../layout/niveles.js';
import { render } from '../lienzo/render.js';
import { maybeFitOnLoad } from '../lienzo/zoom.js';
import { renderProperties } from '../paneles/propiedades.js';
import { persist } from '../persistencia.js';
import { ETIQUETAS_FUENTE_EN } from '../textos/en.js';
import { runLinter } from '../validacion/lint.js';
import { updateViewUi } from '../vistas/comparador.js';
import './barra.css';
import { aplicarCatalogos } from './catalogos.js';
import { activarColaboracion } from './colaboracion.js';
import { crearIaRemota } from './ia.js';

// Fechas, estados y roles en el idioma del editor (en español, los de siempre)
const fecha = (iso) => fechaEnIdioma(iso, idioma());
const estadoDe = (e) => textosDominio(idioma()).estados[e] || e;
const rolDe = (r) => textosDominio(idioma()).rolesProyecto[r] || r;
/** El mensaje de un error de la API: en español, el de siempre; en inglés, su traducción si se conoce. */
const mensajeError = (e, porDefecto) => (idioma() === 'es' ? ((e && e.message) || porDefecto) : mensajeDeError(e, 'en', porDefecto));
/** Etiqueta de la fuente de una generación (dato en español), para mostrarla. */
const etiquetaVisible = (etiqueta) => traducirDe(ETIQUETAS_FUENTE_EN, etiqueta);

const parametros = new URLSearchParams(location.search);
const pedidoRevision = parametros.get('revision');
const pedidoProceso = parametros.get('proceso');

const CLAVE_ABRIENDO = 'processiq.abriendo';
const PREFIJO_BORRADOR = 'processiq.proceso.';
const claveBorrador = (procesoId) => `${PREFIJO_BORRADOR}${procesoId}`;
/** Días que se conserva en el navegador el borrador de un proceso que no se vuelve a abrir. */
const DIAS_BORRADOR = 30;

const ctx = {
  proceso: null, proyecto: null, rol: null,
  base: null,          // revisión abierta o última guardada: { id, numero, estado } (null = proceso sin revisiones)
  ultima: null,        // última revisión del servidor al abrir: { id, numero }
  huellaGuardada: '',  // huella del contenido de ctx.base, para saber si hay cambios
  sucio: false,
  guardando: false
};

// Colaboración en tiempo real (ADR 21): presencia y aviso de revisiones nuevas; se activa al abrir
let colaboracion = null;
/** Se abre otra revisión a propósito: no se pregunta al salir por los cambios sin guardar. */
let recargando = false;

if (pedidoRevision || pedidoProceso) {
  // Mientras llega la revisión, el editor arranca vacío (sin cargar el trabajo libre).
  // inicio.js registra su arranque antes que este módulo: abrir() corre después.
  try { localStorage.removeItem(CLAVE_ABRIENDO); } catch { /* sin almacenamiento */ }
  usarClaveAlmacen(CLAVE_ABRIENDO);
  capturarErrores('editor');   // en modo proyecto, los errores llegan a la pantalla «Sistema»
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

// =================== Borradores locales ===================
// El trabajo de cada proceso se guarda en su borrador (`processiq.proceso.<id>`,
// lo escribe persist()) y en `….base` la versión de partida y su huella. Sin
// limpieza llenarían la cuota del navegador: se borran al guardar una revisión
// que ya los contiene y, al abrir un proceso, los de otros procesos con más de
// DIAS_BORRADOR días. `processiq.v1` (editor libre) no se toca nunca.

function borrarBorrador(procesoId) {
  const clave = claveBorrador(procesoId);
  try { localStorage.removeItem(clave); localStorage.removeItem(clave + '.base'); } catch { /* sin almacenamiento */ }
}

/**
 * Borra los borradores de otros procesos cuyo último cambio (`savedAt`) tiene
 * más de DIAS_BORRADOR días, y las bases que se quedaron sin borrador (sin él
 * no sirven: abrir() las vuelve a escribir). Lo que no se reconoce como un
 * borrador del editor no se toca. El del proceso que se abre sigue el camino
 * de siempre: si tiene cambios, se ofrece recuperarlo.
 */
function purgarBorradores(procesoActual) {
  const ids = new Set();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const c = localStorage.key(i);
      if (!c || !c.startsWith(PREFIJO_BORRADOR)) continue;
      ids.add(c.slice(PREFIJO_BORRADOR.length).replace(/\.base$/, ''));
    }
  } catch { return; }
  const limite = Date.now() - DIAS_BORRADOR * 24 * 60 * 60 * 1000;
  for (const id of ids) {
    if (!id || id === procesoActual) continue;
    const borrador = leer(claveBorrador(id));
    if (borrador === null) {
      const base = leer(claveBorrador(id) + '.base');
      if (base && typeof base === 'object' && 'huella' in base) borrarBorrador(id);
      continue;
    }
    const guardado = borrador && typeof borrador === 'object' ? Date.parse(borrador.savedAt) : NaN;
    if (Number.isFinite(guardado) && guardado < limite) borrarBorrador(id);
  }
}

/**
 * Tras cada persist(): si falta la base del borrador (se borró al guardar, o
 * la purgó otra pestaña), se vuelve a escribir. Sin ella, un borrador con
 * cambios no se ofrecería recuperar.
 */
function asegurarBase() {
  if (!ctx.proceso) return;
  const clave = claveBorrador(ctx.proceso.id) + '.base';
  try { if (localStorage.getItem(clave) !== null) return; } catch { return; }
  escribir(clave, { revisionId: ctx.base ? ctx.base.id : null, huella: ctx.huellaGuardada });
}

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
      avisar('atencion', tr('proyecto.sinCatalogos'));
    }
    Object.assign(ctx, {
      proceso: datos.proceso, proyecto, rol: datos.rol,
      base: revision && { id: revision.id, numero: revision.numero, estado: revision.estado },
      ultima: datos.revisiones[0] ? { id: datos.revisiones[0].id, numero: datos.revisiones[0].numero } : null
    });

    purgarBorradores(ctx.proceso.id);

    // ¿Quedaron en este navegador cambios sin guardar de este proceso?
    const clave = claveBorrador(ctx.proceso.id);
    const borrador = leer(clave);
    const infoBase = leer(clave + '.base');
    let contenido = revision ? revision.contenido : { meta: { name: ctx.proceso.nombre } };
    let recuperado = false;
    if (borrador && infoBase && huellaDe(borrador) !== infoBase.huella) {
      const deOtra = infoBase.revisionId !== (revision ? revision.id : null);
      const suya = datos.revisiones.find((r) => r.id === infoBase.revisionId) || null;
      const nombreSuya = suya ? tr('proyecto.laVersion', { n: suya.numero }) : tr('proyecto.procesoVacio');
      recuperado = await preguntar({
        titulo: tr('proyecto.tienesCambios'),
        texto: deOtra
          ? tr('proyecto.borradorOtra', { version: nombreSuya, fecha: fecha(borrador.savedAt), abres: revision ? tr('proyecto.laVersion', { n: revision.numero }) : tr('proyecto.estaVersion') })
          : tr('proyecto.borradorMisma', { fecha: fecha(borrador.savedAt) }),
        si: deOtra ? tr('proyecto.seguirConMios', { version: nombreSuya }) : tr('proyecto.recuperar'),
        no: tr('proyecto.descartarlos')
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
    alCambiar(() => { asegurarBase(); programarRevision(); });
    pintarBarra();
    activarPresencia();
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
    ? tr('proyecto.noEncontrado')
    : mensajeError(e, tr('proyecto.noAbierto'));
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
  if (ctx.sucio && !recargando) { e.preventDefault(); e.returnValue = ''; }
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
  if (ctx.proyecto && ctx.proyecto.archivado) return tr('proyecto.archivado');
  return tr('proyecto.rolSinGuardar', { rol: rolDe(ctx.rol) });
}

async function guardar() {
  if (ctx.guardando) return;
  const partida = ctx.base;
  const noEsLaUltima = partida && ctx.ultima && partida.id !== ctx.ultima.id;
  const mensaje = await pedirMensaje({
    siguiente: (ctx.ultima ? ctx.ultima.numero : 0) + 1,
    aviso: noEsLaUltima
      ? tr('proyecto.noEsLaUltima', { base: partida.numero, ultima: ctx.ultima.numero })
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
    avisar('error', tr('proyecto.conErrores'), r.ok ? [] : r.errores);
    return;
  }
  ctx.guardando = true;
  pintarBarra();
  let guardada = false;
  try {
    const res = await api.guardarRevision(ctx.proceso.id, { contenido, mensaje, padreId: partida ? partida.id : null, ejecucionIaId });
    guardada = true;
    ctx.base = { id: res.revision.id, numero: res.revision.numero, estado: res.revision.estado };
    ctx.ultima = { id: res.revision.id, numero: res.revision.numero };
    ctx.huellaGuardada = hash(JSON.stringify(contenido));
    escribir(claveBorrador(ctx.proceso.id) + '.base', { revisionId: ctx.base.id, huella: ctx.huellaGuardada });
    history.replaceState(null, '', `/?revision=${encodeURIComponent(res.revision.id)}`);
    const que = ejecucionIaId ? tr('proyecto.guardadaIa') : tr('proyecto.guardada');
    if (res.conflicto) {
      avisar('atencion', tr('proyecto.conflicto', { que, n: res.revision.numero, otra: res.ultimaAnterior ? res.ultimaAnterior.numero : '?' }));
    } else {
      avisar('ok', tr('proyecto.guardadaComo', { que, n: res.revision.numero }));
    }
  } catch (e) {
    if (e instanceof ErrorApi && (e.estado === 401 || e.codigo === 'CAMBIAR_CLAVE')) {
      avisar('error', tr('proyecto.sesionCaducada'), [], { texto: tr('proyecto.entrar'), href: volverA('/proyectos/entrar') });
    } else {
      avisar('error', mensajeError(e, tr('proyecto.noGuardado')), e instanceof ErrorApi && Array.isArray(e.detalles) ? e.detalles : []);
    }
  } finally {
    ctx.guardando = false;
    ctx.sucio = huellaDe(snapshotDelEstado()) !== ctx.huellaGuardada;
    // La revisión ya contiene el borrador: se borra. Si hubo cambios mientras
    // se guardaba, el borrador tiene más que la revisión y se queda (con la base nueva).
    if (guardada && !ctx.sucio) borrarBorrador(ctx.proceso.id);
    pintarBarra();
  }
}

// =================== Colaboración en tiempo real (ADR 21) ===================

function activarPresencia() {
  if (colaboracion) return;
  colaboracion = activarColaboracion({
    procesoId: ctx.proceso.id,
    contenedor: barra.querySelector('[data-ref="presencia"]'),
    sucio: () => ctx.sucio,
    guardando: () => ctx.guardando,
    base: () => ctx.base,
    ultima: () => ctx.ultima,
    alRevisionNueva: (r) => { ctx.ultima = { id: r.id, numero: r.numero }; pintarBarra(); },
    cargarRevision,
    avisar,
    preguntar
  });
}

/** Abre otra revisión del proceso (colaboración: «Cargar la nueva versión»). `descartar`: borra antes el borrador local. */
function cargarRevision(id, descartar) {
  if (descartar) {
    const clave = claveBorrador(ctx.proceso.id);
    try { localStorage.removeItem(clave); localStorage.removeItem(clave + '.base'); } catch { /* sin almacenamiento */ }
  }
  recargando = true;
  location.assign(`/?revision=${encodeURIComponent(id)}`);
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
    soloLectura: puedeGuardar() ? '' : tr('proyecto.iaSoloLectura'),
    contenidoActual: () => normalizado(snapshotDelEstado()) || contenidoDe(snapshotDelEstado()),
    // Tras dibujar lo generado (el resto de la ingesta es síncrono), se guarda como revisión
    alGenerar: (ejecucionId, etiqueta) => { setTimeout(() => { guardarContenido(tr('proyecto.mensajeIa', { etiqueta: etiquetaVisible(etiqueta) }), ejecucionId); }, 0); },
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
    titulo: tr('proyecto.pendienteTitulo'),
    texto: tr('proyecto.pendienteTexto', { fecha: fecha(e.terminadoEn), etiqueta: etiquetaVisible(etiqueta) }),
    si: tr('proyecto.dibujarlo'),
    no: tr('proyecto.descartarlo')
  });
  if (!dibujar) { await api.descartarIa(e.id).catch(() => {}); return; }
  buildProcessFromAiSpec(e.resultado, etiqueta);
  const vista = Number(e.parametros && e.parametros.vista) || 3;
  if (vista < 3) aplicarNivel(vista, { silent: true });
  maybeFitOnLoad();
  await guardarContenido(tr('proyecto.mensajeIa', { etiqueta: etiquetaVisible(etiqueta) }), e.id);
}

// =================== Barra, avisos y diálogos ===================

let barra = null;
let avisoEl = null;

function crearBarra() {
  const zona = $('#canvasArea') || document.body;
  barra = document.createElement('div');
  barra.className = 'piq-proyecto';
  barra.setAttribute('role', 'region');
  barra.innerHTML = `
    <a class="piq-proyecto-volver" data-ref="volver" href="/proyectos/">←</a>
    <div class="piq-proyecto-texto">
      <span class="piq-proyecto-ruta" data-ref="ruta"></span>
      <span class="piq-proyecto-detalle" data-ref="detalle"></span>
    </div>
    <div class="piq-presencia" data-ref="presencia" hidden></div>
    <span class="piq-proyecto-cambios" data-ref="cambios" hidden></span>
    <button type="button" class="piq-proyecto-guardar" data-ref="guardar" hidden></button>`;
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
  // Textos fijos de la barra, en el idioma actual (se repinta al cambiarlo)
  barra.setAttribute('aria-label', tr('barra.aria'));
  volver.title = tr('barra.volver');
  volver.setAttribute('aria-label', tr('barra.volver'));
  cambios.textContent = tr('proyecto.cambiosSinGuardar');
  boton.title = tr('barra.guardarTitulo');
  boton.textContent = tr('barra.guardar');
  barra.classList.toggle('piq-proyecto-error', !!opciones.error);
  if (opciones.error) {
    ruta.textContent = tr('barra.noAbierto');
    detalle.textContent = opciones.error;
    volver.href = '/proyectos/';
    cambios.hidden = true;
    boton.hidden = true;
    return;
  }
  if (!ctx.proceso) {
    ruta.textContent = tr('barra.abriendo');
    detalle.textContent = '';
    return;
  }
  volver.href = `/proyectos/proceso/${encodeURIComponent(ctx.proceso.id)}`;
  ruta.textContent = '';
  const proyecto = document.createElement('span');
  proyecto.textContent = ctx.proyecto ? ctx.proyecto.nombre : tr('barra.proyecto');
  const nombre = document.createElement('strong');
  nombre.textContent = ctx.proceso.nombre;
  ruta.append(proyecto, ' › ', nombre);

  const partes = [];
  if (ctx.base) {
    partes.push(`v${ctx.base.numero} · ${estadoDe(ctx.base.estado)}`);
    if (ctx.ultima && ctx.ultima.id !== ctx.base.id) partes.push(tr('barra.laUltima', { n: ctx.ultima.numero }));
  } else {
    partes.push(tr('barra.sinRevisiones'));
  }
  partes.push(puedeGuardar() ? tr('barra.tuRol', { rol: rolDe(ctx.rol) }) : tr('barra.soloLectura'));
  detalle.textContent = partes.join(' · ');

  cambios.hidden = !ctx.sucio;
  boton.hidden = !puedeGuardar();
  boton.disabled = ctx.guardando;
  boton.textContent = ctx.guardando ? tr('barra.guardando') : tr('barra.guardar');
  boton.classList.toggle('piq-proyecto-guardar-destacado', ctx.sucio);
  if (colaboracion) colaboracion.actualizar();
}

// Al cambiar de idioma se repinta la barra (salvo si muestra un error al abrir: su mensaje ya está escrito)
alCambiarIdioma(() => {
  if (barra && !barra.classList.contains('piq-proyecto-error')) pintarBarra();
});

let ocultarAviso = null;
let numeroAviso = 0;
/**
 * tipo: ok | info | atencion | error. acciones: botones [{ texto, alPulsar, principal }].
 * Devuelve una función que lo cierra si sigue siendo el aviso a la vista.
 */
function avisar(tipo, texto, detalles = [], enlace = null, acciones = []) {
  if (!avisoEl) crearBarra();
  clearTimeout(ocultarAviso);
  const numero = ++numeroAviso;
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
  if (acciones.length) {
    const botones = document.createElement('div');
    botones.className = 'piq-aviso-acciones';
    acciones.forEach((ac) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (ac.principal) b.className = 'piq-aviso-principal';
      b.textContent = ac.texto;
      b.addEventListener('click', () => ac.alPulsar());
      botones.appendChild(b);
    });
    avisoEl.appendChild(botones);
  }
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'piq-aviso-cerrar';
  cerrar.setAttribute('aria-label', tr('barra.cerrarAviso'));
  cerrar.textContent = '×';
  cerrar.addEventListener('click', () => { avisoEl.hidden = true; });
  avisoEl.appendChild(cerrar);
  avisoEl.hidden = false;
  if (tipo === 'ok') ocultarAviso = setTimeout(() => { avisoEl.hidden = true; }, 6000);
  return () => { if (numero === numeroAviso) avisoEl.hidden = true; };
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
    titulo: tr('barra.guardar'),
    texto: tr('guardar.texto', { n: siguiente, nombre: ctx.proceso.nombre }),
    aviso,
    campo: tr('guardar.campo'),
    si: tr('ajustesIa.guardar'),
    no: tr('comun.cancelar')
  });
  return r.boton === 'si' ? r.texto : null;
}

async function preguntar({ titulo, texto, si, no }) {
  const r = await dialogo({ titulo, texto, si, no, obligatorio: true });
  return r.boton === 'si';
}
