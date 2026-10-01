// Consumo de IA de la organización (solo administradores): gasto del mes
// frente al presupuesto, por persona, y las últimas ejecuciones.
import { useQuery } from '@tanstack/react-query';
import { TAREAS_IA, fmtUsd, precioModelo } from '@processiq/ia';
import { api, type EjecucionIa, type EstadoEjecucionIa } from '../api';
import { useT, type TraductorShell } from '../i18n';
import { TAREAS_IA_EN } from '../textos/en';
import { Aviso, Cargando, ErrorDe, Etiqueta, Vacio, useTitulo } from '../ui';

const CLAVES_ESTADO = {
  en_cola: 'ia.estadoEnCola', ejecutando: 'ia.estadoEjecutando', completada: 'ia.estadoCompletada',
  fallida: 'ia.estadoFallida', cancelada: 'ia.estadoCancelada'
} as const satisfies Record<EstadoEjecucionIa, string>;

/** Una matriz con IA (D12) se nombra como su tarea del copiloto: «Matriz RACI», «SIPOC». */
const TAREA_DE_MATRIZ: Readonly<Record<string, string>> = { 'matriz-raci': 'raci', 'matriz-sipoc': 'sipoc' };

function queHizo(e: Pick<EjecucionIa, 'tipo' | 'tarea'>, t: TraductorShell): string {
  if (e.tipo === 'generacion') return t('ia.generar');
  if (e.tipo === 'pains') return t('ia.pains');
  const tarea = TAREA_DE_MATRIZ[e.tarea ?? ''] ?? e.tarea ?? '';
  const etiqueta = TAREAS_IA[tarea]?.etiqueta;
  if (!etiqueta) return t('ia.analisis', { tarea });
  return (t.idioma === 'en' && TAREAS_IA_EN[tarea]) || etiqueta;
}

export function ConsumoIa() {
  const t = useT();
  useTitulo(t('ia.titulo'));
  const estado = useQuery({ queryKey: ['ia', 'estado'], queryFn: api.estadoIa });
  const consumo = useQuery({ queryKey: ['ia', 'consumo'], queryFn: api.consumoIa, refetchInterval: 15_000 });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('ia.titulo')}</h1>
          <p className="sutil">{t('ia.intro')}</p>
        </div>
      </div>
      {estado.data && !estado.data.configurada && (
        <Aviso tipo="atencion">{t.rico('ia.sinConfigurar')}</Aviso>
      )}
      {consumo.isPending ? <Cargando /> : consumo.isError ? <ErrorDe error={consumo.error} /> : (() => {
        const { mes, porUsuario, recientes } = consumo.data;
        const pct = mes.presupuestoUsd > 0 ? Math.min(100, (mes.gastadoUsd / mes.presupuestoUsd) * 100) : 100;
        return (
          <>
            <section className="tarjeta presupuesto" aria-label={t('ia.presupuesto')}>
              <div className="presupuesto-cifras">
                <strong>{fmtUsd(mes.gastadoUsd)}</strong>
                <span className="sutil">{t('ia.deEsteMes', { presupuesto: fmtUsd(mes.presupuestoUsd), tope: fmtUsd(mes.limiteUsuarioUsd) })}</span>
              </div>
              <div className="barra-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <span style={{ width: `${pct}%` }} className={pct >= 90 ? 'alto' : ''} />
              </div>
            </section>

            <h2>{t('ia.porPersona')}</h2>
            {porUsuario.length === 0 ? <Vacio>{t('ia.nadie')}</Vacio> : (
              <table className="tabla">
                <thead><tr><th>{t('ia.persona')}</th><th>{t('ia.ejecuciones')}</th><th>{t('ia.gastoMes')}</th></tr></thead>
                <tbody>
                  {porUsuario.map((u) => (
                    <tr key={u.usuarioId}>
                      <td>{u.nombre} <span className="sutil">{u.email}</span></td>
                      <td>{u.ejecuciones}</td>
                      <td>{fmtUsd(u.costeUsd)}{u.costeUsd >= mes.limiteUsuarioUsd && <> <Etiqueta tono="aviso">{t('ia.enElTope')}</Etiqueta></>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2>{t('ia.ultimas')}</h2>
            {recientes.length === 0 ? <Vacio>{t('ia.sinEjecuciones')}</Vacio> : (
              <table className="tabla tabla-compacta">
                <thead>
                  <tr>
                    <th>{t('comun.fecha')}</th><th>{t('ia.persona')}</th><th>{t('ia.que')}</th><th>{t('ia.modelo')}</th>
                    <th>{t('comun.estado')}</th><th>{t('ia.tokens')}</th><th>{t('ia.coste')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recientes.map((e) => (
                    <tr key={e.id}>
                      <td className="fecha">{t.fecha(e.creadoEn)}</td>
                      <td>{e.usuario}</td>
                      <td>{queHizo(e, t)}</td>
                      <td>{precioModelo(e.modelo).nombre}</td>
                      <td>
                        {t(CLAVES_ESTADO[e.estado])}{e.intentos > 1 && <span className="sutil"> {t('ia.intentos', { n: e.intentos })}</span>}
                        {e.error && e.estado !== 'completada' && <small className="aviso-en-linea" title={e.error}>{e.error.slice(0, 90)}{e.error.length > 90 ? '…' : ''}</small>}
                      </td>
                      <td>{t.numero(e.tokensEntrada)} / {t.numero(e.tokensSalida)}</td>
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
