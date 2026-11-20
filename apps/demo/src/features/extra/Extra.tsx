import { clsx } from 'clsx';
import { useState, type ReactNode } from 'react';
import { Button, Card, Chip, PageHeader } from '@/components/ui';
import { usd } from '@/lib/format';
import { useApp } from '@/store/useApp';

const useToast = () => useApp((s) => s.toast);

function Tabs<T extends string>({ tabs, value, onChange }: { tabs: T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface2 p-1">
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)} className={clsx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold', value === t ? 'bg-surface text-fg shadow-sm' : 'text-muted')}>{t}</button>
      ))}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="border-b border-line text-left text-xs text-muted">{head.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line last:border-0">{r.map((c, j) => <td key={j} className="px-4 py-2.5">{c}</td>)}</tr>)}</tbody>
      </table>
    </Card>
  );
}

function Kpi({ k, v, tone }: { k: string; v: string; tone?: 'bad' | 'ok' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{k}</div>
      <div className={clsx('font-mono text-2xl tabular', tone === 'bad' && 'text-bad', tone === 'ok' && 'text-ok')}>{v}</div>
    </div>
  );
}

const mono = (s: string) => <span className="font-mono tabular">{s}</span>;

/* ───────── Compras a droguerías ───────── */
const SUGERIDO = [
  { p: 'Losartán 50 mg x30', drog: 'Drolanca', stock: 4, vende: 38, pedir: 40, costo: 2.1 },
  { p: 'Atamel 500 mg x20', drog: 'Cobeca', stock: 12, vende: 95, pedir: 100, costo: 0.9 },
  { p: 'Glucofage 850 mg x30', drog: 'Drolanca', stock: 0, vende: 22, pedir: 30, costo: 3.4 },
  { p: 'Amoxicilina 500 mg x21', drog: 'Droguería Nena', stock: 6, vende: 27, pedir: 24, costo: 2.6 },
  { p: 'Omeprazol 20 mg x30', drog: 'Cobeca', stock: 9, vende: 31, pedir: 30, costo: 1.2 },
];
const FACTURAS0 = [
  { drog: 'Drolanca', fac: 'F-20931', vence: 'Vence en 2 días', saldo: 1240, tone: 'warn' as const },
  { drog: 'Cobeca', fac: 'C-55812', vence: 'Vencida hace 3 días', saldo: 860, tone: 'bad' as const },
  { drog: 'Droguería Nena', fac: 'N-0442', vence: 'Vence en 12 días', saldo: 415, tone: 'neutral' as const },
];

export function ComprasPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'Pedido sugerido' | 'Por recibir' | 'Cuentas por pagar'>('Pedido sugerido');
  const [sel, setSel] = useState(() => SUGERIDO.map(() => true));
  const [enviado, setEnviado] = useState(false);
  const [recibido, setRecibido] = useState(false);
  const [fact, setFact] = useState(FACTURAS0);
  const total = SUGERIDO.reduce((a, s, i) => a + (sel[i] ? s.pedir * s.costo : 0), 0);
  const deuda = fact.reduce((a, f) => a + f.saldo, 0);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Compras a droguerías" subtitle="Qué pedir, qué llegó y cuánto se debe" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Por pedir hoy" v={`${sel.filter(Boolean).length} productos`} />
        <Kpi k="Total del pedido" v={usd(total)} />
        <Kpi k="Deuda con droguerías" v={usd(deuda)} />
        <Kpi k="Facturas vencidas" v={String(fact.filter((f) => f.tone === 'bad' && f.saldo > 0).length)} tone="bad" />
      </div>
      <Tabs tabs={['Pedido sugerido', 'Por recibir', 'Cuentas por pagar']} value={tab} onChange={setTab} />
      {tab === 'Pedido sugerido' && (
        <>
          <p className="text-sm text-muted">Calculado con las ventas de los últimos 30 días, la existencia y lo que pidieron los clientes y no había.</p>
          <Table head={['', 'Producto', 'Droguería', 'Existencia', 'Vende al mes', 'Pedir', 'Costo']} rows={SUGERIDO.map((s, i) => [
            <input type="checkbox" checked={sel[i]} onChange={() => setSel(sel.map((v, j) => (j === i ? !v : v)))} className="h-4 w-4 accent-[rgb(var(--accent))]" />,
            <span className="font-semibold">{s.p}</span>, s.drog,
            s.stock === 0 ? <Chip tone="bad">Agotado</Chip> : mono(String(s.stock)), mono(String(s.vende)), mono(String(s.pedir)), mono(usd(s.pedir * s.costo)),
          ])} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => toast('Pedido en PDF descargado', 'ok')}>Descargar PDF</Button>
            <Button variant="primary" disabled={enviado} onClick={() => { setEnviado(true); toast('Pedido enviado por WhatsApp a las droguerías', 'ok'); }}>{enviado ? 'Pedido enviado ✓' : 'Enviar pedido por WhatsApp'}</Button>
          </div>
        </>
      )}
      {tab === 'Por recibir' && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between"><span className="font-semibold">Orden OC-0187 · Drolanca</span><Chip tone={recibido ? 'ok' : 'warn'}>{recibido ? 'Recibida' : 'En camino'}</Chip></div>
          <Table head={['Producto', 'Pedido', 'Llegó', 'Diferencia']} rows={[
            ['Losartán 50 mg x30', mono('40'), mono('40'), <Chip tone="ok">Completo</Chip>],
            ['Glucofage 850 mg x30', mono('30'), mono('24'), <Chip tone="bad">Faltan 6</Chip>],
          ]} />
          <Button variant="primary" disabled={recibido} onClick={() => { setRecibido(true); toast('Mercancía recibida: el inventario se actualizó y se avisó a 3 clientes en espera', 'ok'); }}>{recibido ? 'Recibida ✓' : 'Confirmar recepción'}</Button>
        </Card>
      )}
      {tab === 'Cuentas por pagar' && (
        <Table head={['Droguería', 'Factura', 'Vencimiento', 'Saldo', '']} rows={fact.map((f, i) => [
          <span className="font-semibold">{f.drog}</span>, mono(f.fac),
          f.saldo === 0 ? <Chip tone="ok">Pagada</Chip> : <Chip tone={f.tone}>{f.vence}</Chip>, mono(usd(f.saldo)),
          f.saldo > 0 && <Button size="sm" onClick={() => { setFact(fact.map((x, j) => (j === i ? { ...x, saldo: 0 } : x))); toast(`Pago registrado a ${f.drog}`, 'ok'); }}>Registrar pago</Button>,
        ])} />
      )}
    </div>
  );
}

/* ───────── Mayorista ───────── */
const EMPRESAS = [
  { n: 'Clínica San Rafael', rif: 'J-30512874-1', limite: 5000, deuda: 3200, estado: 'Pedido por despachar' },
  { n: 'Farmacia El Pilar', rif: 'J-40123456-7', limite: 2500, deuda: 2650, estado: 'Pasó su límite' },
  { n: 'Constructora Andes (convenio)', rif: 'J-29876543-0', limite: 1500, deuda: 420, estado: 'Al día' },
];
const PASOS = ['Cotización', 'Pedido', 'Preparado', 'Despachado', 'Entregado'];

export function MayoristaPage() {
  const toast = useToast();
  const [paso, setPaso] = useState(1);
  const [abono, setAbono] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Venta al mayor" subtitle="Clínicas, farmacias y empresas con precio de mayor y crédito" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Por cobrar" v={usd(abono ? 5270 : 6270)} />
        <Kpi k="Vencido" v={usd(1150)} tone="bad" />
        <Kpi k="Pedidos abiertos" v="4" />
        <Kpi k="Ventas al mayor (mes)" v={usd(18420)} tone="ok" />
      </div>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><div className="font-semibold">Pedido PM-0052 · Clínica San Rafael</div><div className="text-sm text-muted">12 cajas máster · precio de mayor · crédito 15 días</div></div>
          <span className="font-mono text-xl tabular">{usd(1000)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PASOS.map((p, i) => <Chip key={p} tone={i < paso ? 'ok' : i === paso ? 'accent' : 'neutral'}>{i < paso ? '✓ ' : ''}{p}</Chip>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={paso >= PASOS.length} onClick={() => { setPaso(paso + 1); toast(`Pedido: ${PASOS[paso]}`, 'ok'); }}>
            {paso >= PASOS.length ? 'Entregado ✓' : `Marcar «${PASOS[paso]}»`}
          </Button>
          <Button onClick={() => toast('Nota de entrega en PDF descargada', 'ok')}>Nota de entrega</Button>
        </div>
      </Card>
      <Table head={['Cliente empresa', 'RIF', 'Límite', 'Debe', 'Estado', '']} rows={EMPRESAS.map((e, i) => {
        const deuda = i === 0 && abono ? e.deuda - 1000 : e.deuda;
        return [
          <span className="font-semibold">{e.n}</span>, mono(e.rif), mono(usd(e.limite)), mono(usd(deuda)),
          <Chip tone={deuda > e.limite ? 'bad' : e.estado === 'Al día' ? 'ok' : 'warn'}>{e.estado}</Chip>,
          i === 0 ? <Button size="sm" disabled={abono} onClick={() => { setAbono(true); toast('Abono de $1.000 registrado. Estado de cuenta actualizado', 'ok'); }}>{abono ? 'Abonado ✓' : 'Registrar abono'}</Button>
            : <Button size="sm" onClick={() => toast(`Estado de cuenta de ${e.n} enviado por WhatsApp`, 'ok')}>Estado de cuenta</Button>,
        ];
      })} />
    </div>
  );
}

/* ───────── Reportes ───────── */
const GANANCIA = [
  { k: 'Medicamentos', v: 9840, m: 28 }, { k: 'Cuidado personal', v: 2310, m: 35 }, { k: 'Bebé', v: 1420, m: 31 }, { k: 'Misceláneos', v: 880, m: 40 },
];
export function ReportesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'Ganancia' | 'Rotación' | 'Cajeros'>('Ganancia');
  const max = Math.max(...GANANCIA.map((g) => g.v));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Reportes" subtitle="Este mes" actions={<Button variant="primary" onClick={() => toast('Reporte descargado en Excel', 'ok')}>Descargar Excel</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Ventas" v={usd(14450)} /><Kpi k="Ganancia" v={usd(4210)} tone="ok" /><Kpi k="Margen promedio" v="29 %" /><Kpi k="Ticket promedio" v={usd(11.8)} />
      </div>
      <Tabs tabs={['Ganancia', 'Rotación', 'Cajeros']} value={tab} onChange={setTab} />
      {tab === 'Ganancia' && (
        <Card className="flex flex-col gap-3 p-4">
          {GANANCIA.map((g) => (
            <div key={g.k} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-sm">
              <span>{g.k}</span>
              <div className="h-3 rounded-full bg-surface2"><div className="h-3 rounded-full bg-accent" style={{ width: `${(g.v / max) * 100}%` }} /></div>
              <span className="font-mono tabular">{usd(g.v)} · {g.m} %</span>
            </div>
          ))}
        </Card>
      )}
      {tab === 'Rotación' && (
        <Table head={['Producto', 'Vendidos (30 días)', 'Estado']} rows={[
          ['Atamel 500 mg', mono('95'), <Chip tone="ok">Se vende mucho</Chip>],
          ['Losartán 50 mg', mono('38'), <Chip tone="ok">Se vende mucho</Chip>],
          ['Jarabe Broncomed', mono('0'), <Chip tone="bad">Sin movimiento 74 días</Chip>],
          ['Crema Hipoglós 110 g', mono('1'), <Chip tone="warn">Lento</Chip>],
        ]} />
      )}
      {tab === 'Cajeros' && (
        <Table head={['Cajero', 'Ventas', 'Monto', 'Diferencia en cierres']} rows={[
          ['María G.', mono('412'), mono(usd(5120)), <Chip tone="ok">$0,00</Chip>],
          ['José R.', mono('388'), mono(usd(4730)), <Chip tone="warn">-$2,50</Chip>],
          ['Ana P.', mono('301'), mono(usd(3600)), <Chip tone="ok">$0,00</Chip>],
        ]} />
      )}
    </div>
  );
}

/* ───────── WhatsApp y recompra ───────── */
const RECOMPRA = [
  { n: 'Carmen Díaz', p: 'Losartán 50 mg', d: 'Se le acaba en 2 días' },
  { n: 'Luis Herrera', p: 'Glucofage 850 mg', d: 'Se le acaba en 3 días' },
  { n: 'Rosa Medina', p: 'Eutirox 100 mcg', d: 'Se le acaba mañana' },
];
export function WhatsappPage() {
  const toast = useToast();
  const [env, setEnv] = useState<boolean[]>(RECOMPRA.map(() => false));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="WhatsApp y recompra" subtitle="Avisos automáticos a los clientes" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi k="Mensajes este mes" v="642" /><Kpi k="Leídos" v="91 %" /><Kpi k="Volvieron a comprar" v="187" tone="ok" /><Kpi k="Venta por recordatorios" v={usd(2240)} tone="ok" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-2">
          <div className="font-semibold">Recordatorios de recompra para hoy</div>
          {RECOMPRA.map((r, i) => (
            <Card key={r.n} className="flex items-center justify-between gap-3 p-3">
              <div><div className="font-semibold">{r.n}</div><div className="text-sm text-muted">{r.p} · {r.d}</div></div>
              <Button size="sm" variant={env[i] ? 'secondary' : 'primary'} disabled={env[i]} onClick={() => { setEnv(env.map((v, j) => (j === i ? true : v))); toast(`Recordatorio enviado a ${r.n}`, 'ok'); }}>{env[i] ? 'Enviado ✓' : 'Enviar'}</Button>
            </Card>
          ))}
          <Button onClick={() => { setEnv(env.map(() => true)); toast('Todos los recordatorios enviados', 'ok'); }}>Enviar todos</Button>
        </div>
        <Card className="flex flex-col gap-2 bg-[#e5ddd5] p-3 text-sm text-[#111] dark:bg-[#0b141a] dark:text-[#e9edef]">
          <div className="text-xs font-semibold opacity-70">Vista del cliente</div>
          <div className="max-w-[90%] rounded-lg bg-white p-2.5 shadow-sm dark:bg-[#202c33]">¡Hola Carmen! 👋 Tu <b>Losartán 50 mg</b> se termina en 2 días. ¿Te lo apartamos? Precio: $6,90. Responde <b>SÍ</b> y te lo tenemos listo.</div>
          <div className="ml-auto max-w-[70%] rounded-lg bg-[#d9fdd3] p-2.5 shadow-sm dark:bg-[#005c4b]">Sí, por favor 🙏</div>
          <div className="max-w-[90%] rounded-lg bg-white p-2.5 shadow-sm dark:bg-[#202c33]">Listo ✅ Apartado. Puedes pagar por Pago Móvil y pasar a retirarlo.</div>
        </Card>
      </div>
    </div>
  );
}

/* ───────── Libro de controlados ───────── */
export function LibroPage() {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Libro de psicotrópicos" subtitle="Se llena solo con cada venta y compra de controlados" actions={<Button variant="primary" onClick={() => toast('Libro del mes descargado en PDF', 'ok')}>Imprimir libro</Button>} />
      <Table head={['Fecha', 'Movimiento', 'Producto', 'Cant.', 'Paciente', 'Médico', 'Farmacéutico']} rows={[
        [mono('19/11'), <Chip tone="bad">Salida</Chip>, 'Clonazepam 2 mg', mono('30'), 'V-12.345.678', 'Dr. Pérez · MPPS 45812', 'Farm. C. Méndez'],
        [mono('18/11'), <Chip tone="ok">Entrada</Chip>, 'Alprazolam 0,5 mg', mono('60'), '—', 'Drolanca F-20931', 'Farm. C. Méndez'],
        [mono('17/11'), <Chip tone="bad">Salida</Chip>, 'Tramadol 50 mg', mono('10'), 'V-8.765.432', 'Dra. Rojas · MPPS 30211', 'Farm. C. Méndez'],
      ]} />
    </div>
  );
}

/* ───────── Ventas (historial, devolución) ───────── */
const VENTAS = [
  { n: 1042, h: '10:42', p: '2 Atamel 500 mg, 1 Losartán 50 mg', c: 'Ana Pérez', t: 13.4, e: 'ok' },
  { n: 1041, h: '10:31', p: '1 Crema Hipoglós 110 g (−10 % tercera edad)', c: 'Ana Pérez', t: 8.87, e: 'ok' },
  { n: 1040, h: '10:18', p: '1 Amoxicilina 500 mg', c: 'Carlos Méndez', t: 2.6, e: 'dev' },
  { n: 1039, h: '09:55', p: '3 Omeprazol 20 mg', c: 'Ana Pérez', t: 3.6, e: 'anulada' },
];
export function VentasPage() {
  const toast = useToast();
  const [dev, setDev] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ventas" subtitle="Historial, reimprimir ticket, devoluciones y anulaciones" />
      <Table head={['N.º', 'Hora', 'Productos', 'Cajero', 'Total', 'Estado', '']} rows={VENTAS.map((v) => [
        mono(`#${v.n}`), mono(v.h), v.p, v.c, mono(usd(v.t)),
        v.e === 'anulada' ? <Chip tone="bad">Anulada</Chip> : v.e === 'dev' || (v.n === 1042 && dev) ? <Chip tone="warn">Con devolución</Chip> : <Chip tone="ok">Cobrada</Chip>,
        <div className="flex gap-1"><Button size="sm" onClick={() => toast(`Ticket #${v.n} enviado a la impresora`, 'ok')}>Ticket</Button>
          {v.n === 1042 && !dev && <Button size="sm" onClick={() => { setDev(true); toast('Devolución: 1 Losartán. Se entregan $6,90 y el producto vuelve a su lote', 'ok'); }}>Devolver</Button>}</div>,
      ])} />
    </div>
  );
}

/* ───────── Catálogo ───────── */
const PRODS = [
  { p: 'Atamel 500 mg', l: 'Calox', c: 'Medicamentos', iva: 0, precio: 1.8, costo: 0.9, s: 140, min: 40 },
  { p: 'Losartán 50 mg', l: 'Leti', c: 'Medicamentos', iva: 0, precio: 6.9, costo: 4.2, s: 12, min: 20 },
  { p: 'Crema Hipoglós 110 g', l: 'Bayer', c: 'Bebé', iva: 16, precio: 8.5, costo: 5.1, s: 20, min: 5 },
  { p: 'Rivotril 2 mg', l: 'Roche', c: 'Medicamentos', iva: 0, precio: 7.5, costo: 5.8, s: 9, min: 5, psico: true },
];
export function CatalogoPage() {
  const toast = useToast();
  const [sube, setSube] = useState(0);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Catálogo" subtitle="Productos, precios, costo y margen" actions={<>
        <Button onClick={() => { setSube(5); toast('Precios de Leti +5 % (vista previa confirmada)', 'ok'); }}>Cambiar precios</Button>
        <Button variant="primary" onClick={() => toast('Formulario de nuevo producto', 'ok')}>Nuevo producto</Button></>} />
      <Table head={['Producto', 'Categoría', 'Precio', 'Costo · margen', 'Existencia', '']} rows={PRODS.map((x) => {
        const precio = x.l === 'Leti' ? Math.round(x.precio * (1 + sube / 100) / 0.05) * 0.05 : x.precio;
        const m = Math.round(((precio - x.costo) / precio) * 100);
        return [
          <div><b>{x.p}</b> {x.psico && <Chip tone="bad">Psicotrópico</Chip>}<div className="text-xs text-muted">{x.l}{x.iva ? ` · IVA ${x.iva} %` : ''}</div></div>, x.c, mono(usd(precio)),
          <span className="font-mono">{usd(x.costo)} · <span className={m < 30 ? 'text-bad' : 'text-ok'}>{m} %</span></span>,
          x.s <= x.min ? <Chip tone="bad">{x.s} · mín. {x.min}</Chip> : mono(String(x.s)), <Button size="sm" onClick={() => toast('Editar producto', 'ok')}>Editar</Button>,
        ];
      })} />
    </div>
  );
}

/* ───────── Auditoría ───────── */
export function AuditoriaPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Auditoría" subtitle="Quién hizo qué y cuándo. No se puede borrar ni editar." />
      <Table head={['Fecha', 'Quién', 'Acción', 'Detalle']} rows={[
        [mono('20/11 10:42'), 'Carlos Méndez', <Chip tone="warn">devolución</Chip>, 'Venta #1040 · $2,60 · producto equivocado'],
        [mono('20/11 10:31'), 'Ana Pérez', <Chip>venta</Chip>, 'Venta #1041 · descuento 10 % tercera edad'],
        [mono('20/11 10:05'), 'José Ávila', <Chip>precios masivo</Chip>, 'Leti +5 % · 38 productos'],
        [mono('20/11 09:58'), 'José Ávila', <Chip tone="warn">venta anulada</Chip>, 'Venta #1039'],
        [mono('20/11 08:01'), 'Ana Pérez', <Chip>caja abierta</Chip>, 'Fondo $20 + Bs 500'],
      ]} />
    </div>
  );
}

/* ───────── Configuración ───────── */
export function ConfiguracionPage() {
  const toast = useToast();
  const [modo, setModo] = useState<'usd' | 'eur' | 'manual'>('usd');
  const [ajuste, setAjuste] = useState<'no' | 'bs' | 'pct'>('bs');
  const [valor, setValor] = useState(1);
  const base = modo === 'eur' ? 1009.07 : 918.77;
  const final = ajuste === 'bs' ? base + valor : ajuste === 'pct' ? base * (1 + valor / 100) : base;
  const n2 = (v: number) => v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const op = (k: typeof modo, t: string, d: string) => (
    <button onClick={() => setModo(k)} className={`flex flex-col items-start rounded-xl border p-3 text-left ${modo === k ? 'border-accent bg-accent-soft/60' : 'border-line'}`}><b>{t}</b><span className="text-sm text-muted">{d}</span></button>
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Configuración" subtitle="Tasa del dólar, impuestos, ticket e impresora" />
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-lg font-bold">Tasa del día</h2>
        <div className="grid gap-2 md:grid-cols-3">{op('usd', 'BCV dólar (automática)', '918,77 Bs')}{op('eur', 'BCV euro (automática)', '1.009,07 Bs')}{op('manual', 'Personalizada', 'La escribes tú')}</div>
        {modo !== 'manual' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {([['no', 'Sin ajuste'], ['bs', 'Sumar Bs'], ['pct', 'Sumar %']] as const).map(([k, t]) => <button key={k} onClick={() => setAjuste(k)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${ajuste === k ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}>{t}</button>)}
              {ajuste !== 'no' && <input type="number" value={valor} onChange={(e) => setValor(Number(e.target.value) || 0)} className="h-10 w-24 rounded-lg border border-line bg-surface px-2 font-mono" />}
            </div>
            <div className="rounded-xl bg-surface2 p-3 font-mono text-sm">BCV {n2(base)}{ajuste === 'bs' ? ` + ${n2(valor)} Bs` : ajuste === 'pct' ? ` + ${n2(valor)} %` : ''} = <b>{n2(final)} Bs</b></div>
            <Button variant="primary" onClick={() => toast('Tasa automática activada. Se revisa el BCV cada 30 minutos', 'ok')}>Guardar y usar esta tasa</Button>
          </>
        )}
      </Card>
      <Card className="flex flex-col gap-2 p-4">
        <h2 className="text-lg font-bold">Ticket e impresora</h2>
        <p className="text-sm text-muted">Papel 80 o 58 mm · tamaño de letra · 1 a 3 copias · imprimir solo al cobrar · datos de la farmacia y mensaje final.</p>
        <Button onClick={() => toast('Página de prueba enviada a la impresora', 'ok')}>Imprimir prueba</Button>
      </Card>
    </div>
  );
}
