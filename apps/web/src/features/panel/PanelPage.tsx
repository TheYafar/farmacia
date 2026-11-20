import { useState } from 'react';
import { Button, Card, Cargando, ErrorCarga, PageHeader } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { bs, num2, usd } from '@/lib/format';
import type { Resumen } from '@/lib/tipos';
import { useCargar } from '@/lib/useCargar';
import { avisar } from '@/store/avisos';
import { useSesion } from '@/store/sesion';

function Kpi({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: 'bad' }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-4">
      <span className="text-xs text-muted">{k}</span>
      <span className={`font-mono text-2xl font-medium tabular ${tone === 'bad' ? 'text-bad' : ''}`}>{v}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function VentasChart({ semana }: { semana: Resumen['semana'] }) {
  // Siempre 7 días, aunque alguno no tenga ventas.
  const hoy = new Date(new Date().toISOString().slice(0, 10));
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoy.getTime() - (6 - i) * 86_400_000);
    const v = semana.find((s) => s.dia.slice(0, 10) === d.toISOString().slice(0, 10));
    return { etiqueta: i === 6 ? 'Hoy' : DIAS[d.getUTCDay()]!, usd: v ? Number(v.usd) : 0 };
  });
  const max = Math.max(...dias.map((d) => d.usd), 1);
  const paso = max <= 100 ? 25 : max <= 500 ? 100 : 500;
  const top = Math.ceil(max / paso) * paso;
  const W = 520, H = 180, pl = 44, pb = 22, pt = 8;
  const x = (i: number) => pl + (i * (W - pl - 10)) / 6;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / top);
  const line = dias.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.usd)}`).join(' ');
  const area = `${line} L${x(6)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = Array.from({ length: top / paso + 1 }, (_, i) => i * paso);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ventas de los últimos 7 días en dólares">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - 10} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth="1" />
          <text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="rgb(var(--muted))" fontFamily="JetBrains Mono, monospace">{t}</text>
        </g>
      ))}
      <path d={area} fill="rgb(var(--accent) / 0.12)" />
      <path d={line} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" strokeLinejoin="round" />
      {dias.map((d, i) => (
        <g key={i}>
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="rgb(var(--muted))">{d.etiqueta}</text>
          {i === 6 && <circle cx={x(i)} cy={y(d.usd)} r="4.5" fill="rgb(var(--accent))" stroke="rgb(var(--surface))" strokeWidth="2" />}
        </g>
      ))}
    </svg>
  );
}

export default function PanelPage() {
  const tasa = useSesion((s) => s.tasa);
  const cargarTasa = useSesion((s) => s.cargarTasa);
  const { datos, error, cargando, recargar } = useCargar(() => api<Resumen>('/reportes/resumen'), [], 60_000);
  const [nueva, setNueva] = useState('');
  const max = Math.max(1, ...(datos?.demandaInsatisfecha.map((d) => d.veces) ?? [1]));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Resumen de hoy" subtitle="Cómo va la farmacia" />
      {error && <ErrorCarga mensaje={error} reintentar={recargar} />}
      {cargando || !datos ? <Cargando /> : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi k="Vendido hoy" v={usd(datos.hoy.usd)} sub={`Bs ${num2(datos.hoy.bs)} · ${datos.hoy.ventas} ventas`} />
            <Kpi k="En la gaveta" v={String(datos.enGaveta)} sub="pagados, esperando que los busquen" />
            <Kpi k="Lotes que vencen en 30 días" v={String(datos.lotesVencen30Dias)} sub="revisar devolución" tone={datos.lotesVencen30Dias ? 'bad' : undefined} />
            <Kpi k="Clientes esperando" v={String(datos.clientesEsperando)} sub="pidieron algo que no había" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><h2 className="text-base font-bold">Ventas de la semana ($)</h2><VentasChart semana={datos.semana} /></Card>
            <Card>
              <div>
                <h2 className="text-base font-bold">Lo que más piden y no hay</h2>
                <p className="text-xs text-muted">Veces que lo pidieron en 30 días. Conviene comprarlo.</p>
              </div>
              {!datos.demandaInsatisfecha.length ? <p className="text-sm text-muted">Todavía no hay pedidos sin stock.</p> : (
                <ul className="flex flex-col gap-2.5">
                  {datos.demandaInsatisfecha.map((d, i) => (
                    <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)_28px] items-center gap-3 text-sm">
                      <span className="truncate">{d.producto?.nombreComercial} {d.producto?.concentracion}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-surface2"><span className="block h-full rounded-full bg-accent" style={{ width: `${(d.veces / max) * 100}%` }} /></span>
                      <span className="text-right font-mono tabular">{d.veces}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
      <Card className="max-w-xl">
        <h2 className="text-base font-bold">Precio del dólar hoy</h2>
        <div className="flex items-baseline gap-2"><span className="font-mono text-3xl tabular">{tasa ? num2(tasa) : '—'}</span><span className="text-muted">Bs por dólar</span></div>
        <p className="text-xs text-muted">Al guardar, los precios en bolívares se actualizan en todas las cajas. Las ventas ya hechas conservan su tasa.</p>
        <form className="flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const v = parseFloat(nueva.replace(/\./g, '').replace(',', '.'));
          if (!(v > 0)) { avisar('Escribe un número válido, por ejemplo 236,40', 'bad'); return; }
          try { await api('/tasa', { body: { valor: v } }); await cargarTasa(); setNueva(''); avisar('Tasa actualizada', 'ok'); }
          catch (err) { avisar(err instanceof ApiError ? err.message : 'No se pudo guardar', 'bad'); }
        }}>
          <input id="tasa" value={nueva} onChange={(e) => setNueva(e.target.value)} inputMode="decimal" placeholder="236,40" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono outline-none focus:border-accent" />
          <Button type="submit" variant="primary">Guardar</Button>
        </form>
        {tasa === null && <p className="text-sm text-warn">Sin tasa cargada no se puede cobrar.</p>}
        <p className="text-xs text-muted">Referencia: {bs(1, tasa)} por cada dólar.</p>
      </Card>
    </div>
  );
}
