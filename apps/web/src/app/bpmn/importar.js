// Import BPMN 2.0: @processiq/bpmn lee el XML; aquí se aplica al proceso abierto.
import { leerBpmn } from '@processiq/bpmn';
import { runSimulation } from '../analitica/simulador.js';
import { $ } from '../dom.js';
import { SHAPE_DEFAULTS, emptyFicha, state } from '../estado.js';
import { resetState } from '../historial.js';
import { traducirDe, tr } from '../i18n.js';
import { autoLayout } from '../layout/auto-layout.js';
import { actualizarSelectorNivel, fijarModeloCompleto } from '../layout/niveles.js';
import { persist } from '../persistencia.js';
import { ensureDecisionBranches } from '../proceso/operaciones.js';
import { AVISOS_BPMN_EN } from '../textos/en.js';

function importBpmnXml(xmlString) {
  // Se lee antes de reiniciar: un XML inválido (o que no es BPMN) lanza sin tocar el proceso abierto.
  // Los ids se numeran desde 1 porque resetState() deja nextId en 1.
  const r = leerBpmn(xmlString, { siguienteId: 1, formas: SHAPE_DEFAULTS });

  resetState();
  state.nodes.push(...r.nodos);
  state.edges.push(...r.aristas);
  state.nextId = r.siguienteId;

  if (r.nombreProceso) { state.meta.name = r.nombreProceso; const el = $('#processName'); if (el) el.value = r.nombreProceso; }
  state.ficha = state.ficha || emptyFicha();

  if (r.conteo.count === 0) return { count: 0 };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  // El flujo recién importado es el modelo COMPLETO: de él cuelgan las vistas
  // por nivel. Sin esto, colapsar a ejecutivo no tendría de dónde recuperar.
  // Los subprocesos de un BPMN de otra herramienta llegan con nivel y padre:
  // su contenido se pliega en los niveles Actividad y Ejecutivo.
  state.meta.nivelVista = 3;
  fijarModeloCompleto();
  actualizarSelectorNivel();
  persist();
  // Un BPMN del propio ProcessIQ devuelve lo mismo que el MVP (la fidelidad lo compara)
  if (r.origen === 'processiq') return r.conteo;
  return { ...r.conteo, carriles: r.carriles, subprocesos: r.subprocesos, avisos: r.avisos };
}

// Lo que añade el mensaje del copiloto tras importar un BPMN de otra herramienta:
// carriles, subprocesos y avisos. Vacío para un BPMN del propio ProcessIQ.
function detalleImportBpmn(res) {
  const NL = String.fromCharCode(10);
  let t = '';
  if (res.carriles && res.carriles.length) t += NL + tr('bpmn.carriles', { lista: res.carriles.join(', ') });
  if (res.subprocesos) {
    t += NL + (res.subprocesos === 1 ? tr('bpmn.unSubproceso') : tr('bpmn.subprocesos', { n: res.subprocesos })) +
      tr('bpmn.subprocesosNiveles');
  }
  (res.avisos || []).forEach((a) => { t += NL + '• ' + traducirDe(AVISOS_BPMN_EN, a); });
  return t;
}

export { detalleImportBpmn, importBpmnXml };
