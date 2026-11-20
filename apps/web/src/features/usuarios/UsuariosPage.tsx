import { DosPasos } from '@/features/gestion/Gestion';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { ROLES, type Rol } from '@farmacia/shared';
import { Alert, Button, Campo, Card, Cargando, Chip, ErrorCarga, PageHeader, Sheet, claseInput } from '@/components/ui';
import { ROLE_LABEL } from '@/config/nav';
import { api, ApiError } from '@/lib/api';
import type { Usuario } from '@/lib/tipos';
import { useCargar } from '@/lib/useCargar';
import { avisar } from '@/store/avisos';
import { useSesion } from '@/store/sesion';

function NuevoUsuario({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({ nombre: '', usuario: '', clave: '', rol: 'CAJERO' as Rol });
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open={abierto} onClose={onCerrar} title="Nuevo usuario">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try { await api('/usuarios', { body: f }); avisar('Usuario creado', 'ok'); setF({ nombre: '', usuario: '', clave: '', rol: 'CAJERO' }); onListo(); }
        catch (err) { setError(err instanceof ApiError ? [err.message, ...err.errores.map((x) => x.mensaje)].join('. ') : 'No se pudo crear'); }
      }}>
        <Campo etiqueta="Nombre"><input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={claseInput} /></Campo>
        <Campo etiqueta="Usuario para entrar" ayuda="Letras y números, sin espacios"><input required value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value.toLowerCase() })} autoCapitalize="none" className={claseInput} /></Campo>
        <Campo etiqueta="Clave" ayuda="Al menos 10 caracteres"><input required type="password" minLength={10} value={f.clave} onChange={(e) => setF({ ...f, clave: e.target.value })} autoComplete="new-password" className={claseInput} /></Campo>
        <Campo etiqueta="Rol">
          <select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value as Rol })} className={claseInput}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Campo>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Crear usuario</Button>
      </form>
    </Sheet>
  );
}

function CambiarClave({ u, onCerrar }: { u: Usuario | null; onCerrar: () => void }) {
  const [clave, setClave] = useState('');
  return (
    <Sheet open={!!u} onClose={onCerrar} title={`Nueva clave para ${u?.nombre ?? ''}`}>
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault();
        try { await api(`/usuarios/${u!.id}/clave`, { method: 'PATCH', body: { clave } }); avisar('Clave cambiada. Sus sesiones abiertas se cerraron', 'ok'); setClave(''); onCerrar(); }
        catch (err) { avisar(err instanceof ApiError ? err.message : 'No se pudo cambiar', 'bad'); }
      }}>
        <Campo etiqueta="Clave nueva" ayuda="Al menos 10 caracteres"><input required type="password" minLength={10} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" className={claseInput} /></Campo>
        <Button type="submit" variant="primary" size="lg">Guardar clave</Button>
      </form>
    </Sheet>
  );
}

export default function UsuariosPage() {
  const yo = useSesion((s) => s.usuario)!;
  const { datos, error, cargando, recargar } = useCargar(() => api<Usuario[]>('/usuarios'), []);
  const [nuevo, setNuevo] = useState(false);
  const [clave, setClave] = useState<Usuario | null>(null);
  const alternar = async (u: Usuario) => {
    try { await api(`/usuarios/${u.id}/${u.activo ? 'desactivar' : 'activar'}`, { method: 'POST' }); avisar(u.activo ? `${u.nombre} ya no puede entrar` : `${u.nombre} puede entrar de nuevo`, 'ok'); recargar(); }
    catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo cambiar', 'bad'); }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Usuarios" subtitle="Quién puede entrar y qué puede hacer" actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setNuevo(true)}>Nuevo usuario</Button>} />
      <DosPasos />
      {error && <ErrorCarga mensaje={error} reintentar={recargar} />}
      {cargando ? <Cargando /> : (
        <Card>
          <ul className="flex flex-col divide-y divide-line">
            {datos?.map((u) => {
              const bloqueado = u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date();
              return (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{u.nombre} {u.id === yo.id && <span className="text-xs text-muted">(tú)</span>}</div>
                    <div className="text-xs text-muted">@{u.usuario}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={u.rol === 'ADMIN' ? 'accent' : u.rol === 'REGENTE' ? 'info' : 'neutral'}>{ROLE_LABEL[u.rol]}</Chip>
                    {!u.activo && <Chip tone="bad">Desactivado</Chip>}
                    {bloqueado && <Chip tone="warn">Bloqueado por intentos</Chip>}
                    <Button size="sm" onClick={() => setClave(u)}>Cambiar clave</Button>
                    {u.id !== yo.id && <Button size="sm" variant={u.activo ? 'ghost' : 'secondary'} onClick={() => alternar(u)}>{u.activo ? 'Desactivar' : 'Activar'}</Button>}
                    {u.activo && bloqueado && u.id !== yo.id && <Button size="sm" onClick={() => api(`/usuarios/${u.id}/activar`, { method: 'POST' }).then(recargar)}>Desbloquear</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <NuevoUsuario abierto={nuevo} onCerrar={() => setNuevo(false)} onListo={() => { setNuevo(false); recargar(); }} />
      <CambiarClave u={clave} onCerrar={() => setClave(null)} />
    </div>
  );
}
