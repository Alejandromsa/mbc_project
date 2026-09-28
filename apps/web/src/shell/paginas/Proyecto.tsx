// Un proyecto: sus procesos, sus miembros y sus ajustes.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { api, type Miembro, type Proyecto as TProyecto, type RolProyecto } from '../api';
import { ROLES_PROYECTO, enEditor, fecha } from '../formato';
import { puede } from '../permisos';
import { useUsuario } from '../sesion';
import {
  AreaTexto, Aviso, Boton, Campo, Cargando, Dialogo, ErrorDe, Etiqueta, Insignia, Selector, Vacio, useTitulo
} from '../ui';

const OPCIONES_ROL = (['propietario', 'editor', 'revisor', 'lector'] as RolProyecto[])
  .map((r) => ({ valor: r, texto: ROLES_PROYECTO[r] }));

export function Proyecto({ id }: { id: string }) {
  const consulta = useQuery({ queryKey: ['proyecto', id], queryFn: () => api.proyecto(id) });
  useTitulo(consulta.data?.proyecto.nombre ?? 'Proyecto');
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
          <h1>{proyecto.nombre} {proyecto.archivado && <Etiqueta tono="aviso">Archivado</Etiqueta>}</h1>
          {proyecto.cliente && <p className="cliente">{proyecto.cliente}</p>}
          {proyecto.descripcion && <p className="sutil descripcion">{proyecto.descripcion}</p>}
          <p className="sutil">Tu rol: <strong>{ROLES_PROYECTO[proyecto.rol]}</strong></p>
        </div>
        <div className="acciones">
          {administra && <Boton onClick={() => setDialogo('editar')}>Ajustes</Boton>}
          {escribe && <Boton variante="primario" onClick={() => setDialogo('proceso')}>Nuevo proceso</Boton>}
        </div>
      </div>
      {proyecto.archivado && <Aviso tipo="atencion">Proyecto archivado: se puede consultar, pero no admite cambios.</Aviso>}

      <section aria-labelledby="t-procesos">
        <h2 id="t-procesos">Procesos</h2>
        {procesos.length === 0 ? (
          <Vacio>{escribe ? 'Sin procesos todavía. Crea uno vacío o importa el JSON exportado desde el editor.' : 'Sin procesos todavía.'}</Vacio>
        ) : (
          <table className="tabla">
            <thead><tr><th>Proceso</th><th>Última revisión</th><th>Actualizado</th><th><span className="solo-lector">Acciones</span></th></tr></thead>
            <tbody>
              {procesos.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/proceso/${p.id}`}>{p.nombre}</Link></td>
                  <td>{p.ultimaRevision ? <>v{p.ultimaRevision.numero} <Insignia estado={p.ultimaRevision.estado} /></> : <span className="sutil">Sin revisiones</span>}</td>
                  <td className="fecha">{fecha(p.actualizadoEn)}</td>
                  <td className="celda-acciones">
                    <a className="boton boton-sutil" href={enEditor.proceso(p.id)}>Abrir en el editor</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="t-miembros">
        <div className="encabezado-seccion">
          <h2 id="t-miembros">Miembros</h2>
          {administra && !proyecto.archivado && <Boton variante="sutil" onClick={() => setDialogo('miembro')}>Añadir miembro</Boton>}
        </div>
        <Miembros proyecto={proyecto} miembros={miembros} editable={administra && !proyecto.archivado} />
      </section>

      <Dialogo abierto={dialogo === 'proceso'} titulo="Nuevo proceso" onCerrar={cerrar}>
        <NuevoProceso proyectoId={proyecto.id} onCerrar={cerrar} />
      </Dialogo>
      <Dialogo abierto={dialogo === 'editar'} titulo="Ajustes del proyecto" onCerrar={cerrar}>
        <EditarProyecto proyecto={proyecto} onCerrar={cerrar} />
      </Dialogo>
      <Dialogo abierto={dialogo === 'miembro'} titulo="Añadir miembro" onCerrar={cerrar}>
        <AnadirMiembro proyectoId={proyecto.id} miembros={miembros} onCerrar={cerrar} />
      </Dialogo>
    </>
  );
}

function Migas({ nombre }: { nombre?: string }) {
  return (
    <nav className="migas" aria-label="Ruta">
      <Link href="/">Proyectos</Link>{nombre && <> <span aria-hidden="true">›</span> <span>{nombre}</span></>}
    </nav>
  );
}

function Miembros({ proyecto, miembros, editable }: { proyecto: TProyecto; miembros: Miembro[]; editable: boolean }) {
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
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th>{editable && <th><span className="solo-lector">Acciones</span></th>}</tr></thead>
        <tbody>
          {miembros.map((m) => (
            <tr key={m.usuarioId}>
              <td>{m.nombre}{m.usuarioId === usuario.id && <span className="sutil"> (tú)</span>}</td>
              <td>{m.email}</td>
              <td>
                {editable ? (
                  <Selector aria-label={`Rol de ${m.nombre}`} opciones={OPCIONES_ROL} value={m.rol}
                    onChange={(e) => cambiarRol.mutate({ usuarioId: m.usuarioId, rol: e.target.value as RolProyecto })} />
                ) : ROLES_PROYECTO[m.rol]}
              </td>
              {editable && (
                <td className="celda-acciones">
                  <Boton variante="sutil" onClick={() => { if (confirm(`¿Quitar a ${m.nombre} del proyecto?`)) quitar.mutate(m.usuarioId); }}>Quitar</Boton>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {usuario.rol === 'admin' && !miembros.some((m) => m.usuarioId === usuario.id) && (
        <p className="sutil">Como administrador ves y gestionas todos los proyectos aunque no seas miembro.</p>
      )}
    </>
  );
}

function AnadirMiembro({ proyectoId, miembros, onCerrar }: { proyectoId: string; miembros: Miembro[]; onCerrar: () => void }) {
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
    return <><Vacio>Todas las cuentas activas ya son miembros. Un administrador puede crear cuentas nuevas.</Vacio>
      <div className="acciones"><Boton onClick={onCerrar}>Cerrar</Boton></div></>;
  }
  const enviar = (e: FormEvent) => { e.preventDefault(); anadir.mutate(); };
  return (
    <form onSubmit={enviar}>
      <Selector etiqueta="Persona" value={usuarioId || candidatos[0]!.id} onChange={(e) => setUsuarioId(e.target.value)}
        opciones={candidatos.map((u) => ({ valor: u.id, texto: `${u.nombre} (${u.email})` }))} />
      <Selector etiqueta="Rol en el proyecto" value={rol} onChange={(e) => setRol(e.target.value as RolProyecto)} opciones={OPCIONES_ROL} />
      <p className="sutil">Editor: guarda revisiones. Revisor: aprueba o devuelve. Lector: solo consulta. Propietario: todo, incluidos los miembros.</p>
      <ErrorDe error={anadir.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={anadir.isPending}>Añadir</Boton>
      </div>
    </form>
  );
}

type Origen = 'vacio' | 'plantilla' | 'archivo';

function NuevoProceso({ proyectoId, onCerrar }: { proyectoId: string; onCerrar: () => void }) {
  const [, navegar] = useLocation();
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [origen, setOrigen] = useState<Origen>('vacio');
  const [plantillaId, setPlantillaId] = useState('');
  const [archivo, setArchivo] = useState<{ nombre: string; contenido: unknown } | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const plantillas = useQuery({ queryKey: ['plantillas'], queryFn: api.plantillas });
  const activas = (plantillas.data?.plantillas ?? []).filter((p) => p.activo);
  const elegida = activas.find((p) => p.id === plantillaId) ?? activas[0];

  const leer = async (f: File | undefined) => {
    setErrorArchivo(null);
    setArchivo(null);
    if (!f) return;
    try {
      const contenido: unknown = JSON.parse(await f.text());
      setArchivo({ nombre: f.name, contenido });
      const meta = (contenido as { meta?: { name?: unknown } })?.meta;
      if (!nombre && typeof meta?.name === 'string') setNombre(meta.name);
    } catch {
      setErrorArchivo('El archivo no es un JSON válido. Usa «Exportar → JSON» del editor.');
    }
  };

  const crear = useMutation({
    mutationFn: () => api.crearProceso(proyectoId,
      origen === 'archivo' && archivo ? { nombre, contenido: archivo.contenido, mensaje: `Importado de ${archivo.nombre}` }
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
      <Selector etiqueta="Partir de" value={origen} onChange={(e) => { setOrigen(e.target.value as Origen); setErrorArchivo(null); }}
        opciones={[
          { valor: 'vacio', texto: 'Un proceso vacío' },
          ...(activas.length ? [{ valor: 'plantilla', texto: 'Una plantilla de la organización' }] : []),
          { valor: 'archivo', texto: 'Un JSON exportado del editor' }
        ]} />
      {origen === 'vacio' && <p className="sutil">El proceso nace vacío y lo dibujas en el editor.</p>}
      {origen === 'plantilla' && elegida && (
        <>
          <Selector etiqueta="Plantilla" value={elegida.id} onChange={(e) => setPlantillaId(e.target.value)}
            opciones={activas.map((p) => ({ valor: p.id, texto: `${p.nombre}${p.industria ? ` · ${p.industria}` : ''} (${p.nodos} elementos)` }))} />
          {elegida.descripcion && <p className="sutil">{elegida.descripcion}</p>}
          <p className="sutil">Se crea con la versión 1 copiada de la plantilla y el cliente de este proyecto.</p>
        </>
      )}
      {origen === 'archivo' && (
        <div className="campo">
          <label htmlFor="archivo-proceso">Archivo JSON («Exportar → JSON» del editor)</label>
          <input id="archivo-proceso" type="file" accept=".json,application/json" onChange={(e) => leer(e.target.files?.[0])} />
        </div>
      )}
      {errorArchivo && <Aviso tipo="error">{errorArchivo}</Aviso>}
      <Campo etiqueta="Nombre del proceso" required maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}
          disabled={!!errorArchivo || (origen === 'archivo' && !archivo)}>Crear proceso</Boton>
      </div>
    </form>
  );
}

function EditarProyecto({ proyecto, onCerrar }: { proyecto: TProyecto; onCerrar: () => void }) {
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
      <Campo etiqueta="Nombre" required maxLength={160} value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={proyecto.archivado} />
      <Campo etiqueta="Cliente" maxLength={160} value={clienteProyecto} onChange={(e) => setClienteProyecto(e.target.value)} disabled={proyecto.archivado} />
      <AreaTexto etiqueta="Descripción" maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={proyecto.archivado} />
      <ErrorDe error={guardar.error ?? archivar.error} />
      <div className="acciones acciones-separadas">
        <Boton variante={proyecto.archivado ? 'secundario' : 'peligro'} cargando={archivar.isPending}
          onClick={() => { if (proyecto.archivado || confirm('Al archivarlo, el proyecto queda en solo lectura. ¿Continuar?')) archivar.mutate(); }}>
          {proyecto.archivado ? 'Reactivar proyecto' : 'Archivar proyecto'}
        </Boton>
        <span>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          {!proyecto.archivado && <Boton type="submit" variante="primario" cargando={guardar.isPending}>Guardar</Boton>}
        </span>
      </div>
    </form>
  );
}
