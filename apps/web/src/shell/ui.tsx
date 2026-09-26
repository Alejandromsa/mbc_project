// Piezas de interfaz del shell (sin librería de componentes: pocas y sencillas).
import {
  useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes
} from 'react';
import { ErrorApi, type EstadoRevision } from './api';
import { ESTADOS } from './formato';

export function useTitulo(titulo: string) {
  useEffect(() => { document.title = `${titulo} · ProcessIQ`; }, [titulo]);
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'sutil';

export function Boton({ variante = 'secundario', cargando = false, className = '', children, ...resto }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  return (
    <button type="button" {...resto} className={`boton boton-${variante} ${className}`} disabled={resto.disabled || cargando} aria-busy={cargando}>
      {cargando ? 'Un momento…' : children}
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

/** Muestra el error de una llamada a la API, con el detalle de validación si lo hay. */
export function ErrorDe({ error }: { error: unknown }) {
  if (!error) return null;
  const mensaje = error instanceof Error ? error.message : 'Algo salió mal.';
  const detalles = error instanceof ErrorApi && Array.isArray(error.detalles) ? error.detalles.map(String) : [];
  return (
    <Aviso tipo="error">
      {mensaje}
      {detalles.length > 0 && <ul className="detalles">{detalles.slice(0, 8).map((d) => <li key={d}>{d}</li>)}</ul>}
    </Aviso>
  );
}

export function Insignia({ estado }: { estado: EstadoRevision }) {
  return <span className={`insignia insignia-${estado}`}>{ESTADOS[estado]}</span>;
}

export function Etiqueta({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'aviso' }) {
  return <span className={`etiqueta etiqueta-${tono}`}>{children}</span>;
}

export function Cargando() {
  return <p className="cargando" role="status">Cargando…</p>;
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
  const [copiada, setCopiada] = useState(false);
  return (
    <div className="clave-temporal">
      <p>Contraseña temporal de <strong>{para}</strong>. Solo se muestra ahora: entrégasela por un canal seguro. Deberá cambiarla al entrar.</p>
      <div className="clave-temporal-valor">
        <code>{clave}</code>
        <Boton variante="sutil" onClick={() => navigator.clipboard.writeText(clave).then(() => setCopiada(true))}>
          {copiada ? 'Copiada' : 'Copiar'}
        </Boton>
      </div>
    </div>
  );
}
