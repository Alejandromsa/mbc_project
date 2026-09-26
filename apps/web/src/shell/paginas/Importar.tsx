// Importación asistida (fase 3): llevar a un proyecto lo que hay en el editor
// libre de este navegador o en archivos JSON exportados del editor.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api, type Proceso } from '../api';
import { enEditor, fecha } from '../formato';
import { procesoDeArchivo, procesoDelEditorLibre, vaciarEditorLibre, type ProcesoLocal } from '../importacion';
import { puede } from '../permisos';
import { Aviso, Boton, Cargando, ErrorDe, Selector, Vacio, useTitulo } from '../ui';

interface Pendiente extends ProcesoLocal { id: string; origen: 'navegador' | 'archivo'; archivo?: string }
interface Resultado { id: string; proceso?: Proceso; error?: string }

export function Importar() {
  useTitulo('Importar procesos');
  const cliente = useQueryClient();
  const proyectos = useQuery({ queryKey: ['proyectos'], queryFn: api.proyectos });
  const destinos = (proyectos.data?.proyectos ?? []).filter((p) => puede(p.rol, 'escribir') && !p.archivado);

  const [pendientes, setPendientes] = useState<Pendiente[]>(() => {
    const local = procesoDelEditorLibre();
    return local ? [{ ...local, id: 'navegador', origen: 'navegador', nombre: local.nombre || 'Proceso del editor libre' }] : [];
  });
  const [erroresArchivo, setErroresArchivo] = useState<string[]>([]);
  const [proyectoId, setProyectoId] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [vaciado, setVaciado] = useState(false);
  const destino = proyectoId || destinos[0]?.id || '';

  const agregarArchivos = async (lista: FileList | null) => {
    if (!lista) return;
    const nuevos: Pendiente[] = [];
    const errores: string[] = [];
    for (const f of Array.from(lista)) {
      try { nuevos.push({ ...(await procesoDeArchivo(f)), id: `archivo-${f.name}-${f.size}`, origen: 'archivo', archivo: f.name }); }
      catch (e) { errores.push(`${f.name}: ${(e as Error).message}`); }
    }
    setErroresArchivo(errores);
    setPendientes((p) => [...p.filter((x) => !nuevos.some((n) => n.id === x.id)), ...nuevos]);
  };

  const importar = useMutation({
    mutationFn: async () => {
      const salida: Resultado[] = [];
      for (const p of pendientes) {
        try {
          const { proceso } = await api.crearProceso(destino, {
            nombre: p.nombre.trim() || 'Proceso importado', contenido: p.contenido,
            mensaje: p.origen === 'navegador' ? 'Importado del editor libre de un navegador' : `Importado de ${p.archivo}`
          });
          salida.push({ id: p.id, proceso });
        } catch (e) {
          salida.push({ id: p.id, error: (e as Error).message });
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
          <h1>Importar procesos</h1>
          <p className="sutil">
            Lleva a un proyecto lo que tienes en el <strong>editor libre de este navegador</strong> o en archivos JSON exportados desde el editor
            (en otro equipo: «Exportar → JSON» y súbelos aquí). Nada se borra del navegador salvo que lo pidas.
          </p>
        </div>
      </div>

      {resultados.length > 0 && (
        <section aria-label="Resultado">
          {resultados.map((r) => r.proceso ? (
            <Aviso key={r.id} tipo="ok">
              «{r.proceso.nombre}» importado. <a href={enEditor.proceso(r.proceso.id)}>Abrir en el editor</a> · <Link href={`/proceso/${r.proceso.id}`}>Ver sus revisiones</Link>
            </Aviso>
          ) : <Aviso key={r.id} tipo="error">No se pudo importar: {r.error}</Aviso>)}
          {importadoDelNavegador && !vaciado && (
            <p className="sutil">
              El proceso sigue también en el editor libre de este navegador.{' '}
              <button type="button" className="enlace" onClick={() => { vaciarEditorLibre(); setVaciado(true); }}>Vaciar el editor libre</button>
            </p>
          )}
          {vaciado && <p className="sutil">El editor libre de este navegador quedó vacío.</p>}
        </section>
      )}

      <section aria-labelledby="t-que">
        <h2 id="t-que">Qué importar</h2>
        {pendientes.length === 0 ? (
          <Vacio>No hay nada en el editor libre de este navegador. Puedes subir archivos JSON exportados desde el editor.</Vacio>
        ) : (
          <table className="tabla">
            <thead><tr><th>Nombre del proceso</th><th>De dónde</th><th>Elementos</th><th>Último cambio</th><th><span className="solo-lector">Acciones</span></th></tr></thead>
            <tbody>
              {pendientes.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input className="entrada-tabla" aria-label={`Nombre del proceso ${p.nombre}`} value={p.nombre} maxLength={200}
                      onChange={(e) => setPendientes((l) => l.map((x) => x.id === p.id ? { ...x, nombre: e.target.value } : x))} />
                  </td>
                  <td>{p.origen === 'navegador' ? 'Editor libre de este navegador' : p.archivo}</td>
                  <td>{p.nodos}</td>
                  <td className="fecha">{fecha(p.guardadoEn)}</td>
                  <td className="celda-acciones">
                    <Boton variante="sutil" onClick={() => setPendientes((l) => l.filter((x) => x.id !== p.id))}>Quitar</Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="campo campo-archivos">
          <label htmlFor="archivos-json">Añadir archivos JSON exportados del editor</label>
          <input id="archivos-json" type="file" multiple accept=".json,application/json" onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }} />
        </div>
        {erroresArchivo.map((e) => <Aviso key={e} tipo="error">{e}</Aviso>)}
      </section>

      <section aria-labelledby="t-donde">
        <h2 id="t-donde">A qué proyecto</h2>
        {proyectos.isPending ? <Cargando /> : proyectos.isError ? <ErrorDe error={proyectos.error} /> : destinos.length === 0 ? (
          <Vacio>No tienes proyectos donde puedas crear procesos. Crea uno en <Link href="/">Proyectos</Link> o pide que te añadan como editor.</Vacio>
        ) : (
          <div className="barra-filtros">
            <Selector aria-label="Proyecto de destino" value={destino} onChange={(e) => setProyectoId(e.target.value)}
              opciones={destinos.map((p) => ({ valor: p.id, texto: p.cliente ? `${p.nombre} · ${p.cliente}` : p.nombre }))} />
            <Boton variante="primario" disabled={pendientes.length === 0 || !destino} cargando={importar.isPending} onClick={() => importar.mutate()}>
              Importar {pendientes.length === 1 ? 'el proceso' : `${pendientes.length} procesos`}
            </Boton>
          </div>
        )}
        <ErrorDe error={importar.error} />
      </section>
    </>
  );
}
