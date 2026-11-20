import { clsx } from 'clsx';
import { CheckCircle2, Printer, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { METODOS_PAGO, type MetodoPago } from '@farmacia/shared';
import { Alert, Button, Campo, Card, Cargando, Chip, ErrorCarga, PageHeader, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fecha, hora, num2, usd } from '@/lib/format';
import type { Montos, Turno } from '@/lib/tipos';
import { useCargar } from '@/lib/useCargar';
import { avisar } from '@/store/avisos';
import { useCaja } from '@/store/caja';
import { useRol, useSesion } from '@/store/sesion';
import { useConfig } from '@/store/config';
import AbrirCaja, { leerMonto } from './AbrirCaja';
import { NOMBRE_METODO } from './Ticket';

const moneda = (m: MetodoPago) => (m === 'EFECTIVO_USD' ? '$' : 'Bs');
const monto = (m: MetodoPago, v: number) => (moneda(m) === '$' ? usd(v) : `Bs ${num2(v)}`);
const cuadra = (d: Montos | null) => !!d && METODOS_PAGO.every((m) => Math.abs(d[m]) < 0.005);

/** Tabla esperado / contado / diferencia de un cierre. */
function TablaCierre({ t }: { t: Turno }) {
  if (!t.esperado || !t.contado || !t.diferencia) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted"><th className="py-2 pr-2 font-semibold">Método</th><th className="px-2 py-2 text-right font-semibold">Esperado</th><th className="px-2 py-2 text-right font-semibold">Contado</th><th className="py-2 pl-2 text-right font-semibold">Diferencia</th></tr></thead>
        <tbody>
          {METODOS_PAGO.map((m) => {
            const d = t.diferencia![m];
            return (
              <tr key={m} className="border-b border-line last:border-0">
                <td className="py-2 pr-2">{NOMBRE_METODO[m]}</td>
                <td className="px-2 py-2 text-right font-mono">{monto(m, t.esperado![m])}</td>
                <td className="px-2 py-2 text-right font-mono">{monto(m, t.contado![m])}</td>
                <td className={clsx('py-2 pl-2 text-right font-mono font-semibold', Math.abs(d) < 0.005 ? 'text-ok' : d < 0 ? 'text-bad' : 'text-warn')}>{d > 0 ? '+' : ''}{monto(m, d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Hoja del cierre (reporte de caja) para imprimir y firmar. Sale en la impresora de tickets. */
function HojaCierre({ t, onCerrar }: { t: (Turno & { ventas?: number; totalUsd?: string }) | null; onCerrar: () => void }) {
  const cfg = useConfig((s) => s.config);
  const farmacia = useCaja((s) => s.farmacia);
  const yo = useSesion((s) => s.usuario);
  if (!t || !t.esperado || !t.contado || !t.diferencia) return null;
  const ancho = cfg?.ticketAncho ?? 80;
  const linea = (a: string, b: string, negrita?: boolean) => <div className={clsx('flex justify-between gap-2', negrita && 'font-bold')}><span>{a}</span><span>{b}</span></div>;
  return (
    <Sheet open onClose={onCerrar} title="Cierre de caja">
      <style>{`@media print { @page { size: ${ancho}mm auto; margin: 0; } #ticket { width: ${ancho - 6}mm !important; font-size: ${cfg?.ticketLetra ?? 12}px !important; } }`}</style>
      <div className="flex flex-col gap-4">
        <div id="ticket" className="mx-auto w-full rounded-lg border border-line bg-white p-4 font-mono text-[12px] leading-snug text-black" style={{ maxWidth: ancho === 58 ? 240 : 320 }}>
          <div className="text-center">
            <div className="text-[14px] font-bold">{cfg?.farmacia.nombre ?? farmacia.nombre}</div>
            <div className="mt-1 font-bold">CIERRE DE CAJA</div>
            <div>Cajero: {t.cajero?.nombre ?? yo?.nombre}</div>
            <div>Abrió: {fecha(t.abiertoEn)} {hora(t.abiertoEn)}</div>
            {t.cerradoEn && <div>Cerró: {fecha(t.cerradoEn)} {hora(t.cerradoEn)}</div>}
          </div>
          <div className="my-2 border-t border-dashed border-black" />
          {linea('Fondo inicial', `${num2(t.fondoUsd)} $ / ${num2(t.fondoBs)} Bs`)}
          {(t.ventas ?? t._count?.ventas) !== undefined && linea('Ventas', String(t.ventas ?? t._count?.ventas))}
          {t.totalUsd !== undefined && linea('Total vendido', `${num2(t.totalUsd)} $`, true)}
          {METODOS_PAGO.map((m) => (
            <div key={m}>
              <div className="my-1 border-t border-dashed border-black" />
              <div className="font-bold">{NOMBRE_METODO[m]} ({moneda(m)})</div>
              {linea('Esperado', num2(t.esperado![m]))}
              {linea('Contado', num2(t.contado![m]))}
              {linea('Diferencia', `${t.diferencia![m] > 0 ? '+' : ''}${num2(t.diferencia![m])}`, Math.abs(t.diferencia![m]) >= 0.005)}
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-black" />
          <div className="text-center font-bold">{cuadra(t.diferencia) ? 'LA CAJA CUADRA' : 'CAJA CON DIFERENCIA'}</div>
          {t.nota && <div className="mt-1">Nota: {t.nota}</div>}
          <div className="mt-8 border-t border-black pt-1 text-center">Firma del cajero</div>
          <div className="mt-8 border-t border-black pt-1 text-center">Firma de quien recibe</div>
          <div className="mt-2 text-center text-[10px]">Impreso {new Date().toLocaleString('es-VE')}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" icon={<Printer className="h-5 w-5" />} onClick={() => window.print()}>Imprimir</Button>
          <Button size="lg" variant="primary" onClick={onCerrar}>Listo</Button>
        </div>
      </div>
    </Sheet>
  );
}

function CerrarCaja({ onCerrada }: { onCerrada: (t: Turno) => void }) {
  const { turno, ventas, totalUsd } = useCaja();
  const cargar = useCaja((s) => s.cargar);
  const [contado, setContado] = useState<Record<MetodoPago, string>>({ EFECTIVO_USD: '', EFECTIVO_BS: '', PAGO_MOVIL: '', PUNTO_DE_VENTA: '' });
  const [nota, setNota] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!turno) return null;

  const cerrar = async () => {
    const valores = Object.fromEntries(METODOS_PAGO.map((m) => [m, leerMonto(contado[m])])) as Montos;
    if (METODOS_PAGO.some((m) => !(valores[m] >= 0))) { setError('Revisa los montos: solo números, por ejemplo 1.250,50'); return; }
    try {
      const t = await api<Turno & { cuadra: boolean }>('/caja/cerrar', { body: { contado: valores, nota: nota || undefined } });
      await cargar();
      onCerrada(t);
      avisar(t.cuadra ? 'Caja cerrada: cuadra perfecto' : 'Caja cerrada con diferencia', t.cuadra ? 'ok' : 'bad');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo cerrar'); }
  };

  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Mi caja</h2>
          <p className="text-sm text-muted">Abierta desde las {hora(turno.abiertoEn)} · fondo {usd(turno.fondoUsd)} y Bs {num2(turno.fondoBs)}</p>
        </div>
        <Chip tone="ok">Abierta · {ventas} ventas · {usd(totalUsd)}</Chip>
      </div>
      <p className="text-sm">Para cerrar, <b>cuenta lo que tienes</b> y escríbelo. El sistema te dirá si cuadra.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {METODOS_PAGO.map((m) => (
          <Campo key={m} etiqueta={`${NOMBRE_METODO[m]} (${moneda(m)})`} ayuda={m === 'PAGO_MOVIL' || m === 'PUNTO_DE_VENTA' ? 'Lo que dice el banco o el cierre del punto' : 'Billetes en la gaveta, con el fondo'}>
            <input id={`contado-${m}`} inputMode="decimal" placeholder="0" value={contado[m]} onChange={(e) => setContado({ ...contado, [m]: e.target.value })} className={`${claseInput} font-mono`} />
          </Campo>
        ))}
      </div>
      <Campo etiqueta="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: un cliente pagó con un billete roto" className={claseInput} /></Campo>
      {error && <Alert tone="bad">{error}</Alert>}
      {confirmar ? (
        <div className="flex flex-col gap-2 rounded-xl bg-warn-soft p-3">
          <span className="text-sm font-semibold text-warn">¿Seguro? Después de cerrar no podrás vender hasta abrir otra caja.</span>
          <div className="flex gap-2"><Button variant="primary" onClick={cerrar}>Sí, cerrar caja</Button><Button onClick={() => setConfirmar(false)}>Volver</Button></div>
        </div>
      ) : <Button variant="primary" size="lg" onClick={() => setConfirmar(true)}>Cerrar caja</Button>}
    </Card>
  );
}

/** El dueño cierra una caja que alguien dejó abierta: cuenta lo que hay y la caja queda libre para el próximo turno. */
function CerrarDeOtro({ t, listo }: { t: Turno; listo: () => void }) {
  const [contado, setContado] = useState<Record<MetodoPago, string>>({ EFECTIVO_USD: '', EFECTIVO_BS: '', PAGO_MOVIL: '', PUNTO_DE_VENTA: '' });
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface2 p-3">
      <p className="text-sm">¿{t.cajero?.nombre} dejó esta caja abierta? Cuenta lo que hay y ciérrala tú. Queda anotado que la cerraste.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {METODOS_PAGO.map((m) => (
          <Campo key={m} etiqueta={`${NOMBRE_METODO[m]} (${moneda(m)})`}>
            <input inputMode="decimal" placeholder="0" value={contado[m]} onChange={(e) => setContado({ ...contado, [m]: e.target.value })} className={`${claseInput} font-mono`} />
          </Campo>
        ))}
      </div>
      {error && <Alert tone="bad">{error}</Alert>}
      <Button size="sm" variant="primary" className="self-start" onClick={async () => {
        const valores = Object.fromEntries(METODOS_PAGO.map((m) => [m, leerMonto(contado[m])])) as Montos;
        if (METODOS_PAGO.some((m) => !(valores[m] >= 0))) { setError('Revisa los montos: solo números'); return; }
        try { await api(`/caja/turnos/${t.id}/cerrar`, { body: { contado: valores } }); avisar('Caja cerrada', 'ok'); listo(); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo cerrar'); }
      }}>Cerrar esta caja</Button>
    </div>
  );
}

function Cierres() {
  const rol = useRol();
  const { datos, error, cargando, recargar } = useCargar(() => api<Turno[]>('/caja/turnos'), [], 30_000);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [hoja, setHoja] = useState<Turno | null>(null);
  return (
    <Card>
      <HojaCierre t={hoja} onCerrar={() => setHoja(null)} />
      <h2 className="text-lg font-bold">Cierres de caja (últimos 14 días)</h2>
      {error && <ErrorCarga mensaje={error} reintentar={recargar} />}
      {cargando ? <Cargando /> : !datos?.length ? <p className="text-sm text-muted">Todavía no hay turnos.</p> : (
        <ul className="flex flex-col divide-y divide-line">
          {datos.map((t) => (
            <li key={t.id} className="flex flex-col gap-2 py-3">
              <button className="flex flex-wrap items-center justify-between gap-2 text-left" onClick={() => setAbierto(abierto === t.id ? null : t.id)}>
                <span className="min-w-0">
                  <span className="font-semibold">{t.cajero?.nombre}</span>
                  <span className="block text-xs text-muted">{fecha(t.abiertoEn)} {hora(t.abiertoEn)}{t.cerradoEn ? ` → ${hora(t.cerradoEn)}` : ''} · {t._count?.ventas ?? 0} ventas</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {t.estado === 'ABIERTO' ? <Chip tone="info">Abierta</Chip> : cuadra(t.diferencia) ? <Chip tone="ok">Cuadra</Chip> : <Chip tone="bad">Con diferencia</Chip>}
                  {t.revisadoEn && <Chip tone="ok" icon={<CheckCircle2 className="h-3 w-3" />}>Revisado</Chip>}
                </span>
              </button>
              {abierto === t.id && t.estado === 'ABIERTO' && rol === 'ADMIN' && <CerrarDeOtro t={t} listo={() => { setAbierto(null); recargar(); }} />}
              {abierto === t.id && t.estado === 'CERRADO' && (
                <div className="flex flex-col gap-2 rounded-lg bg-surface2 p-3">
                  <TablaCierre t={t} />
                  {t.nota && <p className="text-sm"><b>Nota:</b> {t.nota}</p>}
                  <Button size="sm" className="self-start" icon={<Printer className="h-4 w-4" />} onClick={() => setHoja(t)}>Imprimir cierre</Button>
                  {rol === 'ADMIN' && !t.revisadoEn && (
                    <Button size="sm" className="self-start" onClick={async () => {
                      try { await api(`/caja/turnos/${t.id}/revisar`, { method: 'POST' }); avisar('Cierre marcado como revisado', 'ok'); recargar(); }
                      catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo', 'bad'); }
                    }}>Marcar como revisado</Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function CajaPage() {
  const rol = useRol();
  const { turno, cargada, cargar } = useCaja();
  const [ultimo, setUltimo] = useState<Turno | null>(null);
  const [hoja, setHoja] = useState(false);
  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title="Caja" subtitle="Abre tu turno con el sencillo y ciérralo contando lo que tienes" />
      {ultimo && (
        <Card className={clsx('border-2', cuadra(ultimo.diferencia) ? 'border-ok/50' : 'border-bad/50')}>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            <h2 className="text-lg font-bold">{cuadra(ultimo.diferencia) ? 'Tu caja cuadra' : 'Tu caja tiene diferencia'}</h2>
          </div>
          <TablaCierre t={ultimo} />
          {!cuadra(ultimo.diferencia) && <p className="text-sm text-muted">Diferencia en verde: sobra. En rojo: falta. El dueño ve este cierre.</p>}
          <Button className="self-start" icon={<Printer className="h-4 w-4" />} onClick={() => setHoja(true)}>Imprimir cierre para firmar</Button>
        </Card>
      )}
      {!cargada ? <Cargando /> : turno ? <CerrarCaja onCerrada={setUltimo} /> : <AbrirCaja />}
      {rol !== 'CAJERO' && <Cierres />}
      {hoja && <HojaCierre t={ultimo} onCerrar={() => setHoja(false)} />}
    </div>
  );
}
