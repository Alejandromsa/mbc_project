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
import { conectarColaboracion, dondeEsta, iniciales, nombreCorto } from '../../shell/colaboracion';

/** Avatares a la vista; el resto se resume en «+N». */
const MAX_AVATARES = 4;
const COLORES = 5;

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
  if (n.length === 2) return `${n[0]} y ${n[1]}`;
  return `${n[0]} y ${n.length - 1} más`;
}

/**
 * o: {
 *   procesoId, contenedor (elemento de la barra para los avatares),
 *   sucio(), guardando(), base() -> { id, numero } | null, ultima() -> { id, numero } | null,
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
    alPresencia(lista) {
      const mia = lista.find((p) => p.yo);
      if (mia) yoId = mia.usuarioId;
      otros = lista.filter((p) => !p.yo);
      pintar();
    },
    alRevision(revision) {
      ultimaRecibida = revision;
      revisar();
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
    const que = yoId && r.autorId === yoId ? `Guardaste la v${r.numero} desde otra pestaña` : `${r.autor} guardó la v${r.numero}`;
    const base = o.base();
    let texto = `${que}${r.mensaje ? `: «${r.mensaje}»` : ''}.`;
    if (o.sucio()) texto += ` Tienes cambios sin guardar${base ? ` sobre la v${base.numero}` : ''}: si cargas la nueva versión, se perderán.`;
    cerrarAviso = o.avisar(o.sucio() ? 'atencion' : 'info', texto, [], null, [
      { texto: 'Cargar la nueva versión', principal: true, alPulsar: () => cargar(r) },
      { texto: 'Seguir con la mía', alPulsar: seguir }
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
        titulo: 'Tienes cambios sin guardar',
        texto: `Si cargas la v${r.numero}, se perderán los cambios que hiciste${base ? ` sobre la v${base.numero}` : ''}. ` +
          'Si prefieres conservarlos, sigue con la tuya y guárdala como una versión nueva: quedará marcada como conflicto y podrás revisar las dos en el proyecto.',
        si: `Cargar la v${r.numero} y descartar mis cambios`,
        no: 'Seguir con la mía'
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
    lista.setAttribute('aria-label', 'También tienen abierto este proceso');
    otros.slice(0, MAX_AVATARES).forEach((p) => {
      const li = document.createElement('li');
      li.className = `piq-avatar piq-avatar-c${colorDe(p.usuarioId)}`;
      if (p.estado === 'editando') li.classList.add('piq-avatar-editando');
      li.textContent = iniciales(p.nombre);
      li.title = `${p.nombre}: ${p.estado === 'editando' ? 'editando' : 'viendo'} ${dondeEsta(p)}`;
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
      const verbo = editan.length === 1 ? 'está editando' : 'están editando';
      aviso.textContent = `${enumerar(editan)} ${o.sucio() ? `también ${verbo}` : verbo}`;
      aviso.title = 'No se bloquea nada: si los dos guardan, la segunda versión quedará marcada como conflicto y se podrán revisar ambas en el proyecto.';
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
