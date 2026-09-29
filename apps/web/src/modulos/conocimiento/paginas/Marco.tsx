// Marco de referencia de la organización (APQC PCF u otro con la misma forma):
// lo ve cualquiera; lo importa un administrador desde un CSV, con vista previa.
import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUsuario } from '../../../shell/sesion';
import { Aviso, Boton, Cargando, ErrorDe, Vacio, useTitulo } from '../../../shell/ui';
import { apiConocimiento, type VistaPrevia } from '../api';
import { PestanasConocimiento } from '../componentes';
import { useT, type TraductorConocimiento } from '../textos';

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

const NIVELES = { 1: 'nivel1', 2: 'nivel2', 3: 'nivel3', 4: 'nivel4', 5: 'nivel5' } as const;

/** «4 categorías», «11 grupos de procesos»…; un nivel sin nombre, «3 de nivel 6». */
function cuantosDeNivel(nivel: string, n: number, t: TraductorConocimiento): string {
  const clave = NIVELES[Number(nivel) as keyof typeof NIVELES];
  return clave ? t(clave, { n }) : t('nivelN', { n, nivel });
}

export function Marco() {
  const t = useT();
  useTitulo(t('pestanaMarco'));
  const esAdmin = useUsuario().rol === 'admin';
  const marco = useQuery({ queryKey: ['conocimiento', 'marco'], queryFn: apiConocimiento.marco });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('titulo')}</h1>
          <p className="sutil">{t('intro')}</p>
        </div>
      </div>
      <PestanasConocimiento />

      <Aviso tipo="info">{t.rico('marcoAviso')}</Aviso>

      <section aria-labelledby="conocimiento-t-actual">
        <h2 id="conocimiento-t-actual">{t('marcoActual')}</h2>
        {marco.isPending ? <Cargando /> : marco.isError ? <ErrorDe error={marco.error} /> : marco.data.elementos === 0 ? (
          <Vacio>{esAdmin ? t('sinMarcoAdmin') : t('sinMarco')}</Vacio>
        ) : (
          <>
            <p className="conocimiento-cifras">
              {t.rico('resumenMarco', { elementos: marco.data.elementos, categorias: marco.data.categorias.length })}
              {' · '}<span className="sutil">{t('importadoEl', { fecha: t.fecha(marco.data.importadoEn) })}</span>
            </p>
            <Categorias categorias={marco.data.categorias} />
          </>
        )}
      </section>

      {esAdmin
        ? <Importar actuales={marco.data?.elementos ?? 0} />
        : <p className="sutil conocimiento-nota">{t('soloAdmin')}</p>}
    </>
  );
}

function Categorias({ categorias }: { categorias: { codigo: string; nombre: string; elementos: number }[] }) {
  const t = useT();
  return (
    <table className="tabla tabla-compacta conocimiento-tabla">
      <thead><tr><th>{t('codigo')}</th><th>{t('categoriaNivel1')}</th><th className="conocimiento-num">{t('elementos')}</th></tr></thead>
      <tbody>
        {categorias.map((k) => (
          <tr key={k.codigo}><td><code>{k.codigo}</code></td><td>{k.nombre}</td><td className="conocimiento-num">{k.elementos}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Importar({ actuales }: { actuales: number }) {
  const t = useT();
  const cliente = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<{ nombre: string; csv: string } | null>(null);
  const [archivoGrande, setArchivoGrande] = useState(false);
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
    setImportado(null); setArchivoGrande(false); setArchivo(null); vistaPrevia.reset(); importar.reset();
    if (!f) return;
    if (f.size > MAX_BYTES) { setArchivoGrande(true); return; }
    const csv = await leerArchivo(f);
    setArchivo({ nombre: f.name, csv });
    vistaPrevia.mutate(csv);
  };

  return (
    <section aria-labelledby="conocimiento-t-importar">
      <h2 id="conocimiento-t-importar">{t('importarCsv')}</h2>
      <div className="tarjeta conocimiento-importar">
        <p>{t.rico('importarAyuda')}</p>
        <div className="campo">
          <label htmlFor="conocimiento-csv">{t('archivoCsv')}</label>
          <input id="conocimiento-csv" ref={entrada} type="file" accept=".csv,text/csv" onChange={elegir} />
        </div>
        {archivoGrande && <Aviso tipo="error">{t('archivoGrande')}</Aviso>}
        {importado !== null && <Aviso tipo="ok">{t('marcoImportado', { n: importado })}</Aviso>}
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
  const t = useT();
  const niveles = Object.entries(previa.porNivel).sort(([a], [b]) => Number(a) - Number(b));
  return (
    <div className="conocimiento-previa" aria-live="polite">
      <h3 className="conocimiento-subtitulo">{t('vistaPrevia', { nombre })}</h3>
      {previa.valido ? (
        <p className="conocimiento-cifras">
          {t.rico('previaElementos', { n: previa.elementos })}{' '}
          {niveles.map(([n, c], i) => <span key={n}>{i > 0 && ', '}{cuantosDeNivel(n, c, t)}</span>)}.
        </p>
      ) : (
        <Aviso tipo="error">
          {t('conErrores')}
          <ul className="detalles">{previa.errores.map((e) => <li key={e}>{e}</li>)}</ul>
        </Aviso>
      )}
      {previa.avisos.map((a) => <Aviso key={a} tipo="atencion">{a}</Aviso>)}
      {previa.muestra.length > 0 && (
        <table className="tabla tabla-compacta conocimiento-tabla">
          <caption className="sutil">{t('primerasFilas')}</caption>
          <thead><tr><th>{t('codigo')}</th><th>{t('nombre')}</th><th className="conocimiento-num">{t('nivel')}</th></tr></thead>
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
          {actuales > 0 && <span className="sutil">{t('reemplaza', { n: actuales })}</span>}
          <Boton variante="primario" cargando={importando} onClick={onImportar}>
            {actuales > 0 ? t('reemplazar', { n: previa.elementos }) : t('importar', { n: previa.elementos })}
          </Boton>
        </div>
      )}
    </div>
  );
}
