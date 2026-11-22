import { clsx } from 'clsx';
import { ArrowLeft, ChevronDown, HelpCircle, LogOut, Moon, MonitorSmartphone, MoreHorizontal, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { GRUPOS, INICIO, NAV, ROLE_LABEL, type Grupo, type NavItem } from '@/config/nav';
import { api } from '@/lib/api';
import { num2 } from '@/lib/format';
import { useCargar } from '@/lib/useCargar';
import { useRol, useSesion } from '@/store/sesion';
import { Sheet, Toaster } from '@/components/ui';
import { useCaja } from '@/store/caja';
import { useConexion } from '@/lib/api';
import { useConfig } from '@/store/config';
import { descartarRechazada, enviarPendientes, guardarCatalogo, useSinConexion } from '@/lib/sinConexion';
import { avisar } from '@/store/avisos';
import Guia, { useGuia } from '@/features/guia/Guia';
import { AvisoGuiaModulo, BotonGuiaModulo } from '@/features/guia/GuiaModulo';
import { useCajaEquipo } from '@/store/cajaEquipo';
import { rutaIncluida, usePlan } from '@/store/plan';
const usdF = (v: number) => `$${v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Números rojos del menú: lo que espera al farmacéutico o al dueño. Se actualiza cada 20 segundos. */
function useBadges(rol: string, conEncargos: boolean): Record<string, number> {
  const { datos } = useCargar(async (): Promise<Record<string, number>> => {
    if (rol === 'CAJERO') return {};
    if (rol === 'SUPERADMIN' || rol === 'SOPORTE') return { '/casos': (await api<unknown[]>('/central/tickets?estado=ABIERTO')).length };
    const [permisos, recipes, avisados] = await Promise.all([
      api<unknown[]>('/autorizaciones'),
      api<unknown[]>('/recipes/pendientes'),
      conEncargos ? api<unknown[]>('/espera?estado=NOTIFICADO') : Promise.resolve([]),
    ]);
    return { '/revisar': permisos.length + recipes.length, '/encargos': avisados.length };
  }, [rol, conEncargos], 20_000);
  return datos ?? {};
}

function Brand({ full }: { full?: boolean }) {
  const nombre = useCaja((s) => s.farmacia.nombre);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path fill="white" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>
      </span>
      {full && <span className="line-clamp-2 min-w-0 font-display text-[15px] font-bold leading-tight" title={nombre}>{nombre}</span>}
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
  const rol = useRol();
  const central = rol === 'SUPERADMIN' || rol === 'SOPORTE';
  useEffect(() => { if (!central) void cargarConfig(); }, [cargarConfig, central]);
  const abrirGuia = useGuia((s) => s.abrir);
  const { caja: cajaEquipo, cargada: cajaCargada, cargar: cargarCaja } = useCajaEquipo();
  useEffect(() => { if (!central && !cajaCargada) void cargarCaja(); }, [central, cajaCargada, cargarCaja]);
  const usuario = useSesion((s) => s.usuario)!;
  const tasa = useSesion((s) => s.tasa);
  const tasaModo = useConfig((s) => s.config?.tasaModo);
  const salir = useSesion((s) => s.salir);
  const plan = usePlan((s) => s.plan);
  const cargarPlan = usePlan((s) => s.cargar);
  useEffect(() => { if (!central) void cargarPlan(); }, [central, cargarPlan]);
  const badges = useBadges(rol, rutaIncluida(plan, '/encargos'));
  // El menú muestra solo lo que trae el plan de la farmacia.
  const nav = NAV.filter((n) => n.roles.includes(rol) && rutaIncluida(plan, n.to));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = NAV.filter((n) => n.roles.includes(rol)).find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  const [moreOpen, setMoreOpen] = useState(false);
  const cerrar = async () => { await salir(); navigate('/'); };
  // «Volver»: a la pantalla anterior de la app; si se entró directo (o es la primera), a la de inicio.
  const inicio = INICIO[rol];
  const enInicio = pathname === inicio;
  const volver = () => { if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1); else navigate(inicio); };
  const nombreFarmacia = useCaja((s) => s.farmacia.nombre);
  // Título de la pestaña del navegador: la página y la farmacia.
  useEffect(() => { document.title = `${current?.label ?? (pathname.startsWith('/privacidad') ? 'Privacidad y cookies' : 'Inicio')} · ${nombreFarmacia}`; }, [current, pathname, nombreFarmacia]);

  // Grupos del menú: todos abiertos, para que se vea todo lo que hay. Quien quiera, pliega uno con un toque y se recuerda.
  const grupos = GRUPOS.map((grupo) => ({ grupo, items: nav.filter((n) => n.grupo === grupo) })).filter((g) => g.items.length);
  const [cerrados, setCerrados] = useState<Grupo[]>(() => {
    try { return JSON.parse(localStorage.getItem('menuCerrado') ?? '[]') as Grupo[]; } catch { return []; }
  });
  const alternar = (g: Grupo) => setCerrados((a) => {
    const n = a.includes(g) ? a.filter((x) => x !== g) : [...a, g];
    try { localStorage.setItem('menuCerrado', JSON.stringify(n)); } catch { /* sin almacenamiento */ }
    return n;
  });

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
        <NavLink to={inicio} className="mb-4 flex justify-center rounded-lg xl:justify-start xl:px-2" title="Ir al inicio">
          <span className="xl:hidden"><Brand /></span>
          <span className="hidden xl:block"><Brand full /></span>
        </NavLink>
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1">
          {grupos.length <= 1 ? nav.map(railItem) : grupos.map(({ grupo, items }) => {
            const abierto = !cerrados.includes(grupo) || items.includes(current!);
            const pendientes = items.reduce((a, n) => a + (badges[n.to] ?? 0), 0);
            return (
              <div key={grupo} className="flex flex-col gap-1">
                <button type="button" onClick={() => alternar(grupo)} aria-expanded={abierto} className="relative mt-1 flex items-center justify-center gap-1 rounded-md px-1 py-1 text-[10px] font-bold uppercase tracking-wide text-muted hover:text-fg xl:justify-between xl:px-3 xl:text-[11px]">
                  <span className="truncate">{grupo}</span>
                  <ChevronDown className={clsx('hidden h-3.5 w-3.5 transition-transform xl:block', !abierto && '-rotate-90')} aria-hidden />
                  {!abierto && <Badge n={pendientes} />}
                </button>
                {abierto && items.map(railItem)}
              </div>
            );
          })}
        </div>
        <div className="mt-auto flex flex-col items-center gap-2 border-t border-line pt-3 xl:items-stretch xl:px-2">
          <div className="hidden text-xs text-muted xl:block">
            <div className="font-semibold text-fg">{usuario.nombre}</div>
            <div>{usuario.soporte ? 'Soporte remoto' : ROLE_LABEL[rol]}</div>
            {cajaEquipo && <div className="mt-1 flex items-center gap-1 text-accent"><MonitorSmartphone className="h-3.5 w-3.5" aria-hidden />{cajaEquipo.nombre}</div>}
          </div>
          <div className="flex items-center gap-1">
            {!central && <button onClick={abrirGuia} className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-fg" aria-label="Ver la guía rápida" title="Guía rápida"><HelpCircle className="h-5 w-5" /></button>}
            <ThemeToggle />
            <button onClick={cerrar} className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-fg" aria-label="Cerrar sesión">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {central ? null : <SinConexion />}
        {usuario.demo && (
          <div className="flex items-center justify-center gap-3 bg-warn-soft px-3 py-1 text-center text-xs font-semibold text-warn md:py-1.5 md:text-[13px]">
            <span className="md:hidden">Demo con datos de ejemplo</span>
            <span className="hidden md:inline">Estás en la demo: los datos son de ejemplo y nadie más los ve.</span>
            <button className="shrink-0 underline" onClick={cerrar}>Salir de la demo</button>
          </div>
        )}
        <AvisoSoporte />
        <Guia />
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:px-6" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
          <div className="flex min-w-0 items-center gap-2.5">
            {enInicio ? <span className="md:hidden"><Brand /></span> : (
              <button type="button" onClick={volver} aria-label="Volver" title="Volver"
                className="-ml-1 flex h-10 shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2 text-sm font-semibold text-muted hover:bg-surface2 hover:text-fg md:px-2.5">
                <ArrowLeft className="h-5 w-5" aria-hidden /><span className="hidden md:inline">Volver</span>
              </button>
            )}
            <span className="truncate font-display text-lg font-bold">{current?.label ?? 'Farmacia'}</span>
            <BotonGuiaModulo ruta={current?.to} titulo={current?.label ?? ''} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
            {central ? <span className="whitespace-nowrap rounded-md bg-accent-soft px-2 py-1 text-xs font-semibold text-accent">Panel central</span> : <span className={clsx('whitespace-nowrap rounded-md px-2 py-1 font-mono text-xs', tasa ? 'bg-surface2 text-muted' : 'bg-warn-soft text-warn')} title={tasaModo === 'BCV_EUR' ? 'Los precios en $ se convierten con la tasa del euro del BCV' : 'Tasa con la que se cobra'}>
              {tasa ? <><span className="hidden sm:inline">{tasaModo === 'BCV_EUR' ? 'Euro BCV' : tasaModo === 'BCV_USD' ? 'Dólar BCV' : 'Tasa'}: </span>{num2(tasa)} Bs</> : 'Falta la tasa'}
            </span>}
            {!central && <button onClick={abrirGuia} className="rounded-lg p-2 text-muted hover:bg-surface2 md:hidden" aria-label="Ver la guía rápida"><HelpCircle className="h-5 w-5" /></button>}
          </div>
        </header>

        {!usuario.soporte && <AvisoGuiaModulo ruta={current?.to} titulo={current?.label ?? ''} />}
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
          {GRUPOS.map((g) => {
            const items = extra.filter((n) => n.grupo === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted">{g}</div>
                <div className="grid grid-cols-2 gap-1">
                  {items.map((n) => (
                    <NavLink key={n.to} to={n.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => clsx('flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold', isActive ? 'bg-accent-soft text-accent' : 'hover:bg-surface2')}>
                      <n.icon className="h-5 w-5 shrink-0" /> <span className="truncate">{n.label}</span> <Badge n={badges[n.to]} inline />
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="mt-2 flex items-center justify-between border-t border-line px-3 pt-3 text-sm text-muted">
            <span>{usuario.nombre} · {ROLE_LABEL[rol]}</span>
            <ThemeToggle />
            <button onClick={cerrar} className="flex items-center gap-1.5 font-semibold text-fg"><LogOut className="h-4 w-4" />Salir</button>
          </div>
        </div>
      </Sheet>
      <Toaster />
    </div>
  );
}

/** Barra roja cuando se cae el internet o el servidor no responde. Se quita sola al volver. */
/**
 * Soporte remoto: quien entró como soporte ve que está dentro de una farmacia ajena;
 * el dueño ve hasta cuándo tiene acceso soporte y lo puede quitar con un toque.
 */
function AvisoSoporte() {
  const usuario = useSesion((s) => s.usuario)!;
  const dueno = usuario.rol === 'ADMIN' && !usuario.soporte;
  const { datos, recargar } = useCargar(async () => (dueno ? api<{ acceso: { vence: string } | null }>('/soporte') : null), [dueno], 60_000);
  if (usuario.soporte) {
    return <div role="status" className="bg-info px-4 py-1.5 text-center text-[13px] font-semibold text-white">Estás dentro de esta farmacia como soporte técnico. Todo lo que hagas queda en la auditoría.</div>;
  }
  if (!datos?.acceso) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-info-soft px-4 py-1.5 text-[13px] text-info">
      <span><b>Soporte técnico puede entrar</b> hasta las {new Date(datos.acceso.vence).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}</span>
      <button className="font-semibold underline" onClick={async () => { await api('/soporte/acceso/quitar', { method: 'POST' }); avisar('Acceso de soporte quitado', 'ok'); void recargar(); }}>Quitar acceso</button>
    </div>
  );
}

function SinConexion() {
  const enLinea = useConexion((s) => s.enLinea);
  const { pendientes, rechazadas } = useSinConexion();
  // Al volver la conexión (y cada minuto): enviar ventas pendientes. Cada 10 min: copia del catálogo para vender sin internet.
  useEffect(() => {
    if (!enLinea) return;
    void enviarPendientes().then((n) => { if (n) avisar(`${n} ${n === 1 ? 'venta hecha' : 'ventas hechas'} sin conexión ya se ${n === 1 ? 'envió' : 'enviaron'}`, 'ok'); });
    const t = setInterval(() => void enviarPendientes(), 60_000);
    return () => clearInterval(t);
  }, [enLinea]);
  useEffect(() => {
    const copia = () => { void guardarCatalogo().catch(() => {}); };
    copia();
    const t = setInterval(copia, 10 * 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (enLinea) return;
    const t = setInterval(() => { void fetch('/api/v1/salud').then((r) => { if (r.ok) useConexion.setState({ enLinea: true }); }).catch(() => {}); }, 5000);
    return () => clearInterval(t);
  }, [enLinea]);
  return (
    <>
      {!enLinea && <div role="alert" className="bg-bad px-4 py-1.5 text-center text-[13px] font-semibold text-white">Sin conexión. Puedes seguir vendiendo productos sin récipe: se guardan en este equipo y se envían solos al volver el internet.</div>}
      {pendientes.length > 0 && <div className="bg-warn-soft px-4 py-1.5 text-center text-[13px] font-semibold text-warn">{pendientes.length} {pendientes.length === 1 ? 'venta' : 'ventas'} por enviar ({usdF(pendientes.reduce((a, p) => a + p.totalUsd, 0))})</div>}
      {rechazadas.map((r) => (
        <div key={r.clave} role="alert" className="flex flex-wrap items-center justify-center gap-2 bg-bad-soft px-4 py-1.5 text-[13px] text-bad">
          <span><b>Venta sin conexión no aceptada</b> ({r.resumen}, {usdF(r.totalUsd)}): {r.motivo}</span>
          <button className="font-semibold underline" onClick={() => descartarRechazada(r.clave)}>Ya lo resolví</button>
        </div>
      ))}
    </>
  );
}
