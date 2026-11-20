import { clsx } from 'clsx';
import { Camera, Pencil, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Alert, Button, Campo, Card, Cargando, Chip, ErrorCarga, PageHeader, SearchInput, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useCargar } from '@/lib/useCargar';
import type { Paciente, Principio, Venta } from '@/lib/tipos';
import { CATEGORIAS } from '@farmacia/shared';
import { avisar } from '@/store/avisos';
import { useRol } from '@/store/sesion';
import Ticket from '@/features/caja/Ticket';

const usd = (v: string | number) => `$${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaHora = (d: string) => new Date(d).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const msg = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.errores.map((x) => x.mensaje)].join('. ') : 'No se pudo completar');
const mono = (s: ReactNode) => <span className="font-mono tabular">{s}</span>;
const hoy = () => new Date().toISOString().slice(0, 10);

function Tabs<T extends string>({ tabs, value, onChange }: { tabs: T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface2 p-1">
      {tabs.map((t) => <button key={t} onClick={() => onChange(t)} className={clsx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold', value === t ? 'bg-surface text-fg shadow-sm' : 'text-muted')}>{t}</button>)}
    </div>
  );
}

function Tabla({ head, rows, vacio }: { head: string[]; rows: ReactNode[][]; vacio: string }) {
  if (!rows.length) return <Card className="p-6 text-center text-sm text-muted">{vacio}</Card>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="border-b border-line text-left text-xs text-muted">{head.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line last:border-0">{r.map((c, j) => <td key={j} className="px-4 py-2.5 align-middle">{c}</td>)}</tr>)}</tbody>
      </table>
    </Card>
  );
}

function Estado<T>({ c, children }: { c: { datos: T | null; error: string | null; recargar: () => void }; children: (d: T) => ReactNode }) {
  if (c.error) return <ErrorCarga mensaje={c.error} reintentar={c.recargar} />;
  if (!c.datos) return <Cargando />;
  return <>{children(c.datos)}</>;
}

/* ───────── Escáner con la cámara ───────── */
interface Detector { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

export function Escaner({ onCodigo }: { onCodigo: (c: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!abierto) return;
    let parar = () => {};
    let vivo = true;
    const leido = (c: string) => { if (!vivo) return; vivo = false; setAbierto(false); onCodigo(c); };
    (async () => {
      try {
        if (window.BarcodeDetector) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          parar = () => stream.getTracks().forEach((t) => t.stop());
          video.current!.srcObject = stream;
          await video.current!.play();
          const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
          const ciclo = async () => {
            if (!vivo) return;
            const r = await det.detect(video.current!).catch(() => []);
            if (r[0]) leido(r[0].rawValue); else requestAnimationFrame(() => void ciclo());
          };
          void ciclo();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const ctl = await new BrowserMultiFormatReader().decodeFromVideoDevice(undefined, video.current!, (r) => { if (r) leido(r.getText()); });
          parar = () => ctl.stop();
        }
      } catch {
        setError('No se pudo abrir la cámara. Revisa el permiso de cámara del navegador.');
      }
    })();
    return () => { vivo = false; parar(); };
  }, [abierto, onCodigo]);

  return (
    <>
      <Button type="button" aria-label="Escanear con la cámara" onClick={() => { setError(null); setAbierto(true); }} icon={<Camera className="h-5 w-5" />} className="h-11"><span className="hidden sm:inline">Escanear</span></Button>
      <Sheet open={abierto} onClose={() => setAbierto(false)} title="Apunta al código de barras">
        <div className="flex flex-col gap-3">
          <video ref={video} muted playsInline className="aspect-[4/3] w-full rounded-xl bg-black object-cover" />
          {error ? <Alert tone="bad">{error}</Alert> : <p className="text-center text-sm text-muted">Se agrega solo al leerlo</p>}
        </div>
      </Sheet>
    </>
  );
}

/* ───────── Ventas: historial, ticket, devolución y anulación ───────── */
interface VentaDet extends Venta {
  estado: 'COMPLETADA' | 'ANULADA';
  descuentoPct: string; descuentoMotivo: string | null;
  lineas: (Venta['lineas'][number] & { id: string; devuelto: number; lote: { numero: string } })[];
  devoluciones: { id: string; motivo: string; montoUsd: string; metodo: string; monto: string; creadoEn: string }[];
}
interface VentaLista { id: string; numero: number; creadaEn: string; totalUsd: string; estado: string; cedula: string | null; metodoPago: string; cajero: { nombre: string }; lineas: { cantidad: number; devuelto: number; producto: { nombreComercial: string } }[]; _count: { devoluciones: number } }
const METODOS: [string, string][] = [['EFECTIVO_USD', 'Efectivo $'], ['EFECTIVO_BS', 'Efectivo Bs'], ['PAGO_MOVIL', 'Pago Móvil'], ['PUNTO_DE_VENTA', 'Punto de venta']];

function DetalleVenta({ id, onCerrar, onCambio }: { id: string | null; onCerrar: () => void; onCambio: () => void }) {
  const rol = useRol();
  const v = useCargar(() => (id ? api<VentaDet>(`/ventas/${id}`) : Promise.resolve(null)), [id]);
  const [modo, setModo] = useState<'ver' | 'devolver' | 'ticket'>('ver');
  const [cant, setCant] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO_USD');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setModo('ver'); setCant({}); setMotivo(''); setError(null); }, [id]);
  const d = v.datos;
  if (!id) return null;
  if (modo === 'ticket' && d) return <Ticket venta={d} onCerrar={() => setModo('ver')} />;
  const factor = 1 - Number(d?.descuentoPct ?? 0) / 100;
  const aDevolver = d ? d.lineas.reduce((a, l) => a + (cant[l.id] ?? 0) * Number(l.precioUsd) * factor, 0) : 0;

  return (
    <Sheet open onClose={onCerrar} title={d ? `Venta N.º ${d.numero}` : 'Venta'}>
      {!d ? <Cargando /> : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 text-sm text-muted">
            <span>{fechaHora(d.creadaEn)}</span><span>· {d.cajero?.nombre}</span>{d.cedula && <span>· C.I. {d.cedula}</span>}
            {d.estado === 'ANULADA' && <Chip tone="bad">Anulada</Chip>}
            {Number(d.descuentoPct) > 0 && <Chip tone="info">Descuento {Number(d.descuentoPct)} % · {d.descuentoMotivo}</Chip>}
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {d.lineas.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div><div className="font-semibold">{l.producto.nombreComercial} {l.producto.concentracion}</div>
                  <div className="text-xs text-muted">{l.cantidad} × {usd(l.precioUsd)} · lote {l.lote.numero}{l.devuelto ? ` · devueltos ${l.devuelto}` : ''}</div></div>
                {modo === 'devolver' && l.cantidad - l.devuelto > 0 && (
                  <select value={cant[l.id] ?? 0} onChange={(e) => setCant({ ...cant, [l.id]: Number(e.target.value) })} className="h-9 rounded-lg border border-line bg-surface px-2" aria-label="Cantidad a devolver">
                    {Array.from({ length: l.cantidad - l.devuelto + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
          <div className="flex justify-between font-semibold"><span>Total</span>{mono(usd(d.totalUsd))}</div>
          {d.devoluciones.map((x) => <Alert key={x.id} tone="info">Devolución {fechaHora(x.creadoEn)}: {usd(x.montoUsd)} por {METODOS.find((m) => m[0] === x.metodo)?.[1]} · {x.motivo}</Alert>)}

          {modo === 'devolver' ? (
            <form className="flex flex-col gap-2" onSubmit={async (e) => {
              e.preventDefault(); setError(null);
              const lineas = Object.entries(cant).filter(([, n]) => n > 0).map(([lineaId, cantidad]) => ({ lineaId, cantidad }));
              if (!lineas.length) { setError('Elige qué productos devuelve'); return; }
              try {
                const r = await api<{ monto: string; metodo: string }>(`/ventas/${d.id}/devoluciones`, { body: { lineas, motivo, metodo } });
                avisar(`Devolución hecha: entregar ${r.metodo.endsWith('BS') || r.metodo === 'PAGO_MOVIL' || r.metodo === 'PUNTO_DE_VENTA' ? 'Bs ' : '$'}${r.monto}`, 'ok');
                setModo('ver'); setCant({}); v.recargar(); onCambio();
              } catch (err) { setError(msg(err)); }
            }}>
              <Campo etiqueta="Motivo"><input required value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. producto equivocado" className={claseInput} /></Campo>
              <Campo etiqueta="Cómo se le devuelve el dinero">
                <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={claseInput}>{METODOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
              </Campo>
              <div className="flex justify-between font-semibold"><span>A devolver</span>{mono(usd(aDevolver))}</div>
              {error && <Alert tone="bad">{error}</Alert>}
              <div className="flex gap-2"><Button type="button" onClick={() => setModo('ver')}>Volver</Button><Button type="submit" variant="primary" className="flex-1">Confirmar devolución</Button></div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setModo('ticket')}>Reimprimir ticket</Button>
              {d.estado === 'COMPLETADA' && rol !== 'CAJERO' && d.lineas.some((l) => l.cantidad > l.devuelto) && <Button variant="primary" onClick={() => setModo('devolver')}>Devolver productos</Button>}
              {d.estado === 'COMPLETADA' && rol === 'ADMIN' && !d.devoluciones.length && (
                <Button variant="danger" onClick={async () => {
                  if (!confirm(`¿Anular la venta N.º ${d.numero}? El stock vuelve al inventario.`)) return;
                  try { await api(`/ventas/${d.id}/anular`, { body: {} }); avisar('Venta anulada', 'ok'); v.recargar(); onCambio(); } catch (e) { avisar(msg(e), 'bad'); }
                }}>Anular venta</Button>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function VentasPage() {
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [numero, setNumero] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const lista = useCargar(() => api<VentaLista[]>(`/ventas?desde=${desde}&hasta=${hasta}${numero ? `&numero=${numero}` : ''}`), [desde, hasta, numero]);
  const activas = (lista.datos ?? []).filter((v) => v.estado === 'COMPLETADA');
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ventas" subtitle="Historial, reimprimir ticket, devoluciones y anulaciones" />
      <div className="flex flex-wrap items-end gap-2">
        <Campo etiqueta="Desde"><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={claseInput} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={claseInput} /></Campo>
        <Campo etiqueta="N.º de venta"><input inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} placeholder="Buscar" className={claseInput + ' w-32'} /></Campo>
        <div className="ml-auto text-right text-sm text-muted">{activas.length} ventas · <b className="font-mono text-fg">{usd(activas.reduce((a, v) => a + Number(v.totalUsd), 0))}</b></div>
      </div>
      <Estado c={lista}>{(d) => (
        <Tabla vacio="No hay ventas en estas fechas." head={['N.º', 'Hora', 'Productos', 'Cajero', 'Total', 'Estado']} rows={d.map((v) => [
          <button className="font-mono font-semibold text-accent underline-offset-2 hover:underline" onClick={() => setAbierta(v.id)}>#{v.numero}</button>,
          mono(fechaHora(v.creadaEn)),
          <button className="max-w-[280px] truncate text-left" onClick={() => setAbierta(v.id)}>{v.lineas.map((l) => `${l.cantidad} ${l.producto.nombreComercial}`).join(', ')}</button>,
          v.cajero.nombre, mono(usd(v.totalUsd)),
          v.estado === 'ANULADA' ? <Chip tone="bad">Anulada</Chip> : v._count.devoluciones ? <Chip tone="warn">Con devolución</Chip> : <Chip tone="ok">Cobrada</Chip>,
        ])} />
      )}</Estado>
      <DetalleVenta id={abierta} onCerrar={() => setAbierta(null)} onCambio={lista.recargar} />
    </div>
  );
}

/* ───────── Catálogo: productos, principios activos y ajustes ───────── */
interface ProductoAdm { id: string; ivaPct: number; categoria: string; costoUsd: string | null; margenPct: number | null; codigoBarras: string | null; nombreComercial: string; laboratorio: string; concentracion: string; forma: string; unidadesPorCaja: number; precioUsd: string; nivel: string; requiereRecipe: boolean; stockMinimo: number; activo: boolean; stock: number; bajo: boolean; principioActivo: { id: string; nombre: string; riesgo: string } }
const RIESGO: Record<string, [string, 'neutral' | 'warn' | 'bad']> = { NORMAL: ['Normal', 'neutral'], ANTIBIOTICO: ['Antibiótico', 'warn'], PSICOTROPICO: ['Psicotrópico', 'bad'] };
const NIVELES: [string, string][] = [['GENERICO', 'Genérico'], ['MEDIO', 'Medio'], ['MARCA', 'Marca']];

function FormProducto({ p, principios, onCerrar, onListo }: { p: ProductoAdm | 'nuevo' | null; principios: Principio[]; onCerrar: () => void; onListo: () => void }) {
  const base = p && p !== 'nuevo' ? p : null;
  const ini = () => ({
    nombreComercial: base?.nombreComercial ?? '', laboratorio: base?.laboratorio ?? '', principioActivoId: base?.principioActivo.id ?? '',
    concentracion: base?.concentracion ?? '', forma: base?.forma ?? 'Tabletas', unidadesPorCaja: String(base?.unidadesPorCaja ?? 1),
    precioUsd: base?.precioUsd ?? '', nivel: base?.nivel ?? 'GENERICO', codigoBarras: base?.codigoBarras ?? '',
    requiereRecipe: base?.requiereRecipe ?? false, stockMinimo: String(base?.stockMinimo ?? 0), activo: base?.activo ?? true,
    ivaPct: String(base?.ivaPct ?? 0), categoria: base?.categoria ?? 'Medicamentos',
  });
  const [f, setF] = useState(ini);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setF(ini()); setError(null); }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = (k: keyof typeof f, etiqueta: string, extra: Partial<InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <Campo etiqueta={etiqueta}><input value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={claseInput} {...extra} /></Campo>
  );
  return (
    <Sheet open={!!p} onClose={onCerrar} title={base ? `Editar ${base.nombreComercial}` : 'Nuevo producto'}>
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        const body = {
          nombreComercial: f.nombreComercial, laboratorio: f.laboratorio, principioActivoId: f.principioActivoId, concentracion: f.concentracion, forma: f.forma,
          unidadesPorCaja: Number(f.unidadesPorCaja), precioUsd: Number(String(f.precioUsd).replace(',', '.')), nivel: f.nivel,
          codigoBarras: f.codigoBarras.trim() || undefined, requiereRecipe: f.requiereRecipe, stockMinimo: Number(f.stockMinimo) || 0, activo: f.activo,
          ivaPct: Number(f.ivaPct), categoria: f.categoria,
        };
        try {
          await api(base ? `/catalogo/productos/${base.id}` : '/catalogo/productos', { method: base ? 'PATCH' : 'POST', body });
          avisar(base ? 'Producto actualizado' : 'Producto creado', 'ok'); onListo(); onCerrar();
        } catch (err) { setError(msg(err)); }
      }}>
        {t('nombreComercial', 'Nombre comercial', { required: true })}
        <Campo etiqueta="Principio activo" ayuda="Si no está en la lista, créalo en la pestaña «Principios activos»">
          <select required value={f.principioActivoId} onChange={(e) => setF({ ...f, principioActivoId: e.target.value })} className={claseInput}>
            <option value="">Elige…</option>{principios.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.riesgo !== 'NORMAL' ? ` (${RIESGO[x.riesgo][0]})` : ''}</option>)}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          {t('laboratorio', 'Laboratorio', { required: true })}{t('concentracion', 'Concentración', { required: true, placeholder: '500 mg' })}
          {t('forma', 'Forma', { required: true })}{t('unidadesPorCaja', 'Unidades por caja', { inputMode: 'numeric', required: true })}
          {t('precioUsd', 'Precio ($)', { inputMode: 'decimal', required: true })}
          <Campo etiqueta="Nivel de precio"><select value={f.nivel} onChange={(e) => setF({ ...f, nivel: e.target.value })} className={claseInput}>{NIVELES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          {t('codigoBarras', 'Código de barras', { inputMode: 'numeric' })}{t('stockMinimo', 'Stock mínimo', { inputMode: 'numeric' })}
          <Campo etiqueta="Categoría"><select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} className={claseInput}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></Campo>
          <Campo etiqueta="IVA" ayuda="La mayoría de los medicamentos son exentos"><select value={f.ivaPct} onChange={(e) => setF({ ...f, ivaPct: e.target.value })} className={claseInput}><option value="0">Exento</option><option value="8">8 %</option><option value="16">16 %</option></select></Campo>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.requiereRecipe} onChange={(e) => setF({ ...f, requiereRecipe: e.target.checked })} className="h-4 w-4" /> Necesita récipe</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} className="h-4 w-4" /> Activo (se puede vender)</label>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar</Button>
      </form>
    </Sheet>
  );
}

function FormPrincipio({ p, onCerrar, onListo }: { p: Principio | 'nuevo' | null; onCerrar: () => void; onListo: () => void }) {
  const base = p && p !== 'nuevo' ? p : null;
  const [f, setF] = useState({ nombre: '', familia: '', riesgo: 'NORMAL', uso: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setF({ nombre: base?.nombre ?? '', familia: base?.familia ?? '', riesgo: base?.riesgo ?? 'NORMAL', uso: base?.uso ?? '' }); setError(null); }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet open={!!p} onClose={onCerrar} title={base ? `Editar ${base.nombre}` : 'Nuevo principio activo'}>
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          await api(base ? `/catalogo/principios/${base.id}` : '/catalogo/principios', { method: base ? 'PATCH' : 'POST', body: { nombre: f.nombre, familia: f.familia || undefined, riesgo: f.riesgo, uso: f.uso || undefined } });
          avisar('Guardado', 'ok'); onListo(); onCerrar();
        } catch (err) { setError(msg(err)); }
      }}>
        <Campo etiqueta="Nombre"><input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={claseInput} /></Campo>
        <Campo etiqueta="Tipo" ayuda="Psicotrópico: pide récipe y permiso, y va al libro de controlados. Antibiótico: pide récipe.">
          <select value={f.riesgo} onChange={(e) => setF({ ...f, riesgo: e.target.value })} className={claseInput}>{Object.entries(RIESGO).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}</select>
        </Campo>
        <Campo etiqueta="Familia" ayuda="Para cruzar alergias. Ej. penicilinas, AINES, sulfas"><input value={f.familia} onChange={(e) => setF({ ...f, familia: e.target.value })} className={claseInput} /></Campo>
        <Campo etiqueta="Para qué sirve"><input value={f.uso} onChange={(e) => setF({ ...f, uso: e.target.value })} className={claseInput} /></Campo>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar</Button>
      </form>
    </Sheet>
  );
}

interface LoteAdm { id: string; numero: string; vence: string; stockLibre: number; producto: { nombreComercial: string; concentracion: string } }
interface Ajuste { id: string; creadoEn: string; producto: string; lote: string; cantidad: number; motivo: string; nota: string | null; usuario: string }
const MOTIVOS: [string, string][] = [['MERMA', 'Merma'], ['ROTO', 'Roto'], ['VENCIDO', 'Vencido'], ['CONTEO', 'Conteo físico'], ['OTRO', 'Otro']];

function FormAjuste({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const lotes = useCargar(() => (abierto ? api<LoteAdm[]>('/inventario/lotes') : Promise.resolve([])), [abierto]);
  const [q, setQ] = useState('');
  const [lote, setLote] = useState<LoteAdm | null>(null);
  const [motivo, setMotivo] = useState('MERMA');
  const [n, setN] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const conteo = motivo === 'CONTEO';
  const filtrados = (lotes.datos ?? []).filter((l) => `${l.producto.nombreComercial} ${l.numero}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  return (
    <Sheet open={abierto} onClose={onCerrar} title="Ajuste de inventario">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        if (!lote) { setError('Elige el lote'); return; }
        const valor = Number(n);
        const cantidad = conteo ? valor - lote.stockLibre : -Math.abs(valor);
        if (!cantidad) { setError(conteo ? 'El conteo coincide con el sistema: no hay nada que ajustar' : 'Escribe la cantidad'); return; }
        try {
          await api('/inventario/ajustes', { body: { loteId: lote.id, cantidad, motivo, nota: nota || undefined } });
          avisar(`Ajuste guardado (${cantidad > 0 ? '+' : ''}${cantidad})`, 'ok'); setLote(null); setN(''); setNota(''); onListo(); onCerrar();
        } catch (err) { setError(msg(err)); }
      }}>
        {lote ? (
          <Card className="flex items-center justify-between p-3 text-sm"><div><b>{lote.producto.nombreComercial} {lote.producto.concentracion}</b><div className="text-muted">Lote {lote.numero} · en sistema: {lote.stockLibre}</div></div><Button size="sm" type="button" onClick={() => setLote(null)}>Cambiar</Button></Card>
        ) : (
          <>
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Buscar producto o lote" />
            <div className="flex flex-col gap-1">{filtrados.map((l) => <button type="button" key={l.id} onClick={() => setLote(l)} className="rounded-lg border border-line p-2 text-left text-sm hover:bg-surface2">{l.producto.nombreComercial} {l.producto.concentracion} · lote {l.numero} · {l.stockLibre} libres</button>)}</div>
          </>
        )}
        <Campo etiqueta="Motivo"><select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={claseInput}>{MOTIVOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo etiqueta={conteo ? 'Unidades contadas en el estante' : 'Unidades que se sacan'}><input required inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} className={claseInput} /></Campo>
        <Campo etiqueta="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} className={claseInput} /></Campo>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar ajuste</Button>
      </form>
    </Sheet>
  );
}

function CambiarPrecios({ abierto, onCerrar, onListo }: { abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const labs = useCargar(() => (abierto ? api<string[]>('/catalogo/laboratorios') : Promise.resolve([])), [abierto]);
  const [por, setPor] = useState<'laboratorio' | 'categoria'>('laboratorio');
  const [valor, setValor] = useState('');
  const [pct, setPct] = useState('5');
  const [prev, setPrev] = useState<{ nombre: string; antes: string; despues: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPrev(null); setError(null); }, [por, valor, pct, abierto]);
  const enviar = async (vistaPrevia: boolean) => {
    setError(null);
    try {
      const r = await api<{ cambios: { nombre: string; antes: string; despues: string }[] }>('/catalogo/precios/masivo', { body: { [por]: valor, pct: Number(pct.replace(',', '.')), vistaPrevia } });
      if (vistaPrevia) setPrev(r.cambios);
      else { avisar(`${r.cambios.length} precios actualizados`, 'ok'); onListo(); onCerrar(); }
    } catch (e) { setError(msg(e)); }
  };
  return (
    <Sheet open={abierto} onClose={onCerrar} title="Cambiar precios">
      <div className="flex flex-col gap-3">
        <Tabs tabs={['Por laboratorio', 'Por categoría']} value={por === 'laboratorio' ? 'Por laboratorio' : 'Por categoría'} onChange={(t) => { setPor(t === 'Por laboratorio' ? 'laboratorio' : 'categoria'); setValor(''); }} />
        <Campo etiqueta={por === 'laboratorio' ? 'Laboratorio' : 'Categoría'}>
          <select value={valor} onChange={(e) => setValor(e.target.value)} className={claseInput}>
            <option value="">Elige…</option>{(por === 'laboratorio' ? labs.datos ?? [] : [...CATEGORIAS]).map((x) => <option key={x}>{x}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Cambio en %" ayuda="5 sube 5 %. −10 baja 10 %. Se redondea a 0,05 $"><input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.,-]/g, ''))} className={claseInput} /></Campo>
        {error && <Alert tone="bad">{error}</Alert>}
        {!prev ? <Button variant="primary" size="lg" disabled={!valor} onClick={() => enviar(true)}>Ver cómo quedan</Button> : (
          <>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-line text-sm">
              {prev.map((c) => <div key={c.nombre} className="flex justify-between border-b border-line px-3 py-1.5 last:border-0"><span className="truncate">{c.nombre}</span><span className="font-mono">{usd(c.antes)} → <b>{usd(c.despues)}</b></span></div>)}
              {!prev.length && <div className="p-3 text-muted">No hay productos activos ahí.</div>}
            </div>
            <Button variant="primary" size="lg" disabled={!prev.length} onClick={() => enviar(false)}>Confirmar {prev.length} precios</Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

export function CatalogoPage() {
  const rol = useRol();
  const [tab, setTab] = useState<'Productos' | 'Principios activos' | 'Ajustes'>('Productos');
  const [q, setQ] = useState('');
  const [soloBajo, setSoloBajo] = useState(false);
  const [cat, setCat] = useState('');
  const [precios, setPrecios] = useState(false);
  const prods0 = useCargar(() => api<ProductoAdm[]>(`/catalogo/productos?q=${encodeURIComponent(q)}${soloBajo ? '&bajo=1' : ''}`), [q, soloBajo]);
  const prods = { ...prods0, datos: prods0.datos && (cat ? prods0.datos.filter((p) => p.categoria === cat) : prods0.datos) };
  const princ = useCargar(() => api<Principio[]>('/catalogo/principios'), []);
  const ajustes = useCargar(() => api<Ajuste[]>('/inventario/ajustes'), []);
  const [editP, setEditP] = useState<ProductoAdm | 'nuevo' | null>(null);
  const [editPa, setEditPa] = useState<Principio | 'nuevo' | null>(null);
  const [ajuste, setAjuste] = useState(false);
  const admin = rol === 'ADMIN';
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Catálogo" subtitle="Productos, principios activos y ajustes de inventario"
        actions={<>
          {tab === 'Productos' && admin && <Button onClick={() => setPrecios(true)}>Cambiar precios</Button>}
          {tab === 'Productos' && admin && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditP('nuevo')}>Nuevo producto</Button>}
          {tab === 'Principios activos' && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditPa('nuevo')}>Nuevo principio</Button>}
          {tab === 'Ajustes' && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAjuste(true)}>Nuevo ajuste</Button>}
        </>} />
      <Tabs tabs={['Productos', 'Principios activos', 'Ajustes']} value={tab} onChange={setTab} />
      {tab === 'Productos' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput className="min-w-[220px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Buscar por nombre, laboratorio o código" />
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-11 rounded-lg border border-line bg-surface px-2 text-sm"><option value="">Todas las categorías</option>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} className="h-4 w-4" /> Solo stock bajo</label>
          </div>
          <Estado c={prods}>{(d) => (
            <Tabla vacio="No hay productos con esa búsqueda." head={['Producto', 'Principio', 'Precio', 'Costo · margen', 'Existencia', 'Estado', '']} rows={d.map((p) => [
              <div><div className="font-semibold">{p.nombreComercial} {p.concentracion}</div><div className="text-xs text-muted">{p.laboratorio} · {p.categoria}{p.ivaPct ? ` · IVA ${p.ivaPct} %` : ''}{p.codigoBarras ? ` · ${p.codigoBarras}` : ''}</div></div>,
              <span>{p.principioActivo.nombre} {p.principioActivo.riesgo !== 'NORMAL' && <Chip tone={RIESGO[p.principioActivo.riesgo][1]}>{RIESGO[p.principioActivo.riesgo][0]}</Chip>}</span>,
              mono(usd(p.precioUsd)),
              p.costoUsd ? <span className="font-mono tabular">{usd(p.costoUsd)} · <span className={p.margenPct != null && p.margenPct < 15 ? 'text-bad' : 'text-ok'}>{p.margenPct} %</span></span> : <span className="text-xs text-muted">Sin costo</span>,
              p.bajo ? <Chip tone="bad">{p.stock} · mín. {p.stockMinimo}</Chip> : mono(p.stock),
              p.activo ? <Chip tone="ok">Activo</Chip> : <Chip>Inactivo</Chip>,
              admin && <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditP(p)}>Editar</Button>,
            ])} />
          )}</Estado>
        </>
      )}
      {tab === 'Principios activos' && <Estado c={princ}>{(d) => (
        <Tabla vacio="Aún no hay principios activos." head={['Nombre', 'Tipo', 'Familia', 'Para qué sirve', '']} rows={d.map((p) => [
          <span className="font-semibold">{p.nombre}</span>, <Chip tone={RIESGO[p.riesgo][1]}>{RIESGO[p.riesgo][0]}</Chip>, p.familia ?? '—', <span className="text-muted">{p.uso ?? '—'}</span>,
          <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditPa(p)}>Editar</Button>,
        ])} />
      )}</Estado>}
      {tab === 'Ajustes' && <Estado c={ajustes}>{(d) => (
        <Tabla vacio="Sin ajustes todavía." head={['Fecha', 'Producto', 'Lote', 'Cantidad', 'Motivo', 'Quién']} rows={d.map((a) => [
          mono(fechaHora(a.creadoEn)), a.producto, mono(a.lote), <Chip tone={a.cantidad < 0 ? 'bad' : 'ok'}>{a.cantidad > 0 ? '+' : ''}{a.cantidad}</Chip>,
          <span>{MOTIVOS.find((m) => m[0] === a.motivo)?.[1]}{a.nota ? <span className="text-muted"> · {a.nota}</span> : ''}</span>, a.usuario,
        ])} />
      )}</Estado>}
      <CambiarPrecios abierto={precios} onCerrar={() => setPrecios(false)} onListo={prods0.recargar} />
      <FormProducto p={editP} principios={princ.datos ?? []} onCerrar={() => setEditP(null)} onListo={prods0.recargar} />
      <FormPrincipio p={editPa} onCerrar={() => setEditPa(null)} onListo={() => { princ.recargar(); prods0.recargar(); }} />
      <FormAjuste abierto={ajuste} onCerrar={() => setAjuste(false)} onListo={() => { ajustes.recargar(); prods0.recargar(); }} />
    </div>
  );
}

/* ───────── Auditoría ───────── */
interface Registro { id: string; creadaEn: string; accion: string; entidad: string; datos: unknown; usuario: { nombre: string } | null }
const ENTIDADES: [string, string][] = [['', 'Todo'], ['Venta', 'Ventas'], ['Turno', 'Caja'], ['Producto', 'Productos'], ['Lote', 'Inventario'], ['Compra', 'Compras'], ['Usuario', 'Usuarios'], ['Recipe', 'Récipes']];

export function AuditoriaPage() {
  const [entidad, setEntidad] = useState('');
  const reg = useCargar(() => api<Registro[]>(`/auditoria?entidad=${entidad}`), [entidad]);
  const detalle = (d: unknown) => {
    if (!d || typeof d !== 'object') return '';
    return Object.entries(d as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object').map(([k, v]) => `${k}: ${v}`).join(' · ');
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Auditoría" subtitle="Quién hizo qué y cuándo. No se puede borrar ni editar." />
      <Tabs tabs={ENTIDADES.map((e) => e[1])} value={ENTIDADES.find((e) => e[0] === entidad)![1]} onChange={(t) => setEntidad(ENTIDADES.find((e) => e[1] === t)![0])} />
      <Estado c={reg}>{(d) => (
        <Tabla vacio="Sin registros." head={['Fecha', 'Quién', 'Acción', 'Detalle']} rows={d.filter((r) => !/TOKEN|SESION_RENOVADA/.test(r.accion)).map((r) => [
          mono(fechaHora(r.creadaEn)), r.usuario?.nombre ?? 'Sistema', <Chip tone={/ANUL|DIFERENCIA|RECHAZ|DEVOL/.test(r.accion) ? 'warn' : 'neutral'}>{r.accion.replace(/_/g, ' ').toLowerCase()}</Chip>,
          <span className="text-xs text-muted">{detalle(r.datos)}</span>,
        ])} />
      )}</Estado>
    </div>
  );
}

/* ───────── Editar cliente ───────── */
export function EditarCliente({ p, onCerrar, onListo }: { p: Paciente | null; onCerrar: () => void; onListo: (p: Paciente) => void }) {
  const [f, setF] = useState({ nombre: '', telefono: '', alergias: '', condiciones: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (p) setF({ nombre: p.nombre, telefono: p.telefono, alergias: p.alergias.join(', '), condiciones: p.condiciones.join(', ') }); setError(null); }, [p]);
  const lista = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  return (
    <Sheet open={!!p} onClose={onCerrar} title="Editar cliente">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const r = await api<Paciente>(`/pacientes/${encodeURIComponent(p!.cedula)}`, { method: 'PATCH', body: { nombre: f.nombre, telefono: f.telefono, alergias: lista(f.alergias), condiciones: lista(f.condiciones) } });
          avisar('Cliente actualizado', 'ok'); onListo({ ...p!, ...r }); onCerrar();
        } catch (err) { setError(msg(err)); }
      }}>
        <Campo etiqueta="Nombre"><input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={claseInput} /></Campo>
        <Campo etiqueta="Teléfono"><input required value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className={claseInput} /></Campo>
        <Campo etiqueta="Alergias" ayuda="Separadas por coma"><input value={f.alergias} onChange={(e) => setF({ ...f, alergias: e.target.value })} className={claseInput} /></Campo>
        <Campo etiqueta="Condiciones" ayuda="Ej. hipertenso, diabético"><input value={f.condiciones} onChange={(e) => setF({ ...f, condiciones: e.target.value })} className={claseInput} /></Campo>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar</Button>
      </form>
    </Sheet>
  );
}

/* ───────── Médico del récipe ───────── */
export function MedicoRecipe({ recipeId }: { recipeId: string }) {
  const [f, setF] = useState({ nombre: '', mpps: '' });
  const [guardado, setGuardado] = useState<string | null>(null);
  const medicos = useCargar(() => api<{ nombre: string; mpps: string | null }[]>('/recipes/medicos/lista'), []);
  if (guardado) return <Chip tone="ok">Médico: {guardado}</Chip>;
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
      e.preventDefault();
      try {
        const m = await api<{ nombre: string }>(`/recipes/${recipeId}/medico`, { body: { nombre: f.nombre, mpps: f.mpps || undefined } });
        setGuardado(m.nombre);
      } catch (err) { avisar(msg(err), 'bad'); }
    }}>
      <Campo etiqueta="Médico"><input required list="medicos" value={f.nombre} onChange={(e) => {
        const m = medicos.datos?.find((x) => x.nombre === e.target.value);
        setF({ nombre: e.target.value, mpps: m?.mpps ?? f.mpps });
      }} className={claseInput} placeholder="Dr. Pérez" /></Campo>
      <datalist id="medicos">{medicos.datos?.map((m) => <option key={m.nombre + m.mpps} value={m.nombre} />)}</datalist>
      <Campo etiqueta="MPPS"><input inputMode="numeric" value={f.mpps} onChange={(e) => setF({ ...f, mpps: e.target.value.replace(/\D/g, '') })} className={claseInput + ' w-28'} /></Campo>
      <Button type="submit" size="sm" className="h-11">Guardar médico</Button>
    </form>
  );
}

/* ───────── Clave de dos pasos ───────── */
export function DosPasos() {
  const yo = useCargar(() => api<{ dosPasos: boolean }>('/auth/yo'), []);
  const [qr, setQr] = useState<{ img: string; secreto: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!yo.datos) return null;
  const activo = yo.datos.dosPasos;
  const iniciar = async () => {
    setError(null);
    const r = await api<{ secreto: string; url: string }>('/auth/2fa/iniciar', { body: {} });
    const { toDataURL } = await import('qrcode');
    setQr({ img: await toDataURL(r.url, { margin: 1, width: 220 }), secreto: r.secreto });
  };
  const confirmar = async (ruta: 'activar' | 'desactivar') => {
    setError(null);
    try {
      await api(`/auth/2fa/${ruta}`, { body: { codigo } });
      avisar(ruta === 'activar' ? 'Clave de dos pasos activada' : 'Clave de dos pasos desactivada', 'ok');
      setQr(null); setCodigo(''); yo.recargar();
    } catch (e) { setError(msg(e)); }
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="font-semibold">Clave de dos pasos (tu cuenta)</div>
          <div className="text-sm text-muted">Además de la clave, pide un código de la app Google Authenticator o Authy de tu teléfono.</div></div>
        {activo ? <Chip tone="ok">Activada</Chip> : !qr && <Button variant="primary" onClick={() => void iniciar()}>Activar</Button>}
      </div>
      {qr && !activo && (
        <div className="flex flex-wrap items-center gap-4">
          <img src={qr.img} alt="Código QR para la app de autenticación" className="h-[180px] w-[180px] rounded-lg bg-white p-1" />
          <div className="flex min-w-[220px] flex-1 flex-col gap-2 text-sm">
            <ol className="list-decimal pl-5 text-muted"><li>Abre Google Authenticator o Authy y escanea el código.</li><li>Escribe los 6 números que te muestra.</li></ol>
            <p className="text-xs text-muted">¿No puedes escanear? Clave: <span className="select-all font-mono">{qr.secreto}</span></p>
            <div className="flex gap-2"><input inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="000000" className={claseInput + ' w-32 text-center font-mono'} />
              <Button variant="primary" disabled={codigo.length !== 6} onClick={() => void confirmar('activar')}>Confirmar</Button></div>
          </div>
        </div>
      )}
      {activo && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Para quitarla, escribe un código actual:</span>
          <input inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} className={claseInput + ' w-28 text-center font-mono'} />
          <Button variant="ghost" disabled={codigo.length !== 6} onClick={() => void confirmar('desactivar')}>Desactivar</Button>
        </div>
      )}
      {error && <Alert tone="bad">{error}</Alert>}
    </Card>
  );
}
