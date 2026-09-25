// Interpretación básica de texto (modo sin IA): frases -> actividades BPMN.
// Portado del MVP 3.8.9 (parseTextToActivities) sin cambios de lógica; solo se
// añadieron tipos. Es heurístico: prefiere narraciones en primera persona.
import { VERBS_ALLOWED, type TipoEjecucion } from '@processiq/dominio';

export interface ActividadDetectada {
  type: 'task' | 'system' | 'decision';
  label: string;
  owner: string;
  system: string;
  executionType: TipoEjecucion;
  /** La frase original. */
  note: string;
}

export function interpretarTexto(text: string): ActividadDetectada[] {
  const VERBS = ['registr','valid','aprob','revis','verific','captur','envi','reciv','recib','proces','genera','emit','firm','autoriz','rechaz','notific','consult','calcul','asign','clasific','derivar','escalar','conciliar','liquid','pag','cobr','despach','entreg','crear','actualiz','elimin','solicit','complet','llen','document','archiv','digit','escan','impr','contact','llamar','reun','analiz','evalu','diagnostic','transferir','elevar','ingresar','retir','depositar','girar','desembolsar','tramitar','gestionar','atender','resolver','programar','agendar','coordinar','informar','reportar','imprimir','adjunt','remitir','devolver','abrir','identificar','perfilar','navegar','alternar','explicar','simular','ofrecer','presentar','recibir','saludar','preguntar','realizar','iniciar','cerrar','seguir','continuar','proceder'];
  // Decisiones: requieren marca explícita de condición/pregunta, NO solo "cuando/dependiendo" narrativos
  const DECISION_HINTS = ['¿', 'si es', 'si no', 'sino', 'caso contrario', 'en caso de', 'de no ser'];
  const DECISION_VERBS = ['decide','cumple','aprueba','rechaza','tiene','requiere','necesita','existe','está','es elegible','es aprobado','califica','excede','supera','identifico','encuentro','detecto','identifica','encuentra','detecta','hay'];
  const NARRATIVE_STARTERS = ['cuando inicio', 'cuando un cliente', 'cuando empiezo', 'cuando termino', 'cuando llega', 'dependiendo de', 'durante', 'mientras', 'generalmente', 'normalmente', 'finalmente', 'también', 'luego', 'primero'];
  // Lista priorizada — roles más específicos primero
  const ROLES = ['ejecutivo comercial','asesor comercial','asesor bancario','agente comercial','back office','call center','recursos humanos','jefe de','gerente comercial','gerente de','analista de','coordinador','supervisor','tesorería','tesoreria','compliance','riesgos','operaciones','logística','logistica','almacén','almacen','compras','sistemas','contabilidad','auditoría','auditoria','rrhh','frontline','comercial','analista','gerente','asesor','ejecutivo','operario','jefe','cliente','usuario','proveedor'];
  const SYSTEMS = ['salesforce','servicenow','sharepoint','bizagi','sap','oracle','siebel','siaf','siga','workflow','portal','excel','jira','crm','erp','wms','tms','cms','core','motor de ofertas','motor de riesgo','scoring'];
  // Verbo en 1ra persona singular → infinitivo
  const FIRST_PERSON: Record<string, string> = {
    'abro':'Abrir','ingreso':'Ingresar','reviso':'Revisar','solicito':'Solicitar','realizo':'Realizar',
    'verifico':'Verificar','explico':'Explicar','contacto':'Contactar','navego':'Navegar','alterno':'Alternar',
    'saludo':'Saludar','identifico':'Identificar','pregunto':'Preguntar','hago':'Realizar','genero':'Generar',
    'escaneo':'Escanear','envío':'Enviar','envio':'Enviar','llamo':'Llamar','recibo':'Recibir','consulto':'Consultar',
    'analizo':'Analizar','procedo':'Proceder','continúo':'Continuar','continuo':'Continuar','registro':'Registrar',
    'valido':'Validar','apruebo':'Aprobar','rechazo':'Rechazar','asigno':'Asignar','clasifico':'Clasificar',
    'escalo':'Escalar','notifico':'Notificar','firmo':'Firmar','imprimo':'Imprimir','adjunto':'Adjuntar',
    'reciba':'Recibir','simulo':'Simular','ofrezco':'Ofrecer','presento':'Presentar','calculo':'Calcular',
    'preparo':'Preparar','redacto':'Redactar','comparo':'Comparar','evalúo':'Evaluar','evaluo':'Evaluar',
    'investigo':'Investigar','resuelvo':'Resolver','coordino':'Coordinar','informo':'Informar','reporto':'Reportar'
  };

  function isDecisionSentence(s: string) {
    const lower = s.toLowerCase().trim();
    if (/¿.+\?/.test(s)) return true;
    if (DECISION_HINTS.some(h => lower.startsWith(h) || lower.includes(' ' + h))) return true;
    // Patrón "si + sujeto + verbo de decisión"
    if (/^si\s+/.test(lower) && DECISION_VERBS.some(dv => lower.includes(dv))) return true;
    return false;
  }

  function isNarrativeStart(s: string) {
    const lower = s.toLowerCase().trim();
    return NARRATIVE_STARTERS.some(n => lower.startsWith(n));
  }

  // Estilo cavernícola: "Verbo + 1-2 objetos", máx 25 chars
  // Ej: "Ingresar carta", "Responder email", "Validar identidad", "Escalar caso"
  function extractLabel(s: string) {
    const STOPWORDS = new Set([
      'el','la','los','las','un','una','unos','unas','de','del','al','a','con','para','por','que','en','y','o','u',
      'su','sus','mi','mis','tu','tus','este','esta','estos','estas','ese','esa','le','les','me','te','se','lo',
      'muy','también','tambien','generalmente','normalmente','luego','después','despues','primero','finalmente',
      'siempre','algunas','algunos','veces','vez','durante','mientras','cuando','si','dependiendo','toda','todo','todas','todos',
      'esto','eso','aquí','aqui','allí','alli','aún','aun','ya','no','sí','si','muy','más','mas','menos','entre',
      'sobre','bajo','tras','según','segun','hacia','desde','sin','contra','ante','toda','todo','dos','tres','cinco','diez',
      'yo','tú','tu','él','el','ella','nosotros','ustedes','ellos','ellas','quien','quienes','cuyo','cuya',
      'pueden','puedo','puede','debe','debo','debemos','debes','va','vas','voy','vamos','vez','siguiente',
      'parte','etapa','proceso','conversación','minutos','horas','día','dia','manera','forma','momento',
      'oficina','ejecutivo','asesor','agente','cliente','clientes','banco','sistema','sistemas','plataforma',
      'información','datos','dato','aproximadamente','primer','primera','segundo','segunda','tercer','tercera',
      'mejor','peor','siguiente','anterior','algún','algun','alguna','algunos','algunas','ningún','ninguna',
      'cada','toda','todas','algo','nada','alguien','nadie','quién','cuál','cuáles','cuanto','cuanta','cuantos','cuantas'
    ]);

    // Verbos en infinitivo conocidos en el catálogo MBB (para detección rápida)
    const allowed = VERBS_ALLOWED;

    // Tokeniza limpiando puntuación
    const tokens = s.replace(/[¿?¡!.,;:()"'`""'']/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);

    // Busca el primer verbo (en orden):
    // 1) 1ra persona conjugada → infinitivo
    // 2) Verbo del catálogo (infinitivo o forma reconocida)
    // 3) Cualquier palabra que termine en -ar/-er/-ir y tenga ≥4 letras
    // Verbos parásitos: si aparecen primero, los saltamos para buscar el verbo real
    const PARASITE = new Set(['Realizar', 'Hacer', 'Gestionar', 'Procesar', 'Tratar', 'Manejar', 'Ejecutar', 'Proceder', 'Continuar', 'Comenzar', 'Empezar']);
    let verbInf = null, verbIdx = -1;
    let parasiteFallback = null, parasiteIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (FIRST_PERSON[t]) {
        const cand = FIRST_PERSON[t];
        if (PARASITE.has(cand)) {           // guarda como fallback, sigue buscando verbo real
          if (!parasiteFallback) { parasiteFallback = cand; parasiteIdx = i; }
          continue;
        }
        verbInf = cand; verbIdx = i; break;
      }
      // Verbos con pronombres enclíticos (contactarlos → Contactar)
      const stripped = t.replace(/(los|las|le|les|me|te|se|lo|la|nos)$/i, '');
      if (/(ar|er|ir)$/.test(stripped) && stripped.length >= 4 && allowed.some(v => stripped.startsWith(v))) {
        verbInf = stripped.charAt(0).toUpperCase() + stripped.slice(1);
        verbIdx = i; break;
      }
      if (/(ar|er|ir)$/.test(t) && t.length >= 4 && allowed.some(v => t.startsWith(v))) {
        const cand = t.charAt(0).toUpperCase() + t.slice(1);
        if (PARASITE.has(cand)) { if (!parasiteFallback) { parasiteFallback = cand; parasiteIdx = i; } continue; }
        verbInf = cand; verbIdx = i; break;
      }
    }
    // Si solo hubo verbo parásito, úsalo como último recurso
    if (!verbInf && parasiteFallback) { verbInf = parasiteFallback; verbIdx = parasiteIdx; }
    // Fallback: cualquier infinitivo aunque no esté en catálogo (stripeando enclíticos)
    if (!verbInf) {
      for (let i = 0; i < tokens.length; i++) {
        const raw = tokens[i]!;
        const t = raw.replace(/(los|las|le|les|me|te|se|lo|la|nos)$/i, '');
        if (/(ar|er|ir)$/.test(t) && t.length >= 5 && !STOPWORDS.has(t)) {
          const cand = t.charAt(0).toUpperCase() + t.slice(1);
          if (PARASITE.has(cand)) { if (!parasiteFallback) { parasiteFallback = cand; parasiteIdx = i; } continue; }
          verbInf = cand; verbIdx = i; break;
        }
      }
      if (!verbInf && parasiteFallback) { verbInf = parasiteFallback; verbIdx = parasiteIdx; }
    }

    if (!verbInf) return null; // sin verbo → no es actividad

    // Toma 1-2 substantivos después del verbo (descarta stopwords y preposiciones)
    const objs: string[] = [];
    for (let i = verbIdx + 1; i < tokens.length && objs.length < 2; i++) {
      const t = tokens[i]!;
      if (STOPWORDS.has(t)) continue;
      if (t.length < 3) continue;
      objs.push(t);
    }

    let label = (verbInf + (objs.length ? ' ' + objs.join(' ') : '')).trim();
    // Cap a 28 chars
    if (label.length > 28) label = label.slice(0, 25) + '…';
    return label;
  }

  // Limpia bullets/numeración y separa
  const cleaned = text
    .replace(/\r/g, '')
    .replace(/^[\s]*([0-9]+[\.\)]|[\-\*•·])\s*/gm, '');

  // Split por punto seguido de espacio, ; o saltos de línea
  const raw = cleaned.split(/(?:\.[\s\n]+|;[\s\n]+|\n+)/).map(s => s.trim()).filter(s => s.length >= 5);

  // Sub-split: divide oraciones largas en sub-cláusulas accionables
  // Filtra fragmentos cortos sin verbo (ej. "Teléfono", "Objetivos") que generan nodos basura
  const sentences: string[] = [];
  raw.forEach(s => {
    const subs = s.split(/(?:\.[\s]+|\s+también\s+|\s+luego\s+)/i).map(x => x.trim());
    const validSubs = subs.filter(x => {
      if (x.length < 20) return false;
      // Debe contener un verbo conocido O empezar como decisión
      const lower = x.toLowerCase();
      const hasVerbHere = VERBS.some(v => lower.includes(v)) ||
                          Object.keys(FIRST_PERSON).some(fp => new RegExp('\\b' + fp + '\\b').test(lower));
      const looksDecision = /^(si|cuando)\s+/.test(lower);
      return hasVerbHere || looksDecision;
    });
    if (validSubs.length <= 1) sentences.push(s); else sentences.push(...validSubs);
  });

  const activities: ActividadDetectada[] = [];
  sentences.forEach(sentence => {
    const lower = sentence.toLowerCase();

    // Es decisión? (estricto)
    const isDecision = isDecisionSentence(sentence);

    // Saltar narrativas puras sin acción
    const startsNarrative = isNarrativeStart(sentence);
    const hasActionVerb = VERBS.some(v => lower.includes(v)) ||
                          Object.keys(FIRST_PERSON).some(fp => new RegExp('\\b' + fp + '\\b').test(lower));

    if (!isDecision && !hasActionVerb) return;
    // Si es narrativa pura sin acción real, skip
    if (startsNarrative && !hasActionVerb && !isDecision) return;

    // Detección de rol: prefiere "ejecutivo comercial" para textos de banca
    let owner = '';
    for (const r of ROLES) {
      // Busca el rol como palabra exacta (con bordes)
      const re = new RegExp('\\b' + r.replace(/\s+/g, '\\s+') + '\\b', 'i');
      if (re.test(lower)) {
        // Evita asignar "cliente" si la frase es claramente del ejecutivo actuando SOBRE el cliente
        if (r === 'cliente' && /\b(saludo|atiendo|identifico|registro|contacto|llamo|hablo|verifico|explico|ingreso|valido|reviso|consulto|solicito|envío|envio|escalo|notifico|genero|firmo|escaneo|adjunto|asigno|clasifico|aprueba|cumple|decide)\b/i.test(lower)) {
          // Si la frase es del ejecutivo, prefiere "Ejecutivo Comercial"
          owner = 'Ejecutivo Comercial';
          break;
        }
        owner = titleCase(r); break;
      }
    }

    // Extrae sistema
    let system = '';
    for (const s of SYSTEMS) {
      if (lower.includes(s)) { system = s.toUpperCase(); break; }
    }

    // Genera label: extraer verbo + objeto
    let label = extractLabel(sentence);
    if (!label || label.length < 4) return;

    // REGLA HARD: toda actividad (NO decisión) debe empezar con verbo en infinitivo
    if (!isDecision) {
      const firstWord = label.split(/\s+/)[0]!.toLowerCase().replace(/[^a-záéíóúñ]/g, '');
      const isInfinitiveEnding = /(?:ar|er|ir)$/i.test(firstWord) && firstWord.length >= 4;
      const isInCatalog = VERBS_ALLOWED.some(v => firstWord.startsWith(v));
      if (!isInfinitiveEnding && !isInCatalog) {
        // Intento de salvataje: si la oración tiene un verbo conjugado conocido, lo reemplazo
        let salvaged = false;
        for (const conj in FIRST_PERSON) {
          if (new RegExp('\\b' + conj + '\\b', 'i').test(lower)) {
            label = FIRST_PERSON[conj] + ' ' + label.replace(/^\S+\s*/, '').trim();
            salvaged = true; break;
          }
        }
        if (!salvaged) return; // descartar — no es actividad válida
      }
    }

    // Inferir tipo de ejecución
    let executionType: TipoEjecucion = '';
    if (isDecision) {
      executionType = '';
    } else if (/correo\b|email\b|e-?mail\b|notific/.test(lower)) {
      executionType = 'email';
    } else if (/\bllam[ao]|teléfono|telefono|\bcall\b|presencial/.test(lower)) {
      executionType = 'phone';
    } else if (/automátic|automatic|batch|nightly|trigger|sistema autom|motor de riesg|validaciones automátic|consultas? a motor/.test(lower)) {
      executionType = 'automatic';
    } else if (/\bia\b|inteligencia artificial|copilot|machine learn|\bml\b|modelo predict/.test(lower)) {
      executionType = 'ai';
    } else if (/firma física|papel|sello|expediente físic|contrato físic|firmar/.test(lower)) {
      executionType = 'document';
    } else if (/\brpa\b|\bbot\b/.test(lower)) {
      executionType = 'rpa';
    } else if (system) {
      executionType = 'system';
    } else {
      executionType = 'manual';
    }

    activities.push({
      type: isDecision ? 'decision' : (system ? 'system' : 'task'),
      label,
      owner,
      system,
      executionType,
      note: sentence
    });
  });

  return activities;
}

function titleCase(s: string) {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

