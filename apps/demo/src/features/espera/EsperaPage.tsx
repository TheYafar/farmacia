import { clsx } from 'clsx';
import { Check, Clock, MessageCircle, Package, Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Chip, PageHeader } from '@/components/ui';
import type { EstadoEspera, SolicitudEspera } from '@/data/types';
import { bs, cedula, usd } from '@/lib/format';
import { useApp, useRole } from '@/store/useApp';

const COLS: { id: EstadoEspera[]; title: string; tone: 'neutral' | 'warn' | 'ok'; hint: string }[] = [
  { id: ['en_espera'], title: 'Esperando que llegue', tone: 'neutral', hint: 'Se avisa por WhatsApp en el orden en que se anotaron' },
  { id: ['notificado'], title: 'Ya llegó, falta pagar', tone: 'warn', hint: 'Se le envió el precio y los datos de Pago Móvil' },
  { id: ['custodia'], title: 'Pagado, en la gaveta', tone: 'ok', hint: 'Guardado con su nombre hasta que lo busque' },
  { id: ['entregado', 'expirado'], title: 'Terminados', tone: 'neutral', hint: 'Entregados o que no pagaron a tiempo' },
];

function useCountdown(iso?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (!iso) return '';
  const m = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function Ticket_({ w }: { w: SolicitudEspera }) {
  const tasa = useApp((s) => s.tasa);
  const mover = useApp((s) => s.moverEspera);
  const toast = useApp((s) => s.toast);
  const role = useRole();
  const left = useCountdown(w.venceReserva);
  const [ref, setRef] = useState('');

  return (
    <li className={clsx('flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-3 text-sm', (w.estado === 'entregado' || w.estado === 'expirado') && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0">{w.producto}</b>
        {w.estado === 'expirado' && <Chip>No pagó a tiempo</Chip>}
        {w.estado === 'entregado' && <Chip tone="ok">Entregado</Chip>}
      </div>
      <span className="text-xs text-muted">{w.pacienteNombre} · {cedula(w.cedula)}</span>
      {w.estado === 'en_espera' && <span className="text-xs text-muted">Lo pidió el {w.fechaSolicitud}</span>}
      {w.estado === 'notificado' && (
        <>
          <Chip tone="warn" icon={<Clock className="h-3 w-3" />} className="self-start">Tiene {left} para pagar</Chip>
          <span className="font-mono text-xs">{usd(w.precioUsd)} · {bs(w.precioUsd, tasa)}</span>
          <div className="flex gap-1.5">
            <input id={`ref-${w.id}`} value={ref} onChange={(e) => setRef(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Nº de referencia" inputMode="numeric" className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 font-mono text-xs outline-none focus:border-accent" />
            <Button size="sm" variant="primary" disabled={ref.length < 4} onClick={() => { mover(w.id, 'custodia', { refPagoMovil: ref, gaveta: 'B-1' }); toast('Pago confirmado. Imprime el ticket de custodia', 'ok'); }}>Ya pagó</Button>
          </div>
        </>
      )}
      {w.estado === 'custodia' && (
        <>
          <span className="text-xs">Gaveta <b>{w.gaveta}</b> · ref. <span className="font-mono">{w.refPagoMovil}</span></span>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" icon={<Ticket className="h-4 w-4" />}>Imprimir etiqueta</Button>
            <Button size="sm" variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => mover(w.id, 'entregado')}>Ya lo buscó</Button>
          </div>
        </>
      )}
      {w.estado === 'en_espera' && role === 'admin' && (
        <Button size="sm" className="self-start" icon={<MessageCircle className="h-4 w-4" />} onClick={() => { mover(w.id, 'notificado', { venceReserva: new Date(Date.now() + 3 * 3_600_000).toISOString() }); toast('WhatsApp enviado (simulado)', 'ok'); }}>Llegó: avisarle</Button>
      )}
    </li>
  );
}

export default function EsperaPage() {
  const espera = useApp((s) => s.espera);
  const [tab, setTab] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Lista de espera" subtitle="Medicamentos que los clientes pidieron y no había" />
      {/* Teléfono: pestañas por estado */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface2 p-1 md:hidden" role="tablist">
        {COLS.map((c, i) => (
          <button key={c.title} role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className={clsx('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold', tab === i ? 'bg-surface shadow-sm' : 'text-muted')}>
            {c.title}<span className="font-mono text-xs">{espera.filter((w) => c.id.includes(w.estado)).length}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((c, i) => {
          const items = espera.filter((w) => c.id.includes(w.estado));
          return (
            <section key={c.title} className={clsx('flex min-w-0 flex-col gap-2 rounded-xl bg-surface2 p-2.5', tab !== i && 'hidden md:flex')}>
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold">{c.title}</h2>
                <Chip tone={c.tone}>{items.length}</Chip>
              </div>
              <p className="px-1 text-xs text-muted">{c.hint}</p>
              <ul className="flex flex-col gap-2">
                {items.length ? items.map((w) => <Ticket_ key={w.id} w={w} />) : (
                  <li className="flex flex-col items-center gap-1 py-6 text-xs text-muted"><Package className="h-5 w-5" />Sin casos</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
