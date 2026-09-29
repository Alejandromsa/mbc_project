// Marco de referencia de la organización (APQC PCF u otro con la misma forma):
// lo ve cualquiera; lo importa un administrador desde un CSV, con vista previa.
import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fecha } from '../../../shell/formato';
import { useUsuario } from '../../../shell/sesion';
import { Aviso, Boton, Cargando, ErrorDe, Vacio, useTitulo } from '../../../shell/ui';
import { apiConocimiento, type VistaPrevia } from '../api';
import { PestanasConocimiento } from '../componentes';

/** El límite de la API es 8 MB por petición; el APQC completo ronda 1 MB. */
const MAX_BYTES = 7 * 1024 * 1024;

/** Excel en español guarda el CSV en Windows-1252 si no se elige «UTF-8»: se prueba UTF-8 y, si no cuadra, 1252. */
async function leerArchivo(archivo: File): Promise<string> {
  const bytes = await archivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

const NIVELES: Record<string, string> = { 1: 'categorías', 2: 'grupos de procesos', 3: 'procesos', 4: 'actividades', 5: 'tareas' };

export function Marco() {
  useTitulo('Marco de referencia');
  const esAdmin = useUsuario().rol === 'admin';
  const marco = useQuery({ queryKey: ['conocimiento', 'marco'], queryFn: apiConocimiento.marco });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Conocimiento</h1>
          <p className="sutil">Reutiliza lo que ya se levantó: busca entre los procesos de tus proyectos y compáralos con el marco de referencia.</p>
        </div>
      </div>
      <PestanasConocimiento />

      <Aviso tipo="info">
        El comparativo usa el marco de procesos de la organización, normalmente el <strong>APQC Process Classification
        Framework (PCF)</strong>. El PCF tiene licencia de APQC y ProcessIQ no lo incluye: lo aporta el administrador,
        que lo descarga con la licencia de la organización y lo importa aquí. Solo lo ven las personas de la organización.
      </Aviso>

      <section aria-labelledby="conocimiento-t-actual">
        <h2 id="conocimiento-t-actual">Marco actual</h2>
        {marco.isPending ? <Cargando /> : marco.isError ? <ErrorDe error={marco.error} /> : marco.data.elementos === 0 ? (
          <Vacio>Todavía no hay un marco importado.{esAdmin ? ' Impórtalo abajo desde un CSV.' : ' Pídeselo a un administrador.'}</Vacio>
        ) : (
          <>
            <p className="conocimiento-cifras">
              <strong>{marco.data.elementos}</strong> elementos en <strong>{marco.data.categorias.length}</strong> categorías
              {' · '}<span className="sutil">importado el {fecha(marco.data.importadoEn)}</span>
            </p>
            <Categorias categorias={marco.data.categorias} />
          </>
        )}
      </section>

      {esAdmin
        ? <Importar actuales={marco.data?.elementos ?? 0} />
        : <p className="sutil conocimiento-nota">Solo un administrador puede importar o reemplazar el marco.</p>}
    </>
  );
}

function Categorias({ categorias }: { categorias: { codigo: string; nombre: string; elementos: number }[] }) {
  return (
    <table className="tabla tabla-compacta conocimiento-tabla">
      <thead><tr><th>Código</th><th>Categoría (nivel 1)</th><th className="conocimiento-num">Elementos</th></tr></thead>
      <tbody>
        {categorias.map((k) => (
          <tr key={k.codigo}><td><code>{k.codigo}</code></td><td>{k.nombre}</td><td className="conocimiento-num">{k.elementos}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Importar({ actuales }: { actuales: number }) {
  const cliente = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<{ nombre: string; csv: string } | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [importado, setImportado] = useState<number | null>(null);

  const vistaPrevia = useMutation({ mutationFn: (csv: string) => apiConocimiento.vistaPrevia(csv) });
  const importar = useMutation({
    mutationFn: (csv: string) => apiConocimiento.importarMarco(csv),
    onSuccess: (r) => {
      setImportado(r.elementos);
      setArchivo(null);
      vistaPrevia.reset();
      if (entrada.current) entrada.current.value = '';
      cliente.invalidateQueries({ queryKey: ['conocimiento'] });
    }
  });

  const elegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setImportado(null); setErrorArchivo(null); setArchivo(null); vistaPrevia.reset(); importar.reset();
    if (!f) return;
    if (f.size > MAX_BYTES) { setErrorArchivo('El archivo pasa de 7 MB. Guarda solo las columnas de código, nombre y descripción.'); return; }
    const csv = await leerArchivo(f);
    setArchivo({ nombre: f.name, csv });
    vistaPrevia.mutate(csv);
  };

  return (
    <section aria-labelledby="conocimiento-t-importar">
      <h2 id="conocimiento-t-importar">Importar desde un CSV</h2>
      <div className="tarjeta conocimiento-importar">
        <p>
          Una fila por elemento con las columnas <strong>Código</strong> (o <em>Hierarchy ID</em>), <strong>Nombre</strong>
          {' '}(o <em>Name</em>) y, si quieres, <strong>Descripción</strong>. Separado por comas o por punto y coma, como lo
          guarda Excel. El nivel sale del código: 1.0 es una categoría, 1.1 un grupo, 1.1.1 un proceso…
        </p>
        <div className="campo">
          <label htmlFor="conocimiento-csv">Archivo CSV</label>
          <input id="conocimiento-csv" ref={entrada} type="file" accept=".csv,text/csv" onChange={elegir} />
        </div>
        {errorArchivo && <Aviso tipo="error">{errorArchivo}</Aviso>}
        {importado !== null && <Aviso tipo="ok">Marco importado: {importado} elementos. El comparativo ya lo usa.</Aviso>}
        {vistaPrevia.isPending && <Cargando />}
        <ErrorDe error={vistaPrevia.error} />
        {archivo && vistaPrevia.data && (
          <Previa nombre={archivo.nombre} previa={vistaPrevia.data} actuales={actuales}
            importando={importar.isPending} error={importar.error}
            onImportar={() => importar.mutate(archivo.csv)} />
        )}
      </div>
    </section>
  );
}

function Previa({ nombre, previa, actuales, importando, error, onImportar }: {
  nombre: string; previa: VistaPrevia; actuales: number; importando: boolean; error: unknown; onImportar: () => void;
}) {
  const niveles = Object.entries(previa.porNivel).sort(([a], [b]) => Number(a) - Number(b));
  return (
    <div className="conocimiento-previa" aria-live="polite">
      <h3 className="conocimiento-subtitulo">Vista previa de «{nombre}»</h3>
      {previa.valido ? (
        <p className="conocimiento-cifras">
          <strong>{previa.elementos}</strong> elementos:{' '}
          {niveles.map(([n, c], i) => <span key={n}>{i > 0 && ', '}{c} {NIVELES[n] ?? `de nivel ${n}`}</span>)}.
        </p>
      ) : (
        <Aviso tipo="error">
          El archivo tiene errores y no se puede importar:
          <ul className="detalles">{previa.errores.map((e) => <li key={e}>{e}</li>)}</ul>
        </Aviso>
      )}
      {previa.avisos.map((a) => <Aviso key={a} tipo="atencion">{a}</Aviso>)}
      {previa.muestra.length > 0 && (
        <table className="tabla tabla-compacta conocimiento-tabla">
          <caption className="sutil">Primeras filas</caption>
          <thead><tr><th>Código</th><th>Nombre</th><th className="conocimiento-num">Nivel</th></tr></thead>
          <tbody>
            {previa.muestra.map((m) => (
              <tr key={m.codigo}><td><code>{m.codigo}</code></td><td>{m.nombre}</td><td className="conocimiento-num">{m.nivel}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorDe error={error} />
      {previa.valido && (
        <div className="acciones">
          {actuales > 0 && <span className="sutil">Reemplaza el marco actual ({actuales} elementos).</span>}
          <Boton variante="primario" cargando={importando} onClick={onImportar}>
            {actuales > 0 ? `Reemplazar con estos ${previa.elementos} elementos` : `Importar ${previa.elementos} elementos`}
          </Boton>
        </div>
      )}
    </div>
  );
}
