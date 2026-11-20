import { useState } from 'react';
import { Button, Card, Cargando, ErrorCarga, PageHeader } from '@/components/ui';
import { api, guardarTasa, ApiError } from '@/lib/api';
import { bs, leerMonto, num2, usd } from '@/lib/format';
import type { Resumen } from '@/lib/tipos';
import { useCargar } from '@/lib/useCargar';
import { Link } from 'react-router-dom';
import { avisar } from '@/store/avisos';
import { useSesion } from '@/store/sesion';
import { useConfig } from '@/store/config';
import { CheckCircle2, Circle, ShieldAlert } from 'lucide-react';

/** Primeros pasos de una farmacia nueva. Desaparece al completarlos (o si el dueño la oculta). */
function PrimerosPasos() {
  const { datos } = useCargar(() => api<Record<string, boolean>>('/configuracion/primeros-pasos'), []);
  const [oculto, setOculto] = useState(() => { try { return localStorage.getItem('primerosPasosOculto') === '1'; } catch { return false; } });
  let impresora = false;
  try { impresora = localStorage.getItem('impresoraProbada') === '1'; } catch { /* sin almacenamiento */ }
  if (!datos || oculto) return null;
  const pasos = [
    { ok: datos.datosFarmacia, t: 'Nombre y RIF de la farmacia (salen en el ticket)', a: '/configuracion' },
    { ok: datos.tasa, t: 'Tasa del día: automática del BCV o escrita a mano', a: '/configuracion' },
    { ok: datos.productos, t: 'Cargar los productos con su existencia (Excel)', a: '/inventario' },
    { ok: datos.usuarios, t: 'Crear los usuarios de cajeros y farmacéutico', a: '/usuarios' },
    { ok: impresora, t: 'Probar la impresora de tickets', a: '/configuracion' },
    { ok: datos.caja, t: 'Abrir la caja con el sencillo', a: '/caja' },
    { ok: datos.venta, t: 'Hacer la primera venta', a: '/vender' },
  ];
  const hechos = pasos.filter((p) => p.ok).length;
  if (hechos === pasos.length) return null;
  return (
    <Card className="border-2 border-accent/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Primeros pasos · {hechos} de {pasos.length}</h2>
          <p className="text-xs text-muted">Lo necesario para empezar a vender. Toca cada paso para ir.</p>
        </div>
        <button className="text-xs text-muted underline" onClick={() => { setOculto(true); try { localStorage.setItem('primerosPasosOculto', '1'); } catch { /* sin almacenamiento */ } }}>Ocultar</button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface2"><div className="h-full rounded-full bg-accent" style={{ width: `${(hechos / pasos.length) * 100}%` }} /></div>
      <ul className="flex flex-col gap-1">
        {pasos.map((p) => (
          <li key={p.t}>
            <Link to={p.a} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface2 ${p.ok ? 'text-muted line-through' : 'font-semibold'}`}>
              {p.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" /> : <Circle className="h-4 w-4 shrink-0 text-muted" />}{p.t}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Aviso: principios cargados como «Normal» que por su nombre son psicotrópicos o antibióticos. */
export function RevisarControlados() {
  const { datos, recargar } = useCargar(() => api<{ id: string; nombre: string; sugerido: 'PSICOTROPICO' | 'ANTIBIOTICO' }[]>('/catalogo/principios/revisar-riesgo'), []);
  const [ignorados, setIgnorados] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('riesgoIgnorado') ?? '[]') as string[]; } catch { return []; } });
  const lista = (datos ?? []).filter((p) => !ignorados.includes(p.id));
  if (!lista.length) return null;
  const nombre = (r: string) => (r === 'PSICOTROPICO' ? 'psicotrópico' : 'antibiótico');
  const marcar = async (ps: typeof lista) => {
    try {
      for (const p of ps) await api(`/catalogo/principios/${p.id}`, { method: 'PATCH', body: { riesgo: p.sugerido } });
      avisar(ps.length === 1 ? `${ps[0]!.nombre} marcado como ${nombre(ps[0]!.sugerido)}` : `${ps.length} principios marcados como controlados`, 'ok');
      recargar();
    } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo guardar', 'bad'); }
  };
  const ignorar = (id: string) => { const n = [...ignorados, id]; setIgnorados(n); try { localStorage.setItem('riesgoIgnorado', JSON.stringify(n)); } catch { /* sin almacenamiento */ } };
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border-2 border-bad/40 bg-bad-soft p-4 text-sm">
      <div className="flex items-center gap-2 font-bold text-bad"><ShieldAlert className="h-5 w-5" />{lista.length} {lista.length === 1 ? 'medicamento parece controlado' : 'medicamentos parecen controlados'} pero {lista.length === 1 ? 'está' : 'están'} como «Normal»</div>
      <p className="text-fg">Mientras estén así se venden sin récipe ni permiso y no salen en el libro de controlados.</p>
      <ul className="flex flex-col gap-1">
        {lista.slice(0, 8).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
            <span><b>{p.nombre}</b> → {nombre(p.sugerido)}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => void marcar([p])}>Marcar</Button>
              <Button size="sm" variant="ghost" onClick={() => ignorar(p.id)}>No lo es</Button>
            </span>
          </li>
        ))}
      </ul>
      {lista.length > 1 && <Button className="self-start" variant="primary" onClick={() => void marcar(lista)}>Marcar todos</Button>}
    </div>
  );
}

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
  // Escala "redonda" de unas 4 divisiones: 1, 2, 5, 10, 20, 50…
  const bruto = max / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 5, 10].map((m) => m * potencia).find((x) => x >= bruto)!;
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
  const tasaModo = useConfig((s) => s.config?.tasaModo);
  const cargarConfig = useConfig((s) => s.cargar);
  const { datos, error, cargando, recargar } = useCargar(() => api<Resumen>('/reportes/resumen'), [], 60_000);
  const [nueva, setNueva] = useState('');
  const max = Math.max(1, ...(datos?.demandaInsatisfecha.map((d) => d.veces) ?? [1]));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Resumen de hoy" subtitle="Cómo va la farmacia" />
      <PrimerosPasos />
      <RevisarControlados />
      {error && <ErrorCarga mensaje={error} reintentar={recargar} />}
      {cargando || !datos ? <Cargando /> : (
        <>
          {!!datos.stockBajo && (
            <Link to="/catalogo" className="flex items-center justify-between gap-3 rounded-xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">
              <span>{datos.stockBajo} {datos.stockBajo === 1 ? 'producto llegó' : 'productos llegaron'} al stock mínimo</span><span className="underline">Ver en Catálogo</span>
            </Link>
          )}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi k="Vendido hoy" v={usd(datos.hoy.usd)} sub={`${datos.hoy.ventas} ventas${Number(datos.hoy.devueltoUsd) > 0 ? ` · devuelto ${usd(datos.hoy.devueltoUsd!)}` : ''}`} />
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
        <h2 className="text-base font-bold">Tasa de hoy</h2>
        <div className="flex items-baseline gap-2"><span className="font-mono text-3xl tabular">{tasa ? num2(tasa) : '—'}</span><span className="text-muted">Bs por {tasaModo === 'BCV_EUR' ? 'euro (BCV)' : 'dólar'}</span></div>
        {tasaModo && tasaModo !== 'MANUAL' && <p className="text-xs text-warn">Ahora usas la tasa automática del BCV. Si escribes una aquí, pasa a manual y deja de actualizarse sola.</p>}
        <p className="text-xs text-muted">Al guardar, los precios en bolívares se actualizan en todas las cajas. Para usar la tasa automática del BCV (dólar o euro, con ajuste), ve a <Link to="/configuracion" className="font-semibold text-accent underline">Configuración</Link>.</p>
        <form className="flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const v = leerMonto(nueva);
          if (!(v > 0)) { avisar('Escribe un número válido, por ejemplo 236,40', 'bad'); return; }
          try { await guardarTasa(v); await cargarTasa(); await cargarConfig(); setNueva(''); avisar('Tasa actualizada', 'ok'); }
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
