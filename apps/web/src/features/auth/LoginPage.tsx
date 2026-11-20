import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, BarChart3, Eye, EyeOff, KeyRound, Lock, MessageCircle, MonitorSmartphone, PlayCircle, ShieldCheck, ShoppingCart, User } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { INICIO } from '@/config/nav';
import { ApiError } from '@/lib/api';
import { useSesion } from '@/store/sesion';
import { useCaja } from '@/store/caja';
import { useCajaEquipo } from '@/store/cajaEquipo';
import { VincularConCodigo } from '@/features/cajas/Cajas';

const Logo = ({ className = 'h-11 w-11' }: { className?: string }) => (
  <span className={`grid shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 ${className}`}>
    <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" aria-hidden><path fill="white" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>
  </span>
);

const VENTAJAS = [
  { icon: ShoppingCart, titulo: 'Vende en segundos', texto: 'Cobra en dólares y bolívares con la tasa del BCV del día.' },
  { icon: ShieldCheck, titulo: 'Récipes y controlados en regla', texto: 'El sistema te avisa antes de vender lo que no se puede.' },
  { icon: BarChart3, titulo: 'Tu negocio a la vista', texto: 'Cierre de caja, inventario y ganancias sin hojas de cálculo.' },
];

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(t); }, []);
  return (
    <div>
      <div className="font-display text-4xl font-bold tabular-nums">{ahora.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}</div>
      <div className="text-sm text-white/75">{((d) => d.charAt(0).toUpperCase() + d.slice(1))(ahora.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
    </div>
  );
}

/** Qué caja es este equipo; si no es ninguna, se puede vincular con el código de otra. */
function CajaEnEntrada() {
  const { caja, cargada, cargar } = useCajaEquipo();
  const [codigo, setCodigo] = useState(false);
  useEffect(() => { if (!cargada) void cargar(); }, [cargada, cargar]);
  if (!cargada) return null;
  if (caja) return <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent"><MonitorSmartphone className="h-4 w-4" aria-hidden />Este equipo es <b>{caja.nombre}</b></div>;
  return codigo ? (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line p-3">
      <span className="text-sm font-semibold">Código de la caja</span>
      <span className="text-xs text-muted">Sácalo en el otro equipo: Caja → Pasar a otro equipo (o el dueño en Cajas).</span>
      <VincularConCodigo listo={() => setCodigo(false)} />
      <button type="button" className="self-start text-xs text-muted underline" onClick={() => setCodigo(false)}>Cancelar</button>
    </div>
  ) : (
    <button type="button" onClick={() => setCodigo(true)} className="flex items-center gap-2 text-sm text-muted hover:text-fg">
      <ArrowRightLeft className="h-4 w-4" aria-hidden />Este equipo no es una caja. <span className="font-semibold text-accent underline">Tengo un código</span>
    </button>
  );
}

/** Probar el sistema con una farmacia de ejemplo, sin clave. */
function ProbarDemo() {
  const entrarDemo = useSesion((s) => s.entrarDemo);
  const navigate = useNavigate();
  const [entrando, setEntrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roles = [['ADMIN', 'Dueño', 'Ve todo: ventas, reportes, inventario'], ['REGENTE', 'Farmacéutico', 'Revisa récipes y da permisos'], ['CAJERO', 'Cajero', 'Vende y cobra']] as const;
  return (
    <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/50 p-4">
      <div className="flex items-center gap-2 font-bold"><PlayCircle className="h-5 w-5 text-accent" aria-hidden />¿Primera vez? Prueba la demo</div>
      <p className="mt-1 text-sm text-muted">Una farmacia de ejemplo con productos, clientes y dos meses de ventas. Toca y explora: nada de lo que hagas afecta a tu farmacia.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {roles.map(([rol, nombre, que]) => (
          <button key={rol} type="button" disabled={!!entrando} title={que} onClick={async () => {
            setEntrando(rol); setError(null);
            try { await entrarDemo(rol); navigate(INICIO[rol], { replace: true }); } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo abrir la demo'); setEntrando(null); }
          }} className="flex flex-col items-center gap-0.5 rounded-xl border border-line bg-surface px-2 py-2.5 text-sm font-semibold transition hover:border-accent hover:text-accent disabled:opacity-60">
            {entrando === rol ? 'Abriendo…' : nombre}
            <span className="hidden text-center text-[11px] font-normal leading-tight text-muted sm:block">{que}</span>
          </button>
        ))}
      </div>
      {error && <div className="mt-2"><Alert tone="bad">{error}</Alert></div>}
    </div>
  );
}

const leerUltimo = () => { try { return localStorage.getItem('ultimoUsuario') ?? ''; } catch { return ''; } };

export default function LoginPage() {
  const entrar = useSesion((s) => s.entrar);
  const errorEntrada = useSesion((s) => s.errorEntrada);
  const farmacia = useCaja((s) => s.farmacia);
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(leerUltimo);
  const [recordar, setRecordar] = useState(() => !!leerUltimo());
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [mayusculas, setMayusculas] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [pideCodigo, setPideCodigo] = useState(false);
  const [error, setError] = useState<string | null>(errorEntrada);
  const [enviando, setEnviando] = useState(false);
  const whatsapp = farmacia.soporte?.replace(/\D/g, '');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await entrar(usuario, clave, codigo);
      try { if (recordar) localStorage.setItem('ultimoUsuario', usuario.trim().toLowerCase()); else localStorage.removeItem('ultimoUsuario'); } catch { /* sin almacenamiento */ }
      const rol = useSesion.getState().usuario!.rol;
      navigate(INICIO[rol], { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.codigo === 'REQUIERE_2FA') { setPideCodigo(true); setError(codigo ? err.message : null); return; }
      setError(err instanceof ApiError ? err.message : 'No se pudo entrar');
    } finally {
      setEnviando(false);
    }
  };
  const teclas = (e: React.KeyboardEvent) => setMayusculas(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Panel de marca (computadora) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0d8a67] via-[#0b6e53] to-[#063f30] p-10 text-white lg:flex xl:p-14">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/5" />
        <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute bottom-16 right-12 h-56 w-56 opacity-[0.07]"><path fill="white" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>

        <div className="relative flex items-center gap-3">
          <Logo />
          <div>
            <div className="font-display text-xl font-bold leading-tight">{farmacia.nombre}</div>
            {farmacia.rif && <div className="text-sm text-white/70">RIF {farmacia.rif}</div>}
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-bold leading-tight xl:text-5xl">Tu farmacia,<br />siempre en orden.</h2>
          <ul className="mt-8 flex flex-col gap-5">
            {VENTAJAS.map((v) => (
              <li key={v.titulo} className="flex gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15"><v.icon className="h-5 w-5" aria-hidden /></span>
                <span><span className="block font-semibold">{v.titulo}</span><span className="text-sm text-white/75">{v.texto}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-end justify-between gap-4">
          <Reloj />
          {farmacia.direccion && <div className="max-w-[16rem] text-right text-xs text-white/60">{farmacia.direccion}</div>}
        </div>
      </aside>

      {/* Formulario */}
      <main className="flex min-h-full flex-col">
        <div className="flex items-center gap-3 bg-gradient-to-br from-[#0d8a67] to-[#063f30] px-5 pb-10 pt-8 text-white lg:hidden" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
          <Logo className="h-10 w-10" />
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-bold">{farmacia.nombre}</div>
            <div className="text-xs text-white/75">Tu farmacia, siempre en orden</div>
          </div>
        </div>

        <div className="-mt-6 flex flex-1 items-start justify-center px-4 pb-10 lg:mt-0 lg:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <h1 className="font-display text-2xl font-bold">Iniciar sesión</h1>
            <p className="mt-1 text-sm text-muted">Entra con el usuario y la clave que te dio el dueño.</p>

            <div className="mt-5"><CajaEnEntrada /></div>
            <form className="mt-4 flex flex-col gap-4" onSubmit={enviar}>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Usuario o correo
                <span className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
                  <input id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus={!usuario}
                    className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-base font-normal outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15" />
                </span>
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Clave
                <span className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />
                  <input id="clave" type={verClave ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} onKeyUp={teclas} onKeyDown={teclas} autoComplete="current-password" required autoFocus={!!usuario}
                    className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-11 text-base font-normal outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15" />
                  <button type="button" onClick={() => setVerClave((v) => !v)} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-fg" aria-label={verClave ? 'Ocultar clave' : 'Ver clave'}>
                    {verClave ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </span>
                {mayusculas && <span className="text-xs font-semibold text-warn">Tienes las mayúsculas activadas</span>}
              </label>

              {pideCodigo && (
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  <span className="flex items-center gap-1.5"><KeyRound className="h-4 w-4 text-accent" aria-hidden />Código de 6 números de tu app</span>
                  <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} required
                    className="h-12 rounded-xl border border-line bg-surface px-3 text-center font-mono text-xl tracking-[0.4em] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" />
                </label>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                Recordar mi usuario en este equipo
              </label>

              {error && <Alert tone="bad">{error}</Alert>}
              <Button type="submit" variant="primary" size="lg" disabled={enviando} className="w-full rounded-xl">{enviando ? 'Entrando…' : 'Entrar'}</Button>
            </form>

            <div className="mt-6 flex flex-col gap-2 border-t border-line pt-4 text-sm text-muted">
              <p>¿Olvidaste la clave? Pídele al dueño que te la cambie desde Usuarios.</p>
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, necesito ayuda para entrar al sistema de ${farmacia.nombre}`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline">
                  <MessageCircle className="h-4 w-4" aria-hidden />¿Problemas para entrar? Escribe a soporte
                </a>
              )}
            </div>
            {farmacia.hayDemo && <ProbarDemo />}
            <p className="mt-6 flex items-center gap-1.5 text-xs text-muted"><Lock className="h-3.5 w-3.5" aria-hidden />Conexión segura. Tu sesión se cierra sola en los equipos que no uses.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
