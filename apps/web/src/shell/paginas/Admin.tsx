// Administración: cuentas locales y auditoría (solo administradores).
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { api, type RolOrganizacion, type UsuarioAdmin } from '../api';
import { ROLES_ORGANIZACION, fecha } from '../formato';
import { useUsuario } from '../sesion';
import { Boton, Campo, Cargando, ClaveTemporal, Dialogo, ErrorDe, Etiqueta, Selector, Vacio, useTitulo } from '../ui';

const OPCIONES_ROL = (['admin', 'consultor', 'lector'] as RolOrganizacion[]).map((r) => ({ valor: r, texto: ROLES_ORGANIZACION[r] }));

export function Usuarios() {
  useTitulo('Usuarios');
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

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Usuarios</h1>
          <p className="sutil">Cuentas locales de la organización. Al crear una cuenta o restablecer su contraseña se genera una contraseña temporal.</p>
        </div>
        <Boton variante="primario" onClick={() => setCreando(true)}>Nuevo usuario</Boton>
      </div>
      <ErrorDe error={cambiar.error ?? restablecer.error} />
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : (
        <table className="tabla">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th><span className="solo-lector">Acciones</span></th></tr></thead>
          <tbody>
            {consulta.data.usuarios.map((u) => {
              const soyYo = u.id === yo.id;
              return (
                <tr key={u.id} className={u.activo ? '' : 'inactivo'}>
                  <td>{u.nombre}{soyYo && <span className="sutil"> (tú)</span>}</td>
                  <td>{u.email}</td>
                  <td>
                    <Selector aria-label={`Rol de ${u.nombre}`} opciones={OPCIONES_ROL} value={u.rol} disabled={soyYo}
                      onChange={(e) => cambiar.mutate({ id: u.id, cambios: { rol: e.target.value as RolOrganizacion } })} />
                  </td>
                  <td>
                    {!u.activo ? <Etiqueta tono="aviso">Desactivada</Etiqueta> : u.debeCambiarClave ? <Etiqueta>Contraseña temporal</Etiqueta> : 'Activa'}
                  </td>
                  <td className="fecha">{fecha(u.ultimoAcceso)}</td>
                  <td className="celda-acciones">
                    {!soyYo && (
                      <>
                        <Boton variante="sutil" disabled={restablecer.isPending}
                          onClick={() => { if (confirm(`¿Restablecer la contraseña de ${u.nombre}? Se cerrarán sus sesiones.`)) restablecer.mutate(u); }}>
                          Restablecer contraseña
                        </Boton>
                        <Boton variante={u.activo ? 'peligro' : 'sutil'} disabled={cambiar.isPending}
                          onClick={() => cambiar.mutate({ id: u.id, cambios: { activo: !u.activo } })}>
                          {u.activo ? 'Desactivar' : 'Reactivar'}
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

      <Dialogo abierto={creando} titulo="Nuevo usuario" onCerrar={() => setCreando(false)}>
        <NuevoUsuario onCreado={(para, c) => { setCreando(false); setClave({ para, clave: c }); refrescar(); }} onCerrar={() => setCreando(false)} />
      </Dialogo>
      <Dialogo abierto={!!clave} titulo="Contraseña temporal" onCerrar={() => setClave(null)}>
        {clave && <ClaveTemporal clave={clave.clave} para={clave.para} />}
        <div className="acciones"><Boton variante="primario" onClick={() => setClave(null)}>Hecho</Boton></div>
      </Dialogo>
    </>
  );
}

function NuevoUsuario({ onCreado, onCerrar }: { onCreado: (email: string, clave: string) => void; onCerrar: () => void }) {
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
      <Campo etiqueta="Nombre y apellido" required maxLength={120} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo etiqueta="Correo" type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
      <Selector etiqueta="Rol" value={rol} onChange={(e) => setRol(e.target.value as RolOrganizacion)} opciones={OPCIONES_ROL} />
      <p className="sutil">Consultor: crea proyectos. Lector: solo participa donde lo invitan. Administrador: además gestiona usuarios y ve todos los proyectos.</p>
      <ErrorDe error={crear.error} />
      <div className="acciones">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" variante="primario" cargando={crear.isPending}>Crear cuenta</Boton>
      </div>
    </form>
  );
}

const ENTIDADES = [
  { valor: '', texto: 'Todo' },
  { valor: 'usuario', texto: 'Usuarios y sesiones' },
  { valor: 'proyecto', texto: 'Proyectos' },
  { valor: 'proceso', texto: 'Procesos' },
  { valor: 'revision', texto: 'Revisiones' }
];

export function Auditoria() {
  useTitulo('Auditoría');
  const [entidad, setEntidad] = useState('');
  const consulta = useQuery({ queryKey: ['auditoria', entidad], queryFn: () => api.auditoria({ entidad, limite: 200 }) });
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Auditoría</h1>
          <p className="sutil">Quién hizo qué y cuándo. Se muestran los 200 eventos más recientes.</p>
        </div>
        <Selector etiqueta="Mostrar" value={entidad} onChange={(e) => setEntidad(e.target.value)} opciones={ENTIDADES} />
      </div>
      {consulta.isPending ? <Cargando /> : consulta.isError ? <ErrorDe error={consulta.error} /> : consulta.data.eventos.length === 0 ? (
        <Vacio>Sin eventos.</Vacio>
      ) : (
        <table className="tabla tabla-compacta">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead>
          <tbody>
            {consulta.data.eventos.map((e) => (
              <tr key={e.id}>
                <td className="fecha">{fecha(e.creadoEn)}</td>
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
  useTitulo('No encontrada');
  return <Vacio>Esta página no existe. <Link href="/">Volver a los proyectos</Link>.</Vacio>;
}
