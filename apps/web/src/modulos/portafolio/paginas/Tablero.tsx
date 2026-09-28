// Portafolio: los clientes de mis proyectos (todos, si soy administrador) y el
// avance de sus procesos hacia la aprobación.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { fecha } from '../../../shell/formato';
import { useUsuario } from '../../../shell/sesion';
import { Cargando, ErrorDe, Vacio, useTitulo } from '../../../shell/ui';
import { apiPortafolio, type Avance } from '../api';
import {
  BarraAvance, CasillaArchivados, Cifra, LeyendaAvance, n, nombreCliente, plural, porcentaje, rutaCliente
} from '../componentes';

export function Tablero({ archivados, onArchivados }: { archivados: boolean; onArchivados: (v: boolean) => void }) {
  useTitulo('Portafolio');
  const usuario = useUsuario();
  const consulta = useQuery({ queryKey: ['portafolio', 'clientes', archivados], queryFn: () => apiPortafolio.clientes(archivados) });
  const clientes = consulta.data?.clientes ?? [];
  const total = clientes.reduce((t, c) => ({
    proyectos: t.proyectos + c.proyectos, procesos: t.procesos + c.procesos,
    aprobados: t.aprobados + c.avance.aprobados, enRevision: t.enRevision + c.avance.enRevision
  }), { proyectos: 0, procesos: 0, aprobados: 0, enRevision: 0 });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Portafolio</h1>
          <p className="sutil">
            El estado de los procesos de cada cliente según su última revisión.{' '}
            {usuario.rol === 'admin' ? 'Incluye todos los proyectos de la organización.' : 'Incluye los proyectos en los que participas.'}
          </p>
        </div>
        <div className="acciones"><CasillaArchivados valor={archivados} onCambio={onArchivados} /></div>
      </div>

      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : clientes.length === 0 ? (
        <Vacio>
          Todavía no hay clientes que mostrar. El portafolio agrupa los proyectos por su campo «Cliente»
          {archivados ? '.' : ' (sin contar los archivados).'}
        </Vacio>
      ) : (
        <>
          <dl className="portafolio-cifras">
            <Cifra etiqueta="Clientes" valor={n(clientes.length)} nota={plural(total.proyectos, 'proyecto', 'proyectos')} />
            <Cifra etiqueta="Procesos" valor={n(total.procesos)} />
            <Cifra etiqueta="Aprobados" valor={n(total.aprobados)} nota={`${porcentaje(total.aprobados, total.procesos)} % de los procesos`} />
            <Cifra etiqueta="En revisión" valor={n(total.enRevision)} nota="esperan aprobación" />
          </dl>

          <table className="tabla portafolio-tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="portafolio-num">Proyectos</th>
                <th className="portafolio-num">Procesos</th>
                <th className="portafolio-col-avance">Avance hacia la aprobación</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.cliente}>
                  <td>
                    <Link href={rutaCliente(c.cliente)} className={c.cliente ? 'portafolio-cliente' : 'portafolio-cliente portafolio-sin-cliente'}>
                      {nombreCliente(c.cliente)}
                    </Link>
                  </td>
                  <td className="portafolio-num">{n(c.proyectos)}</td>
                  <td className="portafolio-num">{n(c.procesos)}</td>
                  <td><CeldaAvance avance={c.avance} procesos={c.procesos} /></td>
                  <td className="fecha">{fecha(c.actualizadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <LeyendaAvance />
        </>
      )}
    </>
  );
}

function CeldaAvance({ avance, procesos }: { avance: Avance; procesos: number }) {
  if (procesos === 0) return <span className="sutil">Sin procesos</span>;
  return (
    <div className="portafolio-avance">
      <BarraAvance avance={avance} />
      <span className="portafolio-avance-texto">{n(avance.aprobados)} de {plural(procesos, 'aprobado', 'aprobados')}</span>
    </div>
  );
}
