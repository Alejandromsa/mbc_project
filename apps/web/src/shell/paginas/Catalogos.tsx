// Catálogos de la organización (solo administradores): KPIs, verbos del
// Playbook, temas PPTX de cliente y plantillas de proceso. Los usa el editor
// en los procesos de proyectos; el editor libre sigue con los del MVP.
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DefinicionTema, type KpiAdmin, type Plantilla, type TemaAdmin } from '../api';
import { fecha } from '../formato';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Dialogo, ErrorDe, Etiqueta, Selector, Vacio, useTitulo } from '../ui';

type Pestana = 'kpis' | 'verbos' | 'temas' | 'plantillas';

export function Catalogos() {
  useTitulo('Catálogos');
  const [pestana, setPestana] = useState<Pestana>('kpis');
  const pestanas: [Pestana, string][] = [['kpis', 'KPIs'], ['verbos', 'Verbos del Playbook'], ['temas', 'Temas PPTX'], ['plantillas', 'Plantillas de proceso']];
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Catálogos</h1>
          <p className="sutil">Lo que usa el editor en los procesos de los proyectos. El editor libre sigue con los catálogos de fábrica.</p>
        </div>
      </div>
      <div className="pestanas" role="tablist">
        {pestanas.map(([id, texto]) => (
          <button key={id} type="button" role="tab" aria-selected={pestana === id} className={pestana === id ? 'activa' : ''} onClick={() => setPestana(id)}>{texto}</button>
        ))}
      </div>
      <div role="tabpanel">
        {pestana === 'kpis' && <PestanaKpis />}
        {pestana === 'verbos' && <PestanaVerbos />}
        {pestana === 'temas' && <PestanaTemas />}
        {pestana === 'plantillas' && <PestanaPlantillas />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- KPIs

function PestanaKpis() {
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: ['catalogo', 'kpis'], queryFn: api.kpisAdmin });
  const [industria, setIndustria] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<KpiAdmin | 'nuevo' | null>(null);
  const cambiar = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => api.cambiarKpi(id, { activo }),
    onSettled: () => cliente.invalidateQueries({ queryKey: ['catalogo', 'kpis'] })
  });

  const todos = consulta.data?.kpis ?? [];
  const industrias = useMemo(() => [...new Set(todos.map((k) => k.industria))].sort(), [todos]);
  const q = busqueda.trim().toLowerCase();
  const lista = todos.filter((k) => (!industria || k.industria === industria) &&
    (!q || `${k.nombre} ${k.macroproceso} ${k.descripcion} ${k.codigo}`.toLowerCase().includes(q)));

  return (
    <section>
      <div className="barra-filtros">
        <Selector aria-label="Industria" value={industria} onChange={(e) => setIndustria(e.target.value)}
          opciones={[{ valor: '', texto: 'Todas las industrias' }, ...industrias.map((i) => ({ valor: i, texto: i }))]} />
        <input type="search" className="busqueda" placeholder="Buscar KPI…" aria-label="Buscar KPI" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <span className="sutil">{lista.length} de {todos.length}</span>
        <Boton variante="primario" onClick={() => setEditando('nuevo')}>Nuevo KPI</Boton>
      </div>
      <ErrorDe error={cambiar.error} />
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : lista.length === 0 ? <Vacio>Ningún KPI coincide.</Vacio> : (
        <table className="tabla tabla-compacta">
          <thead><tr><th>KPI</th><th>Industria</th><th>Macroproceso</th><th>Unidad</th><th>Referencia</th><th>Estado</th><th><span className="solo-lector">Acciones</span></th></tr></thead>
          <tbody>
            {lista.map((k) => (
              <tr key={k.id} className={k.activo ? '' : 'inactivo'}>
                <td><strong>{k.nombre}</strong><br /><small className="sutil">{k.codigo}</small></td>
                <td>{k.industria}</td>
                <td>{k.macroproceso || '—'}</td>
                <td>{k.unidad}</td>
                <td>{k.benchmark}</td>
                <td>{k.activo ? 'Activo' : <Etiqueta tono="aviso">Desactivado</Etiqueta>}</td>
                <td className="celda-acciones">
                  <Boton variante="sutil" onClick={() => setEditando(k)}>Editar</Boton>
                  <Boton variante="sutil" disabled={cambiar.isPending} onClick={() => cambiar.mutate({ id: k.id, activo: !k.activo })}>
                    {k.activo ? 'Desactivar' : 'Activar'}
                  </Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Dialogo abierto={!!editando} titulo={editando === 'nuevo' ? 'Nuevo KPI' : 'Editar KPI'} onCerrar={() => setEditando(null)}>
        {editando && <FormKpi kpi={editando === 'nuevo' ? null : editando} industrias={industrias} onCerrar={() => setEditando(null)} />}
      </Dialogo>
    </section>
  );
}

function FormKpi({ kpi, industrias, onCerrar }: { kpi: KpiAdmin | null; industrias: string[]; onCerrar: () => void }) {
  const cliente = useQueryClient();
  const [d, setD] = useState({
    industria: kpi?.industria ?? industrias[0] ?? '', macroproceso: kpi?.macroproceso ?? '', nombre: kpi?.nombre ?? '',
    unidad: kpi?.unidad ?? '', benchmark: kpi?.benchmark ?? '', descripcion: kpi?.descripcion ?? ''
  });
  const campo = (k: keyof typeof d) => ({ value: d[k], onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });
  const guardar = useMutation({
    mutationFn: () => (kpi ? api.cambiarKpi(kpi.id, d) : api.crearKpi(d)),
    onSuccess: () => { cliente.invalidateQueries({ queryKey: ['catalogo', 'kpis'] }); onCerrar(); }
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); guardar.mutate(); };
  return (
    <form onSubmit={enviar}>
      <Campo etiqueta="Nombre" required maxLength={160} autoFocus {...campo('nombre')} />
      <div className="fila-campos">
        <Campo etiqueta="Industria" required maxLength={80} list="industrias-kpi" {...campo('industria')} />
        <Campo etiqueta="Macroproceso" maxLength={80} {...campo('macroproceso')} />
      </div>
      <datalist id="industrias-kpi">{industrias.map((i) => <option key={i} value={i} />)}</datalist>
      <div className="fila-campos">
        <Campo etiqueta="Unidad" maxLength={40} placeholder="%, días, horas…" {...campo('unidad')} />
        <Campo etiqueta="Referencia (benchmark)" maxLength={120} {...campo('benchmark')} />
      </div>
      <AreaTexto etiqueta="Descripción" maxLength={600} {...campo('descripcion')} />
      {kpi && <p className="sutil">Código <code>{kpi.codigo}</code>: los procesos guardan los valores con él, por eso no cambia.</p>}
      <ErrorDe error={guardar.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={guardar.isPending}>{kpi ? 'Guardar' : 'Crear KPI'}</Boton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Verbos

function PestanaVerbos() {
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: ['catalogo', 'verbos'], queryFn: api.verbosAdmin });
  const refrescar = () => cliente.invalidateQueries({ queryKey: ['catalogo', 'verbos'] });
  const poner = useMutation({
    mutationFn: ({ verbo, tipo, motivo }: { verbo: string; tipo: 'permitido' | 'prohibido'; motivo?: string }) => api.ponerVerbo(verbo, { tipo, motivo }),
    onSuccess: refrescar
  });
  const quitar = useMutation({ mutationFn: api.quitarVerbo, onSuccess: refrescar });
  const [nuevoPermitido, setNuevoPermitido] = useState('');
  const [prohibido, setProhibido] = useState({ verbo: '', motivo: '' });

  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) return <ErrorDe error={consulta.error} />;
  const permitidos = consulta.data.verbos.filter((v) => v.tipo === 'permitido');
  const prohibidos = consulta.data.verbos.filter((v) => v.tipo === 'prohibido');

  return (
    <section>
      <p className="sutil">El linter del editor exige que cada actividad empiece por un verbo en infinitivo. Los <strong>prohibidos</strong> se marcan como error con el motivo que escribas; los <strong>permitidos</strong> son los que no generan aviso.</p>
      <ErrorDe error={poner.error ?? quitar.error} />
      <h2>Prohibidos ({prohibidos.length})</h2>
      <table className="tabla tabla-compacta">
        <thead><tr><th>Verbo</th><th>Motivo que ve el consultor</th><th><span className="solo-lector">Acciones</span></th></tr></thead>
        <tbody>
          {prohibidos.map((v) => (
            <tr key={v.verbo}>
              <td><strong>{v.verbo}</strong></td>
              <td>{v.motivo}</td>
              <td className="celda-acciones">
                <Boton variante="sutil" onClick={() => setProhibido({ verbo: v.verbo, motivo: v.motivo })}>Editar</Boton>
                <Boton variante="sutil" onClick={() => poner.mutate({ verbo: v.verbo, tipo: 'permitido' })}>Permitir</Boton>
                <Boton variante="sutil" onClick={() => quitar.mutate(v.verbo)}>Quitar</Boton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="fila-alta" onSubmit={(e) => { e.preventDefault(); poner.mutate({ verbo: prohibido.verbo, tipo: 'prohibido', motivo: prohibido.motivo }, { onSuccess: () => setProhibido({ verbo: '', motivo: '' }) }); }}>
        <input aria-label="Verbo prohibido" placeholder="verbo" value={prohibido.verbo} onChange={(e) => setProhibido({ ...prohibido, verbo: e.target.value })} required />
        <input aria-label="Motivo" placeholder="Por qué no se usa y qué poner en su lugar" className="ancho" value={prohibido.motivo} onChange={(e) => setProhibido({ ...prohibido, motivo: e.target.value })} required />
        <Boton type="submit" variante="primario" cargando={poner.isPending}>Prohibir</Boton>
      </form>

      <h2>Permitidos ({permitidos.length})</h2>
      <ul className="chips">
        {permitidos.map((v) => (
          <li key={v.verbo}>
            {v.verbo}
            <button type="button" aria-label={`Quitar ${v.verbo}`} onClick={() => quitar.mutate(v.verbo)}>×</button>
          </li>
        ))}
      </ul>
      <form className="fila-alta" onSubmit={(e) => { e.preventDefault(); poner.mutate({ verbo: nuevoPermitido, tipo: 'permitido' }, { onSuccess: () => setNuevoPermitido('') }); }}>
        <input aria-label="Verbo permitido" placeholder="verbo en infinitivo" value={nuevoPermitido} onChange={(e) => setNuevoPermitido(e.target.value)} required />
        <Boton type="submit" cargando={poner.isPending}>Añadir</Boton>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- Temas PPTX

const COLORES: [keyof DefinicionTema, string][] = [
  ['dk1', 'Principal (títulos y barras)'], ['acento', 'Acento'], ['lt2', 'Fondo de las láminas'], ['arena', 'Fondo de tarjetas'],
  ['gris', 'Texto secundario'], ['antetitulo', 'Antetítulo'], ['sep', 'Separadores'], ['chipRol', 'Etiqueta de rol'],
  ['teal', 'Secundario'], ['rosa', 'Estado: alerta'], ['verde', 'Estado: bien'], ['circulo', 'Círculos de numeración'],
  ['portadaFondo', 'Carátula: fondo'], ['portadaTexto', 'Carátula: texto'], ['portadaSub', 'Carátula: subtítulo']
];

/** Los temas del sistema (MBC, BBVA) para duplicarlos: se cargan solo en esta pantalla. */
async function temasBase(): Promise<Record<string, DefinicionTema>> {
  const { TEMAS_PPTX } = await import('@processiq/exportar');
  return TEMAS_PPTX as unknown as Record<string, DefinicionTema>;
}

function PestanaTemas() {
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: ['catalogo', 'temas'], queryFn: api.temasAdmin });
  const [editando, setEditando] = useState<TemaAdmin | null>(null);
  const [creando, setCreando] = useState(false);
  const refrescar = () => cliente.invalidateQueries({ queryKey: ['catalogo', 'temas'] });
  const cambiar = useMutation({ mutationFn: ({ id, activo }: { id: string; activo: boolean }) => api.cambiarTema(id, { activo }), onSettled: refrescar });
  const borrar = useMutation({ mutationFn: api.borrarTema, onSettled: refrescar });

  return (
    <section>
      <div className="barra-filtros">
        <p className="sutil">Además de MBC y BBVA (del sistema), cada tema activo aparece en el menú <strong>Exportar → PPTX</strong> del editor.</p>
        <Boton variante="primario" onClick={() => setCreando(true)}>Nuevo tema</Boton>
      </div>
      <ErrorDe error={cambiar.error ?? borrar.error} />
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : consulta.data.temas.length === 0 ? (
        <Vacio>Todavía no hay temas de cliente. Crea uno a partir del de MBC o del de BBVA.</Vacio>
      ) : (
        <ul className="rejilla-tarjetas">
          {consulta.data.temas.map((t) => (
            <li key={t.id} className={`tarjeta tema ${t.activo ? '' : 'inactivo'}`}>
              <div className="tema-muestra" style={{ background: `#${t.definicion.portadaFondo}`, color: `#${t.definicion.portadaTexto}`, fontFamily: t.definicion.fontTitulo }}>
                <img src={t.definicion.logoInv} alt="" />
                <span>{t.definicion.nombre}</span>
              </div>
              <div className="paleta">{(['dk1', 'acento', 'gris', 'sep', 'chipRol', 'arena'] as const).map((k) => <span key={k} style={{ background: `#${t.definicion[k]}` }} title={k} />)}</div>
              <p><strong>{t.nombre}</strong> <code>{t.clave}</code> {!t.activo && <Etiqueta tono="aviso">Oculto</Etiqueta>}</p>
              <div className="acciones">
                <Boton variante="sutil" onClick={() => setEditando(t)}>Editar</Boton>
                <Boton variante="sutil" onClick={() => cambiar.mutate({ id: t.id, activo: !t.activo })}>{t.activo ? 'Ocultar' : 'Mostrar'}</Boton>
                <Boton variante="sutil" onClick={() => { if (confirm(`¿Eliminar el tema ${t.nombre}?`)) borrar.mutate(t.id); }}>Eliminar</Boton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialogo abierto={creando} titulo="Nuevo tema PPTX" onCerrar={() => setCreando(false)}>
        <NuevoTema onCreado={(t) => { setCreando(false); refrescar(); setEditando(t); }} onCerrar={() => setCreando(false)} />
      </Dialogo>
      <Dialogo ancho abierto={!!editando} titulo={editando ? `Tema ${editando.nombre}` : ''} onCerrar={() => setEditando(null)}>
        {editando && <EditorTema tema={editando} onCerrar={() => { setEditando(null); refrescar(); }} />}
      </Dialogo>
    </section>
  );
}

function NuevoTema({ onCreado, onCerrar }: { onCreado: (t: TemaAdmin) => void; onCerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [base, setBase] = useState<'mbc' | 'bbva'>('mbc');
  const crear = useMutation({
    mutationFn: async () => {
      const b = (await temasBase())[base]!;
      const { foto: _foto, ...sinFoto } = b;
      return api.crearTema(clave || nombre, { ...(base === 'mbc' ? b : sinFoto), nombre, pie: nombre, autor: `MBC Business Consulting · ${nombre}` });
    },
    onSuccess: ({ tema }) => onCreado(tema)
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); crear.mutate(); };
  return (
    <form onSubmit={enviar}>
      <Campo etiqueta="Nombre del cliente" required maxLength={60} autoFocus value={nombre}
        onChange={(e) => { setNombre(e.target.value); setClave(e.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)); }} />
      <Campo etiqueta="Clave" required pattern="[a-z0-9-]{2,30}" value={clave} onChange={(e) => setClave(e.target.value)}
        ayuda="Minúsculas, números y guiones. Identifica el tema; no se puede cambiar." />
      <Selector etiqueta="Partir de" value={base} onChange={(e) => setBase(e.target.value as 'mbc' | 'bbva')}
        opciones={[{ valor: 'mbc', texto: 'MBC (carátula con foto)' }, { valor: 'bbva', texto: 'BBVA (carátula de color y lámina de cierre)' }]} />
      <p className="sutil">Después podrás cambiar colores, tipografías y logotipos.</p>
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}>Crear y editar</Boton>
      </div>
    </form>
  );
}

function leerImagen(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    if (!/^image\/(png|jpeg)$/.test(archivo.type)) { rechazar(new Error('La imagen debe ser PNG o JPEG.')); return; }
    if (archivo.size > 1_400_000) { rechazar(new Error('La imagen pesa demasiado (máximo 1,4 MB).')); return; }
    const r = new FileReader();
    r.onload = () => resolver(String(r.result));
    r.onerror = () => rechazar(new Error('No se pudo leer la imagen.'));
    r.readAsDataURL(archivo);
  });
}

function EditorTema({ tema, onCerrar }: { tema: TemaAdmin; onCerrar: () => void }) {
  const [d, setD] = useState<DefinicionTema>(tema.definicion);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);
  const poner = <K extends keyof DefinicionTema>(k: K, v: DefinicionTema[K]) => setD((x) => ({ ...x, [k]: v }));
  const guardar = useMutation({ mutationFn: () => api.cambiarTema(tema.id, { definicion: d }), onSuccess: onCerrar });
  const imagen = (k: 'logo' | 'logoInv' | 'foto') => async (f: File | undefined) => {
    setErrorImagen(null);
    if (!f) return;
    try { poner(k, await leerImagen(f)); } catch (e) { setErrorImagen((e as Error).message); }
  };
  const enviar = (e: FormEvent) => { e.preventDefault(); guardar.mutate(); };

  return (
    <form onSubmit={enviar} className="editor-tema">
      <div className="fila-campos">
        <Campo etiqueta="Nombre" required maxLength={60} value={d.nombre} onChange={(e) => poner('nombre', e.target.value)} />
        <Campo etiqueta="Pie de lámina" maxLength={60} value={d.pie} onChange={(e) => poner('pie', e.target.value)} />
      </div>
      <Campo etiqueta="Autor (propiedades del archivo)" maxLength={120} value={d.autor} onChange={(e) => poner('autor', e.target.value)} />
      <fieldset>
        <legend>Colores</legend>
        <div className="rejilla-colores">
          {COLORES.map(([k, texto]) => (
            <label key={k} className="color">
              <input type="color" value={`#${String(d[k])}`} onChange={(e) => poner(k, e.target.value.slice(1).toUpperCase() as never)} />
              <span>{texto}<small>#{String(d[k])}</small></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Tipografías</legend>
        <div className="fila-campos">
          <Campo etiqueta="Texto" required maxLength={60} value={d.font} onChange={(e) => poner('font', e.target.value)} ayuda="Debe estar instalada donde se abra el PPTX." />
          <Campo etiqueta="Títulos" required maxLength={60} value={d.fontTitulo} onChange={(e) => poner('fontTitulo', e.target.value)} />
        </div>
      </fieldset>
      <fieldset>
        <legend>Logotipos y carátula</legend>
        <div className="rejilla-imagenes">
          {([['logo', 'Logo sobre fondo claro'], ['logoInv', 'Logo sobre fondo oscuro'], ['foto', 'Foto de carátula (opcional)']] as const).map(([k, texto]) => (
            <div key={k} className="campo">
              <label htmlFor={`img-${k}`}>{texto}</label>
              <div className={`vista-imagen ${k === 'logoInv' ? 'oscura' : ''}`} style={k === 'logoInv' ? { background: `#${d.portadaFondo}` } : undefined}>
                {d[k] ? <img src={d[k]} alt="" /> : <span className="sutil">Sin imagen</span>}
              </div>
              <input id={`img-${k}`} type="file" accept="image/png,image/jpeg" onChange={(e) => imagen(k)(e.target.files?.[0])} />
              {k === 'foto' && d.foto && <Boton variante="sutil" onClick={() => setD(({ foto: _f, ...resto }) => resto)}>Quitar foto</Boton>}
            </div>
          ))}
        </div>
        {errorImagen && <Aviso tipo="error">{errorImagen}</Aviso>}
        <div className="fila-campos">
          <Campo etiqueta="Ancho del logo (pulgadas)" type="number" step="0.01" min="0.1" max="6" value={d.logoW} onChange={(e) => poner('logoW', Number(e.target.value))} />
          <Campo etiqueta="Alto del logo (pulgadas)" type="number" step="0.01" min="0.1" max="3" value={d.logoH} onChange={(e) => poner('logoH', Number(e.target.value))} />
        </div>
        <div className="fila-campos">
          <Selector etiqueta="Estilo de carátula" value={d.portada} onChange={(e) => poner('portada', e.target.value as 'mbc' | 'bbva')}
            opciones={[{ valor: 'mbc', texto: 'Con foto (como MBC)' }, { valor: 'bbva', texto: 'De color (como BBVA)' }]} />
          <label className="casilla"><input type="checkbox" checked={d.cierre} onChange={(e) => poner('cierre', e.target.checked)} /> Lámina de cierre</label>
        </div>
      </fieldset>
      <ErrorDe error={guardar.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={guardar.isPending}>Guardar tema</Boton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Plantillas de proceso

function PestanaPlantillas() {
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: ['catalogo', 'plantillas'], queryFn: api.plantillas });
  const [editando, setEditando] = useState<Plantilla | null>(null);
  const refrescar = () => cliente.invalidateQueries({ queryKey: ['catalogo', 'plantillas'] });
  const cambiar = useMutation({ mutationFn: ({ id, activo }: { id: string; activo: boolean }) => api.cambiarPlantilla(id, { activo }), onSettled: refrescar });
  const borrar = useMutation({ mutationFn: api.borrarPlantilla, onSettled: refrescar });

  return (
    <section>
      <p className="sutil">
        Al crear un proceso en un proyecto se puede partir de una plantilla activa. Se crean desde una revisión:
        en el proceso, botón <strong>Guardar como plantilla</strong>. Se quitan el cliente, las personas de la gobernanza,
        el historial de cambios de la ficha y los valores medidos; revisa que los textos no nombren al cliente.
      </p>
      <ErrorDe error={cambiar.error ?? borrar.error} />
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : consulta.data.plantillas.length === 0 ? (
        <Vacio>Todavía no hay plantillas. Abre un proceso y usa «Guardar como plantilla» en una de sus revisiones.</Vacio>
      ) : (
        <table className="tabla">
          <thead><tr><th>Plantilla</th><th>Industria</th><th>Elementos</th><th>Creada por</th><th>Actualizada</th><th><span className="solo-lector">Acciones</span></th></tr></thead>
          <tbody>
            {consulta.data.plantillas.map((p) => (
              <tr key={p.id} className={p.activo ? '' : 'inactivo'}>
                <td>
                  <strong>{p.nombre}</strong> {!p.activo && <Etiqueta tono="aviso">Oculta</Etiqueta>}
                  {p.descripcion && <><br /><small className="sutil">{p.descripcion}</small></>}
                </td>
                <td>{p.industria || <span className="sutil">—</span>}</td>
                <td>{p.nodos}</td>
                <td>{p.autor ?? <span className="sutil">—</span>}</td>
                <td className="fecha">{fecha(p.actualizadoEn)}</td>
                <td className="celda-acciones">
                  <Boton variante="sutil" onClick={() => setEditando(p)}>Editar</Boton>
                  <Boton variante="sutil" onClick={() => cambiar.mutate({ id: p.id, activo: !p.activo })}>{p.activo ? 'Ocultar' : 'Mostrar'}</Boton>
                  <Boton variante="sutil" onClick={() => { if (confirm(`¿Eliminar la plantilla ${p.nombre}? Los procesos creados con ella no cambian.`)) borrar.mutate(p.id); }}>Eliminar</Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Dialogo abierto={!!editando} titulo={editando ? `Plantilla ${editando.nombre}` : ''} onCerrar={() => setEditando(null)}>
        {editando && <FormPlantilla plantilla={editando} onCerrar={() => { setEditando(null); refrescar(); }} />}
      </Dialogo>
    </section>
  );
}

function FormPlantilla({ plantilla, onCerrar }: { plantilla: Plantilla; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(plantilla.nombre);
  const [industria, setIndustria] = useState(plantilla.industria);
  const [descripcion, setDescripcion] = useState(plantilla.descripcion);
  const guardar = useMutation({ mutationFn: () => api.cambiarPlantilla(plantilla.id, { nombre, industria, descripcion }), onSuccess: onCerrar });
  const enviar = (e: FormEvent) => { e.preventDefault(); guardar.mutate(); };
  return (
    <form onSubmit={enviar}>
      <Campo etiqueta="Nombre" required maxLength={160} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo etiqueta="Industria" maxLength={80} value={industria} onChange={(e) => setIndustria(e.target.value)} />
      <AreaTexto etiqueta="Descripción" maxLength={600} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <ErrorDe error={guardar.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={guardar.isPending}>Guardar</Boton>
      </div>
    </form>
  );
}
