// Entrar y cambiar la contraseña (cuentas locales; Entra ID llegará después).
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useIrA, useVolver } from '../navegacion';
import { CLAVE_SESION, useSesion, useUsuario } from '../sesion';
import { Aviso, Boton, Campo, ErrorDe, useTitulo } from '../ui';

export function Entrar() {
  useTitulo('Entrar');
  const volver = useVolver();
  const irA = useIrA();
  const cliente = useQueryClient();
  const sesion = useSesion();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');

  const continuar = (debeCambiarClave: boolean) =>
    irA(debeCambiarClave ? `/proyectos/clave?volver=${encodeURIComponent(volver)}` : volver);

  const entrar = useMutation({
    mutationFn: () => api.entrar(email, clave),
    onSuccess: ({ usuario }) => { cliente.setQueryData(CLAVE_SESION, usuario); continuar(usuario.debeCambiarClave); }
  });

  // Con sesión ya abierta (p. ej. otra pestaña), no hace falta entrar
  useEffect(() => {
    if (sesion.data && !entrar.isPending && !entrar.isSuccess) continuar(sesion.data.debeCambiarClave);
  }, [sesion.data]);

  const enviar = (e: FormEvent) => { e.preventDefault(); entrar.mutate(); };

  return (
    <main className="acceso">
      <form className="tarjeta acceso-tarjeta" onSubmit={enviar}>
        <img src="/logo-mbc.svg" alt="MBC" width={96} height={24} />
        <h1>ProcessIQ</h1>
        <p className="sutil">Entra con tu cuenta para trabajar en los proyectos del equipo.</p>
        <Campo etiqueta="Correo" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo etiqueta="Contraseña" type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
        <ErrorDe error={entrar.error} />
        <Boton type="submit" variante="primario" cargando={entrar.isPending}>Entrar</Boton>
        <p className="sutil pie">
          ¿No tienes cuenta o no recuerdas la contraseña? Pídesela a un administrador.<br />
          También puedes <a href="/">usar el editor sin cuenta</a> (el trabajo queda en este navegador).
        </p>
      </form>
    </main>
  );
}

export function CambiarClave() {
  useTitulo('Cambiar contraseña');
  const usuario = useUsuario();
  const volver = useVolver();
  const irA = useIrA();
  const cliente = useQueryClient();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [noCoinciden, setNoCoinciden] = useState(false);

  const cambiar = useMutation({
    mutationFn: () => api.cambiarClave(actual, nueva),
    onSuccess: () => {
      cliente.setQueryData(CLAVE_SESION, { ...usuario, debeCambiarClave: false });
      irA(volver.startsWith('/proyectos/clave') ? '/proyectos/' : volver);
    }
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setNoCoinciden(nueva !== repetir);
    if (nueva === repetir) cambiar.mutate();
  };

  return (
    <form className="tarjeta formulario-estrecho" onSubmit={enviar}>
      <h1>Cambiar contraseña</h1>
      {usuario.debeCambiarClave && (
        <Aviso tipo="atencion">Estás usando una contraseña temporal. Elige una propia para continuar.</Aviso>
      )}
      <Campo etiqueta={usuario.debeCambiarClave ? 'Contraseña temporal' : 'Contraseña actual'} type="password"
        autoComplete="current-password" required autoFocus value={actual} onChange={(e) => setActual(e.target.value)} />
      <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" required minLength={10}
        ayuda="Al menos 10 caracteres, no solo números y sin tu usuario de correo." value={nueva} onChange={(e) => setNueva(e.target.value)} />
      <Campo etiqueta="Repite la contraseña nueva" type="password" autoComplete="new-password" required value={repetir}
        onChange={(e) => setRepetir(e.target.value)} />
      {noCoinciden && <Aviso tipo="error">Las dos contraseñas nuevas no coinciden.</Aviso>}
      <ErrorDe error={cambiar.error} />
      <Boton type="submit" variante="primario" cargando={cambiar.isPending}>Guardar contraseña</Boton>
    </form>
  );
}
