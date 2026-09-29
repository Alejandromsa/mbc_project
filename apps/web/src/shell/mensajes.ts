// Mensajes del servidor en inglés. La API responde en español (y no cambia):
// en inglés, el shell muestra la traducción si la conoce y, si no, el texto del
// servidor. Se busca, por este orden:
//   1. el mensaje exacto (un mismo `codigo` puede traer mensajes distintos);
//   2. un patrón, para los mensajes con datos («Ya hay una plantilla llamada «X».»);
//   3. el `codigo` del error, con un texto general.
// Los mensajes de la API viven en apps/api/src (ErrorHttp) y en api.ts (RED y el
// error genérico de estado): si cambian, aquí se cae al patrón, al código o al original.
import { ErrorApi } from './api';
import { textosDominio, type Idioma } from './formato';

const MENSAJES: Record<string, string> = {
  // Sesión y contraseñas
  'Inicia sesión para continuar.': 'Please sign in to continue.',
  'La sesión caducó. Vuelve a iniciar sesión.': 'Your session has expired. Please sign in again.',
  'Correo o contraseña incorrectos.': 'Incorrect email or password.',
  'Demasiados intentos fallidos. Espera 15 minutos y vuelve a intentarlo.': 'Too many failed attempts. Wait 15 minutes and try again.',
  'Debes cambiar tu contraseña temporal antes de continuar.': 'You must change your temporary password before continuing.',
  'La contraseña actual no es correcta.': 'The current password is incorrect.',
  'La nueva contraseña debe ser distinta de la actual.': 'The new password must be different from the current one.',
  'La contraseña debe tener al menos 10 caracteres.': 'The password must be at least 10 characters long.',
  'La contraseña es demasiado larga.': 'The password is too long.',
  'La contraseña no puede ser solo números.': 'The password cannot be only digits.',
  'La contraseña no puede contener tu usuario de correo.': 'The password cannot contain your email username.',
  // Permisos y estado
  'Solo un administrador puede hacer esto.': 'Only an administrator can do this.',
  'Tu rol en este proyecto no permite esta acción.': 'Your role in this project does not allow this action.',
  'Tu rol en este proyecto no permite gestionar los enlaces de invitados.': 'Your role in this project does not allow managing guest links.',
  'Tu rol no permite crear proyectos.': 'Your role does not allow creating projects.',
  'El proyecto está archivado.': 'The project is archived.',
  'El proyecto está archivado: reactívalo antes de cambiarlo.': 'The project is archived: reactivate it before changing it.',
  'No puedes quitarte el rol de administrador ni desactivarte a ti mismo.': 'You cannot remove your own administrator role or deactivate yourself.',
  'El proyecto debe conservar al menos un propietario.': 'The project must keep at least one owner.',
  'Origen no permitido.': 'Origin not allowed.',
  // Datos
  'Datos inválidos.': 'Invalid data.',
  'El cuerpo no es JSON válido.': 'The request body is not valid JSON.',
  'La petición es demasiado grande (máximo 8 MB).': 'The request is too large (8 MB max).',
  'El verbo debe ser una sola palabra en infinitivo, sin espacios ni números.': 'The verb must be a single infinitive word, with no spaces or digits.',
  'Ese elemento no está en el diagrama de esta versión.': 'That element is not in this version’s diagram.',
  'Falta la pestaña que se cierra.': 'The tab being closed is missing.',
  'Ya existe un usuario con ese correo.': 'A user with that email already exists.',
  // Revisiones y procesos
  'La revisión cambió mientras tanto. Recarga y vuelve a intentarlo.': 'The revision changed in the meantime. Reload and try again.',
  'Una revisión aprobada no se modifica: guarda una nueva.': 'An approved revision cannot be modified: save a new one.',
  'La revisión de partida no pertenece a este proceso.': 'The base revision does not belong to this process.',
  'El proceso no es válido.': 'The process is not valid.',
  'La revisión no es un proceso válido.': 'The revision is not a valid process.',
  'No hay proceso que analizar.': 'There is no process to analyze.',
  // IA
  'La IA del servidor no está configurada todavía (falta la clave de Anthropic). Avisa a quien administra ProcessIQ.':
    'The server-side AI is not configured yet (the Anthropic key is missing). Let your ProcessIQ administrator know.',
  'La generación de IA indicada no es de este proceso o no terminó.': 'That AI generation does not belong to this process or has not finished.',
  // Límites
  'Demasiadas peticiones seguidas. Espera un minuto y vuelve a intentarlo.': 'Too many requests in a row. Wait a minute and try again.',
  'Demasiados informes de error.': 'Too many error reports.',
  'Se enviaron demasiados comentarios seguidos. Espera unos minutos y vuelve a intentarlo.': 'Too many comments in a row. Wait a few minutes and try again.',
  // No encontrado (404 sin código)
  'Proyecto no encontrado.': 'Project not found.',
  'Proceso no encontrado.': 'Process not found.',
  'Revisión no encontrada.': 'Revision not found.',
  'Usuario no encontrado.': 'User not found.',
  'KPI no encontrado.': 'KPI not found.',
  'Verbo no encontrado.': 'Verb not found.',
  'Tema no encontrado.': 'Theme not found.',
  'Plantilla no encontrada.': 'Template not found.',
  'Ejecución no encontrada.': 'AI run not found.',
  'Enlace no encontrado.': 'Link not found.',
  'Comentario no encontrado.': 'Comment not found.',
  // Módulos
  'Escribe al menos dos letras para buscar.': 'Type at least two letters to search.',
  'El CSV del marco tiene errores: no se importó nada.': 'The framework CSV has errors: nothing was imported.',
  'Cliente no encontrado.': 'Client not found.',
  'Este enlace no existe o ya no está disponible. Pide uno nuevo a quien te lo envió.': 'This link does not exist or is no longer available. Ask whoever sent it for a new one.',
  'Este enlace es solo de lectura: no admite comentarios.': 'This link is read-only: it does not accept comments.',
  // Del cliente (api.ts), sin respuesta del servidor
  'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.': 'Cannot reach the server. Check your network and try again.'
};

const estadoEn = (e: string) => (textosDominio('en').estados as Record<string, string>)[e] ?? e;

const PATRONES: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Ya hay una plantilla llamada «(.+)»\.$/, (m) => `A template named “${m[1]}” already exists.`],
  [/^Ya hay un tema con la clave «(.+)»\.$/, (m) => `A theme with the key “${m[1]}” already exists.`],
  [/^«(.+)» es un tema del sistema; elige otra clave\.$/, (m) => `“${m[1]}” is a built-in theme; choose another key.`],
  [/^No se puede pasar de "(.+)" a "(.+)"\.$/, (m) => `A revision cannot go from “${estadoEn(m[1]!)}” to “${estadoEn(m[2]!)}”.`],
  [/^Se alcanzó el presupuesto mensual de IA de la organización \((.+)\)\. Un administrador puede ampliarlo\.$/,
    (m) => `Your organization’s monthly AI budget (${m[1]}) has been reached. An administrator can raise it.`],
  [/^Alcanzaste tu límite mensual de IA \((.+)\)\. Un administrador puede ampliarlo\.$/,
    (m) => `You have reached your monthly AI limit (${m[1]}). An administrator can raise it.`],
  [/^El marco no puede pasar de (\d+) elementos\.$/, (m) => `The framework cannot have more than ${m[1]} elements.`],
  [/^Error interno del servidor \(referencia (.+)\)\.$/, (m) => `Internal server error (reference ${m[1]}).`],
  [/^El servidor respondió con un error \((\d+)\)\.$/, (m) => `The server responded with an error (${m[1]}).`]
];

const CODIGOS: Record<string, string> = {
  SIN_SESION: 'Please sign in to continue.',
  CAMBIAR_CLAVE: 'You must change your temporary password before continuing.',
  CREDENCIALES: 'Incorrect email or password.',
  BLOQUEADO: 'Too many failed attempts. Wait and try again.',
  CLAVE_ACTUAL: 'The current password is incorrect.',
  CLAVE_DEBIL: 'The new password does not meet the requirements.',
  PERMISO: 'You do not have permission to do this.',
  ARCHIVADO: 'The project is archived.',
  VALIDACION: 'Invalid data.',
  DUPLICADO: 'That item already exists.',
  CONCURRENCIA: 'The revision changed in the meantime. Reload and try again.',
  INMUTABLE: 'An approved revision cannot be modified: save a new one.',
  TRANSICION: 'That status change is not allowed.',
  ULTIMO_PROPIETARIO: 'The project must keep at least one owner.',
  AUTOBLOQUEO: 'You cannot remove your own administrator role or deactivate yourself.',
  CLAVE_RESERVADA: 'That key belongs to a built-in theme; choose another one.',
  LIMITE: 'Too many requests. Wait a moment and try again.',
  ORIGEN: 'Origin not allowed.',
  PADRE_INVALIDO: 'The base revision does not belong to this process.',
  PROCESO_INVALIDO: 'The process is not valid.',
  PROCESO_VACIO: 'There is no process to analyze.',
  IA_NO_CONFIGURADA: 'The server-side AI is not configured yet. Let your ProcessIQ administrator know.',
  EJECUCION_INVALIDA: 'That AI generation does not belong to this process or has not finished.',
  PRESUPUESTO: 'Your organization’s monthly AI budget has been reached. An administrator can raise it.',
  LIMITE_USUARIO: 'You have reached your monthly AI limit. An administrator can raise it.',
  INTERNO: 'Internal server error.',
  RED: 'Cannot reach the server. Check your network and try again.',
  CONOCIMIENTO_CONSULTA_CORTA: 'Type at least two letters to search.',
  CONOCIMIENTO_MARCO_INVALIDO: 'The framework CSV has errors: nothing was imported.',
  PORTAFOLIO_CLIENTE_NO_ENCONTRADO: 'Client not found.',
  INVITADOS_ENLACE_NO_VALIDO: 'This link does not exist or is no longer available. Ask whoever sent it for a new one.',
  INVITADOS_SIN_COMENTARIOS: 'This link is read-only: it does not accept comments.'
};

/** Un texto del servidor en inglés, si se conoce (null si no). */
function traducir(texto: string, codigo?: string): string | null {
  const exacto = MENSAJES[texto];
  if (exacto) return exacto;
  for (const [patron, f] of PATRONES) {
    const m = patron.exec(texto);
    if (m) return f(m);
  }
  return (codigo && CODIGOS[codigo]) || null;
}

/** El mensaje de un error para la persona: en español, el del servidor; en inglés, su traducción si existe. */
export function mensajeDeError(error: unknown, idioma: Idioma, porDefecto: string): string {
  const mensaje = error instanceof Error ? error.message : '';
  if (!mensaje) return porDefecto;
  if (idioma === 'es') return mensaje;
  return traducir(mensaje, error instanceof ErrorApi ? error.codigo : undefined) ?? mensaje;
}

const AVISOS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^El worker de IA no ha dado señales nunca: ¿está arrancado el servicio «worker»\?$/, () => 'The AI worker has never reported in: is the “worker” service running?'],
  [/^El worker de IA no da señales desde hace (\d+) min\.$/, (m) => `The AI worker has not reported in for ${m[1]} min.`],
  [/^Hay ejecuciones de IA esperando desde hace (\d+) min\.$/, (m) => `AI runs have been waiting for ${m[1]} min.`],
  [/^La IA del servidor no tiene clave de Anthropic \(ANTHROPIC_API_KEY\)\.$/, () => 'The server-side AI has no Anthropic key (ANTHROPIC_API_KEY).'],
  [/^No hay ninguna copia de seguridad\.$/, () => 'There are no backups.'],
  [/^La última copia de seguridad es de hace (\d+) h\.$/, (m) => `The latest backup is ${m[1]} h old.`],
  [/^La última copia de seguridad pesa solo (\d+) bytes: probablemente está vacía\. Haz una copia manual y revisa el servicio «respaldo»\.$/,
    (m) => `The latest backup is only ${m[1]} bytes: it is probably empty. Make a manual backup and check the “respaldo” service.`],
  [/^Queda menos del 10 % de disco libre\.$/, () => 'Less than 10% of disk space is free.'],
  [/^(\d+) error\(es\) en la última hora\.$/, (m) => `${m[1]} error(s) in the last hour.`],
  [/^La base de datos responde lento \((\d+) ms\)\.$/, (m) => `The database is responding slowly (${m[1]} ms).`]
];

/** Un aviso de «Sistema» (texto del servidor) en el idioma pedido, si se conoce su traducción. */
export function avisoDeSistema(texto: string, idioma: Idioma): string {
  if (idioma === 'es') return texto;
  for (const [patron, f] of AVISOS) {
    const m = patron.exec(texto);
    if (m) return f(m);
  }
  return texto;
}
