import { Printer } from 'lucide-react';
import type { MetodoPago } from '@farmacia/shared';
import { Button, Sheet } from '@/components/ui';
import { cedula, num2 } from '@/lib/format';
import type { Venta } from '@/lib/tipos';
import { useEffect, useRef } from 'react';
import { useCaja } from '@/store/caja';
import { useConfig } from '@/store/config';

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  PAGO_MOVIL: 'Pago Móvil', PUNTO_DE_VENTA: 'Punto de venta', EFECTIVO_USD: 'Efectivo $', EFECTIVO_BS: 'Efectivo Bs',
};

/** Comprobante de la venta (no fiscal), listo para impresora térmica de 80 mm. */
export default function Ticket({ venta, onCerrar, auto }: { venta: Venta | null; onCerrar: () => void; auto?: boolean }) {
  const farmaciaEnv = useCaja((s) => s.farmacia);
  const cfg = useConfig((s) => s.config);
  const farmacia = cfg?.farmacia ?? farmaciaEnv;
  const ancho = cfg?.ticketAncho ?? 80;
  const letra = cfg?.ticketLetra ?? 12;
  const copias = cfg?.ticketCopias ?? 1;
  // Imprimir solo al cobrar (si está activado en Configuración).
  const impreso = useRef(false);
  useEffect(() => {
    if (auto && venta && cfg?.ticketAuto && !impreso.current) { impreso.current = true; setTimeout(() => window.print(), 300); }
  }, [auto, venta, cfg?.ticketAuto]);
  if (!venta) return null;
  const f = new Date(venta.creadaEn);
  const fuente = (venta as Venta & { tasaFuente?: string | null }).tasaFuente;
  const contenido = (
    <>
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
          {Number(v2(venta).descuentoUsd) > 0 && <div className="flex justify-between"><span>Descuento {Number(v2(venta).descuentoPct)} %{v2(venta).descuentoMotivo ? ` (${v2(venta).descuentoMotivo})` : ''}</span><span>-{num2(v2(venta).descuentoUsd!)} $</span></div>}
          {Number(v2(venta).ivaUsd) > 0 && <div className="flex justify-between"><span>IVA</span><span>{num2(v2(venta).ivaUsd!)} $</span></div>}
          {Number(v2(venta).igtfUsd) > 0 && <div className="flex justify-between"><span>IGTF</span><span>{num2(v2(venta).igtfUsd!)} $</span></div>}
          <div className="flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>{num2(venta.totalUsd)} $</span></div>
          {cfg?.ticketMostrarBs !== false && <div className="flex justify-between"><span>Total Bs</span><span>{num2(venta.totalBs)}</span></div>}
          {cfg?.ticketMostrarTasa !== false && <><div className="flex justify-between"><span>Tasa</span><span>{num2(venta.tasa)} Bs</span></div>{fuente && <div className="text-right text-[0.85em]">{fuente}</div>}</>}
          <div className="my-2 border-t border-dashed border-black" />
          {venta.pagos.map((p) => (
            <div key={p.id} className="flex justify-between"><span>{NOMBRE_METODO[p.metodo]}{p.referencia ? ` ${p.referencia}` : ''}</span><span>{num2(p.monto)} {p.moneda === 'USD' ? '$' : 'Bs'}</span></div>
          ))}
          {venta.vueltoMoneda && <div className="flex justify-between font-bold"><span>Vuelto</span><span>{num2(venta.vueltoMonto)} {venta.vueltoMoneda === 'USD' ? '$' : 'Bs'}</span></div>}
          {cfg?.ticketPie ? <div className="mt-2 whitespace-pre-line text-center">{cfg.ticketPie}</div> : <div className="mt-2 text-center">¡Gracias por su compra!</div>}
    </>
  );
  return (
    <Sheet open onClose={onCerrar} title={`Venta N.º ${venta.numero}`}>
      <style>{`@media print { @page { size: ${ancho}mm auto; margin: 0; } #ticket { width: ${ancho - 6}mm !important; font-size: ${letra}px !important; } }`}</style>
      <div className="flex flex-col gap-4">
        <div id="ticket" className="mx-auto w-full rounded-lg border border-line bg-white p-4 font-mono leading-snug text-black" style={{ maxWidth: ancho === 58 ? 240 : 320, fontSize: letra }}>
          {contenido}
          {Array.from({ length: copias - 1 }, (_, i) => <div key={i} className="hidden break-before-page pt-2 print:block">{contenido}</div>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" icon={<Printer className="h-5 w-5" />} onClick={() => window.print()}>Imprimir</Button>
          <Button size="lg" variant="primary" onClick={onCerrar}>Nueva venta</Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Campos que agregó el servidor después (descuento, IVA, IGTF); pueden faltar en ventas antiguas. */
const v2 = (v: Venta) => v as Venta & { descuentoUsd?: string; descuentoPct?: string; descuentoMotivo?: string | null; ivaUsd?: string; igtfUsd?: string };
