import { clsx } from 'clsx';
import { Camera } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Campo, Card, Cargando, Chip, ErrorCarga, PageHeader, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useCargar } from '@/lib/useCargar';
import type { Venta } from '@/lib/tipos';
import { fechaVe } from '@farmacia/shared';
import { avisar } from '@/store/avisos';
import { useRol } from '@/store/sesion';
import { nVentas } from '@/lib/format';
import Ticket from '@/features/caja/Ticket';
import { useConfig } from '@/store/config';

const usd = (v: string | number) => `$${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaHora = (d: string) => new Date(d).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const msg = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.errores.map((x) => x.mensaje)].join('. ') : 'No se pudo completar');
const mono = (s: ReactNode) => <span className="font-mono tabular">{s}</span>;
const hoy = () => fechaVe();

function Tabs<T extends string>({ tabs, value, onChange }: { tabs: T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface2 p-1">
      {tabs.map((t) => <button key={t} onClick={() => onChange(t)} className={clsx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold', value === t ? 'bg-surface text-fg shadow-sm' : 'text-muted')}>{t}</button>)}
    </div>
  );
}

function Tabla({ head, rows, vacio }: { head: ReactNode[]; rows: ReactNode[][]; vacio: string }) {
  if (!rows.length) return <Card className="p-6 text-center text-sm text-muted">{vacio}</Card>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="border-b border-line text-left text-xs text-muted">{head.map((h, i) => <th key={i} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
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
  const [comp, setComp] = useState<{ monto: string; metodo: string; motivo: string; items: string[]; fecha: string } | null>(null);
  const farmacia = useConfig((s) => s.config?.farmacia);
  const [cant, setCant] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO_USD');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setModo('ver'); setCant({}); setMotivo(''); setError(null); }, [id]);
  const d = v.datos;
  if (!id) return null;
  if (modo === 'ticket' && d) return <Ticket venta={d} onCerrar={() => setModo('ver')} />;
  if (comp && d) return (
    <Sheet open onClose={() => setComp(null)} title="Comprobante de devolución">
      <div className="flex flex-col gap-4">
        <div id="ticket" className="mx-auto w-full max-w-[320px] rounded-lg border border-line bg-white p-4 font-mono text-[12px] leading-snug text-black">
          <div className="text-center"><div className="text-[14px] font-bold">{farmacia?.nombre ?? 'Farmacia'}</div>{farmacia?.rif && <div>RIF {farmacia.rif}</div>}
            <div className="mt-1 font-bold">DEVOLUCIÓN · VENTA N.º {d.numero}</div><div>{fechaHora(comp.fecha)}</div></div>
          <div className="my-2 border-t border-dashed border-black" />
          {comp.items.map((t) => <div key={t}>{t}</div>)}
          <div className="my-2 border-t border-dashed border-black" />
          <div className="flex justify-between font-bold"><span>DEVUELTO</span><span>{comp.monto}</span></div>
          <div>Forma: {METODOS.find((m) => m[0] === comp.metodo)?.[1]}</div>
          <div>Motivo: {comp.motivo}</div>
          <div className="mt-8 border-t border-black pt-1 text-center">Firma del cliente</div>
        </div>
        <div className="grid grid-cols-2 gap-2"><Button size="lg" onClick={() => window.print()}>Imprimir</Button><Button size="lg" variant="primary" onClick={() => setComp(null)}>Listo</Button></div>
      </div>
    </Sheet>
  );
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
                const monto = `${r.metodo === 'EFECTIVO_USD' ? '$' : 'Bs '}${Number(r.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
                avisar(`Devolución hecha: entregar ${monto}`, 'ok');
                setComp({ monto, metodo, motivo, fecha: new Date().toISOString(), items: lineas.map((x) => { const l = d.lineas.find((y) => y.id === x.lineaId)!; return `${x.cantidad} x ${l.producto.nombreComercial} ${l.producto.concentracion ?? ''}`; }) });
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
        <div className="ml-auto text-right text-sm text-muted">{nVentas(activas.length)} · <b className="font-mono text-fg">{usd(activas.reduce((a, v) => a + Number(v.totalUsd), 0))}</b></div>
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
