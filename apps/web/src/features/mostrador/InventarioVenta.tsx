import { clsx } from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { Button, Chip, EmptyState } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { bs, usd } from '@/lib/format';
import { catalogoLocal } from '@/lib/sinConexion';
import type { Grupo, Opcion, Principio } from '@/lib/tipos';
import { avisar } from '@/store/avisos';
import { useSesion } from '@/store/sesion';
import { useVenta } from '@/store/venta';

type Item = Opcion & { principio: Principio };
const POR_PAGINA = 60;

/**
 * Todo el inventario en la pantalla de vender (antes de escribir algo): por categoría, de la A a la Z,
 * con existencia y precio en $ y Bs. Un toque y va a la cuenta.
 */
export default function InventarioVenta({ version }: { version: number }) {
  const agregar = useVenta((s) => s.agregar);
  const enCuenta = useVenta((s) => s.lineas);
  const tasa = useSesion((s) => s.tasa);
  const [items, setItems] = useState<Item[] | null>(null);
  const [categoria, setCategoria] = useState('Todas');
  const [conExistencia, setConExistencia] = useState(true);
  const [ver, setVer] = useState(POR_PAGINA);

  useEffect(() => {
    let vivo = true;
    const aplanar = (gs: Grupo[]) => gs.flatMap((g) => g.opciones.map((o) => ({ ...o, principio: g.principio })))
      .sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial, 'es') || a.concentracion.localeCompare(b.concentracion, 'es'));
    const cargar = async () => {
      try {
        const r = await api<{ grupos: Grupo[] }>('/catalogo/sin-conexion');
        if (vivo) setItems(aplanar(r.grupos));
      } catch (e) {
        // Sin internet: la copia guardada en el equipo.
        if (vivo) { setItems(aplanar(catalogoLocal())); if (!(e instanceof ApiError && e.status === 0)) avisar('No se pudo cargar el inventario', 'bad'); }
      }
    };
    void cargar();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void cargar(); }, 120_000);
    return () => { vivo = false; clearInterval(t); };
  }, [version]);

  const categorias = useMemo(() => ['Todas', ...[...new Set((items ?? []).map((i) => i.categoria ?? 'Medicamentos'))].sort((a, b) => a.localeCompare(b, 'es'))], [items]);
  const lista = useMemo(() => (items ?? []).filter((i) =>
    (categoria === 'Todas' || (i.categoria ?? 'Medicamentos') === categoria) && (!conExistencia || i.stockLibre > 0)), [items, categoria, conExistencia]);
  useEffect(() => setVer(POR_PAGINA), [categoria, conExistencia]);

  if (!items) return <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface2" />)}</div>;
  if (!items.length) return <EmptyState icon={<Package className="h-8 w-8" />} title="Todavía no hay productos">Cárgalos en Catálogo o con Excel en Inventario.</EmptyState>;
  const agotados = items.filter((i) => i.stockLibre === 0).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
          {categorias.map((c) => (
            <button key={c} onClick={() => setCategoria(c)} className={clsx('shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition', categoria === c ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted hover:text-fg')}>{c}</button>
          ))}
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={!conExistencia} onChange={(e) => setConExistencia(!e.target.checked)} className="h-4 w-4" />
          Ver también los agotados ({agotados})
        </label>
      </div>
      <p className="text-sm text-muted">{lista.length} {lista.length === 1 ? 'producto' : 'productos'}{conExistencia ? ' con existencia' : ''}. Escribe arriba para buscar.</p>

      <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {lista.slice(0, ver).map((o) => {
          const noHay = o.stockLibre === 0;
          const poco = !noHay && !!o.stockMinimo && o.stockLibre <= o.stockMinimo;
          const cuantos = enCuenta.find((l) => l.producto.id === o.id)?.cantidad;
          return (
            <li key={o.id} className={clsx('flex flex-col gap-2 rounded-2xl border bg-surface p-4', noHay ? 'border-dashed border-line opacity-70' : cuantos ? 'border-accent ring-2 ring-accent/15' : 'border-line')}>
              <div className="min-w-0">
                <div className="font-semibold leading-snug">{o.nombreComercial} <span className="font-normal text-muted">{o.concentracion}</span></div>
                <div className="truncate text-xs text-muted">{o.laboratorio} · {o.forma} · caja de {o.unidadesPorCaja}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {o.principio.riesgo !== 'NORMAL' && <Chip tone="warn">{o.principio.riesgo === 'PSICOTROPICO' ? 'Psicotrópico' : 'Antibiótico'}</Chip>}
                {o.requiereRecipe && <Chip tone="info">Con récipe</Chip>}
                {noHay ? <Chip tone="bad">Agotado</Chip> : <Chip tone={poco ? 'warn' : 'neutral'}>Hay {o.stockLibre}</Chip>}
              </div>
              <div className="mt-auto flex items-end justify-between gap-2">
                <div>
                  <div className="font-mono text-lg font-medium tabular">{usd(o.precioUsd)}</div>
                  <div className="font-mono text-xs text-muted">{bs(o.precioUsd, tasa)}</div>
                </div>
                <Button variant={noHay ? 'secondary' : 'primary'} disabled={noHay || (!!cuantos && cuantos >= o.stockLibre)} icon={<Plus className="h-4 w-4" />}
                  onClick={() => { agregar(o, o.principio); avisar(`Agregado: ${o.nombreComercial}`, 'ok'); }}>
                  {cuantos ? `Agregar (${cuantos})` : 'Agregar'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {lista.length > ver && <Button className="self-center" onClick={() => setVer(ver + POR_PAGINA)}>Ver {Math.min(POR_PAGINA, lista.length - ver)} más</Button>}
    </div>
  );
}
