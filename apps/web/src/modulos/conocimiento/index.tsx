// Conocimiento: pantallas bajo /proyectos/conocimiento/ (rutas relativas: main.tsx la monta con nest).
import { Link, Route, Switch } from 'wouter';
import { Vacio, useTitulo } from '../../shell/ui';
import { Buscar } from './paginas/Buscar';
import { Marco } from './paginas/Marco';
import { Proceso } from './paginas/Proceso';
import './estilos.css';

export function RutasConocimiento() {
  return (
    <Switch>
      <Route path="/"><Buscar /></Route>
      <Route path="/marco"><Marco /></Route>
      <Route path="/proceso/:id">{(p) => <Proceso key={p.id} id={p.id} />}</Route>
      <Route><NoEncontrada /></Route>
    </Switch>
  );
}

function NoEncontrada() {
  useTitulo('No encontrada');
  return <Vacio>Esta página no existe. <Link href="/">Volver al buscador</Link>.</Vacio>;
}
