// Mis proyectos (todos, si soy administrador) y alta de proyectos.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { api } from '../api';
import { ROLES_PROYECTO, fecha } from '../formato';
import { useUsuario } from '../sesion';
import { AreaTexto, Boton, Campo, Cargando, Dialogo, ErrorDe, Etiqueta, Vacio, useTitulo } from '../ui';

export function Proyectos() {
  useTitulo('Proyectos');
  const usuario = useUsuario();
  const [verArchivados, setVerArchivados] = useState(false);
  const [creando, setCreando] = useState(false);
  const consulta = useQuery({ queryKey: ['proyectos'], queryFn: api.proyectos });

  const todos = consulta.data?.proyectos ?? [];
  const archivados = todos.filter((p) => p.archivado).length;
  const lista = todos.filter((p) => verArchivados || !p.archivado);

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Proyectos</h1>
          <p className="sutil">{usuario.rol === 'admin' ? 'Todos los proyectos de la organización.' : 'Los proyectos en los que participas.'}</p>
        </div>
        {usuario.rol !== 'lector' && <Boton variante="primario" onClick={() => setCreando(true)}>Nuevo proyecto</Boton>}
      </div>

      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : lista.length === 0 ? (
        <Vacio>
          {todos.length === 0
            ? usuario.rol === 'lector'
              ? 'Todavía no participas en ningún proyecto. Pide a su propietario que te añada.'
              : 'Todavía no hay proyectos. Crea el primero con «Nuevo proyecto».'
            : 'Todos tus proyectos están archivados.'}
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
                  <Etiqueta>{ROLES_PROYECTO[p.rol]}</Etiqueta>
                  {p.archivado && <Etiqueta tono="aviso">Archivado</Etiqueta>}
                  <span className="sutil">Creado el {fecha(p.creadoEn)}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {archivados > 0 && (
        <label className="casilla">
          <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
          Mostrar archivados ({archivados})
        </label>
      )}

      <Dialogo abierto={creando} titulo="Nuevo proyecto" onCerrar={() => setCreando(false)}>
        <NuevoProyecto onCerrar={() => setCreando(false)} />
      </Dialogo>
    </>
  );
}

function NuevoProyecto({ onCerrar }: { onCerrar: () => void }) {
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
      <Campo etiqueta="Nombre" required maxLength={160} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo etiqueta="Cliente" maxLength={160} value={clienteProyecto} onChange={(e) => setClienteProyecto(e.target.value)} />
      <AreaTexto etiqueta="Descripción" maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <p className="sutil">Serás su propietario: podrás añadir miembros y aprobar revisiones.</p>
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}>Crear proyecto</Boton>
      </div>
    </form>
  );
}
