// Estado del sistema (solo administradores): servicios, cola de IA, copias de
// seguridad y errores recientes, con avisos. Sustituye a un servicio externo
// de monitorización mientras no haya presupuesto para uno.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type EstadoSistema, type GrupoError } from '../api';
import { fecha } from '../formato';
import { Aviso, Boton, Cargando, Dialogo, ErrorDe, Etiqueta, Vacio, useTitulo } from '../ui';

const bytes = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`;

function hace(segundos: number | null): string {
  if (segundos === null) return 'nunca';
  if (segundos < 90) return `hace ${Math.round(segundos)} s`;
  if (segundos < 5400) return `hace ${Math.round(segundos / 60)} min`;
  if (segundos < 172800) return `hace ${Math.round(segundos / 3600)} h`;
  return `hace ${Math.round(segundos / 86400)} días`;
}

function Tarjeta({ titulo, estado, children }: { titulo: string; estado: 'ok' | 'atencion' | 'error'; children: React.ReactNode }) {
  const texto = { ok: 'Bien', atencion: 'Revisar', error: 'Problema' }[estado];
  return (
    <section className={`tarjeta estado-servicio estado-${estado}`} aria-label={titulo}>
      <header><h2>{titulo}</h2><span className="semaforo">{texto}</span></header>
      <dl>{children}</dl>
    </section>
  );
}

const Dato = ({ nombre, children }: { nombre: string; children: React.ReactNode }) => <><dt>{nombre}</dt><dd>{children}</dd></>;

export function Sistema() {
  useTitulo('Sistema');
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
          <h1>Sistema</h1>
          <p className="sutil">Versión <code>{s.version}</code> · se actualiza cada 15 s · {fecha(new Date().toISOString())}</p>
        </div>
      </div>

      {s.avisos.length === 0
        ? <Aviso tipo="ok">Todo en orden.</Aviso>
        : s.avisos.map((a) => <Aviso key={a.texto} tipo={a.nivel === 'error' ? 'error' : 'atencion'}>{a.texto}</Aviso>)}

      <div className="rejilla-estado">
        <Tarjeta titulo="API" estado="ok">
          <Dato nombre="Activa desde">{fecha(s.api.arrancadaEn)}</Dato>
          <Dato nombre="Node">{s.api.node}</Dato>
        </Tarjeta>
        <Tarjeta titulo="Base de datos" estado={s.baseDeDatos.latenciaMs > 500 ? 'atencion' : 'ok'}>
          <Dato nombre="Respuesta">{s.baseDeDatos.latenciaMs} ms</Dato>
          <Dato nombre="Tamaño">{bytes(s.baseDeDatos.tamanoBytes)}</Dato>
          <Dato nombre="Migraciones">{s.baseDeDatos.migraciones}</Dato>
        </Tarjeta>
        <Tarjeta titulo="Worker de IA" estado={s.worker.vivo ? 'ok' : 'error'}>
          <Dato nombre="Último latido">{hace(s.worker.segundosSinLatido)}</Dato>
          <Dato nombre="Trabajando en">{String(s.worker.detalle?.enCurso ?? '—')} de {String(s.worker.detalle?.concurrencia ?? '—')}</Dato>
        </Tarjeta>
        <Tarjeta titulo="IA" estado={!s.ia.configurada ? 'atencion' : s.ia.fallidas24h > 0 ? 'atencion' : 'ok'}>
          <Dato nombre="Clave">{s.ia.configurada ? 'configurada' : 'sin configurar'}</Dato>
          <Dato nombre="En cola / en curso">{s.ia.enCola} / {s.ia.ejecutando}</Dato>
          <Dato nombre="Últimas 24 h">{s.ia.completadas24h} completadas · {s.ia.fallidas24h} fallidas</Dato>
        </Tarjeta>
        <Tarjeta titulo="Copias de seguridad" estado={estadoRespaldos}>
          {!r.visible ? <Dato nombre="Carpeta">no visible para la API</Dato> : (
            <>
              <Dato nombre="Última">{r.ultimo ? `${fecha(r.ultimo.fecha)} (${bytes(r.ultimo.bytes)})` : 'ninguna'}</Dato>
              <Dato nombre="Guardadas">{r.cantidad}</Dato>
              {r.disco && <Dato nombre="Disco libre">{bytes(r.disco.libreBytes)} de {bytes(r.disco.totalBytes)}</Dato>}
            </>
          )}
        </Tarjeta>
      </div>

      <h2>Errores de los últimos 7 días</h2>
      <p className="sutil">{s.errores.ultimas24h} en las últimas 24 h. Se agrupan los repetidos; pulsa uno para ver el detalle.</p>
      {s.errores.grupos.length === 0 ? <Vacio>Sin errores registrados.</Vacio> : (
        <table className="tabla tabla-compacta">
          <thead><tr><th>Última vez</th><th>Origen</th><th>Error</th><th>Veces</th><th>Dónde</th></tr></thead>
          <tbody>
            {s.errores.grupos.map((g) => (
              <tr key={g.huella}>
                <td className="fecha">{fecha(g.ultima)}</td>
                <td><Etiqueta>{g.origen}</Etiqueta></td>
                <td><button type="button" className="enlace" onClick={() => setGrupo(g)}>{g.mensaje.slice(0, 140)}</button></td>
                <td>{g.veces}</td>
                <td className="detalle-json">{g.ruta ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialogo ancho abierto={!!grupo} titulo="Detalle del error" onCerrar={() => setGrupo(null)}>
        {grupo && <DetalleError grupo={grupo} onCerrar={() => setGrupo(null)} />}
      </Dialogo>
    </>
  );
}

function DetalleError({ grupo, onCerrar }: { grupo: GrupoError; onCerrar: () => void }) {
  const consulta = useQuery({ queryKey: ['sistema', 'error', grupo.huella], queryFn: () => api.repeticionesError(grupo.huella) });
  return (
    <>
      <p><strong>{grupo.mensaje}</strong></p>
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : (
        <ol className="repeticiones">
          {consulta.data.repeticiones.map((x) => (
            <li key={x.id}>
              <p className="sutil">{fecha(x.creadoEn)} · {x.usuario ?? 'sin sesión'} · {x.ruta ?? ''}{x.detalle?.referencia ? ` · referencia ${String(x.detalle.referencia)}` : ''}</p>
              {x.pila && <pre>{x.pila}</pre>}
            </li>
          ))}
        </ol>
      )}
      <div className="acciones"><Boton variante="primario" onClick={onCerrar}>Cerrar</Boton></div>
    </>
  );
}
