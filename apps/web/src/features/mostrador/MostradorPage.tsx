import { ScanBarcode, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Escaner } from '@/features/gestion/Gestion';
import InventarioVenta from './InventarioVenta';
import { buscarLocal } from '@/lib/sinConexion';
import { useConexion } from '@/lib/api';
import { Card, Cargando, EmptyState, ErrorCarga, SearchInput, Sheet } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Grupo, Opcion, Principio } from '@/lib/tipos';
import { avisar } from '@/store/avisos';
import { useSesion } from '@/store/sesion';
import { useVenta } from '@/store/venta';
import ProductGroup from './ProductGroup';
import AbrirCaja from '../caja/AbrirCaja';
import Ticket from '../caja/Ticket';
import { useCaja } from '@/store/caja';
import type { Venta } from '@/lib/tipos';
import { CartBody, CobroSheet, MobileCartBar, useCobrarShortcut, useResumenVenta } from './Cart';

export default function MostradorPage() {
  const [q, setQ] = useState('');
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [corregido, setCorregido] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cobroOpen, setCobroOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const agregar = useVenta((s) => s.agregar);
  const tasa = useSesion((s) => s.tasa);
  const { unidades } = useResumenVenta();
  const turno = useCaja((s) => s.turno);
  const cajaCargada = useCaja((s) => s.cargada);
  const cargarCaja = useCaja((s) => s.cargar);
  const [ticket, setTicket] = useState<Venta | null>(null);
  // Cada venta cobrada vuelve a cargar el inventario (la existencia cambió).
  const [vendidas, setVendidas] = useState(0);
  useEffect(() => { void cargarCaja(); }, [cargarCaja]);

  // Busca mientras escribe, esperando 250 ms después de la última tecla.
  useEffect(() => {
    if (!q.trim()) { setGrupos(null); return; }
    let vivo = true;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ grupos: Grupo[]; corregido?: string }>(`/catalogo/buscar?q=${encodeURIComponent(q)}`);
        if (vivo) { setGrupos(r.grupos); setCorregido(r.corregido ?? null); setError(null); }
      } catch (e) {
        // Sin internet: se busca en la copia del catálogo guardada en este equipo.
        if (vivo && e instanceof ApiError && e.status === 0) { setGrupos(buscarLocal(q)); setError(null); }
        else if (vivo) setError(e instanceof ApiError ? e.message : 'No se pudo buscar');
      } finally {
        if (vivo) setCargando(false);
      }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const abrirCobro = useCallback(() => { setCartOpen(false); setCobroOpen(true); }, []);
  useCobrarShortcut(abrirCobro, unidades > 0 && !!tasa && !!turno);

  // El lector USB "escribe" el código y envía Enter: si es un código exacto, va directo a la cuenta.
  const onEnter = async (leido?: string) => {
    const codigo = (leido ?? q).trim();
    if (!/^\d{8,14}$/.test(codigo)) return;
    if (!useConexion.getState().enLinea) {
      const g = buscarLocal(codigo).find((x) => x.opciones.some((o) => o.codigoBarras === codigo));
      const o = g?.opciones.find((x) => x.codigoBarras === codigo);
      if (g && o) { agregar(o, g.principio); avisar(`Escaneado: ${o.nombreComercial}`, 'ok'); setQ(''); } else avisar('Código no encontrado en el catálogo guardado', 'bad');
      return;
    }
    try {
      const p = await api<Opcion & { principioActivo: Principio }>(`/catalogo/codigo/${codigo}`);
      const r = await api<{ grupos: Grupo[] }>(`/catalogo/buscar?q=${codigo}`);
      const opcion = r.grupos.flatMap((g) => g.opciones).find((o) => o.id === p.id);
      if (!opcion || opcion.stockLibre === 0) { avisar(`${p.nombreComercial}: no hay`, 'bad'); return; }
      agregar(opcion, r.grupos.find((g) => g.opciones.includes(opcion))!.principio);
      avisar(`Escaneado: ${p.nombreComercial}`, 'ok');
      setQ('');
    } catch (e) {
      avisar(e instanceof ApiError ? e.message : 'Código no encontrado', 'bad');
    }
  };

  if (!cajaCargada) return <Cargando />;
  if (!turno) return <div className="py-6"><AbrirCaja /></div>;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex gap-2">
          <SearchInput
            ref={inputRef}
            id="buscar-medicamento"
            className="flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void onEnter(); }}
            onClear={() => setQ('')}
            placeholder="¿Qué medicamento busca?"
            aria-label="Buscar medicamento"
            shortcut="F2"
            autoComplete="off"
            autoFocus
          />
          <Escaner onCodigo={(c) => void onEnter(c)} />
          <button className="grid w-12 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-fg xl:hidden" aria-label="Escanear código de barras" onClick={() => avisar('El escáner con la cámara llega en la siguiente versión. Escribe el código o usa el lector', 'info')}>
            <ScanBarcode className="h-5 w-5" />
          </button>
        </div>

        {error ? <ErrorCarga mensaje={error} /> : !q.trim() ? <InventarioVenta version={vendidas} /> : cargando && !grupos ? <Cargando texto="Buscando…" /> : grupos && grupos.length === 0 ? (
          <EmptyState icon={<Search className="h-8 w-8" />} title={`No encontramos «${q}»`}>
            Revisa cómo está escrito o prueba con otro nombre.
          </EmptyState>
        ) : (
          <>
            {corregido && grupos?.length ? <p className="text-sm text-muted">No hay «{q.trim()}». Mostrando resultados de <button type="button" className="font-semibold text-accent underline" onClick={() => setQ(corregido)}>{corregido}</button></p> : null}
            {grupos?.map((g) => <ProductGroup key={`${g.principio.id}|${g.concentracion}|${g.forma}`} g={g} />)}
          </>
        )}
      </div>

      <Card as="aside" className="sticky top-4 hidden self-start md:flex">
        <h2 className="text-lg font-bold">Cuenta</h2>
        <CartBody onCobrar={abrirCobro} />
      </Card>

      <MobileCartBar onOpen={() => setCartOpen(true)} />
      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Cuenta">
        <CartBody onCobrar={abrirCobro} />
      </Sheet>
      <CobroSheet open={cobroOpen} onClose={() => setCobroOpen(false)} onVendida={(v) => { setTicket(v); setVendidas((n) => n + 1); }} />
      <Ticket venta={ticket} auto onCerrar={() => setTicket(null)} />
    </div>
  );
}
