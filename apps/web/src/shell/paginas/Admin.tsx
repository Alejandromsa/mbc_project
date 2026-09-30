// Administración: cuentas locales y auditoría (solo administradores).
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api, type RolOrganizacion, type UsuarioAdmin } from '../api';
import { useT, type TraductorShell } from '../i18n';
import { useUsuario } from '../sesion';
import { Aviso, Boton, Campo, Cargando, ClaveTemporal, Dialogo, ErrorDe, Etiqueta, Selector, Vacio, useTitulo } from '../ui';

const opcionesRol = (t: TraductorShell) =>
  (['admin', 'consultor', 'lector'] as RolOrganizacion[]).map((r) => ({ valor: r, texto: t.rolOrganizacion(r) }));

export function Usuarios() {
  const t = useT();
  useTitulo(t('usuarios.titulo'));
  const yo = useUsuario();
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: ['usuarios'], queryFn: api.usuarios });
  const [creando, setCreando] = useState(false);
  const [clave, setClave] = useState<{ para: string; clave: string } | null>(null);

  const refrescar = () => cliente.invalidateQueries({ queryKey: ['usuarios'] });
  const cambiar = useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: Partial<Pick<UsuarioAdmin, 'rol' | 'activo'>> }) => api.cambiarUsuario(id, cambios),
    onSettled: refrescar
  });
  const restablecer = useMutation({
    mutationFn: (u: UsuarioAdmin) => api.restablecerClave(u.id).then((r) => ({ ...r, para: u.email })),
    onSuccess: (r) => { setClave({ para: r.para, clave: r.claveTemporal }); refrescar(); }
  });
  // Cerrar todas las sesiones de una cuenta (perdió un equipo, sospecha…): la cuenta sigue activa
  const [sesionesCerradas, setSesionesCerradas] = useState<{ n: number; nombre: string } | null>(null);
  const cerrarSesiones = useMutation({
    mutationFn: (u: UsuarioAdmin) => api.cerrarSesionesDe(u.id).then((r) => ({ n: r.cerradas, nombre: u.nombre })),
    onMutate: () => setSesionesCerradas(null),
    onSuccess: setSesionesCerradas
  });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('usuarios.titulo')}</h1>
          <p className="sutil">{t('usuarios.intro')}</p>
        </div>
        <Boton variante="primario" onClick={() => setCreando(true)}>{t('usuarios.nuevo')}</Boton>
      </div>
      <ErrorDe error={cambiar.error ?? restablecer.error ?? cerrarSesiones.error} />
      {sesionesCerradas && <Aviso tipo="ok">{t('usuarios.sesionesCerradas', sesionesCerradas)}</Aviso>}
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : (
        // Compacta: con «Cerrar sesiones», tres acciones por fila; a 1280 px la tabla normal se salía 150 px
        <table className="tabla tabla-compacta">
          <thead>
            <tr>
              <th>{t('comun.nombre')}</th><th>{t('comun.correo')}</th><th>{t('comun.rol')}</th><th>{t('comun.estado')}</th>
              <th>{t('usuarios.ultimoAcceso')}</th><th><span className="solo-lector">{t('comun.acciones')}</span></th>
            </tr>
          </thead>
          <tbody>
            {consulta.data.usuarios.map((u) => {
              const soyYo = u.id === yo.id;
              return (
                <tr key={u.id} className={u.activo ? '' : 'inactivo'}>
                  <td>{u.nombre}{soyYo && <span className="sutil"> {t('comun.tu')}</span>}</td>
                  <td>{u.email}</td>
                  <td>
                    <Selector aria-label={t('comun.rolDe', { nombre: u.nombre })} opciones={opcionesRol(t)} value={u.rol} disabled={soyYo}
                      onChange={(e) => cambiar.mutate({ id: u.id, cambios: { rol: e.target.value as RolOrganizacion } })} />
                  </td>
                  <td>
                    {!u.activo ? <Etiqueta tono="aviso">{t('usuarios.desactivada')}</Etiqueta> : u.debeCambiarClave ? <Etiqueta>{t('usuarios.claveTemporal')}</Etiqueta> : t('usuarios.activa')}
                  </td>
                  <td className="fecha">{t.fecha(u.ultimoAcceso)}</td>
                  <td className="celda-acciones">
                    {!soyYo && (
                      <>
                        <Boton variante="sutil" disabled={restablecer.isPending}
                          onClick={() => { if (confirm(t('usuarios.restablecerConfirmar', { nombre: u.nombre }))) restablecer.mutate(u); }}>
                          {t('usuarios.restablecer')}
                        </Boton>
                        {u.activo && (
                          <Boton variante="sutil" disabled={cerrarSesiones.isPending}
                            onClick={() => { if (confirm(t('usuarios.cerrarSesionesConfirmar', { nombre: u.nombre }))) cerrarSesiones.mutate(u); }}>
                            {t('usuarios.cerrarSesiones')}
                          </Boton>
                        )}
                        <Boton variante={u.activo ? 'peligro' : 'sutil'} disabled={cambiar.isPending}
                          onClick={() => cambiar.mutate({ id: u.id, cambios: { activo: !u.activo } })}>
                          {u.activo ? t('usuarios.desactivar') : t('usuarios.reactivar')}
                        </Boton>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Dialogo abierto={creando} titulo={t('usuarios.nuevo')} onCerrar={() => setCreando(false)}>
        <NuevoUsuario onCreado={(para, c) => { setCreando(false); setClave({ para, clave: c }); refrescar(); }} onCerrar={() => setCreando(false)} />
      </Dialogo>
      <Dialogo abierto={!!clave} titulo={t('usuarios.claveTemporal')} onCerrar={() => setClave(null)}>
        {clave && <ClaveTemporal clave={clave.clave} para={clave.para} />}
        <div className="acciones"><Boton variante="primario" onClick={() => setClave(null)}>{t('comun.hecho')}</Boton></div>
      </Dialogo>
    </>
  );
}

function NuevoUsuario({ onCreado, onCerrar }: { onCreado: (email: string, clave: string) => void; onCerrar: () => void }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<RolOrganizacion>('consultor');
  const crear = useMutation({
    mutationFn: () => api.crearUsuario({ email, nombre, rol }),
    onSuccess: (r) => onCreado(r.usuario.email, r.claveTemporal)
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); crear.mutate(); };
  return (
    <form onSubmit={enviar}>
      <Campo etiqueta={t('usuarios.nombreApellido')} required maxLength={120} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo etiqueta={t('comun.correo')} type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
      <Selector etiqueta={t('comun.rol')} value={rol} onChange={(e) => setRol(e.target.value as RolOrganizacion)} opciones={opcionesRol(t)} />
      <p className="sutil">{t('usuarios.explicacionRoles')}</p>
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>{t('comun.cancelar')}</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}>{t('usuarios.crear')}</Boton>
      </div>
    </form>
  );
}

export function Auditoria() {
  const t = useT();
  useTitulo(t('auditoria.titulo'));
  const [entidad, setEntidad] = useState('');
  const consulta = useQuery({ queryKey: ['auditoria', entidad], queryFn: () => api.auditoria({ entidad, limite: 200 }) });
  const entidades = [
    { valor: '', texto: t('auditoria.todo') },
    { valor: 'usuario', texto: t('auditoria.usuarios') },
    { valor: 'proyecto', texto: t('auditoria.proyectos') },
    { valor: 'proceso', texto: t('auditoria.procesos') },
    { valor: 'revision', texto: t('auditoria.revisiones') }
  ];
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{t('auditoria.titulo')}</h1>
          <p className="sutil">{t('auditoria.intro')}</p>
        </div>
        <Selector etiqueta={t('auditoria.mostrar')} value={entidad} onChange={(e) => setEntidad(e.target.value)} opciones={entidades} />
      </div>
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : consulta.data.eventos.length === 0 ? (
        <Vacio>{t('auditoria.sinEventos')}</Vacio>
      ) : (
        <table className="tabla tabla-compacta">
          <thead>
            <tr>
              <th>{t('comun.fecha')}</th><th>{t('auditoria.usuario')}</th><th>{t('auditoria.accion')}</th>
              <th>{t('auditoria.detalle')}</th><th>{t('auditoria.ip')}</th>
            </tr>
          </thead>
          <tbody>
            {consulta.data.eventos.map((e) => (
              <tr key={e.id}>
                <td className="fecha">{t.fecha(e.creadoEn)}</td>
                <td>{e.usuario ?? <span className="sutil">—</span>}</td>
                <td><code>{e.accion}</code></td>
                <td className="detalle-json">{e.detalle ? JSON.stringify(e.detalle) : ''}</td>
                <td>{e.ip ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function NoEncontrada() {
  const t = useT();
  useTitulo(t('noEncontrada.titulo'));
  return <Vacio>{t.rico('noEncontrada.texto', {}, { enlace: (texto) => <Link href="/">{texto}</Link> })}</Vacio>;
}
