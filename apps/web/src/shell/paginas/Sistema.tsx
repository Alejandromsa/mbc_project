// Estado del sistema (solo administradores): servicios, cola de IA, copias de
// seguridad y errores recientes, con avisos. Sustituye a un servicio externo
// de monitorización mientras no haya presupuesto para uno.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type EstadoSistema, type GrupoError } from '../api';
import { useT, type TraductorShell } from '../i18n';
import { avisoDeSistema } from '../mensajes';
import { Aviso, Boton, Cargando, Dialogo, ErrorDe, Etiqueta, Vacio, useTitulo } from '../ui';

const bytes = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`;

function hace(segundos: number | null, t: TraductorShell): string {
  if (segundos === null) return t('sistema.nunca');
  if (segundos < 90) return t('sistema.haceSegundos', { n: Math.round(segundos) });
  if (segundos < 5400) return t('sistema.haceMinutos', { n: Math.round(segundos / 60) });
  if (segundos < 172800) return t('sistema.haceHoras', { n: Math.round(segundos / 3600) });
  return t('sistema.haceDias', { n: Math.round(segundos / 86400) });
}

function Tarjeta({ titulo, estado, children }: { titulo: string; estado: 'ok' | 'atencion' | 'error'; children: React.ReactNode }) {
  const t = useT();
  const texto = { ok: t('sistema.bien'), atencion: t('sistema.revisar'), error: t('sistema.problema') }[estado];
  return (
    <section className={`tarjeta estado-servicio estado-${estado}`} aria-label={titulo}>
      <header><h2>{titulo}</h2><span className="semaforo">{texto}</span></header>
      <dl>{children}</dl>
    </section>
  );
}

const Dato = ({ nombre, children }: { nombre: string; children: React.ReactNode }) => <><dt>{nombre}</dt><dd>{children}</dd></>;

export function Sistema() {
  const t = useT();
  useTitulo(t('sistema.titulo'));
  const consulta = useQuery({ queryKey: ['sistema'], queryFn: api.sistema, refetchInterval: 15_000 });
  const [grupo, setGrupo] = useState<GrupoError | null>(null);

  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) return <ErrorDe error={consulta.error} />;
  const s: EstadoSistema = consulta.data;
  const r = s.respaldos;
  const estadoRespaldos = !r.visible ? 'atencion' : !r.ultimo || (r.horasDesdeUltimo ?? 0) > 26 ? 'error' : 'ok';

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('sistema.titulo')}</h1>
          <p className="sutil">{t.rico('sistema.version', { version: s.version, fecha: t.fecha(new Date().toISOString()) })}</p>
        </div>
      </div>

      {s.avisos.length === 0
        ? <Aviso tipo="ok">{t('sistema.todoEnOrden')}</Aviso>
        : s.avisos.map((a) => <Aviso key={a.texto} tipo={a.nivel === 'error' ? 'error' : 'atencion'}>{avisoDeSistema(a.texto, t.idioma)}</Aviso>)}

      <div className="rejilla-estado">
        <Tarjeta titulo={t('sistema.api')} estado="ok">
          <Dato nombre={t('sistema.activaDesde')}>{t.fecha(s.api.arrancadaEn)}</Dato>
          <Dato nombre={t('sistema.node')}>{s.api.node}</Dato>
        </Tarjeta>
        <Tarjeta titulo={t('sistema.baseDeDatos')} estado={s.baseDeDatos.latenciaMs > 500 ? 'atencion' : 'ok'}>
          <Dato nombre={t('sistema.respuesta')}>{s.baseDeDatos.latenciaMs} ms</Dato>
          <Dato nombre={t('sistema.tamano')}>{bytes(s.baseDeDatos.tamanoBytes)}</Dato>
          <Dato nombre={t('sistema.migraciones')}>{s.baseDeDatos.migraciones}</Dato>
        </Tarjeta>
        <Tarjeta titulo={t('sistema.worker')} estado={s.worker.vivo ? 'ok' : 'error'}>
          <Dato nombre={t('sistema.ultimoLatido')}>{hace(s.worker.segundosSinLatido, t)}</Dato>
          <Dato nombre={t('sistema.trabajandoEn')}>
            {t('comun.xDeY', { a: String(s.worker.detalle?.enCurso ?? '—'), b: String(s.worker.detalle?.concurrencia ?? '—') })}
          </Dato>
        </Tarjeta>
        <Tarjeta titulo={t('sistema.ia')} estado={!s.ia.configurada ? 'atencion' : s.ia.fallidas24h > 0 ? 'atencion' : 'ok'}>
          <Dato nombre={t('sistema.clave')}>{s.ia.configurada ? t('sistema.configurada') : t('sistema.sinConfigurar')}</Dato>
          <Dato nombre={t('sistema.enCola')}>{s.ia.enCola} / {s.ia.ejecutando}</Dato>
          <Dato nombre={t('sistema.ultimas24')}>{t('sistema.completadasFallidas', { completadas: s.ia.completadas24h, fallidas: s.ia.fallidas24h })}</Dato>
        </Tarjeta>
        <Tarjeta titulo={t('sistema.copias')} estado={estadoRespaldos}>
          {!r.visible ? <Dato nombre={t('sistema.carpeta')}>{t('sistema.noVisible')}</Dato> : (
            <>
              <Dato nombre={t('sistema.ultima')}>{r.ultimo ? `${t.fecha(r.ultimo.fecha)} (${bytes(r.ultimo.bytes)})` : t('sistema.ninguna')}</Dato>
              <Dato nombre={t('sistema.guardadas')}>{r.cantidad}</Dato>
              {r.disco && <Dato nombre={t('sistema.discoLibre')}>{t('comun.xDeY', { a: bytes(r.disco.libreBytes), b: bytes(r.disco.totalBytes) })}</Dato>}
            </>
          )}
        </Tarjeta>
      </div>

      <h2>{t('sistema.errores')}</h2>
      <p className="sutil">{t('sistema.erroresIntro', { n: s.errores.ultimas24h })}</p>
      {s.errores.grupos.length === 0 ? <Vacio>{t('sistema.sinErrores')}</Vacio> : (
        <table className="tabla tabla-compacta">
          <thead>
            <tr>
              <th>{t('sistema.ultimaVez')}</th><th>{t('sistema.origen')}</th><th>{t('sistema.error')}</th>
              <th>{t('sistema.veces')}</th><th>{t('sistema.donde')}</th>
            </tr>
          </thead>
          <tbody>
            {s.errores.grupos.map((g) => (
              <tr key={g.huella}>
                <td className="fecha">{t.fecha(g.ultima)}</td>
                <td><Etiqueta>{g.origen}</Etiqueta></td>
                <td><button type="button" className="enlace" onClick={() => setGrupo(g)}>{g.mensaje.slice(0, 140)}</button></td>
                <td>{g.veces}</td>
                <td className="detalle-json">{g.ruta ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialogo ancho abierto={!!grupo} titulo={t('sistema.detalle')} onCerrar={() => setGrupo(null)}>
        {grupo && <DetalleError grupo={grupo} onCerrar={() => setGrupo(null)} />}
      </Dialogo>
    </>
  );
}

function DetalleError({ grupo, onCerrar }: { grupo: GrupoError; onCerrar: () => void }) {
  const t = useT();
  const consulta = useQuery({ queryKey: ['sistema', 'error', grupo.huella], queryFn: () => api.repeticionesError(grupo.huella) });
  return (
    <>
      <p><strong>{grupo.mensaje}</strong></p>
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : (
        <ol className="repeticiones">
          {consulta.data.repeticiones.map((x) => (
            <li key={x.id}>
              <p className="sutil">
                {t.fecha(x.creadoEn)} · {x.usuario ?? t('sistema.sinSesion')} · {x.ruta ?? ''}
                {x.detalle?.referencia ? ` · ${t('sistema.referencia', { referencia: String(x.detalle.referencia) })}` : ''}
              </p>
              {x.pila && <pre>{x.pila}</pre>}
            </li>
          ))}
        </ol>
      )}
      <div className="acciones"><Boton variante="primario" onClick={onCerrar}>{t('comun.cerrar')}</Boton></div>
    </>
  );
}
