// Portafolio: los clientes de mis proyectos (todos, si soy administrador) y el
// avance de sus procesos hacia la aprobación.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useUsuario } from '../../../shell/sesion';
import { Cargando, ErrorDe, Vacio, useTitulo } from '../../../shell/ui';
import { apiPortafolio, type Avance } from '../api';
import { BarraAvance, CasillaArchivados, Cifra, LeyendaAvance, nombreCliente, porcentaje, rutaCliente } from '../componentes';
import { useT } from '../textos';

export function Tablero({ archivados, onArchivados }: { archivados: boolean; onArchivados: (v: boolean) => void }) {
  const t = useT();
  useTitulo(t('titulo'));
  const usuario = useUsuario();
  const consulta = useQuery({ queryKey: ['portafolio', 'clientes', archivados], queryFn: () => apiPortafolio.clientes(archivados) });
  const clientes = consulta.data?.clientes ?? [];
  const total = clientes.reduce((x, c) => ({
    proyectos: x.proyectos + c.proyectos, procesos: x.procesos + c.procesos,
    aprobados: x.aprobados + c.avance.aprobados, enRevision: x.enRevision + c.avance.enRevision
  }), { proyectos: 0, procesos: 0, aprobados: 0, enRevision: 0 });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('titulo')}</h1>
          <p className="sutil">
            {t('introEstado')}{' '}
            {usuario.rol === 'admin' ? t('introAdmin') : t('introMiembro')}
          </p>
        </div>
        <div className="acciones"><CasillaArchivados valor={archivados} onCambio={onArchivados} /></div>
      </div>

      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : clientes.length === 0 ? (
        <Vacio>{archivados ? t('vacio') : t('vacioSinArchivados')}</Vacio>
      ) : (
        <>
          <dl className="portafolio-cifras">
            <Cifra etiqueta={t('clientes')} valor={t.numero(clientes.length)} nota={t('nProyectos', { n: total.proyectos })} />
            <Cifra etiqueta={t('procesos')} valor={t.numero(total.procesos)} />
            <Cifra etiqueta={t('aprobados')} valor={t.numero(total.aprobados)} nota={t('pctProcesos', { p: porcentaje(total.aprobados, total.procesos) })} />
            <Cifra etiqueta={t('enRevision')} valor={t.numero(total.enRevision)} nota={t('esperanAprobacion')} />
          </dl>

          <table className="tabla portafolio-tabla">
            <thead>
              <tr>
                <th>{t('cliente')}</th>
                <th className="portafolio-num">{t('proyectos')}</th>
                <th className="portafolio-num">{t('procesos')}</th>
                <th className="portafolio-col-avance">{t('avance')}</th>
                <th>{t('actualizado')}</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.cliente}>
                  <td>
                    <Link href={rutaCliente(c.cliente)} className={c.cliente ? 'portafolio-cliente' : 'portafolio-cliente portafolio-sin-cliente'}>
                      {nombreCliente(c.cliente, t)}
                    </Link>
                  </td>
                  <td className="portafolio-num">{t.numero(c.proyectos)}</td>
                  <td className="portafolio-num">{t.numero(c.procesos)}</td>
                  <td><CeldaAvance avance={c.avance} procesos={c.procesos} /></td>
                  <td className="fecha">{t.fecha(c.actualizadoEn)}</td>
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
  const t = useT();
  if (procesos === 0) return <span className="sutil">{t('sinProcesos')}</span>;
  return (
    <div className="portafolio-avance">
      <BarraAvance avance={avance} />
      <span className="portafolio-avance-texto">{t('aprobadosDe', { a: avance.aprobados, n: procesos })}</span>
    </div>
  );
}
