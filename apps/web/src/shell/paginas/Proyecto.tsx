// Un proyecto: sus procesos, sus miembros y sus ajustes.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { api, type Miembro, type Proyecto as TProyecto, type RolProyecto } from '../api';
import { enEditor } from '../formato';
import { useT, type TraductorShell } from '../i18n';
import { puede } from '../permisos';
import { useUsuario } from '../sesion';
import {
  AreaTexto, Aviso, Boton, Campo, Cargando, Dialogo, EnlaceEditor, ErrorDe, Etiqueta, Insignia, Selector, Vacio, useTitulo
} from '../ui';

const opcionesRol = (t: TraductorShell) => (['propietario', 'editor', 'revisor', 'lector'] as RolProyecto[])
  .map((r) => ({ valor: r, texto: t.rolProyecto(r) }));

export function Proyecto({ id }: { id: string }) {
  const t = useT();
  const consulta = useQuery({ queryKey: ['proyecto', id], queryFn: () => api.proyecto(id) });
  useTitulo(consulta.data?.proyecto.nombre ?? t('comun.proyecto'));
  const [dialogo, setDialogo] = useState<null | 'proceso' | 'editar' | 'miembro'>(null);

  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) return <><Migas /><ErrorDe error={consulta.error} /></>;
  const { proyecto, miembros, procesos } = consulta.data;
  const escribe = puede(proyecto.rol, 'escribir') && !proyecto.archivado;
  const administra = puede(proyecto.rol, 'administrar');
  const cerrar = () => setDialogo(null);

  return (
    <>
      <Migas nombre={proyecto.nombre} />
      <div className="encabezado">
        <div>
          <h1>{proyecto.nombre} {proyecto.archivado && <Etiqueta tono="aviso">{t('comun.archivado')}</Etiqueta>}</h1>
          {proyecto.cliente && <p className="cliente">{proyecto.cliente}</p>}
          {proyecto.descripcion && <p className="sutil descripcion">{proyecto.descripcion}</p>}
          <p className="sutil">{t.rico('proyecto.tuRol', { rol: t.rolProyecto(proyecto.rol) })}</p>
        </div>
        <div className="acciones">
          {administra && <Boton onClick={() => setDialogo('editar')}>{t('proyecto.ajustes')}</Boton>}
          {escribe && <Boton variante="primario" onClick={() => setDialogo('proceso')}>{t('proyecto.nuevoProceso')}</Boton>}
        </div>
      </div>
      {proyecto.archivado && <Aviso tipo="atencion">{t('proyecto.archivadoAviso')}</Aviso>}

      <section aria-labelledby="t-procesos">
        <h2 id="t-procesos">{t('proyecto.procesos')}</h2>
        {procesos.length === 0 ? (
          <Vacio>{escribe ? t('proyecto.sinProcesosEscribe') : t('proyecto.sinProcesos')}</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>{t('comun.proceso')}</th><th>{t('proyecto.ultimaRevision')}</th><th>{t('proyecto.actualizado')}</th>
                <th><span className="solo-lector">{t('comun.acciones')}</span></th>
              </tr>
            </thead>
            <tbody>
              {procesos.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/proceso/${p.id}`}>{p.nombre}</Link></td>
                  <td>{p.ultimaRevision ? <>v{p.ultimaRevision.numero} <Insignia estado={p.ultimaRevision.estado} /></> : <span className="sutil">{t('proyecto.sinRevisiones')}</span>}</td>
                  <td className="fecha">{t.fecha(p.actualizadoEn)}</td>
                  <td className="celda-acciones">
                    <EnlaceEditor className="boton boton-sutil" href={enEditor.proceso(p.id)}>{t('comun.abrirEnEditor')}</EnlaceEditor>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="t-miembros">
        <div className="encabezado-seccion">
          <h2 id="t-miembros">{t('proyecto.miembros')}</h2>
          {administra && !proyecto.archivado && <Boton variante="sutil" onClick={() => setDialogo('miembro')}>{t('proyecto.anadirMiembro')}</Boton>}
        </div>
        <Miembros proyecto={proyecto} miembros={miembros} editable={administra && !proyecto.archivado} />
      </section>

      <Dialogo abierto={dialogo === 'proceso'} titulo={t('proyecto.nuevoProceso')} onCerrar={cerrar}>
        <NuevoProceso proyectoId={proyecto.id} onCerrar={cerrar} />
      </Dialogo>
      <Dialogo abierto={dialogo === 'editar'} titulo={t('proyecto.ajustesTitulo')} onCerrar={cerrar}>
        <EditarProyecto proyecto={proyecto} onCerrar={cerrar} />
      </Dialogo>
      <Dialogo abierto={dialogo === 'miembro'} titulo={t('proyecto.anadirMiembro')} onCerrar={cerrar}>
        <AnadirMiembro proyectoId={proyecto.id} miembros={miembros} onCerrar={cerrar} />
      </Dialogo>
    </>
  );
}

function Migas({ nombre }: { nombre?: string }) {
  const t = useT();
  return (
    <nav className="migas" aria-label={t('comun.ruta')}>
      <Link href="/">{t('comun.proyectos')}</Link>{nombre && <> <span aria-hidden="true">›</span> <span>{nombre}</span></>}
    </nav>
  );
}

function Miembros({ proyecto, miembros, editable }: { proyecto: TProyecto; miembros: Miembro[]; editable: boolean }) {
  const t = useT();
  const usuario = useUsuario();
  const cliente = useQueryClient();
  const refrescar = () => cliente.invalidateQueries({ queryKey: ['proyecto', proyecto.id] });
  const cambiarRol = useMutation({
    mutationFn: ({ usuarioId, rol }: { usuarioId: string; rol: RolProyecto }) => api.ponerMiembro(proyecto.id, usuarioId, rol),
    onSettled: refrescar
  });
  const quitar = useMutation({
    mutationFn: (usuarioId: string) => api.quitarMiembro(proyecto.id, usuarioId),
    onSettled: refrescar
  });
  return (
    <>
      <ErrorDe error={cambiarRol.error ?? quitar.error} />
      <table className="tabla">
        <thead>
          <tr>
            <th>{t('comun.nombre')}</th><th>{t('comun.correo')}</th><th>{t('comun.rol')}</th>
            {editable && <th><span className="solo-lector">{t('comun.acciones')}</span></th>}
          </tr>
        </thead>
        <tbody>
          {miembros.map((m) => (
            <tr key={m.usuarioId}>
              <td>{m.nombre}{m.usuarioId === usuario.id && <span className="sutil"> {t('comun.tu')}</span>}</td>
              <td>{m.email}</td>
              <td>
                {editable ? (
                  <Selector aria-label={t('comun.rolDe', { nombre: m.nombre })} opciones={opcionesRol(t)} value={m.rol}
                    onChange={(e) => cambiarRol.mutate({ usuarioId: m.usuarioId, rol: e.target.value as RolProyecto })} />
                ) : t.rolProyecto(m.rol)}
              </td>
              {editable && (
                <td className="celda-acciones">
                  <Boton variante="sutil" onClick={() => { if (confirm(t('proyecto.quitarConfirmar', { nombre: m.nombre }))) quitar.mutate(m.usuarioId); }}>{t('comun.quitar')}</Boton>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {usuario.rol === 'admin' && !miembros.some((m) => m.usuarioId === usuario.id) && (
        <p className="sutil">{t('proyecto.adminNoMiembro')}</p>
      )}
    </>
  );
}

function AnadirMiembro({ proyectoId, miembros, onCerrar }: { proyectoId: string; miembros: Miembro[]; onCerrar: () => void }) {
  const t = useT();
  const cliente = useQueryClient();
  const directorio = useQuery({ queryKey: ['directorio'], queryFn: api.directorio });
  const candidatos = (directorio.data?.usuarios ?? []).filter((u) => !miembros.some((m) => m.usuarioId === u.id));
  const [usuarioId, setUsuarioId] = useState('');
  const [rol, setRol] = useState<RolProyecto>('editor');
  const anadir = useMutation({
    mutationFn: () => api.ponerMiembro(proyectoId, usuarioId || candidatos[0]!.id, rol),
    onSuccess: () => { cliente.invalidateQueries({ queryKey: ['proyecto', proyectoId] }); onCerrar(); }
  });
  if (directorio.isPending) return <Cargando />;
  if (directorio.isError) return <ErrorDe error={directorio.error} />;
  if (candidatos.length === 0) {
    return <><Vacio>{t('proyecto.todosMiembros')}</Vacio>
      <div className="acciones"><Boton onClick={onCerrar}>{t('comun.cerrar')}</Boton></div></>;
  }
  const enviar = (e: FormEvent) => { e.preventDefault(); anadir.mutate(); };
  return (
    <form onSubmit={enviar}>
      <Selector etiqueta={t('proyecto.persona')} value={usuarioId || candidatos[0]!.id} onChange={(e) => setUsuarioId(e.target.value)}
        opciones={candidatos.map((u) => ({ valor: u.id, texto: `${u.nombre} (${u.email})` }))} />
      <Selector etiqueta={t('proyecto.rolEnProyecto')} value={rol} onChange={(e) => setRol(e.target.value as RolProyecto)} opciones={opcionesRol(t)} />
      <p className="sutil">{t('proyecto.explicacionRoles')}</p>
      <ErrorDe error={anadir.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={anadir.isPending}>{t('comun.anadir')}</Boton>
      </div>
    </form>
  );
}

type Origen = 'vacio' | 'plantilla' | 'archivo';

function NuevoProceso({ proyectoId, onCerrar }: { proyectoId: string; onCerrar: () => void }) {
  const t = useT();
  const [, navegar] = useLocation();
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [origen, setOrigen] = useState<Origen>('vacio');
  const [plantillaId, setPlantillaId] = useState('');
  const [archivo, setArchivo] = useState<{ nombre: string; contenido: unknown } | null>(null);
  const [errorArchivo, setErrorArchivo] = useState(false);
  const plantillas = useQuery({ queryKey: ['plantillas'], queryFn: api.plantillas });
  const activas = (plantillas.data?.plantillas ?? []).filter((p) => p.activo);
  const elegida = activas.find((p) => p.id === plantillaId) ?? activas[0];

  const leer = async (f: File | undefined) => {
    setErrorArchivo(false);
    setArchivo(null);
    if (!f) return;
    try {
      const contenido: unknown = JSON.parse(await f.text());
      setArchivo({ nombre: f.name, contenido });
      const meta = (contenido as { meta?: { name?: unknown } })?.meta;
      if (!nombre && typeof meta?.name === 'string') setNombre(meta.name);
    } catch {
      setErrorArchivo(true);
    }
  };

  const crear = useMutation({
    mutationFn: () => api.crearProceso(proyectoId,
      origen === 'archivo' && archivo ? { nombre, contenido: archivo.contenido, mensaje: t('comun.importadoDe', { archivo: archivo.nombre }) }
        : origen === 'plantilla' && elegida ? { nombre, plantillaId: elegida.id }
          : { nombre }),
    onSuccess: ({ proceso }) => {
      cliente.invalidateQueries({ queryKey: ['proyecto', proyectoId] });
      onCerrar();
      navegar(`/proceso/${proceso.id}`);
    }
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); crear.mutate(); };

  return (
    <form onSubmit={enviar}>
      <Selector etiqueta={t('comun.partirDe')} value={origen} onChange={(e) => { setOrigen(e.target.value as Origen); setErrorArchivo(false); }}
        opciones={[
          { valor: 'vacio', texto: t('proyecto.origenVacio') },
          ...(activas.length ? [{ valor: 'plantilla', texto: t('proyecto.origenPlantilla') }] : []),
          { valor: 'archivo', texto: t('proyecto.origenArchivo') }
        ]} />
      {origen === 'vacio' && <p className="sutil">{t('proyecto.naceVacio')}</p>}
      {origen === 'plantilla' && elegida && (
        <>
          <Selector etiqueta={t('proyecto.plantilla')} value={elegida.id} onChange={(e) => setPlantillaId(e.target.value)}
            opciones={activas.map((p) => ({ valor: p.id, texto: `${p.nombre}${p.industria ? ` · ${p.industria}` : ''} (${t('comun.elementos', { n: p.nodos })})` }))} />
          {elegida.descripcion && <p className="sutil">{elegida.descripcion}</p>}
          <p className="sutil">{t('proyecto.copiaPlantilla')}</p>
        </>
      )}
      {origen === 'archivo' && (
        <div className="campo">
          <label htmlFor="archivo-proceso">{t('proyecto.archivoJson')}</label>
          <input id="archivo-proceso" type="file" accept=".json,application/json" onChange={(e) => leer(e.target.files?.[0])} />
        </div>
      )}
      {errorArchivo && <Aviso tipo="error">{t('proyecto.jsonInvalido')}</Aviso>}
      <Campo etiqueta={t('proyecto.nombreProceso')} required maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}
          disabled={errorArchivo || (origen === 'archivo' && !archivo)}>{t('proyecto.crearProceso')}</Boton>
      </div>
    </form>
  );
}

function EditarProyecto({ proyecto, onCerrar }: { proyecto: TProyecto; onCerrar: () => void }) {
  const t = useT();
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState(proyecto.nombre);
  const [clienteProyecto, setClienteProyecto] = useState(proyecto.cliente);
  const [descripcion, setDescripcion] = useState(proyecto.descripcion);
  const refrescar = () => {
    cliente.invalidateQueries({ queryKey: ['proyecto', proyecto.id] });
    cliente.invalidateQueries({ queryKey: ['proyectos'] });
  };
  const guardar = useMutation({
    mutationFn: () => api.cambiarProyecto(proyecto.id, { nombre, cliente: clienteProyecto, descripcion }),
    onSuccess: () => { refrescar(); onCerrar(); }
  });
  const archivar = useMutation({
    mutationFn: () => api.cambiarProyecto(proyecto.id, { archivado: !proyecto.archivado }),
    onSuccess: () => { refrescar(); onCerrar(); }
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); guardar.mutate(); };
  return (
    <form onSubmit={enviar}>
      <Campo etiqueta={t('comun.nombre')} required maxLength={160} value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={proyecto.archivado} />
      <Campo etiqueta={t('comun.cliente')} maxLength={160} value={clienteProyecto} onChange={(e) => setClienteProyecto(e.target.value)} disabled={proyecto.archivado} />
      <AreaTexto etiqueta={t('comun.descripcion')} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={proyecto.archivado} />
      <ErrorDe error={guardar.error ?? archivar.error} />
      <div className="acciones acciones-separadas">
        <Boton variante={proyecto.archivado ? 'secundario' : 'peligro'} cargando={archivar.isPending}
          onClick={() => { if (proyecto.archivado || confirm(t('proyecto.archivarConfirmar'))) archivar.mutate(); }}>
          {proyecto.archivado ? t('proyecto.reactivar') : t('proyecto.archivar')}
        </Boton>
        <span>
          <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
          {!proyecto.archivado && <Boton type="submit" variante="primario" cargando={guardar.isPending}>{t('comun.guardar')}</Boton>}
        </span>
      </div>
    </form>
  );
}
