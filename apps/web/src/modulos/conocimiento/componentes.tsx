// Piezas compartidas por las pantallas de Conocimiento.
import { Fragment } from 'react';
import { Link, useLocation } from 'wouter';
import type { Campo } from './api';

/** Fuera del módulo: «~» sale de la base /proyectos/conocimiento (wouter), así que se escribe la ruta entera. */
export const fuera = {
  proceso: (id: string) => `~/proyectos/proceso/${encodeURIComponent(id)}`,
  proyecto: (id: string) => `~/proyectos/p/${encodeURIComponent(id)}`
};

export const NOMBRE_CAMPO: Record<Campo, string> = {
  nombre: 'Nombre',
  actividad: 'Actividad',
  sistema: 'Sistema',
  rol: 'Rol',
  elemento: 'En el diagrama',
  ficha: 'Ficha'
};

const porcentaje = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 0 });
export const pct = (v: number) => porcentaje.format(v);

/** Pestañas de la sección (enlaces: cada una tiene su dirección). */
export function PestanasConocimiento() {
  const [ubicacion] = useLocation();
  const pestanas = [
    { href: '/', texto: 'Buscar procesos', activa: ubicacion === '/' || ubicacion.startsWith('/proceso/') },
    { href: '/marco', texto: 'Marco de referencia', activa: ubicacion === '/marco' }
  ];
  return (
    <nav className="conocimiento-pestanas" aria-label="Conocimiento">
      {pestanas.map((p) => (
        <Link key={p.href} href={p.href} className={p.activa ? 'activa' : ''} aria-current={p.activa ? 'page' : undefined}>{p.texto}</Link>
      ))}
    </nav>
  );
}

const plano = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Marca las palabras del texto que contienen alguna de las buscadas (sin
 * tildes ni mayúsculas). Las coincidencias aproximadas («polisa») no se marcan.
 */
export function Resaltado({ texto, terminos }: { texto: string; terminos: string[] }) {
  const partes = texto.split(/([\p{L}\p{N}]+)/u);
  return (
    <>
      {partes.map((p, i) => {
        const w = plano(p);
        const marca = i % 2 === 1 && terminos.some((t) => (t.length <= 3 ? w === t : w.includes(t)));
        return marca ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** Barra horizontal de 0 a 1, con su texto para lectores de pantalla. */
export function Barra({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <span className="conocimiento-barra" role="img" aria-label={etiqueta}>
      <span style={{ width: `${Math.max(0, Math.min(1, valor)) * 100}%` }} />
    </span>
  );
}
