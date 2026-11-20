import { clsx } from 'clsx';
import { LogOut, Moon, MoreHorizontal, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NAV, ROLE_LABEL, type NavItem } from '@/config/nav';
import { api } from '@/lib/api';
import { num2 } from '@/lib/format';
import { useCargar } from '@/lib/useCargar';
import { useRol, useSesion } from '@/store/sesion';
import { Sheet, Toaster } from '@/components/ui';
import { useCaja } from '@/store/caja';
import { useConexion } from '@/lib/api';
import { useConfig } from '@/store/config';

/** Números rojos del menú: lo que espera al farmacéutico o al dueño. Se actualiza cada 20 segundos. */
function useBadges(rol: string): Record<string, number> {
  const { datos } = useCargar(async (): Promise<Record<string, number>> => {
    if (rol === 'CAJERO') return {};
    const [permisos, recipes, avisados] = await Promise.all([
      api<unknown[]>('/autorizaciones'),
      api<unknown[]>('/recipes/pendientes'),
      api<unknown[]>('/espera?estado=NOTIFICADO'),
    ]);
    return { '/revisar': permisos.length + recipes.length, '/encargos': avisados.length };
  }, [rol], 20_000);
  return datos ?? {};
}

function Brand({ full }: { full?: boolean }) {
  const nombre = useCaja((s) => s.farmacia.nombre);
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path fill="white" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>
      </span>
      {full && <span className="truncate font-display text-base font-bold">{nombre}</span>}
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => {
    try { return localStorage.getItem('theme'); } catch { return null; }
  });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try { if (theme) localStorage.setItem('theme', theme); else localStorage.removeItem('theme'); } catch { /* sin almacenamiento */ }
  }, [theme]);
  const isDark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  return (
    <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-fg" aria-label="Cambiar tema">
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

function Badge({ n, inline }: { n?: number; inline?: boolean }) {
  if (!n) return null;
  return <span className={clsx('rounded-full bg-bad px-1.5 font-mono text-[10px] leading-4 text-white', inline ? 'ml-auto' : 'absolute right-1.5 top-0.5')}>{n}</span>;
}

export default function AppShell() {
  const cargarConfig = useConfig((s) => s.cargar);
  useEffect(() => { void cargarConfig(); }, [cargarConfig]);
  const rol = useRol();
  const usuario = useSesion((s) => s.usuario)!;
  const tasa = useSesion((s) => s.tasa);
  const salir = useSesion((s) => s.salir);
  const badges = useBadges(rol);
  const nav = NAV.filter((n) => n.roles.includes(rol));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = nav.find((n) => pathname.startsWith(n.to));
  const [moreOpen, setMoreOpen] = useState(false);
  const cerrar = async () => { await salir(); navigate('/'); };

  const bottom = nav.length <= 5 ? nav : nav.slice(0, 4);
  const extra = nav.length <= 5 ? [] : nav.slice(4);
  const inExtra = extra.some((n) => n === current);

  const railItem = (n: NavItem) => (
    <NavLink key={n.to} to={n.to} className={({ isActive }) => clsx(
      'group relative flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold xl:flex-row xl:gap-3 xl:px-3 xl:py-2 xl:text-sm',
      isActive ? 'text-accent' : 'text-muted hover:text-fg',
    )}>
      {({ isActive }) => (
        <>
          <span className={clsx('grid h-8 w-12 place-items-center rounded-xl xl:h-9 xl:w-9', isActive ? 'bg-accent-soft' : 'group-hover:bg-surface2')}>
            <n.icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="xl:hidden">{n.short}</span>
          <span className="hidden xl:inline">{n.label}</span>
          <span className="xl:hidden"><Badge n={badges[n.to]} /></span>
          <span className="hidden xl:contents"><Badge n={badges[n.to]} inline /></span>
        </>
      )}
    </NavLink>
  );

  return (
    <div className="flex h-full">
      <nav aria-label="Menú principal" className="hidden w-[88px] shrink-0 flex-col gap-1 border-r border-line bg-surface px-2 py-4 md:flex xl:w-60 xl:px-3">
        <div className="mb-4 flex justify-center xl:justify-start xl:px-2">
          <span className="xl:hidden"><Brand /></span>
          <span className="hidden xl:block"><Brand full /></span>
        </div>
        {nav.map(railItem)}
        <div className="mt-auto flex flex-col items-center gap-2 border-t border-line pt-3 xl:items-stretch xl:px-2">
          <div className="hidden text-xs text-muted xl:block">
            <div className="font-semibold text-fg">{usuario.nombre}</div>
            <div>{ROLE_LABEL[rol]}</div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button onClick={cerrar} className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-fg" aria-label="Cerrar sesión">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <SinConexion />
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:px-6" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="md:hidden"><Brand /></span>
            <span className="truncate font-display text-lg font-bold">{current?.label ?? 'Farmacia'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx('whitespace-nowrap rounded-md px-2 py-1 font-mono text-xs', tasa ? 'bg-surface2 text-muted' : 'bg-warn-soft text-warn')} title="Tasa del dólar">
              {tasa ? `Dólar: ${num2(tasa)} Bs` : 'Falta la tasa'}
            </span>
            <span className="md:hidden"><ThemeToggle /></span>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6 md:pb-8 xl:px-8">
          <Outlet />
        </main>

        <nav aria-label="Menú principal" className="pb-safe fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-line bg-surface pt-1.5 md:hidden">
          {bottom.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => clsx('relative flex min-w-[64px] flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-semibold', isActive ? 'text-accent' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  <span className={clsx('grid h-7 w-12 place-items-center rounded-xl', isActive && 'bg-accent-soft')}><n.icon className="h-5 w-5" /></span>
                  {n.short}
                  <Badge n={badges[n.to]} />
                </>
              )}
            </NavLink>
          ))}
          {extra.length > 0 && (
            <button onClick={() => setMoreOpen(true)} className={clsx('relative flex min-w-[64px] flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-semibold', inExtra ? 'text-accent' : 'text-muted')}>
              <span className={clsx('grid h-7 w-12 place-items-center rounded-xl', inExtra && 'bg-accent-soft')}><MoreHorizontal className="h-5 w-5" /></span>
              Más
              <Badge n={extra.reduce((a, n) => a + (badges[n.to] ?? 0), 0)} />
            </button>
          )}
        </nav>
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Más opciones">
        <div className="flex flex-col gap-1">
          {extra.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-3 font-semibold', isActive ? 'bg-accent-soft text-accent' : 'hover:bg-surface2')}>
              <n.icon className="h-5 w-5" /> {n.label} <Badge n={badges[n.to]} inline />
            </NavLink>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-line px-3 pt-3 text-sm text-muted">
            <span>{usuario.nombre} · {ROLE_LABEL[rol]}</span>
            <button onClick={cerrar} className="flex items-center gap-1.5 font-semibold text-fg"><LogOut className="h-4 w-4" />Salir</button>
          </div>
        </div>
      </Sheet>
      <Toaster />
    </div>
  );
}

/** Barra roja cuando se cae el internet o el servidor no responde. Se quita sola al volver. */
function SinConexion() {
  const enLinea = useConexion((s) => s.enLinea);
  useEffect(() => {
    if (enLinea) return;
    const t = setInterval(() => { void fetch('/api/v1/salud').then((r) => { if (r.ok) useConexion.setState({ enLinea: true }); }).catch(() => {}); }, 5000);
    return () => clearInterval(t);
  }, [enLinea]);
  if (enLinea) return null;
  return <div role="alert" className="bg-bad px-4 py-1.5 text-center text-[13px] font-semibold text-white">Sin conexión con el servidor. Lo que estabas haciendo no se pierde: reintenta cuando vuelva el internet.</div>;
}
