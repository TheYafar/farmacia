import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Campo, claseInput } from '@/components/ui';
import { INICIO } from '@/config/nav';
import { ApiError } from '@/lib/api';
import { useSesion } from '@/store/sesion';
import { useCaja } from '@/store/caja';

export default function LoginPage() {
  const entrar = useSesion((s) => s.entrar);
  const nombre = useCaja((s) => s.farmacia.nombre);
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [codigo, setCodigo] = useState('');
  const [pideCodigo, setPideCodigo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent">
            <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden><path fill="white" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold">{nombre}</h1>
            <p className="text-sm text-muted">Entra con tu usuario</p>
          </div>
        </div>
        <form
          className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setEnviando(true);
            setError(null);
            try {
              await entrar(usuario, clave, codigo);
              const rol = useSesion.getState().usuario!.rol;
              navigate(INICIO[rol], { replace: true });
            } catch (err) {
              if (err instanceof ApiError && err.codigo === 'REQUIERE_2FA') { setPideCodigo(true); setError(codigo ? err.message : null); return; }
              setError(err instanceof ApiError ? err.message : 'No se pudo entrar');
            } finally {
              setEnviando(false);
            }
          }}
        >
          <Campo etiqueta="Usuario">
            <input id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" required className={claseInput} />
          </Campo>
          <Campo etiqueta="Clave">
            <input id="clave" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required className={claseInput} />
          </Campo>
          {pideCodigo && (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Código de 6 números de tu app
              <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} className={claseInput + ' text-center font-mono text-xl tracking-[0.4em]'} required />
            </label>
          )}
          {error && <Alert tone="bad">{error}</Alert>}
          <Button type="submit" variant="primary" size="lg" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</Button>
        </form>
        <p className="text-center text-xs text-muted">¿Olvidaste la clave? Pídele al dueño que la cambie.</p>
      </div>
    </div>
  );
}
