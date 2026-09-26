// Consumo de IA de la organización (solo administradores): gasto del mes
// frente al presupuesto, por persona, y las últimas ejecuciones.
import { useQuery } from '@tanstack/react-query';
import { TAREAS_IA, fmtUsd, precioModelo } from '@processiq/ia';
import { api, type EjecucionIa, type EstadoEjecucionIa } from '../api';
import { fecha } from '../formato';
import { Aviso, Cargando, ErrorDe, Etiqueta, Vacio, useTitulo } from '../ui';

const ESTADOS_IA: Record<EstadoEjecucionIa, string> = {
  en_cola: 'En cola', ejecutando: 'Ejecutando', completada: 'Completada', fallida: 'Fallida', cancelada: 'Cancelada'
};

function queHizo(e: Pick<EjecucionIa, 'tipo' | 'tarea'>): string {
  if (e.tipo === 'generacion') return 'Generar proceso';
  if (e.tipo === 'pains') return 'Análisis de dolores';
  return TAREAS_IA[e.tarea ?? '']?.etiqueta ?? `Análisis (${e.tarea})`;
}

export function ConsumoIa() {
  useTitulo('Consumo de IA');
  const estado = useQuery({ queryKey: ['ia', 'estado'], queryFn: api.estadoIa });
  const consumo = useQuery({ queryKey: ['ia', 'consumo'], queryFn: api.consumoIa, refetchInterval: 15_000 });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Consumo de IA</h1>
          <p className="sutil">Lo que costó la IA del servidor este mes, a precio de lista de Anthropic. Los topes se configuran en el servidor (.env).</p>
        </div>
      </div>
      {estado.data && !estado.data.configurada && (
        <Aviso tipo="atencion">La IA del servidor no está configurada: falta <code>ANTHROPIC_API_KEY</code> en el archivo <code>.env</code> del servidor.</Aviso>
      )}
      {consumo.isPending ? <Cargando /> : consumo.isError ? <ErrorDe error={consumo.error} /> : (() => {
        const { mes, porUsuario, recientes } = consumo.data;
        const pct = mes.presupuestoUsd > 0 ? Math.min(100, (mes.gastadoUsd / mes.presupuestoUsd) * 100) : 100;
        return (
          <>
            <section className="tarjeta presupuesto" aria-label="Presupuesto del mes">
              <div className="presupuesto-cifras">
                <strong>{fmtUsd(mes.gastadoUsd)}</strong>
                <span className="sutil">de {fmtUsd(mes.presupuestoUsd)} este mes · tope por persona {fmtUsd(mes.limiteUsuarioUsd)}</span>
              </div>
              <div className="barra-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <span style={{ width: `${pct}%` }} className={pct >= 90 ? 'alto' : ''} />
              </div>
            </section>

            <h2>Por persona</h2>
            {porUsuario.length === 0 ? <Vacio>Nadie ha usado la IA del servidor este mes.</Vacio> : (
              <table className="tabla">
                <thead><tr><th>Persona</th><th>Ejecuciones</th><th>Gasto del mes</th></tr></thead>
                <tbody>
                  {porUsuario.map((u) => (
                    <tr key={u.usuarioId}>
                      <td>{u.nombre} <span className="sutil">{u.email}</span></td>
                      <td>{u.ejecuciones}</td>
                      <td>{fmtUsd(u.costeUsd)}{u.costeUsd >= mes.limiteUsuarioUsd && <> <Etiqueta tono="aviso">en el tope</Etiqueta></>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2>Últimas ejecuciones</h2>
            {recientes.length === 0 ? <Vacio>Sin ejecuciones todavía.</Vacio> : (
              <table className="tabla tabla-compacta">
                <thead><tr><th>Fecha</th><th>Persona</th><th>Qué</th><th>Modelo</th><th>Estado</th><th>Tokens (entrada / salida)</th><th>Coste</th></tr></thead>
                <tbody>
                  {recientes.map((e) => (
                    <tr key={e.id}>
                      <td className="fecha">{fecha(e.creadoEn)}</td>
                      <td>{e.usuario}</td>
                      <td>{queHizo(e)}</td>
                      <td>{precioModelo(e.modelo).nombre}</td>
                      <td>
                        {ESTADOS_IA[e.estado]}{e.intentos > 1 && <span className="sutil"> ({e.intentos} intentos)</span>}
                        {e.error && e.estado !== 'completada' && <small className="aviso-en-linea" title={e.error}>{e.error.slice(0, 90)}{e.error.length > 90 ? '…' : ''}</small>}
                      </td>
                      <td>{e.tokensEntrada.toLocaleString('es-PE')} / {e.tokensSalida.toLocaleString('es-PE')}</td>
                      <td>{fmtUsd(e.costeUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        );
      })()}
    </>
  );
}
