// ProcessIQ — Librería de KPIs por industria y macroproceso
// Referencias: APQC PCF, prácticas Minsait Business Consulting, benchmarks sectoriales.

window.KPI_LIBRARY = [
  // ====================== BANCA ======================
  { id: 'bnk-01', industry: 'Banca', macroprocess: 'O2C', name: 'Tasa de aprobación de créditos', unit: '%', benchmark: '65-75%', description: 'Créditos aprobados sobre total solicitudes evaluadas.' },
  { id: 'bnk-02', industry: 'Banca', macroprocess: 'O2C', name: 'Time-to-Yes', unit: 'horas', benchmark: '< 24h banca minorista', description: 'Tiempo entre solicitud y decisión crediticia.' },
  { id: 'bnk-03', industry: 'Banca', macroprocess: 'Servicio', name: 'First Contact Resolution (FCR)', unit: '%', benchmark: '> 75%', description: 'Reclamos resueltos en el primer contacto.' },
  { id: 'bnk-04', industry: 'Banca', macroprocess: 'Servicio', name: 'Tiempo Medio de Operación (TMO)', unit: 'segundos', benchmark: '180-240s', description: 'Duración promedio de atención.' },
  { id: 'bnk-05', industry: 'Banca', macroprocess: 'Riesgos', name: 'Tasa de mora > 30 días', unit: '%', benchmark: '< 3% minorista', description: 'Cartera vencida sobre cartera total.' },
  { id: 'bnk-06', industry: 'Banca', macroprocess: 'KYC', name: 'Tiempo de onboarding cliente', unit: 'minutos', benchmark: '< 15 min digital', description: 'Tiempo total de alta de nuevo cliente.' },
  { id: 'bnk-07', industry: 'Banca', macroprocess: 'KYC', name: '% reclamos a Indecopi resueltos a favor', unit: '%', benchmark: '< 20%', description: 'Reclamos donde la entidad pierde, sobre total.' },

  // ====================== RETAIL ======================
  { id: 'ret-01', industry: 'Retail', macroprocess: 'O2C', name: 'Order Fill Rate', unit: '%', benchmark: '> 95%', description: 'Pedidos entregados completos sobre total.' },
  { id: 'ret-02', industry: 'Retail', macroprocess: 'O2C', name: 'Perfect Order Rate', unit: '%', benchmark: '> 90%', description: 'Pedidos entregados a tiempo, completos y sin daños.' },
  { id: 'ret-03', industry: 'Retail', macroprocess: 'Inventario', name: 'Rotación de inventario', unit: 'veces/año', benchmark: '8-12x retail moda', description: 'Costo de ventas / inventario promedio.' },
  { id: 'ret-04', industry: 'Retail', macroprocess: 'Inventario', name: 'Stock-out rate', unit: '%', benchmark: '< 5%', description: 'SKUs sin stock sobre total de SKUs activos.' },
  { id: 'ret-05', industry: 'Retail', macroprocess: 'Tienda', name: 'Conversión de tienda', unit: '%', benchmark: '15-25%', description: 'Tickets emitidos / visitantes.' },
  { id: 'ret-06', industry: 'Retail', macroprocess: 'Tienda', name: 'Ticket promedio', unit: 'PEN', benchmark: 'sectorial', description: 'Venta total / número de tickets.' },
  { id: 'ret-07', industry: 'Retail', macroprocess: 'Devoluciones', name: 'Tasa de devolución', unit: '%', benchmark: '< 8% retail físico', description: 'Devoluciones sobre ventas brutas.' },

  // ====================== MANUFACTURA ======================
  { id: 'mfg-01', industry: 'Manufactura', macroprocess: 'Producción', name: 'OEE (Overall Equipment Effectiveness)', unit: '%', benchmark: '> 75% world class 85%', description: 'Disponibilidad × Rendimiento × Calidad.' },
  { id: 'mfg-02', industry: 'Manufactura', macroprocess: 'Producción', name: 'Throughput', unit: 'unid/hora', benchmark: 'sectorial', description: 'Unidades producidas por unidad de tiempo.' },
  { id: 'mfg-03', industry: 'Manufactura', macroprocess: 'Calidad', name: 'First Pass Yield', unit: '%', benchmark: '> 95%', description: 'Unidades correctas en primera pasada.' },
  { id: 'mfg-04', industry: 'Manufactura', macroprocess: 'Calidad', name: 'Tasa de defectos (PPM)', unit: 'ppm', benchmark: '< 500 ppm', description: 'Partes defectuosas por millón.' },
  { id: 'mfg-05', industry: 'Manufactura', macroprocess: 'Mantenimiento', name: 'MTBF', unit: 'horas', benchmark: 'sectorial', description: 'Mean Time Between Failures.' },
  { id: 'mfg-06', industry: 'Manufactura', macroprocess: 'Mantenimiento', name: 'MTTR', unit: 'horas', benchmark: '< 2h crítico', description: 'Mean Time To Repair.' },
  { id: 'mfg-07', industry: 'Manufactura', macroprocess: 'Supply Chain', name: 'Lead time de aprovisionamiento', unit: 'días', benchmark: 'sectorial', description: 'Tiempo desde orden hasta recepción.' },

  // ====================== SALUD ======================
  { id: 'hlt-01', industry: 'Salud', macroprocess: 'Atención', name: 'Tiempo de espera en emergencia', unit: 'minutos', benchmark: '< 30 min triaje', description: 'Tiempo entre llegada y primer contacto médico.' },
  { id: 'hlt-02', industry: 'Salud', macroprocess: 'Atención', name: 'Tasa de reingreso a 30 días', unit: '%', benchmark: '< 10%', description: 'Pacientes que reingresan dentro de 30 días.' },
  { id: 'hlt-03', industry: 'Salud', macroprocess: 'Hospitalización', name: 'Estancia media', unit: 'días', benchmark: 'según diagnóstico', description: 'Días promedio de hospitalización.' },
  { id: 'hlt-04', industry: 'Salud', macroprocess: 'Hospitalización', name: 'Tasa de ocupación de camas', unit: '%', benchmark: '75-85%', description: 'Camas ocupadas / camas disponibles.' },
  { id: 'hlt-05', industry: 'Salud', macroprocess: 'Facturación', name: 'Tasa de rechazo de facturación', unit: '%', benchmark: '< 5%', description: 'Cuentas rechazadas por aseguradora.' },

  // ====================== UTILITIES ======================
  { id: 'utl-01', industry: 'Utilities', macroprocess: 'Operaciones', name: 'SAIDI', unit: 'minutos/cliente/año', benchmark: '< 200 min', description: 'System Average Interruption Duration Index.' },
  { id: 'utl-02', industry: 'Utilities', macroprocess: 'Operaciones', name: 'SAIFI', unit: 'interrup/cliente/año', benchmark: '< 4', description: 'System Average Interruption Frequency Index.' },
  { id: 'utl-03', industry: 'Utilities', macroprocess: 'Comercial', name: 'Tasa de cobranza', unit: '%', benchmark: '> 96%', description: 'Monto recaudado / monto facturado.' },
  { id: 'utl-04', industry: 'Utilities', macroprocess: 'Comercial', name: 'Pérdidas no técnicas', unit: '%', benchmark: '< 8%', description: 'Energía perdida por hurto / facturación.' },
  { id: 'utl-05', industry: 'Utilities', macroprocess: 'Atención', name: 'Tiempo de conexión nuevo suministro', unit: 'días', benchmark: '< 7 días', description: 'Desde solicitud hasta energización.' },

  // ====================== SEGUROS ======================
  { id: 'seg-01', industry: 'Seguros', macroprocess: 'Siniestros', name: 'Ratio de siniestralidad (Loss Ratio)', unit: '%', benchmark: '55–70% según ramo', description: 'Siniestros incurridos / primas devengadas.' },
  { id: 'seg-02', industry: 'Seguros', macroprocess: 'Siniestros', name: 'Tasa de siniestros fraudulentos detectados', unit: '%', benchmark: '3–10% de los avisos', description: 'Siniestros marcados como sospechosos / total avisos.' },
  { id: 'seg-03', industry: 'Seguros', macroprocess: 'Siniestros', name: 'Lead time de siniestro', unit: 'días', benchmark: '< 7 días (P50 mercado)', description: 'Desde aviso hasta liquidación/pago.' },
  { id: 'seg-04', industry: 'Seguros', macroprocess: 'Siniestros', name: 'Tasa de reapertura de siniestros', unit: '%', benchmark: '< 5%', description: 'Siniestros reabiertos tras cierre / total cerrados.' },
  { id: 'seg-05', industry: 'Seguros', macroprocess: 'Suscripción', name: 'Tiempo de emisión de póliza', unit: 'horas', benchmark: '< 24 h', description: 'Desde solicitud hasta emisión.' },
  { id: 'seg-06', industry: 'Seguros', macroprocess: 'Suscripción', name: 'Ratio combinado', unit: '%', benchmark: '< 100%', description: '(Siniestros + gastos) / primas devengadas — rentabilidad técnica.' },

  // ====================== TELECOMUNICACIONES ======================
  { id: 'tel-01', industry: 'Telecomunicaciones', macroprocess: 'Servicio', name: 'MTTR (tiempo medio de reparación)', unit: 'horas', benchmark: '< 8 h (masiva < 4 h)', description: 'Desde apertura del ticket hasta restablecimiento del servicio.' },
  { id: 'tel-02', industry: 'Telecomunicaciones', macroprocess: 'Servicio', name: 'FCR — First Call Resolution', unit: '%', benchmark: '> 70%', description: 'Averías resueltas en el primer contacto (L1) sin escalamiento.' },
  { id: 'tel-03', industry: 'Telecomunicaciones', macroprocess: 'Servicio', name: 'Cumplimiento de SLA de avería', unit: '%', benchmark: '> 95%', description: 'Tickets resueltos dentro del plazo comprometido.' },
  { id: 'tel-04', industry: 'Telecomunicaciones', macroprocess: 'Comercial', name: 'Churn rate', unit: '%', benchmark: '< 2% mensual', description: 'Tasa de baja de clientes sobre la base activa.' },
  { id: 'tel-05', industry: 'Telecomunicaciones', macroprocess: 'Servicio', name: 'Tiempo de activación de servicio', unit: 'días', benchmark: '< 5 días', description: 'Desde la contratación hasta el alta operativa.' },

  // ====================== TRANSVERSAL (procesos cross-funcionales) ======================
  { id: 'tx-p2p-01', industry: 'Transversal', macroprocess: 'P2P', name: 'Cycle time P2P (req → pago)', unit: 'días', benchmark: '< 10 días (best-in-class)', description: 'Desde la requisición hasta el pago al proveedor.' },
  { id: 'tx-p2p-02', industry: 'Transversal', macroprocess: 'P2P', name: 'Tasa de 3-way match automático', unit: '%', benchmark: '> 85%', description: 'Facturas que casan OC/recepción/factura sin intervención manual.' },
  { id: 'tx-p2p-03', industry: 'Transversal', macroprocess: 'P2P', name: 'Costo por orden de compra', unit: 'USD/OC', benchmark: '< 15 USD', description: 'Costo administrativo de procesar una OC.' },
  { id: 'tx-o2c-01', industry: 'Transversal', macroprocess: 'O2C', name: 'DSO (Days Sales Outstanding)', unit: 'días', benchmark: '< 45 días', description: 'Días promedio de cobro de cuentas por cobrar.' },
  { id: 'tx-h2r-01', industry: 'Transversal', macroprocess: 'H2R', name: 'Time-to-hire', unit: 'días', benchmark: '< 30 días', description: 'Desde la requisición de personal hasta la contratación.' },

  // ====================== SECTOR PÚBLICO ======================
  { id: 'gov-01', industry: 'Sector Público', macroprocess: 'Trámites', name: 'Tiempo medio de resolución de trámite', unit: 'días hábiles', benchmark: 'según TUPA', description: 'Días desde ingreso hasta resolución.' },
  { id: 'gov-02', industry: 'Sector Público', macroprocess: 'Trámites', name: 'Tasa de digitalización de trámites', unit: '%', benchmark: '> 60% objetivo SGD', description: '% trámites disponibles 100% digital.' },
  { id: 'gov-03', industry: 'Sector Público', macroprocess: 'Atención', name: 'Tiempo medio de atención en MAC', unit: 'minutos', benchmark: '< 15 min', description: 'Atención presencial en Mejor Atención al Ciudadano.' },
  { id: 'gov-04', industry: 'Sector Público', macroprocess: 'Presupuesto', name: 'Ejecución presupuestal', unit: '%', benchmark: '> 90%', description: 'PIM ejecutado al cierre del año.' },
  { id: 'gov-05', industry: 'Sector Público', macroprocess: 'Transparencia', name: 'Tiempo respuesta solicitudes LTAIP', unit: 'días hábiles', benchmark: '≤ 10 días', description: 'Cumplimiento Ley de Transparencia.' },

  // ====================== PERÚ REGULATORIO ======================
  { id: 'per-sbs-01', industry: 'Banca', macroprocess: 'Riesgos', name: 'Ratio de morosidad (SBS)', unit: '%', benchmark: '< 4% sistema PE', description: 'Cartera atrasada / cartera total — reporte SBS mensual.' },
  { id: 'per-sbs-02', industry: 'Banca', macroprocess: 'Riesgos', name: 'Ratio de capital global (SBS)', unit: '%', benchmark: '> 10% (mínimo legal 8%)', description: 'Patrimonio efectivo / activos ponderados por riesgo. Reglamento SBS.' },
  { id: 'per-sbs-03', industry: 'Banca', macroprocess: 'Riesgos', name: 'Cobertura de cartera atrasada (SBS)', unit: '%', benchmark: '> 130%', description: 'Provisiones / cartera atrasada.' },
  { id: 'per-sbs-04', industry: 'Banca', macroprocess: 'Riesgos', name: 'IRR — Índice de Riesgo de Reclamos', unit: 'puntos', benchmark: 'según ranking SBS', description: 'Indicador trimestral SBS sobre conducta de mercado.' },
  { id: 'per-ind-01', industry: 'Banca', macroprocess: 'Servicio', name: 'Tiempo de respuesta reclamo (Cód. Protec. Consumidor)', unit: 'días hábiles', benchmark: '≤ 30 días', description: 'Plazo regulatorio Indecopi para responder reclamos formales.' },
  { id: 'per-ind-02', industry: 'Retail', macroprocess: 'Devoluciones', name: 'Reclamos Libro de Reclamaciones', unit: '%', benchmark: '< 2% de tickets', description: 'Reclamos formales sobre ventas; obligatorio publicar en local.' },
  { id: 'per-ind-03', industry: 'Transversal', macroprocess: 'Servicio', name: 'Pronunciamientos a favor del consumidor (Indecopi)', unit: '%', benchmark: '< 30%', description: 'Indicador de calidad de atención formal.' },
  { id: 'per-osi-01', industry: 'Utilities', macroprocess: 'Operaciones', name: 'Calidad técnica del producto (NTCSE)', unit: 'puntos', benchmark: 'cumplimiento total', description: 'Norma Técnica de Calidad de los Servicios Eléctricos — OSINERGMIN.' },
  { id: 'per-osi-02', industry: 'Utilities', macroprocess: 'Operaciones', name: 'Compensaciones por interrupciones', unit: 'PEN/cliente', benchmark: 'minimizar', description: 'Pago obligatorio por incumplimiento NTCSE.' },
  { id: 'per-sun-01', industry: 'Transversal', macroprocess: 'Tributario', name: 'Tiempo devolución IGV (SUNAT)', unit: 'días hábiles', benchmark: '≤ 45 días saldo a favor', description: 'Plazo SUNAT para devolución de saldos a favor del exportador.' },
  { id: 'per-sun-02', industry: 'Transversal', macroprocess: 'Tributario', name: 'Notificaciones electrónicas atendidas en plazo', unit: '%', benchmark: '100%', description: 'Cumplimiento de Buzón Electrónico SUNAT (3 días para acuses).' },
  { id: 'per-mtc-01', industry: 'Sector Público', macroprocess: 'Trámites', name: 'Silencio administrativo positivo', unit: '%', benchmark: '0% (no debe activarse)', description: 'Casos donde el plazo TUPA vencido activa aprobación automática — indicador inverso de eficiencia.' },
  { id: 'per-mtc-02', industry: 'Sector Público', macroprocess: 'Trámites', name: 'Trámites en Plataforma GOB.PE', unit: '%', benchmark: '> 80% objetivo PNSGD', description: 'Cumplimiento Plan Nacional de Servicios Digitales.' },

  // ====================== TRANSVERSAL (todas las industrias) ======================
  { id: 'trv-01', industry: 'Transversal', macroprocess: 'P2P', name: 'Cycle time P2P', unit: 'días', benchmark: '< 10 días', description: 'Desde requisición hasta pago.' },
  { id: 'trv-02', industry: 'Transversal', macroprocess: 'P2P', name: '% facturas con discrepancia', unit: '%', benchmark: '< 5%', description: 'Facturas que requieren ajuste manual.' },
  { id: 'trv-03', industry: 'Transversal', macroprocess: 'R2R', name: 'Tiempo de cierre contable mensual', unit: 'días hábiles', benchmark: '< 5 días', description: 'Días desde fin de mes hasta libros cerrados.' },
  { id: 'trv-04', industry: 'Transversal', macroprocess: 'H2R', name: 'Time-to-hire', unit: 'días', benchmark: '< 30 días', description: 'Desde requisición hasta contratación efectiva.' },
  { id: 'trv-05', industry: 'Transversal', macroprocess: 'H2R', name: 'Rotación voluntaria anual', unit: '%', benchmark: '< 15%', description: 'Renuncias / dotación promedio.' },
  { id: 'trv-06', industry: 'Transversal', macroprocess: 'TI', name: 'Mean Time To Resolve incidentes', unit: 'horas', benchmark: '< 4h P1', description: 'Tiempo medio de resolución por severidad.' }
];

// Catálogo de categorías de pain points
window.PAIN_CATEGORIES = [
  { id: 'handoff',    label: 'Handoff / Traspaso',    color: '#E63946', icon: '🔄' },
  { id: 'rework',     label: 'Reproceso',             color: '#F77F00', icon: '↩️' },
  { id: 'wait',       label: 'Espera / Cuello',       color: '#FCBF49', icon: '⏳' },
  { id: 'control',    label: 'Control duplicado',     color: '#9C6644', icon: '🛡️' },
  { id: 'system',     label: 'Sistema / Tecnología',  color: '#577590', icon: '💻' },
  { id: 'regulatory', label: 'Regulatorio / Compliance', color: '#4D908E', icon: '⚖️' },
  { id: 'manual',     label: 'Actividad manual',      color: '#90BE6D', icon: '✋' },
  { id: 'data',       label: 'Calidad de datos',      color: '#6A4C93', icon: '📊' }
];

// Industrias disponibles
window.INDUSTRIES = ['Banca', 'Seguros', 'Retail', 'Manufactura', 'Salud', 'Utilities', 'Telecomunicaciones', 'Sector Público', 'Transversal'];

// =========================================================
// EXECUTION TYPES — playbook MBB §10 (catálogo normativo)
// Icono en esquina superior derecha del nodo + tinte de fondo.
// =========================================================
// Cada tipo mapea a un tipo de tarea BPMN 2.0 con su marcador (esquina sup-izq),
// prefijo de código de actividad (estilo MBC: [USR-27]) y color de tinte normativo.
// 'marker' = path BPMN de línea en viewBox 16x16. 'bpmn' = nombre del tipo BPMN.
window.EXECUTION_TYPES = [
  { id: 'manual',    label: 'Manual',              bpmn: 'Manual Task',   codePrefix: 'MAN', color: '#6B7280', tint: '#F9FAFB', stroke: '#9CA3AF',
    desc: 'Humano sin sistema. Trabajo físico/mental puro.',
    marker: 'M4 9.5c0-.6.5-1 1-1h.5V6.5c0-.5.4-1 1-1s1 .5 1 1v1.8M8.5 8.3V5.5c0-.5.4-1 1-1s1 .5 1 1v2.8M10.5 8.3V6c0-.5.4-1 1-1s1 .5 1 1v3.5c0 2-1.4 3.5-3.5 3.5h-1c-1 0-1.8-.4-2.4-1.2L4 10.6c-.3-.5-.2-1 .3-1.2.4-.2.9-.1 1.2.3l1 1.1',
    glyph: 'M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4Zm-7 20a7 7 0 0 1 14 0' },
  { id: 'system',    label: 'User Task (sistema)', bpmn: 'User Task',     codePrefix: 'USR', color: '#1E5BAA', tint: '#E8F1FB', stroke: '#1E5BAA',
    desc: 'Humano + sistema (workflow). Humano ejecuta asistido por app.',
    marker: 'M8 4.2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4ZM3.5 13.5c0-2.2 2-3.6 4.5-3.6s4.5 1.4 4.5 3.6',
    glyph: 'M3 5h18v11H3z M8 21h8 M12 16v5' },
  { id: 'automatic', label: 'Service Task (auto)', bpmn: 'Service Task',  codePrefix: 'SRV', color: '#1E7E34', tint: '#E8F5E9', stroke: '#1E7E34',
    desc: 'Sin intervención humana. Batch, trigger, integración.',
    marker: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM8 2.8v1.4M8 11.8v1.4M3.9 4.4l1 1M11.1 10.6l1 1M2.5 8h1.4M12.1 8h1.4M3.9 11.6l1-1M11.1 5.4l1-1',
    glyph: 'M12 2v3 M12 19v3 M4.2 4.2l2.1 2.1 M17.7 17.7l2.1 2.1 M2 12h3 M19 12h3 M4.2 19.8l2.1-2.1 M17.7 6.3l2.1-2.1 M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z' },
  { id: 'ai',        label: 'Script/IA Task',      bpmn: 'Script Task',   codePrefix: 'IA',  color: '#6D28D9', tint: '#F3E8FF', stroke: '#6D28D9',
    desc: 'Asistido por ML/LLM. Copilots, agentes, scoring.',
    marker: 'M5 3.5h6l1.5 1.5v8H5zM7 6.5h4M7 8.5h4M7 10.5h2.5',
    glyph: 'M9 3h6l1 2h3v14H5V5h3l1-2Z M9 11h6 M9 14h4' },
  { id: 'email',     label: 'Receive Task (correo)', bpmn: 'Receive Task', codePrefix: 'RCV', color: '#B45309', tint: '#FEF7E0', stroke: '#B45309',
    desc: 'Espera/recibe mensaje (correo, formulario entrante).',
    marker: 'M3.5 4.5h9v7h-9zM3.5 4.5l4.5 3.7 4.5-3.7',
    glyph: 'M3 6h18v12H3z M3 6l9 7 9-7' },
  { id: 'send',      label: 'Send Task (enviar)',  bpmn: 'Send Task',     codePrefix: 'SND', color: '#92600A', tint: '#FEF7E0', stroke: '#92600A',
    desc: 'Envía mensaje a participante externo (sobre relleno).',
    marker: 'M3.5 4.5h9v7h-9zM3.5 4.5l4.5 3.7 4.5-3.7Z', filled: true,
    glyph: 'M3 6h18v12H3z M3 6l9 7 9-7' },
  { id: 'phone',     label: 'Vía teléfono',        bpmn: 'Receive Task',  codePrefix: 'TEL', color: '#B91C1C', tint: '#FEF0F0', stroke: '#B91C1C',
    desc: 'Comunicación sincrónica por voz, call center.',
    marker: 'M4 3.5h2.2l1 2.8-1.4.9a7 7 0 0 0 3 3l.9-1.4 2.8 1v2.2a1 1 0 0 1-1 1A10 10 0 0 1 3 4.5a1 1 0 0 1 1-1Z',
    glyph: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5l1.5-2.5 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z' },
  { id: 'document',  label: 'Documental',          bpmn: 'Manual Task',   codePrefix: 'DOC', color: '#78350F', tint: '#FBF6EE', stroke: '#A16207',
    desc: 'Firma física, papel, sellos, archivo manual.',
    marker: 'M4.5 2.5h5l3 3v8h-8zM9.5 2.5v3h3M6 8.5h5M6 10.5h3.5',
    glyph: 'M6 2h9l5 5v15H6V2Z M14 2v6h6 M9 13h6 M9 17h4' },
  { id: 'rpa',       label: 'RPA / Bot',           bpmn: 'Service Task',  codePrefix: 'BOT', color: '#374151', tint: '#EEF0F2', stroke: '#374151',
    desc: 'Robotic Process Automation. Bot imita usuario.',
    marker: 'M5 5.5h6v5H5zM6.5 5.5V4M9.5 5.5V4M6.8 7.7h.01M9.2 7.7h.01M6.5 9.3h3M4 7h1M11 7h1',
    glyph: 'M5 8h14v10H5z M9 4h6v4H9z M8 13h0.01 M16 13h0.01 M9 17h6' }
];

// Macroprocesos APQC simplificados
// =========================================================
// VERBOS PERMITIDOS / PROHIBIDOS — playbook MBB §1
// =========================================================
window.VERBS_ALLOWED = [
  // Captura
  'recibir','solicitar','recolectar','extraer','importar','escanear','capturar','obtener','consultar',
  // Procesamiento
  'registrar','ingresar','cargar','asignar','consolidar','calcular','comparar','depurar','enriquecer','clasificar','priorizar',
  // Análisis y decisión
  'revisar','analizar','auditar','evaluar','verificar','aprobar','rechazar','autorizar','validar','investigar','resolver','diagnosticar','determinar','identificar',
  // Excepciones / coordinación
  'escalar','reasignar','notificar','revertir','corregir','coordinar','programar','agendar',
  // Producción / preparación
  'preparar','redactar','documentar','elaborar','crear','rediseñar','actualizar','modificar','adjuntar',
  // Atención / comercial
  'saludar','atender','explicar','perfilar','ofrecer','presentar','simular','cotizar','negociar','vender','captar','fidelizar',
  // Acción externa
  'enviar','comunicar','entregar','descargar','publicar','exportar','imprimir','transferir','derivar','llamar','contactar','remitir','devolver',
  // Custodio / fin
  'archivar','almacenar','cerrar','completar','finalizar','liquidar','desembolsar','pagar','cobrar','despachar','firmar','emitir','generar','activar','desactivar'
];

window.VERBS_FORBIDDEN = {
  'gestionar':  'Demasiado vago. Usa verbo específico (registrar, validar, aprobar…).',
  'procesar':   'Demasiado vago. Indica qué acción específica.',
  'tratar':     'Demasiado vago. Cambia a verbo concreto.',
  'manejar':    'Demasiado vago. Especifica la acción.',
  'ser':        'No es acción, es estado. Cambia a "Recibir/Obtener X".',
  'estar':      'No es acción, es estado.',
  'tener':      'No es acción. Reformula.',
  'ir':         'Demasiado narrativo. Si es físico usa "Transportar", si es lógico "Derivar".',
  'venir':      'Demasiado narrativo.',
  'pasar':      'Demasiado narrativo. Usa "Derivar" o "Escalar".',
  'hacer':      'Verbo parásito. Especifica la acción real.',
  'realizar':   'Verbo parásito. Especifica.',
  'ejecutar':   'Verbo parásito (salvo en contexto técnico específico).'
};

window.MACROPROCESSES = ['O2C', 'P2P', 'R2R', 'H2R', 'S2D', 'Servicio', 'Producción', 'Calidad', 'Mantenimiento', 'Supply Chain', 'Inventario', 'Tienda', 'Atención', 'Trámites', 'Comercial', 'Operaciones', 'Riesgos', 'KYC', 'TI', 'Presupuesto', 'Transparencia', 'Hospitalización', 'Facturación', 'Devoluciones', 'Tributario', 'Siniestros', 'Suscripción'];
