import { clsx } from 'clsx';
import { AlertTriangle, Bell, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Chip, Sheet } from '@/components/ui';
import { choqueAlergia, type GrupoBioequivalente } from '@/data/catalog';
import type { Producto } from '@/data/types';
import { bs, usd } from '@/lib/format';
import { useApp } from '@/store/useApp';

export default function ProductGroup({ g }: { g: GrupoBioequivalente }) {
  const addToCart = useApp((s) => s.addToCart);
  const anotarEspera = useApp((s) => s.anotarEspera);
  const paciente = useApp((s) => s.paciente);
  const tasa = useApp((s) => s.tasa);
  const toast = useApp((s) => s.toast);
  const [avisar, setAvisar] = useState<Producto | null>(null);
  const masBarato = g.opciones.find((o) => o.stockLibre > 0);

  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="text-lg font-bold">{g.principio} {g.concentracion}</h2>
        <p className="text-sm text-muted">{g.opciones.length === 1 ? '1 opción' : `${g.opciones.length} opciones · de la más barata a la más cara`}</p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {g.opciones.map((o) => {
          const noHay = o.stockLibre === 0;
          const alergia = choqueAlergia(o, paciente);
          return (
            <li key={o.id} className={clsx('flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border p-4', noHay ? 'border-dashed border-line bg-surface2' : 'border-line', o === masBarato && g.opciones.length > 1 && 'border-ok/50 bg-ok-soft/30')}>
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{o.nombreComercial}</span>
                  {o === masBarato && g.opciones.length > 1 && <Chip tone="ok">Más barato</Chip>}
                </div>
                <div className="mt-0.5 text-sm text-muted">
                  Caja de {o.unidadesPorCaja} · {noHay ? <span className="font-semibold text-bad">No hay</span> : <>Hay {o.stockLibre}</>}
                </div>
                {alergia && <div className="mt-1.5"><Chip tone="bad" icon={<AlertTriangle className="h-3.5 w-3.5" />}>El cliente es alérgico</Chip></div>}
              </div>
              <div className="text-right">
                <div className="font-mono text-xl font-medium tabular">{usd(o.precioUsd)}</div>
                <div className="font-mono text-xs text-muted">{bs(o.precioUsd, tasa)}</div>
              </div>
              <div className="w-full sm:w-auto">
                {noHay ? (
                  <Button size="lg" className="w-full sm:w-60" icon={<Bell className="h-5 w-5" />} onClick={() => setAvisar(o)}>Avisar cuando llegue</Button>
                ) : (
                  <Button size="lg" variant="primary" className="w-full sm:w-60" icon={<Plus className="h-5 w-5" />} onClick={() => { addToCart(o); toast(`Agregado: ${o.nombreComercial}`, 'ok'); }}>Agregar</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Sheet open={!!avisar} onClose={() => setAvisar(null)} title="Avisar cuando llegue">
        {avisar && (
          <div className="flex flex-col gap-4">
            <p className="text-base">
              <b>{avisar.nombreComercial} {avisar.concentracion}</b> no hay ahora.
              {paciente ? <> Cuando llegue, le enviamos un WhatsApp a <b>{paciente.nombre.split(' ')[0]}</b> al <span className="font-mono">{paciente.telefono}</span>.</> : ' Primero escribe la cédula del cliente.'}
            </p>
            {masBarato && <p className="rounded-xl bg-ok-soft p-3 text-sm text-ok">También puedes ofrecerle <b>{masBarato.nombreComercial}</b>, que es igual y cuesta <b>{usd(masBarato.precioUsd)}</b>.</p>}
            <Button size="lg" variant="primary" disabled={!paciente} onClick={() => { anotarEspera(`${avisar.nombreComercial} ${avisar.concentracion}`, avisar.precioUsd); setAvisar(null); }}>Sí, avisarle</Button>
          </div>
        )}
      </Sheet>
    </Card>
  );
}
