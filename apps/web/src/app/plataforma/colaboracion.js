// Colaboración en tiempo real en el editor (docs/iniciativas/colaboracion.md, ADR 21).
//
// Solo la activa proyecto.js, después de abrir un proceso con sesión (/?proceso=…
// o /?revision=…). Nunca en el editor libre ni en la vista del invitado (?invitado=).
//
// - Da el latido de presencia de esta pestaña: «editando» mientras hay cambios sin guardar.
// - En la barra del proyecto muestra quién más tiene abierto el proceso (iniciales) y
//   quién está editando: es un aviso suave, no bloquea nada.
// - Si alguien guarda una revisión nueva, lo avisa con «Cargar la nueva versión» y
//   «Seguir con la mía».
import { conectarColaboracion, dondeEsta as dondeEstaEs, iniciales, nombreCorto } from '../../shell/colaboracion';
import { enIngles, tr } from '../i18n.js';

/** Dónde tiene alguien abierto el proceso; en español, el texto del shell. */
function dondeEsta(p) {
  if (!enIngles()) return dondeEstaEs(p);
  if (p.lugares.includes('editor') && p.lugares.includes('shell')) return tr('colab.dondeAmbos');
  return p.lugares.includes('editor') ? tr('colab.dondeEditor') : tr('colab.dondeShell');
}

/** Avatares a la vista; el resto se resume en «+N». */
const MAX_AVATARES = 4;
const COLORES = 5;

/** « (v3)» o « (v2, versión anterior)»: las revisiones que la persona tiene abiertas en el editor. */
function versionesDe(p) {
  const abiertas = Array.isArray(p.revisiones) ? p.revisiones : [];
  if (!abiertas.length) return '';
  const lista = abiertas.map((r) => (r.ultima ? `v${r.numero}` : tr('colab.versionAnterior', { n: r.numero }))).join(', ');
  return tr('colab.versiones', { lista });
}

/** Color estable por persona (la clase piq-avatar-cN). */
function colorDe(usuarioId) {
  let h = 0;
  for (let i = 0; i < usuarioId.length; i++) h = (h * 31 + usuarioId.charCodeAt(i)) >>> 0;
  return h % COLORES;
}

/** «Ana», «Ana y Luis», «Ana y 2 más». */
function enumerar(personas) {
  const n = personas.map((p) => nombreCorto(p.nombre));
  if (n.length === 1) return n[0];
  if (n.length === 2) return tr('colab.dos', { a: n[0], b: n[1] });
  return tr('colab.varios', { a: n[0], n: n.length - 1 });
}

/**
 * o: {
 *   procesoId, contenedor (elemento de la barra para los avatares),
 *   sucio(), guardando(), base() -> { id, numero, estado } | null, ultima() -> { id, numero } | null,
 *   alEstadoBase(estado)  cambió el estado de la revisión abierta (evento `estado` del SSE),
 *   alRevisionNueva(revision)  la barra pasa a decir «la última es la vN»,
 *   cargarRevision(id, descartar)  abre esa revisión (descartar = borra antes el borrador local),
 *   avisar(tipo, texto, detalles, enlace, acciones) -> cerrar,  preguntar({ titulo, texto, si, no }) -> boolean
 * }
 */
export function activarColaboracion(o) {
  // La vista del invitado no tiene sesión: ni latido ni SSE
  if (new URLSearchParams(location.search).has('invitado')) return null;

  let otros = [];            // quién más lo tiene abierto (sin mí)
  let yoId = null;           // lo dice la propia presencia (yo: true)
  let ultimaRecibida = null; // la última revisión que llegó por el SSE
  let cerrarAviso = null;
  const estadoLocal = () => (o.sucio() ? 'editando' : 'viendo');
  let estadoEnviado = estadoLocal();

  const conexion = conectarColaboracion({
    procesoId: o.procesoId,
    lugar: 'editor',
    estado: estadoLocal,
    revision: () => (o.base() ? o.base().id : null),
    alPresencia(lista) {
      const mia = lista.find((p) => p.yo);
      if (mia) yoId = mia.usuarioId;
      otros = lista.filter((p) => !p.yo);
      pintar();
    },
    alRevision(revision) {
      ultimaRecibida = revision;
      revisar();
    },
    // Estado de todas las revisiones: si cambió el de la abierta (enviada a revisión, aprobada,
    // devuelta), la barra lo dice al momento
    alEstado(revisiones) {
      const base = o.base();
      const suya = base && (revisiones || []).find((r) => r.id === base.id);
      if (suya && suya.estado !== base.estado && o.alEstadoBase) o.alEstadoBase(suya.estado);
    }
  });

  /** ¿Hay una revisión más nueva que la que conoce el editor? */
  function revisar() {
    const r = ultimaRecibida;
    // Mientras se guarda, el aviso de la revisión propia puede llegar antes que la respuesta:
    // proyecto.js vuelve a llamar al terminar (actualizar), ya con la revisión nueva como última
    if (!r || o.guardando()) return;
    const conocida = o.ultima();
    if (conocida && r.numero <= conocida.numero) return;
    o.alRevisionNueva(r);
    avisarRevision(r);
  }

  function avisarRevision(r) {
    const que = yoId && r.autorId === yoId ? tr('colab.guardasteOtra', { n: r.numero }) : tr('colab.guardo', { autor: r.autor, n: r.numero });
    const base = o.base();
    let texto = `${que}${r.mensaje ? `: «${r.mensaje}»` : ''}.`;
    if (o.sucio()) texto += ' ' + (base ? tr('colab.tusCambiosSobre', { n: base.numero }) : tr('colab.tusCambios'));
    cerrarAviso = o.avisar(o.sucio() ? 'atencion' : 'info', texto, [], null, [
      { texto: tr('colab.cargarNueva'), principal: true, alPulsar: () => cargar(r) },
      { texto: tr('colab.seguirMia'), alPulsar: seguir }
    ]);
  }

  function seguir() {
    if (cerrarAviso) cerrarAviso();
    // La barra ya dice «la última es la vN»; al guardar, el diálogo lo recuerda y la API marca el conflicto
  }

  async function cargar(r) {
    let descartar = false;
    if (o.sucio()) {
      const base = o.base();
      descartar = await o.preguntar({
        titulo: tr('proyecto.tienesCambios'),
        texto: (base ? tr('colab.perderasSobre', { n: r.numero, base: base.numero }) : tr('colab.perderas', { n: r.numero })) + ' ' +
          tr('colab.conservarlos'),
        si: tr('colab.cargarYDescartar', { n: r.numero }),
        no: tr('colab.seguirMia')
      });
      if (!descartar) { seguir(); return; }
    }
    if (cerrarAviso) cerrarAviso();
    o.cargarRevision(r.id, descartar);
  }

  // =================== Avatares en la barra ===================

  function pintar() {
    const cont = o.contenedor;
    if (!cont) return;
    cont.textContent = '';
    cont.hidden = otros.length === 0;
    if (!otros.length) return;
    const lista = document.createElement('ul');
    lista.className = 'piq-presencia-lista';
    lista.setAttribute('aria-label', tr('colab.tambien'));
    otros.slice(0, MAX_AVATARES).forEach((p) => {
      const li = document.createElement('li');
      li.className = `piq-avatar piq-avatar-c${colorDe(p.usuarioId)}`;
      if (p.estado === 'editando') li.classList.add('piq-avatar-editando');
      li.textContent = iniciales(p.nombre);
      li.title = tr(p.estado === 'editando' ? 'colab.editandoEn' : 'colab.viendoEn', { nombre: p.nombre, donde: dondeEsta(p) }) + versionesDe(p);
      li.setAttribute('aria-label', li.title);
      lista.appendChild(li);
    });
    if (otros.length > MAX_AVATARES) {
      const mas = document.createElement('li');
      mas.className = 'piq-avatar piq-avatar-mas';
      mas.textContent = `+${otros.length - MAX_AVATARES}`;
      mas.title = otros.slice(MAX_AVATARES).map((p) => p.nombre).join(', ');
      lista.appendChild(mas);
    }
    cont.appendChild(lista);
    const editan = otros.filter((p) => p.estado === 'editando');
    if (editan.length) {
      const aviso = document.createElement('span');
      aviso.className = 'piq-presencia-editando';
      aviso.setAttribute('role', 'status');
      const clave = (editan.length === 1 ? 'colab.estaEditando' : 'colab.estanEditando') + (o.sucio() ? 'Tambien' : '');
      aviso.textContent = tr(clave, { quien: enumerar(editan) });
      aviso.title = tr('colab.sinBloqueo');
      cont.appendChild(aviso);
    }
  }

  return {
    /** proyecto.js lo llama cada vez que repinta la barra (cambios sin guardar, guardado…). */
    actualizar() {
      const estado = estadoLocal();
      if (estado !== estadoEnviado) { estadoEnviado = estado; conexion.latir(); }
      revisar();
      pintar();
    },
    cerrar: () => conexion.cerrar()
  };
}
