import { Printer } from 'lucide-react';
import type { MetodoPago } from '@farmacia/shared';
import { Button, Sheet } from '@/components/ui';
import { cedula, num2 } from '@/lib/format';
import type { Venta } from '@/lib/tipos';
import { useCaja } from '@/store/caja';

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  PAGO_MOVIL: 'Pago Móvil', PUNTO_DE_VENTA: 'Punto de venta', EFECTIVO_USD: 'Efectivo $', EFECTIVO_BS: 'Efectivo Bs',
};

/** Comprobante de la venta (no fiscal), listo para impresora térmica de 80 mm. */
export default function Ticket({ venta, onCerrar }: { venta: Venta | null; onCerrar: () => void }) {
  const farmacia = useCaja((s) => s.farmacia);
  if (!venta) return null;
  const f = new Date(venta.creadaEn);
  return (
    <Sheet open onClose={onCerrar} title={`Venta N.º ${venta.numero}`}>
      <div className="flex flex-col gap-4">
        <div id="ticket" className="mx-auto w-full max-w-[320px] rounded-lg border border-line bg-white p-4 font-mono text-[12px] leading-snug text-black">
          <div className="text-center">
            <div className="text-[14px] font-bold">{farmacia.nombre}</div>
            {farmacia.rif && <div>RIF {farmacia.rif}</div>}
            {farmacia.direccion && <div>{farmacia.direccion}</div>}
            {farmacia.telefono && <div>Tel. {farmacia.telefono}</div>}
            <div className="mt-1">COMPROBANTE N.º {venta.numero} · NO FISCAL</div>
            <div>{f.toLocaleDateString('es-VE')} {f.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</div>
            {venta.cajero && <div>Atendió: {venta.cajero.nombre}</div>}
            {venta.cedula && <div>Cliente: {cedula(venta.cedula)}</div>}
          </div>
          <div className="my-2 border-t border-dashed border-black" />
          {venta.lineas.map((l, i) => (
            <div key={i}>
              <div>{l.producto.nombreComercial} {l.producto.concentracion ?? ''}</div>
              <div className="flex justify-between"><span>{l.cantidad} x {num2(l.precioUsd)} $</span><span>{num2(Number(l.precioUsd) * l.cantidad)} $</span></div>
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-black" />
          <div className="flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>{num2(venta.totalUsd)} $</span></div>
          <div className="flex justify-between"><span>Total Bs</span><span>{num2(venta.totalBs)}</span></div>
          <div className="flex justify-between"><span>Tasa</span><span>{num2(venta.tasa)} Bs/$</span></div>
          <div className="my-2 border-t border-dashed border-black" />
          {venta.pagos.map((p) => (
            <div key={p.id} className="flex justify-between"><span>{NOMBRE_METODO[p.metodo]}{p.referencia ? ` ${p.referencia}` : ''}</span><span>{num2(p.monto)} {p.moneda === 'USD' ? '$' : 'Bs'}</span></div>
          ))}
          {venta.vueltoMoneda && <div className="flex justify-between font-bold"><span>Vuelto</span><span>{num2(venta.vueltoMonto)} {venta.vueltoMoneda === 'USD' ? '$' : 'Bs'}</span></div>}
          <div className="mt-2 text-center">¡Gracias por su compra!</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" icon={<Printer className="h-5 w-5" />} onClick={() => window.print()}>Imprimir</Button>
          <Button size="lg" variant="primary" onClick={onCerrar}>Nueva venta</Button>
        </div>
      </div>
    </Sheet>
  );
}
