// Piezas comunes de las pantallas del portafolio: avance, cifras y textos.
import type { ReactNode } from 'react';
import { EXECUTION_TYPES, PAIN_CATEGORIES } from '@processiq/dominio';
import type { Avance } from './api';
import { CATEGORIAS_PAIN_EN, EJECUCION_EN, useT, type TraductorPortafolio } from './textos';

/** Rutas del shell fuera del módulo (el prefijo ~ sale de /proyectos/portafolio). */
export const fuera = {
  proyecto: (id: string) => `~/proyectos/p/${encodeURIComponent(id)}`,
  proceso: (id: string) => `~/proyectos/proceso/${encodeURIComponent(id)}`
};

/** Ruta del detalle de un cliente, relativa al módulo. Los proyectos sin cliente tienen la suya. */
export const rutaCliente = (cliente: string) => (cliente ? `/cliente/${encodeURIComponent(cliente)}` : '/sin-cliente');

export const nombreCliente = (cliente: string, t: TraductorPortafolio) => cliente || t('sinCliente');

export const porcentaje = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

export function etiquetaEjecucion(id: string, t: TraductorPortafolio): string {
  if (id === 'sin_tipo') return t('sinTipo');
  const tipo = EXECUTION_TYPES.find((x) => x.id === id);
  if (!tipo) return id;
  return t.idioma === 'en' ? EJECUCION_EN[tipo.id] : tipo.label;
}

export function etiquetaCategoria(id: string, t: TraductorPortafolio): string {
  const etiqueta = PAIN_CATEGORIES.find((c) => c.id === id)?.label ?? id;
  return (t.idioma === 'en' && CATEGORIAS_PAIN_EN[id]) || etiqueta;
}

/** Estados de avance, del más cercano a la aprobación al más lejano (rampa de un solo tono). */
const TRAMOS = [
  { clave: 'aprobados', texto: 'tramoAprobados', clase: 'portafolio-tramo-aprobado' },
  { clave: 'enRevision', texto: 'tramoRevision', clase: 'portafolio-tramo-revision' },
  { clave: 'borradores', texto: 'tramoBorrador', clase: 'portafolio-tramo-borrador' },
  { clave: 'sinRevisiones', texto: 'tramoSin', clase: 'portafolio-tramo-sin' }
] as const;

const totalDe = (a: Avance) => a.aprobados + a.enRevision + a.borradores + a.sinRevisiones;

export function textoAvance(a: Avance, t: TraductorPortafolio): string {
  return TRAMOS.map((x) => t('tramo', { tramo: t(x.texto), n: a[x.clave] })).join(', ');
}

/** Barra apilada del estado de la última revisión de cada proceso. */
export function BarraAvance({ avance, grande = false }: { avance: Avance; grande?: boolean }) {
  const t = useT();
  const total = totalDe(avance);
  return (
    <div className={`portafolio-barra${grande ? ' portafolio-barra-grande' : ''}`} role="img" aria-label={textoAvance(avance, t)}>
      {TRAMOS.filter((x) => avance[x.clave] > 0).map((x) => (
        <span key={x.clave} className={x.clase} style={{ flexGrow: avance[x.clave] }}
          title={t('tramoTitulo', { tramo: t(x.texto), n: avance[x.clave], p: porcentaje(avance[x.clave], total) })} />
      ))}
    </div>
  );
}

export function LeyendaAvance({ avance }: { avance?: Avance }) {
  const t = useT();
  return (
    <ul className="portafolio-leyenda">
      {TRAMOS.map((x) => (
        <li key={x.clave}><span className={`portafolio-muestra ${x.clase}`} aria-hidden="true" />
          {t(x.texto)}{avance && <strong>{t.numero(avance[x.clave])}</strong>}</li>
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
  const t = useT();
  return (
    <label className="casilla portafolio-casilla">
      <input type="checkbox" checked={valor} onChange={(e) => onCambio(e.target.checked)} />
      {t('incluirArchivados')}
    </label>
  );
}
