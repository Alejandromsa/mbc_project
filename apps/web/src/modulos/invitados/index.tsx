// Invitados en la página del proceso (docs/iniciativas/invitados.md): compartir
// una revisión con el cliente por un enlace de solo lectura, ver y revocar los
// enlaces, y atender los comentarios que dejan. Proceso.tsx lo monta debajo de
// la tabla de revisiones. La API decide los permisos; aquí solo se muestran u
// ocultan las acciones (permisos.ts).
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RolProyecto, Revision } from '../../shell/api';
import { ESTADOS, fecha } from '../../shell/formato';
import { puede } from '../../shell/permisos';
import { Aviso, Boton, Campo, Dialogo, ErrorDe, Etiqueta, Insignia, Selector, Vacio } from '../../shell/ui';
import { apiInvitados, type ComentarioInvitado, type EnlaceInvitado, type EstadoEnlace } from './api';
import './estilos.css';

const ESTADOS_ENLACE: Record<EstadoEnlace, string> = { activo: 'Activo', caducado: 'Caducado', revocado: 'Revocado' };

export function InvitadosDelProceso({ procesoId, revisiones, rol, archivado }: {
  procesoId: string; revisiones: Revision[]; rol: RolProyecto; archivado: boolean;
}) {
  // Ver los enlaces: quien puede escribir (también en un proyecto archivado); crear, revocar y resolver: además, no archivado
  const gestiona = puede(rol, 'escribir');
  const escribe = gestiona && !archivado;
  const enlaces = useQuery({ queryKey: ['invitados', 'enlaces', procesoId], queryFn: () => apiInvitados.enlaces(procesoId), enabled: gestiona });
  const comentarios = useQuery({ queryKey: ['invitados', 'comentarios', procesoId], queryFn: () => apiInvitados.comentarios(procesoId) });
  const [compartiendo, setCompartiendo] = useState(false);

  const listaEnlaces = enlaces.data?.enlaces ?? [];
  const listaComentarios = comentarios.data?.comentarios ?? [];
  // Una tarjeta por versión compartida o comentada, de la más nueva a la más antigua
  const conAlgo = new Set([...listaEnlaces.map((e) => e.revisionId), ...listaComentarios.map((c) => c.revisionId)]);
  const versiones = revisiones.filter((r) => conAlgo.has(r.id));
  const pendientes = listaComentarios.filter((c) => !c.resueltoEn).length;

  return (
    <section aria-labelledby="t-invitados" className="invitados">
      <div className="invitados-titulo">
        <h2 id="t-invitados">Revisión con el cliente</h2>
        {pendientes > 0 && <Etiqueta tono="aviso">{pendientes === 1 ? '1 comentario sin resolver' : `${pendientes} comentarios sin resolver`}</Etiqueta>}
        {escribe && revisiones.length > 0 && (
          <Boton variante="primario" className="invitados-compartir" onClick={() => setCompartiendo(true)}>Compartir con el cliente</Boton>
        )}
      </div>
      <p className="sutil invitados-intro">
        Comparte una versión con un enlace de solo lectura: quien lo recibe ve el diagrama y la ficha sin necesitar
        cuenta y puede dejar comentarios. El enlace caduca solo y se puede revocar en cualquier momento.
      </p>
      <ErrorDe error={enlaces.error ?? comentarios.error} />
      {(comentarios.isPending || (gestiona && enlaces.isPending)) ? null : versiones.length === 0 ? (
        <Vacio>
          {revisiones.length === 0
            ? 'Cuando haya una revisión guardada, podrás compartirla con el cliente.'
            : 'Todavía no se ha compartido ninguna versión de este proceso.'}
        </Vacio>
      ) : (
        versiones.map((r) => (
          <VersionCompartida key={r.id} revision={r} procesoId={procesoId} gestiona={gestiona} escribe={escribe}
            enlaces={listaEnlaces.filter((e) => e.revisionId === r.id)}
            comentarios={listaComentarios.filter((c) => c.revisionId === r.id)} />
        ))
      )}
      <Dialogo abierto={compartiendo} titulo="Compartir con el cliente" onCerrar={() => setCompartiendo(false)}>
        <Compartir procesoId={procesoId} revisiones={revisiones} onCerrar={() => setCompartiendo(false)} />
      </Dialogo>
    </section>
  );
}

function VersionCompartida({ revision, procesoId, gestiona, escribe, enlaces, comentarios }: {
  revision: Revision; procesoId: string; gestiona: boolean; escribe: boolean; enlaces: EnlaceInvitado[]; comentarios: ComentarioInvitado[];
}) {
  // Primero lo pendiente; dentro de cada grupo, lo más reciente arriba (la API ya los trae así)
  const ordenados = [...comentarios].sort((a, b) => Number(!!a.resueltoEn) - Number(!!b.resueltoEn));
  return (
    <article className="tarjeta invitados-version" aria-labelledby={`invitados-v-${revision.id}`}>
      <header className="invitados-version-cabecera">
        <h3 id={`invitados-v-${revision.id}`}>v{revision.numero}</h3>
        <Insignia estado={revision.estado} />
        <span className="sutil">guardada el {fecha(revision.creadaEn)}</span>
      </header>
      {gestiona && enlaces.length > 0 && <TablaEnlaces enlaces={enlaces} procesoId={procesoId} escribe={escribe} />}
      <h4 className="invitados-subtitulo">Comentarios</h4>
      {ordenados.length === 0
        ? <p className="sutil invitados-sin-comentarios">Nadie ha comentado esta versión todavía.</p>
        : (
          <ul className="invitados-comentarios">
            {ordenados.map((c) => <Comentario key={c.id} c={c} procesoId={procesoId} escribe={escribe} />)}
          </ul>
        )}
    </article>
  );
}

function TablaEnlaces({ enlaces, procesoId, escribe }: { enlaces: EnlaceInvitado[]; procesoId: string; escribe: boolean }) {
  const cliente = useQueryClient();
  const [revocando, setRevocando] = useState<EnlaceInvitado | null>(null);
  const revocar = useMutation({
    mutationFn: (id: string) => apiInvitados.revocar(id),
    onSuccess: () => { setRevocando(null); cliente.invalidateQueries({ queryKey: ['invitados', 'enlaces', procesoId] }); }
  });
  return (
    <>
      <table className="tabla tabla-compacta invitados-enlaces">
        <caption className="solo-lector">Enlaces de esta versión</caption>
        <thead>
          <tr><th>Enlace para</th><th>Estado</th><th>Caduca</th><th>Último acceso</th><th className="invitados-num">Comentarios</th><th><span className="solo-lector">Acciones</span></th></tr>
        </thead>
        <tbody>
          {enlaces.map((e) => (
            <tr key={e.id} className={e.estado === 'activo' ? undefined : 'inactivo'}>
              <td>
                <strong>{e.destinatario}</strong>
                <small className="invitados-detalle">
                  Creado por {e.creadoPor ?? '—'} el {fecha(e.creadoEn)}{e.admiteComentarios ? '' : ' · sin comentarios'}
                </small>
              </td>
              <td><Etiqueta tono={e.estado === 'activo' ? 'neutro' : 'aviso'}>{ESTADOS_ENLACE[e.estado]}</Etiqueta></td>
              <td className="fecha">{e.estado === 'revocado' ? <span className="sutil">Revocado el {fecha(e.revocadoEn)}</span> : fecha(e.caducaEn)}</td>
              <td className="fecha">{e.ultimoAcceso ? fecha(e.ultimoAcceso) : <span className="sutil">Sin abrir</span>}</td>
              <td className="invitados-num">{e.comentarios}</td>
              <td className="celda-acciones">
                {escribe && e.estado === 'activo' && <Boton variante="peligro" onClick={() => { revocar.reset(); setRevocando(e); }}>Revocar</Boton>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Dialogo abierto={!!revocando} titulo="Revocar el enlace" onCerrar={() => setRevocando(null)}>
        {revocando && (
          <>
            <p>El enlace para <strong>{revocando.destinatario}</strong> dejará de funcionar en el acto. Los comentarios que ya dejaron se conservan.</p>
            <ErrorDe error={revocar.error} />
            <div className="acciones">
              <Boton onClick={() => setRevocando(null)}>Cancelar</Boton>
              <Boton variante="peligro" cargando={revocar.isPending} onClick={() => revocar.mutate(revocando.id)}>Revocar enlace</Boton>
            </div>
          </>
        )}
      </Dialogo>
    </>
  );
}

function Comentario({ c, procesoId, escribe }: { c: ComentarioInvitado; procesoId: string; escribe: boolean }) {
  const cliente = useQueryClient();
  const clave = ['invitados', 'comentarios', procesoId];
  const resuelto = !!c.resueltoEn;
  // La casilla responde al clic en el acto; si la API falla, vuelve a lo que había
  const [marcado, setMarcado] = useState(resuelto);
  useEffect(() => { setMarcado(resuelto); }, [resuelto]);
  const resolver = useMutation({
    mutationFn: (valor: boolean) => apiInvitados.resolver(c.id, valor),
    onSuccess: ({ comentario }) => {
      cliente.setQueryData<{ comentarios: ComentarioInvitado[] }>(clave, (d) => d && { comentarios: d.comentarios.map((x) => (x.id === comentario.id ? comentario : x)) });
    },
    onError: () => setMarcado(resuelto)
  });
  return (
    <li className={resuelto ? 'invitados-comentario invitados-comentario-resuelto' : 'invitados-comentario'}>
      <div className="invitados-comentario-cabecera">
        <strong>{c.nombre}</strong>
        <span className="sutil">{c.destinatario} · {fecha(c.creadoEn)}</span>
      </div>
      {c.elementoEtiqueta !== null || c.elementoId !== null
        ? <p className="invitados-ancla">Sobre «{c.elementoEtiqueta || c.elementoId}»</p>
        : null}
      <p className="invitados-comentario-texto">{c.texto}</p>
      <div className="invitados-comentario-pie">
        {escribe ? (
          <label className="invitados-resuelto">
            <input type="checkbox" checked={marcado} disabled={resolver.isPending}
              onChange={(e) => { setMarcado(e.target.checked); resolver.mutate(e.target.checked); }} />
            Resuelto
          </label>
        ) : resuelto ? <Etiqueta>Resuelto</Etiqueta> : null}
        {resuelto && <span className="sutil">por {c.resueltoPor ?? '—'} el {fecha(c.resueltoEn)}</span>}
      </div>
      <ErrorDe error={resolver.error} />
    </li>
  );
}

function Compartir({ procesoId, revisiones, onCerrar }: { procesoId: string; revisiones: Revision[]; onCerrar: () => void }) {
  const cliente = useQueryClient();
  const [revisionId, setRevisionId] = useState(revisiones[0]?.id ?? '');
  const [destinatario, setDestinatario] = useState('');
  const [dias, setDias] = useState('14');
  const [comentarios, setComentarios] = useState(true);
  const crear = useMutation({
    mutationFn: () => apiInvitados.crearEnlace(revisionId, { destinatario, dias: Number(dias), admiteComentarios: comentarios }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['invitados', 'enlaces', procesoId] })
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); crear.mutate(); };

  if (crear.data) {
    const numero = revisiones.find((r) => r.id === revisionId)?.numero;
    return <EnlaceCreado url={crear.data.url} enlace={crear.data.enlace} numero={numero} onCerrar={onCerrar} />;
  }
  return (
    <form onSubmit={enviar}>
      <Selector etiqueta="Versión que verá" value={revisionId} onChange={(e) => setRevisionId(e.target.value)}
        opciones={revisiones.map((r) => ({ valor: r.id, texto: `v${r.numero} · ${ESTADOS[r.estado]} · ${fecha(r.creadaEn)}` }))} />
      <Campo etiqueta="Para quién es" required maxLength={120} autoFocus value={destinatario}
        placeholder="Gerencia de Operaciones del cliente" onChange={(e) => setDestinatario(e.target.value)}
        ayuda="Solo para que el equipo sepa a quién se lo enviaste: ProcessIQ no envía nada." />
      <Campo etiqueta="Días hasta que caduque" type="number" required min={1} max={90} step={1} value={dias}
        onChange={(e) => setDias(e.target.value)} ayuda="Entre 1 y 90. Después el enlace deja de funcionar." />
      <label className="casilla invitados-casilla">
        <input type="checkbox" checked={comentarios} onChange={(e) => setComentarios(e.target.checked)} />
        Puede dejar comentarios
      </label>
      <Aviso tipo="info">
        Quien tenga el enlace verá esta versión completa (diagrama, ficha y notas de las actividades), pero no el proyecto,
        otras versiones ni al equipo.
      </Aviso>
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}>Crear enlace</Boton>
      </div>
    </form>
  );
}

/** El enlace se muestra una sola vez: en la base solo queda su hash. */
function EnlaceCreado({ url, enlace, numero, onCerrar }: { url: string; enlace: EnlaceInvitado; numero: number | undefined; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="invitados-creado">
      <p>Enlace a la <strong>v{numero}</strong> para <strong>{enlace.destinatario}</strong>.</p>
      <p className="sutil">Funciona hasta el {fecha(enlace.caducaEn)}</p>
      <Aviso tipo="atencion">Solo se muestra ahora. Cópialo y envíalo por el canal habitual: después no se puede recuperar (sí revocar).</Aviso>
      <div className="invitados-url">
        <code aria-label="Enlace para el cliente">{url}</code>
        <Boton variante="secundario" onClick={() => navigator.clipboard.writeText(url).then(() => setCopiado(true), () => setCopiado(false))}>
          {copiado ? 'Copiado' : 'Copiar'}
        </Boton>
      </div>
      <div className="acciones acciones-separadas">
        <a className="boton boton-sutil" href={url} target="_blank" rel="noopener noreferrer">Ver como el cliente</a>
        <Boton variante="primario" onClick={onCerrar}>Hecho</Boton>
      </div>
    </div>
  );
}
