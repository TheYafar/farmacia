import { clsx } from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Alert, Button, Campo, Card, Cargando, Chip, ErrorCarga, PageHeader, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useCargar } from '@/lib/useCargar';
import type { Opcion } from '@/lib/tipos';
import { avisar } from '@/store/avisos';
import { ElegirProducto } from '@/features/inventario/InventarioPage';

/* ───────── utilidades ───────── */
const usd = (v: string | number) => `$${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
const msg = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.errores.map((x) => x.mensaje)].join('. ') : 'No se pudo completar');
const mono = (s: ReactNode) => <span className="font-mono tabular">{s}</span>;

/** Descarga una tabla como archivo que Excel abre directo (CSV con «;» y acentos). */
function descargarExcel(nombre: string, cabecera: string[], filas: (string | number | null)[][]) {
  const cel = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [cabecera, ...filas].map((f) => f.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

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

function Kpi({ k, v, tone }: { k: string; v: string; tone?: 'bad' | 'ok' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{k}</div>
      <div className={clsx('font-mono text-2xl tabular', tone === 'bad' && 'text-bad', tone === 'ok' && 'text-ok')}>{v}</div>
    </div>
  );
}

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

export function ComprasPage() {
  const [tab, setTab] = useState<'Pedido sugerido' | 'Cuentas por pagar'>('Pedido sugerido');
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
      <PageHeader title="Compras a droguerías" subtitle="Qué pedir y cuánto se debe. Las compras se cargan en Inventario." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Productos por pedir" v={String(sug.datos?.length ?? '—')} />
        <Kpi k="Agotados" v={String(sug.datos?.filter((s) => s.stock === 0).length ?? '—')} tone="bad" />
        <Kpi k="Deuda con droguerías" v={usd(deuda)} />
        <Kpi k="Facturas vencidas" v={String(vencidas)} tone={vencidas ? 'bad' : undefined} />
      </div>
      <Tabs tabs={['Pedido sugerido', 'Cuentas por pagar']} value={tab} onChange={setTab} />
      {tab === 'Pedido sugerido' && (
        <Estado c={sug}>{(d) => (
          <>
            <p className="text-sm text-muted">Ventas de los últimos 30 días + clientes esperando − existencia.</p>
            <Tabla vacio="No hace falta pedir nada por ahora." head={['Producto', 'Droguería', 'Existencia', 'Vendió (30 d)', 'Esperando', 'Pedir', 'Costo aprox.']}
              rows={d.map((s) => [
                <span className="font-semibold">{s.nombre}</span>, s.proveedor ?? '—',
                s.stock === 0 ? <Chip tone="bad">Agotado</Chip> : mono(s.stock), mono(s.vendidos30), s.espera ? <Chip tone="warn">{s.espera}</Chip> : mono(0), mono(<b>{s.pedir}</b>),
                s.costoUnidadUsd ? mono(usd(Number(s.costoUnidadUsd) * s.pedir)) : '—',
              ])} />
            {d.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => descargarExcel('pedido-sugerido', ['Producto', 'Droguería', 'Existencia', 'Vendió 30 días', 'Esperando', 'Pedir'], d.map((s) => [s.nombre, s.proveedor, s.stock, s.vendidos30, s.espera, s.pedir]))}>Descargar Excel</Button>
                {grupos.map((g) => (
                  <Button key={g} variant="primary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(textoPedido(g))}`, '_blank')}>Enviar a {g} por WhatsApp</Button>
                ))}
              </div>
            )}
          </>
        )}</Estado>
      )}
      {tab === 'Cuentas por pagar' && (
        <Estado c={cxp}>{(d) => (
          <>
            {d.porProveedor.length > 0 && <div className="flex flex-wrap gap-2">{d.porProveedor.map((p) => <Chip key={p.proveedor} tone="info">{p.proveedor}: {usd(p.saldoUsd)}</Chip>)}</div>}
            <Tabla vacio="No se le debe nada a las droguerías. Las compras con costo y días de crédito aparecen aquí." head={['Droguería', 'Factura', 'Vence', 'Total', 'Saldo', '']}
              rows={d.facturas.map((f) => [
                <span className="font-semibold">{f.proveedor}</span>, mono(f.numeroFactura),
                <Chip tone={f.vencida ? 'bad' : 'neutral'}>{f.vencida ? 'Vencida ' : ''}{fecha(f.venceEn)}</Chip>, mono(usd(f.totalUsd)), mono(<b>{usd(f.saldoUsd)}</b>),
                <Button size="sm" onClick={() => setPagar(f)}>Registrar pago</Button>,
              ])} />
          </>
        )}</Estado>
      )}
      <HojaPago titulo={`Pago a ${pagar?.proveedor ?? ''}`} saldo={pagar?.saldoUsd ?? '0'} ruta={pagar ? `/proveedores/cuentas/${pagar.id}/pagos` : null} onCerrar={() => setPagar(null)} onListo={cxp.recargar} />
    </div>
  );
}

/* ───────── Venta al mayor ───────── */
interface Cliente { id: string; rif: string; nombre: string; telefono: string | null; limiteUsd: string; diasCredito: number; descuentoPct: string; deudaUsd: string; vencidoUsd: string }
interface Pedido { id: string; numero: number; estado: string; totalUsd: string; saldoUsd: string; venceEn: string | null; creadoEn: string; cliente: { nombre: string; rif: string }; lineas: { nombre: string; cantidad: number; precioUsd: string }[] }
const PASOS = ['COTIZACION', 'PEDIDO', 'DESPACHADO', 'ENTREGADO'];
const NOMBRE_PASO: Record<string, string> = { COTIZACION: 'Cotización', PEDIDO: 'Pedido', DESPACHADO: 'Despachado', ENTREGADO: 'Entregado', ANULADO: 'Anulado' };

function NuevoCliente({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({ rif: '', nombre: '', telefono: '', limiteUsd: '1000', diasCredito: '15', descuentoPct: '10' });
  const [error, setError] = useState<string | null>(null);
  const campo = (k: keyof typeof f, etiqueta: string, ayuda?: string) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda}><input required={k !== 'telefono'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={claseInput} /></Campo>
  );
  return (
    <Sheet open={abierto} onClose={onCerrar} title="Nuevo cliente al mayor">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          await api('/mayorista/clientes', { body: { rif: f.rif, nombre: f.nombre, telefono: f.telefono || undefined, limiteUsd: Number(f.limiteUsd), diasCredito: Number(f.diasCredito), descuentoPct: Number(f.descuentoPct) } });
          avisar('Cliente creado', 'ok'); onListo(); onCerrar();
        } catch (err) { setError(msg(err)); }
      }}>
        {campo('rif', 'RIF', 'Ej. J-12345678-9')}{campo('nombre', 'Razón social')}{campo('telefono', 'Teléfono (opcional)')}
        <div className="grid grid-cols-3 gap-2">{campo('limiteUsd', 'Límite ($)')}{campo('diasCredito', 'Días crédito')}{campo('descuentoPct', 'Descuento %', 'Su precio de mayor')}</div>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar</Button>
      </form>
    </Sheet>
  );
}

function NuevaCotizacion({ clientes, abierto, onCerrar, onListo }: { clientes: Cliente[]; abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const [clienteId, setClienteId] = useState('');
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
          const r = await api<{ numero: number; totalUsd: string }>('/mayorista/pedidos', { body: { clienteId, lineas: lineas.map((l) => ({ productoId: l.producto!.id, cantidad: Number(l.cantidad) })) } });
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
        <div className="flex justify-between font-semibold"><span>Total con precio de mayor</span>{mono(usd(total))}</div>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Crear cotización</Button>
      </form>
    </Sheet>
  );
}

export function MayoristaPage() {
  const cli = useCargar(() => api<Cliente[]>('/mayorista/clientes'), []);
  const ped = useCargar(() => api<Pedido[]>('/mayorista/pedidos'), []);
  const [hoja, setHoja] = useState<'cliente' | 'cotizacion' | null>(null);
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
                <div className="text-xs text-muted">{p.lineas.map((l) => `${l.cantidad} × ${l.nombre}`).join(' · ')}</div></div>
                <div className="text-right">{mono(<b>{usd(p.totalUsd)}</b>)}{Number(p.saldoUsd) > 0 && ['DESPACHADO', 'ENTREGADO'].includes(p.estado) && <div className="text-xs text-bad">Debe {usd(p.saldoUsd)}</div>}</div></div>
              <div className="flex flex-wrap gap-1">{p.estado === 'ANULADO' ? <Chip tone="bad">Anulado</Chip> : PASOS.map((s, i) => { const k = PASOS.indexOf(p.estado); return <Chip key={s} tone={i < k || (i === k && s === 'ENTREGADO') ? 'ok' : i === k ? 'accent' : 'neutral'}>{i <= k ? '✓ ' : ''}{NOMBRE_PASO[s]}</Chip>; })}</div>
              <div className="flex flex-wrap gap-2">
                {p.estado !== 'ENTREGADO' && p.estado !== 'ANULADO' && <Button size="sm" variant="primary" onClick={() => accion(p, 'avanzar')}>Marcar «{NOMBRE_PASO[PASOS[PASOS.indexOf(p.estado) + 1]]}»</Button>}
                {['COTIZACION', 'PEDIDO'].includes(p.estado) && <Button size="sm" variant="ghost" onClick={() => accion(p, 'anular')}>Anular</Button>}
                {['DESPACHADO', 'ENTREGADO'].includes(p.estado) && Number(p.saldoUsd) > 0 && <Button size="sm" onClick={() => setAbonar(p)}>Registrar abono</Button>}
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
          <Button size="sm" disabled={!Number(c.deudaUsd)} onClick={() => estadoCuenta(c)}>Estado de cuenta</Button>,
        ])} />
      )}</Estado>
      <NuevoCliente abierto={hoja === 'cliente'} onCerrar={() => setHoja(null)} onListo={recargar} />
      <NuevaCotizacion clientes={cli.datos ?? []} abierto={hoja === 'cotizacion'} onCerrar={() => setHoja(null)} onListo={recargar} />
      <HojaPago titulo={`Abono · pedido #${abonar?.numero ?? ''}`} saldo={abonar?.saldoUsd ?? '0'} ruta={abonar ? `/mayorista/pedidos/${abonar.id}/abonos` : null} onCerrar={() => setAbonar(null)} onListo={recargar} />
    </div>
  );
}

/* ───────── WhatsApp y recompra ───────── */
interface Recompra { cedula: string; nombre: string; telefono: string; productoId: string; producto: string; dias: number; texto: string; enviado: boolean }

export function WhatsappPage() {
  const rec = useCargar(() => api<Recompra[]>('/whatsapp/recompra'), []);
  const est = useCargar(() => api<{ enviados30: number; volvieron: number }>('/whatsapp/estadisticas'), []);
  const enviar = async (r: Recompra) => {
    const tel = r.telefono.replace(/\D/g, '').replace(/^0/, '58');
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(r.texto)}`, '_blank');
    try { await api('/whatsapp/enviado', { body: { cedula: r.cedula, productoId: r.productoId } }); } catch { /* el mensaje igual se abrió */ }
    rec.recargar(); est.recargar();
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="WhatsApp y recompra" subtitle="Clientes a los que se les acaba su tratamiento. Al tocar «Enviar» se abre WhatsApp con el mensaje listo." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi k="Para avisar hoy" v={String(rec.datos?.filter((r) => !r.enviado).length ?? '—')} />
        <Kpi k="Enviados (30 días)" v={String(est.datos?.enviados30 ?? '—')} />
        <Kpi k="Volvieron a comprar" v={String(est.datos?.volvieron ?? '—')} tone="ok" />
      </div>
      <Estado c={rec}>{(d) => d.length ? (
        <div className="flex flex-col gap-2">
          {d.map((r) => (
            <Card key={r.cedula + r.productoId} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0"><div className="font-semibold">{r.nombre} <span className="font-mono text-xs text-muted">{r.telefono}</span></div>
                <div className="text-sm text-muted">{r.producto} · {r.dias > 0 ? `se le acaba en ${r.dias} día${r.dias === 1 ? '' : 's'}` : r.dias === 0 ? 'se le acaba hoy' : `se le acabó hace ${-r.dias} días`}</div></div>
              <Button size="sm" variant={r.enviado ? 'secondary' : 'primary'} onClick={() => enviar(r)}>{r.enviado ? 'Enviado ✓ · reenviar' : 'Enviar'}</Button>
            </Card>
          ))}
        </div>
      ) : <Card className="p-6 text-center text-sm text-muted">Nadie para avisar hoy. Aparecen aquí los clientes con cédula que compraron el mismo producto 2 o más veces.</Card>}</Estado>
    </div>
  );
}

/* ───────── Libro de psicotrópicos ───────── */
interface Mov { fecha: string; tipo: 'ENTRADA' | 'SALIDA'; producto: string; lote: string; cantidad: number; paciente: string; medico: string; documento: string; responsable: string }

export function LibroPage() {
  const hoy = new Date().toISOString().slice(0, 10);
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
  const [tab, setTab] = useState<'Ganancia' | 'Rotación' | 'Cajeros'>('Ganancia');
  const gan = useCargar(() => api<Ganancia>('/reportes/ganancia'), []);
  const rot = useCargar(() => api<Rotacion>('/reportes/rotacion'), []);
  const caj = useCargar(() => api<Cajero[]>('/reportes/cajeros'), []);
  const porLab = Object.entries((gan.datos?.productos ?? []).reduce<Record<string, number>>((a, p) => ({ ...a, [p.laboratorio]: (a[p.laboratorio] ?? 0) + Number(p.ventaUsd) }), {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...porLab.map((l) => l[1]));
  const exportar = () => {
    if (tab === 'Ganancia') descargarExcel('ganancia', ['Laboratorio', 'Producto', 'Unidades', 'Venta $', 'Costo $', 'Ganancia $'], (gan.datos?.productos ?? []).map((p) => [p.laboratorio, p.producto, p.unidades, p.ventaUsd, p.costoUsd, p.gananciaUsd]));
    if (tab === 'Rotación') descargarExcel('rotacion', ['Producto', 'Vendidos 30 días', 'Existencia', 'Días sin venta'], [...(rot.datos?.masVendidos ?? []).map((p) => [p.producto, p.vendidos30, p.stock, 0]), ...(rot.datos?.sinMovimiento ?? []).map((p) => [p.producto, 0, p.stock, p.diasSinVenta])]);
    if (tab === 'Cajeros') descargarExcel('cajeros', ['Cajero', 'Ventas', 'Monto $', 'Cierres', 'Cierres con diferencia'], (caj.datos ?? []).map((c) => [c.cajero, c.ventas, c.totalUsd, c.cierres, c.conDiferencia]));
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Reportes" subtitle="Últimos 30 días" actions={<Button variant="primary" onClick={exportar}>Descargar Excel</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Ventas" v={gan.datos ? usd(gan.datos.totalVentaUsd) : '—'} />
        <Kpi k="Ganancia" v={gan.datos ? usd(gan.datos.gananciaUsd) : '—'} tone="ok" />
        <Kpi k="Margen" v={gan.datos?.margenPct != null ? `${gan.datos.margenPct} %` : '—'} />
        <Kpi k="Productos sin costo" v={String(gan.datos?.sinCosto ?? '—')} tone={gan.datos?.sinCosto ? 'bad' : undefined} />
      </div>
      {!!gan.datos?.sinCosto && <Alert tone="warn">{gan.datos.sinCosto} productos vendidos no tienen costo cargado: su ganancia no se cuenta. Carga el costo en la próxima compra.</Alert>}
      <Tabs tabs={['Ganancia', 'Rotación', 'Cajeros']} value={tab} onChange={setTab} />
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
          <div className="flex flex-col gap-2"><h2 className="font-semibold">No se mueve (30 días sin vender)</h2>
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
