import { clsx } from 'clsx';
import { FileSpreadsheet, FileUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Button, Campo, Card, Cargando, Chip, ErrorCarga, Locked, PageHeader, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { daysUntil, normalizar, usd } from '@/lib/format';
import { catalogoLocal } from '@/lib/sinConexion';
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

/** Todo el catálogo, cargado una vez por pantalla (para elegir productos sin esperar al servidor). */
let catalogoCache: { cuando: number; items: Opcion[] } | null = null;
async function catalogoCompleto(): Promise<Opcion[]> {
  if (catalogoCache && Date.now() - catalogoCache.cuando < 60_000) return catalogoCache.items;
  let grupos: Grupo[];
  try { grupos = (await api<{ grupos: Grupo[] }>('/catalogo/sin-conexion')).grupos; } catch { grupos = catalogoLocal(); }
  const items = grupos.flatMap((g) => g.opciones.map((o) => ({ ...o, buscable: normalizar([o.nombreComercial, g.principio.nombre, o.concentracion, o.forma, o.laboratorio, o.codigoBarras ?? ''].join(' ')) })))
    .sort((a, b) => Number(b.stockLibre > 0) - Number(a.stockLibre > 0) || a.nombreComercial.localeCompare(b.nombreComercial, 'es'));
  catalogoCache = { cuando: Date.now(), items };
  return items;
}

/**
 * Elegir un producto: al tocar el campo sale todo el inventario (primero lo que hay),
 * y se filtra con cada letra. Si no aparece, se busca en el servidor (corrige errores de escritura).
 */
export function ElegirProducto({ valor, onElegir }: { valor: Opcion | null; onElegir: (o: Opcion) => void }) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [todos, setTodos] = useState<(Opcion & { buscable?: string })[] | null>(null);
  const [delServidor, setDelServidor] = useState<Opcion[]>([]);
  const [cambiando, setCambiando] = useState(false);
  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  const locales = (todos ?? []).filter((o) => palabras.every((p) => o.buscable?.includes(p)));
  useEffect(() => {
    setDelServidor([]);
    if (locales.length || q.trim().length < 4) return;
    const t = setTimeout(async () => {
      try { setDelServidor((await api<{ grupos: Grupo[] }>(`/catalogo/buscar?q=${encodeURIComponent(q)}`)).grupos.flatMap((g) => g.opciones)); } catch { /* nada */ }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, locales.length]);
  const res = (locales.length ? locales : delServidor).slice(0, 60);
  const elegir = (o: Opcion) => { onElegir(o); setQ(''); setAbierto(false); setCambiando(false); };

  if (valor && !cambiando) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-surface2 px-3 py-1.5 text-sm">
        <span className="font-semibold">{valor.nombreComercial} {valor.concentracion} · {valor.laboratorio}</span>
        <button type="button" className="shrink-0 text-xs font-semibold text-accent underline" onClick={() => { setCambiando(true); setAbierto(true); void catalogoCompleto().then(setTodos); }}>Cambiar</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
        onFocus={() => { setAbierto(true); if (!todos) void catalogoCompleto().then(setTodos); }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter' && res[0]) { e.preventDefault(); elegir(res[0]); } if (e.key === 'Escape') setAbierto(false); }}
        placeholder="Toca para ver el inventario o escribe" className={clsx(claseInput, 'w-full')} aria-label="Producto" autoComplete="off" />
      {abierto && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-surface shadow-pop">
          {!todos ? <li className="px-3 py-2 text-sm text-muted">Cargando inventario…</li>
            : !res.length ? <li className="px-3 py-2 text-sm text-muted">No hay productos con «{q}»</li>
            : res.map((o) => (
              <li key={o.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(o)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface2">
                  <span className="min-w-0"><span className="block truncate font-semibold">{o.nombreComercial} {o.concentracion}</span><span className="block truncate text-xs text-muted">{o.laboratorio} · {o.forma}</span></span>
                  <span className="shrink-0 text-right"><span className="block font-mono">{usd(o.precioUsd)}</span><span className={clsx('block text-xs', o.stockLibre ? 'text-muted' : 'font-semibold text-bad')}>{o.stockLibre ? `Hay ${o.stockLibre}` : 'Agotado'}</span></span>
                </button>
              </li>
            ))}
          {todos && !q && (todos.length > 60) && <li className="px-3 py-2 text-xs text-muted">Mostrando 60 de {todos.length}. Escribe para filtrar.</li>}
        </ul>
      )}
    </div>
  );
}

function CargarCompra({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const [proveedor, setProveedor] = useState('');
  const [factura, setFactura] = useState('');
  const [credito, setCredito] = useState('0');
  const [droguerias, setDroguerias] = useState<string[]>([]);
  useEffect(() => { if (abierto) api<string[]>('/proveedores/lista').then(setDroguerias).catch(() => {}); }, [abierto]);
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
          <Campo etiqueta="Droguería"><input required list="droguerias" value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={claseInput} />
            <datalist id="droguerias">{droguerias.map((d) => <option key={d} value={d} />)}</datalist></Campo>
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
