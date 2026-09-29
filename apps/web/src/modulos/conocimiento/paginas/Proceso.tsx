// Un proceso visto desde Conocimiento: los procesos parecidos de otros
// proyectos y el comparativo con el marco de referencia de la organización.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { enEditor } from '../../../shell/formato';
import { useUsuario } from '../../../shell/sesion';
import { Aviso, Cargando, ErrorDe, Etiqueta, Selector, Vacio, useTitulo } from '../../../shell/ui';
import { apiConocimiento, type CoberturaCategoria, type ProcesoParecido } from '../api';
import { Barra, PestanasConocimiento, fuera, pct } from '../componentes';

const UMBRALES = [
  { valor: '0.25', texto: 'Amplio (25 %)' },
  { valor: '0.35', texto: 'Normal (35 %)' },
  { valor: '0.5', texto: 'Estricto (50 %)' },
  { valor: '0.65', texto: 'Muy estricto (65 %)' }
];

export function Proceso({ id }: { id: string }) {
  const parecidos = useQuery({ queryKey: ['conocimiento', 'parecidos', id], queryFn: () => apiConocimiento.parecidos(id) });
  useTitulo(parecidos.data?.nombre ?? 'Proceso');

  if (parecidos.isPending) return <Cargando />;
  if (parecidos.isError) return <><PestanasConocimiento /><ErrorDe error={parecidos.error} /></>;
  const { nombre, proceso } = parecidos.data;

  return (
    <>
      <nav className="migas" aria-label="Ruta">
        <Link href="/">Conocimiento</Link> <span aria-hidden="true">›</span> <span>{nombre}</span>
      </nav>
      <div className="encabezado">
        <div>
          <h1>{nombre}</h1>
          {proceso && (
            <p className="sutil">
              <Link href={fuera.proyecto(proceso.proyecto.id)}>{proceso.proyecto.nombre}</Link>
              {proceso.proyecto.cliente && ` · ${proceso.proyecto.cliente}`} · última revisión: v{proceso.revision.numero}
            </p>
          )}
        </div>
        <div className="acciones">
          <Link href={fuera.proceso(id)} className="boton boton-secundario">Ver revisiones</Link>
          <a className="boton boton-primario" href={enEditor.proceso(id)}>Abrir en el editor</a>
        </div>
      </div>
      <PestanasConocimiento />

      {!proceso ? (
        <Vacio>Este proceso todavía no tiene revisiones: dibújalo y guarda una revisión para compararlo.</Vacio>
      ) : (
        <div className="conocimiento-detalle">
          <section aria-labelledby="conocimiento-t-parecidos">
            <h2 id="conocimiento-t-parecidos">Procesos parecidos</h2>
            <p className="sutil">
              Entre los proyectos a los que tienes acceso, por lo que describe cada proceso: actividades, sistemas y roles.
            </p>
            <ListaParecidos lista={parecidos.data.parecidos} />
          </section>
          <section aria-labelledby="conocimiento-t-comparativo">
            <h2 id="conocimiento-t-comparativo">Comparativo con el marco de referencia</h2>
            <Comparativo id={id} />
          </section>
        </div>
      )}
    </>
  );
}

const grado = (p: number) => (p >= 0.6 ? 'Muy parecido' : p >= 0.35 ? 'Parecido' : 'Algo en común');

function ListaParecidos({ lista }: { lista: ProcesoParecido[] }) {
  if (!lista.length) return <Vacio>No hay otros procesos parecidos entre los proyectos a los que tienes acceso.</Vacio>;
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
                  {p.proyecto.archivado && <> <Etiqueta tono="aviso">Archivado</Etiqueta></>}
                </span>
              </div>
              <div className="conocimiento-parecido-valor">
                <strong>{pct(p.parecido)}</strong>
                <small>{grado(p.parecido)}</small>
                <Barra valor={p.parecido} etiqueta={`Parecido: ${pct(p.parecido)}`} />
              </div>
            </div>
            {nada ? (
              <p className="sutil conocimiento-comun">Sin actividades, sistemas ni roles iguales: el parecido viene de palabras sueltas.</p>
            ) : (
              <dl className="conocimiento-comun">
                <EnComun titulo="Actividades" valores={actividades} />
                <EnComun titulo="Sistemas" valores={sistemas} />
                <EnComun titulo="Roles" valores={roles} />
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function EnComun({ titulo, valores }: { titulo: string; valores: string[] }) {
  if (!valores.length) return null;
  const MAX = 6;
  return (
    <>
      <dt>{titulo} en común</dt>
      <dd>
        <ul className="conocimiento-chips">
          {valores.slice(0, MAX).map((v) => <li key={v}>{v}</li>)}
          {valores.length > MAX && <li className="conocimiento-chip-mas">y {valores.length - MAX} más</li>}
        </ul>
      </dd>
    </>
  );
}

function Comparativo({ id }: { id: string }) {
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
        La organización todavía no tiene un marco de referencia.{' '}
        {esAdmin
          ? <>Impórtalo en <Link href="/marco">Marco de referencia</Link>.</>
          : 'Lo importa un administrador en «Marco de referencia».'}{' '}
        El APQC Process Classification Framework tiene licencia y lo aporta el administrador: ProcessIQ no lo incluye.
      </Aviso>
    );
  }
  if (!d.actividades.length) return <Vacio>La última revisión no tiene actividades que comparar.</Vacio>;

  const asignadas = d.actividades.filter((a) => a.elemento).length;
  const conActividades = d.categorias.filter((k) => k.actividades > 0);
  const sinActividades = d.categorias.filter((k) => k.actividades === 0);
  return (
    <div className={consulta.isFetching ? 'conocimiento-comparativo conocimiento-actualizando' : 'conocimiento-comparativo'}>
      <div className="conocimiento-comparativo-resumen">
        <p>
          <strong>{asignadas} de {d.actividades.length}</strong> actividades tienen un equivalente en el marco
          ({d.marco.elementos} elementos). Cada actividad se asigna al elemento más parecido si supera el umbral.
        </p>
        <Selector etiqueta="Umbral de parecido" opciones={UMBRALES} value={umbral} onChange={(e) => setUmbral(e.target.value)} />
      </div>

      <h3 className="conocimiento-subtitulo">Cobertura por categoría</h3>
      {conActividades.length === 0
        ? <Vacio>Ninguna actividad supera el umbral: prueba con uno más amplio.</Vacio>
        : <ul className="conocimiento-categorias">{conActividades.map((k) => <Categoria key={k.codigo} k={k} />)}</ul>}
      {sinActividades.length > 0 && (
        <details className="conocimiento-sin-actividades">
          <summary>Categorías sin actividades de este proceso ({sinActividades.length})</summary>
          <ul>{sinActividades.map((k) => <li key={k.codigo}><code>{k.codigo}</code> {k.nombre}</li>)}</ul>
        </details>
      )}

      <h3 className="conocimiento-subtitulo">Actividad por actividad</h3>
      <table className="tabla tabla-compacta conocimiento-tabla">
        <thead><tr><th>Actividad</th><th>Rol</th><th>Elemento del marco</th><th className="conocimiento-num">Parecido</th></tr></thead>
        <tbody>
          {d.actividades.map((a) => (
            <tr key={a.id} className={a.elemento ? '' : 'conocimiento-sin-equivalente'}>
              <td>{a.texto}</td>
              <td className="sutil">{a.rol || '—'}</td>
              <td>{a.elemento ? <><code>{a.elemento.codigo}</code> {a.elemento.nombre}</> : <span className="sutil">Sin equivalente en el marco</span>}</td>
              <td className="conocimiento-num">{a.parecido === null ? '—' : pct(a.parecido)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Categoria({ k }: { k: CoberturaCategoria }) {
  return (
    <li className="tarjeta conocimiento-categoria">
      <div className="conocimiento-categoria-cabeza">
        <h4><code>{k.codigo}</code> {k.nombre}</h4>
        <span className="sutil">{k.actividades === 1 ? 'Una actividad' : `${k.actividades} actividades`}</span>
      </div>
      {k.cobertura === null ? (
        <p className="sutil">La categoría no tiene grupos de nivel 2 en el marco.</p>
      ) : (
        <>
          <div className="conocimiento-cobertura">
            <Barra valor={k.cobertura} etiqueta={`Cobertura: ${pct(k.cobertura)}`} />
            <span><strong>{k.gruposCubiertos.length} de {k.grupos}</strong> grupos cubiertos ({pct(k.cobertura)})</span>
          </div>
          <ul className="conocimiento-grupos">
            {k.gruposCubiertos.map((g) => (
              <li key={g.codigo} className="cubierto"><span aria-hidden="true">✓</span> <code>{g.codigo}</code> {g.nombre} <small>({g.actividades})</small></li>
            ))}
            {k.gruposFaltantes.map((g) => (
              <li key={g.codigo} className="falta"><span aria-hidden="true">○</span> <code>{g.codigo}</code> {g.nombre} <small>falta</small></li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}
