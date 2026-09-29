// Un cliente: avance e indicadores de todos sus procesos, y cada proceso con el
// estado de su última revisión. Todo sale de la API; aquí solo se presenta.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { enEditor, fecha } from '../../../shell/formato';
import { Cargando, ErrorDe, Etiqueta, Insignia, Vacio, useTitulo } from '../../../shell/ui';
import { apiPortafolio, type ConteoHallazgos, type DetalleCliente, type ProcesoPortafolio } from '../api';
import {
  BarraAvance, CasillaArchivados, Cifra, LeyendaAvance, etiquetaCategoria, etiquetaEjecucion, fuera, n, nombreCliente, plural, porcentaje
} from '../componentes';

export function Cliente({ nombre, archivados, onArchivados }:
  { nombre: string; archivados: boolean; onArchivados: (v: boolean) => void }) {
  useTitulo(`${nombreCliente(nombre)} · Portafolio`);
  const consulta = useQuery({ queryKey: ['portafolio', 'cliente', nombre, archivados], queryFn: () => apiPortafolio.cliente(nombre, archivados) });

  return (
    <>
      <nav className="migas" aria-label="Ruta">
        <Link href="/">Portafolio</Link> <span aria-hidden="true">›</span> <span>{nombreCliente(consulta.data?.cliente ?? nombre)}</span>
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
  const { resumen, indicadores: i } = d;
  const decisiones = i.porTipo.decision ?? 0;
  const eventos = (i.porTipo.start ?? 0) + (i.porTipo.intermediate ?? 0) + (i.porTipo.end ?? 0);
  return (
    <>
      <div className="encabezado">
        <div>
          <h1 className={d.cliente ? '' : 'portafolio-sin-cliente'}>{nombreCliente(d.cliente)}</h1>
          <p className="sutil">
            {plural(resumen.proyectos, 'proyecto', 'proyectos')} · {plural(resumen.procesos, 'proceso', 'procesos')}
            {resumen.actualizadoEn && <> · Actualizado el {fecha(resumen.actualizadoEn)}</>}
          </p>
        </div>
        <div className="acciones"><CasillaArchivados valor={archivados} onCambio={onArchivados} /></div>
      </div>

      {resumen.procesos > 0 && (
        <section className="tarjeta portafolio-bloque" aria-labelledby="t-avance">
          <div className="portafolio-bloque-cabecera">
            <h2 id="t-avance">Avance hacia la aprobación</h2>
            <p className="sutil">
              {n(resumen.avance.aprobados)} de {plural(resumen.procesos, 'proceso aprobado', 'procesos aprobados')} ({porcentaje(resumen.avance.aprobados, resumen.procesos)} %)
            </p>
          </div>
          <BarraAvance avance={resumen.avance} grande />
          <LeyendaAvance avance={resumen.avance} />
        </section>
      )}

      {i.procesosConContenido > 0 && (
        <>
          <dl className="portafolio-cifras">
            <Cifra etiqueta="Actividades" valor={n(i.actividades)}
              nota={`${plural(decisiones, 'decisión', 'decisiones')} · ${plural(eventos, 'evento', 'eventos')}`} />
            <Cifra etiqueta="Roles" valor={n(i.roles)} nota="responsables distintos (carriles)" />
            <Cifra etiqueta="Pains" valor={n(i.pains.total)}
              nota={i.pains.total ? `puntuación ${n(i.pains.puntuacion)} · máx. ${n(i.pains.maxima)} de 25` : 'ninguno registrado'} />
            <Cifra etiqueta="KPIs con valor" valor={n(i.kpis.conValor)}
              nota={i.kpis.definidos ? `de ${plural(i.kpis.definidos, 'KPI elegido', 'KPIs elegidos')}` : 'ningún KPI elegido'} />
            <Cifra etiqueta="Hallazgos del Playbook" valor={n(i.hallazgos.total)} nota={textoGraves(i.hallazgos)} />
          </dl>
          <p className="sutil portafolio-nota">
            Indicadores de la última revisión de {plural(i.procesosConContenido, 'proceso', 'procesos')}
            {i.procesosConContenido < resumen.procesos && ` (${plural(resumen.procesos - i.procesosConContenido, 'proceso aún no tiene', 'procesos aún no tienen')} revisiones)`}.
          </p>

          <div className="portafolio-dos-columnas">
            <section className="tarjeta portafolio-bloque" aria-labelledby="t-ejecucion">
              <h2 id="t-ejecucion">Tipo de ejecución de las actividades</h2>
              <Ejecucion ejecucion={i.ejecucion} total={i.actividades} />
            </section>
            <section className="tarjeta portafolio-bloque" aria-labelledby="t-pains">
              <h2 id="t-pains">Pains principales</h2>
              {i.painsPrincipales.length === 0 ? <p className="sutil">Ningún proceso tiene pains registrados.</p> : (
                <table className="tabla tabla-compacta portafolio-pains">
                  <thead><tr><th className="portafolio-num" title="Severidad × frecuencia (máximo 25)">Puntuación</th><th>Pain</th><th>Dónde</th></tr></thead>
                  <tbody>
                    {i.painsPrincipales.map((p, k) => (
                      <tr key={k}>
                        <td className="portafolio-num"><strong>{n(p.puntuacion)}</strong><small className="sutil"> {p.severidad}×{p.frecuencia}</small></td>
                        <td>{p.descripcion || <span className="sutil">Sin descripción</span>}<small className="portafolio-categoria">{etiquetaCategoria(p.categoria)}</small></td>
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
        <h2 id="t-procesos">Procesos por proyecto</h2>
        {d.proyectos.map((p) => (
          <div key={p.id} className="portafolio-proyecto">
            <h3>
              <Link href={fuera.proyecto(p.id)}>{p.nombre}</Link>
              {p.archivado && <Etiqueta tono="aviso">Archivado</Etiqueta>}
            </h3>
            {p.procesos.length === 0 ? <Vacio>Este proyecto aún no tiene procesos.</Vacio> : <TablaProcesos procesos={p.procesos} />}
          </div>
        ))}
      </section>
    </>
  );
}

const GRAVES: [keyof ConteoHallazgos, string, string][] = [['critical', 'crítico', 'críticos'], ['high', 'alto', 'altos']];

function textoGraves(h: ConteoHallazgos): string {
  if (h.total === 0) return 'sin observaciones';
  return GRAVES.map(([s, uno, varios]) => plural(h[s], uno, varios)).join(' · ');
}

function Ejecucion({ ejecucion, total }: { ejecucion: Record<string, number>; total: number }) {
  // De más a menos frecuente; «Sin tipo» siempre al final (es un pendiente, no un tipo)
  const filas = Object.entries(ejecucion).sort(([a, x], [b, y]) => Number(a === 'sin_tipo') - Number(b === 'sin_tipo') || y - x);
  if (filas.length === 0) return <p className="sutil">Los procesos no tienen actividades.</p>;
  const maximo = Math.max(...filas.map(([, v]) => v));
  return (
    <table className="portafolio-barras">
      <tbody>
        {filas.map(([tipo, v]) => (
          <tr key={tipo} className={tipo === 'sin_tipo' ? 'portafolio-sin-tipo' : ''}>
            <th scope="row">{etiquetaEjecucion(tipo)}</th>
            <td className="portafolio-barras-pista">
              <span style={{ width: `${(v / maximo) * 100}%` }} title={`${etiquetaEjecucion(tipo)}: ${n(v)} de ${n(total)} actividades`} />
            </td>
            <td className="portafolio-num">{n(v)}<small className="sutil"> {porcentaje(v, total)} %</small></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaProcesos({ procesos }: { procesos: ProcesoPortafolio[] }) {
  return (
    <table className="tabla tabla-compacta portafolio-tabla">
      <thead>
        <tr>
          <th>Proceso</th><th>Última revisión</th>
          <th className="portafolio-num">Actividades</th><th className="portafolio-num">Roles</th>
          <th className="portafolio-num" title="Cantidad y la mayor puntuación (severidad × frecuencia)">Pains</th>
          <th className="portafolio-num">KPIs con valor</th><th className="portafolio-num">Hallazgos</th>
          <th>Actualizado</th><th><span className="solo-lector">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {procesos.map((p) => {
          const i = p.indicadores;
          const graves = i ? i.hallazgos.critical + i.hallazgos.high : 0;
          return (
            <tr key={p.id}>
              <td><Link href={fuera.proceso(p.id)}>{p.nombre}</Link></td>
              <td>{p.ultimaRevision ? <>v{p.ultimaRevision.numero} <Insignia estado={p.ultimaRevision.estado} /></> : <span className="sutil">Sin revisiones</span>}</td>
              {i ? (
                <>
                  <td className="portafolio-num">{n(i.actividades)}</td>
                  <td className="portafolio-num" title={i.roles.join(', ')}>{n(i.roles.length)}</td>
                  <td className="portafolio-num">{n(i.pains.total)}{i.pains.total > 0 && <small className="sutil"> máx. {n(i.pains.maxima)}</small>}</td>
                  <td className="portafolio-num">{i.kpis.definidos ? `${n(i.kpis.conValor)} de ${n(i.kpis.definidos)}` : <span className="sutil">—</span>}</td>
                  <td className="portafolio-num">
                    {n(i.hallazgos.total)}{graves > 0 && <> <Etiqueta tono="aviso">{plural(graves, 'grave', 'graves')}</Etiqueta></>}
                  </td>
                </>
              ) : (
                <td colSpan={5} className="sutil">
                  {p.contenidoInvalido ? 'No se pudo leer el contenido de la última revisión.' : 'Sin contenido todavía.'}
                </td>
              )}
              <td className="fecha">{fecha(p.actualizadoEn)}</td>
              <td className="celda-acciones"><a className="boton boton-sutil" href={enEditor.proceso(p.id)}>Abrir en el editor</a></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
