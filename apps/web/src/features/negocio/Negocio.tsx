import { fechaVe, sumarDias } from '@farmacia/shared';
import { clsx } from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Campo, Card, Cargando, Chip, ErrorCarga, PageHeader, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useCargar } from '@/lib/useCargar';
import type { Opcion } from '@/lib/tipos';
import { avisar } from '@/store/avisos';
import { descargarExcel as descargarXlsx } from '@/lib/excel';
import { useConfig } from '@/store/config';
import { ElegirProducto } from '@/features/inventario/InventarioPage';
import { NOMBRE_METODO as NM } from '@/features/caja/Ticket';
const NOMBRE_METODO = NM as Record<string, string>;

/* ───────── utilidades ───────── */
const usd = (v: string | number) => `$${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
const msg = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.errores.map((x) => x.mensaje)].join('. ') : 'No se pudo completar');
const mono = (s: ReactNode) => <span className="font-mono tabular">{s}</span>;

const descargarExcel = (n: string, c: string[], f: (string | number | null)[][]) => void descargarXlsx(n, c, f);

function Tabs<T extends string>({ tabs, value, onChange }: { tabs: T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface2 p-1">
      {tabs.map((t) => <button key={t} onClick={() => onChange(t)} className={clsx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold', value === t ? 'bg-surface text-fg shadow-sm' : 'text-muted')}>{t}</button>)}
    </div>
  );
}

function Tabla({ head, rows, vacio }: { head: string[]; rows: ReactNode[][]; vacio: string }) {
  if (!rows.length) return <Card className="p-6 text-center text-sm text-muted">{vacio}</Card>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="border-b border-line text-left text-xs text-muted">{head.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line last:border-0">{r.map((c, j) => <td key={j} className="px-4 py-2.5 align-middle">{c}</td>)}</tr>)}</tbody>
      </table>
    </Card>
  );
}

function Kpi({ k, v, tone, sub }: { k: string; v: string; tone?: 'bad' | 'ok'; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{k}</div>
      <div className={clsx('font-mono text-2xl tabular', tone === 'bad' && 'text-bad', tone === 'ok' && 'text-ok')}>{v}</div>
      {sub && <div className="text-xs">{sub}</div>}
    </div>
  );
}

/** «+12 % vs. período anterior» en verde o rojo. */
function Cambio({ a, b, dinero }: { a: number; b: number; dinero?: boolean }) {
  if (!b) return <span className="text-muted">{a ? 'Sin datos del período anterior' : '—'}</span>;
  const pct = Math.round(((a - b) / b) * 100);
  return <span className={pct >= 0 ? 'text-ok' : 'text-bad'}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct)} % <span className="text-muted">vs. anterior ({dinero ? usd(b) : b})</span></span>;
}

interface Comparacion { anteriorDesde: string; actual: { ventas: number; usd: string; ticketPromedio: string; clientes: number }; anterior: { ventas: number; usd: string; ticketPromedio: string; clientes: number } }
interface ValorInventario { unidades: number; costoUsd: string; ventaUsd: string; gananciaPotencialUsd: string; vencidoCostoUsd: string; sinCosto: number; porCategoria: { categoria: string; unidades: number; costoUsd: string; ventaUsd: string }[]; productos: { producto: string; laboratorio: string; unidades: number; costoUsd: string | null; ventaUsd: string }[] }

function Estado<T>({ c, children }: { c: { datos: T | null; error: string | null; cargando: boolean; recargar: () => void }; children: (d: T) => ReactNode }) {
  if (c.error) return <ErrorCarga mensaje={c.error} reintentar={c.recargar} />;
  if (!c.datos) return <Cargando />;
  return <>{children(c.datos)}</>;
}

/** Hoja para registrar un pago (a droguería) o un abono (de cliente al mayor). */
function HojaPago({ titulo, saldo, ruta, onCerrar, onListo }: { titulo: string; saldo: string; ruta: string | null; onCerrar: () => void; onListo: () => void }) {
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('Transferencia');
  const [ref, setRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open={!!ruta} onClose={onCerrar} title={titulo}>
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const r = await api<{ saldoUsd: string }>(ruta!, { body: { montoUsd: Number(monto.replace(',', '.')), metodo, referencia: ref || undefined } });
          avisar(`Registrado. Queda debiendo ${usd(r.saldoUsd)}`, 'ok');
          setMonto(''); setRef(''); onListo(); onCerrar();
        } catch (err) { setError(msg(err)); }
      }}>
        <p className="text-sm text-muted">Saldo: <b className="font-mono">{usd(saldo)}</b></p>
        <Campo etiqueta="Monto ($)"><input required autoFocus inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ''))} className={claseInput} /></Campo>
        <button type="button" className="self-start text-sm font-semibold text-accent" onClick={() => setMonto(saldo)}>Pagar todo ({usd(saldo)})</button>
        <Campo etiqueta="Método">
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={claseInput}>
            {['Transferencia', 'Pago Móvil', 'Efectivo $', 'Efectivo Bs', 'Zelle'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Referencia (opcional)"><input value={ref} onChange={(e) => setRef(e.target.value)} className={claseInput} /></Campo>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Registrar</Button>
      </form>
    </Sheet>
  );
}

/* ───────── Compras a droguerías ───────── */
interface Sugerido { productoId: string; nombre: string; vendidos30: number; stock: number; espera: number; pedir: number; proveedor: string | null; costoUnidadUsd: string | null }
interface Factura { id: string; proveedor: string; numeroFactura: string; venceEn: string | null; totalUsd: string; saldoUsd: string; vencida: boolean }

interface Orden { id: string; numero: number; proveedor: string; estado: 'ABIERTA' | 'RECIBIDA' | 'ANULADA'; creadaEn: string; lineas: { id: string; productoId: string; nombre: string; cantidad: number; recibido: number | null }[] }
interface CompraF { id: string; proveedor: string; numeroFactura: string; creadaEn: string; totalUsd: string; pagadoUsd: string; devueltoUsd: string; anulada: boolean; lineas: { id: string; numeroLote: string; cantidad: number; factorVenta: number; costoUsd: string; producto: { nombreComercial: string; concentracion: string } }[] }

function RecibirOrden({ o, onCerrar, onListo }: { o: Orden | null; onCerrar: () => void; onListo: () => void }) {
  const [factura, setFactura] = useState('');
  const [credito, setCredito] = useState('0');
  const [l, setL] = useState<Record<string, { recibido: string; lote: string; vence: string; costo: string }>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (o) { setL(Object.fromEntries(o.lineas.map((x) => [x.id, { recibido: String(x.cantidad), lote: '', vence: '', costo: '' }]))); setFactura(''); setError(null); } }, [o]);
  const c = (id: string, k: string, v: string) => setL({ ...l, [id]: { ...l[id]!, [k]: v } });
  return (
    <Sheet open={!!o} onClose={onCerrar} title={`Recibir orden #${o?.numero ?? ''} · ${o?.proveedor ?? ''}`}>
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const r = await api<{ diferencias: number; clientesAvisados: number }>(`/inventario/ordenes/${o!.id}/recibir`, { body: {
            numeroFactura: factura, diasCredito: Number(credito) || 0,
            lineas: o!.lineas.map((x) => ({ lineaId: x.id, recibido: Number(l[x.id]?.recibido) || 0, numeroLote: l[x.id]?.lote || undefined, vence: l[x.id]?.vence || undefined, costoUsd: Number(l[x.id]?.costo.replace(',', '.')) || 0 })),
          } });
          avisar(`Mercancía recibida${r.diferencias ? ` con ${r.diferencias} diferencia(s)` : ''}${r.clientesAvisados ? `. Se avisó a ${r.clientesAvisados} clientes` : ''}`, 'ok');
          onListo(); onCerrar();
        } catch (err) { setError(msg(err)); }
      }}>
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="N.º de factura"><input required value={factura} onChange={(e) => setFactura(e.target.value)} className={claseInput} /></Campo>
          <Campo etiqueta="Días de crédito"><input inputMode="numeric" value={credito} onChange={(e) => setCredito(e.target.value.replace(/\D/g, ''))} className={claseInput} /></Campo>
        </div>
        {o?.lineas.map((x) => {
          const v = l[x.id]; if (!v) return null;
          const dif = Number(v.recibido) !== x.cantidad;
          return (
            <div key={x.id} className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <div className="flex justify-between text-sm font-semibold"><span>{x.nombre}</span><span className="text-muted">Pedido: {x.cantidad}</span></div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Campo etiqueta="Llegaron"><input inputMode="numeric" value={v.recibido} onChange={(e) => c(x.id, 'recibido', e.target.value.replace(/\D/g, ''))} className={clsx(claseInput, dif && 'border-warn')} /></Campo>
                <Campo etiqueta="Lote"><input value={v.lote} onChange={(e) => c(x.id, 'lote', e.target.value)} className={claseInput} /></Campo>
                <Campo etiqueta="Vence"><input type="date" value={v.vence} onChange={(e) => c(x.id, 'vence', e.target.value)} className={claseInput} /></Campo>
                <Campo etiqueta="Costo caja $"><input inputMode="decimal" value={v.costo} onChange={(e) => c(x.id, 'costo', e.target.value)} className={claseInput} /></Campo>
              </div>
              {dif && <span className="text-xs font-semibold text-warn">Diferencia: {Number(v.recibido) - x.cantidad > 0 ? '+' : ''}{Number(v.recibido) - x.cantidad}</span>}
            </div>
          );
        })}
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Confirmar recepción</Button>
      </form>
    </Sheet>
  );
}

function DevolverDrogueria({ c, onCerrar, onListo }: { c: CompraF | null; onCerrar: () => void; onListo: () => void }) {
  const [lineaId, setLineaId] = useState('');
  const [cant, setCant] = useState('');
  const [motivo, setMotivo] = useState('Vencido');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setLineaId(c?.lineas[0]?.id ?? ''); setCant(''); setError(null); }, [c]);
  return (
    <Sheet open={!!c} onClose={onCerrar} title={`Devolver a ${c?.proveedor ?? ''} · factura ${c?.numeroFactura ?? ''}`}>
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const r = await api<{ montoUsd: string }>('/inventario/devoluciones-proveedor', { body: { compraId: c!.id, compraLineaId: lineaId, cantidad: Number(cant), motivo } });
          avisar(`Devuelto. Se descontaron ${usd(r.montoUsd)} de la deuda`, 'ok'); onListo(); onCerrar();
        } catch (err) { setError(msg(err)); }
      }}>
        <Campo etiqueta="Producto">
          <select value={lineaId} onChange={(e) => setLineaId(e.target.value)} className={claseInput}>
            {c?.lineas.map((l) => <option key={l.id} value={l.id}>{l.producto.nombreComercial} {l.producto.concentracion} · lote {l.numeroLote} ({l.cantidad * l.factorVenta} unidades)</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Unidades a devolver"><input required inputMode="numeric" value={cant} onChange={(e) => setCant(e.target.value.replace(/\D/g, ''))} className={claseInput} /></Campo>
        <Campo etiqueta="Motivo"><select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={claseInput}>{['Vencido', 'Por vencer', 'Dañado', 'Equivocado', 'Otro'].map((m) => <option key={m}>{m}</option>)}</select></Campo>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Devolver</Button>
      </form>
    </Sheet>
  );
}

export function ComprasPage() {
  const [tab, setTab] = useState<'Qué pedir' | 'Pedidos a droguerías' | 'Lo que llegó' | 'Lo que debo'>('Qué pedir');
  const ords = useCargar(() => api<Orden[]>('/proveedores/ordenes'), []);
  const facts = useCargar(() => api<CompraF[]>('/inventario/compras'), []);
  const [recibir, setRecibir] = useState<Orden | null>(null);
  const [devolver, setDevolver] = useState<CompraF | null>(null);
  const crearOrden = async (prov: string) => {
    const items = (sug.datos ?? []).filter((x) => (x.proveedor ?? 'Sin droguería') === prov);
    try {
      const o = await api<{ numero: number }>('/proveedores/ordenes', { body: { proveedor: prov === 'Sin droguería' ? 'Por definir' : prov, lineas: items.map((x) => ({ productoId: x.productoId, cantidad: x.pedir })) } });
      avisar(`Orden #${o.numero} creada para ${prov}`, 'ok'); ords.recargar(); setTab('Pedidos a droguerías');
    } catch (e) { avisar(msg(e), 'bad'); }
  };
  const anular = async (ruta: string, texto: string) => {
    if (!confirm(texto)) return;
    try { await api(ruta, { body: {} }); avisar('Anulada', 'ok'); ords.recargar(); facts.recargar(); cxp.recargar(); sug.recargar(); } catch (e) { avisar(msg(e), 'bad'); }
  };
  const recargarTodo = () => { ords.recargar(); facts.recargar(); cxp.recargar(); sug.recargar(); };
  const sug = useCargar(() => api<Sugerido[]>('/proveedores/sugerido'), []);
  const cxp = useCargar(() => api<{ facturas: Factura[]; porProveedor: { proveedor: string; saldoUsd: string }[] }>('/proveedores/cuentas'), []);
  const [pagar, setPagar] = useState<Factura | null>(null);
  const deuda = cxp.datos?.porProveedor.reduce((a, p) => a + Number(p.saldoUsd), 0) ?? 0;
  const vencidas = cxp.datos?.facturas.filter((f) => f.vencida).length ?? 0;

  const textoPedido = (prov: string) => {
    const items = (sug.datos ?? []).filter((s) => (s.proveedor ?? 'Sin droguería') === prov);
    return `Buenos días, pedido de la farmacia:\n${items.map((s) => `• ${s.nombre}: ${s.pedir}`).join('\n')}\nGracias.`;
  };
  const grupos = [...new Set((sug.datos ?? []).map((s) => s.proveedor ?? 'Sin droguería'))];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Compras a droguerías" subtitle="Qué comprar, qué pediste, qué llegó y cuánto debes" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Conviene comprar" v={String(sug.datos?.length ?? '—')} />
        <Kpi k="Agotados" v={String(sug.datos?.filter((s) => s.stock === 0).length ?? '—')} tone="bad" />
        <Kpi k="Le debes a droguerías" v={usd(deuda)} />
        <Kpi k="Facturas vencidas" v={String(vencidas)} tone={vencidas ? 'bad' : undefined} />
      </div>
      <Tabs tabs={['Qué pedir', 'Pedidos a droguerías', 'Lo que llegó', 'Lo que debo']} value={tab} onChange={setTab} />
      {tab === 'Qué pedir' && (
        <Estado c={sug}>{(d) => (
          <>
            <p className="text-sm text-muted">Lo que conviene comprar: lo que vendiste en 30 días, más lo que piden los clientes, menos lo que ya tienes. Toca «Hacer pedido» para mandárselo a la droguería.</p>
            <Tabla vacio="No hace falta pedir nada por ahora." head={['Producto', 'Droguería', 'Hay', 'Vendiste (30 días)', 'Lo piden', 'Comprar', 'Costará más o menos']}
              rows={d.map((s) => [
                <span className="font-semibold">{s.nombre}</span>, s.proveedor ?? '—',
                s.stock === 0 ? <Chip tone="bad">Agotado</Chip> : mono(s.stock), mono(s.vendidos30), s.espera ? <Chip tone="warn">{s.espera}</Chip> : mono(0), mono(<b>{s.pedir}</b>),
                s.costoUnidadUsd ? mono(usd(Number(s.costoUnidadUsd) * s.pedir)) : '—',
              ])} />
            {d.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => descargarExcel('pedido-sugerido', ['Producto', 'Droguería', 'Existencia', 'Vendió 30 días', 'Esperando', 'Pedir'], d.map((s) => [s.nombre, s.proveedor, s.stock, s.vendidos30, s.espera, s.pedir]))}>Descargar Excel</Button>
                {grupos.map((g) => (
                  <span key={g} className="flex gap-1">
                    <Button variant="primary" onClick={() => void crearOrden(g)}>Hacer pedido · {g}</Button>
                    <Button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(textoPedido(g))}`, '_blank')}>WhatsApp</Button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}</Estado>
      )}
      {tab === 'Lo que debo' && (
        <Estado c={cxp}>{(d) => (
          <>
            {d.porProveedor.length > 0 && <div className="flex flex-wrap gap-2">{d.porProveedor.map((p) => <Chip key={p.proveedor} tone="info">{p.proveedor}: {usd(p.saldoUsd)}</Chip>)}</div>}
            <Tabla vacio="No se le debe nada a las droguerías. Las compras con costo y días de crédito aparecen aquí." head={['Droguería', 'Factura', 'Vence', 'Total', 'Saldo', '']}
              rows={d.facturas.map((f) => [
                <span className="font-semibold">{f.proveedor}</span>, mono(f.numeroFactura),
                <Chip tone={f.vencida ? 'bad' : 'neutral'}>{f.vencida ? 'Vencida ' : ''}{fecha(f.venceEn)}</Chip>, mono(usd(f.totalUsd)), mono(<b>{usd(f.saldoUsd)}</b>),
                <Button size="sm" onClick={() => setPagar(f)}>Ya pagué</Button>,
              ])} />
          </>
        )}</Estado>
      )}
      {tab === 'Pedidos a droguerías' && (
        <Estado c={ords}>{(d) => (
          <Tabla vacio="Sin órdenes. Créalas desde el pedido sugerido." head={['N.º', 'Droguería', 'Fecha', 'Productos', 'Estado', '']} rows={d.map((o) => [
            mono(`#${o.numero}`), <span className="font-semibold">{o.proveedor}</span>, mono(fecha(o.creadaEn)),
            <span className="text-xs">{o.lineas.map((l) => `${l.cantidad} ${l.nombre}${l.recibido != null && l.recibido !== l.cantidad ? ` (llegaron ${l.recibido})` : ''}`).join(' · ')}</span>,
            <Chip tone={o.estado === 'ABIERTA' ? 'warn' : o.estado === 'RECIBIDA' ? 'ok' : 'neutral'}>{o.estado === 'ABIERTA' ? 'Por llegar' : o.estado === 'RECIBIDA' ? 'Recibida' : 'Anulada'}</Chip>,
            o.estado === 'ABIERTA' && <div className="flex gap-1">
              <Button size="sm" variant="primary" onClick={() => setRecibir(o)}>Recibir</Button>
              <Button size="sm" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Buenos días, orden #${o.numero}:\n${o.lineas.map((l) => `• ${l.nombre}: ${l.cantidad}`).join('\n')}\nGracias.`)}`, '_blank')}>WhatsApp</Button>
              <Button size="sm" variant="ghost" onClick={() => void anular(`/proveedores/ordenes/${o.id}/anular`, `¿Anular la orden #${o.numero}?`)}>Anular</Button>
            </div>,
          ])} />
        )}</Estado>
      )}
      {tab === 'Lo que llegó' && (
        <Estado c={facts}>{(d) => (
          <Tabla vacio="Aún no hay compras cargadas." head={['Droguería', 'Factura', 'Fecha', 'Total', 'Devuelto', 'Estado', '']} rows={d.map((c) => [
            <span className="font-semibold">{c.proveedor}</span>, mono(c.numeroFactura), mono(fecha(c.creadaEn)), mono(usd(c.totalUsd)),
            Number(c.devueltoUsd) ? mono(usd(c.devueltoUsd)) : '—',
            c.anulada ? <Chip tone="bad">Anulada</Chip> : <Chip tone="ok">Cargada</Chip>,
            !c.anulada && <div className="flex gap-1">
              <Button size="sm" onClick={() => setDevolver(c)}>Devolver</Button>
              <Button size="sm" variant="ghost" onClick={() => void anular(`/inventario/compras/${c.id}/anular`, `¿Anular la factura ${c.numeroFactura} de ${c.proveedor}? Su mercancía sale del inventario. Úsalo solo si se cargó por error.`)}>Anular</Button>
            </div>,
          ])} />
        )}</Estado>
      )}
      <RecibirOrden o={recibir} onCerrar={() => setRecibir(null)} onListo={recargarTodo} />
      <DevolverDrogueria c={devolver} onCerrar={() => setDevolver(null)} onListo={recargarTodo} />
      <HojaPago titulo={`Pago a ${pagar?.proveedor ?? ''}`} saldo={pagar?.saldoUsd ?? '0'} ruta={pagar ? `/proveedores/cuentas/${pagar.id}/pagos` : null} onCerrar={() => setPagar(null)} onListo={cxp.recargar} />
    </div>
  );
}

/* ───────── Venta al mayor ───────── */
interface Cliente { id: string; rif: string; nombre: string; telefono: string | null; limiteUsd: string; diasCredito: number; descuentoPct: string; deudaUsd: string; vencidoUsd: string }
interface Pedido { validaHasta: string | null; empleado: string | null; id: string; numero: number; estado: string; totalUsd: string; saldoUsd: string; venceEn: string | null; creadoEn: string; cliente: { nombre: string; rif: string }; lineas: { nombre: string; cantidad: number; precioUsd: string }[] }
const PASOS = ['COTIZACION', 'PEDIDO', 'DESPACHADO', 'ENTREGADO'];
const NOMBRE_PASO: Record<string, string> = { COTIZACION: 'Cotización', PEDIDO: 'Confirmado', DESPACHADO: 'Enviado', ENTREGADO: 'Recibido', ANULADO: 'Anulado' };
/** Qué toca hacer en cada paso, dicho en simple: el botón y una línea que lo explica. */
const SIGUIENTE: Record<string, [string, string]> = {
  COTIZACION: ['El cliente aceptó', 'Le mandaste los precios. Si los acepta, toca el botón y se aparta la mercancía.'],
  PEDIDO: ['Ya lo envié', 'Prepara la mercancía. Al enviarla se descuenta del inventario y empieza a contar el crédito.'],
  DESPACHADO: ['Ya lo recibieron', 'Va en camino. Cuando el cliente lo reciba, márcalo.'],
};

function NuevoCliente({ abierto, c, onCerrar, onListo }: { abierto: boolean; c?: Cliente | null; onCerrar: () => void; onListo: () => void }) {
  const vacio = { rif: '', nombre: '', telefono: '', limiteUsd: '1000', diasCredito: '15', descuentoPct: '10' };
  const [f, setF] = useState(vacio);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    setF(c ? { rif: c.rif, nombre: c.nombre, telefono: c.telefono ?? '', limiteUsd: String(Number(c.limiteUsd)), diasCredito: String(c.diasCredito), descuentoPct: String(Number(c.descuentoPct)) } : vacio);
  }, [c, abierto]); // eslint-disable-line react-hooks/exhaustive-deps
  const campo = (k: keyof typeof f, etiqueta: string, ayuda?: string) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda}><input required={k !== 'telefono'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={claseInput} /></Campo>
  );
  return (
    <Sheet open={abierto} onClose={onCerrar} title={c ? `Editar ${c.nombre}` : 'Nuevo cliente al mayor'}>
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const datos = { nombre: f.nombre, telefono: f.telefono || undefined, limiteUsd: Number(f.limiteUsd), diasCredito: Number(f.diasCredito), descuentoPct: Number(f.descuentoPct) };
          if (c) await api(`/mayorista/clientes/${c.id}`, { method: 'PATCH', body: datos });
          else await api('/mayorista/clientes', { body: { rif: f.rif, ...datos } });
          avisar(c ? 'Cliente actualizado' : 'Cliente creado', 'ok'); onListo(); onCerrar();
        } catch (err) { setError(msg(err)); }
      }}>
        {c ? <p className="text-sm text-muted">RIF {c.rif} (no se cambia)</p> : campo('rif', 'RIF', 'Ej. J-12345678-9')}{campo('nombre', 'Razón social')}{campo('telefono', 'Teléfono (opcional)')}
        <div className="grid grid-cols-3 gap-2">{campo('limiteUsd', 'Límite ($)')}{campo('diasCredito', 'Días crédito')}{campo('descuentoPct', 'Descuento %', 'Su precio de mayor')}</div>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar</Button>
        {c && <Button type="button" variant="ghost" onClick={async () => {
          if (Number(c.deudaUsd) > 0) { setError('No se puede desactivar: todavía debe dinero'); return; }
          if (!confirm(`¿Desactivar a ${c.nombre}? Ya no aparecerá para nuevas cotizaciones.`)) return;
          try { await api(`/mayorista/clientes/${c.id}`, { method: 'PATCH', body: { activo: false } }); avisar('Cliente desactivado', 'ok'); onListo(); onCerrar(); } catch (err) { setError(msg(err)); }
        }}>Desactivar cliente</Button>}
      </form>
    </Sheet>
  );
}

function NuevaCotizacion({ clientes, abierto, onCerrar, onListo }: { clientes: Cliente[]; abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const [clienteId, setClienteId] = useState('');
  const [validez, setValidez] = useState('7');
  const [empleado, setEmpleado] = useState('');
  const [lineas, setLineas] = useState<{ producto: Opcion | null; cantidad: string }[]>([{ producto: null, cantidad: '' }]);
  const [error, setError] = useState<string | null>(null);
  const cli = clientes.find((c) => c.id === clienteId);
  const total = lineas.reduce((a, l) => a + (l.producto ? Number(l.producto.precioUsd) * (1 - Number(cli?.descuentoPct ?? 0) / 100) * (Number(l.cantidad) || 0) : 0), 0);
  return (
    <Sheet open={abierto} onClose={onCerrar} title="Nueva cotización">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        if (lineas.some((l) => !l.producto || !Number(l.cantidad))) { setError('Elige producto y cantidad en cada línea'); return; }
        try {
          const r = await api<{ numero: number; totalUsd: string }>('/mayorista/pedidos', { body: { clienteId, validezDias: Number(validez) || 7, empleado: empleado || undefined, lineas: lineas.map((l) => ({ productoId: l.producto!.id, cantidad: Number(l.cantidad) })) } });
          avisar(`Cotización #${r.numero} por ${usd(r.totalUsd)}`, 'ok');
          setLineas([{ producto: null, cantidad: '' }]); onListo(); onCerrar();
        } catch (err) { setError(msg(err)); }
      }}>
        <Campo etiqueta="Cliente">
          <select required value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={claseInput}>
            <option value="">Elige…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} (−{Number(c.descuentoPct)} %)</option>)}
          </select>
        </Campo>
        {lineas.map((l, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <div className="flex justify-between text-sm font-semibold">Producto {i + 1}
              {lineas.length > 1 && <button type="button" onClick={() => setLineas(lineas.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="h-4 w-4 text-muted" /></button>}
            </div>
            <ElegirProducto valor={l.producto} onElegir={(o) => setLineas(lineas.map((x, j) => (j === i ? { ...x, producto: o } : x)))} />
            <Campo etiqueta="Cantidad (cajas)"><input inputMode="numeric" value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value.replace(/\D/g, '') } : x)))} className={claseInput} /></Campo>
          </div>
        ))}
        <Button type="button" icon={<Plus className="h-4 w-4" />} onClick={() => setLineas([...lineas, { producto: null, cantidad: '' }])}>Otro producto</Button>
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="Los precios valen por (días)"><input inputMode="numeric" value={validez} onChange={(e) => setValidez(e.target.value.replace(/\D/g, ''))} className={claseInput} /></Campo>
          <Campo etiqueta="¿Lo retira un empleado? (opcional)" ayuda="Si un trabajador de la empresa lo busca y se le cobra a la empresa"><input value={empleado} onChange={(e) => setEmpleado(e.target.value)} placeholder="Nombre y cédula" className={claseInput} /></Campo>
        </div>
        <div className="flex justify-between font-semibold"><span>Total con precio de mayor</span>{mono(usd(total))}</div>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Crear cotización</Button>
      </form>
    </Sheet>
  );
}

/** Abre la cotización o la nota de entrega lista para imprimir o «Guardar como PDF». */
function imprimirDocumento(p: Pedido, c?: Cliente) {
  const farmacia = useConfig.getState().config?.farmacia;
  const esc = (t: string) => t.replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]!));
  const titulo = p.estado === 'COTIZACION' ? 'COTIZACIÓN' : 'NOTA DE ENTREGA';
  const filas = p.lineas.map((l) => `<tr><td>${esc(l.nombre)}</td><td class="n">${l.cantidad}</td><td class="n">${usd(l.precioUsd)}</td><td class="n">${usd(Number(l.precioUsd) * l.cantidad)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo} ${p.numero}</title><style>
    body{font-family:system-ui,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left;font-size:13px}.n{text-align:right}.g{display:flex;justify-content:space-between;gap:24px;margin-top:12px;font-size:13px}
    .firma{margin-top:64px;display:flex;gap:48px}.firma div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:12px;text-align:center}</style></head><body>
    <div class="g"><div><h1>${esc(farmacia?.nombre ?? 'Farmacia')}</h1>${farmacia?.rif ? `RIF ${esc(farmacia.rif)}<br>` : ''}${esc(farmacia?.direccion ?? '')}<br>${esc(farmacia?.telefono ?? '')}</div>
    <div style="text-align:right"><h1>${titulo} N.º ${p.numero}</h1>Fecha: ${fecha(p.creadoEn)}${p.estado === 'COTIZACION' && p.validaHasta ? `<br>Válida hasta: ${fecha(p.validaHasta)}` : ''}${p.venceEn ? `<br>Vence el pago: ${fecha(p.venceEn)}` : ''}</div></div>
    <div class="g"><div><b>Cliente:</b> ${esc(p.cliente.nombre)}<br><b>RIF:</b> ${esc(p.cliente.rif)}${c?.telefono ? `<br><b>Tel.:</b> ${esc(c.telefono)}` : ''}${p.empleado ? `<br><b>Convenio · retira:</b> ${esc(p.empleado)}` : ''}</div></div>
    <table><thead><tr><th>Producto</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Total</th></tr></thead><tbody>${filas}</tbody>
    <tfoot><tr><td colspan="3" class="n"><b>TOTAL</b></td><td class="n"><b>${usd(p.totalUsd)}</b></td></tr></tfoot></table>
    ${p.estado === 'COTIZACION' ? '<p style="font-size:12px">Precios de mayor sujetos a disponibilidad hasta la fecha indicada.</p>' : '<div class="firma"><div>Entregado por</div><div>Recibido conforme (nombre, cédula y firma)</div></div>'}
    <script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { avisar('Permite las ventanas emergentes para imprimir', 'bad'); return; }
  w.document.write(html); w.document.close();
}

export function MayoristaPage() {
  const cli = useCargar(() => api<Cliente[]>('/mayorista/clientes'), []);
  const ped = useCargar(() => api<Pedido[]>('/mayorista/pedidos'), []);
  const [hoja, setHoja] = useState<'cliente' | 'cotizacion' | null>(null);
  const [editar, setEditar] = useState<Cliente | null>(null);
  const [abonar, setAbonar] = useState<Pedido | null>(null);
  const recargar = () => { cli.recargar(); ped.recargar(); };
  const accion = async (p: Pedido, a: 'avanzar' | 'anular') => {
    try {
      const r = await api<{ estado: string }>(`/mayorista/pedidos/${p.id}/${a}`, { body: {} });
      avisar(`Pedido #${p.numero}: ${NOMBRE_PASO[r.estado]}`, 'ok'); recargar();
    } catch (e) { avisar(msg(e), 'bad'); }
  };
  const porCobrar = cli.datos?.reduce((a, c) => a + Number(c.deudaUsd), 0) ?? 0;
  const vencido = cli.datos?.reduce((a, c) => a + Number(c.vencidoUsd), 0) ?? 0;
  const estadoCuenta = (c: Cliente) => {
    const lista = (ped.datos ?? []).filter((p) => p.cliente.rif === c.rif && Number(p.saldoUsd) > 0 && ['DESPACHADO', 'ENTREGADO'].includes(p.estado));
    const texto = `Estado de cuenta · ${c.nombre}\n${lista.map((p) => `Pedido #${p.numero} (${fecha(p.creadoEn)}): ${usd(p.saldoUsd)} · vence ${fecha(p.venceEn)}`).join('\n')}\nTotal: ${usd(c.deudaUsd)}`;
    const tel = (c.telefono ?? '').replace(/\D/g, '').replace(/^0/, '58');
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Venta al mayor" subtitle="Clínicas, farmacias y empresas con precio de mayor y crédito"
        actions={<><Button onClick={() => setHoja('cliente')}>Nuevo cliente</Button><Button variant="primary" disabled={!cli.datos?.length} onClick={() => setHoja('cotizacion')}>Nueva cotización</Button></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Por cobrar" v={usd(porCobrar)} /><Kpi k="Vencido" v={usd(vencido)} tone={vencido ? 'bad' : undefined} />
        <Kpi k="Pedidos abiertos" v={String(ped.datos?.filter((p) => ['COTIZACION', 'PEDIDO', 'DESPACHADO'].includes(p.estado)).length ?? '—')} />
        <Kpi k="Clientes" v={String(cli.datos?.length ?? '—')} />
      </div>
      <h2 className="font-semibold">Pedidos</h2>
      <Estado c={ped}>{(d) => d.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {d.map((p) => (
            <Card key={p.id} className="flex flex-col gap-2 p-4">
              <div className="flex justify-between gap-2"><div><div className="font-semibold">#{p.numero} · {p.cliente.nombre}</div>
                <div className="text-xs text-muted">{p.lineas.map((l) => `${l.cantidad} × ${l.nombre}`).join(' · ')}</div>
                {p.empleado && <div className="text-xs text-muted">Lo retira {p.empleado} (se le cobra a la empresa)</div>}
                {p.estado === 'COTIZACION' && p.validaHasta && (new Date(p.validaHasta) < new Date() ? <Chip tone="bad">Vencida</Chip> : <span className="text-xs text-muted">Vale hasta {fecha(p.validaHasta)}</span>)}</div>
                <div className="text-right">{mono(<b>{usd(p.totalUsd)}</b>)}{Number(p.saldoUsd) > 0 && ['DESPACHADO', 'ENTREGADO'].includes(p.estado) && <div className="text-xs text-bad">Debe {usd(p.saldoUsd)}</div>}</div></div>
              {SIGUIENTE[p.estado] && <p className="text-xs text-muted">{SIGUIENTE[p.estado]![1]}</p>}
              <div className="flex flex-wrap gap-1">{p.estado === 'ANULADO' ? <Chip tone="bad">Anulado</Chip> : PASOS.map((s, i) => { const k = PASOS.indexOf(p.estado); return <Chip key={s} tone={i < k || (i === k && s === 'ENTREGADO') ? 'ok' : i === k ? 'accent' : 'neutral'}>{i <= k ? '✓ ' : ''}{NOMBRE_PASO[s]}</Chip>; })}</div>
              <div className="flex flex-wrap gap-2">
                {SIGUIENTE[p.estado] && <Button size="sm" variant="primary" onClick={() => accion(p, 'avanzar')}>{SIGUIENTE[p.estado]![0]}</Button>}
                {['COTIZACION', 'PEDIDO'].includes(p.estado) && <Button size="sm" variant="ghost" onClick={() => accion(p, 'anular')}>Anular</Button>}
                {['DESPACHADO', 'ENTREGADO'].includes(p.estado) && Number(p.saldoUsd) > 0 && <Button size="sm" onClick={() => setAbonar(p)}>Me pagó (abono)</Button>}
                {p.estado !== 'ANULADO' && <Button size="sm" variant="ghost" onClick={() => imprimirDocumento(p, cli.datos?.find((c) => c.rif === p.cliente.rif))}>{p.estado === 'COTIZACION' ? 'Cotización PDF' : 'Nota de entrega PDF'}</Button>}
              </div>
            </Card>
          ))}
        </div>
      ) : <Card className="p-6 text-center text-sm text-muted">Aún no hay pedidos. Crea un cliente y luego una cotización.</Card>}</Estado>
      <h2 className="font-semibold">Clientes</h2>
      <Estado c={cli}>{(d) => (
        <Tabla vacio="Aún no hay clientes al mayor." head={['Cliente', 'RIF', 'Descuento', 'Límite', 'Debe', 'Estado', '']} rows={d.map((c) => [
          <span className="font-semibold">{c.nombre}</span>, mono(c.rif), mono(`${Number(c.descuentoPct)} %`), mono(usd(c.limiteUsd)), mono(usd(c.deudaUsd)),
          Number(c.vencidoUsd) > 0 ? <Chip tone="bad">Vencido {usd(c.vencidoUsd)}</Chip> : Number(c.deudaUsd) > Number(c.limiteUsd) ? <Chip tone="bad">Pasó su límite</Chip> : <Chip tone="ok">Al día</Chip>,
          <div className="flex gap-1"><Button size="sm" onClick={() => setEditar(c)}>Editar</Button><Button size="sm" disabled={!Number(c.deudaUsd)} onClick={() => estadoCuenta(c)}>Estado de cuenta</Button></div>,
        ])} />
      )}</Estado>
      <NuevoCliente abierto={hoja === 'cliente' || !!editar} c={editar} onCerrar={() => { setHoja(null); setEditar(null); }} onListo={recargar} />
      <NuevaCotizacion clientes={cli.datos ?? []} abierto={hoja === 'cotizacion'} onCerrar={() => setHoja(null)} onListo={recargar} />
      <HojaPago titulo={`Abono · pedido #${abonar?.numero ?? ''}`} saldo={abonar?.saldoUsd ?? '0'} ruta={abonar ? `/mayorista/pedidos/${abonar.id}/abonos` : null} onCerrar={() => setAbonar(null)} onListo={recargar} />
    </div>
  );
}

/* ───────── WhatsApp y recompra ───────── */
interface Recompra { cedula: string; nombre: string; telefono: string; productoId: string; producto: string; precio?: string; dias: number; texto: string; enviado: boolean; estimado?: boolean }

const cuandoSeAcaba = (dias: number) => dias > 0 ? `se le acaba en ${dias} día${dias === 1 ? '' : 's'}` : dias === 0 ? 'se le acaba hoy' : `se le acabó hace ${-dias} día${dias === -1 ? '' : 's'}`;

/** Un solo mensaje por cliente, aunque se le acaben varios productos. */
function mensajeCliente(items: Recompra[]): string {
  if (items.length === 1) return items[0]!.texto;
  const nombre = items[0]!.nombre.split(' ')[0];
  // Solo los más urgentes, para que el mensaje no sea una lista larga.
  const lista = items.slice(0, MAX_MENSAJE).map((r) => `• ${r.producto}${r.precio ? ` (${r.precio.replace('.', ',')} $)` : ''}`).join('\n');
  const resto = items.length > MAX_MENSAJE ? '\n…y otras cosas que sueles comprar.' : '';
  return `¡Hola ${nombre}! Se te deben estar terminando:\n${lista}${resto}\n¿Te los apartamos? Responde SÍ y te los tenemos listos.`;
}

/** Productos que van en el mensaje y en la tarjeta de cada cliente. */
const MAX_MENSAJE = 5;

/** Cuántos clientes se muestran de una vez (los más urgentes primero). */
const POR_PAGINA = 20;

export function WhatsappPage() {
  const rec = useCargar(() => api<Recompra[]>('/whatsapp/recompra'), []);
  const est = useCargar(() => api<{ enviados30: number; volvieron: number }>('/whatsapp/estadisticas'), []);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const enviar = async (items: Recompra[]) => {
    const tel = items[0]!.telefono.replace(/\D/g, '').replace(/^0/, '58');
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensajeCliente(items))}`, '_blank');
    await Promise.all(items.map((r) => api('/whatsapp/enviado', { body: { cedula: r.cedula, productoId: r.productoId } }).catch(() => { /* el mensaje igual se abrió */ })));
    rec.recargar(); est.recargar();
  };
  // Un grupo por cliente. Primero los que faltan por avisar y, entre ellos, a quien se le acaba antes.
  const grupos = Object.values((rec.datos ?? []).reduce<Record<string, Recompra[]>>((g, r) => ((g[r.cedula] ??= []).push(r), g), {}))
    .map((items) => items.sort((a, b) => a.dias - b.dias))
    .sort((a, b) => Number(a.every((r) => r.enviado)) - Number(b.every((r) => r.enviado)) || Math.abs(a[0]!.dias) - Math.abs(b[0]!.dias));
  const porAvisar = grupos.filter((g) => g.some((r) => !r.enviado)).length;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="WhatsApp y recompra" subtitle="Clientes a los que se les acaba su tratamiento. Al tocar «Enviar» se abre WhatsApp con el mensaje listo." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi k="Clientes por avisar" v={rec.datos ? String(porAvisar) : '—'} />
        <Kpi k="Enviados (30 días)" v={String(est.datos?.enviados30 ?? '—')} />
        <Kpi k="Volvieron a comprar" v={String(est.datos?.volvieron ?? '—')} tone="ok" />
      </div>
      <Estado c={rec}>{() => grupos.length ? (
        <div className="flex flex-col gap-2">
          {grupos.slice(0, mostrar).map((items) => {
            const enviado = items.every((r) => r.enviado);
            return (
              <Card key={items[0]!.cedula} className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{items[0]!.nombre} <span className="font-mono text-xs text-muted">{items[0]!.telefono}</span></div>
                    <ul className="mt-0.5 text-sm text-muted">
                      {items.slice(0, MAX_MENSAJE).map((r) => <li key={r.productoId}>{r.producto} · {cuandoSeAcaba(r.dias)}{r.estimado ? ' (estimado: compró una sola vez)' : ''}</li>)}
                      {items.length > MAX_MENSAJE && <li className="italic">y {items.length - MAX_MENSAJE} más (el mensaje menciona los {MAX_MENSAJE} más urgentes)</li>}
                    </ul>
                  </div>
                  <Button size="sm" variant={enviado ? 'secondary' : 'primary'} onClick={() => enviar(items)}>{enviado ? 'Enviado ✓ · reenviar' : 'Enviar'}</Button>
                </div>
              </Card>
            );
          })}
          {grupos.length > mostrar && <Button className="self-center" onClick={() => setMostrar((n) => n + POR_PAGINA)}>Ver más ({grupos.length - mostrar} clientes)</Button>}
        </div>
      ) : <Card className="p-6 text-center text-sm text-muted">Nadie para avisar hoy. Aparecen aquí los clientes con cédula y teléfono a los que se les está acabando lo que compraron.</Card>}</Estado>
    </div>
  );
}

/* ───────── Libro de psicotrópicos ───────── */
interface Mov { fecha: string; tipo: 'ENTRADA' | 'SALIDA'; producto: string; lote: string; cantidad: number; paciente: string; medico: string; documento: string; responsable: string }

export function LibroPage() {
  const hoy = fechaVe();
  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01');
  const [hasta, setHasta] = useState(hoy);
  const lib = useCargar(() => api<Mov[]>(`/libro/controlados?desde=${desde}&hasta=${hasta}`), [desde, hasta]);
  const cab = ['Fecha', 'Movimiento', 'Producto', 'Lote', 'Cantidad', 'Paciente', 'Médico', 'Documento', 'Responsable'];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Libro de psicotrópicos" subtitle="Se llena solo con cada venta y compra de productos controlados"
        actions={<>
          <Button onClick={() => window.print()}>Imprimir</Button>
          <Button variant="primary" disabled={!lib.datos?.length} onClick={() => descargarExcel('libro-controlados', cab, (lib.datos ?? []).map((m) => [fecha(m.fecha), m.tipo, m.producto, m.lote, m.cantidad, m.paciente, m.medico, m.documento, m.responsable]))}>Descargar Excel</Button>
        </>} />
      <div className="flex flex-wrap gap-2">
        <Campo etiqueta="Desde"><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={claseInput} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={claseInput} /></Campo>
      </div>
      <Estado c={lib}>{(d) => (
        <Tabla vacio="Sin movimientos de controlados en estas fechas." head={cab} rows={d.map((m) => [
          mono(fecha(m.fecha)), <Chip tone={m.tipo === 'SALIDA' ? 'bad' : 'ok'}>{m.tipo === 'SALIDA' ? 'Salida' : 'Entrada'}</Chip>, m.producto, mono(m.lote), mono(m.cantidad), m.paciente, m.medico, m.documento, m.responsable,
        ])} />
      )}</Estado>
    </div>
  );
}

/* ───────── Reportes ───────── */
interface Ganancia { totalVentaUsd: string; gananciaUsd: string; margenPct: number | null; sinCosto: number; productos: { laboratorio: string; producto: string; unidades: number; ventaUsd: string; costoUsd: string | null; gananciaUsd: string | null }[] }
interface Rotacion { masVendidos: { producto: string; vendidos30: number; stock: number }[]; sinMovimiento: { producto: string; stock: number; diasSinVenta: number | null }[] }
interface Cajero { cajero: string; ventas: number; totalUsd: string; cierres: number; conDiferencia: number }

export function ReportesPage() {
  const [tab, setTab] = useState<'Ganancia' | 'Rotación' | 'Cajeros' | 'Horas y pagos' | 'Inventario'>('Ganancia');
  const hoyS = fechaVe();
  const [desde, setDesde] = useState(sumarDias(fechaVe(), -29));
  const [hasta, setHasta] = useState(hoyS);
  const q = `?desde=${desde}&hasta=${hasta}`;
  const gan = useCargar(() => api<Ganancia>(`/reportes/ganancia${q}`), [q]);
  const rot = useCargar(() => api<Rotacion>(`/reportes/rotacion${q}`), [q]);
  const caj = useCargar(() => api<Cajero[]>(`/reportes/cajeros${q}`), [q]);
  const det = useCargar(() => api<{ porHora: { hora: number; ventas: number; usd: string }[]; porMetodo: { metodo: string; pagos: number; usd: string; monto: string }[]; devueltoUsd: string }>(`/reportes/ventas-detalle${q}`), [q]);
  const cmp = useCargar(() => api<Comparacion>(`/reportes/comparar${q}`), [q]);
  const inv = useCargar(() => api<ValorInventario>('/reportes/inventario'), []);
  const mesActual = () => { setDesde(hoyS.slice(0, 8) + '01'); setHasta(hoyS); };
  const atajo = (dias: number) => { setDesde(sumarDias(hoyS, -(dias - 1))); setHasta(hoyS); };
  const porLab = Object.entries((gan.datos?.productos ?? []).reduce<Record<string, number>>((a, p) => ({ ...a, [p.laboratorio]: (a[p.laboratorio] ?? 0) + Number(p.ventaUsd) }), {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...porLab.map((l) => l[1]));
  const exportar = () => {
    if (tab === 'Ganancia') descargarExcel('ganancia', ['Laboratorio', 'Producto', 'Unidades', 'Venta $', 'Costo $', 'Ganancia $'], (gan.datos?.productos ?? []).map((p) => [p.laboratorio, p.producto, p.unidades, p.ventaUsd, p.costoUsd, p.gananciaUsd]));
    if (tab === 'Rotación') descargarExcel('rotacion', ['Producto', 'Vendidos 30 días', 'Existencia', 'Días sin venta'], [...(rot.datos?.masVendidos ?? []).map((p) => [p.producto, p.vendidos30, p.stock, 0]), ...(rot.datos?.sinMovimiento ?? []).map((p) => [p.producto, 0, p.stock, p.diasSinVenta])]);
    if (tab === 'Horas y pagos') descargarExcel('ventas-por-hora-y-metodo', ['Tipo', 'Detalle', 'Cantidad', 'Monto $'], [...(det.datos?.porHora ?? []).map((h) => ['Hora', `${h.hora}:00`, h.ventas, h.usd]), ...(det.datos?.porMetodo ?? []).map((m) => ['Método', NOMBRE_METODO[m.metodo] ?? m.metodo, m.pagos, m.usd])]);
    if (tab === 'Inventario') descargarExcel('valor-inventario', ['Producto', 'Laboratorio', 'Unidades', 'Valor a costo $', 'Valor a precio de venta $'], (inv.datos?.productos ?? []).map((p) => [p.producto, p.laboratorio, p.unidades, p.costoUsd, p.ventaUsd]));
    if (tab === 'Cajeros') descargarExcel('cajeros', ['Cajero', 'Ventas', 'Monto $', 'Cierres', 'Cierres con diferencia'], (caj.datos ?? []).map((c) => [c.cajero, c.ventas, c.totalUsd, c.cierres, c.conDiferencia]));
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Reportes" subtitle={`Del ${fecha(desde)} al ${fecha(hasta)}`} actions={<Button variant="primary" onClick={exportar}>Descargar Excel</Button>} />
      <div className="flex flex-wrap items-end gap-2">
        <Campo etiqueta="Desde"><input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className={claseInput} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={hasta} min={desde} max={hoyS} onChange={(e) => setHasta(e.target.value)} className={claseInput} /></Campo>
        {[['Hoy', 1], ['7 días', 7], ['30 días', 30], ['90 días', 90]].map(([t, n]) => <Button key={t} size="sm" className="h-11" onClick={() => atajo(n as number)}>{t}</Button>)}
        <Button size="sm" className="h-11" onClick={mesActual}>Este mes</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Ventas netas" v={gan.datos ? usd(gan.datos.totalVentaUsd) : '—'} sub={cmp.datos && <Cambio a={Number(cmp.datos.actual.usd)} b={Number(cmp.datos.anterior.usd)} dinero />} />
        <Kpi k="Número de ventas" v={cmp.datos ? String(cmp.datos.actual.ventas) : '—'} sub={cmp.datos && <Cambio a={cmp.datos.actual.ventas} b={cmp.datos.anterior.ventas} />} />
        <Kpi k="Ticket promedio" v={cmp.datos ? usd(cmp.datos.actual.ticketPromedio) : '—'} sub={cmp.datos && <Cambio a={Number(cmp.datos.actual.ticketPromedio)} b={Number(cmp.datos.anterior.ticketPromedio)} dinero />} />
        <Kpi k="Clientes con cédula" v={cmp.datos ? String(cmp.datos.actual.clientes) : '—'} sub={cmp.datos && <Cambio a={cmp.datos.actual.clientes} b={cmp.datos.anterior.clientes} />} />
        <Kpi k="Ganancia" v={gan.datos ? usd(gan.datos.gananciaUsd) : '—'} tone="ok" />
        <Kpi k="Margen" v={gan.datos?.margenPct != null ? `${gan.datos.margenPct} %` : '—'} />
        <Kpi k="Productos sin costo" v={String(gan.datos?.sinCosto ?? '—')} tone={gan.datos?.sinCosto ? 'bad' : undefined} />
        <Kpi k="Mercancía (a costo)" v={inv.datos ? usd(inv.datos.costoUsd) : '—'} sub={inv.datos && <span className="text-muted">a precio de venta {usd(inv.datos.ventaUsd)}</span>} />
      </div>
      {cmp.datos && <p className="-mt-2 text-xs text-muted">Las flechas comparan con el período anterior del mismo largo (desde el {fecha(cmp.datos.anteriorDesde)}). Si empiezas el día 1 («Este mes»), se compara con el mes pasado hasta el mismo día.</p>}
      {!!gan.datos?.sinCosto && <Alert tone="warn">{gan.datos.sinCosto} {gan.datos.sinCosto === 1 ? "producto vendido no tiene" : "productos vendidos no tienen"} costo cargado: su ganancia no se cuenta. Carga el costo en la próxima compra.</Alert>}
      <Tabs tabs={['Ganancia', 'Rotación', 'Cajeros', 'Horas y pagos', 'Inventario']} value={tab} onChange={setTab} />
      {tab === 'Inventario' && <Estado c={inv}>{(d) => (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi k="Valor a costo" v={usd(d.costoUsd)} />
            <Kpi k="Valor a precio de venta" v={usd(d.ventaUsd)} />
            <Kpi k="Ganancia si se vende todo" v={usd(d.gananciaPotencialUsd)} tone="ok" />
            <Kpi k="Vencido (a costo)" v={usd(d.vencidoCostoUsd)} tone={Number(d.vencidoCostoUsd) > 0 ? 'bad' : undefined} />
          </div>
          <p className="text-xs text-muted">{d.unidades.toLocaleString('es-VE')} unidades sin vencer. Es la existencia de hoy (no depende de las fechas de arriba).{d.sinCosto ? ` ${d.sinCosto} ${d.sinCosto === 1 ? "producto no tiene" : "productos no tienen"} costo y no suman al valor a costo.` : ''}</p>
          <Tabla vacio="Sin existencia." head={['Categoría', 'Unidades', 'A costo', 'A precio de venta']} rows={d.porCategoria.map((c) => [<span className="font-semibold">{c.categoria}</span>, mono(c.unidades), mono(usd(c.costoUsd)), mono(usd(c.ventaUsd))])} />
          <div className="text-sm font-semibold">Los 50 productos con más valor</div>
          <Tabla vacio="Sin existencia." head={['Producto', 'Laboratorio', 'Unidades', 'A costo', 'A precio de venta']} rows={d.productos.map((p) => [<span className="font-semibold">{p.producto}</span>, p.laboratorio, mono(p.unidades), p.costoUsd ? mono(usd(p.costoUsd)) : <Chip>Sin costo</Chip>, mono(usd(p.ventaUsd))])} />
        </>
      )}</Estado>}
      {tab === 'Horas y pagos' && <Estado c={det}>{(d) => {
        const maxH = Math.max(1, ...d.porHora.map((h) => Number(h.usd)));
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-1.5 p-4"><div className="mb-1 text-sm font-semibold">Ventas por hora</div>
              {d.porHora.length ? d.porHora.map((h) => <div key={h.hora} className="grid grid-cols-[48px_1fr_auto] items-center gap-2 text-sm"><span className="font-mono">{String(h.hora).padStart(2, '0')}:00</span><div className="h-3 rounded-full bg-surface2"><div className="h-3 rounded-full bg-accent" style={{ width: `${(Number(h.usd) / maxH) * 100}%` }} /></div><span className="font-mono text-xs">{usd(h.usd)} · {h.ventas}</span></div>) : <span className="text-sm text-muted">Sin ventas.</span>}
            </Card>
            <div className="flex flex-col gap-2"><div className="text-sm font-semibold">Por método de pago</div>
              <Tabla vacio="Sin pagos." head={['Método', 'Pagos', 'En $']} rows={d.porMetodo.map((m) => [NOMBRE_METODO[m.metodo] ?? m.metodo, mono(m.pagos), mono(usd(m.usd))])} />
              {Number(d.devueltoUsd) > 0 && <p className="text-xs text-muted">Ya se restaron {usd(d.devueltoUsd)} en devoluciones.</p>}
            </div>
          </div>
        );
      }}</Estado>}
      {tab === 'Ganancia' && <Estado c={gan}>{(d) => (
        <>
          {porLab.length > 0 && <Card className="flex flex-col gap-2.5 p-4"><div className="text-sm font-semibold">Ventas por laboratorio</div>
            {porLab.map(([k, v]) => <div key={k} className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3 text-sm"><span className="truncate">{k}</span><div className="h-3 rounded-full bg-surface2"><div className="h-3 rounded-full bg-accent" style={{ width: `${(v / max) * 100}%` }} /></div>{mono(usd(v))}</div>)}
          </Card>}
          <Tabla vacio="Sin ventas en estos días." head={['Producto', 'Laboratorio', 'Unidades', 'Venta', 'Ganancia']} rows={d.productos.slice(0, 50).map((p) => [
            <span className="font-semibold">{p.producto}</span>, p.laboratorio, mono(p.unidades), mono(usd(p.ventaUsd)), p.gananciaUsd ? mono(usd(p.gananciaUsd)) : <Chip>Sin costo</Chip>,
          ])} />
        </>
      )}</Estado>}
      {tab === 'Rotación' && <Estado c={rot}>{(d) => (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2"><h2 className="font-semibold">Lo que más se vende</h2>
            <Tabla vacio="Sin ventas." head={['Producto', 'Vendidos', 'Existencia']} rows={d.masVendidos.map((p) => [p.producto, mono(p.vendidos30), p.stock < p.vendidos30 / 4 ? <Chip tone="warn">{p.stock}</Chip> : mono(p.stock)])} /></div>
          <div className="flex flex-col gap-2"><h2 className="font-semibold">No se vendió en estas fechas</h2>
            <Tabla vacio="Todo se está moviendo." head={['Producto', 'Existencia', 'Última venta']} rows={d.sinMovimiento.map((p) => [p.producto, mono(p.stock), <Chip tone="bad">{p.diasSinVenta == null ? 'Nunca' : `Hace ${p.diasSinVenta} días`}</Chip>])} /></div>
        </div>
      )}</Estado>}
      {tab === 'Cajeros' && <Estado c={caj}>{(d) => (
        <Tabla vacio="Sin ventas." head={['Cajero', 'Ventas', 'Monto', 'Cierres', 'Con diferencia']} rows={d.map((c) => [
          <span className="font-semibold">{c.cajero}</span>, mono(c.ventas), mono(usd(c.totalUsd)), mono(c.cierres), c.conDiferencia ? <Chip tone="warn">{c.conDiferencia}</Chip> : <Chip tone="ok">0</Chip>,
        ])} />
      )}</Estado>}
    </div>
  );
}
