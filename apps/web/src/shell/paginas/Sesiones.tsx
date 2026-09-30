// Mis sesiones abiertas: dónde está abierta la cuenta y cerrar las que sobran
// (una, o todas menos esta). La API nunca devuelve el token ni su hash.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SesionAbierta } from '../api';
import { useT, type TraductorShell } from '../i18n';
import { Aviso, Boton, Cargando, ErrorDe, Etiqueta, useTitulo } from '../ui';

const CLAVE = ['sesiones'] as const;

/** «Chrome en Windows», «Firefox» o «Navegador desconocido». */
export function nombreNavegador(s: Pick<SesionAbierta, 'navegador' | 'sistema'>, t: TraductorShell): string {
  const navegador = s.navegador ?? t('sesiones.desconocido');
  return s.sistema ? t('sesiones.navegadorEn', { navegador, sistema: s.sistema }) : navegador;
}

export function Sesiones() {
  const t = useT();
  useTitulo(t('sesiones.titulo'));
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: CLAVE, queryFn: api.sesiones });
  // Lo que se cerró (se traduce al pintar: sigue al idioma si se cambia después)
  const [cerradas, setCerradas] = useState<{ una: true } | { n: number } | null>(null);

  const refrescar = () => cliente.invalidateQueries({ queryKey: CLAVE });
  const cerrarUna = useMutation({
    mutationFn: (id: string) => api.cerrarSesion(id),
    onMutate: () => setCerradas(null),
    onSuccess: () => setCerradas({ una: true }),
    onSettled: refrescar
  });
  const cerrarOtras = useMutation({
    mutationFn: api.cerrarOtrasSesiones,
    onMutate: () => setCerradas(null),
    onSuccess: (r) => setCerradas({ n: r.cerradas }),
    onSettled: refrescar
  });

  const lista = consulta.data?.sesiones ?? [];
  const hayOtras = lista.some((s) => !s.actual);
  const ocupado = cerrarUna.isPending || cerrarOtras.isPending;

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('sesiones.titulo')}</h1>
          <p className="sutil">{t('sesiones.intro')}</p>
        </div>
        <Boton variante="peligro" disabled={!hayOtras || ocupado} cargando={cerrarOtras.isPending} onClick={() => cerrarOtras.mutate()}>
          {t('sesiones.cerrarOtras')}
        </Boton>
      </div>
      {cerradas && <Aviso tipo="ok">{'una' in cerradas ? t('sesiones.cerrada') : t('sesiones.cerradas', cerradas)}</Aviso>}
      <ErrorDe error={cerrarUna.error ?? cerrarOtras.error} />
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : (
        <>
          <table className="tabla">
            <thead>
              <tr>
                <th>{t('sesiones.navegador')}</th><th>{t('sesiones.ip')}</th><th>{t('sesiones.inicio')}</th><th>{t('sesiones.caduca')}</th>
                <th><span className="solo-lector">{t('comun.acciones')}</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => {
                const navegador = nombreNavegador(s, t);
                return (
                  <tr key={s.id}>
                    <td>{navegador}{s.actual && <> <Etiqueta>{t('sesiones.estaSesion')}</Etiqueta></>}</td>
                    <td>{s.ip ?? '—'}</td>
                    <td className="fecha">{t.fecha(s.creadaEn)}</td>
                    <td className="fecha">{t.fecha(s.expiraEn)}</td>
                    <td className="celda-acciones">
                      {!s.actual && (
                        <Boton variante="sutil" disabled={ocupado} aria-label={t('sesiones.cerrarDe', { navegador })} onClick={() => cerrarUna.mutate(s.id)}>
                          {t('sesiones.cerrar')}
                        </Boton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!hayOtras && <p className="sutil">{t('sesiones.soloEsta')}</p>}
          <p className="sutil">{t('sesiones.nota')}</p>
        </>
      )}
    </>
  );
}
