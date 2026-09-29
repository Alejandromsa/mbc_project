// Sesión del usuario en el shell: consulta, guardia de rutas y cabecera.
import { useEffect, useRef, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, Redirect, useLocation, useSearch } from 'wouter';
import { api, ErrorApi, type Usuario } from './api';
import { ROLES_ORGANIZACION } from './formato';
import { Aviso, Cargando, ErrorDe } from './ui';

export const CLAVE_SESION = ['sesion'] as const;

/** Usuario con sesión, o null si no hay (401). */
export function useSesion() {
  return useQuery({
    queryKey: CLAVE_SESION,
    queryFn: async (): Promise<Usuario | null> => {
      try {
        return (await api.sesion()).usuario;
      } catch (e) {
        if (e instanceof ErrorApi && e.estado === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000
  });
}

/** Para páginas bajo <ConSesion>: el usuario ya está garantizado. */
export function useUsuario(): Usuario {
  const { data } = useSesion();
  if (!data) throw new Error('useUsuario fuera de <ConSesion>');
  return data;
}

/** Ruta actual completa (con /proyectos y la búsqueda), para volver tras entrar. */
function useRutaActual(): string {
  const [ubicacion] = useLocation();
  const busqueda = useSearch();
  return '/proyectos' + (ubicacion === '/' ? '/' : ubicacion) + (busqueda ? '?' + busqueda : '');
}

export function ConSesion({ children, soloAdmin = false, permitirClaveTemporal = false }:
  { children: ReactNode; soloAdmin?: boolean; permitirClaveTemporal?: boolean }) {
  const sesion = useSesion();
  const volver = encodeURIComponent(useRutaActual());
  if (sesion.isPending) return <Cargando />;
  if (sesion.isError) return <main className="shell-contenido"><ErrorDe error={sesion.error} /></main>;
  const usuario = sesion.data;
  if (!usuario) return <Redirect to={`/entrar?volver=${volver}`} replace />;
  if (usuario.debeCambiarClave && !permitirClaveTemporal) return <Redirect to={`/clave?volver=${volver}`} replace />;
  return (
    <Marco usuario={usuario}>
      {soloAdmin && usuario.rol !== 'admin'
        ? <Aviso tipo="error">Esta sección es solo para administradores.</Aviso>
        : children}
    </Marco>
  );
}

/**
 * Pantallas de administración en un desplegable: así la cabecera no crece con
 * cada módulo de iniciativa (con Portafolio y Conocimiento ya no cabía a 1280 px).
 * Se cierra al elegir una pantalla, al pulsar fuera o con Escape.
 */
function MenuAdministracion({ aviso }: { aviso: boolean }) {
  const [ubicacion] = useLocation();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (menu.current) menu.current.open = false; }, [ubicacion]);
  useEffect(() => {
    const cerrar = (e: Event) => {
      const d = menu.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener('click', cerrar);
    document.addEventListener('keydown', cerrar);
    return () => { document.removeEventListener('click', cerrar); document.removeEventListener('keydown', cerrar); };
  }, []);
  const activo = ubicacion.startsWith('/admin/');
  return (
    <details ref={menu} className={`menu-admin${activo ? ' activo' : ''}`}>
      <summary>Administración{aviso && <span className="punto-aviso" title="Hay problemas: revisa «Sistema»" />}</summary>
      <div className="menu-admin-lista">
        <EnlaceMenu href="/admin/usuarios">Usuarios</EnlaceMenu>
        <EnlaceMenu href="/admin/catalogos">Catálogos</EnlaceMenu>
        <EnlaceMenu href="/admin/auditoria">Auditoría</EnlaceMenu>
        <EnlaceMenu href="/admin/ia">IA</EnlaceMenu>
        <EnlaceMenu href="/admin/sistema" aviso={aviso}>Sistema</EnlaceMenu>
      </div>
    </details>
  );
}

function EnlaceMenu({ href, children, aviso = false }: { href: string; children: ReactNode; aviso?: boolean }) {
  const [ubicacion] = useLocation();
  // «Proyectos» sigue resaltado dentro de un proyecto o de un proceso
  const activo = href === '/'
    ? ubicacion === '/' || /^\/(p|proceso)\//.test(ubicacion)
    : ubicacion === href || ubicacion.startsWith(href + '/');
  return (
    <Link href={href} className={activo ? 'activo' : ''} aria-current={activo ? 'page' : undefined}>
      {children}{aviso && <span className="punto-aviso" title="Hay problemas: revisa la pantalla" />}
    </Link>
  );
}

function Marco({ usuario, children }: { usuario: Usuario; children: ReactNode }) {
  // Administradores: punto rojo en «Sistema» si hay algún problema
  const sistema = useQuery({
    queryKey: ['sistema'], queryFn: api.sistema, refetchInterval: 60_000,
    enabled: usuario.rol === 'admin' && !usuario.debeCambiarClave
  });
  const hayProblemas = !!sistema.data?.avisos.some((a) => a.nivel === 'error');
  // Al salir se recarga la página: no queda en memoria nada del usuario anterior.
  // (QueryClient.clear() desengancha los observadores y la guardia no se enteraba.)
  const salir = useMutation({
    mutationFn: api.salir,
    onSettled: () => { window.location.assign('/proyectos/entrar'); }
  });
  return (
    <div className="shell">
      <header className="shell-cabecera">
        <Link href="/" className="marca" aria-label="ProcessIQ · Proyectos">
          <img src="/logo-mbc.svg" alt="" width={56} height={14} />
          <span>ProcessIQ</span>
        </Link>
        {!usuario.debeCambiarClave && (
          <nav aria-label="Secciones">
            <EnlaceMenu href="/">Proyectos</EnlaceMenu>
            <EnlaceMenu href="/portafolio">Portafolio</EnlaceMenu>
            <EnlaceMenu href="/conocimiento">Conocimiento</EnlaceMenu>
            {usuario.rol === 'admin' && <MenuAdministracion aviso={hayProblemas} />}
            <a href="/" title="El editor, sin proyecto (trabajo guardado en este navegador)">Editor libre</a>
          </nav>
        )}
        <div className="usuario">
          <span className="usuario-nombre" title={usuario.email}>{usuario.nombre}<small>{ROLES_ORGANIZACION[usuario.rol]}</small></span>
          {!usuario.debeCambiarClave && <Link href="/clave">Cambiar contraseña</Link>}
          <button type="button" className="enlace" onClick={() => salir.mutate()} disabled={salir.isPending}>Salir</button>
        </div>
      </header>
      <main className="shell-contenido">{children}</main>
    </div>
  );
}
