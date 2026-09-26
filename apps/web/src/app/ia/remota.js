// IA a través del servidor (fase 2.3). La registra plataforma/proyecto.js al
// abrir un proceso de un proyecto; entonces generación, análisis de pains y
// tareas del copiloto van a la API (jobs con progreso, reintentos y coste) en
// vez de llamar a Claude desde el navegador. Sin registrar (editor libre), el
// editor funciona como en el MVP.
let remota = null;

function usarIaRemota(impl) { remota = impl; }
function iaRemota() { return remota; }

export { iaRemota, usarIaRemota };
