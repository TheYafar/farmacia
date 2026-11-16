import { clsx } from 'clsx';
import { FileUp, PackageOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Card, Chip, Locked, PageHeader } from '@/components/ui';
import { productoById } from '@/data/catalog';
import { lotes } from '@/data/mock';
import { daysUntil } from '@/lib/format';
import { useApp, useRole } from '@/store/useApp';

const sem = (d: number) =>
  d <= 30 ? { tone: 'bad' as const, txt: 'Vence este mes' } : d <= 90 ? { tone: 'warn' as const, txt: 'Vence pronto' } : { tone: 'ok' as const, txt: 'Bien' };

const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

export default function InventarioPage() {
  const role = useRole();
  const toast = useApp((s) => s.toast);
  const [filtro, setFiltro] = useState<'todos' | '30' | '90'>('todos');
  const rows = useMemo(() => lotes
    .map((l) => ({ ...l, dias: daysUntil(l.vence), prod: productoById(l.productoId)! }))
    .filter((l) => filtro === 'todos' || l.dias <= Number(filtro))
    .sort((a, b) => a.dias - b.dias), [filtro]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inventario"
        subtitle="Se vende primero lo que vence antes"
        actions={role === 'admin' ? <Button variant="primary" icon={<FileUp className="h-4 w-4" />} onClick={() => toast('Aquí se carga la factura de la droguería', 'info')}>Cargar compra</Button> : <Locked>Solo el dueño carga compras</Locked>}
      />
      <div className="flex gap-1 self-start rounded-xl bg-surface2 p-1">
        {([['todos', 'Todo'], ['90', 'Vence en 3 meses'], ['30', 'Vence este mes']] as const).map(([v, t]) => (
          <button key={v} onClick={() => setFiltro(v)} className={clsx('rounded-lg px-3 py-1.5 text-sm font-semibold', filtro === v ? 'bg-surface shadow-sm' : 'text-muted')}>{t}</button>
        ))}
      </div>

      {/* Tabla en tablet y PC, tarjetas en teléfono */}
      <Card className="hidden md:flex">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-2 py-2 font-semibold">Producto</th><th className="px-2 py-2 font-semibold">Lote</th><th className="px-2 py-2 font-semibold">Vence</th><th className="px-2 py-2 font-semibold">Estado</th><th className="px-2 py-2 font-semibold">Cuántas hay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const s = sem(l.dias);
                const tot = l.libre + l.reservado;
                return (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="px-2 py-2.5"><div className="font-semibold">{l.prod.nombreComercial} {l.prod.concentracion}</div><div className="text-xs text-muted">{l.prod.laboratorio}</div></td>
                    <td className="px-2 py-2.5 font-mono">{l.numero}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">{fmtFecha(l.vence)} <span className="text-xs text-muted">({l.dias} d)</span></td>
                    <td className="px-2 py-2.5"><Chip tone={s.tone}>{s.txt}</Chip></td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-2 min-w-[90px] flex-1 overflow-hidden rounded-full bg-surface2">
                          <span className="bg-accent" style={{ width: `${(l.libre / tot) * 100}%` }} />
                          <span className="bg-warn" style={{ width: `${(l.reservado / tot) * 100}%` }} />
                        </div>
                        <span className="font-mono text-xs">{l.libre} {l.reservado ? `+ ${l.reservado} apartadas` : ''}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((l) => {
          const s = sem(l.dias);
          return (
            <li key={l.id} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-3 text-sm">
              <div className="flex items-start justify-between gap-2"><b>{l.prod.nombreComercial} {l.prod.concentracion}</b><Chip tone={s.tone}>{s.txt}</Chip></div>
              <span className="text-xs text-muted">Lote <span className="font-mono">{l.numero}</span> · vence {fmtFecha(l.vence)} · hay {l.libre}{l.reservado ? ` + ${l.reservado} apartadas` : ''}</span>
            </li>
          );
        })}
      </ul>

      <Card>
        <div className="flex items-center gap-2"><PackageOpen className="h-5 w-5 text-muted" /><h2 className="text-base font-bold">Última compra recibida</h2></div>
        <ul className="flex flex-col divide-y divide-dashed divide-line text-sm">
          <li className="flex flex-wrap items-center justify-between gap-2 py-2"><span><b>Antigripal</b> · 1 caja grande</span><span className="text-muted">se vende como 10 tiras</span></li>
          <li className="flex flex-wrap items-center justify-between gap-2 py-2"><span><b>Tylenol 500 mg</b> · 6 cajas</span><Chip tone="warn">3 clientes lo esperaban: ya se les avisó</Chip></li>
          <li className="flex flex-wrap items-center justify-between gap-2 py-2"><span><b>Amoxicilina 500 mg</b> · 24 cajas · lote L2405F</span><Chip tone="ok">Bien</Chip></li>
        </ul>
      </Card>
    </div>
  );
}
