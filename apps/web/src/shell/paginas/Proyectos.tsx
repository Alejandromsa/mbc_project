// Mis proyectos (todos, si soy administrador) y alta de proyectos.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { api } from '../api';
import { useT } from '../i18n';
import { useUsuario } from '../sesion';
import { descartarOferta, ofrecerImportacion, procesoDelEditorLibre } from '../importacion';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Dialogo, ErrorDe, Etiqueta, Vacio, useTitulo } from '../ui';

export function Proyectos() {
  const t = useT();
  useTitulo(t('proyectos.titulo'));
  const usuario = useUsuario();
  const [verArchivados, setVerArchivados] = useState(false);
  const [creando, setCreando] = useState(false);
  const consulta = useQuery({ queryKey: ['proyectos'], queryFn: api.proyectos });
  // Trabajo del editor libre de este navegador que aún no está en un proyecto (importación asistida)
  const [local] = useState(procesoDelEditorLibre);
  const [ofrecer, setOfrecer] = useState(() => ofrecerImportacion(local));

  const todos = consulta.data?.proyectos ?? [];
  const archivados = todos.filter((p) => p.archivado).length;
  const lista = todos.filter((p) => verArchivados || !p.archivado);

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('proyectos.titulo')}</h1>
          <p className="sutil">{usuario.rol === 'admin' ? t('proyectos.introAdmin') : t('proyectos.introMiembro')}</p>
        </div>
        <div className="acciones">
          <Link href="/importar" className="boton boton-secundario">{t('proyectos.importar')}</Link>
          {usuario.rol !== 'lector' && <Boton variante="primario" onClick={() => setCreando(true)}>{t('proyectos.nuevo')}</Boton>}
        </div>
      </div>

      {local && ofrecer && (
        <Aviso tipo="info">
          {t('proyectos.oferta', { nombre: local.nombre || t('proyectos.sinNombre'), n: local.nodos })}{' '}
          <Link href="/importar">{t('proyectos.llevar')}</Link>{' · '}
          <button type="button" className="enlace" onClick={() => { descartarOferta(local); setOfrecer(false); }}>{t('proyectos.noGracias')}</button>
        </Aviso>
      )}

      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : lista.length === 0 ? (
        <Vacio>
          {todos.length === 0
            ? usuario.rol === 'lector'
              ? t('proyectos.vacioLector')
              : t('proyectos.vacio')
            : t('proyectos.todosArchivados')}
        </Vacio>
      ) : (
        <ul className="rejilla-tarjetas">
          {lista.map((p) => (
            <li key={p.id}>
              <Link href={`/p/${p.id}`} className="tarjeta tarjeta-enlace">
                <h2>{p.nombre}</h2>
                {p.cliente && <p className="cliente">{p.cliente}</p>}
                {p.descripcion && <p className="sutil recorte">{p.descripcion}</p>}
                <p className="meta">
                  <Etiqueta>{t.rolProyecto(p.rol)}</Etiqueta>
                  {p.archivado && <Etiqueta tono="aviso">{t('comun.archivado')}</Etiqueta>}
                  <span className="sutil">{t('proyectos.creadoEl', { fecha: t.fecha(p.creadoEn) })}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {archivados > 0 && (
        <label className="casilla">
          <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
          {t('proyectos.mostrarArchivados', { n: archivados })}
        </label>
      )}

      <Dialogo abierto={creando} titulo={t('proyectos.nuevo')} onCerrar={() => setCreando(false)}>
        <NuevoProyecto onCerrar={() => setCreando(false)} />
      </Dialogo>
    </>
  );
}

function NuevoProyecto({ onCerrar }: { onCerrar: () => void }) {
  const t = useT();
  const [, navegar] = useLocation();
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [clienteProyecto, setClienteProyecto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const crear = useMutation({
    mutationFn: () => api.crearProyecto({ nombre, cliente: clienteProyecto, descripcion }),
    onSuccess: ({ proyecto }) => {
      cliente.invalidateQueries({ queryKey: ['proyectos'] });
      onCerrar();
      navegar(`/p/${proyecto.id}`);
    }
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); crear.mutate(); };
  return (
    <form onSubmit={enviar}>
      <Campo etiqueta={t('comun.nombre')} required maxLength={160} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo etiqueta={t('comun.cliente')} maxLength={160} value={clienteProyecto} onChange={(e) => setClienteProyecto(e.target.value)} />
      <AreaTexto etiqueta={t('comun.descripcion')} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <p className="sutil">{t('proyectos.seraPropietario')}</p>
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}>{t('proyectos.crear')}</Boton>
      </div>
    </form>
  );
}
