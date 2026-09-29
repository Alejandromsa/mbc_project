// Unitarias de Conocimiento sin base de datos: CSV del marco, cobertura y texto del proceso.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { coberturaPorCategoria, compararCodigos, interpretarMarco, leerCsv, resumenMarco } from './marco.js';
import { parecidoFrases, recortar, textoDeProceso } from './texto.js';
import { terminosDe } from './servicio.js';

const EJEMPLO = readFileSync(new URL('./__fixtures__/marco-ejemplo.csv', import.meta.url), 'utf8');

describe('CSV del marco', () => {
  it('lee comillas, separadores y saltos de línea dentro de un campo, CRLF y BOM', () => {
    const texto = String.fromCharCode(0xfeff) + 'Hierarchy ID,Name,Element Description\r\n1.0,"Vender, y cobrar","Dice ""hola""\r\nen dos líneas"\r\n1.1,Captar,\r\n';
    expect(leerCsv(texto)).toEqual([
      ['Hierarchy ID', 'Name', 'Element Description'],
      ['1.0', 'Vender, y cobrar', 'Dice "hola"\r\nen dos líneas'],
      ['1.1', 'Captar', '']
    ]);
    // Excel en español guarda con punto y coma
    expect(leerCsv('Código;Nombre\n1.0;Uno, con coma')).toEqual([['Código', 'Nombre'], ['1.0', 'Uno, con coma']]);
  });

  it('el marco de ejemplo (inventado) se lee entero, con el nivel sacado del código', () => {
    const { elementos, errores, avisos } = interpretarMarco(EJEMPLO);
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
    const r = resumenMarco(elementos);
    expect(r.elementos).toBe(40);
    expect(r.porNivel).toEqual({ 1: 4, 2: 11, 3: 25 });
    expect(r.categorias.map((c) => [c.codigo, c.elementos])).toEqual([['1.0', 6], ['2.0', 12], ['3.0', 16], ['4.0', 6]]);
    expect(elementos.find((e) => e.codigo === '2.2.2')).toMatchObject({
      nivel: 3, nombre: 'Ofrecer la propuesta comercial', descripcion: 'Incluye descuentos; los aprueba la jefatura según la política vigente.'
    });
  });

  it('acepta las cabeceras del APQC en inglés y normaliza 1 como 1.0', () => {
    const { elementos, errores } = interpretarMarco('Hierarchy ID,Name\n1,Uno\n1.1,Uno uno\n1.10,Uno diez\n1.2,Uno dos\n');
    expect(errores).toEqual([]);
    expect(elementos.map((e) => [e.codigo, e.nivel])).toEqual([['1.0', 1], ['1.1', 2], ['1.10', 2], ['1.2', 2]]);
    expect(['1.10', '1.2', '1.0', '1.1', '10.0', '2.0'].sort(compararCodigos)).toEqual(['1.0', '1.1', '1.2', '1.10', '2.0', '10.0']);
  });

  it('rechaza lo que no se puede importar y dice en qué fila', () => {
    expect(interpretarMarco('Proceso;Detalle\nx;y').errores[0]).toMatch(/Faltan columnas.*Proceso, Detalle/);
    expect(interpretarMarco('Código;Nombre\n').errores).toEqual(['El archivo no tiene elementos: solo la cabecera.']);
    const { errores } = interpretarMarco('Código;Nombre\n1.0;Uno\nA.1;Mal código\n1.1;\n1.0;Repetido\n1;Repetido otra vez\n\n2.0;Bien');
    expect(errores).toEqual([
      'Fila 3: el código «A.1» no es jerárquico (por ejemplo 1.0, 1.2 o 1.2.3).',
      'Fila 4: el elemento 1.1 no tiene nombre.',
      'Fila 5: el código 1.0 está repetido (fila 2).',
      'Fila 6: el código 1 está repetido (fila 2).'
    ]);
  });

  it('avisa de elementos cuya categoría de nivel 1 no está en el archivo', () => {
    const { errores, avisos } = interpretarMarco('Código;Nombre\n1.0;Uno\n2.1;Sin categoría\n');
    expect(errores).toEqual([]);
    expect(avisos[0]).toMatch(/sin fila de nivel 1 \(2\.0\)/);
  });
});

describe('cobertura por categoría de nivel 1', () => {
  it('un grupo está cubierto si alguna actividad cae en él o debajo; las categorías sin actividades también salen', () => {
    const { elementos } = interpretarMarco(EJEMPLO);
    const c = coberturaPorCategoria(elementos, [{ codigo: '3.1.1' }, { codigo: '3.1.2' }, { codigo: '3.3' }, { codigo: null }, { codigo: '3.0' }]);
    expect(c.map((k) => [k.codigo, k.actividades, k.grupos, k.cobertura])).toEqual([
      ['1.0', 0, 2, 0], ['2.0', 0, 3, 0], ['3.0', 4, 4, 0.5], ['4.0', 0, 2, 0]
    ]);
    const siniestros = c.find((k) => k.codigo === '3.0')!;
    expect(siniestros.gruposCubiertos).toEqual([
      { codigo: '3.1', nombre: 'Recibir el aviso de siniestro', actividades: 2 },
      { codigo: '3.3', nombre: 'Liquidar el siniestro', actividades: 1 }
    ]);
    expect(siniestros.gruposFaltantes.map((g) => g.codigo)).toEqual(['3.2', '3.4']);
  });
});

describe('texto del proceso', () => {
  const contenido = {
    meta: { name: 'Gestión de siniestros', industry: 'Seguros', macroprocess: 'Siniestros', client: 'Cliente real', owner: '' },
    ficha: { objetivo: 'Pagar en menos de diez días', gobernanza: [{ rol: 'Dueño', cargo: 'Gerente de Siniestros', nombre: 'Persona Real' }], sistemas: [{ nombre: 'SAP', uso: '' }] },
    nodes: [
      { id: 'a', type: 'start', label: 'Aviso recibido', owner: 'Asegurado' },
      { id: 'b', type: 'task', label: 'Registrar el siniestro', owner: 'Contact Center', system: 'Core Seguros' },
      { id: 'c', type: 'system', label: 'Registrar el siniestro', owner: 'Contact Center', system: 'Core Seguros' },
      { id: 'g', type: 'task', label: 'Etapa de registro', _autoGen: true }
    ]
  };

  it('junta nombre, actividades, sistemas, roles y ficha sin repetir, sin personas ni cliente', () => {
    const t = textoDeProceso('Siniestros', contenido);
    expect(t.fragmentos).toEqual([
      { campo: 'nombre', texto: 'Siniestros' },
      { campo: 'nombre', texto: 'Gestión de siniestros' },
      { campo: 'actividad', texto: 'Registrar el siniestro' },
      { campo: 'elemento', texto: 'Aviso recibido' },
      { campo: 'sistema', texto: 'Core Seguros' },
      { campo: 'sistema', texto: 'SAP' },
      { campo: 'rol', texto: 'Asegurado' },
      { campo: 'rol', texto: 'Contact Center' },
      { campo: 'rol', texto: 'Gerente de Siniestros' },
      { campo: 'ficha', texto: 'Seguros', etiqueta: 'Industria' },
      { campo: 'ficha', texto: 'Siniestros', etiqueta: 'Macroproceso' },
      { campo: 'ficha', texto: 'Pagar en menos de diez días', etiqueta: 'Objetivo' }
    ]);
    expect(t.texto).not.toMatch(/Persona Real|Cliente real|Etapa de registro/);
    // Para comparar procesos: normalizado, sin verbos de actividad, sin palabras vacías ni ficha
    expect(t.textoParecido.split('\n')).toEqual(['siniestros', 'gestion siniestros', 'siniestro', 'core seguros', 'sap', 'asegurado', 'contact center', 'gerente siniestros']);
  });

  it('recorta un fragmento largo alrededor de lo buscado y separa la consulta en palabras útiles', () => {
    const largo = `${'Antes '.repeat(40)}aquí se valida la póliza del asegurado ${'después '.repeat(40)}`;
    const r = recortar(largo, ['poliza']);
    expect(r).toMatch(/^….*póliza.*…$/);
    expect(r.length).toBeLessThan(220);
    expect(recortar('Corto', ['x'])).toBe('Corto');
    expect(terminosDe('Validar la PÓLIZA de Seguro')).toEqual(['validar', 'poliza', 'seguro']);
    expect(terminosDe('de la')).toEqual(['de', 'la']);
    expect(parecidoFrases('Notificar al asegurado', 'notificar al Asegurado')).toBe(1);
    expect(parecidoFrases('Registrar siniestro', 'Emitir factura')).toBeLessThan(0.1);
  });
});
