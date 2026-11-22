import { clsx } from 'clsx';
import { AlertTriangle, Info, Lock, Search, X } from 'lucide-react';
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSesion } from '@/store/sesion';
import { useAvisos } from '@/store/avisos';
import { bs, usd } from '@/lib/format';

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'accent';
const toneCls: Record<Tone, string> = {
  neutral: 'bg-surface2 text-muted',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent',
};

export function Chip({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', toneCls[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-lg font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-2.5 text-[13px]',
        size === 'md' && 'h-10 px-3.5 text-sm',
        size === 'lg' && 'h-12 px-5 text-base',
        variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-surface text-fg hover:bg-surface2',
        variant === 'ghost' && 'text-muted hover:bg-surface2 hover:text-fg',
        variant === 'danger' && 'bg-bad text-white hover:brightness-110',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'aside' }) {
  return <As className={clsx('flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)}>{children}</As>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-current/30 px-1.5 font-mono text-[11px] opacity-70">{children}</kbd>;
}

export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { shortcut?: string; onClear?: () => void }>(
  function SearchInput({ shortcut, onClear, className, ...rest }, ref) {
    return (
      <label className={clsx('flex items-center gap-2 rounded-xl border-[1.5px] border-accent bg-surface px-3 py-2.5 focus-within:ring-2 focus-within:ring-accent/30', className)}>
        <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        <input ref={ref} className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none focus-visible:outline-none placeholder:text-muted/70" {...rest} />
        {onClear && rest.value ? (
          <button type="button" onClick={onClear} className="rounded p-1 text-muted hover:text-fg" aria-label="Limpiar">
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {shortcut && <span className="hidden text-muted xl:inline"><Kbd>{shortcut}</Kbd></span>}
      </label>
    );
  },
);

export function Money({ value, className, size = 'md' }: { value: number | string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const tasa = useSesion((s) => s.tasa);
  return (
    <div className={clsx('text-right font-mono tabular', className)}>
      <div className={clsx('font-medium', size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-[15px]' : 'text-sm')}>{usd(value)}</div>
      <div className="text-[11.5px] text-muted">{bs(value, tasa)}</div>
    </div>
  );
}

export function Alert({ tone = 'bad', children, icon }: { tone?: 'bad' | 'warn' | 'info' | 'ok'; children: ReactNode; icon?: ReactNode }) {
  const Ico = tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={clsx('flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] font-medium', toneCls[tone])}>
      {icon ?? <Ico className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Locked({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <Lock className="h-3.5 w-3.5" aria-hidden />
      {children}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 90 ? 'bg-ok' : value >= 75 ? 'bg-warn' : 'bg-bad';
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface2" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Confianza de lectura">
      <div className={clsx('h-full rounded-full', color)} style={{ width: `${value}%` }} />
    </div>
  );
}

export function Avatar({ text, size = 'md' }: { text: string; size?: 'md' | 'lg' }) {
  return (
    <span className={clsx('grid shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent', size === 'md' ? 'h-9 w-9 text-[13px]' : 'h-12 w-12 text-base')}>
      {text}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <div className="py-10 text-center text-sm text-muted" role="status">{texto}</div>;
}

export function ErrorCarga({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return (
    <Alert tone="bad">
      <div className="flex flex-wrap items-center gap-3">
        <span>{mensaje}</span>
        {reintentar && <Button size="sm" onClick={reintentar}>Reintentar</Button>}
      </div>
    </Alert>
  );
}

/** Campo de formulario con etiqueta visible. */
export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {etiqueta}
      {children}
      {ayuda && <span className="text-xs font-normal text-muted">{ayuda}</span>}
    </label>
  );
}

export const claseInput = 'h-11 rounded-lg border border-line bg-surface px-3 text-base font-normal outline-none focus:border-accent';

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center text-muted">
      <div className="text-muted/80">{icon}</div>
      <div className="font-semibold text-fg">{title}</div>
      {children && <div className="max-w-sm text-sm">{children}</div>}
    </div>
  );
}

export function Toaster() {
  const toasts = useAvisos((s) => s.lista);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-40 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={clsx('rounded-xl px-4 py-2.5 text-sm font-semibold shadow-pop', t.tono === 'bad' ? 'bg-bad text-white' : 'bg-fg text-bg')}>
          {t.texto}
        </div>
      ))}
    </div>
  );
}

/** Hojas abiertas, de abajo hacia arriba: «Escape» cierra solo la de encima. */
const pila: symbol[] = [];

/**
 * Hoja inferior en teléfono, panel centrado en pantallas grandes.
 * Se dibuja directamente en <body> (portal): así ninguna barra o tarjeta que la contenga la recorta ni la desplaza.
 */
export function Sheet({ open, onClose, title, children, grande }: { open: boolean; onClose: () => void; title: string; children: ReactNode; grande?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const yo = Symbol(title);
    pila.push(yo);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && pila[pila.length - 1] === yo) { e.stopImmediatePropagation(); onClose(); } };
    // En captura: la hoja corta los eventos de teclado que salen de ella, y Escape tiene que llegar igual.
    window.addEventListener('keydown', onKey, true);
    // La página de atrás no se mueve mientras la hoja está abierta.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      pila.splice(pila.indexOf(yo), 1);
      if (!pila.length) document.body.style.overflow = antes;
    };
  }, [open, onClose, title]);
  if (!open) return null;
  return createPortal(
    // Los eventos de la hoja no siguen hacia los componentes que la abrieron (formularios, filas que se pueden tocar…).
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-center md:p-4" role="dialog" aria-modal aria-label={title}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      onSubmit={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className={`pb-safe flex max-h-[88vh] max-h-[88dvh] w-full flex-col rounded-t-2xl bg-bg md:max-h-[90vh] md:rounded-2xl ${grande ? 'md:max-w-2xl' : 'md:max-w-md'}`}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="min-w-0 text-lg font-bold leading-tight">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar"><X className="h-5 w-5" /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
