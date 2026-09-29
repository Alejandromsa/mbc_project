// Vista del invitado en el editor (docs/iniciativas/invitados.md, ADR 20).
//
//   /?invitado=<token>   abre, en modo lectura, la revisión que se compartió con ese enlace
//
// Sin ese parámetro este módulo no hace nada: el editor funciona como en el MVP.
//
// Con él:
// - el editor arranca vacío con una clave de almacén propia (processiq.invitados.vista)
//   que se borra al salir: el trabajo del editor libre (processiq.v1) ni se lee ni se escribe;
// - la revisión llega de la API pública con el token (sin sesión) y no hay nada que guardar;
// - el diagrama se ve en el modo «⛶ Presentar», sin las herramientas de edición; arriba,
//   «Ficha del proceso» y «Comentarios»;
// - un clic en un elemento del diagrama ancla a él el comentario que se escribe.
import { apiPublicaInvitados } from '../../modulos/invitados/api';
import { ErrorApi } from '../../shell/api';
import { fecha } from '../../shell/formato';
import { $ } from '../dom.js';
import { normalizeFicha, state, usarClaveAlmacen } from '../estado.js';
import { openFichaPreview } from '../exportar/ficha.js';
import { resetHistory } from '../historial.js';
import { autoLayout } from '../layout/auto-layout.js';
import { actualizarSelectorNivel } from '../layout/niveles.js';
import { render } from '../lienzo/render.js';
import { maybeFitOnLoad } from '../lienzo/zoom.js';
import { updateViewUi } from '../vistas/comparador.js';
import '../../modulos/invitados/vista.css';

const token = new URLSearchParams(location.search).get('invitado');
const CLAVE_VISTA = 'processiq.invitados.vista';
const raiz = document.documentElement;

const ctx = {
  datos: null,
  /** Ids de los elementos de la revisión compartida, por vista: solo a ellos se ancla un comentario. */
  validos: { asis: new Set(), tobe: new Set() },
  /** Elemento al que irá el próximo comentario: { id, etiqueta, vista }. */
  ancla: null,
  /** Elemento resaltado en el diagrama. */
  senalado: null,
  comentarios: [],
  enviando: false
};

if (token !== null) {
  // Antes de que arranque el editor (inicio.js corre en DOMContentLoaded, antes que este módulo)
  borrarVista();
  usarClaveAlmacen(CLAVE_VISTA);
  raiz.classList.add('invitados-modo');
  window.addEventListener('keydown', filtrarTeclas, true);
  window.addEventListener('pagehide', borrarVista);
  document.addEventListener('DOMContentLoaded', () => { bloquearEdicion(); abrir(); });
}

function borrarVista() {
  try { localStorage.removeItem(CLAVE_VISTA); } catch { /* sin almacenamiento */ }
}

// =================== Solo lectura ===================

/**
 * Teclado: solo el zoom (Ctrl +/−/0 y F). Borrar, conectar, deshacer, los atajos y
 * Esc (que saldría de «Presentar») no llegan al editor. Mientras se escribe en un campo, todo normal.
 */
function filtrarTeclas(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    const modal = $('#modal');
    if (modal && !modal.hidden) { const cerrar = $('#modalCancel'); if (cerrar) cerrar.click(); }
    return;
  }
  const t = e.target;
  if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
  const zoom = (e.ctrlKey || e.metaKey) ? ['+', '=', '-', '0'].includes(e.key) : (e.key === 'f' || e.key === 'F');
  if (!zoom) e.stopPropagation();
}

/** Ratón sobre el lienzo: nada de arrastrar, conectar ni editar etiquetas; un clic en un elemento lo señala. */
function bloquearEdicion() {
  const lienzo = $('#canvas');
  lienzo.addEventListener('mousedown', (e) => {
    const grupo = e.target.closest && e.target.closest('#nodesLayer > g.node-group');
    if (grupo) { e.stopPropagation(); e.preventDefault(); alPulsarElemento(grupo); return; }
    if (e.target.closest && e.target.closest('#edgesLayer')) e.stopPropagation();
  }, true);
  lienzo.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#edgesLayer')) e.stopPropagation(); }, true);
  for (const tipo of ['dblclick', 'drop', 'dragover']) {
    lienzo.addEventListener(tipo, (e) => { e.stopPropagation(); e.preventDefault(); }, true);
  }
  const nombre = $('#processName');
  if (nombre) { nombre.readOnly = true; nombre.tabIndex = -1; }
  // El resaltado se vuelve a poner cada vez que el editor repinta los nodos
  new MutationObserver(marcarSenalado).observe($('#nodesLayer'), { childList: true });
}

function marcarSenalado() {
  const grupos = document.querySelectorAll('#nodesLayer > g.node-group');
  grupos.forEach((g, i) => {
    const n = state.nodes[i];
    g.classList.toggle('invitados-senalado', !!ctx.senalado && !!n && n.id === ctx.senalado);
  });
}

// =================== Abrir la revisión ===================

async function abrir() {
  pintarBarra();
  try {
    ctx.datos = await apiPublicaInvitados.vista(token);
  } catch (e) {
    mostrarError(e);
    return;
  }
  const { proceso, revision, enlace, comentarios } = ctx.datos;
  ctx.comentarios = comentarios.slice();
  const c = revision.contenido || {};
  const activa = c.activeView === 'tobe' ? 'tobe' : 'asis';
  const otra = activa === 'tobe' ? 'asis' : 'tobe';
  ctx.validos[activa] = new Set((c.nodes || []).map((n) => n.id));
  ctx.validos[otra] = new Set(((c.views && c.views[otra] && c.views[otra].nodes) || []).map((n) => n.id));
  raiz.classList.toggle('invitados-con-tobe', ctx.validos.tobe.size > 0);
  document.title = `${proceso.nombre} · v${revision.numero} · ProcessIQ`;

  // El modo «⛶ Presentar» del editor (ui/presentacion.js). Se activa con su clase y no con
  // togglePresentMode(), porque este cierra el cajón con cerrarPanel(), que guarda la
  // preferencia del editor libre (processiq.ui).
  document.body.classList.add('present-mode');
  if (enlace.admiteComentarios) {
    crearPanel();
    raiz.classList.add('invitados-panel-abierto');
  }
  pintarBarra();
  cargarEnEditor(c);
  resetHistory();
}

/** Como aplicarContenido() de proyecto.js, sin nada que guardar. */
function cargarEnEditor(c) {
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
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  $('#processName').value = state.meta.name || '';
  updateViewUi();
  if (state.nodes.length > 0 && !state._lanes) autoLayout(); else render();
  actualizarSelectorNivel();
  encuadrar();
}

/**
 * Encuadre al cargar, con el lienzo pegado a la izquierda: los nombres de los
 * carriles (fijos al desplazar) se ven enteros desde el principio.
 */
function encuadrar() {
  maybeFitOnLoad();
  const zona = $('#canvasWrapper');
  if (zona) zona.scrollLeft = 0;
}

function mostrarError(e) {
  const noValido = e instanceof ErrorApi && e.estado === 404;
  raiz.classList.remove('invitados-panel-abierto');
  const zona = $('#canvasArea') || document.body;
  let tarjeta = document.querySelector('.invitados-error');
  if (!tarjeta) {
    tarjeta = document.createElement('div');
    tarjeta.className = 'invitados-error';
    tarjeta.setAttribute('role', 'alert');
    zona.appendChild(tarjeta);
  }
  tarjeta.textContent = '';
  const h = document.createElement('h1');
  h.textContent = noValido ? 'Este enlace ya no está disponible' : 'No se pudo abrir la revisión';
  const p = document.createElement('p');
  p.textContent = noValido
    ? 'Puede que haya caducado o que lo hayan revocado. Pide un enlace nuevo a quien te lo envió.'
    : (e && e.message) || 'Inténtalo de nuevo en unos minutos.';
  tarjeta.append(h, p);
  if (noValido && ctx.datos) {
    // Revocado o caducado mientras estaba abierto: tampoco se sigue mostrando
    state.nodes = []; state.edges = []; state._lanes = null; state._views = { asis: null, tobe: null };
    render();
  }
  if (!noValido) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'invitados-boton invitados-boton-principal';
    b.textContent = 'Reintentar';
    b.addEventListener('click', () => { tarjeta.remove(); abrir(); });
    tarjeta.appendChild(b);
  }
  if (barra) barra.hidden = true;
}

// =================== Barra (en la cabecera del editor) ===================

let barra = null;

function pintarBarra() {
  if (!barra) {
    // En la cabecera y no sobre el lienzo: así no tapa el primer carril del diagrama
    barra = document.createElement('div');
    barra.className = 'invitados-barra';
    barra.setAttribute('role', 'region');
    barra.setAttribute('aria-label', 'Revisión compartida');
    const marca = $('.app-header .brand');
    if (marca) marca.after(barra); else document.body.prepend(barra);
  }
  barra.hidden = false;
  barra.textContent = '';
  const texto = document.createElement('div');
  texto.className = 'invitados-barra-texto';
  const titulo = document.createElement('span');
  titulo.className = 'invitados-barra-titulo';
  const detalle = document.createElement('span');
  detalle.className = 'invitados-barra-detalle';
  texto.append(titulo, detalle);
  barra.appendChild(texto);
  if (!ctx.datos) { titulo.textContent = 'Abriendo la revisión compartida…'; return; }

  const { proceso, revision, enlace } = ctx.datos;
  const nombre = document.createElement('strong');
  nombre.textContent = proceso.nombre;
  titulo.append(nombre, ` · versión ${revision.numero}`);
  detalle.textContent = `Solo lectura · compartida con ${enlace.destinatario} · disponible hasta el ${fecha(enlace.caducaEn)}`;

  const ficha = document.createElement('button');
  ficha.type = 'button';
  ficha.className = 'btn btn-ghost';
  ficha.textContent = 'Ficha del proceso';
  ficha.addEventListener('click', () => openFichaPreview());
  barra.appendChild(ficha);
  if (enlace.admiteComentarios) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-primary';
    b.dataset.ref = 'comentarios';
    b.setAttribute('aria-controls', 'invitadosPanel');
    b.addEventListener('click', () => abrirPanel(!raiz.classList.contains('invitados-panel-abierto')));
    barra.appendChild(b);
    pintarBotonComentarios();
  }
}

function pintarBotonComentarios() {
  const b = barra && barra.querySelector('[data-ref="comentarios"]');
  if (!b) return;
  b.textContent = ctx.comentarios.length ? `Comentarios (${ctx.comentarios.length})` : 'Comentarios';
  b.setAttribute('aria-expanded', String(raiz.classList.contains('invitados-panel-abierto')));
}

function abrirPanel(abierto) {
  raiz.classList.toggle('invitados-panel-abierto', abierto);
  pintarBotonComentarios();
  // El lienzo cambia de ancho: se repinta y se vuelve a encuadrar
  setTimeout(() => { render(); encuadrar(); }, 0);
}

// =================== Panel de comentarios ===================

let panel = null;
const refs = {};

function crearPanel() {
  panel = document.createElement('aside');
  panel.id = 'invitadosPanel';
  panel.className = 'invitados-panel';
  panel.setAttribute('aria-labelledby', 'invitadosTitulo');

  const cab = document.createElement('div');
  cab.className = 'invitados-panel-cabecera';
  const h = document.createElement('h2');
  h.id = 'invitadosTitulo';
  h.textContent = 'Comentarios';
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'invitados-cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar los comentarios');
  cerrar.textContent = '×';
  cerrar.addEventListener('click', () => abrirPanel(false));
  cab.append(h, cerrar);

  const ayuda = document.createElement('p');
  ayuda.className = 'invitados-ayuda';
  ayuda.textContent = 'Escribe lo que quieras que el equipo revise. Para comentar un paso concreto, haz clic en él en el diagrama.';

  refs.lista = document.createElement('ol');
  refs.lista.className = 'invitados-lista';
  refs.lista.setAttribute('aria-label', 'Tus comentarios');

  const form = document.createElement('form');
  form.className = 'invitados-form';
  form.noValidate = true;
  refs.ancla = document.createElement('div');
  refs.ancla.className = 'invitados-ancla-actual';
  refs.aviso = document.createElement('p');
  refs.aviso.className = 'invitados-aviso';
  refs.aviso.setAttribute('role', 'status');
  refs.aviso.hidden = true;
  refs.nombre = campo(form, 'input', 'Tu nombre', { maxLength: 120, autocomplete: 'name' });
  refs.texto = campo(form, 'textarea', 'Comentario', { maxLength: 4000, rows: 4 });
  refs.error = document.createElement('p');
  refs.error.className = 'invitados-error-campo';
  refs.error.setAttribute('role', 'alert');
  refs.error.hidden = true;
  refs.enviar = document.createElement('button');
  refs.enviar.type = 'submit';
  refs.enviar.className = 'invitados-boton invitados-boton-principal';
  refs.enviar.textContent = 'Enviar comentario';
  form.prepend(refs.ancla);
  form.append(refs.error, refs.enviar);
  form.addEventListener('submit', (e) => { e.preventDefault(); enviar(); });

  panel.append(cab, ayuda, refs.lista, refs.aviso, form);
  ($('.app-main') || document.body).appendChild(panel);
  pintarLista();
  pintarAncla();
}

function campo(form, etiqueta, texto, props) {
  const label = document.createElement('label');
  label.className = 'invitados-campo';
  const span = document.createElement('span');
  span.textContent = texto;
  const el = document.createElement(etiqueta);
  Object.assign(el, props);
  label.append(span, el);
  form.appendChild(label);
  return el;
}

function pintarLista() {
  if (!refs.lista) return;
  refs.lista.textContent = '';
  if (!ctx.comentarios.length) {
    const li = document.createElement('li');
    li.className = 'invitados-vacio';
    li.textContent = 'Todavía no has dejado comentarios en esta versión.';
    refs.lista.appendChild(li);
  }
  for (const c of ctx.comentarios) {
    const li = document.createElement('li');
    li.className = c.resuelto ? 'invitados-item invitados-item-resuelto' : 'invitados-item';
    const cab = document.createElement('div');
    cab.className = 'invitados-item-cabecera';
    const quien = document.createElement('strong');
    quien.textContent = c.nombre;
    const cuando = document.createElement('span');
    cuando.textContent = fecha(c.creadoEn);
    cab.append(quien, cuando);
    li.appendChild(cab);
    if (c.elementoId) {
      const sobre = document.createElement('button');
      sobre.type = 'button';
      sobre.className = 'invitados-item-ancla';
      sobre.textContent = `Sobre «${c.elementoEtiqueta || c.elementoId}»`;
      sobre.title = 'Ver en el diagrama';
      sobre.addEventListener('click', () => enfocar(c.elementoId));
      li.appendChild(sobre);
    }
    const p = document.createElement('p');
    p.className = 'invitados-item-texto';
    p.textContent = c.texto;
    li.appendChild(p);
    if (c.resuelto) {
      const r = document.createElement('span');
      r.className = 'invitados-item-estado';
      r.textContent = 'El equipo lo marcó como resuelto';
      li.appendChild(r);
    }
    refs.lista.appendChild(li);
  }
  pintarBotonComentarios();
}

function pintarAncla() {
  if (!refs.ancla) return;
  refs.ancla.textContent = '';
  if (!ctx.ancla) {
    refs.ancla.classList.remove('invitados-ancla-elegida');
    refs.ancla.textContent = 'Comentario sobre el proceso en general';
    return;
  }
  refs.ancla.classList.add('invitados-ancla-elegida');
  const t = document.createElement('span');
  t.textContent = `Sobre «${ctx.ancla.etiqueta || ctx.ancla.id}»${ctx.ancla.vista === 'tobe' ? ' (To-Be)' : ''}`;
  const quitar = document.createElement('button');
  quitar.type = 'button';
  quitar.className = 'invitados-quitar';
  quitar.textContent = 'Quitar';
  quitar.setAttribute('aria-label', 'Comentar el proceso en general');
  quitar.addEventListener('click', () => { ctx.ancla = null; senalar(null); pintarAncla(); });
  refs.ancla.append(t, quitar);
}

function avisar(texto) {
  if (!refs.aviso) return;
  refs.aviso.textContent = texto;
  refs.aviso.hidden = !texto;
}

function alPulsarElemento(grupo) {
  const i = Array.prototype.indexOf.call(grupo.parentNode.children, grupo);
  const n = state.nodes[i];
  if (!n) return;
  senalar(n.id);
  if (!panel) return;   // enlace sin comentarios: solo se resalta
  const vista = state.activeView === 'tobe' ? 'tobe' : 'asis';
  if (!ctx.validos[vista].has(n.id)) {
    ctx.ancla = null;
    pintarAncla();
    avisar('Ese paso se generó al cambiar el nivel de detalle y no está en la versión compartida: vuelve al nivel inicial para comentarlo.');
    return;
  }
  avisar('');
  ctx.ancla = { id: n.id, etiqueta: n.label || '', vista };
  pintarAncla();
  if (!raiz.classList.contains('invitados-panel-abierto')) abrirPanel(true);
  refs.texto.focus();
}

function senalar(id) {
  ctx.senalado = id;
  marcarSenalado();
}

/** Resalta un elemento y lo trae a la vista. */
function enfocar(id) {
  const i = state.nodes.findIndex((n) => n.id === id);
  senalar(id);
  if (i < 0) { avisar('Ese elemento no está en la vista o el nivel de detalle que tienes abierto.'); return; }
  avisar('');
  const n = state.nodes[i];
  const zona = $('#canvasWrapper');
  const z = state.zoom || 1;
  zona.scrollTo({ left: Math.max(0, (n.x + n.w / 2) * z - zona.clientWidth / 2), top: Math.max(0, (n.y + n.h / 2) * z - zona.clientHeight / 2), behavior: 'smooth' });
}

async function enviar() {
  if (ctx.enviando) return;
  const nombre = refs.nombre.value.trim();
  const texto = refs.texto.value.trim();
  const faltan = [!nombre && 'tu nombre', !texto && 'el comentario'].filter(Boolean);
  if (faltan.length) { mostrarErrorCampo(`Escribe ${faltan.join(' y ')}.`); (nombre ? refs.texto : refs.nombre).focus(); return; }
  mostrarErrorCampo('');
  ctx.enviando = true;
  refs.enviar.disabled = true;
  refs.enviar.textContent = 'Enviando…';
  try {
    const { comentario } = await apiPublicaInvitados.comentar(token, {
      nombre, texto, elementoId: ctx.ancla ? ctx.ancla.id : null, vista: ctx.ancla ? ctx.ancla.vista : null
    });
    ctx.comentarios.push(comentario);
    refs.texto.value = '';
    ctx.ancla = null;
    senalar(null);
    pintarAncla();
    pintarLista();
    avisar('Comentario enviado. El equipo lo verá junto a esta versión.');
  } catch (e) {
    if (e instanceof ErrorApi && e.estado === 404) { mostrarError(e); return; }
    mostrarErrorCampo((e && e.message) || 'No se pudo enviar el comentario.');
  } finally {
    ctx.enviando = false;
    refs.enviar.disabled = false;
    refs.enviar.textContent = 'Enviar comentario';
  }
}

function mostrarErrorCampo(texto) {
  refs.error.textContent = texto;
  refs.error.hidden = !texto;
}
