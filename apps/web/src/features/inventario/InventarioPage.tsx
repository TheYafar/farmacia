import { clsx } from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Button, Campo, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { normalizar, usd } from '@/lib/format';
import { catalogoLocal } from '@/lib/sinConexion';
import type { Grupo, Opcion } from '@/lib/tipos';
import { avisar } from '@/store/avisos';

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

export function CargarCompra({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const [proveedor, setProveedor] = useState('');
  const [factura, setFactura] = useState('');
  const [credito, setCredito] = useState('0');
  const [droguerias, setDroguerias] = useState<string[]>([]);
  useEffect(() => { if (abierto) api<string[]>('/proveedores/lista').then(setDroguerias).catch(() => {}); }, [abierto]);
  const [lineas, setLineas] = useState<LineaCompra[]>([nueva()]);
  const [error, setError] = useState<string | null>(null);
  const cambiar = (i: number, c: Partial<LineaCompra>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...c } : l)));

  return (
    <Sheet open={abierto} onClose={onCerrar} title="Llegó mercancía">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (lineas.some((l) => !l.producto)) { setError('Elige el producto de cada línea'); return; }
        try {
          const r = await api<{ clientesAvisados: number }>('/inventario/compras', {
            body: {
              proveedor, numeroFactura: factura,
              // Sin número de lote se usa la fecha de vencimiento (así se distinguen igual).
              lineas: lineas.map((l) => ({ productoId: l.producto!.id, numeroLote: l.numeroLote.trim() || `S/L-${l.vence.replace(/-/g, '')}`, vence: l.vence, cantidad: Number(l.cantidad), factorVenta: Number(l.factorVenta) || 1, costoUsd: Number(l.costoUsd.replace(',', '.')) || 0 })),
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
          <Campo etiqueta="¿De qué droguería?"><input required list="droguerias" value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ej.: Drolanca" className={claseInput} />
            <datalist id="droguerias">{droguerias.map((d) => <option key={d} value={d} />)}</datalist></Campo>
          <Campo etiqueta="N.º de la factura"><input required value={factura} onChange={(e) => setFactura(e.target.value)} className={claseInput} /></Campo>
        </div>
        <div className="flex flex-col gap-1 text-sm font-semibold">¿Ya la pagaste?
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setCredito('0')} className={clsx('rounded-lg border px-3 py-2.5', credito === '0' ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface')}>Sí, ya la pagué</button>
            <button type="button" onClick={() => setCredito(credito === '0' ? '15' : credito)} className={clsx('rounded-lg border px-3 py-2.5', credito !== '0' ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface')}>No, es a crédito</button>
          </div>
          {credito !== '0' && <label className="mt-1 flex items-center gap-2 font-normal">La pago en <input inputMode="numeric" value={credito} onChange={(e) => setCredito(e.target.value.replace(/\D/g, '') || '1')} className={claseInput + ' w-20 text-center font-mono'} /> días</label>}
        </div>
        {lineas.map((l, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">Producto {i + 1}</span>
              {lineas.length > 1 && <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="text-muted hover:text-bad" aria-label="Quitar línea"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <ElegirProducto valor={l.producto} onElegir={(o) => cambiar(i, { producto: o })} />
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="¿Cuántas llegaron?"><input required inputMode="numeric" value={l.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value.replace(/\D/g, '') })} className={claseInput + ' font-mono'} /></Campo>
              <Campo etiqueta="¿Cuánto costó cada una? ($)" ayuda="Para saber cuánto ganas"><input inputMode="decimal" value={l.costoUsd} onChange={(e) => cambiar(i, { costoUsd: e.target.value.replace(/[^\d.,]/g, '') })} className={claseInput + ' font-mono'} /></Campo>
              <Campo etiqueta="¿Cuándo vencen?" ayuda="Viene impreso en la caja"><input required type="date" value={l.vence} onChange={(e) => cambiar(i, { vence: e.target.value })} className={claseInput} /></Campo>
              <Campo etiqueta="Lote (opcional)" ayuda="Número impreso junto al vencimiento"><input value={l.numeroLote} onChange={(e) => cambiar(i, { numeroLote: e.target.value })} className={claseInput} /></Campo>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-accent">¿Llegó en cajas grandes que se venden por partes?</summary>
              <label className="mt-2 flex flex-wrap items-center gap-2">Cada caja grande trae <input inputMode="numeric" value={l.factorVenta} onChange={(e) => cambiar(i, { factorVenta: e.target.value.replace(/\D/g, '') })} className={claseInput + ' w-20 text-center font-mono'} /> unidades de venta (ej. 10 tiras). Deja 1 si se vende tal cual.</label>
            </details>
          </div>
        ))}
        <Button type="button" icon={<Plus className="h-4 w-4" />} onClick={() => setLineas((ls) => [...ls, nueva()])}>Otro producto</Button>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar: sumar al inventario</Button>
      </form>
    </Sheet>
  );
}
