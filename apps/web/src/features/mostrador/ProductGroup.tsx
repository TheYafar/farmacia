import { clsx } from 'clsx';
import { AlertTriangle, Bell, Plus } from 'lucide-react';
import { useState } from 'react';
import { Alert, Button, Card, Chip, Sheet } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { alergiaQueChoca, bs, usd } from '@/lib/format';
import type { Grupo, Opcion } from '@/lib/tipos';
import { avisar } from '@/store/avisos';
import { useSesion } from '@/store/sesion';
import { useVenta } from '@/store/venta';

export default function ProductGroup({ g }: { g: Grupo }) {
  const agregar = useVenta((s) => s.agregar);
  const cliente = useVenta((s) => s.cliente);
  const tasa = useSesion((s) => s.tasa);
  const [avisarDe, setAvisarDe] = useState<Opcion | null>(null);
  const masBarato = g.opciones.find((o) => o.stockLibre > 0);
  const alergia = cliente ? alergiaQueChoca(cliente.alergias, g.principio) : null;
  const delicado = g.principio.riesgo !== 'NORMAL';

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">{g.principio.nombre} {g.concentracion}</h2>
          <p className="text-sm text-muted">{g.opciones.length === 1 ? '1 opción' : `${g.opciones.length} opciones · de la más barata a la más cara`}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {delicado && <Chip tone="warn">{g.principio.riesgo === 'PSICOTROPICO' ? 'Psicotrópico' : 'Antibiótico'}: necesita permiso</Chip>}
          {alergia && <Chip tone="bad" icon={<AlertTriangle className="h-3.5 w-3.5" />}>El cliente es alérgico</Chip>}
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {g.opciones.map((o) => {
          const noHay = o.stockLibre === 0;
          return (
            <li key={o.id} className={clsx('flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border p-4', noHay ? 'border-dashed border-line bg-surface2' : 'border-line', o === masBarato && g.opciones.length > 1 && 'border-ok/50 bg-ok-soft/30')}>
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{o.nombreComercial}</span>
                  {o === masBarato && g.opciones.length > 1 && <Chip tone="ok">Más barato</Chip>}
                  {o.requiereRecipe && <Chip tone="info">Con récipe</Chip>}
                </div>
                <div className="mt-0.5 text-sm text-muted">
                  {o.laboratorio} · Caja de {o.unidadesPorCaja} · {noHay ? <span className="font-semibold text-bad">No hay</span> : <>Hay {o.stockLibre}</>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xl font-medium tabular">{usd(o.precioUsd)}</div>
                <div className="font-mono text-xs text-muted">{bs(o.precioUsd, tasa)}</div>
              </div>
              <div className="w-full sm:w-auto">
                {noHay ? (
                  <Button size="lg" className="w-full sm:w-60" icon={<Bell className="h-5 w-5" />} onClick={() => setAvisarDe(o)}>Avisar cuando llegue</Button>
                ) : (
                  <Button size="lg" variant="primary" className="w-full sm:w-60" icon={<Plus className="h-5 w-5" />} onClick={() => { agregar(o, g.principio); avisar(`Agregado: ${o.nombreComercial}`, 'ok'); }}>Agregar</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Sheet open={!!avisarDe} onClose={() => setAvisarDe(null)} title="Avisar cuando llegue">
        {avisarDe && (
          <div className="flex flex-col gap-4">
            <p className="text-base">
              <b>{avisarDe.nombreComercial} {avisarDe.concentracion}</b> no hay ahora.
              {cliente ? <> Cuando llegue, le avisamos por WhatsApp a <b>{cliente.nombre.split(' ')[0]}</b> al <span className="font-mono">{cliente.telefono}</span>.</> : ' Primero busca al cliente por su cédula en la cuenta.'}
            </p>
            {masBarato && <p className="rounded-xl bg-ok-soft p-3 text-sm text-ok">También puedes ofrecerle <b>{masBarato.nombreComercial}</b>, que es igual y cuesta <b>{usd(masBarato.precioUsd)}</b>.</p>}
            {!cliente && <Alert tone="info">Escribe la cédula en «Cuenta» y vuelve a tocar «Avisar cuando llegue».</Alert>}
            <Button size="lg" variant="primary" disabled={!cliente} onClick={async () => {
              try {
                await api('/espera', { body: { cedula: cliente!.cedula, productoId: avisarDe.id } });
                avisar(`Anotado: le avisaremos cuando llegue ${avisarDe.nombreComercial}`, 'ok');
                setAvisarDe(null);
              } catch (e) {
                avisar(e instanceof ApiError ? e.message : 'No se pudo anotar', 'bad');
              }
            }}>Sí, avisarle</Button>
          </div>
        )}
      </Sheet>
    </Card>
  );
}
