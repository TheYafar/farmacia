import { AlertTriangle, Banknote, Camera, CheckCircle2, Clock, CreditCard, Minus, Plus, ShoppingCart, Smartphone, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';
import type { MetodoPago } from '@farmacia/shared';
import { Alert, Button, Chip, EmptyState, Kbd, Sheet } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { alergiaQueChoca, bs, usd } from '@/lib/format';
import type { Autorizacion } from '@/lib/tipos';
import { avisar } from '@/store/avisos';
import { useRol, useSesion } from '@/store/sesion';
import { useVenta, type Linea } from '@/store/venta';
import PacienteBar from './PacienteBar';

export function useResumenVenta() {
  const lineas = useVenta((s) => s.lineas);
  const total = lineas.reduce((a, l) => a + Number(l.producto.precioUsd) * l.cantidad, 0);
  const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
  return { lineas, total, unidades };
}

/** Lo que necesita la línea según las mismas reglas que aplica el servidor. */
function requisitos(l: Linea, alergias: string[] | undefined) {
  const delicado = l.principio.riesgo !== 'NORMAL';
  const alergia = alergias ? alergiaQueChoca(alergias, l.principio) : null;
  return { cedula: delicado || l.producto.requiereRecipe, recipe: delicado || l.producto.requiereRecipe, permiso: alergia ? 'ALERGIA' as const : delicado ? 'CONTROLADO' as const : null, alergia };
}

/** Pide permiso al farmacéutico y espera su respuesta (revisa cada 4 segundos). */
function Permiso({ l, razon }: { l: Linea; razon: 'ALERGIA' | 'CONTROLADO' }) {
  const rol = useRol();
  const cliente = useVenta((s) => s.cliente)!;
  const solicitudId = useVenta((s) => s.solicitudes[l.producto.id]);
  const ponerSolicitud = useVenta((s) => s.ponerSolicitud);
  const [estado, setEstado] = useState<Autorizacion | null>(null);

  useEffect(() => {
    if (!solicitudId) return;
    let vivo = true;
    const revisar = async () => {
      try { const a = await api<Autorizacion>(`/autorizaciones/${solicitudId}`); if (vivo) setEstado(a); } catch { /* reintenta */ }
    };
    void revisar();
    const t = setInterval(() => { if (estado?.estado !== 'APROBADA' && estado?.estado !== 'RECHAZADA') void revisar(); }, 4000);
    return () => { vivo = false; clearInterval(t); };
  }, [solicitudId, estado?.estado]);

  if (estado?.estado === 'APROBADA') return <Chip tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" />} className="self-start">Aprobado por {estado.regente?.nombre}</Chip>;
  if (estado?.estado === 'RECHAZADA') return <Alert tone="bad">El farmacéutico no lo aprobó{estado.motivo ? `: ${estado.motivo}` : ''}. Quita este producto de la cuenta.</Alert>;
  if (solicitudId) return <Chip tone="warn" icon={<Clock className="h-3.5 w-3.5" />} className="self-start">Esperando al farmacéutico…</Chip>;

  const texto = razon === 'ALERGIA' ? `${cliente.nombre.split(' ')[0]} es alérgico/a y este medicamento puede causarle una reacción.` : 'Este medicamento necesita el permiso del farmacéutico.';
  return (
    <Alert tone="bad">
      <div className="flex flex-col gap-2">
        <span>{texto}</span>
        {rol === 'CAJERO' ? (
          <Button size="sm" variant="danger" className="self-start" onClick={async () => {
            try {
              const a = await api<Autorizacion>('/autorizaciones/solicitudes', { body: { cedula: cliente.cedula, productoId: l.producto.id, razon } });
              ponerSolicitud(l.producto.id, a.id);
              setEstado(a);
            } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo pedir el permiso', 'bad'); }
          }}>Pedir permiso al farmacéutico</Button>
        ) : (
          <Button size="sm" variant="danger" className="self-start" onClick={async () => {
            try {
              await api('/autorizaciones', { body: { cedula: cliente.cedula, productoId: l.producto.id, motivo: 'Aprobado en el mostrador' } });
              setEstado({ estado: 'APROBADA', regente: { nombre: useSesion.getState().usuario!.nombre } } as Autorizacion);
            } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo aprobar', 'bad'); }
          }}>Lo apruebo</Button>
        )}
      </div>
    </Alert>
  );
}

/** Foto del récipe tomada desde la cuenta. Queda en «Por revisar» para el farmacéutico. */
function FotoRecipe({ productoId }: { productoId: string }) {
  const cliente = useVenta((s) => s.cliente)!;
  const [listo, setListo] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const bloqueos = useVenta((s) => s.bloqueos);
  const ponerBloqueos = useVenta((s) => s.ponerBloqueos);
  if (listo) return <Chip tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" />} className="self-start">Récipe adjunto</Chip>;
  return (
    <>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const form = new FormData();
        form.append('foto', f);
        form.append('cedula', cliente.cedula);
        try {
          await api('/recipes', { form });
          setListo(true);
          ponerBloqueos(bloqueos.filter((b) => !(b.productoId === productoId && b.motivo === 'FALTA_RECIPE')));
          avisar('Récipe adjuntado', 'ok');
        } catch (err) { avisar(err instanceof ApiError ? err.message : 'No se pudo subir la foto', 'bad'); }
      }} />
      <Button size="sm" className="self-start" icon={<Camera className="h-4 w-4" />} onClick={() => input.current?.click()}>Tomar foto del récipe</Button>
    </>
  );
}

export function CartBody({ onCobrar }: { onCobrar: () => void }) {
  const { lineas, total } = useResumenVenta();
  const cliente = useVenta((s) => s.cliente);
  const bloqueos = useVenta((s) => s.bloqueos);
  const cantidad = useVenta((s) => s.cantidad);
  const vaciar = useVenta((s) => s.vaciar);
  const tasa = useSesion((s) => s.tasa);
  const faltaCedula = lineas.some((l) => requisitos(l, cliente?.alergias).cedula) && !cliente;

  return (
    <div className="flex flex-col gap-3">
      <PacienteBar />
      {faltaCedula && <Alert tone="warn">Hay productos que necesitan la cédula del cliente.</Alert>}
      {lineas.length === 0 ? (
        <EmptyState icon={<ShoppingCart className="h-8 w-8" />} title="Todavía no hay nada">Busca el medicamento y toca «Agregar».</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-dashed divide-line">
          {lineas.map((l) => {
            const req = requisitos(l, cliente?.alergias);
            const delServidor = bloqueos.filter((b) => b.productoId === l.producto.id);
            return (
              <li key={l.producto.id} className="flex flex-col gap-2 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold">{l.producto.nombreComercial} {l.producto.concentracion}</div>
                    <div className="text-xs text-muted">Caja de {l.producto.unidadesPorCaja}</div>
                  </div>
                  <span className="font-mono text-sm tabular">{usd(Number(l.producto.precioUsd) * l.cantidad)}</span>
                </div>
                <div className="flex items-center rounded-lg border border-line self-start">
                  <button className="grid h-8 w-8 place-items-center text-muted hover:text-fg" onClick={() => cantidad(l.producto.id, l.cantidad - 1)} aria-label="Quitar una caja">
                    {l.cantidad === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                  </button>
                  <span className="w-8 text-center font-mono text-sm">{l.cantidad}</span>
                  <button className="grid h-8 w-8 place-items-center text-muted hover:text-fg disabled:opacity-40" disabled={l.cantidad >= l.producto.stockLibre} onClick={() => cantidad(l.producto.id, l.cantidad + 1)} aria-label="Agregar una caja">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {cliente && req.recipe && <FotoRecipe productoId={l.producto.id} />}
                {cliente && req.permiso && <Permiso l={l} razon={req.permiso} />}
                {delServidor.filter((b) => b.motivo !== 'ALERGIA' && b.motivo !== 'CONTROLADO' && b.motivo !== 'FALTA_RECIPE').map((b) => <Alert key={b.motivo} tone="bad">{b.mensaje}</Alert>)}
                {delServidor.some((b) => b.motivo === 'FALTA_RECIPE') && <Alert tone="bad">Falta la foto del récipe de este cliente.</Alert>}
              </li>
            );
          })}
        </ul>
      )}
      {lineas.length > 0 && (
        <>
          <div className="flex flex-col gap-0.5 border-t border-line pt-3 font-mono tabular">
            <div className="flex items-baseline justify-between"><span className="font-sans text-base font-semibold">Total</span><span className="text-3xl font-medium">{usd(total)}</span></div>
            <div className="flex items-baseline justify-between text-sm"><span className="font-sans text-muted">En bolívares</span><span>{bs(total, tasa)}</span></div>
          </div>
          <Button variant="primary" size="lg" disabled={faltaCedula || !tasa} onClick={onCobrar}>
            {!tasa ? 'Falta la tasa del dólar' : 'Cobrar'}
            <span className="hidden xl:inline"><Kbd>F9</Kbd></span>
          </Button>
          <Button variant="ghost" size="sm" onClick={vaciar}>Borrar todo</Button>
        </>
      )}
    </div>
  );
}

const METODOS: { id: MetodoPago; label: string; icon: typeof Smartphone }[] = [
  { id: 'PAGO_MOVIL', label: 'Pago Móvil', icon: Smartphone },
  { id: 'PUNTO_DE_VENTA', label: 'Punto de venta', icon: CreditCard },
  { id: 'EFECTIVO_USD', label: 'Efectivo $', icon: Banknote },
  { id: 'EFECTIVO_BS', label: 'Efectivo Bs', icon: Banknote },
];

export function CobroSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lineas, total } = useResumenVenta();
  const cliente = useVenta((s) => s.cliente);
  const vaciar = useVenta((s) => s.vaciar);
  const ponerBloqueos = useVenta((s) => s.ponerBloqueos);
  const tasa = useSesion((s) => s.tasa);
  const [metodo, setMetodo] = useState<MetodoPago>('PAGO_MOVIL');
  const [ref, setRef] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cobrar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const v = await api<{ numero: number }>('/ventas', {
        body: {
          cedula: cliente?.cedula,
          metodoPago: metodo,
          referenciaPago: metodo === 'PAGO_MOVIL' ? ref : undefined,
          lineas: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
        },
      });
      vaciar();
      setRef('');
      onClose();
      avisar(`Venta N.º ${v.numero} registrada`, 'ok');
    } catch (e) {
      if (e instanceof ApiError && e.bloqueos.length) {
        ponerBloqueos(e.bloqueos);
        onClose();
        avisar('Hay productos que necesitan revisión', 'bad');
      } else {
        setError(e instanceof ApiError ? e.message : 'No se pudo cobrar');
      }
    } finally {
      setEnviando(false);
    }
  };

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
        {metodo === 'PAGO_MOVIL' && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Número de referencia del pago
            <input id="ref-pm" value={ref} onChange={(e) => setRef(e.target.value.replace(/\D/g, '').slice(0, 20))} inputMode="numeric" placeholder="004521" className="h-11 rounded-lg border border-line bg-surface px-3 font-mono outline-none focus:border-accent" />
          </label>
        )}
        {error && <Alert tone="bad">{error}</Alert>}
        <Button variant="primary" size="lg" disabled={enviando || (metodo === 'PAGO_MOVIL' && ref.length < 4)} onClick={cobrar}>
          {enviando ? 'Guardando…' : 'Listo, ya pagó'}
        </Button>
      </div>
    </Sheet>
  );
}

export function useCobrarShortcut(open: () => void, enabled: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F9' && enabled) { e.preventDefault(); open(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, enabled]);
}

export function MobileCartBar({ onOpen }: { onOpen: () => void }) {
  const { total, unidades } = useResumenVenta();
  const bloqueos = useVenta((s) => s.bloqueos);
  if (!unidades) return null;
  return (
    <button onClick={onOpen} className="fixed inset-x-3 z-20 flex items-center justify-between rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink shadow-pop md:hidden" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
      <span className="flex items-center gap-2">
        {bloqueos.length > 0 && <AlertTriangle className="h-4 w-4" />}
        {unidades} {unidades === 1 ? 'caja' : 'cajas'} · <span className="font-mono">{usd(total)}</span>
      </span>
      <span>Ver cuenta →</span>
    </button>
  );
}
