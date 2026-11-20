import { useState } from 'react';
import { Button, Card, PageHeader } from '@/components/ui';
import { demandaInsatisfecha, ventasSemana } from '@/data/mock';
import { bs, num2, usd } from '@/lib/format';
import { useApp } from '@/store/useApp';

function Kpi({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: 'bad' }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-4">
      <span className="text-xs text-muted">{k}</span>
      <span className={`font-mono text-2xl font-medium tabular ${tone === 'bad' ? 'text-bad' : ''}`}>{v}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

function VentasChart() {
  const max = Math.max(...ventasSemana.map((d) => d.usd));
  const top = Math.ceil(max / 500) * 500;
  const W = 520, H = 180, pl = 40, pb = 22, pt = 8;
  const x = (i: number) => pl + (i * (W - pl - 10)) / (ventasSemana.length - 1);
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / top);
  const line = ventasSemana.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.usd)}`).join(' ');
  const area = `${line} L${x(ventasSemana.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = Array.from({ length: top / 500 + 1 }, (_, i) => i * 500);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ventas de la semana en dólares">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - 10} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth="1" />
          <text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="rgb(var(--muted))" fontFamily="JetBrains Mono, monospace">{t}</text>
        </g>
      ))}
      <path d={area} fill="rgb(var(--accent) / 0.12)" />
      <path d={line} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" strokeLinejoin="round" />
      {ventasSemana.map((d, i) => (
        <g key={d.dia}>
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="rgb(var(--muted))">{d.dia}</text>
          {i === ventasSemana.length - 1 && <circle cx={x(i)} cy={y(d.usd)} r="4.5" fill="rgb(var(--accent))" stroke="rgb(var(--surface))" strokeWidth="2" />}
        </g>
      ))}
    </svg>
  );
}

export default function PanelPage() {
  const tasa = useApp((s) => s.tasa);
  const actualizada = useApp((s) => s.tasaActualizada);
  const setTasa = useApp((s) => s.setTasa);
  const toast = useApp((s) => s.toast);
  const espera = useApp((s) => s.espera);
  const [nueva, setNueva] = useState(num2(tasa));
  const max = demandaInsatisfecha[0]!.veces;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Resumen de hoy" subtitle="Cómo va la farmacia (datos de ejemplo)" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi k="Vendido hoy" v={usd(1284)} sub={bs(1284, tasa)} />
        <Kpi k="Pagos Móvil por revisar" v={String(espera.filter((w) => w.estado === 'custodia').length + 3)} sub="confírmalos en el banco" />
        <Kpi k="Vencen este mes" v="2" sub="productos para devolver" tone="bad" />
        <Kpi k="Clientes esperando" v={String(espera.filter((w) => w.estado === 'en_espera').length)} sub="pidieron algo que no había" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-bold">Ventas de la semana ($)</h2>
          <VentasChart />
        </Card>
        <Card>
          <div>
            <h2 className="text-base font-bold">Lo que más piden y no hay</h2>
            <p className="text-xs text-muted">Veces que lo pidieron este mes. Conviene comprarlo.</p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {demandaInsatisfecha.map((d) => (
              <li key={d.producto} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)_28px] items-center gap-3 text-sm">
                <span className="truncate">{d.producto}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface2"><span className="block h-full rounded-full bg-accent" style={{ width: `${(d.veces / max) * 100}%` }} /></span>
                <span className="text-right font-mono tabular">{d.veces}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-base font-bold">Precio del dólar hoy</h2>
          <div className="flex items-baseline gap-2"><span className="font-mono text-3xl tabular">{num2(tasa)}</span><span className="text-muted">Bs por dólar</span></div>
          <p className="text-xs text-muted">Cambiado a las {actualizada}. Al guardar, los precios en bolívares se actualizan solos.</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = parseFloat(nueva.replace(/\./g, '').replace(',', '.')); if (v > 0) { setTasa(v); toast('Tasa actualizada', 'ok'); } }}>
            <input id="tasa" value={nueva} onChange={(e) => setNueva(e.target.value)} inputMode="decimal" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono outline-none focus:border-accent" />
            <Button type="submit" variant="primary">Guardar</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
