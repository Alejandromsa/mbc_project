// Importación asistida (fase 3): llevar a un proyecto lo que hay en el editor
// libre de este navegador o en archivos JSON exportados del editor.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api, type Proceso } from '../api';
import { enEditor } from '../formato';
import { useT } from '../i18n';
import { ErrorImportacion, procesoDeArchivo, procesoDelEditorLibre, vaciarEditorLibre, type ProcesoLocal } from '../importacion';
import { mensajeDeError } from '../mensajes';
import { puede } from '../permisos';
import { Aviso, Boton, Cargando, EnlaceEditor, ErrorDe, Selector, Vacio, useTitulo } from '../ui';

interface Pendiente extends ProcesoLocal { id: string; origen: 'navegador' | 'archivo'; archivo?: string }
interface Resultado { id: string; proceso?: Proceso; error?: unknown }
interface ErrorArchivo { archivo: string; error: unknown }

export function Importar() {
  const t = useT();
  useTitulo(t('importar.titulo'));
  const cliente = useQueryClient();
  const proyectos = useQuery({ queryKey: ['proyectos'], queryFn: api.proyectos });
  const destinos = (proyectos.data?.proyectos ?? []).filter((p) => puede(p.rol, 'escribir') && !p.archivado);

  const [pendientes, setPendientes] = useState<Pendiente[]>(() => {
    const local = procesoDelEditorLibre();
    return local ? [{ ...local, id: 'navegador', origen: 'navegador', nombre: local.nombre || t('importar.procesoEditorLibre') }] : [];
  });
  const [erroresArchivo, setErroresArchivo] = useState<ErrorArchivo[]>([]);
  const [proyectoId, setProyectoId] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [vaciado, setVaciado] = useState(false);
  const destino = proyectoId || destinos[0]?.id || '';

  const agregarArchivos = async (lista: FileList | null) => {
    if (!lista) return;
    const nuevos: Pendiente[] = [];
    const errores: ErrorArchivo[] = [];
    for (const f of Array.from(lista)) {
      try { nuevos.push({ ...(await procesoDeArchivo(f)), id: `archivo-${f.name}-${f.size}`, origen: 'archivo', archivo: f.name }); }
      catch (e) { errores.push({ archivo: f.name, error: e }); }
    }
    setErroresArchivo(errores);
    setPendientes((p) => [...p.filter((x) => !nuevos.some((n) => n.id === x.id)), ...nuevos]);
  };

  /** El motivo de un archivo rechazado, en el idioma elegido. */
  const motivo = (e: unknown) => e instanceof ErrorImportacion
    ? t(e.codigo === 'JSON_INVALIDO' ? 'importar.errorJson' : 'importar.errorNoEsProceso')
    : mensajeDeError(e, t.idioma, t('comun.algoSalioMal'));

  const importar = useMutation({
    mutationFn: async () => {
      const salida: Resultado[] = [];
      for (const p of pendientes) {
        try {
          const { proceso } = await api.crearProceso(destino, {
            nombre: p.nombre.trim() || t('importar.procesoImportado'), contenido: p.contenido,
            mensaje: p.origen === 'navegador' ? t('importar.mensajeNavegador') : t('comun.importadoDe', { archivo: p.archivo ?? '' })
          });
          salida.push({ id: p.id, proceso });
        } catch (e) {
          salida.push({ id: p.id, error: e });
        }
      }
      return salida;
    },
    onSuccess: (salida) => {
      setResultados(salida);
      setPendientes((p) => p.filter((x) => !salida.some((r) => r.id === x.id && r.proceso)));
      cliente.invalidateQueries({ queryKey: ['proyecto', destino] });
    }
  });

  const importadoDelNavegador = resultados.some((r) => r.id === 'navegador' && r.proceso);

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('importar.titulo')}</h1>
          <p className="sutil">{t.rico('importar.intro')}</p>
        </div>
      </div>

      {resultados.length > 0 && (
        <section aria-label={t('importar.resultado')}>
          {resultados.map((r) => r.proceso ? (
            <Aviso key={r.id} tipo="ok">
              {t('importar.importado', { nombre: r.proceso.nombre })}{' '}
              <EnlaceEditor href={enEditor.proceso(r.proceso.id)}>{t('comun.abrirEnEditor')}</EnlaceEditor>{' · '}
              <Link href={`/proceso/${r.proceso.id}`}>{t('importar.verRevisiones')}</Link>
            </Aviso>
          ) : <Aviso key={r.id} tipo="error">{t('importar.noSePudo', { error: motivo(r.error) })}</Aviso>)}
          {importadoDelNavegador && !vaciado && (
            <p className="sutil">
              {t('importar.sigueEnNavegador')}{' '}
              <button type="button" className="enlace" onClick={() => { vaciarEditorLibre(); setVaciado(true); }}>{t('importar.vaciar')}</button>
            </p>
          )}
          {vaciado && <p className="sutil">{t('importar.vaciado')}</p>}
        </section>
      )}

      <section aria-labelledby="t-que">
        <h2 id="t-que">{t('importar.queImportar')}</h2>
        {pendientes.length === 0 ? (
          <Vacio>{t('importar.nadaEnNavegador')}</Vacio>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>{t('proyecto.nombreProceso')}</th><th>{t('importar.deDonde')}</th><th>{t('importar.elementos')}</th>
                <th>{t('importar.ultimoCambio')}</th><th><span className="solo-lector">{t('comun.acciones')}</span></th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input className="entrada-tabla" aria-label={t('importar.nombreDe', { nombre: p.nombre })} value={p.nombre} maxLength={200}
                      onChange={(e) => setPendientes((l) => l.map((x) => x.id === p.id ? { ...x, nombre: e.target.value } : x))} />
                  </td>
                  <td>{p.origen === 'navegador' ? t('importar.origenNavegador') : p.archivo}</td>
                  <td>{p.nodos}</td>
                  <td className="fecha">{t.fecha(p.guardadoEn)}</td>
                  <td className="celda-acciones">
                    <Boton variante="sutil" onClick={() => setPendientes((l) => l.filter((x) => x.id !== p.id))}>{t('comun.quitar')}</Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="campo campo-archivos">
          <label htmlFor="archivos-json">{t('importar.anadirArchivos')}</label>
          <input id="archivos-json" type="file" multiple accept=".json,application/json" onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }} />
        </div>
        {erroresArchivo.map((e) => <Aviso key={e.archivo} tipo="error">{t('importar.errorArchivo', { archivo: e.archivo, error: motivo(e.error) })}</Aviso>)}
      </section>

      <section aria-labelledby="t-donde">
        <h2 id="t-donde">{t('importar.aQueProyecto')}</h2>
        {proyectos.isPending ? <Cargando /> : proyectos.isError ? <ErrorDe error={proyectos.error} /> : destinos.length === 0 ? (
          <Vacio>{t.rico('importar.sinDestinos', {}, { enlace: (texto) => <Link href="/">{texto}</Link> })}</Vacio>
        ) : (
          <div className="barra-filtros">
            <Selector aria-label={t('importar.destino')} value={destino} onChange={(e) => setProyectoId(e.target.value)}
              opciones={destinos.map((p) => ({ valor: p.id, texto: p.cliente ? `${p.nombre} · ${p.cliente}` : p.nombre }))} />
            <Boton variante="primario" disabled={pendientes.length === 0 || !destino} cargando={importar.isPending} onClick={() => importar.mutate()}>
              {t('importar.boton', { n: pendientes.length })}
            </Boton>
          </div>
        )}
        <ErrorDe error={importar.error} />
      </section>
    </>
  );
}
