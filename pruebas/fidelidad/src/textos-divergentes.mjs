// Textos de la interfaz que la app nueva cambió a propósito respecto al MVP
// (docs/fase1-divergencias.md). Antes de comparar, comparar.mjs los reemplaza
// en los artefactos del MVP por el texto nuevo; todo lo demás sigue byte a byte.
// divergencias.spec.mjs comprueba que cada texto «mvp» está en el MVP y no en la
// app nueva, y cada texto «nueva» al revés: si alguien cambia uno de estos
// textos, la lista deja de valer y esa prueba lo dice.
//
// Cada entrada es lo bastante larga para no coincidir con nada más.
export const TEXTOS_DIVERGENTES = [
  // D8: el panel «Validaciones» decía que lo crítico bloquea el export, y no lo bloquea
  { d: 'D8', mvp: 'crítico</span> bloquea export · ', nueva: 'crítico</span> (conviene resolverlo antes de exportar) · ' },
  // D9: tildes y eñes de la interfaz del editor
  { d: 'D9', mvp: 'Analisis profundo de dolores (IA)', nueva: 'Análisis profundo de dolores (IA)' },
  { d: 'D9', mvp: 'El analisis profundo de dolores usa la IA (Claude). Aun no configuraste tu API key. Abrir Ajustes de IA?',
    nueva: 'El análisis profundo de dolores usa la IA (Claude). Aún no configuraste tu API key. ¿Abrir Ajustes de IA?' },
  { d: 'D9', mvp: 'No se pudo completar el analisis:', nueva: 'No se pudo completar el análisis:' },
  { d: 'D9', mvp: 'Hipotesis del sector - NO detectadas', nueva: 'Hipótesis del sector - NO detectadas' },
  { d: 'D9', mvp: 'Donde mirar: ', nueva: 'Dónde mirar: ' },
  { d: 'D9', mvp: 'Como confirmarlo: ', nueva: 'Cómo confirmarlo: ' },
  { d: 'D9', mvp: 'usar el modo basico.', nueva: 'usar el modo básico.' },
  { d: 'D9', mvp: 'Diagrama anadido como fuente', nueva: 'Diagrama añadido como fuente' },
  { d: 'D9', mvp: 'Fuente anadida: ', nueva: 'Fuente añadida: ' },
  { d: 'D9', mvp: 'Disenar el proceso To-Be (IA).', nueva: 'Diseñar el proceso To-Be (IA).' },
  { d: 'D9', mvp: 'con cuanto detalle lo mira la IA y en que vista se abre; podras cambiar de vista',
    nueva: 'con cuánto detalle lo mira la IA y en qué vista se abre; podrás cambiar de vista' },
  { d: 'D9', mvp: 'Para comite o SteerCo.', nueva: 'Para comité o SteerCo.' },
  { d: 'D9', mvp: 'Para manual de procedimientos o automatizacion.', nueva: 'Para manual de procedimientos o automatización.' },
  { d: 'D9', mvp: 'Anadir otro documento, transcripcion o diagrama', nueva: 'Añadir otro documento, transcripción o diagrama' },
  { d: 'D9', mvp: '+ Anadir otra fuente', nueva: '+ Añadir otra fuente' },
  { d: 'D9', mvp: 'Se combinaran en un solo AS-IS. Ante contradicciones prevalece la fuente mas reciente (p. ej. la transcripcion del levantamiento',
    nueva: 'Se combinarán en un solo AS-IS. Ante contradicciones prevalece la fuente más reciente (p. ej. la transcripción del levantamiento' },
  // D9: títulos de las tareas de IA del copiloto (etiqueta de TAREAS_IA; no van en la petición).
  // `enMvp`: sitios donde el MVP ya escribe el texto nuevo (el botón del copiloto y el título del
  // diálogo de la automatización sin IA); la prueba D9 los descuenta antes de exigir que el MVP no lo tenga.
  { d: 'D9', mvp: 'Proponer reingenieria To-Be', nueva: 'Proponer reingeniería To-Be' },
  { d: 'D9', mvp: 'Oportunidades de automatizacion', nueva: 'Oportunidades de automatización',
    enMvp: ['</span>Oportunidades de automatización</button>', '🤖 Oportunidades de automatización'] },
  { d: 'D9', mvp: 'Cuello de botella y ruta critica', nueva: 'Cuello de botella y ruta crítica' }
];

/** Un artefacto del MVP con los textos nuevos de la app (para compararlo con el de la app nueva). */
export function conTextosNuevos(artefacto) {
  if (typeof artefacto !== 'string') return artefacto;
  return TEXTOS_DIVERGENTES.reduce((s, t) => s.split(t.mvp).join(t.nueva), artefacto);
}
