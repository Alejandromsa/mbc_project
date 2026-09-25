# PLAYBOOK MBB · Levantamiento y Diagramación de Procesos
## Minsait Business Consulting Perú — estándar oficial v1.0

---

## PREFACIO EJECUTIVO

Este playbook codifica 15+ años de práctica consultiva de MBB en operaciones, destilado en reglas concretas, validables y enseñables. No es teoría BPMN de libro de texto. Es cómo hacemos levantamientos que el cliente entiende, que resisten auditoría, que generan recomendaciones de impacto.

Cada regla en este documento:
- Debe ser implementable como validación automática en ProcessIQ (software checks)
- Tiene una razón operacional clara (no es pedantería)
- Viene con un criterio de cumplimiento (sí/no, métrico, o heurístico)
- Es enseñable a un consultor junior en 15 minutos

---

## PARTE I: NOMENCLATURA Y LENGUAJE

### 1. Convención de Naming para Actividades

**Regla base:** Toda actividad se nombra con el patrón `[VERBO] + [OBJETO DIRECTO]` en presente imperativo, voz activa, modo infinitivo o imperativo suave.

**Por qué:** El lector debe entender **qué ocurre** (verbo) **a qué cosa** (objeto) en el tiempo que tarda en leer la caja. Sin ambigüedad. Un verbo débil ("gestionar", "procesar", "tratar") crea fricción cognitiva en el cliente y en auditoría.

**Cómo valida ProcessIQ:**
- Campo de nombre de actividad: validar que comience con verbo del diccionario permitido (ver catálogo abajo).
- Expresar advertencia si >8 palabras o >50 caracteres.
- Auto-sugerir nombre basado en patrón si se deja en blanco.

#### Verbos permitidos (catálogo normativo)

**Origen de datos / captura:**
- Recibir, Solicitar, Recolectar, Extraer, Importar, Escanear, Validar (entrada)

**Procesamiento transaccional:**
- Registrar, Ingresar, Cargar, Asignar, Consolidar, Calcular, Comparar, Evaluar, Depurar, Enriquecer

**Análisis y decisión:**
- Revisar, Analizar, Auditar, Evaluar, Verificar, Comparar, Aprobar, Rechazar, Autorizar

**Gestión de excepciones:**
- Escalar, Reasignar, Notificar, Rechazar, Revertir, Corregir

**Acción externa:**
- Enviar, Comunicar, Notificar, Entregar, Descargar, Publicar, Exportar, Imprimir

**Custodio / fin:**
- Archivar, Almacenar, Cerrar, Completar, Finalizar, Liquidar

#### Verbos prohibidos (anti-patrones)

- **Gestionar, Procesar, Tratar, Manejar:** Demasiado vagos. Reemplazar con verbo específico.
- **Ser, Estar, Tener:** No son acciones. "Actividad: ser autorizado" es un estado, no una actividad. Cambiar a "Recibir autorización".
- **Ir, Venir, Pasar:** Demasiado narrativos. Si es movimiento de físico, especificar: "Transportar expediente". Si es flujo lógico, usar "Derivar" o "Escalar".
- **Hacer, Realizar, Ejecutar:** Párásitos. Si no sabes qué específicamente, vuelve a entrevistar.

#### Objeto directo

El objeto debe ser **específico y sustantivo**:
- ✅ "Registrar solicitud de crédito"
- ❌ "Registrar solicitud" (qué tipo de solicitud es ambiguo en primer contexto)
- ✅ "Validar documento de identidad"
- ❌ "Validar documentos" (plural genérico oculta decisiones)
- ✅ "Asignar caso a gestor"
- ❌ "Asignar" (a quién, qué cosa)

**Regla de longitud:**
- Máximo 8 palabras / 50 caracteres.
- Si necesitas más, la actividad es demasiado gruesa. Descomponer.

**Modo verbal preferido:**
- Infinitivo suave: "Registrar", "Validar", "Enviar" (recomendado para LATAM/UK).
- NO imperativo duro: "¡Registra!", "¡Valida!" (confunde roles con órdenes personales).

#### Ejemplos validados

| Correcto | Incorrecto | Razón |
|----------|-----------|-------|
| Recibir solicitud de crédito | Procesar solicitud | Verbo específico vs paragoge |
| Validar identidad del cliente | Validar cliente | Qué se valida es explícito |
| Calcular cuota mensual | Hacer cálculo | Verbo genérico |
| Notificar rechazo al solicitante | Comunicar rechazo | "Notificar" + "a quién" vs "comunicar" |
| Escanear documento de RUC | Escanear documentos | Qué documento, singular claro |
| Archivar expediente en física | Guardar | Dónde se guarda (metadata implícita) |

---

### 2. Naming de Gateways (Decisiones)

**Regla base:** Toda decisión se nombra como **pregunta cerrada** (¿Sí/No?) o **ramificación explícita** (¿Qué tipo de X?). Nunca como afirmación o estado.

**Por qué:** Un gateway es un divergencia lógica. El cliente lee la pregunta y entiende inmediatamente cuál es la condición. Una afirmación ("Cliente aprobado") deja ambiguo si es condición de entrada o estado de salida.

**Cómo valida ProcessIQ:**
- Si el nodo es Gateway (XOR, OR, AND): validar que el nombre comience con "¿".
- Si tiene 2 salidas: sugerir "¿Sí/No?" como template.
- Si tiene >2 salidas: validar que cada salida esté etiquetada con valor único (ej. "¿Tipo de cliente?" → "Platinum" / "Gold" / "Regular").
- Advertencia si hay salida sin etiquetar en un gateway múltiple.

#### Preguntas cerradas (Sí/No)

- ✅ "¿Solicitud cumple requisitos mínimos?"
- ✅ "¿Renta anual > USD 100k?"
- ✅ "¿Cliente tiene antecedentes negativos?"
- ❌ "Validación de requisitos" (estado, no pregunta)
- ❌ "¿Requisitos mínimos?" (falta verbo, incompleto)

Etiquetar siempre las dos salidas:
- Rama "Sí" → hacia flujo normal
- Rama "No" → hacia excepción / rechazar / escalar

#### Ramificaciones múltiples

- ✅ "¿Cuál es el tipo de cliente?" → "Persona natural" / "Jurídica" / "Extranjero"
- ✅ "¿En qué estado se encuentra el documento?" → "Recibido" / "En revisión" / "Rechazado" / "Aprobado"
- ❌ "Clasificación de cliente" (no es pregunta)
- ❌ "¿Cliente?" (demasiado vago)

Máximo 4-5 salidas sin convergencia. Más → descomponer o usar subproceso.

#### Etiquetado de salidas

Toda flecha que sale de un gateway múltiple debe llevar etiqueta:
- **Formato:** Valor concreto, una palabra o frase corta
- ✅ "Sí" / "No"
- ✅ "Persona natural" / "Jurídica"
- ✅ ">100k" / "<100k"
- ❌ Sin etiqueta
- ❌ Etiqueta idéntica a dos salidas distintas (ambigüedad)

**Regla de convergencia obligatoria:** Todo gateway sin convergencia es deuda técnica. ProcessIQ debe alertar: "Gateway XOR abierto sin convergencia, ¿es intencional?"

---

### 3. Naming de Eventos (Start / End)

**Regla base:** 
- **Start:** Nombre un disparador o condición de entrada. Una sola palabra o frase corta. "Solicitud recibida", "Horario fin de mes", "Excepción detectada".
- **End:** Nombre un **outcome distinto** del proceso. No "Fin del proceso". Sino "Crédito otorgado", "Solicitud rechazada", "Cliente informado".

**Por qué:** En audiencia o auditoría, el cliente quiere ver todos los ends posibles. Si hay un solo "End", hemos ocultado casuística. Si todos son "Fin del proceso", es información inútil.

**Cómo valida ProcessIQ:**
- Start: máximo 50 caracteres, sugerir nombre si está vacío.
- End: validar que **no sea genérico** (bloquear "Fin", "Final", "Fin del proceso"). Sugerir template: "Resultado: [estado]" si está vacío.
- Count de End events: si >1, validar que sean mutuamente excluyentes (no debería haber ambigüedad en cuál end se alcanza).

#### Ejemplos

| Evento Start | Evento End (outcomes) | Validez |
|--------------|----------------------|---------|
| Solicitud recibida | Crédito aprobado<br/>Solicitud rechazada por renta<br/>Solicitud rechazada por antecedentes | ✅ Múltiples outcomes claros |
| Horario fin de mes | Reporte generado y enviado<br/>Reporte enviado con errores<br/>Fallo en generación | ✅ Cada uno es outcome distinto |
| Llamada entrante | Incidente asignado<br/>Incidente rechazado (out of scope)<br/>Incidente escalado | ✅ Estados finales claros |
| Cliente genera solicitud | Fin del proceso | ❌ Demasiado genérico |
| Recepción | Procesado | ❌ No describe outcome real |

---

## PARTE II: GRANULARIDAD Y DESCOMPOSICIÓN

### 4. Regla del Nivel de Granularidad

**Regla base:** Una actividad representa **1 verbo + 1 responsable primario + 1 o 2 sistemas de soporte**. Si necesitas decir "and" entre esos tres elementos, es señal de que deberían ser 2+ actividades.

**Por qué:** Granularidad correcta permite análisis real. Una actividad que "recibe, valida y registra" esconde dónde está el bottleneck, dónde falla, cuánto tarda cada paso.

**Métrica de granularidad:** El responsable debe poder estimar la **duración en minutos**. Si dice "entre 5 minutos y 2 horas, depende", probablemente es demasiado gruesa.

#### Regla del 1-3-5

- **1 verbo:** Una acción primaria clara.
- **1-3 sistemas:** No más de 3 aplicaciones involucradas (idealmente 1).
- **1 responsable primario:** Una sola persona o rol (el "dueño" del paso).

**Ejemplos de descomposición:**

❌ **Demasiado gruesa:** "Procesar solicitud de crédito"
- Incluye: Recibir, Validar documentación, Realizar análisis de riesgo, Calcular cuota, Redactar condiciones, Obtener firma
- → 6 actividades separadas, 4-5 roles distintos, 3+ sistemas

✅ **Granularidad correcta:**
```
Recibir solicitud de crédito [5 min, 1 persona, CRM]
   ↓
Validar documento de identidad [10 min, 1 persona, Sistema biométrico]
   ↓
Extraer datos financieros [15 min, 1 persona, SIF/scoring]
   ↓
Calcular cuota mensual [5 min, 1 sistema automático, Pricing engine]
   ↓
Evaluar riesgo [30 min, 1 analista, Scoring + manual]
   ↓
Redactar términos [20 min, 1 especialista legal, Word + Normativa]
   ↓
Obtener firma digital [10 min, 1 cliente, DocuSign]
```

#### Máximo / Mínimo de actividades por proceso visible

- **Mínimo:** 3 actividades (start + algo + end es demasiado simple, indica falta de detalle).
- **Máximo en un único diagrama:** 12-15 actividades. Más → descomponer en subprocesos.
- **Regla práctica:** Si cunta >N actividades, la mayoría debe estar en swimlanes separadas (señal de que es paralelo, no secuencial).

**Cómo valida ProcessIQ:**
- Alert si <3 actividades en proceso top-level.
- Alert si >15 actividades en un solo nivel sin subprocesos.
- Sugerir: "Considerar extraer [X actividades] a un subproceso o actividad compuesta".

---

### 5. Cuándo Extraer a Subproceso

**Regla:** Una secuencia de 4+ actividades que:
- Comparten mismo responsable primario, Y
- Tienen una entrada y una salida clara, Y
- Pueden ser "ocultadas" sin pérdida de comprensión del flujo padre

→ debería ser un **subproceso** (collapsed).

**No extraer a subproceso si:**
- Las actividades están en roles / áreas completamente distintas (usa swimlanes).
- Hay gateways complejos que necesitan verse para auditoría.
- Es un one-time o excepción (usa flujo de excepción, no subproceso).

**Ejemplos:**

✅ **Extraer a subproceso:**
```
Procesar solicitud de crédito
   → [Subproceso] Validación de documentación
      (contiene 4 actividades internas, un responsable, una decision)
   → [Subproceso] Análisis de riesgo
      (contiene 3 actividades internas, analista, una decision)
   → Enviar oferta
```

❌ **No extraer a subproceso (usar swimlanes):**
```
Área Crédito: Registrar solicitud → Validar → Evaluar
Área Riesgos: Análisis paralelo → Ranking
Área Legal: Redactar cláusulas
→ Convergen en decisión final
```

**Cómo valida ProcessIQ:**
- Si un subproceso (collapsed) tiene <3 actividades internas → advertencia "Subproceso muy simple, considerar expandir".
- Si expandir un subproceso muestra >20 actividades totales en diagrama padre → sugerir refactor.

---

## PARTE III: LAYOUT, ESPACIADO Y VISUALIZACIÓN

### 6. Dirección de Flujo y Orientación

**Regla base:** 
- **Top-to-bottom (vertical):** Estándar por defecto para procesos secuenciales. Máxima legibilidad. El ojo sigue líneas verticales naturalmente.
- **Left-to-right (horizontal):** Solo si hay mucho paralelismo explícito y swimlanes laterales (ej. procesos colaborativos cross-área con sincronización fuerte).

**Por qué:** Occidental lee top-to-bottom. Monitores están en landscape. BPMN estándar asume top-to-bottom.

**Cuándo cambiar a left-to-right:**
- Proceso donde 3+ swimlanes están activos en paralelo durante la mayoría del flujo.
- Proceso de comunicación bidireccional (ej. negociación de contrato).
- Cuando el cliente insiste y hay espacio horizontal disponible.

**Cómo valida ProcessIQ:**
- Default orientation: top-to-bottom.
- User toggle: "Cambiar a left-to-right".
- Auto-warn si hay >5 swimlanes en vertical → "Considerar cambiar a horizontal para mejorar legibilidad".

---

### 7. Evitar Cruces de Líneas (Regla Crítica)

**Regla base:** **Cero cruces de líneas permitidas** en un diagrama de calidad MBB. Si hay cruces, es señal de mala organización o falta de comprensión del flujo.

**Por qué:** Cada cruce cuesta 100 ms de procesamiento visual al lector. Multiplica por 50 nodos = cliente exhauasto. Además, cruces ocultan errores lógicos (loops, ramificaciones invisibles).

**Cómo evitar cruces:**

#### a) Reo rdenamiento de swimlanes
Si los cruces son entre lanes:
- Agrupar actividades de mismo rol que están "alejadas" en el flujo.
- Reordenar orden de lanes para seguir flujo general.
- ✅ Lane A (Crédito) → Lane B (Riesgos) → Lane A → Lane B
- ❌ Lane A → Lane B → Lane A → Lane B → Lane A (zigzag)

#### b) Enrutamiento ortogonal de conectores
Usar solo líneas horizontales + verticales, nunca diagonales:
- **Punto de anclaje:** Siempre desde el mismo borde del nodo (ej. salida siempre desde borde derecho, entrada desde borde izquierdo en horizontal).
- **Segmentos:** Máximo 4 codos por conector (ej. derecha → arriba → derecha → abajo).

**Regla de espacio:** Mínimo 20 px entre líneas paralelas para evitar confusión visual.

#### c) Conectores off-page
Si hay >3 cruces en una sección:
- Usar conector off-page (círculo pequeño con label: "Ir a Sección B", "Viene de Sección A").
- Dividir diagrama en múltiples vistas lógicas.
- **Label pattern:** "→ Validación del riesgo" (flecha + nombre actividad destino).

**Cómo valida ProcessIQ:**
- Detectar automáticamente si dos conectores se cruzan.
- Alert visual: líneas que se cruzan se pintan en **rojo punteado**.
- Sugerir: "X cruces detectados. Opciones: (1) Reordenar lanes, (2) Crear off-page connector, (3) Refactor a subproceso".
- **Validación estricta:** Bloquear export a cliente si hay cruces sin off-page (no es paranoia, es standard).

#### Ejemplo de antes/después

```
❌ ANTES (con cruces):
┌─────────────┐
│ Lane A      │  Start → Activity A → Activity B ───┐
│             │                        ↓             │
│ Lane B      │  Activity C ← Activity D ← Activity E│
│             │           ↑                          │
│ Lane A      │  Activity F ──────────────────────┤
└─────────────┘

✅ DESPUÉS (sin cruces, swimlanes reordenadas):
┌─────────────┐
│ Lane A      │  Start → Activity A → Activity B → Activity F
│             │                ↓                      ↑
│ Lane B      │             Activity E → Activity D ──┘
│             │                      ↑
│ Lane C      │                   Activity C
└─────────────┘
```

---

### 8. Espaciado y Alineación

**Regla base:** 
- **Espaciado vertical:** Mínimo 60 px entre actividades en flujo secuencial.
- **Espaciado horizontal:** Mínimo 40 px entre actividades en flujo paralelo (swimlanes).
- **Alineación a grid:** 4 px (invisible pero fuerza organización).

**Por qué:** Demasiado juntas → confusión visual. Muy separadas → documento sale de escala. Grid invisible fuerza consistencia estética, facilita edición posterior.

**Tamaño de nodos:**
- Actividad (rectángulo redondeado): 100 x 50 px estándar.
- Gateway (rombo): 40 x 40 px.
- Event (círculo): 35 x 35 px.
- Pool / Lane header: altura min 30 px.

**Cómo valida ProcessIQ:**
- Auto-grid alineación: Ctrl+A → "Alinear a grid" reorganiza todo a posiciones múltiplo de 4 px.
- Auto-espaciado: "Distribución automática" → equidista nodos dentro de una sección.
- Visual feedback: mostrar guías de alineación (líneas fantasma azules) al mover nodos.

---

### 9. Swimlanes: Cuándo, Cómo y Dónde

**Regla base:** 
- **¿Siempre swimlanes?** No. Si el proceso es 100% secuencial (mismo responsable de start a end), swimlanes son overhead. Pero una Process map sin identificación clara de **quién hace qué** no es profesional.
- **Threshold:** Si hay >1 responsable, swimlanes son recomendadas. Si hay >3 responsables o la mano pasa >3 veces entre áreas, swimlanes son **obligatorias**.

**Por qué:** Swimlanes hacen visible dónde está el trabajo (concentración, distribución). Hacen visible dónde cambia responsabilidad (oportunidad de mejora). Cliente ve: "Aha, 40% del tiempo espera a la otra área".

#### Orientación: Horizontal vs Vertical

- **Horizontal (recomendado):** Lanes apiladas verticalmente, flujo va de arriba a abajo. Cada lane = rol / área / actor. Más legible en pantalla estándar.
- **Vertical:** Lanes lado a lado. Menos común. Solo si hay mucha paralelismo horizontal entre actores.

#### Naming de lanes

- **Patrón:** Nombre claro del rol o área, 1-3 palabras.
- ✅ "Oficial de Crédito", "Área de Riesgos", "Cliente", "Sistema Automático"
- ❌ "Juan", "Persona 1", "El que valida", "Procesa"

**Regla especial:** Si hay interacción con cliente (es un proceso de cara al cliente), dedicar una lane superior o lateral para "Cliente" o "Solicitante". Hace visible dónde cliente interviene.

#### Cuando NO usar swimlanes

- Proceso trivial (<5 actividades, 1 responsable).
- Diagrama de alto nivel donde lanes distraerían del flujo principal (usar en versión detallada después).

**Cómo valida ProcessIQ:**
- Default: sugerir swimlanes si >1 responsable distinto detectado en las actividades.
- Validación: si hay actividad sin responsable → bloquear export hasta que esté asignada a una lane.
- Visual: lane vacía → alerta "Lane [X] no tiene actividades, ¿eliminar o mover actividades?"

---

## PARTE IV: TIPOS DE EJECUCIÓN (ICONOGRAFÍA)

### 10. Catálogo de Tipos de Ejecución y Visualización

Cada actividad es ejecutada bajo un **mode** distinto. ProcessIQ debe codificar visualmente cuál para que auditores, clientes y el propio equipo entienda cuánta automatización, riesgo o dependencia de humanos hay.

**Regla:** Toda actividad debe tener un **tipo de ejecución** asignado. El icono va en esquina superior derecha de la actividad. Color de fondo de la caja también puede variar.

#### Catálogo normativo

| Tipo | Ícono sugerido | Color fondo | Descripción | Ejemplo |
|------|---|---|---|---|
| **Manual** | Mano / 👤 | Blanco / gris claro | Humano, sin sistema, decisión + trabajo físico/mental puro | Revisar documento físico, tomar decisión de aprobación, llenar formulario en papel |
| **Soportado por sistema** | Monitor + flecha | Azul claro | Humano + sistema, semi-automático. Humano inicia/valida, sistema ejecuta parte | Ingresar datos en CRM, validar con clic en sistema, autorizar OT en SAP |
| **Automático** | Engranaje / ⚙ | Verde claro | Sin intervención humana. Job batch, trigger automático, integración | Calcular cuota (pricing engine), generar reporte nightly, crear folio automático |
| **Asistido por IA** | Cerebro / 🧠 | Púrpura claro | Humano leyendo sugerencia de ML/LLM, toma decisión sobre eso | Agent sugiere clasificación de riesgo (humano aprueba), copilot draft contrato (abogado revisa) |
| **Vía correo** | Sobre / ✉ | Naranja claro | Comunicación por email, no es cambio de sistema | Enviar oferta, Solicitar información a cliente vía email |
| **Vía teléfono/llamada** | Teléfono / ☎ | Rojo claro | Comunicación sincrónica, voz, call center | Llamar al cliente, confirmar datos vía teléfono |
| **Documental** | Documento / 📄 | Marrón claro | Firma física, documento impreso, proceso documental tradicional | Firmar contrato físico, estampar sello, archivar expediente papel |
| **Vía RPA / Bot** | Robot / 🤖 | Gris oscuro | Robotic Process Automation, bot mimics usuario | Bot llena campos en legacy system, Bot extrae datos de portal cliente |

#### Posición del ícono

Esquina superior derecha de la caja (10 px de margen). No obstruye el nombre. 

#### Ejemplo visual

```
┌──────────────────────────┐
│ Validar identidad     [👤] │  ← Manual
└──────────────────────────┘

┌──────────────────────────┐
│ Ingresar datos     [💻] │  ← Soportado
└──────────────────────────┘

┌──────────────────────────┐
│ Calcular cuota     [⚙] │  ← Automático
└──────────────────────────┘

┌──────────────────────────┐
│ Evaluar riesgo     [🧠] │  ← Con IA
└──────────────────────────┘
```

#### Validaciones automáticas

- **Alert:** Si actividad es manual pero tarda >60 min (posible descomposición).
- **Alert:** Si hay >40% actividades manuales en proceso de cara al cliente (señal de oportunidad RPA / automatización).
- **Alert:** Si actividad automática tiene responsable humano asignado (probablemente error de clasificación).
- **Stat opcional:** Reportar % de cobertura de automatización a nivel de diagrama.

---

### 11. Metadata Obligatoria vs. Opcional por Actividad

Cada actividad es una **cápsula de información**. ProcessIQ debe permitir captura de metadata en un panel lateral, con validaciones estrictas sobre qué es O vs P.

#### Metadata OBLIGATORIA (bloquea export si falta)

| Campo | Formato | Por qué | Validación |
|-------|---------|--------|-----------|
| **Nombre actividad** | Verbo + objeto | Base de comprensión | Ya cubierto (2.1) |
| **Tipo de ejecución** | Dropdown (8 opciones) | Entender cómo se ejecuta | No null |
| **Responsable (rol)** | Free text o dropdown | Quién hace qué | No null, max 50 char |
| **Duración promedio** | Número + unidad (min/hora/día) | Base para análisis de capacidad | >0, numérico |
| **Volumen** | Número (transacciones/mes o similar) | Base de costing | >0 o "N/A", numérico si aplica |
| **Acción de valor** | Dropdown: VA / BVA / NVA | Identificar trabajo sin valor | No null, selección triaria |

#### Metadata OPCIONAL (recomendada pero no bloquea)

| Campo | Formato | Cuándo rellenar |
|-------|---------|-----------------|
| **Sistema soporte** | Free text, max 100 char | Si existe; dejar vacío si manual puro |
| **Tiempo mínimo / máximo** | Número + unidad | Si hay variabilidad conocida |
| **SLA** | Duración + unidad | Si hay contrato o expectativa de servicio |
| **Frecuencia** | Dropdown: Diaria/Semanal/Mensual/Ad-hoc | Si no es cada transacción |
| **Documentos entrada** | Free text, coma-separado | Si hay documentación formal |
| **Documentos salida** | Free text, coma-separado | Si genera output documentado |
| **Reglas de negocio** | Text area, max 500 char | Si hay lógica condicional no obvia |
| **Pain points** | Text area, max 300 char | Si cliente ya ha verbalizado |
| **KPI vinculado** | Dropdown (si existen KPIs globales del proceso) | Vincular actividad con métrica |
| **Riesgos / controles** | Text area | Si hay riesgo operacional / compliance |

#### Cómo valida ProcessIQ

- **Pre-export:** Checklist de metadata obligatoria. Si falta algo → prompt rojo, bloquea, sugiere "Completar antes de exportar".
- **Warnings en canvas:** Si una actividad manual tiene duración >120 min → tooltip naranja "Actividad muy larga, considerar descomponer".
- **Analítica visual opcional:** Mini-gráfico en diagrama (hover) mostrando VA/BVA/NVA distribution.

---

## PARTE V: CONEXIONES, GATEWAYS Y LÓGICA

### 12. Etiquetado de Conexiones (Flechas)

**Regla base:**

- **Flujo secuencial sin decisión:** Sin etiqueta.
- **Flujo que sale de un gateway:** Etiqueta obligatoria (la condición o valor).
- **Flujo condicional en actividad:** Etiqueta si es raro o no obvio.

**Por qué:** Etiquetas reducen ambigüedad. Pero demasiadas etiquetas distraen. Balance: etiquetar solo lo que requiere decisión lógica.

#### Patrones de etiquetado

**✅ Etiquetar siempre:**
```
   ¿Renta > 100k?
   /              \
 Sí              No
  ↓               ↓
Aprobación     Rechazo
```

**✅ Etiquetar en ramificación múltiple:**
```
   ¿Tipo cliente?
   /    |    \
Oro  Plata Bronce
```

**✅ Etiquetar si hay excepción que interrumpe:**
```
Procesar ──error──→ Escalar
```

**❌ No etiquetar flujo lineal:**
```
Recibir → Validar → Registrar  (sin etiquetas, es obvio)
```

**❌ No duplicar etiquetas en salidas distintas del mismo gateway:**
```
❌ ¿Aprobado?
   /      \
  Sí       Sí  ← ERROR: las dos dicen lo mismo
```

#### Formato de etiqueta

- Breve: 1-2 palabras máximo.
- Claro: "Sí" / "No", o valor específico ("Gold", "Rechazado", ">100k").
- Posición: centrada sobre la línea, sin rotar (excepto si flujo es muy horizontal).

**Cómo valida ProcessIQ:**
- Detectar gateway sin etiquetas en salidas → alert rojo "Etiquetas faltantes en gateway múltiple".
- Detectar etiqueta duplicada → alert naranja "¿Dos salidas con la misma etiqueta?"
- Sugerir auto-etiquetado: si gateway tiene 2 salidas, sugerir "Sí / No"; si 3+, dejar en blanco y esperar usuario.

---

### 13. Tipos de Conectores y Semántica

BPMN diferencia 4 tipos de conectores. ProcessIQ debe distinguirlos visualmente y validar uso correcto.

| Tipo | Visual | Significado | Cuándo usar |
|------|--------|-------------|-----------|
| **Sequence Flow** | Flecha sólida negra | Actividades secuenciales, control de flujo | 99% de los casos. Actividad → Actividad |
| **Message Flow** | Flecha punteada | Comunicación entre procesos / pools (no es cambio de paso del mismo proceso) | Cuando hay dos procesos distintos y comunican (ej. cliente envía solicitud a banco) |
| **Association** | Flecha punteada gris | Vinculación de datos/documentos, no flujo | Documento está asociado a una actividad pero no es el flujo en sí |
| **Data Flow** | (Advanced, raro) | Flujo de datos | Si mapear transformaciones de datos es crítico |

**Regla simplificada para LATAM:** En 95% de casos, usar solo **Sequence Flow**. Message Flow si hay dos pools separados. Association si hay artefactos.

**Cómo valida ProcessIQ:**
- Default: Sequence Flow para todos los conectores.
- Educación: Si usuario selecciona Message Flow, popup: "¿Está conectando dos procesos distintos (dos pools)? Si sí, OK. Si es continuación del mismo proceso, usar Sequence Flow".
- Visual feedback: Marcar Message Flow en color distinto para que no parezca un error.

---

### 14. Loops y Reprocesos

**Regla base:** 

Un **loop** es cuando el flujo regresa a una actividad anterior porque algo falló o necesita repetición.

- **Loop corto (<=2 pasos atrás):** Flecha directa.
- **Loop largo (>2 pasos atrás):** Off-page connector para evitar cruces.
- **Loop infinito potencial:** Alert automático si hay ciclo sin salida.

#### Cómo dibujar loops sin confusión

❌ **Incorrecto (confuso, cruza líneas):**
```
Recibir → Validar → Procesar ─────┐
    ↑                              │
    └──────────────────────────────┘
```

✅ **Correcto (evita cruce, usa off-page o claridad visual):**
```
Recibir → Validar ─→ [Si error] ──→ Escalar / Corregir
            ↑  |
            └──[Si OK] ──→ Procesar ──→ Fin
```

O con loop explícito:

```
Validar ──[Error]──→ Corregir ──→ [Repetir validación]
         ↓
      [OK]
         ↓
      Procesar
```

**Regla de ciclos:** 
- Máximo 1 loop de repetición clara en un diagrama visible.
- Si hay N ciclos complejos (ej. cliente rechaza propuesta, vuelve a redactar, cliente rechaza de nuevo, etc.), extraer a subproceso: "[Subproceso] Iteración con cliente".

**Cómo valida ProcessIQ:**
- Detectar ciclos automáticamente: alertar si hay loop sin salida explícita.
- Flag: "Loop detectado: [actividad A] → ... → [A]. ¿Es intencional (retry)? ¿O hay un gateway que debería salir?"
- Sugerir: Si loop tarda más de 1 día, cambiar a process asincrónico o subproceso.

---

## PARTE VI: VALIDACIONES Y ANTIPATRONES

### 15. Antipatrones Críticos que ProcessIQ Debe Detectar

ProcessIQ debe tener **linter automático** que corre en background y marca issues. No bloquea (es soft), pero hace visible antes de export.

| Antipatrón | Síntoma | Severidad | Sugerencia |
|-----------|---------|-----------|-----------|
| **Actividad huérfana** | Nodo sin entrada o sin salida (excepto start/end) | 🔴 Crítica | Conectar o eliminar |
| **Gateway sin convergencia** | XOR/OR abierto que nunca reconverge | 🔴 Crítica | Añadir merge o explicar |
| **Ciclo infinito** | Loop sin salida posible | 🔴 Crítica | Añadir gateway de salida |
| **Actividad sin responsable** | Metadata: responsable vacío | 🟠 Alta | Llenar antes de export |
| **Actividad sin duración** | Metadata: tiempo promedio vacío | 🟠 Alta | Estimar o marcar "N/A" |
| **Nombre demasiado largo** | >50 caracteres o >8 palabras | 🟡 Media | Acortar o descomponer |
| **Verbo prohibido** | "Gestionar", "Procesar", "Ser", etc. | 🟡 Media | Sugerir alternativa |
| **Gateway con nombre incorrecto** | No empieza con ¿ | 🟡 Media | Cambiar a pregunta |
| **Líneas cruzadas detectadas** | 2+ conectores se intersectan | 🟡 Media | Reordenar o usar off-page |
| **Lane vacía** | Swimlane sin actividades | 🟡 Media | Eliminar o mover actividades |
| **Falta KPI en proceso crítico** | Proceso es "de cara a cliente" pero no hay SLA/KPI | 🟡 Media | Agregar metadata |
| **Múltiple start o end sin disparador distinto** | 2+ Start events pero sin semántica clara | 🟢 Baja | Documentar si es intencional |
| **Actividad manual >120 min** | Manual sin automatización que tarda mucho | 🟢 Baja | Considerar descomponer |

**Cómo implementar:**
- Validator.js que corre cada vez que usuario hace cambio.
- Panel izq ("Issues") muestra lista de flagged items con ícono de severidad.
- Hover en issue → jump a nodo afectado en canvas.
- Export PDF/PPTX: si hay 🔴, bloquea. Si hay 🟠+, prompt confirmar "¿Exportar con issues?"

---

### 16. Reglas de Calidad para Gateways

Los gateways son fuente común de errores. ProcessIQ debe ser estricto aquí.

**Regla de convergencia obligatoria:**

Todo gateway que diverge debe converger (juntarse) antes de fin de proceso. Excepciones: el gateway es el último nodo (antes del end).

```
✅ Correcto:
   ¿A?
  /   \
Act1  Act2
  \   /
   Act3

❌ Incorrecto (XOR sin convergencia):
   ¿A?
  /   \
Act1  Act2
       (fin del proceso sin reconverger)
```

**Regla de decisión múltiple:**

Si un gateway tiene >4 salidas, es señal de que necesita descomposición.

```
✅ Permitido:
   ¿Tipo cliente?
   /  |  \  \
  A1 A2 A3 A4

❌ Demasiadas:
   ¿Criterio X?
   / | | | | \ \ \
  (8 salidas)
```

**Validación de etiquetas:**

Toda salida de un gateway múltiple debe tener etiqueta y ser **mutuamente excluyente** con las otras.

```
✅ Correcto (mutuamente excluyentes):
   ¿Monto?
   / | \
 <1k 1-10k >10k

❌ Incorrecto (solapadas):
   ¿Monto?
   / | \
<5k 1-10k >1k  ← "1-10k" y ">1k" solapan
```

**Cómo valida ProcessIQ:**
- Detectar XOR sin convergencia → 🔴 crítico, bloquea export.
- Contar salidas: si >4, advertencia naranja.
- Validar etiquetas no solapadas → heurística simple (si usuario escribe rango, advertir).

---

## PARTE VII: SWIMLANES, POOLS Y RESPONSABILIDAD

### 17. Diseño y Estructura de Swimlanes

Retomando (6), pero con reglas más específicas.

**Regla: Cliente siempre en lane separada (si es proceso de cara al cliente).**

Procesos donde cliente interviene (solicita, aprueba, firma) deben tener una **lane cliente** separada, típicamente arriba (horizontal) o a la izq (vertical).

```
┌─────────────┐
│ CLIENTE     │  Solicita → Revisa propuesta → Firma
├─────────────┤
│ BANCO       │  Recibe → Analiza → Prepara → Envía
├─────────────┤
│ SIS.AUTO.   │  Registra → Calcula → Audita
└─────────────┘
```

**Regla: Orden de lanes sigue flujo principal.**

Las lanes no deben estar aleatorias. Deben reflejar secuencia o jerarquía:

```
❌ Incorrecto (saltos aleatorios):
Lane B (Riesgos) [primer rol en aparecer]
Lane A (Crédito) [segundo rol]
Lane D (Finanzas)
Lane C (Legal)

✅ Correcto (orden natural):
Lane A (Cliente) [inicia]
Lane B (Crédito) [recibe y procesa]
Lane C (Riesgos) [analiza]
Lane D (Legal) [redacta]
Lane E (Sistema) [registra]
```

**Regla: Pool vs Lane**

- **Pool:** Otra organización completa o process separado (ej. "Banco XYZ" vs "Sistema Externo"). Raramente usado en LATAM.
- **Lane:** Rol / área dentro de misma organización.

Mantener Pool para casos reales de interacción inter-organizacional. Si es intra-org, todo es Lanes dentro un único Pool.

**Cómo valida ProcessIQ:**
- Warning si >6 lanes en un diagrama (considerar agrupar o descomponer).
- Detectar lane sin actividades → alert "Lane [X] vacía, ¿eliminar?"
- Si proceso es de cara a cliente pero no hay lane "Cliente" → sugerir "¿Debería haber una lane de Cliente?"

---

## PARTE VIII: PLANTILLAS Y ARQUETIPOS

### 18. Plantillas de Procesos Estándar (Archetipos)

Para acelerar levantamiento y mantener consistencia, ProcessIQ debe tener **8 templates** pre-construidas que el usuario puede instanciar.

#### Arquetipo 1: Proceso Transaccional (O2C, P2P, L2C)

**Estructura típica:**
- 1-2 actividades de entrada (recibir, validar formato)
- 1-2 gateways de decisión (cumplen requisitos, autorización)
- 2-5 actividades de procesamiento (cálculo, registro, etc.)
- 1-2 actividades de salida (confirmar, entregar)
- 2-3 ends (aprobación / rechazo / excepción)

**Actividades típicas:**
```
Recibir solicitud → Validar datos → Análisis → ¿Aprobado? 
                                        ├─Sí→ Registrar → Notificar aprobación ✓
                                        └─No→ Registrar rechazo → Notificar rechazo ✗
```

**KPI crítico:** Tiempo total, tasa de aprobación, % manual vs automático.

#### Arquetipo 2: Proceso de Servicio al Cliente

**Estructura típica:**
- 1 entrada (solicitud / llamada / chat)
- 1-2 gateways de clasificación (in-scope, urgencia, complejidad)
- 3-5 actividades de resolución (investigación, coordinar, comunicar)
- 1-2 actividades de cierre (confirmación, encuesta satisfacción)
- 2-3 ends (resuelto / escalado / cerrado sin resolver)

**Característica:** Alto % de comunicación (email, teléfono, chat). Múltiples loops si cliente rechaza solución.

**KPI crítico:** Tiempo de respuesta, % resuelto 1er contacto, CSAT.

#### Arquetipo 3: Proceso de Aprobación / Autorización

**Estructura típica:**
- 1 entrada (solicitud de autorización)
- 1 gateway de montos / tipos (autoridad de firma, comité)
- 2-3 actividades de review (análisis, reunión comité, etc.)
- 1-2 gateways de decisión (aprueba / rechaza / pide info adicional)
- 1-2 actividades de comunicación (notificar, registrar)
- 2-4 ends (aprobado / rechazado / en espera / retornado para ajuste)

**Característica:** Puede tener loops si cliente debe ajustar y reenviar.

**KPI crítico:** Tiempo de ciclo, % aprobación, % retrabajo.

#### Arquetipo 4: Proceso de Cumplimiento / Regulatorio

**Estructura típica:**
- 1 entrada (evento regulatorio, campaña, solicitud)
- 1-2 gateways de elegibilidad
- 3-6 actividades de documentación y validación (recopilar, verificar, auditar)
- 1-2 gateways de conformidad
- 2-3 actividades de cierre (reporte, archivo, destrucción si aplica)
- 2-3 ends (conforme / no conforme / excepciones documentadas)

**Característica:** Alto énfasis en trazabilidad, documentos de entrada/salida, auditabilidad. Actividades pueden ser lentas (espera regulador, auditorías).

**KPI crítico:** % conformidad, tiempo para cierre, documentación completa.

#### Arquetipo 5: Proceso de Gestión de Incidentes / Excepciones

**Estructura típica:**
- 1 entrada (incidente reportado)
- 1-2 gateways de severidad / urgencia
- 3-4 actividades de diagnóstico
- 1-2 actividades de resolución (reparación, coordinación)
- Múltiples loops si no se resuelve a la 1ra
- 2-3 ends (resuelto / escalado a capital / cancelado)

**Característica:** Timeboxed. Múltiples retry loops. Requiere auditoría de tiempo.

**KPI crítico:** MTTR (Mean Time to Resolve), % escalada, % resuelto en SLA.

#### Arquetipo 6: Proceso de Análisis / Diagnóstico

**Estructura típica:**
- 1 entrada (solicitud de análisis)
- 2-3 actividades de recopilación de datos
- 2-3 actividades de análisis
- 1-2 gateways de decisión intermedia (¿hay suficiente data?, ¿patrón claro?)
- 1-2 actividades de síntesis / redacción
- 1 end (reporte entregado)

**Característica:** Más reflexivo. Menos decisiones binarias. Puede tener investigación extensiva.

**KPI crítico:** Tiempo de análisis, calidad de insights, adopción de recomendaciones.

#### Arquetipo 7: Proceso Colaborativo Cross-Área

**Estructura típica:**
- 1 entrada
- 3-5+ swimlanes (diferentes áreas)
- Múltiples sincronizaciones (gateways AND que esperan múltiples lanes)
- 2-3 loops de iteración ("Comentarios de B", regresa a A para ajuste)
- 1 actividad final de consolidación / aprobación
- 1 end (aprobado y comunicado)

**Característica:** Mucho paralelismo. Muchos puntos de sincronización. Riesgo de bloqueos.

**KPI crítico:** Duración total, % en paralelización, bottlenecks de sincronización.

#### Arquetipo 8: Proceso de Excepciones / Escalamiento

**Estructura típica:**
- 1 entrada (caso rechazado por proceso estándar)
- 1 actividad de evaluación de excepción
- 1 gateway ("¿Excepcional?")
- Si Sí: 1-2 actividades de revisión experta + gateway final
- Si No: retornar a proceso estándar
- 1-2 ends (excepción aprobada / denegada / retornado)

**Característica:** Actúa como "válvula" fuera del flujo normal. Raramente ejecutado, pero crítico cuando ocurre.

**KPI crítico:** % de excepciones, tiempo de decisión, trazabilidad.

---

**Cómo implementa ProcessIQ:**

- **Menú "Nuevo diagrama"** → Dropdown "Seleccionar template".
- Cada template pre-carga: 
  - Estructura de swimlanes sugerida
  - Actividades genéricas (usuario reemplaza)
  - Gateways pre-posicionados
  - 2-4 scenarios de ends
  - Metadata skeleton (duración, VA/BVA, etc.)
- Usuario puede aceptar o descartar elementos.

---

## PARTE IX: CO-CREACIÓN CON CLIENTE

### 19. Metodología de Taller de Levantamiento

**Duración estándar:** 2-4 horas para un proceso (no todo el value chain).

**Participantes:**
- 1-2 consultores de Minsait (facilitador + anotador/mapper)
- 3-5 personas de cliente (1 propietario de proceso, 2-3 ejecutantes/operadores, idealmente 1 "power user")

**Estructura de sesión:**

1. **Warm-up (10 min):** Contexto de engagement, scope del proceso, out-of-scope explícito.
2. **Educación rápida (5 min):** Mostrar una actividad BPMN, explicar qué es un gateway, por qué swimlanes.
3. **Caminata de happy path (20 min):** Facilitador pregunta: "Desde que llega una solicitud, ¿cuál es el primer paso?" Cliente describe. Mapper dibuja. Continuar hasta fin "normal".
4. **Identificación de decisiones (15 min):** "¿En qué puntos se toman decisiones?" Marcar con gateways.
5. **Identificación de excepciones (15 min):** "¿Qué puede ir mal?" Dibujar loops y caminos alternativos.
6. **Roles y responsabilidades (10 min):** Pintar swimlanes, asignar actividades a cada role.
7. **Validación cruzada (10 min):** Releer el diagrama. Cliente confirma: "¿Eso es lo que pasa?" (Trampa: verán si el cliente intenta "corregir" al proceso ideal vs. real).
8. **Metadata rápida (10 min):** Preguntar duración, volumen, sistemas, KPIs clave.
9. **Cierre y next steps (5 min):** "Esto lo vamos a validar con otros 2-3 personas y volvemos con version pulida".

**Regla de validación cruzada (3 fuentes):**

Nunca levantar proceso completo de 1 sola persona. Antes de dar por terminado:
- Entrevista 1: Owner del proceso (visión macro).
- Entrevista 2-3: 2 ejecutantes diferentes (detalle, variantes, excepciones).
- Idealmente: 1 observación de trabajo real (shadowing 2-4 horas si es crítico).

Mapeo: ¿hay divergencias? Marcar en diagrama como "Variante A", "Variante B", explorar si es edge case o desviación.

---

### 20. La Trampa del "Proceso Ideal"

**Problema clásico:** En taller, cliente describe cómo **debería ser** el proceso, no cómo **es**. Levantamos el to-be, cliente asume que es el as-is. Problemas después.

**Síntomas de trampa:**
- Cliente dice: "Deberíamos validar antes de registrar" (pero no lo hacen hoy).
- "El sistema automáticamente debería..." (pero hace 10 años que piden esa feature y no la tienen).
- Describe procedimiento de manual oficial, no lo que en la realidad hace el equipo.

**Cómo evitar:**

1. **Lenguaje de pregunta cerrada:** "¿Validas antes de registrar, o registras y validas después?" (fuerza respuesta binaria, menos espa cio para idealizar).
2. **Ejemplos concretos:** "Dame una solicitud que llegó ayer. Paso a paso, ¿qué pasó?" (narrativa fuerza realidad).
3. **Shadowing:** Ver trabajando 1 hora > 100 minutos de explicación.
4. **Pregunta trap:** "¿Este proceso alguna vez falla? ¿Qué hacen?" (cliente no idealizará excepciones).
5. **Graficación en vivo:** Dibujar mientras hablan. Si algo suena incompleto → "Espera, te oí decir A y después Z. ¿Qué pasa entre medio?"

**Cómo ProcessIQ ayuda:**
- Botón "Toggle as-is/to-be" que cambia color/notación (ej. fondo rojo = as-is, verde = to-be).
- Metadata "¿Existe hoy esta actividad? Sí/No" → fuerza decisión.
- Nota: Si detecta >30% de actividades marcadas "to-be", alert: "Muchas actividades futuras. ¿Estamos mapeando as-is o future state?"

---

### 21. Cuándo Cerrar el Levantamiento

**Criterio de parada:**

El levantamiento está listo para análisis cuando:

1. ✅ Happy path está claro y validado por 2+ ejecutantes.
2. ✅ Las 3-5 excepciones principales están identificadas (no todas, pero las altas frecuencia).
3. ✅ Todos los gateways tienen etiquetas y convergencia.
4. ✅ Todas las actividades tienen: nombre correcto, responsable, duración, volumen, sistema.
5. ✅ No hay huérfanos, ciclos infinitos, o líneas cruzadas (validador ProcessIQ = green).
6. ✅ Cliente has confirmado: "Sí, esto es lo que hacemos" (no "esto es lo que deberíamos hacer").
7. ✅ Hay 1-3 swimlanes máximo (si hay >5, considerar split en 2 procesos).

**Cuándo NO cerrar (señales de alerta):**

- ❌ "No sabemos cuánto tarda, va desde 5 min a 3 meses" → Necesita más detalle, hay casuística oculta.
- ❌ Cliente sigue diciendo "pero hay una variante que..." después de 3 entrevistas → Hay sub-procesos no descubiertos.
- ❌ Hay >8 gateways XOR sin convergencia clara → Diseño confuso, refactor antes de avanzar.
- ❌ Más del 50% de actividades son NVA (sin valor agregado) que no explican el "por qué" → Necesita contexto regulatorio o histó rico.

**Transición a análisis:**

Una vez cerrado:
- Exportar a PDF BPMN (base de datos).
- Crear 2da versión: **Diagrama de KPIs y Pains** (cada actividad anotada con pain points).
- Reunión de cierre con cliente: "Estos son los 3 procesos críticos que impactarían más en la operación. Propongo que profundicemos en análisis/diseño de soluciones en estos."

---

## PARTE X: ANTI-PATRONES CONSULTIVOS FRECUENTES

### 22. Errores Comunes en Engagements de Levantamiento

Estos no son bugs de software, pero son errores de ejecución que ProcessIQ puede ayudar a prevenir con arquitectura y UX.

#### Anti-patrón 1: Levantar todo a fondo cuando lo único que importa son 3 procesos

**Síntoma:** Consultor mapea 27 procesos de la empresa. Cliente abrumado. Análisis diluido.

**Prevención:**
- ProcessIQ: Botón "Scope Definition" antes de crear diagrama → User selecciona "¿Cuántos procesos?" (recomendación: 2-4).
- Consultor must document: "Estos 4 procesos representan el 78% del trabajo / costo / quejas."
- Exportar "Universe of Processes" (lista de todos, mapa de calor) vs. "Deep Dive" (3-4 detallados).

#### Anti-patrón 2: Usar BPMN puro cuando cliente no sabe leerlo

**Síntoma:** Diagrama es estándar BPMN. Cliente ve rombos, rectángulos y dice "yo no entiendo esto."

**Prevención:**
- ProcessIQ: Ofrecer **2 modos de export:**
  - Modo "Estándar BPMN" (para auditoría, IT, consultores).
  - Modo "Simplificado" (rectángulos sin tipos, gateways como rombo pero con pregunta clara en español, sin sub-procesos colapsados).
- Default export para cliente = Simplificado + notas.

#### Anti-patrón 3: Confundir as-is y to-be en el mismo lienzo

**Síntoma:** Cliente abre documento y no sabe si es "cómo somos" o "cómo deberíamos ser". Confusión en decisiones.

**Prevención:**
- ProcessIQ: **Prohibir mapeos mixtos.** Crear dos archivos separados (archivo_as_is.bpmn vs. archivo_to_be.bpmn).
- Metadata: Toda actividad tiene campo "Estado: AS-IS / TO-BE / PARCIAL".
- Export: Si detecta >5% de actividades PARCIAL o TO-BE → bloquea export as-is, fuerza selección clara.

#### Anti-patrón 4: Pintar happy path sin excepciones

**Síntoma:** Diagrama es bonito, lineal, sin gateways. Cliente vea algo que no resiste realidad. Perece falta de rigor.

**Prevención:**
- ProcessIQ: Validador → si >5 actividades sin gateway / decisión intermedia → warning "¿Dónde están las excepciones?"
- Checklist pre-export: "¿He identificado las 3-5 excepciones principales?" (sí/no).
- Template sugerida: Para cada gateway XOR, pregunta "¿Cuál es la rama de error/excepción?"

#### Anti-patrón 5: Mapping sin metadata (duración, volumen, sistema)

**Síntoma:** Diagrama "bonito" pero sin sustancia. Imposible cuantificar impacto.

**Prevención:**
- ProcessIQ: No permite export a cliente sin completar metadata obligatoria (ver sección 11).
- Progressive disclosure: Permitir export draft sin metadata (para revisión interna), pero export formal → todo completo.

#### Anti-patrón 6: Olvidar clientes/actores externos

**Síntoma:** Proceso muestra solo el "banco" (interno). Cliente externo (solicitante) es invisible. Diagrama no refleja experiencia de cliente.

**Prevención:**
- ProcessIQ: Validador → si no hay lane "Cliente" en proceso de cara al cliente (servicio, solicitud, venta) → warning obligatoria.
- Template: Pre-crear lane "Cliente" / "Solicitante" en procesos de tipo "O2C", "P2C", etc.

---

## PARTE XI: CHECKLIST DE CALIDAD PRE-ENTREGA AL CLIENTE

**Instrucciones:** Antes de exportar diagrama para cliente final, ejecutar este checklist. Todo debe ser ✅.

### Checklist de Validación

#### Sección A: NOMENCLATURA Y LENGUAJE (8 ítems)

- [ ] **A1.** Toda actividad tiene nombre: Verbo en infinitivo + sustantivo específico (no verbos prohibidos: gestionar, procesar, ser, estar, tener).
- [ ] **A2.** Todas actividades tienen ≤50 caracteres y ≤8 palabras.
- [ ] **A3.** Todo gateway tiene nombre como pregunta cerrada ("¿...?"). No afirmaciones.
- [ ] **A4.** Gateway múltiple (>2 salidas): todas salidas tienen etiqueta, y son mutuamente excluyentes.
- [ ] **A5.** Start event tiene nombre claro (disparador o condición).
- [ ] **A6.** End events son >1 (múltiples outcomes) Y tienen nombres distintos (no "Fin del proceso").
- [ ] **A7.** Todas las etiquetas de flechas en gateways son presentes y correctas (sin duplicación).
- [ ] **A8.** No hay abreviaturas no estándar en nombres de actividades.

#### Sección B: GRANULARIDAD Y DESCOMPOSICIÓN (5 ítems)

- [ ] **B1.** Proceso visible tiene 3-15 actividades. Si >15, hay subprocesos que agrupan. Si <3, es demasiado simplista.
- [ ] **B2.** Cada actividad tiene duración estimada ≤120 minutos (si >2h, descomponer).
- [ ] **B3.** Cada actividad tiene 1 responsable primario (rol claro).
- [ ] **B4.** No hay actividades que sean "AND" de múltiples acciones (ej. "Recibir y registrar y validar"). Cada uno es un paso.
- [ ] **B5.** Si hay subproceso (collapsed), contiene ≥3 actividades internas (no subprocesos triviales).

#### Sección C: LAYOUT Y VISUALIZACIÓN (6 ítems)

- [ ] **C1.** Flujo principal va de arriba a abajo (top-to-bottom) o, si hay paralelismo, izquierda-derecha (izquierdo coherente).
- [ ] **C2.** CERO líneas cruzadas en diagrama. Si hay cruces, mostrados como off-page connectors o refactorizados.
- [ ] **C3.** Nodos están alineados a grid invisible (alineación visual consistente).
- [ ] **C4.** Espaciado entre nodos es consistente (mínimo 60 px vertical, 40 px horizontal).
- [ ] **C5.** Tamaño de nodos es estándar por tipo (actividades: ~100x50, gateways: ~40x40, eventos: ~35x35).
- [ ] **C6.** Las flechas usan puntos de anclaje consistentes (salida siempre de borde derecho, entrada de borde izquierdo, o arriba/abajo en vertical).

#### Sección D: SWIMLANES Y RESPONSABILIDAD (4 ítems)

- [ ] **D1.** Si >1 responsable distinto, hay swimlanes (lanes horizontales apiladas verticalmente).
- [ ] **D2.** Si es proceso de cara a cliente (solicitud, venta, servicio), hay lane "Cliente" o "Solicitante" separada.
- [ ] **D3.** Lanes están nombradas con rol/área claro (no "Juan", "Persona 1").
- [ ] **D4.** Lanes no están vacías. Si una lane no tiene actividades, se elimina.

#### Sección E: TIPOS DE EJECUCIÓN (2 ítems)

- [ ] **E1.** Toda actividad tiene Tipo de Ejecución asignado (Manual, Soportado, Automático, IA, Email, Teléfono, Documental, RPA).
- [ ] **E2.** Tipo de ejecución es coherente con metadata (si es Automático, no debería tener duración >1 min ni responsable humano).

#### Sección F: METADATA OBLIGATORIA (6 ítems)

- [ ] **F1.** Toda actividad tiene Responsable (rol) asignado.
- [ ] **F2.** Toda actividad tiene Duración promedio estimada (en min/hora o N/A si N/A aplica).
- [ ] **F3.** Toda actividad tiene Volumen/Frecuencia (transacciones/mes o N/A).
- [ ] **F4.** Toda actividad tiene clasificación VA / BVA / NVA (Value-Add, Business Value-Add, Non-Value-Add).
- [ ] **F5.** Proceso tiene ≥1 KPI o SLA definido (si es proceso de cara a cliente, es obligatorio).
- [ ] **F6.** Si actividad usa sistema, hay Sistema soporte indicado.

#### Sección G: LÓGICA Y GATEWAYS (4 ítems)

- [ ] **G1.** Toda decisión (gateway XOR) tiene convergencia explícita antes del fin del proceso (a menos que sea el último nodo).
- [ ] **G2.** No hay gateways anidados sin convergencia (patrón "[ ¿A? [ ¿B? ... ] ]" debe tener estructura clara).
- [ ] **G3.** No hay ciclos infinitos (loops sin salida posible). Si hay loop, debe tener gateway de salida.
- [ ] **G4.** Máximo 4-5 salidas por gateway (si >5, descomponer).

#### Sección H: EXCEPCIONES Y VARIANTES (3 ítems)

- [ ] **H1.** El happy path (camino "Sí" en decisiones principales) está claramente identificable.
- [ ] **H2.** Las 3-5 excepciones principales están dibujadas (rechazos, excepciones, escalaraciones, loops).
- [ ] **H3.** Si hay variantes del proceso (Variante A para Gold, Variante B para Silver), están documentadas (en metadata o diagrama separado).

#### Sección I: CALIDAD DE DATOS (5 ítems)

- [ ] **I1.** No hay actividades huérfanas (sin entrada o sin salida, excepto start/end).
- [ ] **I2.** No hay nodos desconectados (aislados en el canvas).
- [ ] **I3.** Todas las flechas tienen origen y destino válido (no "flechas rotas").
- [ ] **I4.** Nombres sin tildes incorrectas, mayúsculas coherentes, puntuación consistente.
- [ ] **I5.** Si hay sub-procesos, están todos expandibles en metadata o archivo asociado (no "black boxes" inexplicables).

#### Sección J: AUDIENCIA Y COMPRENSIBILIDAD (4 ítems)

- [ ] **J1.** Un usuario que no conoce el proceso, en 5 minutos de lectura, entiende el flujo principal.
- [ ] **J2.** Cliente ha confirmado en validación cruzada: "Sí, esto es lo que hacemos hoy" (no "lo que deberíamos hacer").
- [ ] **J3.** No hay símbolos o notaciones BPMN avanzadas (Message Flow, Data Objects) sin explicar en leyenda.
- [ ] **J4.** Diagrama tiene leyenda si usa colores, iconos, o convenciones no estándar.

#### Sección K: VALIDACIÓN TÉCNICA (ProcessIQ) (3 ítems)

- [ ] **K1.** ProcessIQ validator muestra ✅ verde (sin 🔴 críticos ni 🟠 altos no resueltos).
- [ ] **K2.** Export PDF genera sin errores y es legible (prueba: exportar, abrir, confirmar lectura).
- [ ] **K3.** Archivo BPMN es standard-compliant (puede abrirse en herramientas estándar sin errores).

#### Sección L: COMPLETITUD Y SCOPE (3 ítems)

- [ ] **L1.** Alcance del proceso está definido: "Desde que [evento start] hasta que [evento end]".
- [ ] **L2.** Out-of-scope explícito: "No mapeamos [X proceso relacionado]".
- [ ] **L3.** Validación cruzada completada: ≥2 entrevistas + idealmente 1 observación (shadowing).

#### Sección M: DOCUMENTACIÓN Y ENTREGA (2 ítems)

- [ ] **M1.** Diagrama tiene título claro, fecha de última actualización, versión (v1.0).
- [ ] **M2.** Si hay archivo Word/PDF asociado con detalles, está sincronizado con diagrama BPMN (sin discrepancias).

---

## IMPLEMENTACIÓN EN PROCESSIQ

### Matriz de Validaciones Automáticas vs. Manuales

ProcessIQ debe implementar estas validaciones en orden de prioridad:

| Validación | Tipo | Prioridad | Bloquea export | Implementation |
|-----------|------|-----------|----------------|----------------|
| Naming actividades (verbo+objeto) | Auto | 🔴 P0 | Sí (warn) | Regex + diccionario |
| Actividades >50 chars | Auto | 🔴 P0 | No (warn) | String length |
| Gateway sin etiqueta (múltiple) | Auto | 🔴 P0 | Sí | Detect outgoing edges |
| Actividades huérfanas | Auto | 🔴 P0 | Sí | Detect isolated nodes |
| Ciclos infinitos | Auto | 🔴 P0 | Sí | Graph algorithm |
| Líneas cruzadas | Auto | 🟠 P1 | No (warn) | Intersection detection |
| Actividad sin responsable | Auto | 🟠 P1 | Sí (prompt) | Metadata check |
| Actividad sin duración | Auto | 🟠 P1 | Sí (prompt) | Metadata check |
| Gateway sin convergencia | Auto | 🟠 P1 | No (warn) | Graph path analysis |
| Lane vacía | Auto | 🟡 P2 | No (warn) | Detect orphan lanes |
| Verbo prohibido | Auto | 🟡 P2 | No (warn) | Dictionary check |
| >8 palabras en nombre | Auto | 🟡 P2 | No (warn) | Word count |
| Multiipo XOR anidados | Auto | 🟡 P2 | No (warn) | Pattern recognition |
| Proceso <3 actividades | Auto | 🟡 P2 | No (warn) | Activity count |
| Proceso >15 actividades | Auto | 🟡 P2 | No (info) | Suggest subprocess |
| Metadata completitud | Auto | 🟡 P2 | Conditional | Checklist validator |
| Validación cliente (as-is) | Manual | 🔴 P0 | No | Checklist, signed |
| Validación cruzada (3 fuentes) | Manual | 🔴 P0 | No | Task list |

---

## EPÍLOGO: USO DIARIO

Este playbook es **living document**. Cada engagement genera insights nuevos. Cada trimestre:

1. Revisitar anti-patrones encontrados en campo.
2. Actualizar catálogos de verbos, tipos de ejecución, si lo justifican datos reales.
3. Comunicar cambios a equipo (1 pager).
4. Versionar playbook (v1.0 → v1.1 → ...).

**Dueño:** Partner de Operaciones. **Evangelista:** Líder técnico de ProcessIQ.

El objetivo final: que un **junior de Minsait**, 15 días en la firma, pueda mapear un proceso transaccional crítico a estándar MBB sin que le revise cada diagrama un senior. La herramienta enseña. Las reglas son claras. El cliente ve calidad desde el primer taller.

---

**FIN DEL PLAYBOOK**