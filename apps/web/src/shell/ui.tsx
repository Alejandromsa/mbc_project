// Piezas de interfaz del shell (sin librería de componentes: pocas y sencillas).
import {
  useEffect, useId, useRef, useState,
  type AnchorHTMLAttributes, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes
} from 'react';
import { ErrorApi, type EstadoRevision } from './api';
import { IDIOMAS, cambiarIdioma, useT, type Idioma } from './i18n';
import { mensajeDeError } from './mensajes';

export function useTitulo(titulo: string) {
  useEffect(() => { document.title = `${titulo} · ProcessIQ`; }, [titulo]);
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'sutil';

export function Boton({ variante = 'secundario', cargando = false, className = '', children, ...resto }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  const t = useT();
  return (
    <button type="button" {...resto} className={`boton boton-${variante} ${className}`} disabled={resto.disabled || cargando} aria-busy={cargando}>
      {cargando ? t('comun.unMomento') : children}
    </button>
  );
}

export function Campo({ etiqueta, ayuda, ...resto }: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: ReactNode }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} {...resto} />
      {ayuda && <small>{ayuda}</small>}
    </div>
  );
}

export function AreaTexto({ etiqueta, ...resto }: TextareaHTMLAttributes<HTMLTextAreaElement> & { etiqueta: string }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <textarea id={id} rows={3} {...resto} />
    </div>
  );
}

export function Selector({ etiqueta, opciones, ...resto }:
  SelectHTMLAttributes<HTMLSelectElement> & { etiqueta?: string; opciones: { valor: string; texto: string }[] }) {
  const id = useId();
  const select = (
    <select id={id} {...resto}>
      {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
    </select>
  );
  if (!etiqueta) return select;
  return <div className="campo"><label htmlFor={id}>{etiqueta}</label>{select}</div>;
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'error' | 'ok' | 'atencion'; children: ReactNode }) {
  return <div className={`aviso aviso-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>{children}</div>;
}

/**
 * Muestra el error de una llamada a la API, con el detalle de validación si lo hay.
 * En inglés, el mensaje del servidor (en español) se traduce si se conoce (mensajes.ts).
 */
export function ErrorDe({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  const mensaje = mensajeDeError(error, t.idioma, t('comun.algoSalioMal'));
  const detalles = error instanceof ErrorApi && Array.isArray(error.detalles) ? error.detalles.map(String) : [];
  return (
    <Aviso tipo="error">
      {mensaje}
      {detalles.length > 0 && <ul className="detalles">{detalles.slice(0, 8).map((d) => <li key={d}>{d}</li>)}</ul>}
    </Aviso>
  );
}

export function Insignia({ estado }: { estado: EstadoRevision }) {
  const t = useT();
  return <span className={`insignia insignia-${estado}`}>{t.estado(estado)}</span>;
}

export function Etiqueta({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'aviso' }) {
  return <span className={`etiqueta etiqueta-${tono}`}>{children}</span>;
}

export function Cargando() {
  const t = useT();
  return <p className="cargando" role="status">{t('comun.cargando')}</p>;
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="vacio">{children}</div>;
}

/** Diálogo modal nativo (<dialog>): Esc y el botón Cancelar lo cierran. */
export function Dialogo({ abierto, titulo, onCerrar, children, ancho = false }:
  { abierto: boolean; titulo: string; onCerrar: () => void; children: ReactNode; ancho?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog ref={ref} className={ancho ? 'dialogo dialogo-ancho' : 'dialogo'} aria-labelledby={idTitulo} onClose={onCerrar}>
      <h2 id={idTitulo}>{titulo}</h2>
      {abierto && children}
    </dialog>
  );
}

/** Contraseña temporal: se muestra una sola vez, con botón para copiarla. */
export function ClaveTemporal({ clave, para }: { clave: string; para: string }) {
  const t = useT();
  const [copiada, setCopiada] = useState(false);
  return (
    <div className="clave-temporal">
      <p>{t.rico('claveTemporal.texto', { para })}</p>
      <div className="clave-temporal-valor">
        <code>{clave}</code>
        <Boton variante="sutil" onClick={() => navigator.clipboard.writeText(clave).then(() => setCopiada(true))}>
          {copiada ? t('comun.copiada') : t('comun.copiar')}
        </Boton>
      </div>
    </div>
  );
}

/**
 * Enlace que abre el editor (/, /?proceso=…, /?revision=…). El editor no se
 * traduce: en inglés, el `title` avisa de que abre en español.
 */
export function EnlaceEditor({ title, ...resto }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const t = useT();
  return <a {...resto} title={title ?? (t('comun.editorEnEspanol') || undefined)} />;
}

/** Nombre de cada idioma en su propio idioma, como se suele mostrar en un selector. */
const NOMBRE_IDIOMA: Record<Idioma, string> = { es: 'Español', en: 'English' };

/** «ES / EN»: cambia el idioma del shell y lo recuerda en este navegador (i18n.ts). */
export function SelectorIdioma() {
  const t = useT();
  return (
    <div className="idioma" role="group" aria-label={t('idioma.grupo')}>
      {IDIOMAS.map((i) => (
        <button key={i} type="button" lang={i} aria-label={NOMBRE_IDIOMA[i]} title={NOMBRE_IDIOMA[i]}
          aria-pressed={t.idioma === i} onClick={() => cambiarIdioma(i)}>
          {i.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
