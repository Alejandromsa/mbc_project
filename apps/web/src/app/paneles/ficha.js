// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { emptyFicha, state } from '../estado.js';
import { openFichaPreview } from '../exportar/ficha.js';
import { persist } from '../persistencia.js';

// =================== FICHA DE PROCESO — edición ===================
// Listas editadas como texto: una fila por línea, campos separados por "|".
function parsePipeLines(text, keys) {
  return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split('|').map(s => s.trim());
    const o = {}; keys.forEach((k, i) => o[k] = parts[i] || ''); return o;
  });
}
function serializePipeLines(arr, keys) {
  return (arr || []).map(o => keys.map(k => o[k] || '').join(' | ')).join('\n');
}
function renderFichaTab() {
  const f = state.ficha || (state.ficha = emptyFicha());
  const set = (id, v) => { const el = $('#' + id); if (el && document.activeElement !== el) el.value = v || ''; };
  set('fichaCode', f.code); set('fichaVersion', f.version); set('fichaObjetivo', f.objetivo);
  set('fichaAlcanceAreas', f.alcanceAreas); set('fichaAlcanceDesde', f.alcanceDesde);
  set('fichaAlcanceHasta', f.alcanceHasta); set('fichaAlcanceIncluye', f.alcanceIncluye);
  set('fichaDescripcion', f.descripcion);
  set('fichaGobernanza', serializePipeLines(f.gobernanza, ['rol', 'cargo', 'nombre', 'fecha']));
  set('fichaSistemas', serializePipeLines(f.sistemas, ['nombre', 'uso']));
  set('fichaTerminos', serializePipeLines(f.terminos, ['termino', 'definicion']));
  set('fichaAnexos', serializePipeLines(f.anexos, ['codigo', 'nombre']));
  set('fichaCambios', serializePipeLines(f.cambios, ['version', 'fecha', 'descripcion']));
}
function attachFichaListeners() {
  const f = () => (state.ficha || (state.ficha = emptyFicha()));
  const bindText = (id, key) => { const el = $('#' + id); if (el) el.addEventListener('input', e => { f()[key] = e.target.value; persist(); }); };
  bindText('fichaCode', 'code'); bindText('fichaVersion', 'version'); bindText('fichaObjetivo', 'objetivo');
  bindText('fichaAlcanceAreas', 'alcanceAreas'); bindText('fichaAlcanceDesde', 'alcanceDesde');
  bindText('fichaAlcanceHasta', 'alcanceHasta'); bindText('fichaAlcanceIncluye', 'alcanceIncluye');
  bindText('fichaDescripcion', 'descripcion');
  const bindList = (id, key, keys) => { const el = $('#' + id); if (el) el.addEventListener('input', e => { f()[key] = parsePipeLines(e.target.value, keys); persist(); }); };
  bindList('fichaGobernanza', 'gobernanza', ['rol', 'cargo', 'nombre', 'fecha']);
  bindList('fichaSistemas', 'sistemas', ['nombre', 'uso']);
  bindList('fichaTerminos', 'terminos', ['termino', 'definicion']);
  bindList('fichaAnexos', 'anexos', ['codigo', 'nombre']);
  bindList('fichaCambios', 'cambios', ['version', 'fecha', 'descripcion']);
  const prev = $('#btnFichaPreview'); if (prev) prev.addEventListener('click', openFichaPreview);
}

export { attachFichaListeners, renderFichaTab };
