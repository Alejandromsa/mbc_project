// Buscador de procesos: última revisión de cada proceso de mis proyectos.
// La consulta va en la dirección (?q=…): se puede compartir y volver atrás.
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import { enEditor } from '../../../shell/formato';
import { Cargando, EnlaceEditor, ErrorDe, Etiqueta, Insignia, Vacio, useTitulo } from '../../../shell/ui';
import { apiConocimiento, type ResultadoBusqueda } from '../api';
import { PestanasConocimiento, Resaltado, fuera, nombreCampo } from '../componentes';
import { useT } from '../textos';

/** Ejemplos de búsqueda: son contenido de los procesos (en español), así que no se traducen. */
const EJEMPLOS = ['validar póliza', 'SAP', 'Tesorería', 'reclamos'];

export function Buscar() {
  const t = useT();
  useTitulo(t('titulo'));
  const consulta = new URLSearchParams(useSearch()).get('q')?.trim() ?? '';
  const [, navegar] = useLocation();
  const [texto, setTexto] = useState(consulta);
  useEffect(() => { setTexto(consulta); }, [consulta]);

  const busqueda = useQuery({
    queryKey: ['conocimiento', 'buscar', consulta],
    queryFn: () => apiConocimiento.buscar(consulta),
    enabled: consulta.length >= 2
  });
  const buscar = (q: string) => navegar(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/');
  const enviar = (e: FormEvent) => { e.preventDefault(); buscar(texto); };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('titulo')}</h1>
          <p className="sutil">{t('intro')}</p>
        </div>
      </div>
      <PestanasConocimiento />

      <form className="conocimiento-buscador" role="search" onSubmit={enviar}>
        <label htmlFor="conocimiento-q">{t('buscarEtiqueta')}</label>
        <div className="conocimiento-buscador-fila">
          <input id="conocimiento-q" type="search" autoFocus maxLength={200} value={texto}
            placeholder={t('buscarEjemplo')} onChange={(e) => setTexto(e.target.value)} />
          <button type="submit" className="boton boton-primario" disabled={texto.trim().length < 2}>{t('buscar')}</button>
        </div>
        <small>{t('buscarAyuda')}</small>
      </form>

      {!consulta ? (
        <Vacio>
          <p className="conocimiento-vacio-titulo">{t('vacioTitulo')}</p>
          <p>{t('vacioTexto')}</p>
          <p className="conocimiento-ejemplos">
            {t('pruebaCon')}{' '}
            {EJEMPLOS.map((e, i) => (
              <span key={e}>{i > 0 && ', '}<button type="button" className="enlace" onClick={() => buscar(e)}>{e}</button></span>
            ))}.
          </p>
        </Vacio>
      ) : consulta.length < 2 ? (
        <Vacio>{t('dosLetras')}</Vacio>
      ) : busqueda.isPending ? <Cargando /> : busqueda.isError ? <ErrorDe error={busqueda.error} /> : (
        <Resultados consulta={consulta} terminos={busqueda.data.terminos} resultados={busqueda.data.resultados} />
      )}
    </>
  );
}

function Resultados({ consulta, terminos, resultados }: { consulta: string; terminos: string[]; resultados: ResultadoBusqueda[] }) {
  const t = useT();
  if (!resultados.length) {
    return <Vacio>{t('sinResultados', { consulta })}</Vacio>;
  }
  return (
    <section aria-labelledby="conocimiento-t-resultados">
      <h2 id="conocimiento-t-resultados" className="conocimiento-conteo">
        {t('resultados', { n: resultados.length, consulta })}
      </h2>
      <ol className="conocimiento-resultados">
        {resultados.map((r) => (
          <li key={r.procesoId} className="tarjeta conocimiento-resultado">
            <div className="conocimiento-resultado-cabeza">
              <h3><Link href={fuera.proceso(r.procesoId)}>{r.nombre}</Link></h3>
              <span className="conocimiento-meta">
                <Link href={fuera.proyecto(r.proyecto.id)}>{r.proyecto.nombre}</Link>
                {r.proyecto.cliente && <span> · {r.proyecto.cliente}</span>}
                <span> · v{r.revision.numero}</span> <Insignia estado={r.revision.estado} />
                {r.proyecto.archivado && <Etiqueta tono="aviso">{t('archivado')}</Etiqueta>}
              </span>
            </div>
            <p className="conocimiento-extracto">
              <span className="conocimiento-campo">{nombreCampo(r.extracto.campo, t)}{r.extracto.etiqueta ? ` · ${r.extracto.etiqueta}` : ''}</span>
              <span><Resaltado texto={r.extracto.texto} terminos={terminos} /></span>
            </p>
            <div className="acciones conocimiento-resultado-acciones">
              <Link href={`/proceso/${r.procesoId}`} className="boton boton-secundario">{t('parecidosYComparativo')}</Link>
              <EnlaceEditor className="boton boton-sutil" href={enEditor.proceso(r.procesoId)}>{t('abrirEnEditor')}</EnlaceEditor>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
