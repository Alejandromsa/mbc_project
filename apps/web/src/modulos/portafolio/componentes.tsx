// Piezas comunes de las pantallas del portafolio: avance, cifras y textos.
import type { ReactNode } from 'react';
import { EXECUTION_TYPES, PAIN_CATEGORIES } from '@processiq/dominio';
import type { Avance } from './api';

/** Rutas del shell fuera del módulo (el prefijo ~ sale de /proyectos/portafolio). */
export const fuera = {
  proyecto: (id: string) => `~/proyectos/p/${encodeURIComponent(id)}`,
  proceso: (id: string) => `~/proyectos/proceso/${encodeURIComponent(id)}`
};

/** Ruta del detalle de un cliente, relativa al módulo. Los proyectos sin cliente tienen la suya. */
export const rutaCliente = (cliente: string) => (cliente ? `/cliente/${encodeURIComponent(cliente)}` : '/sin-cliente');

export const nombreCliente = (cliente: string) => cliente || 'Sin cliente';

const numero = new Intl.NumberFormat('es-PE');
export const n = (v: number) => numero.format(v);
export const plural = (v: number, uno: string, varios: string) => `${n(v)} ${v === 1 ? uno : varios}`;
export const porcentaje = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

export function etiquetaEjecucion(id: string): string {
  if (id === 'sin_tipo') return 'Sin tipo';
  return EXECUTION_TYPES.find((t) => t.id === id)?.label ?? id;
}

export function etiquetaCategoria(id: string): string {
  return PAIN_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Estados de avance, del más cercano a la aprobación al más lejano (rampa de un solo tono). */
const TRAMOS = [
  { clave: 'aprobados', texto: 'Aprobados', clase: 'portafolio-tramo-aprobado' },
  { clave: 'enRevision', texto: 'En revisión', clase: 'portafolio-tramo-revision' },
  { clave: 'borradores', texto: 'En borrador', clase: 'portafolio-tramo-borrador' },
  { clave: 'sinRevisiones', texto: 'Sin revisiones', clase: 'portafolio-tramo-sin' }
] as const;

const totalDe = (a: Avance) => a.aprobados + a.enRevision + a.borradores + a.sinRevisiones;

export function textoAvance(a: Avance): string {
  return TRAMOS.map((t) => `${t.texto}: ${n(a[t.clave])}`).join(', ');
}

/** Barra apilada del estado de la última revisión de cada proceso. */
export function BarraAvance({ avance, grande = false }: { avance: Avance; grande?: boolean }) {
  const total = totalDe(avance);
  return (
    <div className={`portafolio-barra${grande ? ' portafolio-barra-grande' : ''}`} role="img" aria-label={textoAvance(avance)}>
      {TRAMOS.filter((t) => avance[t.clave] > 0).map((t) => (
        <span key={t.clave} className={t.clase} style={{ flexGrow: avance[t.clave] }}
          title={`${t.texto}: ${n(avance[t.clave])} (${porcentaje(avance[t.clave], total)} %)`} />
      ))}
    </div>
  );
}

export function LeyendaAvance({ avance }: { avance?: Avance }) {
  return (
    <ul className="portafolio-leyenda">
      {TRAMOS.map((t) => (
        <li key={t.clave}><span className={`portafolio-muestra ${t.clase}`} aria-hidden="true" />
          {t.texto}{avance && <strong>{n(avance[t.clave])}</strong>}</li>
      ))}
    </ul>
  );
}

/** Cifra destacada: etiqueta, valor y una nota breve. */
export function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: ReactNode; nota?: ReactNode }) {
  return (
    <div className="portafolio-cifra">
      <dt>{etiqueta}</dt>
      <dd>
        <span className="portafolio-cifra-valor">{valor}</span>
        {nota && <span className="portafolio-cifra-nota">{nota}</span>}
      </dd>
    </div>
  );
}

/** Casilla para incluir los proyectos archivados (se recuerda mientras se navega por el portafolio). */
export function CasillaArchivados({ valor, onCambio }: { valor: boolean; onCambio: (v: boolean) => void }) {
  return (
    <label className="casilla portafolio-casilla">
      <input type="checkbox" checked={valor} onChange={(e) => onCambio(e.target.checked)} />
      Incluir proyectos archivados
    </label>
  );
}
