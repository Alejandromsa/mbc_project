// IA del servidor para el editor en modo proyecto (fase 2.3). Implementa lo que
// usan ia/generacion.js, ia/tareas.js e ia/pains.js a través de ia/remota.js:
// cada llamada es una ejecución en la API (job con reintentos y coste) y su
// progreso llega por SSE. El navegador envía datos, nunca prompts.
import { PRECIOS_IA, fmtUsd, precioModelo } from '@processiq/ia';
import { api } from '../../shell/api';
import { escapeHtml } from '../util.js';

const nombreModelo = (id) => (PRECIOS_IA[id] ? PRECIOS_IA[id].nombre : id);

/** El servidor no permitía el modelo elegido y usó otro (respuesta de POST /api/ia/generaciones). */
function textoSustitucion(s) {
  return 'El servidor de IA no permite ' + nombreModelo(s.pedido) + ': esta generación usa ' + nombreModelo(s.usado) +
    '. Los modelos permitidos los decide quien administra ProcessIQ.';
}

function textoEstado(e) {
  if (e.estado === 'en_cola') return e.error ? 'Reintentando en el servidor… (' + e.error + ')' : 'En cola en el servidor de IA…';
  if (e.estado === 'ejecutando') {
    return e.progreso
      ? 'Recibiendo el proceso de la IA… ' + e.progreso.toLocaleString('es-PE') + ' caracteres'
      : 'Interpretando con IA en el servidor… (puede tardar unos minutos)';
  }
  return '';
}

/**
 * Espera el final de una ejecución siguiendo su progreso (SSE; se reconecta solo ante cortes de red).
 * `nota` antecede al texto de progreso (el diálogo de ingesta tapa la barra de avisos).
 */
function seguir(id, { onEstado, senal, nota = '' } = {}) {
  return new Promise((resolver, rechazar) => {
    let terminado = false;
    const fuente = new EventSource(api.eventosIa(id));
    const cerrar = () => { terminado = true; fuente.close(); };
    // Cancelar: se deja de esperar ya y se pide al servidor que aborte la llamada
    const alCancelar = () => {
      if (terminado) return;
      cerrar();
      api.cancelarIa(id).catch(() => {});
      rechazar(new Error('CANCELLED'));
    };
    if (senal) {
      if (senal.aborted) { alCancelar(); return; }
      senal.addEventListener('abort', alCancelar, { once: true });
    }
    fuente.addEventListener('estado', (ev) => {
      if (terminado) return;
      const e = JSON.parse(ev.data);
      const texto = textoEstado(e);
      if (onEstado) onEstado(texto && nota ? nota + ' ' + texto : texto);
      if (e.estado === 'completada') { cerrar(); resolver(e); }
      else if (e.estado === 'fallida') { cerrar(); rechazar(new Error(e.error || 'La IA no pudo completar la tarea.')); }
      else if (e.estado === 'cancelada') { cerrar(); rechazar(new Error('CANCELLED')); }
    });
    // Si el servidor rechaza la conexión (p. ej. sesión caducada) EventSource no reintenta
    fuente.onerror = () => {
      if (terminado || fuente.readyState !== EventSource.CLOSED) return;
      terminado = true;
      rechazar(new Error('Se perdió la conexión con el servidor. La IA sigue trabajando: vuelve a abrir el proceso para recuperar el resultado.'));
    };
  });
}

function motivoNoDisponible(estado, soloLectura) {
  if (soloLectura) return soloLectura;
  if (!estado.configurada) return 'La IA del servidor no está configurada todavía (falta la clave de Anthropic).';
  const p = estado.presupuesto;
  if (p.gastadoUsd >= p.mensualUsd) return 'Se alcanzó el presupuesto mensual de IA de la organización.';
  if (p.gastadoUsuarioUsd >= p.limiteUsuarioUsd) return 'Alcanzaste tu límite mensual de IA.';
  return '';
}

/**
 * @param {{ procesoId: string, estado: import('../../shell/api').EstadoIa, soloLectura: string,
 *   contenidoActual: () => unknown, alGenerar: (ejecucionId: string, etiqueta: string, vista: number) => void,
 *   avisar: (tipo: string, texto: string) => void }} o
 */
export function crearIaRemota(o) {
  let estado = o.estado;
  const refrescar = () => { api.estadoIa().then((s) => { estado = s; }).catch(() => {}); };

  return {
    lista: () => !motivoNoDisponible(estado, o.soloLectura),
    avisarNoDisponible: () => o.avisar('atencion', (motivoNoDisponible(estado, o.soloLectura) || 'La IA del servidor no está disponible.') + ' Se usa el modo básico, sin IA.'),

    async generar({ texto, etiqueta, roles, vista, variasFuentes, fuentes, modelo, onEstado, senal }) {
      try {
        // Se envía el modelo elegido tal cual: el servidor decide y avisa si usa otro
        const { ejecucion, modeloSustituido } = await api.generarIa({
          procesoId: o.procesoId, texto, etiqueta, roles, vista, variasFuentes, fuentes, modelo
        });
        let nota = '';
        if (modeloSustituido) {
          o.avisar('atencion', textoSustitucion(modeloSustituido));
          // También en el progreso de la ingesta, que tapa la barra de avisos mientras genera
          nota = nombreModelo(modeloSustituido.pedido) + ' no está permitido en el servidor: se usa ' + nombreModelo(modeloSustituido.usado) + '.';
          if (onEstado) onEstado(nota + ' ' + textoEstado(ejecucion));
        }
        const e = await seguir(ejecucion.id, { onEstado, senal, nota });
        return { spec: e.resultado, ejecucionId: e.id, modelo: e.modelo, tokensEntrada: e.tokensEntrada, tokensSalida: e.tokensSalida, costeUsd: e.costeUsd };
      } finally {
        refrescar();
      }
    },

    async analizar(tipo) {
      try {
        const { ejecucion } = await api.analizarIa({ procesoId: o.procesoId, tipo, contenido: o.contenidoActual() });
        return (await seguir(ejecucion.id)).resultado;
      } finally {
        refrescar();
      }
    },

    alGenerar: o.alGenerar,

    htmlAjustes() {
      const p = estado.presupuesto;
      const motivo = motivoNoDisponible(estado, o.soloLectura);
      return '<p class="panel-hint">En los procesos de un proyecto la IA la gestiona el servidor: la clave de Anthropic no pasa por tu navegador ' +
        'y cada ejecución queda registrada con su coste. Si cierras la pestaña mientras genera, el resultado te espera al volver a abrir el proceso.</p>' +
        '<ul class="piq-ia-ajustes">' +
        '<li>Estado: <b>' + (motivo ? escapeHtml(motivo) : 'disponible') + '</b></li>' +
        '<li>Modelos para generar: ' + escapeHtml(estado.modelos.map((m) => m.precio.nombre).join(', ') || '—') + '</li>' +
        '<li>Análisis (pains y copiloto): ' + escapeHtml(estado.modeloAnalisis ? precioModelo(estado.modeloAnalisis).nombre : '—') + '</li>' +
        '<li>Gasto de la organización este mes: <b>' + fmtUsd(p.gastadoUsd) + '</b> de ' + fmtUsd(p.mensualUsd) + '</li>' +
        '<li>Tu gasto este mes: <b>' + fmtUsd(p.gastadoUsuarioUsd) + '</b> de ' + fmtUsd(p.limiteUsuarioUsd) + '</li>' +
        '</ul>';
    }
  };
}
