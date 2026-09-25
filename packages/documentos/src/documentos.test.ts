import { describe, expect, it } from 'vitest';
import { MAX_NODOS_BASICO, construirProcesoBasico, detectarParticipantes, interpretarTexto } from './index.js';

const PRIMERA_PERSONA = `Recibo la solicitud del cliente por correo. Registro los datos en el CRM.
Reviso los documentos adjuntos y verifico la identidad del cliente.
Si el cliente cumple los requisitos, apruebo la solicitud en SAP.
Si no cumple, rechazo la solicitud y notifico al cliente.
¿El monto supera el límite? Escalo el caso al jefe de riesgos.
Genero el contrato y lo envío al cliente para su firma.
Archivo el expediente en SharePoint y cierro el caso.`;

describe('interpretarTexto', () => {
  const a = interpretarTexto(PRIMERA_PERSONA);

  it('detecta actividades y decisiones de una narración en primera persona', () => {
    expect(a.map((x) => [x.type, x.label, x.owner, x.system, x.executionType])).toMatchInlineSnapshot(`
      [
        [
          "task",
          "Recibir solicitud correo",
          "Cliente",
          "",
          "email",
        ],
        [
          "system",
          "Registrar crm",
          "",
          "CRM",
          "system",
        ],
        [
          "task",
          "Revisar documentos adjuntos",
          "Ejecutivo Comercial",
          "",
          "manual",
        ],
        [
          "decision",
          "Aprobar solicitud sap",
          "Ejecutivo Comercial",
          "SAP",
          "",
        ],
        [
          "decision",
          "Rechazar solicitud notifico",
          "Ejecutivo Comercial",
          "",
          "",
        ],
        [
          "decision",
          "Escalar caso jefe",
          "Jefe De",
          "",
          "",
        ],
        [
          "task",
          "Generar contrato envío",
          "Ejecutivo Comercial",
          "",
          "manual",
        ],
      ]
    `);
  });

  it('convierte el verbo conjugado en infinitivo y detecta sistemas y canales', () => {
    const registrar = a.find((x) => x.label.startsWith('Registrar'))!;
    expect(registrar).toMatchObject({ type: 'system', system: 'CRM', executionType: 'system' });
    expect(a.find((x) => x.label.startsWith('Recibir'))!.executionType).toBe('email');
  });

  it('sin verbos no hay actividades', () => {
    expect(interpretarTexto('Objetivos. Alcance. Teléfono.')).toEqual([]);
  });

  it('guarda la frase original como nota', () => {
    expect(a[0]!.note).toBe('Recibo la solicitud del cliente por correo');
  });
});

describe('construirProcesoBasico', () => {
  it('Inicio, actividades y "Caso completado" conectados en línea', () => {
    const p = construirProcesoBasico(interpretarTexto(PRIMERA_PERSONA), { siguienteId: 1 });
    expect(p.nodos[0]).toMatchObject({ id: 'n1', type: 'start', label: 'Inicio' });
    const n = p.nodos.length;
    expect(p.nodos.at(-1)).toMatchObject({ id: 'n' + n, type: 'end', label: 'Caso completado' });
    expect(p.aristas).toHaveLength(n - 1);
    expect(p.aristas[0]).toEqual({ id: 'e' + (n + 1), from: 'n1', to: 'n2', label: '' });
    expect(p.recortadoDe).toBe(0);
  });

  it('recorta a 60 actividades y lo informa', () => {
    const muchas = Array.from({ length: 75 }, (_, i) => ({
      type: 'task' as const, label: 'Revisar ' + i, owner: '', system: '', executionType: 'manual' as const, note: ''
    }));
    const p = construirProcesoBasico(muchas, { siguienteId: 1 });
    expect(p.actividades).toBe(MAX_NODOS_BASICO);
    expect(p.recortadoDe).toBe(75);
    expect(p.nodos).toHaveLength(MAX_NODOS_BASICO + 2);
  });
});

describe('detectarParticipantes', () => {
  it('personas con 2+ intervenciones, con su cargo si aparece', () => {
    const t = `María López (Jefa de Operaciones): Buenos días.
Carlos Pérez: Primero recibimos la ficha.
María López: Luego TI crea el usuario.
[10:32] Carlos Pérez: Si es de ventas se da acceso.
Ana Torres: Legal valida el contrato.
Nota: esto no es una persona.
Nota: tampoco esto.`;
    expect(detectarParticipantes(t)).toEqual([
      { nombre: 'María López', veces: 2, pista: 'Jefa de Operaciones' },
      { nombre: 'Carlos Pérez', veces: 2, pista: '' }
    ]);
  });
});
