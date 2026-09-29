// Invitados en la página del proceso (docs/iniciativas/invitados.md): compartir
// una revisión con el cliente por un enlace de solo lectura, ver y revocar los
// enlaces, y atender los comentarios que dejan. Proceso.tsx lo monta debajo de
// la tabla de revisiones. La API decide los permisos; aquí solo se muestran u
// ocultan las acciones (permisos.ts).
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RolProyecto, Revision } from '../../shell/api';
import { puede } from '../../shell/permisos';
import { Aviso, Boton, Campo, Dialogo, ErrorDe, Etiqueta, Insignia, Selector, Vacio } from '../../shell/ui';
import { apiInvitados, type ComentarioInvitado, type EnlaceInvitado, type EstadoEnlace } from './api';
import { useT } from './textos';
import './estilos.css';

const CLAVES_ESTADO_ENLACE = { activo: 'estadoActivo', caducado: 'estadoCaducado', revocado: 'estadoRevocado' } as const satisfies Record<EstadoEnlace, string>;

export function InvitadosDelProceso({ procesoId, revisiones, rol, archivado }: {
  procesoId: string; revisiones: Revision[]; rol: RolProyecto; archivado: boolean;
}) {
  const t = useT();
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
        <h2 id="t-invitados">{t('titulo')}</h2>
        {pendientes > 0 && <Etiqueta tono="aviso">{t('sinResolver', { n: pendientes })}</Etiqueta>}
        {escribe && revisiones.length > 0 && (
          <Boton variante="primario" className="invitados-compartir" onClick={() => setCompartiendo(true)}>{t('compartir')}</Boton>
        )}
      </div>
      <p className="sutil invitados-intro">{t('intro')}</p>
      <ErrorDe error={enlaces.error ?? comentarios.error} />
      {(comentarios.isPending || (gestiona && enlaces.isPending)) ? null : versiones.length === 0 ? (
        <Vacio>{revisiones.length === 0 ? t('sinRevisiones') : t('sinCompartir')}</Vacio>
      ) : (
        versiones.map((r) => (
          <VersionCompartida key={r.id} revision={r} procesoId={procesoId} gestiona={gestiona} escribe={escribe}
            enlaces={listaEnlaces.filter((e) => e.revisionId === r.id)}
            comentarios={listaComentarios.filter((c) => c.revisionId === r.id)} />
        ))
      )}
      <Dialogo abierto={compartiendo} titulo={t('compartir')} onCerrar={() => setCompartiendo(false)}>
        <Compartir procesoId={procesoId} revisiones={revisiones} onCerrar={() => setCompartiendo(false)} />
      </Dialogo>
    </section>
  );
}

function VersionCompartida({ revision, procesoId, gestiona, escribe, enlaces, comentarios }: {
  revision: Revision; procesoId: string; gestiona: boolean; escribe: boolean; enlaces: EnlaceInvitado[]; comentarios: ComentarioInvitado[];
}) {
  const t = useT();
  // Primero lo pendiente; dentro de cada grupo, lo más reciente arriba (la API ya los trae así)
  const ordenados = [...comentarios].sort((a, b) => Number(!!a.resueltoEn) - Number(!!b.resueltoEn));
  return (
    <article className="tarjeta invitados-version" aria-labelledby={`invitados-v-${revision.id}`}>
      <header className="invitados-version-cabecera">
        <h3 id={`invitados-v-${revision.id}`}>v{revision.numero}</h3>
        <Insignia estado={revision.estado} />
        <span className="sutil">{t('guardadaEl', { fecha: t.fecha(revision.creadaEn) })}</span>
      </header>
      {gestiona && enlaces.length > 0 && <TablaEnlaces enlaces={enlaces} procesoId={procesoId} escribe={escribe} />}
      <h4 className="invitados-subtitulo">{t('comentarios')}</h4>
      {ordenados.length === 0
        ? <p className="sutil invitados-sin-comentarios">{t('nadieComento')}</p>
        : (
          <ul className="invitados-comentarios">
            {ordenados.map((c) => <Comentario key={c.id} c={c} procesoId={procesoId} escribe={escribe} />)}
          </ul>
        )}
    </article>
  );
}

function TablaEnlaces({ enlaces, procesoId, escribe }: { enlaces: EnlaceInvitado[]; procesoId: string; escribe: boolean }) {
  const t = useT();
  const cliente = useQueryClient();
  const [revocando, setRevocando] = useState<EnlaceInvitado | null>(null);
  const revocar = useMutation({
    mutationFn: (id: string) => apiInvitados.revocar(id),
    onSuccess: () => { setRevocando(null); cliente.invalidateQueries({ queryKey: ['invitados', 'enlaces', procesoId] }); }
  });
  return (
    <>
      <table className="tabla tabla-compacta invitados-enlaces">
        <caption className="solo-lector">{t('enlacesVersion')}</caption>
        <thead>
          <tr>
            <th>{t('enlacePara')}</th><th>{t('estado')}</th><th>{t('caduca')}</th><th>{t('ultimoAcceso')}</th>
            <th className="invitados-num">{t('comentarios')}</th><th><span className="solo-lector">{t('acciones')}</span></th>
          </tr>
        </thead>
        <tbody>
          {enlaces.map((e) => (
            <tr key={e.id} className={e.estado === 'activo' ? undefined : 'inactivo'}>
              <td>
                <strong>{e.destinatario}</strong>
                <small className="invitados-detalle">
                  {t('creadoPor', { autor: e.creadoPor ?? '—', fecha: t.fecha(e.creadoEn) })}{e.admiteComentarios ? '' : t('sinComentarios')}
                </small>
              </td>
              <td><Etiqueta tono={e.estado === 'activo' ? 'neutro' : 'aviso'}>{t(CLAVES_ESTADO_ENLACE[e.estado])}</Etiqueta></td>
              <td className="fecha">{e.estado === 'revocado' ? <span className="sutil">{t('revocadoEl', { fecha: t.fecha(e.revocadoEn) })}</span> : t.fecha(e.caducaEn)}</td>
              <td className="fecha">{e.ultimoAcceso ? t.fecha(e.ultimoAcceso) : <span className="sutil">{t('sinAbrir')}</span>}</td>
              <td className="invitados-num">{e.comentarios}</td>
              <td className="celda-acciones">
                {escribe && e.estado === 'activo' && <Boton variante="peligro" onClick={() => { revocar.reset(); setRevocando(e); }}>{t('revocar')}</Boton>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Dialogo abierto={!!revocando} titulo={t('revocarTitulo')} onCerrar={() => setRevocando(null)}>
        {revocando && (
          <>
            <p>{t.rico('revocarTexto', { destinatario: revocando.destinatario })}</p>
            <ErrorDe error={revocar.error} />
            <div className="acciones">
              <Boton onClick={() => setRevocando(null)}>{t('cancelar')}</Boton>
              <Boton variante="peligro" cargando={revocar.isPending} onClick={() => revocar.mutate(revocando.id)}>{t('revocarEnlace')}</Boton>
            </div>
          </>
        )}
      </Dialogo>
    </>
  );
}

function Comentario({ c, procesoId, escribe }: { c: ComentarioInvitado; procesoId: string; escribe: boolean }) {
  const t = useT();
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
        <span className="sutil">{c.destinatario} · {t.fecha(c.creadoEn)}</span>
      </div>
      {c.elementoEtiqueta !== null || c.elementoId !== null
        ? <p className="invitados-ancla">{t('sobre', { elemento: c.elementoEtiqueta || c.elementoId || '' })}</p>
        : null}
      <p className="invitados-comentario-texto">{c.texto}</p>
      <div className="invitados-comentario-pie">
        {escribe ? (
          <label className="invitados-resuelto">
            <input type="checkbox" checked={marcado} disabled={resolver.isPending}
              onChange={(e) => { setMarcado(e.target.checked); resolver.mutate(e.target.checked); }} />
            {t('resuelto')}
          </label>
        ) : resuelto ? <Etiqueta>{t('resuelto')}</Etiqueta> : null}
        {resuelto && <span className="sutil">{t('resueltoPor', { quien: c.resueltoPor ?? '—', fecha: t.fecha(c.resueltoEn) })}</span>}
      </div>
      <ErrorDe error={resolver.error} />
    </li>
  );
}

function Compartir({ procesoId, revisiones, onCerrar }: { procesoId: string; revisiones: Revision[]; onCerrar: () => void }) {
  const t = useT();
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
      <Selector etiqueta={t('version')} value={revisionId} onChange={(e) => setRevisionId(e.target.value)}
        opciones={revisiones.map((r) => ({ valor: r.id, texto: t('opcionVersion', { n: r.numero, estado: t.estado(r.estado), fecha: t.fecha(r.creadaEn) }) }))} />
      <Campo etiqueta={t('paraQuien')} required maxLength={120} autoFocus value={destinatario}
        placeholder={t('paraQuienEjemplo')} onChange={(e) => setDestinatario(e.target.value)}
        ayuda={t('paraQuienAyuda')} />
      <Campo etiqueta={t('dias')} type="number" required min={1} max={90} step={1} value={dias}
        onChange={(e) => setDias(e.target.value)} ayuda={t('diasAyuda')} />
      <label className="casilla invitados-casilla">
        <input type="checkbox" checked={comentarios} onChange={(e) => setComentarios(e.target.checked)} />
        {t('puedeComentar')}
      </label>
      <Aviso tipo="info">{t('queVera')}</Aviso>
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}>{t('crearEnlace')}</Boton>
      </div>
    </form>
  );
}

/** El enlace se muestra una sola vez: en la base solo queda su hash. */
function EnlaceCreado({ url, enlace, numero, onCerrar }: { url: string; enlace: EnlaceInvitado; numero: number | undefined; onCerrar: () => void }) {
  const t = useT();
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="invitados-creado">
      <p>{t.rico('enlaceA', { n: numero ?? '', destinatario: enlace.destinatario })}</p>
      <p className="sutil">{t('hasta', { fecha: t.fecha(enlace.caducaEn) })}</p>
      <Aviso tipo="atencion">{t('soloAhora')}</Aviso>
      <div className="invitados-url">
        <code aria-label={t('enlaceCliente')}>{url}</code>
        <Boton variante="secundario" onClick={() => navigator.clipboard.writeText(url).then(() => setCopiado(true), () => setCopiado(false))}>
          {copiado ? t('copiado') : t('copiar')}
        </Boton>
      </div>
      <div className="acciones acciones-separadas">
        <a className="boton boton-sutil" href={url} target="_blank" rel="noopener noreferrer" title={t('vistaEnEspanol') || undefined}>{t('verComoCliente')}</a>
        <Boton variante="primario" onClick={onCerrar}>{t('hecho')}</Boton>
      </div>
    </div>
  );
}
