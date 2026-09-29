// Shell de proyectos (React, docs/arquitectura.md ADR 6): acceso, proyectos,
// procesos, revisiones y administración. El editor sigue siendo la página "/";
// desde aquí se abre con /?proceso=… o /?revision=… (src/app/plataforma).
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Router, Switch } from 'wouter';
import { ErrorApi } from './api';
import { capturarErrores, reportarError } from './observabilidad';
import { Auditoria, NoEncontrada, Usuarios } from './paginas/Admin';
import { ConsumoIa } from './paginas/Ia';
import { Catalogos } from './paginas/Catalogos';
import { Sistema } from './paginas/Sistema';
import { Importar } from './paginas/Importar';
import { CambiarClave, Entrar } from './paginas/Acceso';
import { Proceso } from './paginas/Proceso';
import { Proyecto } from './paginas/Proyecto';
import { Proyectos } from './paginas/Proyectos';
import { CLAVE_SESION, ConSesion } from './sesion';
import './estilos.css';
import { RutasConocimiento } from '../modulos/conocimiento';

// /proyectos -> /proyectos/ (el router trabaja con rutas relativas a la base)
if (location.pathname === '/proyectos') history.replaceState(null, '', '/proyectos/' + location.search);

// Errores no controlados: a /api/errores (pantalla «Sistema» del administrador)
capturarErrores('web');

/** Si una pantalla falla al pintarse, se informa y se ofrece recargar en vez de quedar en blanco. */
class LimiteDeErrores extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override componentDidCatch(error: Error, info: ErrorInfo) { reportarError('web', error, { componentes: info.componentStack?.slice(0, 1500) }); }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="acceso">
        <div className="tarjeta acceso-tarjeta">
          <h1>Algo salió mal</h1>
          <p className="sutil">La pantalla falló al mostrarse. Ya quedó registrado para que lo revisemos.</p>
          <button type="button" className="boton boton-primario" onClick={() => location.reload()}>Recargar</button>
        </div>
      </main>
    );
  }
}

// Sesión caducada o contraseña temporal: se vuelve a consultar la sesión y la
// guardia (ConSesion) lleva a «Entrar» o a «Cambiar contraseña».
function revisarSesion(error: unknown) {
  if (error instanceof ErrorApi && (error.estado === 401 || error.codigo === 'CAMBIAR_CLAVE')) {
    consultas.invalidateQueries({ queryKey: CLAVE_SESION });
  }
}

const consultas = new QueryClient({
  queryCache: new QueryCache({ onError: revisarSesion }),
  mutationCache: new MutationCache({ onError: revisarSesion }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Los 4xx no se reintentan (permiso, no encontrado…); los fallos de red, dos veces
      retry: (intentos, error) => !(error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) && intentos < 2
    }
  }
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <LimiteDeErrores>
    <QueryClientProvider client={consultas}>
      <Router base="/proyectos">
        <Switch>
          <Route path="/entrar" component={Entrar} />
          <Route path="/clave"><ConSesion permitirClaveTemporal><CambiarClave /></ConSesion></Route>
          <Route path="/"><ConSesion><Proyectos /></ConSesion></Route>
          <Route path="/importar"><ConSesion><Importar /></ConSesion></Route>
          <Route path="/p/:id">{(p) => <ConSesion><Proyecto key={p.id} id={p.id} /></ConSesion>}</Route>
          <Route path="/proceso/:id">{(p) => <ConSesion><Proceso key={p.id} id={p.id} /></ConSesion>}</Route>
          <Route path="/admin/usuarios"><ConSesion soloAdmin><Usuarios /></ConSesion></Route>
          <Route path="/admin/auditoria"><ConSesion soloAdmin><Auditoria /></ConSesion></Route>
          <Route path="/admin/ia"><ConSesion soloAdmin><ConsumoIa /></ConSesion></Route>
          <Route path="/admin/catalogos"><ConSesion soloAdmin><Catalogos /></ConSesion></Route>
          <Route path="/admin/sistema"><ConSesion soloAdmin><Sistema /></ConSesion></Route>
          <Route path="/conocimiento/*?"><ConSesion><RutasConocimiento /></ConSesion></Route>
          <Route><ConSesion><NoEncontrada /></ConSesion></Route>
        </Switch>
      </Router>
    </QueryClientProvider>
    </LimiteDeErrores>
  </StrictMode>
);
