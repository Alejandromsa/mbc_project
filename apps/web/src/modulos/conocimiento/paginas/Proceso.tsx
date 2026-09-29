// Un proceso visto desde Conocimiento: los procesos parecidos de otros
// proyectos y el comparativo con el marco de referencia de la organización.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { enEditor } from '../../../shell/formato';
import { useUsuario } from '../../../shell/sesion';
import { Aviso, Cargando, EnlaceEditor, ErrorDe, Etiqueta, Selector, Vacio, useTitulo } from '../../../shell/ui';
import { apiConocimiento, type CoberturaCategoria, type ProcesoParecido } from '../api';
import { Barra, PestanasConocimiento, fuera, pct } from '../componentes';
import { useT, type TraductorConocimiento } from '../textos';

const umbrales = (t: TraductorConocimiento) => [
  { valor: '0.25', texto: t('umbralAmplio') },
  { valor: '0.35', texto: t('umbralNormal') },
  { valor: '0.5', texto: t('umbralEstricto') },
  { valor: '0.65', texto: t('umbralMuyEstricto') }
];

export function Proceso({ id }: { id: string }) {
  const t = useT();
  const parecidos = useQuery({ queryKey: ['conocimiento', 'parecidos', id], queryFn: () => apiConocimiento.parecidos(id) });
  useTitulo(parecidos.data?.nombre ?? t('proceso'));

  if (parecidos.isPending) return <Cargando />;
  if (parecidos.isError) return <><PestanasConocimiento /><ErrorDe error={parecidos.error} /></>;
  const { nombre, proceso } = parecidos.data;

  return (
    <>
      <nav className="migas" aria-label={t('ruta')}>
        <Link href="/">{t('titulo')}</Link> <span aria-hidden="true">›</span> <span>{nombre}</span>
      </nav>
      <div className="encabezado">
        <div>
          <h1>{nombre}</h1>
          {proceso && (
            <p className="sutil">
              <Link href={fuera.proyecto(proceso.proyecto.id)}>{proceso.proyecto.nombre}</Link>
              {proceso.proyecto.cliente && ` · ${proceso.proyecto.cliente}`} · {t('ultimaRevision', { n: proceso.revision.numero })}
            </p>
          )}
        </div>
        <div className="acciones">
          <Link href={fuera.proceso(id)} className="boton boton-secundario">{t('verRevisiones')}</Link>
          <EnlaceEditor className="boton boton-primario" href={enEditor.proceso(id)}>{t('abrirEnEditor')}</EnlaceEditor>
        </div>
      </div>
      <PestanasConocimiento />

      {!proceso ? (
        <Vacio>{t('sinRevisiones')}</Vacio>
      ) : (
        <div className="conocimiento-detalle">
          <section aria-labelledby="conocimiento-t-parecidos">
            <h2 id="conocimiento-t-parecidos">{t('parecidos')}</h2>
            <p className="sutil">{t('parecidosIntro')}</p>
            <ListaParecidos lista={parecidos.data.parecidos} />
          </section>
          <section aria-labelledby="conocimiento-t-comparativo">
            <h2 id="conocimiento-t-comparativo">{t('comparativo')}</h2>
            <Comparativo id={id} />
          </section>
        </div>
      )}
    </>
  );
}

const grado = (p: number, t: TraductorConocimiento) => (p >= 0.6 ? t('muyParecido') : p >= 0.35 ? t('parecido') : t('algoEnComun'));

function ListaParecidos({ lista }: { lista: ProcesoParecido[] }) {
  const t = useT();
  if (!lista.length) return <Vacio>{t('sinParecidos')}</Vacio>;
  return (
    <ol className="conocimiento-parecidos">
      {lista.map((p) => {
        const { actividades, sistemas, roles } = p.enComun;
        const nada = !actividades.length && !sistemas.length && !roles.length;
        return (
          <li key={p.procesoId} className="tarjeta">
            <div className="conocimiento-parecido-cabeza">
              <div>
                <h3><Link href={`/proceso/${p.procesoId}`}>{p.nombre}</Link></h3>
                <span className="conocimiento-meta">
                  {p.proyecto.nombre}{p.proyecto.cliente && ` · ${p.proyecto.cliente}`}
                  {p.proyecto.archivado && <> <Etiqueta tono="aviso">{t('archivado')}</Etiqueta></>}
                </span>
              </div>
              <div className="conocimiento-parecido-valor">
                <strong>{pct(p.parecido, t)}</strong>
                <small>{grado(p.parecido, t)}</small>
                <Barra valor={p.parecido} etiqueta={t('parecidoEtiqueta', { p: pct(p.parecido, t) })} />
              </div>
            </div>
            {nada ? (
              <p className="sutil conocimiento-comun">{t('nadaEnComun')}</p>
            ) : (
              <dl className="conocimiento-comun">
                <EnComun titulo={t('actividadesEnComun')} valores={actividades} />
                <EnComun titulo={t('sistemasEnComun')} valores={sistemas} />
                <EnComun titulo={t('rolesEnComun')} valores={roles} />
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function EnComun({ titulo, valores }: { titulo: string; valores: string[] }) {
  const t = useT();
  if (!valores.length) return null;
  const MAX = 6;
  return (
    <>
      <dt>{titulo}</dt>
      <dd>
        <ul className="conocimiento-chips">
          {valores.slice(0, MAX).map((v) => <li key={v}>{v}</li>)}
          {valores.length > MAX && <li className="conocimiento-chip-mas">{t('yMas', { n: valores.length - MAX })}</li>}
        </ul>
      </dd>
    </>
  );
}

function Comparativo({ id }: { id: string }) {
  const t = useT();
  const [umbral, setUmbral] = useState('0.35');
  const esAdmin = useUsuario().rol === 'admin';
  const consulta = useQuery({
    queryKey: ['conocimiento', 'comparativo', id, umbral],
    queryFn: () => apiConocimiento.comparativo(id, Number(umbral)),
    placeholderData: (previo) => previo
  });
  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) return <ErrorDe error={consulta.error} />;
  const d = consulta.data;

  if (!d.marco.elementos) {
    return (
      <Aviso tipo="info">
        {t('sinMarcoOrganizacion')}{' '}
        {esAdmin
          ? t.rico('importaloEn', {}, { enlace: (texto) => <Link href="/marco">{texto}</Link> })
          : t('loImportaAdmin')}{' '}
        {t('licenciaApqc')}
      </Aviso>
    );
  }
  if (!d.actividades.length) return <Vacio>{t('sinActividades')}</Vacio>;

  const asignadas = d.actividades.filter((a) => a.elemento).length;
  const conActividades = d.categorias.filter((k) => k.actividades > 0);
  const sinActividades = d.categorias.filter((k) => k.actividades === 0);
  return (
    <div className={consulta.isFetching ? 'conocimiento-comparativo conocimiento-actualizando' : 'conocimiento-comparativo'}>
      <div className="conocimiento-comparativo-resumen">
        <p>{t.rico('asignadas', { a: asignadas, b: d.actividades.length, elementos: d.marco.elementos })}</p>
        <Selector etiqueta={t('umbral')} opciones={umbrales(t)} value={umbral} onChange={(e) => setUmbral(e.target.value)} />
      </div>

      <h3 className="conocimiento-subtitulo">{t('cobertura')}</h3>
      {conActividades.length === 0
        ? <Vacio>{t('ningunaSupera')}</Vacio>
        : <ul className="conocimiento-categorias">{conActividades.map((k) => <Categoria key={k.codigo} k={k} />)}</ul>}
      {sinActividades.length > 0 && (
        <details className="conocimiento-sin-actividades">
          <summary>{t('categoriasSinActividades', { n: sinActividades.length })}</summary>
          <ul>{sinActividades.map((k) => <li key={k.codigo}><code>{k.codigo}</code> {k.nombre}</li>)}</ul>
        </details>
      )}

      <h3 className="conocimiento-subtitulo">{t('actividadPorActividad')}</h3>
      <table className="tabla tabla-compacta conocimiento-tabla">
        <thead><tr><th>{t('actividad')}</th><th>{t('rol')}</th><th>{t('elementoMarco')}</th><th className="conocimiento-num">{t('parecidoColumna')}</th></tr></thead>
        <tbody>
          {d.actividades.map((a) => (
            <tr key={a.id} className={a.elemento ? '' : 'conocimiento-sin-equivalente'}>
              <td>{a.texto}</td>
              <td className="sutil">{a.rol || '—'}</td>
              <td>{a.elemento ? <><code>{a.elemento.codigo}</code> {a.elemento.nombre}</> : <span className="sutil">{t('sinEquivalente')}</span>}</td>
              <td className="conocimiento-num">{a.parecido === null ? '—' : pct(a.parecido, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Categoria({ k }: { k: CoberturaCategoria }) {
  const t = useT();
  return (
    <li className="tarjeta conocimiento-categoria">
      <div className="conocimiento-categoria-cabeza">
        <h4><code>{k.codigo}</code> {k.nombre}</h4>
        <span className="sutil">{t('nActividades', { n: k.actividades })}</span>
      </div>
      {k.cobertura === null ? (
        <p className="sutil">{t('sinGrupos')}</p>
      ) : (
        <>
          <div className="conocimiento-cobertura">
            <Barra valor={k.cobertura} etiqueta={t('coberturaEtiqueta', { p: pct(k.cobertura, t) })} />
            <span>{t.rico('gruposCubiertos', { a: k.gruposCubiertos.length, b: k.grupos, p: pct(k.cobertura, t) })}</span>
          </div>
          <ul className="conocimiento-grupos">
            {k.gruposCubiertos.map((g) => (
              <li key={g.codigo} className="cubierto"><span aria-hidden="true">✓</span> <code>{g.codigo}</code> {g.nombre} <small>({g.actividades})</small></li>
            ))}
            {k.gruposFaltantes.map((g) => (
              <li key={g.codigo} className="falta"><span aria-hidden="true">○</span> <code>{g.codigo}</code> {g.nombre} <small>{t('falta')}</small></li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}
