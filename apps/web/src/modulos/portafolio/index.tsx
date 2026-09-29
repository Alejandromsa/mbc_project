// Pantallas de Portafolio bajo /proyectos/portafolio/.
//
// main.tsx monta el módulo SIN `nest` (<Route path="/portafolio/*?">) y el
// router anidado se abre aquí dentro. Con `nest` en main.tsx, <ConSesion> y la
// cabecera del shell quedaban dentro del router anidado y sus enlaces pasaban a
// ser relativos al módulo («Proyectos» -> /proyectos/portafolio/).
import { useState } from 'react';
import { Link, Route, Router, Switch } from 'wouter';
import { Vacio, useTitulo } from '../../shell/ui';
import { Cliente } from './paginas/Cliente';
import { Tablero } from './paginas/Tablero';
import './estilos.css';

/** wouter solo aplica decodeURI a la ruta: el resto (%2F, %26…) se decodifica aquí. */
function decodificar(v: string): string {
  try { return decodeURIComponent(v); } catch { return v; }
}

export function RutasPortafolio() {
  // «Incluir archivados» se conserva al pasar de la lista a un cliente y volver
  const [archivados, setArchivados] = useState(false);
  const comun = { archivados, onArchivados: setArchivados };
  return (
    <Router base="/portafolio">
      <Switch>
        <Route path="/"><Tablero {...comun} /></Route>
        <Route path="/cliente/:cliente">{(p) => <Cliente key={p.cliente} nombre={decodificar(p.cliente)} {...comun} />}</Route>
        <Route path="/sin-cliente"><Cliente nombre="" {...comun} /></Route>
        <Route><NoEncontrada /></Route>
      </Switch>
    </Router>
  );
}

/** La del shell enlaza a «/», que aquí dentro es el portafolio. */
function NoEncontrada() {
  useTitulo('No encontrada');
  return <Vacio>Esta página no existe. <Link href="/">Volver al portafolio</Link>.</Vacio>;
}
