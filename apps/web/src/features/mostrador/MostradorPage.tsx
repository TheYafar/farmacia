import { ScanBarcode, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, EmptyState, SearchInput, Sheet } from '@/components/ui';
import { buscar } from '@/data/catalog';
import { productos } from '@/data/mock';
import { useApp } from '@/store/useApp';
import ProductGroup from './ProductGroup';
import { CartBody, CobroSheet, MobileCartBar, useCartSummary, useCobrarShortcut } from './Cart';

const SUGERENCIAS = ['acetaminofén', 'losartán', 'amoxicilina', 'ibuprofeno'];

export default function MostradorPage() {
  const [q, setQ] = useState('acetaminofén');
  const [cartOpen, setCartOpen] = useState(false);
  const [cobroOpen, setCobroOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const grupos = useMemo(() => buscar(q), [q]);
  const addToCart = useApp((s) => s.addToCart);
  const toast = useApp((s) => s.toast);
  const { unidades, bloqueos } = useCartSummary();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const abrirCobro = useCallback(() => { setCartOpen(false); setCobroOpen(true); }, []);
  useCobrarShortcut(abrirCobro, unidades > 0 && bloqueos.length === 0);

  // Un lector USB "escribe" el código y envía Enter: si coincide exacto, va directo al carrito.
  const onEnter = () => {
    const hit = productos.find((p) => p.codigoBarras === q.trim());
    if (hit) {
      if (hit.stockLibre > 0) { addToCart(hit); toast(`Escaneado: ${hit.nombreComercial}`, 'ok'); } else toast(`${hit.nombreComercial} está agotado`, 'bad');
      setQ('');
    }
  };

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex gap-2">
          <SearchInput
            ref={inputRef}
            id="buscar-medicamento"
            className="flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onEnter()}
            onClear={() => setQ('')}
            placeholder="¿Qué medicamento busca?"
            aria-label="Buscar medicamento"
            shortcut="F2"
            autoComplete="off"
          />
          <button className="grid w-12 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-fg xl:hidden" aria-label="Escanear código de barras" onClick={() => toast('Aquí se abre la cámara para escanear', 'info')}>
            <ScanBarcode className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>Ejemplos:</span>
          {SUGERENCIAS.map((s) => (
            <button key={s} onClick={() => setQ(s)} className="rounded-full border border-dashed border-line px-2.5 py-1 hover:border-accent hover:text-accent">{s}</button>
          ))}
        </div>

        {q.trim() === '' ? (
          <EmptyState icon={<Search className="h-8 w-8" />} title="¿Qué medicamento busca el cliente?">
            Escribe el nombre o escanea la caja.
          </EmptyState>
        ) : grupos.length === 0 ? (
          <EmptyState icon={<Search className="h-8 w-8" />} title={`No encontramos «${q}»`}>
            Revisa cómo está escrito o prueba con otro nombre.
          </EmptyState>
        ) : (
          grupos.map((g) => <ProductGroup key={g.key} g={g} />)
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
      <CobroSheet open={cobroOpen} onClose={() => setCobroOpen(false)} />
    </div>
  );
}
