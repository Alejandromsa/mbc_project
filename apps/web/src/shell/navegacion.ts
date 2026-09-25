import { useSearch, useLocation } from 'wouter';
import { destinoSeguro } from './formato';

/** Lleva a un destino del sitio: dentro del shell con el router; fuera (el editor), con una carga completa. */
export function useIrA() {
  const [, navegar] = useLocation();
  return (destino: string) => {
    if (/^\/proyectos(\/|\?|$)/.test(destino)) navegar(destino.slice('/proyectos'.length) || '/', { replace: true });
    else window.location.assign(destino);
  };
}

/** El parámetro ?volver= de la URL, ya validado. */
export function useVolver(): string {
  return destinoSeguro(new URLSearchParams(useSearch()).get('volver'));
}
