// Import BPMN 2.0: @processiq/bpmn lee el XML; aquí se aplica al proceso abierto.
import { leerBpmn } from '@processiq/bpmn';
import { runSimulation } from '../analitica/simulador.js';
import { $ } from '../dom.js';
import { SHAPE_DEFAULTS, emptyFicha, state } from '../estado.js';
import { resetState } from '../historial.js';
import { autoLayout } from '../layout/auto-layout.js';
import { actualizarSelectorNivel, fijarModeloCompleto } from '../layout/niveles.js';
import { persist } from '../persistencia.js';
import { ensureDecisionBranches } from '../proceso/operaciones.js';

function importBpmnXml(xmlString) {
  // Se lee antes de reiniciar: un XML inválido lanza sin tocar el proceso abierto.
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
  state.meta.nivelVista = 3;
  fijarModeloCompleto();
  actualizarSelectorNivel();
  persist();
  return r.conteo;
}

export { importBpmnXml };
