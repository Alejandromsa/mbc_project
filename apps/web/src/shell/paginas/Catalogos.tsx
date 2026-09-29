// Catálogos de la organización (solo administradores): KPIs, verbos del
// Playbook, temas PPTX de cliente y plantillas de proceso. Los usa el editor
// en los procesos de proyectos; el editor libre sigue con los del MVP.
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DefinicionTema, type KpiAdmin, type Plantilla, type TemaAdmin } from '../api';
import { useT, type TraductorShell } from '../i18n';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Dialogo, ErrorDe, Etiqueta, Selector, Vacio, useTitulo } from '../ui';

type Pestana = 'kpis' | 'verbos' | 'temas' | 'plantillas';

export function Catalogos() {
  const t = useT();
  useTitulo(t('catalogos.titulo'));
  const [pestana, setPestana] = useState<Pestana>('kpis');
  const pestanas: [Pestana, string][] = [
    ['kpis', t('catalogos.pestanaKpis')], ['verbos', t('catalogos.pestanaVerbos')],
    ['temas', t('catalogos.pestanaTemas')], ['plantillas', t('catalogos.pestanaPlantillas')]
  ];
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('catalogos.titulo')}</h1>
          <p className="sutil">{t('catalogos.intro')}</p>
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
  const t = useT();
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
        <Selector aria-label={t('comun.industria')} value={industria} onChange={(e) => setIndustria(e.target.value)}
          opciones={[{ valor: '', texto: t('catalogos.todasIndustrias') }, ...industrias.map((i) => ({ valor: i, texto: i }))]} />
        <input type="search" className="busqueda" placeholder={t('catalogos.buscarKpiEjemplo')} aria-label={t('catalogos.buscarKpi')} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <span className="sutil">{t('comun.xDeY', { a: lista.length, b: todos.length })}</span>
        <Boton variante="primario" onClick={() => setEditando('nuevo')}>{t('catalogos.nuevoKpi')}</Boton>
      </div>
      <ErrorDe error={cambiar.error} />
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : lista.length === 0 ? <Vacio>{t('catalogos.ningunKpi')}</Vacio> : (
        <table className="tabla tabla-compacta">
          <thead>
            <tr>
              <th>{t('catalogos.kpi')}</th><th>{t('comun.industria')}</th><th>{t('catalogos.macroproceso')}</th><th>{t('catalogos.unidad')}</th>
              <th>{t('catalogos.referencia')}</th><th>{t('comun.estado')}</th><th><span className="solo-lector">{t('comun.acciones')}</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((k) => (
              <tr key={k.id} className={k.activo ? '' : 'inactivo'}>
                <td><strong>{k.nombre}</strong><br /><small className="sutil">{k.codigo}</small></td>
                <td>{k.industria}</td>
                <td>{k.macroproceso || '—'}</td>
                <td>{k.unidad}</td>
                <td>{k.benchmark}</td>
                <td>{k.activo ? t('catalogos.activo') : <Etiqueta tono="aviso">{t('catalogos.desactivado')}</Etiqueta>}</td>
                <td className="celda-acciones">
                  <Boton variante="sutil" onClick={() => setEditando(k)}>{t('comun.editar')}</Boton>
                  <Boton variante="sutil" disabled={cambiar.isPending} onClick={() => cambiar.mutate({ id: k.id, activo: !k.activo })}>
                    {k.activo ? t('catalogos.desactivar') : t('catalogos.activar')}
                  </Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Dialogo abierto={!!editando} titulo={editando === 'nuevo' ? t('catalogos.nuevoKpi') : t('catalogos.editarKpi')} onCerrar={() => setEditando(null)}>
        {editando && <FormKpi kpi={editando === 'nuevo' ? null : editando} industrias={industrias} onCerrar={() => setEditando(null)} />}
      </Dialogo>
    </section>
  );
}

function FormKpi({ kpi, industrias, onCerrar }: { kpi: KpiAdmin | null; industrias: string[]; onCerrar: () => void }) {
  const t = useT();
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
      <Campo etiqueta={t('comun.nombre')} required maxLength={160} autoFocus {...campo('nombre')} />
      <div className="fila-campos">
        <Campo etiqueta={t('comun.industria')} required maxLength={80} list="industrias-kpi" {...campo('industria')} />
        <Campo etiqueta={t('catalogos.macroproceso')} maxLength={80} {...campo('macroproceso')} />
      </div>
      <datalist id="industrias-kpi">{industrias.map((i) => <option key={i} value={i} />)}</datalist>
      <div className="fila-campos">
        <Campo etiqueta={t('catalogos.unidad')} maxLength={40} placeholder={t('catalogos.unidadEjemplo')} {...campo('unidad')} />
        <Campo etiqueta={t('catalogos.referenciaBenchmark')} maxLength={120} {...campo('benchmark')} />
      </div>
      <AreaTexto etiqueta={t('comun.descripcion')} maxLength={600} {...campo('descripcion')} />
      {kpi && <p className="sutil">{t.rico('catalogos.codigoKpi', { codigo: kpi.codigo })}</p>}
      <ErrorDe error={guardar.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={guardar.isPending}>{kpi ? t('comun.guardar') : t('catalogos.crearKpi')}</Boton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Verbos

function PestanaVerbos() {
  const t = useT();
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
      <p className="sutil">{t.rico('catalogos.verbosIntro')}</p>
      <ErrorDe error={poner.error ?? quitar.error} />
      <h2>{t('catalogos.prohibidos', { n: prohibidos.length })}</h2>
      <table className="tabla tabla-compacta">
        <thead><tr><th>{t('catalogos.verbo')}</th><th>{t('catalogos.motivoConsultor')}</th><th><span className="solo-lector">{t('comun.acciones')}</span></th></tr></thead>
        <tbody>
          {prohibidos.map((v) => (
            <tr key={v.verbo}>
              <td><strong>{v.verbo}</strong></td>
              <td>{v.motivo}</td>
              <td className="celda-acciones">
                <Boton variante="sutil" onClick={() => setProhibido({ verbo: v.verbo, motivo: v.motivo })}>{t('comun.editar')}</Boton>
                <Boton variante="sutil" onClick={() => poner.mutate({ verbo: v.verbo, tipo: 'permitido' })}>{t('catalogos.permitir')}</Boton>
                <Boton variante="sutil" onClick={() => quitar.mutate(v.verbo)}>{t('comun.quitar')}</Boton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="fila-alta" onSubmit={(e) => { e.preventDefault(); poner.mutate({ verbo: prohibido.verbo, tipo: 'prohibido', motivo: prohibido.motivo }, { onSuccess: () => setProhibido({ verbo: '', motivo: '' }) }); }}>
        <input aria-label={t('catalogos.verboProhibido')} placeholder={t('catalogos.verboEjemplo')} value={prohibido.verbo} onChange={(e) => setProhibido({ ...prohibido, verbo: e.target.value })} required />
        <input aria-label={t('catalogos.motivo')} placeholder={t('catalogos.motivoEjemplo')} className="ancho" value={prohibido.motivo} onChange={(e) => setProhibido({ ...prohibido, motivo: e.target.value })} required />
        <Boton type="submit" variante="primario" cargando={poner.isPending}>{t('catalogos.prohibir')}</Boton>
      </form>

      <h2>{t('catalogos.permitidos', { n: permitidos.length })}</h2>
      <ul className="chips">
        {permitidos.map((v) => (
          <li key={v.verbo}>
            {v.verbo}
            <button type="button" aria-label={t('catalogos.quitarVerbo', { verbo: v.verbo })} onClick={() => quitar.mutate(v.verbo)}>×</button>
          </li>
        ))}
      </ul>
      <form className="fila-alta" onSubmit={(e) => { e.preventDefault(); poner.mutate({ verbo: nuevoPermitido, tipo: 'permitido' }, { onSuccess: () => setNuevoPermitido('') }); }}>
        <input aria-label={t('catalogos.verboPermitido')} placeholder={t('catalogos.verboPermitidoEjemplo')} value={nuevoPermitido} onChange={(e) => setNuevoPermitido(e.target.value)} required />
        <Boton type="submit" cargando={poner.isPending}>{t('comun.anadir')}</Boton>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- Temas PPTX

const colores = (t: TraductorShell): [keyof DefinicionTema, string][] => [
  ['dk1', t('catalogos.colorDk1')], ['acento', t('catalogos.colorAcento')], ['lt2', t('catalogos.colorLt2')], ['arena', t('catalogos.colorArena')],
  ['gris', t('catalogos.colorGris')], ['antetitulo', t('catalogos.colorAntetitulo')], ['sep', t('catalogos.colorSep')], ['chipRol', t('catalogos.colorChipRol')],
  ['teal', t('catalogos.colorTeal')], ['rosa', t('catalogos.colorRosa')], ['verde', t('catalogos.colorVerde')], ['circulo', t('catalogos.colorCirculo')],
  ['portadaFondo', t('catalogos.colorPortadaFondo')], ['portadaTexto', t('catalogos.colorPortadaTexto')], ['portadaSub', t('catalogos.colorPortadaSub')]
];

/** Los temas del sistema (MBC, BBVA) para duplicarlos: se cargan solo en esta pantalla. */
async function temasBase(): Promise<Record<string, DefinicionTema>> {
  const { TEMAS_PPTX } = await import('@processiq/exportar');
  return TEMAS_PPTX as unknown as Record<string, DefinicionTema>;
}

function PestanaTemas() {
  const t = useT();
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
        <p className="sutil">{t.rico('catalogos.temasIntro')}</p>
        <Boton variante="primario" onClick={() => setCreando(true)}>{t('catalogos.nuevoTema')}</Boton>
      </div>
      <ErrorDe error={cambiar.error ?? borrar.error} />
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : consulta.data.temas.length === 0 ? (
        <Vacio>{t('catalogos.sinTemas')}</Vacio>
      ) : (
        <ul className="rejilla-tarjetas">
          {consulta.data.temas.map((tema) => (
            <li key={tema.id} className={`tarjeta tema ${tema.activo ? '' : 'inactivo'}`}>
              <div className="tema-muestra" style={{ background: `#${tema.definicion.portadaFondo}`, color: `#${tema.definicion.portadaTexto}`, fontFamily: tema.definicion.fontTitulo }}>
                <img src={tema.definicion.logoInv} alt="" />
                <span>{tema.definicion.nombre}</span>
              </div>
              <div className="paleta">{(['dk1', 'acento', 'gris', 'sep', 'chipRol', 'arena'] as const).map((k) => <span key={k} style={{ background: `#${tema.definicion[k]}` }} title={k} />)}</div>
              <p><strong>{tema.nombre}</strong> <code>{tema.clave}</code> {!tema.activo && <Etiqueta tono="aviso">{t('catalogos.oculto')}</Etiqueta>}</p>
              <div className="acciones">
                <Boton variante="sutil" onClick={() => setEditando(tema)}>{t('comun.editar')}</Boton>
                <Boton variante="sutil" onClick={() => cambiar.mutate({ id: tema.id, activo: !tema.activo })}>{tema.activo ? t('catalogos.ocultar') : t('catalogos.mostrar')}</Boton>
                <Boton variante="sutil" onClick={() => { if (confirm(t('catalogos.eliminarTema', { nombre: tema.nombre }))) borrar.mutate(tema.id); }}>{t('comun.eliminar')}</Boton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialogo abierto={creando} titulo={t('catalogos.nuevoTemaTitulo')} onCerrar={() => setCreando(false)}>
        <NuevoTema onCreado={(tema) => { setCreando(false); refrescar(); setEditando(tema); }} onCerrar={() => setCreando(false)} />
      </Dialogo>
      <Dialogo ancho abierto={!!editando} titulo={editando ? t('catalogos.temaTitulo', { nombre: editando.nombre }) : ''} onCerrar={() => setEditando(null)}>
        {editando && <EditorTema tema={editando} onCerrar={() => { setEditando(null); refrescar(); }} />}
      </Dialogo>
    </section>
  );
}

function NuevoTema({ onCreado, onCerrar }: { onCreado: (t: TemaAdmin) => void; onCerrar: () => void }) {
  const t = useT();
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
      <Campo etiqueta={t('catalogos.nombreCliente')} required maxLength={60} autoFocus value={nombre}
        onChange={(e) => { setNombre(e.target.value); setClave(e.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)); }} />
      <Campo etiqueta={t('catalogos.clave')} required pattern="[a-z0-9-]{2,30}" value={clave} onChange={(e) => setClave(e.target.value)}
        ayuda={t('catalogos.claveAyuda')} />
      <Selector etiqueta={t('comun.partirDe')} value={base} onChange={(e) => setBase(e.target.value as 'mbc' | 'bbva')}
        opciones={[{ valor: 'mbc', texto: t('catalogos.baseMbc') }, { valor: 'bbva', texto: t('catalogos.baseBbva') }]} />
      <p className="sutil">{t('catalogos.despues')}</p>
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}>{t('catalogos.crearYEditar')}</Boton>
      </div>
    </form>
  );
}

function leerImagen(archivo: File, t: TraductorShell): Promise<string> {
  return new Promise((resolver, rechazar) => {
    if (!/^image\/(png|jpeg)$/.test(archivo.type)) { rechazar(new Error(t('catalogos.imagenTipo'))); return; }
    if (archivo.size > 1_400_000) { rechazar(new Error(t('catalogos.imagenPesada'))); return; }
    const r = new FileReader();
    r.onload = () => resolver(String(r.result));
    r.onerror = () => rechazar(new Error(t('catalogos.imagenIlegible')));
    r.readAsDataURL(archivo);
  });
}

function EditorTema({ tema, onCerrar }: { tema: TemaAdmin; onCerrar: () => void }) {
  const t = useT();
  const [d, setD] = useState<DefinicionTema>(tema.definicion);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);
  const poner = <K extends keyof DefinicionTema>(k: K, v: DefinicionTema[K]) => setD((x) => ({ ...x, [k]: v }));
  const guardar = useMutation({ mutationFn: () => api.cambiarTema(tema.id, { definicion: d }), onSuccess: onCerrar });
  const imagen = (k: 'logo' | 'logoInv' | 'foto') => async (f: File | undefined) => {
    setErrorImagen(null);
    if (!f) return;
    try { poner(k, await leerImagen(f, t)); } catch (e) { setErrorImagen((e as Error).message); }
  };
  const enviar = (e: FormEvent) => { e.preventDefault(); guardar.mutate(); };
  const imagenes = [['logo', t('catalogos.logo')], ['logoInv', t('catalogos.logoInv')], ['foto', t('catalogos.foto')]] as const;

  return (
    <form onSubmit={enviar} className="editor-tema">
      <div className="fila-campos">
        <Campo etiqueta={t('comun.nombre')} required maxLength={60} value={d.nombre} onChange={(e) => poner('nombre', e.target.value)} />
        <Campo etiqueta={t('catalogos.pie')} maxLength={60} value={d.pie} onChange={(e) => poner('pie', e.target.value)} />
      </div>
      <Campo etiqueta={t('catalogos.autor')} maxLength={120} value={d.autor} onChange={(e) => poner('autor', e.target.value)} />
      <fieldset>
        <legend>{t('catalogos.colores')}</legend>
        <div className="rejilla-colores">
          {colores(t).map(([k, texto]) => (
            <label key={k} className="color">
              <input type="color" value={`#${String(d[k])}`} onChange={(e) => poner(k, e.target.value.slice(1).toUpperCase() as never)} />
              <span>{texto}<small>#{String(d[k])}</small></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('catalogos.tipografias')}</legend>
        <div className="fila-campos">
          <Campo etiqueta={t('catalogos.texto')} required maxLength={60} value={d.font} onChange={(e) => poner('font', e.target.value)} ayuda={t('catalogos.textoAyuda')} />
          <Campo etiqueta={t('catalogos.titulos')} required maxLength={60} value={d.fontTitulo} onChange={(e) => poner('fontTitulo', e.target.value)} />
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('catalogos.logotipos')}</legend>
        <div className="rejilla-imagenes">
          {imagenes.map(([k, texto]) => (
            <div key={k} className="campo">
              <label htmlFor={`img-${k}`}>{texto}</label>
              <div className={`vista-imagen ${k === 'logoInv' ? 'oscura' : ''}`} style={k === 'logoInv' ? { background: `#${d.portadaFondo}` } : undefined}>
                {d[k] ? <img src={d[k]} alt="" /> : <span className="sutil">{t('catalogos.sinImagen')}</span>}
              </div>
              <input id={`img-${k}`} type="file" accept="image/png,image/jpeg" onChange={(e) => imagen(k)(e.target.files?.[0])} />
              {k === 'foto' && d.foto && <Boton variante="sutil" onClick={() => setD(({ foto: _f, ...resto }) => resto)}>{t('catalogos.quitarFoto')}</Boton>}
            </div>
          ))}
        </div>
        {errorImagen && <Aviso tipo="error">{errorImagen}</Aviso>}
        <div className="fila-campos">
          <Campo etiqueta={t('catalogos.anchoLogo')} type="number" step="0.01" min="0.1" max="6" value={d.logoW} onChange={(e) => poner('logoW', Number(e.target.value))} />
          <Campo etiqueta={t('catalogos.altoLogo')} type="number" step="0.01" min="0.1" max="3" value={d.logoH} onChange={(e) => poner('logoH', Number(e.target.value))} />
        </div>
        <div className="fila-campos">
          <Selector etiqueta={t('catalogos.estiloCaratula')} value={d.portada} onChange={(e) => poner('portada', e.target.value as 'mbc' | 'bbva')}
            opciones={[{ valor: 'mbc', texto: t('catalogos.caratulaFoto') }, { valor: 'bbva', texto: t('catalogos.caratulaColor') }]} />
          <label className="casilla"><input type="checkbox" checked={d.cierre} onChange={(e) => poner('cierre', e.target.checked)} /> {t('catalogos.laminaCierre')}</label>
        </div>
      </fieldset>
      <ErrorDe error={guardar.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={guardar.isPending}>{t('catalogos.guardarTema')}</Boton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Plantillas de proceso

function PestanaPlantillas() {
  const t = useT();
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: ['catalogo', 'plantillas'], queryFn: api.plantillas });
  const [editando, setEditando] = useState<Plantilla | null>(null);
  const refrescar = () => cliente.invalidateQueries({ queryKey: ['catalogo', 'plantillas'] });
  const cambiar = useMutation({ mutationFn: ({ id, activo }: { id: string; activo: boolean }) => api.cambiarPlantilla(id, { activo }), onSettled: refrescar });
  const borrar = useMutation({ mutationFn: api.borrarPlantilla, onSettled: refrescar });

  return (
    <section>
      <p className="sutil">{t.rico('catalogos.plantillasIntro')}</p>
      <ErrorDe error={cambiar.error ?? borrar.error} />
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : consulta.data.plantillas.length === 0 ? (
        <Vacio>{t('catalogos.sinPlantillas')}</Vacio>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>{t('catalogos.plantilla')}</th><th>{t('comun.industria')}</th><th>{t('catalogos.elementos')}</th>
              <th>{t('catalogos.creadaPor')}</th><th>{t('catalogos.actualizada')}</th><th><span className="solo-lector">{t('comun.acciones')}</span></th>
            </tr>
          </thead>
          <tbody>
            {consulta.data.plantillas.map((p) => (
              <tr key={p.id} className={p.activo ? '' : 'inactivo'}>
                <td>
                  <strong>{p.nombre}</strong> {!p.activo && <Etiqueta tono="aviso">{t('catalogos.oculta')}</Etiqueta>}
                  {p.descripcion && <><br /><small className="sutil">{p.descripcion}</small></>}
                </td>
                <td>{p.industria || <span className="sutil">—</span>}</td>
                <td>{p.nodos}</td>
                <td>{p.autor ?? <span className="sutil">—</span>}</td>
                <td className="fecha">{t.fecha(p.actualizadoEn)}</td>
                <td className="celda-acciones">
                  <Boton variante="sutil" onClick={() => setEditando(p)}>{t('comun.editar')}</Boton>
                  <Boton variante="sutil" onClick={() => cambiar.mutate({ id: p.id, activo: !p.activo })}>{p.activo ? t('catalogos.ocultar') : t('catalogos.mostrar')}</Boton>
                  <Boton variante="sutil" onClick={() => { if (confirm(t('catalogos.eliminarPlantilla', { nombre: p.nombre }))) borrar.mutate(p.id); }}>{t('comun.eliminar')}</Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Dialogo abierto={!!editando} titulo={editando ? t('catalogos.plantillaTitulo', { nombre: editando.nombre }) : ''} onCerrar={() => setEditando(null)}>
        {editando && <FormPlantilla plantilla={editando} onCerrar={() => { setEditando(null); refrescar(); }} />}
      </Dialogo>
    </section>
  );
}

function FormPlantilla({ plantilla, onCerrar }: { plantilla: Plantilla; onCerrar: () => void }) {
  const t = useT();
  const [nombre, setNombre] = useState(plantilla.nombre);
  const [industria, setIndustria] = useState(plantilla.industria);
  const [descripcion, setDescripcion] = useState(plantilla.descripcion);
  const guardar = useMutation({ mutationFn: () => api.cambiarPlantilla(plantilla.id, { nombre, industria, descripcion }), onSuccess: onCerrar });
  const enviar = (e: FormEvent) => { e.preventDefault(); guardar.mutate(); };
  return (
    <form onSubmit={enviar}>
      <Campo etiqueta={t('comun.nombre')} required maxLength={160} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo etiqueta={t('comun.industria')} maxLength={80} value={industria} onChange={(e) => setIndustria(e.target.value)} />
      <AreaTexto etiqueta={t('comun.descripcion')} maxLength={600} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <ErrorDe error={guardar.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={guardar.isPending}>{t('comun.guardar')}</Boton>
      </div>
    </form>
  );
}
