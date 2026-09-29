// Un proceso: sus revisiones y el flujo borrador -> en revisión -> aprobada.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api, type EstadoRevision, type Revision } from '../api';
import { ROLES_PROYECTO, enEditor, fecha } from '../formato';
import { puede } from '../permisos';
import { useUsuario } from '../sesion';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Dialogo, ErrorDe, Insignia, Vacio, useTitulo } from '../ui';
import { InvitadosDelProceso } from '../../modulos/invitados';

export function Proceso({ id }: { id: string }) {
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: ['proceso', id], queryFn: () => api.proceso(id) });
  const proyectoId = consulta.data?.proceso.proyectoId;
  const proyecto = useQuery({ queryKey: ['proyecto', proyectoId], queryFn: () => api.proyecto(proyectoId!), enabled: !!proyectoId });
  useTitulo(consulta.data?.proceso.nombre ?? 'Proceso');
  const [renombrando, setRenombrando] = useState(false);
  const [plantillaDe, setPlantillaDe] = useState<Revision | null>(null);
  const [plantillaCreada, setPlantillaCreada] = useState<string | null>(null);
  const esAdmin = useUsuario().rol === 'admin';

  const cambiarEstado = useMutation({
    mutationFn: ({ revision, estado }: { revision: string; estado: EstadoRevision }) => api.cambiarEstado(revision, estado),
    onSettled: () => {
      cliente.invalidateQueries({ queryKey: ['proceso', id] });
      cliente.invalidateQueries({ queryKey: ['proyecto', proyectoId] });
    }
  });

  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) return <ErrorDe error={consulta.error} />;
  const { proceso, rol, revisiones } = consulta.data;
  const archivado = proyecto.data?.proyecto.archivado ?? false;
  const escribe = puede(rol, 'escribir') && !archivado;
  const aprueba = puede(rol, 'aprobar') && !archivado;
  const numeroDe = new Map(revisiones.map((r) => [r.id, r.numero]));

  return (
    <>
      <nav className="migas" aria-label="Ruta">
        <Link href="/">Proyectos</Link> <span aria-hidden="true">›</span>{' '}
        <Link href={`/p/${proceso.proyectoId}`}>{proyecto.data?.proyecto.nombre ?? 'Proyecto'}</Link> <span aria-hidden="true">›</span>{' '}
        <span>{proceso.nombre}</span>
      </nav>
      <div className="encabezado">
        <div>
          <h1>{proceso.nombre}</h1>
          <p className="sutil">Tu rol: <strong>{ROLES_PROYECTO[rol]}</strong> · Actualizado el {fecha(proceso.actualizadoEn)}</p>
        </div>
        <div className="acciones">
          {escribe && <Boton onClick={() => setRenombrando(true)}>Renombrar</Boton>}
          <a className="boton boton-primario" href={enEditor.proceso(proceso.id)}>
            {revisiones.length ? 'Abrir la última versión en el editor' : 'Empezar a dibujarlo en el editor'}
          </a>
        </div>
      </div>
      {archivado && <Aviso tipo="atencion">El proyecto está archivado: las revisiones se pueden consultar, pero no cambiar.</Aviso>}

      <section aria-labelledby="t-revisiones">
        <h2 id="t-revisiones">Revisiones</h2>
        <p className="sutil">
          Cada «Guardar revisión» del editor crea una versión nueva. Una revisión en borrador se envía a revisión;
          quien aprueba la aprueba o la devuelve. Las aprobadas ya no cambian.
        </p>
        <ErrorDe error={cambiarEstado.error} />
        {plantillaCreada && <Aviso tipo="ok">Plantilla «{plantillaCreada}» creada. Ya se puede elegir al crear un proceso; se gestiona en Catálogos.</Aviso>}
        {revisiones.length === 0 ? (
          <Vacio>Todavía no hay revisiones. Abre el editor y usa «Guardar revisión».</Vacio>
        ) : (
          <table className="tabla">
            <thead><tr><th>Versión</th><th>Estado</th><th>Autor</th><th>Fecha</th><th>Mensaje</th><th><span className="solo-lector">Acciones</span></th></tr></thead>
            <tbody>
              {revisiones.map((r) => (
                <FilaRevision key={r.id} r={r} padre={r.padreId ? numeroDe.get(r.padreId) : undefined}
                  escribe={escribe} aprueba={aprueba} ocupado={cambiarEstado.isPending}
                  cambiar={(estado) => cambiarEstado.mutate({ revision: r.id, estado })}
                  comoPlantilla={esAdmin ? () => { setPlantillaCreada(null); setPlantillaDe(r); } : undefined} />
              ))}
            </tbody>
          </table>
        )}
      </section>
      <InvitadosDelProceso procesoId={proceso.id} revisiones={revisiones} rol={rol} archivado={archivado} />

      <Dialogo abierto={!!plantillaDe} titulo={plantillaDe ? `Guardar v${plantillaDe.numero} como plantilla` : ''} onCerrar={() => setPlantillaDe(null)}>
        {plantillaDe && <ComoPlantilla revision={plantillaDe} nombreProceso={proceso.nombre}
          onCreada={(n) => { setPlantillaDe(null); setPlantillaCreada(n); }} onCerrar={() => setPlantillaDe(null)} />}
      </Dialogo>
      <Dialogo abierto={renombrando} titulo="Renombrar proceso" onCerrar={() => setRenombrando(false)}>
        <Renombrar id={proceso.id} nombreActual={proceso.nombre} proyectoId={proceso.proyectoId} onCerrar={() => setRenombrando(false)} />
      </Dialogo>
    </>
  );
}

function FilaRevision({ r, padre, escribe, aprueba, ocupado, cambiar, comoPlantilla }: {
  r: Revision; padre: number | undefined; escribe: boolean; aprueba: boolean; ocupado: boolean; cambiar: (e: EstadoRevision) => void;
  /** Solo administradores: guardar esta versión como plantilla de la organización. */
  comoPlantilla?: () => void;
}) {
  // Si no parte de la inmediatamente anterior, alguien guardó en paralelo (conflicto)
  const ramificada = padre !== undefined && padre !== r.numero - 1;
  return (
    <tr>
      <td>
        <strong>v{r.numero}</strong>
        {ramificada && <small className="aviso-en-linea" title="Se guardó a partir de una versión que ya no era la última">a partir de v{padre}</small>}
      </td>
      <td><Insignia estado={r.estado} /></td>
      <td>{r.autor}</td>
      <td className="fecha">{fecha(r.creadaEn)}</td>
      <td className="mensaje">{r.mensaje || <span className="sutil">—</span>}</td>
      <td className="celda-acciones">
        <a className="boton boton-sutil" href={enEditor.revision(r.id)}>Abrir</a>
        {r.estado === 'borrador' && escribe && <Boton variante="sutil" disabled={ocupado} onClick={() => cambiar('en_revision')}>Enviar a revisión</Boton>}
        {r.estado === 'en_revision' && aprueba && (
          <>
            <Boton variante="primario" disabled={ocupado} onClick={() => cambiar('aprobada')}>Aprobar</Boton>
            <Boton variante="sutil" disabled={ocupado} onClick={() => cambiar('borrador')}>Devolver</Boton>
          </>
        )}
        {comoPlantilla && <Boton variante="sutil" onClick={comoPlantilla}>Guardar como plantilla</Boton>}
      </td>
    </tr>
  );
}

function Renombrar({ id, nombreActual, proyectoId, onCerrar }: { id: string; nombreActual: string; proyectoId: string; onCerrar: () => void }) {
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState(nombreActual);
  const renombrar = useMutation({
    mutationFn: () => api.renombrarProceso(id, nombre),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['proceso', id] });
      cliente.invalidateQueries({ queryKey: ['proyecto', proyectoId] });
      onCerrar();
    }
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); renombrar.mutate(); };
  return (
    <form onSubmit={enviar}>
      <Campo etiqueta="Nombre" required maxLength={200} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <ErrorDe error={renombrar.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={renombrar.isPending}>Guardar</Boton>
      </div>
    </form>
  );
}

function ComoPlantilla({ revision, nombreProceso, onCreada, onCerrar }: {
  revision: Revision; nombreProceso: string; onCreada: (nombre: string) => void; onCerrar: () => void;
}) {
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState(nombreProceso);
  const [industria, setIndustria] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const crear = useMutation({
    mutationFn: () => api.crearPlantilla({ revisionId: revision.id, nombre, industria, descripcion }),
    onSuccess: ({ plantilla }) => {
      cliente.invalidateQueries({ queryKey: ['plantillas'] });
      cliente.invalidateQueries({ queryKey: ['catalogo', 'plantillas'] });
      onCreada(plantilla.nombre);
    }
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); crear.mutate(); };
  return (
    <form onSubmit={enviar}>
      <p className="sutil">
        La plantilla copia el diagrama, la ficha y las vistas de esta versión, sin el cliente, las personas de la
        gobernanza, el historial de cambios ni los valores medidos. Revisa que los textos no nombren al cliente.
      </p>
      <Campo etiqueta="Nombre de la plantilla" required maxLength={160} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo etiqueta="Industria" maxLength={80} ayuda="Si la dejas vacía, se toma la del proceso." value={industria} onChange={(e) => setIndustria(e.target.value)} />
      <AreaTexto etiqueta="Descripción" maxLength={600} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}>Guardar plantilla</Boton>
      </div>
    </form>
  );
}
