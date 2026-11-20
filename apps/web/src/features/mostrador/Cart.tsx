import { AlertTriangle, Banknote, Camera, CheckCircle2, Clock, CreditCard, Minus, Plus, ShoppingCart, Smartphone, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { ES_EFECTIVO, monedaDe, redondearBs, type MetodoPago, type Moneda } from '@farmacia/shared';
import { Alert, Button, Chip, EmptyState, Kbd, Sheet } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { alergiaQueChoca, bs, num2, usd } from '@/lib/format';
import type { Autorizacion, Venta } from '@/lib/tipos';
import { useCaja } from '@/store/caja';
import { avisar } from '@/store/avisos';
import { useRol, useSesion } from '@/store/sesion';
import { useVenta, type Linea } from '@/store/venta';
import { encolar } from '@/lib/sinConexion';
import { useConfig } from '@/store/config';
import PacienteBar from './PacienteBar';

export function useResumenVenta() {
  const lineas = useVenta((s) => s.lineas);
  const total = lineas.reduce((a, l) => a + Number(l.producto.precioUsd) * l.cantidad, 0);
  const conIva = lineas.reduce((a, l) => a + Number(l.producto.precioUsd) * l.cantidad * (1 + Number((l.producto as { ivaPct?: string | number }).ivaPct ?? 0) / 100), 0);
  const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
  return { lineas, total, conIva, unidades };
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
  const { lineas, conIva: total } = useResumenVenta();
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
  { id: 'PUNTO_DE_VENTA', label: 'Punto', icon: CreditCard },
  { id: 'EFECTIVO_USD', label: 'Efectivo $', icon: Banknote },
  { id: 'EFECTIVO_BS', label: 'Efectivo Bs', icon: Banknote },
];
const BILLETES = [1, 5, 10, 20, 50, 100];
const r2 = (n: number) => Math.round(n * 100) / 100;
const leer = (s: string) => Number(s.trim().replace(/\./g, '').replace(',', '.'));

interface PagoUI { metodo: MetodoPago; monto: number; referencia?: string }

/** Cobro con uno o varios pagos. Las cuentas se hacen en bolívares, igual que en el servidor. */
const MOTIVOS_DESCUENTO = ['Tercera edad', 'Convenio', 'Cliente frecuente', 'Empleado', 'Otro'];

export function CobroSheet({ open, onClose, onVendida }: { open: boolean; onClose: () => void; onVendida: (v: Venta) => void }) {
  const { lineas, total: bruto } = useResumenVenta();
  const rol = useRol();
  const [desc, setDesc] = useState(0);
  const [descMotivo, setDescMotivo] = useState(MOTIVOS_DESCUENTO[0]);
  const descuento = Math.round(bruto * desc) / 100;
  const ivaBruto = lineas.reduce((a, l) => a + Number(l.producto.precioUsd) * l.cantidad * Number((l.producto as { ivaPct?: string | number }).ivaPct ?? 0) / 100, 0);
  const iva = Math.round(ivaBruto * (100 - desc)) / 100;
  const base = Math.round((bruto - descuento + iva) * 100) / 100;
  const [igtf, setIgtf] = useState<{ igtfActivo: boolean; igtfPct: number }>({ igtfActivo: false, igtfPct: 0 });
  const [clave, setClave] = useState(() => crypto.randomUUID());
  useEffect(() => { if (open) { setClave(crypto.randomUUID()); api<{ igtfActivo: boolean; igtfPct: number }>('/catalogo/configuracion').then(setIgtf).catch(() => {}); } }, [open]);
  const cliente = useVenta((s) => s.cliente);
  const vaciar = useVenta((s) => s.vaciar);
  const ponerBloqueos = useVenta((s) => s.ponerBloqueos);
  const tasa = useSesion((s) => s.tasa) ?? 0;
  const paso = useConfig((s) => s.config?.redondeoBs ?? 0);
  const cargarCaja = useCaja((s) => s.cargar);
  const [pagos, setPagos] = useState<PagoUI[]>([]);
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO_USD');
  const [monto, setMonto] = useState('');
  const [ref, setRef] = useState('');
  const [vueltoEn, setVueltoEn] = useState<Moneda>('BS');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setPagos([]); setMonto(''); setRef(''); setError(null); setDesc(0); } }, [open]);

  const enBs = (p: PagoUI) => (monedaDe(p.metodo) === 'USD' ? r2(p.monto * tasa) : p.monto);
  const pIgtf = igtf.igtfActivo ? igtf.igtfPct / 100 : 0;
  const enDivisas = pagos.filter((p) => p.metodo === 'EFECTIVO_USD').reduce((a, p) => a + p.monto, 0);
  const igtfUsd = r2(Math.min(enDivisas, base) * pIgtf);
  const total = r2(base + igtfUsd);
  // Redondeo de Bs (Configuración): se cobra el monto redondeado, pero se acepta cualquier pago entre el exacto y el redondeado (igual que el servidor).
  const exactoBs = r2(total * tasa);
  const totalBs = r2(redondearBs(exactoBs, paso));
  const pagadoBs = r2(pagos.reduce((a, p) => a + enBs(p), 0));
  const faltaBs = r2(Math.min(exactoBs, totalBs) - pagadoBs) > 0.01 ? r2(totalBs - pagadoBs) : 0;
  const sobraBs = r2(pagadoBs - Math.max(exactoBs, totalBs));
  const vueltoBs = sobraBs > 0.01 ? sobraBs : 0;
  const efectivoBs = pagos.filter((p) => ES_EFECTIVO(p.metodo)).reduce((a, p) => a + enBs(p), 0);
  const vueltoInvalido = vueltoBs > 0 && efectivoBs + 0.01 < vueltoBs;
  const enMoneda = (bs: number, m: MetodoPago) =>
    m === 'EFECTIVO_USD' && pIgtf ? Math.ceil((bs / tasa / (1 - pIgtf)) * 100) / 100 : monedaDe(m) === 'USD' ? r2(bs / tasa) : r2(bs);
  const simbolo = (m: MetodoPago) => (monedaDe(m) === 'USD' ? '$' : 'Bs');

  const agregar = (valor?: number) => {
    const v = valor ?? leer(monto);
    if (!(v > 0)) { setError('Escribe un monto mayor que cero'); return; }
    if (metodo === 'PAGO_MOVIL' && !/^\d{4,20}$/.test(ref)) { setError('Escribe la referencia del Pago Móvil (4 a 20 números)'); return; }
    setPagos((ps) => [...ps, { metodo, monto: r2(v), referencia: metodo === 'PAGO_MOVIL' ? ref : undefined }]);
    setMonto(''); setRef(''); setError(null);
  };

  const cobrar = async () => {
    setEnviando(true);
    setError(null);
    try {
      // Si se cae el internet al cobrar, se reintenta con la misma clave: el servidor nunca guarda la venta dos veces.
      const enviar = () => api<Venta>('/ventas', {
        body: { clave, cedula: cliente?.cedula, pagos, vueltoMoneda: vueltoEn, descuentoPct: desc, descuentoMotivo: desc ? descMotivo : undefined, lineas: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })) },
      });
      let v: Venta | undefined;
      for (let intento = 0; !v; intento++) {
        try { v = await enviar(); } catch (e) {
          if (e instanceof ApiError && e.status === 0 && intento >= 2) {
            // Sigue sin internet: se guarda en el equipo y se envía sola al volver la conexión.
            const delicado = lineas.some((l) => l.producto.requiereRecipe || l.principio.riesgo !== 'NORMAL');
            if (delicado) throw new ApiError(0, 'Sin internet no se pueden vender productos con récipe o controlados. Espera a que vuelva la conexión');
            if (!confirm('No hay internet. ¿Guardar esta venta en el equipo? Se enviará sola cuando vuelva la conexión.')) throw e;
            encolar({
              clave, hechaEn: new Date().toISOString(), totalUsd: total,
              resumen: lineas.map((l) => `${l.cantidad} ${l.producto.nombreComercial}`).join(', '),
              body: { cedula: cliente?.cedula, pagos, vueltoMoneda: vueltoEn, descuentoPct: desc, descuentoMotivo: desc ? descMotivo : undefined, lineas: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })) },
            });
            vaciar(); onClose();
            avisar('Venta guardada sin conexión. Se enviará sola al volver el internet', 'ok');
            return;
          }
          if (!(e instanceof ApiError) || e.status !== 0 || intento >= 4) throw e;
          setError(`Sin conexión. Reintentando (${intento + 1}/4)…`);
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
      setError(null);
      vaciar();
      onClose();
      void cargarCaja();
      onVendida(v);
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
    <Sheet open={open} onClose={onClose} title="Cobrar">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface2 p-3 text-center font-mono tabular">
          <div><div className="text-xs font-sans text-muted">Total</div><div className="text-2xl font-medium">{usd(total)}</div></div>
          <div><div className="text-xs font-sans text-muted">En bolívares</div><div className="text-2xl font-medium">Bs {num2(totalBs)}</div></div>
          {(desc > 0 || iva > 0 || igtfUsd > 0) && <div className="col-span-2 text-xs font-sans text-muted">
            Subtotal {usd(bruto)}{desc > 0 && ` · descuento ${desc} % (−${usd(descuento)})`}{iva > 0 && ` · IVA ${usd(iva)}`}{igtfUsd > 0 && ` · IGTF ${usd(igtfUsd)}`}
          </div>}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Descuento</span>
          {[0, 5, 10, 15, 20].filter((p) => rol !== 'CAJERO' || p <= 10).map((p) => (
            <button key={p} type="button" disabled={pagos.length > 0} onClick={() => setDesc(p)}
              className={`rounded-lg border px-2.5 py-1 font-mono ${desc === p ? 'border-accent bg-accent-soft text-accent' : 'border-line'} disabled:opacity-50`}>{p ? `${p} %` : 'No'}</button>
          ))}
          {desc > 0 && (
            <select value={descMotivo} onChange={(e) => setDescMotivo(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2">
              {MOTIVOS_DESCUENTO.map((m) => <option key={m}>{m}</option>)}
            </select>
          )}
        </div>

        {pagos.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {pagos.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>{METODOS.find((m) => m.id === p.metodo)?.label}{p.referencia ? <span className="text-muted"> · ref. {p.referencia}</span> : null}</span>
                <span className="flex items-center gap-2 font-mono">{simbolo(p.metodo) === '$' ? usd(p.monto) : `Bs ${num2(p.monto)}`}
                  <button onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} className="text-muted hover:text-bad" aria-label="Quitar pago"><Trash2 className="h-4 w-4" /></button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {faltaBs > 0.01 && (
          <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <div className="grid grid-cols-4 gap-1.5">
              {METODOS.map((m) => (
                <button key={m.id} onClick={() => { setMetodo(m.id); setMonto(''); }} className={clsx('flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-semibold', metodo === m.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface')}>
                  <m.icon className="h-5 w-5" />{m.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-accent">
                <span className="font-mono text-muted">{simbolo(metodo)}</span>
                <input id="monto-pago" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }} placeholder={num2(enMoneda(faltaBs, metodo))} className="min-w-0 flex-1 bg-transparent font-mono text-lg outline-none" aria-label="Monto" />
              </label>
              <Button size="lg" onClick={() => agregar()}>Agregar</Button>
            </div>
            {metodo === 'PAGO_MOVIL' && (
              <input id="ref-pm" value={ref} onChange={(e) => setRef(e.target.value.replace(/\D/g, '').slice(0, 20))} inputMode="numeric" placeholder="Número de referencia" className="h-11 rounded-lg border border-line bg-surface px-3 font-mono outline-none focus:border-accent" />
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="primary" onClick={() => agregar(enMoneda(faltaBs, metodo))}>Lo que falta: {simbolo(metodo) === '$' ? usd(enMoneda(faltaBs, metodo)) : `Bs ${num2(enMoneda(faltaBs, metodo))}`}</Button>
              {metodo === 'EFECTIVO_USD' && BILLETES.map((b) => <Button key={b} size="sm" onClick={() => agregar(b)}>{b} $</Button>)}
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-muted">Pagado</dt><dd className="text-right font-mono">Bs {num2(pagadoBs)} · {usd(r2(pagadoBs / (tasa || 1)))}</dd>
          {faltaBs > 0.01 && (<><dt className="font-semibold text-bad">Falta</dt><dd className="text-right font-mono font-semibold text-bad">Bs {num2(faltaBs)} · {usd(r2(faltaBs / (tasa || 1)))}</dd></>)}
        </dl>

        {vueltoBs > 0 && (
          <div className="flex flex-col gap-2 rounded-xl bg-ok-soft p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ok">Vuelto</span>
              <div className="flex gap-1 rounded-lg bg-surface p-0.5">
                {(['BS', 'USD'] as const).map((m) => (
                  <button key={m} onClick={() => setVueltoEn(m)} className={clsx('rounded-md px-3 py-1 text-sm font-semibold', vueltoEn === m ? 'bg-accent text-accent-ink' : 'text-muted')}>{m === 'BS' ? 'Bs' : '$'}</button>
                ))}
              </div>
            </div>
            <div className="text-center font-mono text-3xl font-medium text-ok">{vueltoEn === 'BS' ? `Bs ${num2(vueltoBs)}` : usd(r2(vueltoBs / tasa))}</div>
            {vueltoInvalido && <Alert tone="bad">Solo se da vuelto de lo pagado en efectivo. Quita o corrige el pago electrónico.</Alert>}
          </div>
        )}

        {error && <Alert tone="bad">{error}</Alert>}
        <Button variant="primary" size="lg" disabled={enviando || faltaBs > 0.01 || vueltoInvalido || pagos.length === 0} onClick={cobrar}>
          {enviando ? 'Guardando…' : faltaBs > 0.01 ? 'Falta por pagar' : 'Listo, cobrar'}
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
