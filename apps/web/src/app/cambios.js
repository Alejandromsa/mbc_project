// Aviso de «el proceso cambió»: persist() lo emite tras cada guardado local.
// Lo escucha la integración con la plataforma (plataforma/proyecto.js) para
// saber si hay cambios sin guardar; sin oyentes, no hace nada.
const oyentes = new Set();

function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function avisarCambio() {
  oyentes.forEach((fn) => fn());
}

export { alCambiar, avisarCambio };
