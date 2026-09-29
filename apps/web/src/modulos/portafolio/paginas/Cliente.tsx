// Un cliente: avance e indicadores de todos sus procesos, y cada proceso con el
// estado de su última revisión. Todo sale de la API; aquí solo se presenta.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { enEditor } from '../../../shell/formato';
import { Cargando, EnlaceEditor, ErrorDe, Etiqueta, Insignia, Vacio, useTitulo } from '../../../shell/ui';
import { apiPortafolio, type ConteoHallazgos, type DetalleCliente, type ProcesoPortafolio } from '../api';
import {
  BarraAvance, CasillaArchivados, Cifra, LeyendaAvance, etiquetaCategoria, etiquetaEjecucion, fuera, nombreCliente, porcentaje
} from '../componentes';
import { useT, type TraductorPortafolio } from '../textos';

export function Cliente({ nombre, archivados, onArchivados }:
  { nombre: string; archivados: boolean; onArchivados: (v: boolean) => void }) {
  const t = useT();
  useTitulo(t('tituloCliente', { cliente: nombreCliente(nombre, t) }));
  const consulta = useQuery({ queryKey: ['portafolio', 'cliente', nombre, archivados], queryFn: () => apiPortafolio.cliente(nombre, archivados) });

  return (
    <>
      <nav className="migas" aria-label={t('ruta')}>
        <Link href="/">{t('titulo')}</Link> <span aria-hidden="true">›</span> <span>{nombreCliente(consulta.data?.cliente ?? nombre, t)}</span>
      </nav>
      {consulta.isPending ? <Cargando /> : consulta.isError ? (
        <>
          <ErrorDe error={consulta.error} />
          {!archivados && <CasillaArchivados valor={archivados} onCambio={onArchivados} />}
        </>
      ) : <Detalle d={consulta.data} archivados={archivados} onArchivados={onArchivados} />}
    </>
  );
}

function Detalle({ d, archivados, onArchivados }: { d: DetalleCliente; archivados: boolean; onArchivados: (v: boolean) => void }) {
  const t = useT();
  const { resumen, indicadores: i } = d;
  const decisiones = i.porTipo.decision ?? 0;
  const eventos = (i.porTipo.start ?? 0) + (i.porTipo.intermediate ?? 0) + (i.porTipo.end ?? 0);
  const sinRevisiones = resumen.procesos - i.procesosConContenido;
  return (
    <>
      <div className="encabezado">
        <div>
          <h1 className={d.cliente ? '' : 'portafolio-sin-cliente'}>{nombreCliente(d.cliente, t)}</h1>
          <p className="sutil">
            {t('nProyectos', { n: resumen.proyectos })} · {t('nProcesos', { n: resumen.procesos })}
            {resumen.actualizadoEn && <> · {t('actualizadoEl', { fecha: t.fecha(resumen.actualizadoEn) })}</>}
          </p>
        </div>
        <div className="acciones"><CasillaArchivados valor={archivados} onCambio={onArchivados} /></div>
      </div>

      {resumen.procesos > 0 && (
        <section className="tarjeta portafolio-bloque" aria-labelledby="t-avance">
          <div className="portafolio-bloque-cabecera">
            <h2 id="t-avance">{t('avance')}</h2>
            <p className="sutil">
              {t('procesosAprobados', { a: resumen.avance.aprobados, n: resumen.procesos, p: porcentaje(resumen.avance.aprobados, resumen.procesos) })}
            </p>
          </div>
          <BarraAvance avance={resumen.avance} grande />
          <LeyendaAvance avance={resumen.avance} />
        </section>
      )}

      {i.procesosConContenido > 0 && (
        <>
          <dl className="portafolio-cifras">
            <Cifra etiqueta={t('actividades')} valor={t.numero(i.actividades)}
              nota={`${t('nDecisiones', { n: decisiones })} · ${t('nEventos', { n: eventos })}`} />
            <Cifra etiqueta={t('roles')} valor={t.numero(i.roles)} nota={t('rolesNota')} />
            <Cifra etiqueta={t('pains')} valor={t.numero(i.pains.total)}
              nota={i.pains.total ? t('painsNota', { p: i.pains.puntuacion, m: i.pains.maxima }) : t('painsNinguno')} />
            <Cifra etiqueta={t('kpisConValor')} valor={t.numero(i.kpis.conValor)}
              nota={i.kpis.definidos ? t('kpisElegidos', { n: i.kpis.definidos }) : t('kpisNinguno')} />
            <Cifra etiqueta={t('hallazgosPlaybook')} valor={t.numero(i.hallazgos.total)} nota={textoGraves(i.hallazgos, t)} />
          </dl>
          <p className="sutil portafolio-nota">
            {t('notaIndicadores', { n: i.procesosConContenido })}
            {sinRevisiones > 0 && ` (${t('notaSinRevisiones', { n: sinRevisiones })})`}.
          </p>

          <div className="portafolio-dos-columnas">
            <section className="tarjeta portafolio-bloque" aria-labelledby="t-ejecucion">
              <h2 id="t-ejecucion">{t('tipoEjecucion')}</h2>
              <Ejecucion ejecucion={i.ejecucion} total={i.actividades} />
            </section>
            <section className="tarjeta portafolio-bloque" aria-labelledby="t-pains">
              <h2 id="t-pains">{t('painsPrincipales')}</h2>
              {i.painsPrincipales.length === 0 ? <p className="sutil">{t('sinPains')}</p> : (
                <table className="tabla tabla-compacta portafolio-pains">
                  <thead><tr><th className="portafolio-num" title={t('puntuacionTitulo')}>{t('puntuacion')}</th><th>{t('pain')}</th><th>{t('donde')}</th></tr></thead>
                  <tbody>
                    {i.painsPrincipales.map((p, k) => (
                      <tr key={k}>
                        <td className="portafolio-num"><strong>{t.numero(p.puntuacion)}</strong><small className="sutil"> {p.severidad}×{p.frecuencia}</small></td>
                        <td>{p.descripcion || <span className="sutil">{t('sinDescripcion')}</span>}<small className="portafolio-categoria">{etiquetaCategoria(p.categoria, t)}</small></td>
                        <td>{p.actividad}<small className="portafolio-categoria"><Link href={fuera.proceso(p.procesoId)}>{p.proceso}</Link></small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}

      <section aria-labelledby="t-procesos">
        <h2 id="t-procesos">{t('procesosPorProyecto')}</h2>
        {d.proyectos.map((p) => (
          <div key={p.id} className="portafolio-proyecto">
            <h3>
              <Link href={fuera.proyecto(p.id)}>{p.nombre}</Link>
              {p.archivado && <Etiqueta tono="aviso">{t('archivado')}</Etiqueta>}
            </h3>
            {p.procesos.length === 0 ? <Vacio>{t('proyectoSinProcesos')}</Vacio> : <TablaProcesos procesos={p.procesos} />}
          </div>
        ))}
      </section>
    </>
  );
}

function textoGraves(h: ConteoHallazgos, t: TraductorPortafolio): string {
  if (h.total === 0) return t('sinObservaciones');
  return `${t('nCriticos', { n: h.critical })} · ${t('nAltos', { n: h.high })}`;
}

function Ejecucion({ ejecucion, total }: { ejecucion: Record<string, number>; total: number }) {
  const t = useT();
  // De más a menos frecuente; «Sin tipo» siempre al final (es un pendiente, no un tipo)
  const filas = Object.entries(ejecucion).sort(([a, x], [b, y]) => Number(a === 'sin_tipo') - Number(b === 'sin_tipo') || y - x);
  if (filas.length === 0) return <p className="sutil">{t('sinActividades')}</p>;
  const maximo = Math.max(...filas.map(([, v]) => v));
  return (
    <table className="portafolio-barras">
      <tbody>
        {filas.map(([tipo, v]) => (
          <tr key={tipo} className={tipo === 'sin_tipo' ? 'portafolio-sin-tipo' : ''}>
            <th scope="row">{etiquetaEjecucion(tipo, t)}</th>
            <td className="portafolio-barras-pista">
              <span style={{ width: `${(v / maximo) * 100}%` }} title={t('barraTitulo', { tipo: etiquetaEjecucion(tipo, t), v, total })} />
            </td>
            <td className="portafolio-num">{t.numero(v)}<small className="sutil"> {t('pct', { p: porcentaje(v, total) })}</small></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaProcesos({ procesos }: { procesos: ProcesoPortafolio[] }) {
  const t = useT();
  return (
    <table className="tabla tabla-compacta portafolio-tabla">
      <thead>
        <tr>
          <th>{t('proceso')}</th><th>{t('ultimaRevision')}</th>
          <th className="portafolio-num">{t('actividades')}</th><th className="portafolio-num">{t('roles')}</th>
          <th className="portafolio-num" title={t('painsTitulo')}>{t('pains')}</th>
          <th className="portafolio-num">{t('kpisConValor')}</th><th className="portafolio-num">{t('hallazgos')}</th>
          <th>{t('actualizado')}</th><th><span className="solo-lector">{t('acciones')}</span></th>
        </tr>
      </thead>
      <tbody>
        {procesos.map((p) => {
          const i = p.indicadores;
          const graves = i ? i.hallazgos.critical + i.hallazgos.high : 0;
          return (
            <tr key={p.id}>
              <td><Link href={fuera.proceso(p.id)}>{p.nombre}</Link></td>
              <td>{p.ultimaRevision ? <>v{p.ultimaRevision.numero} <Insignia estado={p.ultimaRevision.estado} /></> : <span className="sutil">{t('sinRevisiones')}</span>}</td>
              {i ? (
                <>
                  <td className="portafolio-num">{t.numero(i.actividades)}</td>
                  <td className="portafolio-num" title={i.roles.join(', ')}>{t.numero(i.roles.length)}</td>
                  <td className="portafolio-num">{t.numero(i.pains.total)}{i.pains.total > 0 && <small className="sutil"> {t('maximo', { m: i.pains.maxima })}</small>}</td>
                  <td className="portafolio-num">{i.kpis.definidos ? t('xDeY', { a: i.kpis.conValor, b: i.kpis.definidos }) : <span className="sutil">—</span>}</td>
                  <td className="portafolio-num">
                    {t.numero(i.hallazgos.total)}{graves > 0 && <> <Etiqueta tono="aviso">{t('nGraves', { n: graves })}</Etiqueta></>}
                  </td>
                </>
              ) : (
                <td colSpan={5} className="sutil">
                  {p.contenidoInvalido ? t('contenidoInvalido') : t('sinContenido')}
                </td>
              )}
              <td className="fecha">{t.fecha(p.actualizadoEn)}</td>
              <td className="celda-acciones"><EnlaceEditor className="boton boton-sutil" href={enEditor.proceso(p.id)}>{t('abrirEnEditor')}</EnlaceEditor></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
