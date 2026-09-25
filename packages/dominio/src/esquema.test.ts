import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION_ESQUEMA, migrarProyecto } from './index.js';

// Proyectos exportados por el MVP 3.8.9 (ejemplos públicos de la propia app)
const fixture = (n: string) => JSON.parse(readFileSync(join(import.meta.dirname, '__fixtures__', n), 'utf8'));
const SINIESTROS = fixture('mvp-3.8.9-siniestros.json');
const VENTA_LOTES = fixture('mvp-3.8.9-venta-lotes.json');

describe('migrarProyecto', () => {
  it.each([['siniestros', SINIESTROS], ['venta de lotes', VENTA_LOTES]])('migra el export JSON del MVP (%s) a v1', (_, datos) => {
    const r = migrarProyecto(datos);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.versionOrigen).toBe(0);
    expect(r.proyecto.schemaVersion).toBe(VERSION_ESQUEMA);
    expect(r.proyecto.nodes).toHaveLength(datos.nodes.length);
    expect(r.proyecto.edges).toHaveLength(datos.edges.length);
    // Se quitan las cachés de renderizado; se conservan los campos del proceso
    expect(r.proyecto.nodes.some((n) => '_band' in n || '_inferredOwner' in n)).toBe(false);
    expect(r.proyecto.nodes[0]).toMatchObject({ id: datos.nodes[0].id, label: datos.nodes[0].label, x: datos.nodes[0].x });
    expect(r.proyecto).not.toHaveProperty('exportedAt');
  });

  it('no modifica la entrada', () => {
    const copia = JSON.stringify(SINIESTROS);
    migrarProyecto(SINIESTROS);
    expect(JSON.stringify(SINIESTROS)).toBe(copia);
  });

  it('es idempotente: un v1 se valida tal cual', () => {
    const r1 = migrarProyecto(VENTA_LOTES);
    if (!r1.ok) throw new Error('debería migrar');
    const r2 = migrarProyecto(r1.proyecto);
    expect(r2).toEqual({ ok: true, proyecto: r1.proyecto, versionOrigen: 1 });
  });

  it('completa datos antiguos: ficha, meta, tamaños y etiquetas', () => {
    const r = migrarProyecto({ nodes: [{ id: 'n1', type: 'task' }], edges: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proyecto.nodes[0]).toMatchObject({ x: 0, y: 0, w: 158, h: 76, label: '' });
    expect(r.proyecto.meta.name).toBe('');
    expect(r.proyecto.ficha.gobernanza).toEqual([]);
  });

  it('conserva los datos de análisis que guarda localStorage', () => {
    const r = migrarProyecto({ nodes: [], edges: [], kpiValues: { k: { name: 'FCR', unit: '%', benchmark: '', value: '60', gap: '', source: '' } }, raci: { n1: { A: 'R' } } });
    expect(r.ok && r.proyecto.raci).toEqual({ n1: { A: 'R' } });
  });

  it('rechaza aristas a nodos inexistentes e ids repetidos', () => {
    const r = migrarProyecto({ nodes: [{ id: 'a', type: 'start' }, { id: 'a', type: 'end' }], edges: [{ id: 'e', from: 'a', to: 'zz' }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores).toEqual(expect.arrayContaining([
      'nodes.1.id: id de nodo repetido: a',
      'edges.0.to: la arista e llega a un nodo inexistente: zz'
    ]));
  });

  it('rechaza tipos de nodo desconocidos, entradas que no son objeto y versiones futuras', () => {
    expect(migrarProyecto({ nodes: [{ id: 'a', type: 'nube' }], edges: [] }).ok).toBe(false);
    expect(migrarProyecto('texto').ok).toBe(false);
    expect(migrarProyecto([]).ok).toBe(false);
    const futuro = migrarProyecto({ schemaVersion: 99 });
    expect(futuro.ok).toBe(false);
    if (!futuro.ok) expect(futuro.errores[0]).toContain('versión más nueva');
  });
});
