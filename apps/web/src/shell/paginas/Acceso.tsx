// Entrar y cambiar la contraseña (cuentas locales; Entra ID llegará después).
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useT } from '../i18n';
import { useIrA, useVolver } from '../navegacion';
import { CLAVE_SESION, useSesion, useUsuario } from '../sesion';
import { Aviso, Boton, Campo, EnlaceEditor, ErrorDe, SelectorIdioma, useTitulo } from '../ui';

export function Entrar() {
  const t = useT();
  useTitulo(t('entrar.titulo'));
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
        <SelectorIdioma />
        <img src="/logo-mbc.svg" alt="MBC" width={96} height={24} />
        <h1>ProcessIQ</h1>
        <p className="sutil">{t('entrar.intro')}</p>
        <Campo etiqueta={t('entrar.correo')} type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo etiqueta={t('entrar.clave')} type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
        <ErrorDe error={entrar.error} />
        <Boton type="submit" variante="primario" cargando={entrar.isPending}>{t('entrar.boton')}</Boton>
        <p className="sutil pie">
          {t('entrar.sinCuenta')}<br />
          {t.rico('entrar.editorSinCuenta', {}, { enlace: (texto) => <EnlaceEditor href="/">{texto}</EnlaceEditor> })}
        </p>
      </form>
    </main>
  );
}

export function CambiarClave() {
  const t = useT();
  useTitulo(t('clave.titulo'));
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
      <h1>{t('clave.titulo')}</h1>
      {usuario.debeCambiarClave && (
        <Aviso tipo="atencion">{t('clave.avisoTemporal')}</Aviso>
      )}
      <Campo etiqueta={usuario.debeCambiarClave ? t('clave.temporal') : t('clave.actual')} type="password"
        autoComplete="current-password" required autoFocus value={actual} onChange={(e) => setActual(e.target.value)} />
      <Campo etiqueta={t('clave.nueva')} type="password" autoComplete="new-password" required minLength={10}
        ayuda={t('clave.nuevaAyuda')} value={nueva} onChange={(e) => setNueva(e.target.value)} />
      <Campo etiqueta={t('clave.repetir')} type="password" autoComplete="new-password" required value={repetir}
        onChange={(e) => setRepetir(e.target.value)} />
      {noCoinciden && <Aviso tipo="error">{t('clave.noCoinciden')}</Aviso>}
      <ErrorDe error={cambiar.error} />
      <Boton type="submit" variante="primario" cargando={cambiar.isPending}>{t('clave.guardar')}</Boton>
    </form>
  );
}
