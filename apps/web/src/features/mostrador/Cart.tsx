import { clsx } from 'clsx';
import { AlertTriangle, Banknote, CreditCard, FileText, Minus, Plus, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Button, Chip, EmptyState, Kbd, Sheet } from '@/components/ui';
import { choqueAlergia } from '@/data/catalog';
import { bs, usd } from '@/lib/format';
import { useApp, useRole } from '@/store/useApp';
import PacienteBar from './PacienteBar';
import { ShoppingCart } from 'lucide-react';

export function useCartSummary() {
  const cart = useApp((s) => s.cart);
  const paciente = useApp((s) => s.paciente);
  const total = cart.reduce((a, l) => a + l.producto.precioUsd * l.cantidad, 0);
  const unidades = cart.reduce((a, l) => a + l.cantidad, 0);
  const bloqueos = cart.filter((l) => !l.autorizado && (choqueAlergia(l.producto, paciente) || l.producto.psicotropico));
  return { cart, total, unidades, bloqueos };
}

export function CartBody({ onCobrar }: { onCobrar: () => void }) {
  const { cart, total, bloqueos } = useCartSummary();
  const paciente = useApp((s) => s.paciente);
  const tasa = useApp((s) => s.tasa);
  const setQty = useApp((s) => s.setQty);
  const clearCart = useApp((s) => s.clearCart);
  const autorizar = useApp((s) => s.autorizarLinea);
  const role = useRole();
  const puedeAutorizar = role !== 'cajero';

  return (
    <div className="flex flex-col gap-3">
      <PacienteBar />
      {cart.length === 0 ? (
        <EmptyState icon={<ShoppingCart className="h-8 w-8" />} title="Todavía no hay nada">Busca el medicamento y toca «Agregar».</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-dashed divide-line">
          {cart.map((l) => {
            const alergia = choqueAlergia(l.producto, paciente);
            const necesita = !l.autorizado && (alergia || l.producto.psicotropico);
            return (
              <li key={l.producto.id} className="flex flex-col gap-2 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold">{l.producto.nombreComercial} {l.producto.concentracion}</div>
                    <div className="text-xs text-muted">Caja de {l.producto.unidadesPorCaja}</div>
                  </div>
                  <span className="font-mono text-sm tabular">{usd(l.producto.precioUsd * l.cantidad)}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center rounded-lg border border-line">
                    <button className="grid h-8 w-8 place-items-center text-muted hover:text-fg" onClick={() => setQty(l.producto.id, l.cantidad - 1)} aria-label="Quitar una caja">
                      {l.cantidad === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                    </button>
                    <span className="w-8 text-center font-mono text-sm">{l.cantidad}</span>
                    <button className="grid h-8 w-8 place-items-center text-muted hover:text-fg disabled:opacity-40" disabled={l.cantidad >= l.producto.stockLibre} onClick={() => setQty(l.producto.id, l.cantidad + 1)} aria-label="Agregar una caja">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {l.producto.requiereRecipe && <Chip tone="info" icon={<FileText className="h-3 w-3" />}>Con récipe</Chip>}
                    {l.autorizado && <Chip tone="ok" icon={<ShieldCheck className="h-3 w-3" />}>Aprobado</Chip>}
                  </div>
                </div>
                {necesita && (
                  <Alert tone="bad">
                    <div className="flex flex-col gap-1.5">
                      <span>{alergia ? `${paciente?.nombre.split(' ')[0]} es alérgica a la ${alergia === 'penicilinas' ? 'penicilina' : alergia} y este medicamento la tiene.` : 'Este medicamento necesita permiso del farmacéutico.'} {puedeAutorizar ? '' : 'Llama al farmacéutico.'}</span>
                      {puedeAutorizar && <Button size="sm" variant="danger" className="self-start" onClick={() => autorizar(l.producto.id)}>Lo apruebo</Button>}
                    </div>
                  </Alert>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {cart.length > 0 && (
        <>
          <div className="flex flex-col gap-0.5 border-t border-line pt-3 font-mono tabular">
            <div className="flex items-baseline justify-between"><span className="font-sans text-base font-semibold">Total</span><span className="text-3xl font-medium">{usd(total)}</span></div>
            <div className="flex items-baseline justify-between text-sm"><span className="font-sans text-muted">En bolívares</span><span>{bs(total, tasa)}</span></div>
          </div>
          <Button variant="primary" size="lg" disabled={bloqueos.length > 0} onClick={onCobrar}>
            {bloqueos.length ? 'Falta el permiso del farmacéutico' : 'Cobrar'}
            <span className="hidden xl:inline"><Kbd>F9</Kbd></span>
          </Button>
          <Button variant="ghost" size="sm" onClick={clearCart}>Borrar todo</Button>
        </>
      )}
    </div>
  );
}

const METODOS = [
  { id: 'pm', label: 'Pago Móvil', icon: Smartphone },
  { id: 'punto', label: 'Punto de venta', icon: CreditCard },
  { id: 'usd', label: 'Efectivo $', icon: Banknote },
  { id: 'bs', label: 'Efectivo Bs', icon: Banknote },
] as const;

export function CobroSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { total } = useCartSummary();
  const tasa = useApp((s) => s.tasa);
  const clearCart = useApp((s) => s.clearCart);
  const toast = useApp((s) => s.toast);
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]['id']>('pm');
  const [ref, setRef] = useState('');

  return (
    <Sheet open={open} onClose={onClose} title="¿Cómo paga?">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-surface2 p-4 text-center font-mono tabular">
          <div className="text-3xl font-medium">{usd(total)}</div>
          <div className="text-muted">{bs(total, tasa)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {METODOS.map((m) => (
            <button key={m.id} onClick={() => setMetodo(m.id)} className={clsx('flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold', metodo === m.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface')}>
              <m.icon className="h-5 w-5" /> {m.label}
            </button>
          ))}
        </div>
        {metodo === 'pm' && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Número de referencia del pago
            <input id="ref-pm" value={ref} onChange={(e) => setRef(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="004521" className="h-11 rounded-lg border border-line bg-surface px-3 font-mono outline-none focus:border-accent" />
          </label>
        )}
        <Button variant="primary" size="lg" disabled={metodo === 'pm' && ref.length < 4} onClick={() => { clearCart(); setRef(''); onClose(); toast('Venta registrada', 'ok'); }}>
          Listo, ya pagó
        </Button>
      </div>
    </Sheet>
  );
}

/** Atajo F9 para cobrar desde la PC. */
export function useCobrarShortcut(open: () => void, enabled: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F9' && enabled) { e.preventDefault(); open(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, enabled]);
}

export function MobileCartBar({ onOpen }: { onOpen: () => void }) {
  const { total, unidades, bloqueos } = useCartSummary();
  if (!unidades) return null;
  return (
    <button onClick={onOpen} className="fixed inset-x-3 bottom-[76px] z-20 flex items-center justify-between rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink shadow-pop md:hidden" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
      <span className="flex items-center gap-2">
        {bloqueos.length > 0 && <AlertTriangle className="h-4 w-4" />}
        {unidades} {unidades === 1 ? 'caja' : 'cajas'} · <span className="font-mono">{usd(total)}</span>
      </span>
      <span>Ver cuenta →</span>
    </button>
  );
}
