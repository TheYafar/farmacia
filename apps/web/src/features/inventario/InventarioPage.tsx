import { clsx } from 'clsx';
import { FileSpreadsheet, FileUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Button, Campo, Card, Cargando, Chip, ErrorCarga, Locked, PageHeader, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { daysUntil } from '@/lib/format';
import type { Grupo, Lote, Opcion } from '@/lib/tipos';
import { useCargar } from '@/lib/useCargar';
import { avisar } from '@/store/avisos';
import { useRol } from '@/store/sesion';
import ImportarExcel from './ImportarExcel';

const sem = (d: number) =>
  d <= 30 ? { tone: 'bad' as const, txt: 'Vence este mes' } : d <= 90 ? { tone: 'warn' as const, txt: 'Vence pronto' } : { tone: 'ok' as const, txt: 'Bien' };
const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

interface LineaCompra { producto: Opcion | null; numeroLote: string; vence: string; cantidad: string; factorVenta: string; costoUsd: string }
const nueva = (): LineaCompra => ({ producto: null, numeroLote: '', vence: '', cantidad: '', factorVenta: '1', costoUsd: '' });

export function ElegirProducto({ valor, onElegir }: { valor: Opcion | null; onElegir: (o: Opcion) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Opcion[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(async () => {
      try { setRes((await api<{ grupos: Grupo[] }>(`/catalogo/buscar?q=${encodeURIComponent(q)}`)).grupos.flatMap((g) => g.opciones)); } catch { setRes([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  if (valor) return <div className="flex h-11 items-center rounded-lg bg-surface2 px-3 text-sm font-semibold">{valor.nombreComercial} {valor.concentracion} · {valor.laboratorio}</div>;
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto" className={clsx(claseInput, 'w-full')} aria-label="Producto" />
      {res.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-surface shadow-pop">
          {res.map((o) => <li key={o.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-surface2" onClick={() => { onElegir(o); setQ(''); setRes([]); }}>{o.nombreComercial} {o.concentracion} · {o.laboratorio}</button></li>)}
        </ul>
      )}
    </div>
  );
}

function CargarCompra({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const [proveedor, setProveedor] = useState('');
  const [factura, setFactura] = useState('');
  const [credito, setCredito] = useState('0');
  const [lineas, setLineas] = useState<LineaCompra[]>([nueva()]);
  const [error, setError] = useState<string | null>(null);
  const cambiar = (i: number, c: Partial<LineaCompra>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...c } : l)));

  return (
    <Sheet open={abierto} onClose={onCerrar} title="Cargar compra de la droguería">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (lineas.some((l) => !l.producto)) { setError('Elige el producto de cada línea'); return; }
        try {
          const r = await api<{ clientesAvisados: number }>('/inventario/compras', {
            body: {
              proveedor, numeroFactura: factura,
              lineas: lineas.map((l) => ({ productoId: l.producto!.id, numeroLote: l.numeroLote, vence: l.vence, cantidad: Number(l.cantidad), factorVenta: Number(l.factorVenta) || 1, costoUsd: Number(l.costoUsd.replace(',', '.')) || 0 })),
              diasCredito: Number(credito) || 0,
            },
          });
          avisar(r.clientesAvisados ? `Compra cargada. Se avisó a ${r.clientesAvisados} ${r.clientesAvisados === 1 ? 'cliente' : 'clientes'} que esperaban` : 'Compra cargada', 'ok');
          setProveedor(''); setFactura(''); setLineas([nueva()]);
          onListo();
        } catch (err) {
          setError(err instanceof ApiError ? [err.message, ...err.errores.map((x) => `${x.campo}: ${x.mensaje}`)].join('. ') : 'No se pudo cargar');
        }
      }}>
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="Droguería"><input required value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={claseInput} /></Campo>
          <Campo etiqueta="N.º de factura"><input required value={factura} onChange={(e) => setFactura(e.target.value)} className={claseInput} /></Campo>
          <Campo etiqueta="Días de crédito" ayuda="0 si se pagó de contado"><input inputMode="numeric" value={credito} onChange={(e) => setCredito(e.target.value.replace(/\D/g, ''))} className={claseInput} /></Campo>
        </div>
        {lineas.map((l, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">Producto {i + 1}</span>
              {lineas.length > 1 && <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="text-muted hover:text-bad" aria-label="Quitar línea"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <ElegirProducto valor={l.producto} onElegir={(o) => cambiar(i, { producto: o })} />
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Lote"><input required value={l.numeroLote} onChange={(e) => cambiar(i, { numeroLote: e.target.value })} className={claseInput} /></Campo>
              <Campo etiqueta="Vence"><input required type="date" value={l.vence} onChange={(e) => cambiar(i, { vence: e.target.value })} className={claseInput} /></Campo>
              <Campo etiqueta="Cajas recibidas"><input required inputMode="numeric" value={l.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value.replace(/\D/g, '') })} className={claseInput} /></Campo>
              <Campo etiqueta="Unidades de venta por caja" ayuda="1 si se vende tal cual. 10 si una caja grande trae 10 tiras"><input inputMode="numeric" value={l.factorVenta} onChange={(e) => cambiar(i, { factorVenta: e.target.value.replace(/\D/g, '') })} className={claseInput} /></Campo>
              <Campo etiqueta="Costo por caja ($)" ayuda="Para saber la ganancia y lo que se debe"><input inputMode="decimal" value={l.costoUsd} onChange={(e) => cambiar(i, { costoUsd: e.target.value.replace(/[^\d.,]/g, '') })} className={claseInput} /></Campo>
            </div>
          </div>
        ))}
        <Button type="button" icon={<Plus className="h-4 w-4" />} onClick={() => setLineas((ls) => [...ls, nueva()])}>Otro producto</Button>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar compra</Button>
      </form>
    </Sheet>
  );
}

export default function InventarioPage() {
  const rol = useRol();
  const [dias, setDias] = useState<'' | '90' | '30'>('');
  const [compra, setCompra] = useState(false);
  const [excel, setExcel] = useState(false);
  const { datos, error, cargando, recargar } = useCargar(() => api<Lote[]>(`/inventario/lotes${dias ? `?dias=${dias}` : ''}`), [dias]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inventario"
        subtitle="Se vende primero lo que vence antes"
        actions={rol === 'ADMIN' ? (
          <>
            <Button icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => setExcel(true)}>Cargar desde Excel</Button>
            <Button variant="primary" icon={<FileUp className="h-4 w-4" />} onClick={() => setCompra(true)}>Cargar compra</Button>
          </>
        ) : <Locked>Solo el dueño carga compras</Locked>}
      />
      <div className="flex gap-1 self-start rounded-xl bg-surface2 p-1">
        {([['', 'Todo'], ['90', 'Vence en 3 meses'], ['30', 'Vence este mes']] as const).map(([v, t]) => (
          <button key={v} onClick={() => setDias(v)} className={clsx('rounded-lg px-3 py-1.5 text-sm font-semibold', dias === v ? 'bg-surface shadow-sm' : 'text-muted')}>{t}</button>
        ))}
      </div>
      {error && <ErrorCarga mensaje={error} reintentar={recargar} />}
      {cargando ? <Cargando /> : (
        <Card>
          {!datos?.length ? <p className="text-sm text-muted">No hay lotes con existencia en este filtro.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-2 py-2 font-semibold">Producto</th><th className="px-2 py-2 font-semibold">Lote</th><th className="px-2 py-2 font-semibold">Vence</th><th className="px-2 py-2 font-semibold">Estado</th><th className="px-2 py-2 text-right font-semibold">Hay</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.map((l) => {
                    const s = sem(daysUntil(l.vence));
                    return (
                      <tr key={l.id} className="border-b border-line last:border-0">
                        <td className="px-2 py-2.5"><div className="font-semibold">{l.producto.nombreComercial} {l.producto.concentracion}</div><div className="text-xs text-muted">{l.producto.laboratorio}</div></td>
                        <td className="px-2 py-2.5 font-mono">{l.numero}</td>
                        <td className="whitespace-nowrap px-2 py-2.5">{fmtFecha(l.vence)}</td>
                        <td className="px-2 py-2.5"><Chip tone={s.tone}>{s.txt}</Chip></td>
                        <td className="px-2 py-2.5 text-right font-mono">{l.stockLibre}{l.stockReservado ? <span className="text-muted"> + {l.stockReservado} apartadas</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      <ImportarExcel abierto={excel} onCerrar={() => setExcel(false)} onListo={() => void recargar()} />
      <CargarCompra abierto={compra} onCerrar={() => setCompra(false)} onListo={() => { setCompra(false); void recargar(); }} />
    </div>
  );
}
