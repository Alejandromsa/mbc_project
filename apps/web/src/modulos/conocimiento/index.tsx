// Conocimiento: pantallas bajo /proyectos/conocimiento/.
//
// main.tsx la monta con `path="/conocimiento/*?"` y SIN `nest`: el enrutador
// anidado se abre aquí, dentro de <ConSesion>. Con `nest` en main.tsx, la
// cabecera del shell (que pinta ConSesion) quedaba dentro de la base
// /proyectos/conocimiento: sus enlaces apuntaban a /proyectos/conocimiento/…
// y el menú resaltaba «Proyectos».
import { Link, Route, Router, Switch } from 'wouter';
import { Vacio, useTitulo } from '../../shell/ui';
import { Buscar } from './paginas/Buscar';
import { Marco } from './paginas/Marco';
import { Proceso } from './paginas/Proceso';
import { useT } from './textos';
import './estilos.css';

export function RutasConocimiento() {
  return (
    <Router base="/conocimiento">
      <Switch>
        <Route path="/"><Buscar /></Route>
        <Route path="/marco"><Marco /></Route>
        <Route path="/proceso/:id">{(p) => <Proceso key={p.id} id={p.id} />}</Route>
        <Route><NoEncontrada /></Route>
      </Switch>
    </Router>
  );
}

function NoEncontrada() {
  const t = useT();
  useTitulo(t('noEncontrada'));
  return <Vacio>{t.rico('noEncontradaTexto', {}, { enlace: (texto) => <Link href="/">{texto}</Link> })}</Vacio>;
}
