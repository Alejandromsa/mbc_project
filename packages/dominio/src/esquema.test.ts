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

  it('quita las cachés de pintado también si la entrada ya es v1, dentro de nodes, edges y de cada vista', () => {
    const r1 = migrarProyecto(VENTA_LOTES);
    if (!r1.ok) throw new Error('debería migrar');
    const conCaches = (lista: any[]) => lista.map((o) => ({ ...o, _d: 'M0 0', _dSerie: 'x', _band: 1, _inferredOwner: true, _sello: 's1' }));
    const v1 = {
      ...r1.proyecto,
      nodes: conCaches(r1.proyecto.nodes),
      edges: conCaches(r1.proyecto.edges),
      views: { asis: { nodes: conCaches(r1.proyecto.nodes), edges: conCaches(r1.proyecto.edges) }, tobe: null }
    };
    const r = migrarProyecto(v1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.versionOrigen).toBe(1);
    const claves = JSON.stringify(r.proyecto);
    for (const k of ['_d"', '_dSerie', '_band', '_inferredOwner', '_sello']) expect(claves).not.toContain(`"${k}`);
    // Sin cachés, el resultado es el mismo v1 de partida (con sus vistas)
    expect(r.proyecto).toEqual({ ...r1.proyecto, views: { asis: { nodes: r1.proyecto.nodes, edges: r1.proyecto.edges }, tobe: null } });
  });

  it('normaliza las vistas como el primer nivel en lugar de rechazarlas', () => {
    const r = migrarProyecto({
      nodes: [{ id: 'n1', type: 'task' }],
      edges: [],
      views: {
        asis: { nodes: [{ id: 'n1', type: 'decision', _band: 2 }, null, 'basura'], edges: [{ id: 'e1', from: 'n1', to: 'n2', _d: 'M0 0' }] },
        tobe: 'no es una vista',
        otra: { se: 'conserva' }
      }
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proyecto.views).toEqual({
      asis: { nodes: [{ id: 'n1', type: 'decision', x: 0, y: 0, w: 110, h: 80, label: '' }], edges: [{ id: 'e1', from: 'n1', to: 'n2', label: '' }] },
      tobe: null,
      otra: { se: 'conserva' }
    });
    // Sin nodes ni edges, o con algo que no es una lista: listas vacías
    const r2 = migrarProyecto({ nodes: [], edges: [], views: { asis: { nodes: 'x' }, tobe: {} } });
    expect(r2.ok && r2.proyecto.views).toEqual({ asis: { nodes: [], edges: [] }, tobe: { nodes: [], edges: [] } });
    // Una etiqueta que no es texto pasa a texto; una vista que no es un objeto se quita
    const r3 = migrarProyecto({ schemaVersion: 1, meta: r.proyecto.meta, ficha: r.proyecto.ficha, nodes: [], edges: [],
      views: { asis: { nodes: [{ id: 'a', type: 'task', x: 1, y: 2, w: 3, h: 4, label: 7 }], edges: [{ id: 'e', label: null }] } } });
    expect(r3.ok && r3.proyecto.views).toEqual({ asis: { nodes: [{ id: 'a', type: 'task', x: 1, y: 2, w: 3, h: 4, label: '7' }], edges: [{ id: 'e', label: '' }] } });
    const r4 = migrarProyecto({ nodes: [], edges: [], views: [1, 2] });
    expect(r4.ok && 'views' in r4.proyecto).toBe(false);
  });

  it('en las vistas tolera lo que el primer nivel rechaza: se guardó así antes de validarlas', () => {
    const vista = {
      nodes: [{ id: 'a', type: 'nube', x: 0, y: 0, w: 10, h: 10, label: 'Tipo desconocido', pains: [{ severity: 9 }] },
        { type: 'task', x: 0, y: 0, w: 10, h: 10, label: 'Sin id' }, { id: 'a', type: 'end', x: 0, y: 0, w: 10, h: 10, label: 'Id repetido' }],
      edges: [{ id: 'e', from: 'a', to: 'no-existe', label: '' }, { label: 'Sin extremos' }]
    };
    const r = migrarProyecto({ nodes: [], edges: [], views: { asis: null, tobe: vista } });
    expect(r.ok).toBe(true);
    expect(r.ok && r.proyecto.views).toEqual({ asis: null, tobe: vista });
  });

  it('conserva el orden de las claves de las vistas (la huella de los borradores no cambia)', () => {
    const nodo = { label: 'Primero la etiqueta', id: 'n1', owner: 'Ventas', type: 'task', h: 76, w: 158, y: 5, x: 4 };
    const r = migrarProyecto({ nodes: [], edges: [], views: { asis: { edges: [], nodes: [nodo] }, tobe: null } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify((r.proyecto.views as any).asis)).toBe(JSON.stringify({ edges: [], nodes: [nodo] }));
  });

  it('las vistas del editor (localStorage del MVP) pasan igual y la migración es idempotente', () => {
    for (const datos of [SINIESTROS, VENTA_LOTES]) {
      const guardado = { ...datos, activeView: 'tobe', views: { asis: { nodes: datos.nodes, edges: datos.edges }, tobe: { nodes: datos.nodes, edges: datos.edges } } };
      const r = migrarProyecto(guardado);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const views = r.proyecto.views as any;
      expect(views.tobe.nodes).toEqual(r.proyecto.nodes);
      expect(views.asis.edges).toEqual(r.proyecto.edges);
      expect(migrarProyecto(r.proyecto)).toEqual({ ok: true, proyecto: r.proyecto, versionOrigen: 1 });
    }
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
