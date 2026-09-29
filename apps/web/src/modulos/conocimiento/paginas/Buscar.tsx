// Buscador de procesos: última revisión de cada proceso de mis proyectos.
// La consulta va en la dirección (?q=…): se puede compartir y volver atrás.
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import { enEditor } from '../../../shell/formato';
import { Cargando, ErrorDe, Etiqueta, Insignia, Vacio, useTitulo } from '../../../shell/ui';
import { apiConocimiento, type ResultadoBusqueda } from '../api';
import { NOMBRE_CAMPO, PestanasConocimiento, Resaltado, fuera } from '../componentes';

const EJEMPLOS = ['validar póliza', 'SAP', 'Tesorería', 'reclamos'];

export function Buscar() {
  useTitulo('Conocimiento');
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
          <h1>Conocimiento</h1>
          <p className="sutil">Reutiliza lo que ya se levantó: busca entre los procesos de tus proyectos y compáralos con el marco de referencia.</p>
        </div>
      </div>
      <PestanasConocimiento />

      <form className="conocimiento-buscador" role="search" onSubmit={enviar}>
        <label htmlFor="conocimiento-q">Buscar en actividades, sistemas, roles y ficha</label>
        <div className="conocimiento-buscador-fila">
          <input id="conocimiento-q" type="search" autoFocus maxLength={200} value={texto}
            placeholder="Por ejemplo: validar póliza, SAP, Tesorería…" onChange={(e) => setTexto(e.target.value)} />
          <button type="submit" className="boton boton-primario" disabled={texto.trim().length < 2}>Buscar</button>
        </div>
        <small>Sin distinguir tildes ni mayúsculas, y con tolerancia a erratas. Se busca en la última revisión de cada proceso.</small>
      </form>

      {!consulta ? (
        <Vacio>
          <p className="conocimiento-vacio-titulo">¿Qué proceso vas a levantar?</p>
          <p>Escribe una actividad, un sistema o un rol para ver cómo se resolvió en otros proyectos.</p>
          <p className="conocimiento-ejemplos">
            Prueba con{' '}
            {EJEMPLOS.map((e, i) => (
              <span key={e}>{i > 0 && ', '}<button type="button" className="enlace" onClick={() => buscar(e)}>{e}</button></span>
            ))}.
          </p>
        </Vacio>
      ) : consulta.length < 2 ? (
        <Vacio>Escribe al menos dos letras.</Vacio>
      ) : busqueda.isPending ? <Cargando /> : busqueda.isError ? <ErrorDe error={busqueda.error} /> : (
        <Resultados consulta={consulta} terminos={busqueda.data.terminos} resultados={busqueda.data.resultados} />
      )}
    </>
  );
}

function Resultados({ consulta, terminos, resultados }: { consulta: string; terminos: string[]; resultados: ResultadoBusqueda[] }) {
  if (!resultados.length) {
    return (
      <Vacio>
        Ningún proceso de tus proyectos coincide con «{consulta}». Prueba con menos palabras o con otra forma de decirlo
        (el buscador exige que estén todas).
      </Vacio>
    );
  }
  return (
    <section aria-labelledby="conocimiento-t-resultados">
      <h2 id="conocimiento-t-resultados" className="conocimiento-conteo">
        {resultados.length === 1 ? 'Un proceso' : `${resultados.length} procesos`} para «{consulta}»
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
                {r.proyecto.archivado && <Etiqueta tono="aviso">Archivado</Etiqueta>}
              </span>
            </div>
            <p className="conocimiento-extracto">
              <span className="conocimiento-campo">{NOMBRE_CAMPO[r.extracto.campo]}{r.extracto.etiqueta ? ` · ${r.extracto.etiqueta}` : ''}</span>
              <span><Resaltado texto={r.extracto.texto} terminos={terminos} /></span>
            </p>
            <div className="acciones conocimiento-resultado-acciones">
              <Link href={`/proceso/${r.procesoId}`} className="boton boton-secundario">Parecidos y comparativo</Link>
              <a className="boton boton-sutil" href={enEditor.proceso(r.procesoId)}>Abrir en el editor</a>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
