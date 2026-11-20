import { clsx } from 'clsx';
import { BarChart3, ShieldCheck, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { ROLE_LABEL } from '@/config/nav';
import type { Role } from '@/data/types';
import { useApp } from '@/store/useApp';

const PERFILES: { role: Role; nombre: string; desc: string; icon: typeof ShoppingCart; home: string }[] = [
  { role: 'cajero', nombre: 'Ana Pérez', desc: 'Vende y cobra.', icon: ShoppingCart, home: '/mostrador' },
  { role: 'regente', nombre: 'Farm. Carlos Méndez', desc: 'Aprueba récipes y medicamentos delicados.', icon: ShieldCheck, home: '/validaciones' },
  { role: 'admin', nombre: 'José Ávila', desc: 'Ve todo el negocio.', icon: BarChart3, home: '/panel' },
];

export default function LoginPage() {
  const login = useApp((s) => s.login);
  const navigate = useNavigate();
  const [sel, setSel] = useState<Role>('cajero');
  const perfil = PERFILES.find((p) => p.role === sel)!;

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent">
            <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden><path fill="white" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold">Farmacia Ávila</h1>
            <p className="text-sm text-muted">Bienvenido</p>
          </div>
        </div>

        <form
          className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
          onSubmit={(e) => { e.preventDefault(); login(perfil.nombre, sel); navigate(perfil.home); }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-base font-semibold">¿Quién eres?</legend>
            {PERFILES.map((p) => (
              <label key={p.role} className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition', sel === p.role ? 'border-accent bg-accent-soft/50' : 'border-line hover:bg-surface2')}>
                <input type="radio" name="role" value={p.role} checked={sel === p.role} onChange={() => setSel(p.role)} className="sr-only" />
                <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-lg', sel === p.role ? 'bg-accent text-accent-ink' : 'bg-surface2 text-muted')}>
                  <p.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{ROLE_LABEL[p.role]}</span>
                  <span className="block text-sm text-muted">{p.desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Tu clave
            <input id="pin" type="password" inputMode="numeric" maxLength={6} placeholder="••••" className="h-11 rounded-lg border border-line bg-bg px-3 font-mono text-lg tracking-[.3em] outline-none focus:border-accent" />
          </label>
          <Button type="submit" variant="primary" size="lg">Entrar</Button>
          <p className="text-center text-xs text-muted">Demostración: cualquier clave funciona.</p>
        </form>
      </div>
    </div>
  );
}
