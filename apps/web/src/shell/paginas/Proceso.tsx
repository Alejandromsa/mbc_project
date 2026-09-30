// Un proceso: sus revisiones y el flujo borrador -> en revisión -> aprobada.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api, type EstadoRevision, type Revision } from '../api';
import { conectarColaboracion, iniciales, type Presente } from '../colaboracion';
import { enEditor } from '../formato';
import { useT, type TraductorShell } from '../i18n';
import { puede } from '../permisos';
import { useUsuario } from '../sesion';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Dialogo, EnlaceEditor, ErrorDe, Etiqueta, Insignia, Vacio, useTitulo } from '../ui';
import { InvitadosDelProceso } from '../../modulos/invitados';

export function Proceso({ id }: { id: string }) {
  const t = useT();
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: ['proceso', id], queryFn: () => api.proceso(id) });
  const proyectoId = consulta.data?.proceso.proyectoId;
  const proyecto = useQuery({ queryKey: ['proyecto', proyectoId], queryFn: () => api.proyecto(proyectoId!), enabled: !!proyectoId });
  useTitulo(consulta.data?.proceso.nombre ?? t('comun.proceso'));
  const [renombrando, setRenombrando] = useState(false);
  const [plantillaDe, setPlantillaDe] = useState<Revision | null>(null);
  const [plantillaCreada, setPlantillaCreada] = useState<string | null>(null);
  const esAdmin = useUsuario().rol === 'admin';
  const presentes = usePresencia(id, consulta.data?.revisiones);

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
      <nav className="migas" aria-label={t('comun.ruta')}>
        <Link href="/">{t('comun.proyectos')}</Link> <span aria-hidden="true">›</span>{' '}
        <Link href={`/p/${proceso.proyectoId}`}>{proyecto.data?.proyecto.nombre ?? t('comun.proyecto')}</Link> <span aria-hidden="true">›</span>{' '}
        <span>{proceso.nombre}</span>
      </nav>
      <div className="encabezado">
        <div>
          <h1>{proceso.nombre}</h1>
          <p className="sutil">{t.rico('proceso.tuRolActualizado', { rol: t.rolProyecto(rol), fecha: t.fecha(proceso.actualizadoEn) })}</p>
          <QuienLoTieneAbierto presentes={presentes} />
        </div>
        <div className="acciones">
          {escribe && <Boton onClick={() => setRenombrando(true)}>{t('proceso.renombrar')}</Boton>}
          <EnlaceEditor className="boton boton-primario" href={enEditor.proceso(proceso.id)}>
            {revisiones.length ? t('proceso.abrirUltima') : t('proceso.empezar')}
          </EnlaceEditor>
        </div>
      </div>
      {archivado && <Aviso tipo="atencion">{t('proceso.archivadoAviso')}</Aviso>}

      <section aria-labelledby="t-revisiones">
        <h2 id="t-revisiones">{t('proceso.revisiones')}</h2>
        <p className="sutil">{t('proceso.explicacion')}</p>
        <ErrorDe error={cambiarEstado.error} />
        {plantillaCreada && <Aviso tipo="ok">{t('proceso.plantillaCreada', { nombre: plantillaCreada })}</Aviso>}
        {revisiones.length === 0 ? (
          <Vacio>{t('proceso.sinRevisiones')}</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>{t('proceso.version')}</th><th>{t('comun.estado')}</th><th>{t('proceso.autor')}</th><th>{t('comun.fecha')}</th>
                <th>{t('proceso.mensaje')}</th><th><span className="solo-lector">{t('comun.acciones')}</span></th>
              </tr>
            </thead>
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

      <Dialogo abierto={!!plantillaDe} titulo={plantillaDe ? t('proceso.comoPlantillaTitulo', { n: plantillaDe.numero }) : ''} onCerrar={() => setPlantillaDe(null)}>
        {plantillaDe && <ComoPlantilla revision={plantillaDe} nombreProceso={proceso.nombre}
          onCreada={(n) => { setPlantillaDe(null); setPlantillaCreada(n); }} onCerrar={() => setPlantillaDe(null)} />}
      </Dialogo>
      <Dialogo abierto={renombrando} titulo={t('proceso.renombrarTitulo')} onCerrar={() => setRenombrando(false)}>
        <Renombrar id={proceso.id} nombreActual={proceso.nombre} proyectoId={proceso.proyectoId} onCerrar={() => setRenombrando(false)} />
      </Dialogo>
    </>
  );
}

/** Id y estado de cada revisión, en el orden de la API (de la más nueva a la más antigua). */
const firmaEstados = (lista: readonly { id: string; estado: EstadoRevision }[]) => lista.map((r) => `${r.id}:${r.estado}`).join(',');

/**
 * Colaboración (ADR 21): esta página da su latido como «viendo» y escucha el proceso.
 * Devuelve quién más lo tiene abierto; cuando alguien guarda una revisión o cambia el
 * estado de cualquiera (enviar a revisión, aprobar, devolver), la API avisa al momento
 * (evento `estado`), se vuelve a pedir el proceso y la tabla se actualiza sola.
 */
function usePresencia(procesoId: string, revisiones: Revision[] | undefined): Presente[] {
  const cliente = useQueryClient();
  const [presentes, setPresentes] = useState<Presente[]>([]);
  // Lo que muestra la tabla ahora (null = aún no se cargó: la consulta ya traerá lo último)
  const mostrada = useRef<string | null>(null);
  mostrada.current = revisiones ? firmaEstados(revisiones) : null;
  const cargado = !!revisiones;
  useEffect(() => {
    if (!cargado) return;
    const conexion = conectarColaboracion({
      procesoId,
      lugar: 'shell',
      alPresencia: (lista) => setPresentes(lista.filter((p) => !p.yo)),
      alEstado: (lista) => {
        if (mostrada.current !== null && firmaEstados(lista) !== mostrada.current) cliente.invalidateQueries({ queryKey: ['proceso', procesoId] });
      }
    });
    return () => conexion.cerrar();
  }, [procesoId, cargado, cliente]);
  return presentes;
}

/** Dónde tiene abierto el proceso alguien (el editor usa dondeEsta() de colaboracion.ts, en español). */
function dondeEsta(p: Presente, t: TraductorShell): string {
  if (p.lugares.includes('editor') && p.lugares.includes('shell')) return t('proceso.dondeAmbos');
  return p.lugares.includes('editor') ? t('proceso.dondeEditor') : t('proceso.dondeShell');
}

/** « (v3)», « (v2, versión anterior)» o nada si no tiene ninguna revisión abierta en el editor. */
function enVersion(p: Presente, t: TraductorShell): string {
  if (!p.revisiones.length) return '';
  const versiones = p.revisiones.map((r) => t(r.ultima ? 'proceso.versionAbierta' : 'proceso.versionAbiertaAnterior', { n: r.numero })).join(' · ');
  return ' ' + t('proceso.enVersion', { versiones });
}

function QuienLoTieneAbierto({ presentes }: { presentes: Presente[] }) {
  const t = useT();
  return (
    <div aria-live="polite">
      {presentes.length > 0 && (
        <p className="sutil">
          {t('proceso.abiertoPor', { n: presentes.length })}{' '}
          {presentes.map((p) => {
            const edita = p.estado === 'editando';
            const donde = dondeEsta(p, t);
            const datos = { iniciales: iniciales(p.nombre), nombre: p.nombre };
            const version = enVersion(p, t);
            return (
              <span key={p.usuarioId} title={(edita ? t('proceso.presenciaEditando', { nombre: p.nombre, donde }) : t('proceso.presenciaViendo', { nombre: p.nombre, donde })) + version}>
                <Etiqueta tono={edita ? 'aviso' : 'neutro'}>{(edita ? t('proceso.presenteEditando', datos) : t('proceso.presente', datos)) + version}</Etiqueta>{' '}
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}

function FilaRevision({ r, padre, escribe, aprueba, ocupado, cambiar, comoPlantilla }: {
  r: Revision; padre: number | undefined; escribe: boolean; aprueba: boolean; ocupado: boolean; cambiar: (e: EstadoRevision) => void;
  /** Solo administradores: guardar esta versión como plantilla de la organización. */
  comoPlantilla?: () => void;
}) {
  const t = useT();
  // Si no parte de la inmediatamente anterior, alguien guardó en paralelo (conflicto)
  const ramificada = padre !== undefined && padre !== r.numero - 1;
  return (
    <tr>
      <td>
        <strong>v{r.numero}</strong>
        {ramificada && <small className="aviso-en-linea" title={t('proceso.ramificadaTitulo')}>{t('proceso.aPartirDe', { n: padre ?? '' })}</small>}
      </td>
      <td><Insignia estado={r.estado} /></td>
      <td>{r.autor}</td>
      <td className="fecha">{t.fecha(r.creadaEn)}</td>
      <td className="mensaje">{r.mensaje || <span className="sutil">—</span>}</td>
      <td className="celda-acciones">
        <EnlaceEditor className="boton boton-sutil" href={enEditor.revision(r.id)}>{t('comun.abrir')}</EnlaceEditor>
        {r.estado === 'borrador' && escribe && <Boton variante="sutil" disabled={ocupado} onClick={() => cambiar('en_revision')}>{t('proceso.enviarRevision')}</Boton>}
        {r.estado === 'en_revision' && aprueba && (
          <>
            <Boton variante="primario" disabled={ocupado} onClick={() => cambiar('aprobada')}>{t('proceso.aprobar')}</Boton>
            <Boton variante="sutil" disabled={ocupado} onClick={() => cambiar('borrador')}>{t('proceso.devolver')}</Boton>
          </>
        )}
        {comoPlantilla && <Boton variante="sutil" onClick={comoPlantilla}>{t('proceso.comoPlantilla')}</Boton>}
      </td>
    </tr>
  );
}

function Renombrar({ id, nombreActual, proyectoId, onCerrar }: { id: string; nombreActual: string; proyectoId: string; onCerrar: () => void }) {
  const t = useT();
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
      <Campo etiqueta={t('comun.nombre')} required maxLength={200} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <ErrorDe error={renombrar.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={renombrar.isPending}>{t('comun.guardar')}</Boton>
      </div>
    </form>
  );
}

function ComoPlantilla({ revision, nombreProceso, onCreada, onCerrar }: {
  revision: Revision; nombreProceso: string; onCreada: (nombre: string) => void; onCerrar: () => void;
}) {
  const t = useT();
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
      <p className="sutil">{t('proceso.plantillaExplicacion')}</p>
      <Campo etiqueta={t('proceso.nombrePlantilla')} required maxLength={160} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo etiqueta={t('comun.industria')} maxLength={80} ayuda={t('proceso.industriaAyuda')} value={industria} onChange={(e) => setIndustria(e.target.value)} />
      <AreaTexto etiqueta={t('comun.descripcion')} maxLength={600} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}>{t('proceso.guardarPlantilla')}</Boton>
      </div>
    </form>
  );
}
