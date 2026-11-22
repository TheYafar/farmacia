import { TuPlan } from '@/features/plan/Plan';
import { clsx } from 'clsx';
import { Printer, RefreshCw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Campo, Card, Cargando, Chip, PageHeader, claseInput } from '@/components/ui';
import { api, guardarTasa, ApiError } from '@/lib/api';
import { leerMonto, num2 } from '@/lib/format';
import { redondearBs } from '@farmacia/shared';
import type { Venta } from '@/lib/tipos';
import { avisar } from '@/store/avisos';
import { useConfig, type Configuracion } from '@/store/config';
import { useSesion } from '@/store/sesion';
import Ticket from '@/features/caja/Ticket';

const msg = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.errores.map((x) => x.mensaje)].join('. ') : 'No se pudo guardar');
const fechaHora = (d: string | null) => (d ? new Date(d).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const fechaCorta = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', timeZone: 'America/Caracas' });

function Opcion({ activa, onClick, titulo, detalle }: { activa: boolean; onClick: () => void; titulo: string; detalle: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={clsx('flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition', activa ? 'border-accent bg-accent-soft/60' : 'border-line hover:bg-surface2')}>
      <span className="font-semibold">{titulo}</span><span className="text-sm text-muted">{detalle}</span>
    </button>
  );
}

function Seccion({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <Card as="section" className="flex flex-col gap-4 p-4 md:p-5">
      <div><h2 className="text-lg font-bold">{titulo}</h2>{sub && <p className="text-sm text-muted">{sub}</p>}</div>
      {children}
    </Card>
  );
}

const Interruptor = ({ v, onChange, children }: { v: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />{children}</label>
);

/** Venta de ejemplo para la vista previa y la página de prueba de la impresora. */
const PRUEBA = {
  id: 'prueba', numero: 0, creadaEn: new Date().toISOString(), cedula: null, totalUsd: '9.86', totalBs: '0', tasa: '0', vueltoMoneda: null, vueltoMonto: '0',
  cajero: { nombre: 'Prueba' }, lineas: [{ cantidad: 2, precioUsd: '1.80', producto: { nombreComercial: 'Atamel', concentracion: '500 mg' } }, { cantidad: 1, precioUsd: '6.26', producto: { nombreComercial: 'Losartán', concentracion: '50 mg' } }],
  pagos: [{ id: 'p', metodo: 'EFECTIVO_USD', moneda: 'USD', monto: '9.86', referencia: null }],
} as unknown as Venta;

export default function ConfiguracionPage() {
  const { config, cargar } = useConfig();
  const cargarTasa = useSesion((s) => s.cargarTasa);
  const tasa = useSesion((s) => s.tasa);
  const [f, setF] = useState<Configuracion | null>(null);
  const [manual, setManual] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prueba, setPrueba] = useState(false);
  useEffect(() => { void cargar(); }, [cargar]);
  // Al recargar (ej. después de leer el BCV) se actualizan las lecturas, sin borrar lo que se está editando.
  useEffect(() => {
    if (!config) return;
    setF((prev) => prev ? { ...prev, bcvUsd: config.bcvUsd, bcvEur: config.bcvEur, bcvFecha: config.bcvFecha, bcvConsultado: config.bcvConsultado, bcvOrigen: config.bcvOrigen, tasaCalculada: config.tasaCalculada, farmacia: config.farmacia } : config);
  }, [config]);
  if (!f) return <Cargando />;
  const cambiar = (c: Partial<Configuracion>) => setF({ ...f, ...c });

  // Vista previa de la tasa con el ajuste, antes de guardar.
  const base = f.tasaModo === 'BCV_EUR' ? f.bcvEur : f.bcvUsd;
  const final = base == null ? null : f.tasaAjusteTipo === 'BS' ? base + f.tasaAjusteValor : f.tasaAjusteTipo === 'PCT' ? base * (1 + f.tasaAjusteValor / 100) : base;

  // Datos del ticket: el botón dice si hay cambios sin guardar.
  const datosTicket = {
    farmaciaNombre: f.farmaciaNombre ?? '', farmaciaRif: f.farmaciaRif ?? '', farmaciaDireccion: f.farmaciaDireccion ?? '', farmaciaTelefono: f.farmaciaTelefono ?? '',
    ticketPie: f.ticketPie ?? '', ticketAncho: f.ticketAncho, ticketLetra: f.ticketLetra, ticketCopias: f.ticketCopias,
    ticketAuto: f.ticketAuto, ticketMostrarBs: f.ticketMostrarBs, ticketMostrarTasa: f.ticketMostrarTasa,
  };
  const ticketPendiente = !!config && (Object.keys(datosTicket) as (keyof typeof datosTicket)[]).some((k) => String(datosTicket[k]) !== String((config as Configuracion)[k] ?? ''));
  const guardar = async (parte: Partial<Configuracion>, aviso = 'Configuración guardada') => {
    setError(null);
    try {
      const r = await api<Configuracion & { tasaAplicada: { valor: string; cambio: boolean; desde?: string } | null }>('/configuracion', { body: parte });
      await cargar(); await cargarTasa();
      avisar(r.tasaAplicada?.cambio ? `${aviso}. Tasa nueva: ${num2(r.tasaAplicada.valor)} Bs` : r.tasaAplicada?.desde ? `${aviso}. La tasa ${num2(r.tasaAplicada.valor)} Bs es la del ${fechaCorta(r.tasaAplicada.desde)}: se aplicará sola a las 12 de la noche` : aviso, 'ok');
    } catch (e) { setError(msg(e)); }
  };
  const leerBcv = async () => {
    setLeyendo(true); setError(null);
    try {
      const r = await api<{ bcvUsd: number; bcvEur: number; origen: string; tasa: { desde?: string } | null }>('/tasa/bcv', { body: {} });
      await cargar(); await cargarTasa();
      avisar(`BCV: dólar ${num2(r.bcvUsd)} · euro ${num2(r.bcvEur)}${r.tasa?.desde ? ` (vigente desde el ${fechaCorta(r.tasa.desde)}: se aplica sola a las 12 de la noche)` : ''}`, 'ok');
    } catch (e) { setError(msg(e)); } finally { setLeyendo(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Configuración" subtitle="Tasa del dólar, impuestos, datos del ticket e impresora" />
      {error && <Alert tone="bad">{error}</Alert>}
      <TuPlan />

      <Seccion titulo="Tasa del día" sub={`Vigente: ${tasa ? num2(tasa) : '—'} Bs. Las ventas ya hechas conservan la tasa con la que se cobraron.`}>
        <div className="grid gap-2 md:grid-cols-3">
          <Opcion activa={f.tasaModo === 'BCV_USD'} onClick={() => cambiar({ tasaModo: 'BCV_USD' })} titulo="BCV dólar (automática)" detalle={f.bcvUsd ? `${num2(f.bcvUsd)} Bs` : 'Se lee del BCV'} />
          <Opcion activa={f.tasaModo === 'BCV_EUR'} onClick={() => cambiar({ tasaModo: 'BCV_EUR' })} titulo="BCV euro (automática)" detalle={f.bcvEur ? `${num2(f.bcvEur)} Bs` : 'Se lee del BCV'} />
          <Opcion activa={f.tasaModo === 'MANUAL'} onClick={() => cambiar({ tasaModo: 'MANUAL' })} titulo="Personalizada" detalle="La escribes tú" />
        </div>

        {f.tasaModo !== 'MANUAL' ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>Última lectura: {fechaHora(f.bcvConsultado)}{f.bcvOrigen ? ` · ${f.bcvOrigen}` : ''}. Se revisa sola cada 30 minutos. La tasa que el BCV publica en la tarde para el día siguiente se aplica a las 12 de la noche, así los precios no cambian con la farmacia abierta.</span>
              <Button size="sm" icon={<RefreshCw className={clsx('h-4 w-4', leyendo && 'animate-spin')} />} disabled={leyendo} onClick={() => void leerBcv()}>Leer BCV ahora</Button>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Ajuste sobre la tasa del BCV</span>
              <div className="flex flex-wrap items-center gap-2">
                {([['NINGUNO', 'Sin ajuste'], ['BS', 'Sumar Bs'], ['PCT', 'Sumar %']] as const).map(([k, t]) => (
                  <button key={k} type="button" onClick={() => cambiar({ tasaAjusteTipo: k })} className={clsx('rounded-lg border px-3 py-1.5 text-sm font-semibold', f.tasaAjusteTipo === k ? 'border-accent bg-accent-soft text-accent' : 'border-line')}>{t}</button>
                ))}
                {f.tasaAjusteTipo !== 'NINGUNO' && (
                  <input inputMode="decimal" value={String(f.tasaAjusteValor)} onChange={(e) => cambiar({ tasaAjusteValor: Number(e.target.value.replace(',', '.')) || 0 })} className={claseInput + ' w-28 font-mono'} aria-label="Valor del ajuste" />
                )}
                {f.tasaAjusteTipo !== 'NINGUNO' && <span className="text-sm text-muted">{f.tasaAjusteTipo === 'BS' ? 'Bs' : '%'}</span>}
              </div>
            </div>
            <div className="rounded-xl bg-surface2 p-3 font-mono text-sm">
              {base == null ? 'Toca «Leer BCV ahora» para ver la tasa.' : <>BCV {num2(base)}{f.tasaAjusteTipo === 'BS' ? ` + ${num2(f.tasaAjusteValor)} Bs` : f.tasaAjusteTipo === 'PCT' ? ` + ${num2(f.tasaAjusteValor)} %` : ''} = <b className="text-base">{num2(final!)} Bs</b> por {f.tasaModo === 'BCV_EUR' ? 'euro' : 'dólar'}</>}
            </div>
            {f.tasaModo === 'BCV_EUR' && <Alert tone="info">Los precios siguen en $: se convierten a bolívares con la tasa del euro.</Alert>}
            <Button variant="primary" onClick={() => void guardar({ tasaModo: f.tasaModo, tasaAjusteTipo: f.tasaAjusteTipo, tasaAjusteValor: f.tasaAjusteValor }, 'Tasa automática activada')}>Guardar y usar esta tasa</Button>
          </>
        ) : (
          <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
            e.preventDefault();
            const v = leerMonto(manual);
            if (!(v > 0)) { setError('Escribe la tasa'); return; }
            try { await guardarTasa(v, 'Manual'); await cargar(); await cargarTasa(); setManual(''); avisar('Tasa guardada', 'ok'); } catch (err) { setError(msg(err)); }
          }}>
            <Campo etiqueta="Bs por dólar (o por euro, si así cobras)"><input inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={tasa ? num2(tasa) : '0,00'} className={claseInput + ' w-40 font-mono'} /></Campo>
            <Button type="submit" variant="primary" className="h-11">Guardar tasa</Button>
          </form>
        )}
      </Seccion>

      <Seccion titulo="Automático o manual" sub="Decide qué hace el sistema solo y qué prefieres hacer tú. Lo puedes cambiar cuando quieras.">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Encargos: cuando llega lo que un cliente pidió</span>
          <div className="grid gap-2 md:grid-cols-2">
            <Opcion activa={f.encargosAuto} onClick={() => { cambiar({ encargosAuto: true }); void guardar({ encargosAuto: true }, 'Encargos en automático'); }} titulo="Automático" detalle="Se le aparta una caja solo, al primero de la fila. Tú solo le avisas por WhatsApp." />
            <Opcion activa={!f.encargosAuto} onClick={() => { cambiar({ encargosAuto: false }); void guardar({ encargosAuto: false }, 'Encargos en manual'); }} titulo="Manual" detalle="No se aparta nada solo. En Encargos ves «¡Ya hay!» y tú decides a quién apartarle." />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Tiempo para pagar una caja apartada</span>
          <div className="flex flex-wrap items-center gap-2">
            {([[3, '3 horas'], [24, '1 día'], [48, '2 días'], [0, 'No vence']] as const).map(([h, t]) => (
              <button key={h} type="button" onClick={() => { cambiar({ reservaHoras: h }); void guardar({ reservaHoras: h }, 'Tiempo guardado'); }} className={clsx('rounded-lg border px-3 py-1.5 text-sm font-semibold', f.reservaHoras === h ? 'border-accent bg-accent-soft text-accent' : 'border-line')}>{t}</button>
            ))}
          </div>
          <p className="text-xs text-muted">{f.reservaHoras > 0 ? `Empieza a contar cuando le avisas. Si no paga en ese tiempo, la caja pasa al siguiente de la fila.` : 'La caja queda apartada hasta que tú toques «Ya no lo quiere».'}</p>
        </div>
        <div className="rounded-xl bg-surface2 p-3 text-sm">
          <b>En los demás módulos también puedes hacerlo a mano:</b>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            <li><b className="text-fg">Tasa:</b> automática del BCV o escrita por ti (arriba).</li>
            <li><b className="text-fg">Compras:</b> el sistema sugiere qué pedir, pero puedes cambiar las cantidades o hacer un pedido a mano.</li>
            <li><b className="text-fg">WhatsApp:</b> puedes cambiar el mensaje antes de enviarlo.</li>
            <li><b className="text-fg">Al mayor:</b> el precio se calcula con el descuento del cliente, pero puedes escribirlo tú.</li>
            <li><b className="text-fg">Controlados:</b> el libro se llena solo y también puedes anotar movimientos a mano.</li>
            <li><b className="text-fg">Inventario:</b> «Corregir cantidad» para lo que no pasó por el sistema.</li>
          </ul>
        </div>
      </Seccion>

      <Seccion titulo="Redondeo de precios en bolívares" sub="Para no cobrar céntimos: el total en Bs se redondea al múltiplo más cercano. Se acepta cualquier pago entre el monto exacto y el redondeado.">
        <div className="flex flex-wrap items-center gap-2">
          {([[0, 'Sin redondeo'], [1, 'A 1 Bs'], [5, 'A 5 Bs'], [10, 'A 10 Bs']] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => { cambiar({ redondeoBs: k }); void guardar({ redondeoBs: k }, 'Redondeo guardado'); }} className={clsx('rounded-lg border px-3 py-1.5 text-sm font-semibold', (f.redondeoBs ?? 0) === k ? 'border-accent bg-accent-soft text-accent' : 'border-line')}>{t}</button>
          ))}
          <span className="text-xs text-muted">Se guarda al tocar.</span>
        </div>
        {tasa ? <p className="font-mono text-sm text-muted">Ejemplo: $8,51 × {num2(tasa)} = Bs {num2(8.51 * tasa)} → <b className="text-fg">Bs {num2(redondearBs(8.51 * tasa, f.redondeoBs ?? 0))}</b></p> : null}
      </Seccion>

      <Seccion titulo="IGTF" sub="Impuesto a los pagos en divisas. Pregúntale a tu contador si te toca cobrarlo.">
        <div className="flex flex-wrap items-center gap-3">
          <Interruptor v={f.igtfActivo} onChange={(v) => { cambiar({ igtfActivo: v }); void guardar({ igtfActivo: v, igtfPct: f.igtfPct }, v ? 'IGTF activado' : 'IGTF desactivado'); }}>Cobrar IGTF a los pagos en $ efectivo</Interruptor>
          <select value={f.igtfPct} onChange={(e) => { const n = Number(e.target.value); cambiar({ igtfPct: n }); void guardar({ igtfActivo: f.igtfActivo, igtfPct: n }, 'IGTF guardado'); }} className="h-9 rounded-lg border border-line bg-surface px-2" aria-label="Porcentaje de IGTF">{[1, 2, 3].map((p) => <option key={p} value={p}>{p} %</option>)}</select>
          <span className="text-xs text-muted">Se guarda al cambiarlo.</span>
        </div>
      </Seccion>

      <Seccion titulo="Ticket e impresora" sub="Cómo se ve y cómo se imprime el comprobante.">
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Nombre de la farmacia"><input value={f.farmaciaNombre ?? ''} placeholder={f.farmacia.nombre} onChange={(e) => cambiar({ farmaciaNombre: e.target.value })} className={claseInput} /></Campo>
              <Campo etiqueta="RIF"><input value={f.farmaciaRif ?? ''} placeholder={f.farmacia.rif || 'J-12345678-9'} onChange={(e) => cambiar({ farmaciaRif: e.target.value })} className={claseInput} /></Campo>
              <Campo etiqueta="Dirección"><input value={f.farmaciaDireccion ?? ''} placeholder={f.farmacia.direccion} onChange={(e) => cambiar({ farmaciaDireccion: e.target.value })} className={claseInput} /></Campo>
              <Campo etiqueta="Teléfono"><input value={f.farmaciaTelefono ?? ''} placeholder={f.farmacia.telefono} onChange={(e) => cambiar({ farmaciaTelefono: e.target.value })} className={claseInput} /></Campo>
            </div>
            <Campo etiqueta="Mensaje al final del ticket"><textarea rows={2} value={f.ticketPie ?? ''} placeholder="¡Gracias por su compra!" onChange={(e) => cambiar({ ticketPie: e.target.value })} className={claseInput + ' h-auto py-2'} /></Campo>
            <div className="grid grid-cols-3 gap-2">
              <Campo etiqueta="Papel"><select value={f.ticketAncho} onChange={(e) => cambiar({ ticketAncho: Number(e.target.value) as 58 | 80 })} className={claseInput}><option value={80}>80 mm</option><option value={58}>58 mm</option></select></Campo>
              <Campo etiqueta="Letra"><select value={f.ticketLetra} onChange={(e) => cambiar({ ticketLetra: Number(e.target.value) })} className={claseInput}>{[10, 11, 12, 13, 14].map((n) => <option key={n} value={n}>{n === 12 ? 'Normal' : n < 12 ? `Pequeña (${n})` : `Grande (${n})`}</option>)}</select></Campo>
              <Campo etiqueta="Copias"><select value={f.ticketCopias} onChange={(e) => cambiar({ ticketCopias: Number(e.target.value) })} className={claseInput}>{[1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></Campo>
            </div>
            <Interruptor v={f.ticketAuto} onChange={(v) => cambiar({ ticketAuto: v })}>Imprimir solo al terminar de cobrar</Interruptor>
            <Interruptor v={f.ticketMostrarBs} onChange={(v) => cambiar({ ticketMostrarBs: v })}>Mostrar los precios en bolívares</Interruptor>
            <Interruptor v={f.ticketMostrarTasa} onChange={(v) => cambiar({ ticketMostrarTasa: v })}>Mostrar la tasa y de dónde sale (ej. «BCV dólar + 1 Bs»)</Interruptor>
            <Alert tone="info">
              La impresora se elige en la ventana de imprimir la primera vez (queda recordada). Para imprimir sin que salga esa ventana,
              pon la impresora térmica como predeterminada y abre Chrome con <span className="font-mono">--kiosk-printing</span>.
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!ticketPendiente} onClick={() => void guardar(datosTicket, 'Ticket guardado')}>{ticketPendiente ? 'Guardar ticket' : 'Ticket guardado ✓'}</Button>
              {/* La prueba sale con lo que está en pantalla: si hay cambios, se guardan primero. */}
              <Button icon={<Printer className="h-4 w-4" />} onClick={async () => { if (ticketPendiente) await guardar(datosTicket, 'Ticket guardado'); setPrueba(true); try { localStorage.setItem('impresoraProbada', '1'); } catch { /* sin almacenamiento */ } }}>Imprimir prueba</Button>
              {ticketPendiente && <Chip tone="warn">Tienes cambios sin guardar</Chip>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Vista previa</span>
            <div className="rounded-xl bg-surface2 p-3">
              <div className="mx-auto rounded-lg bg-white p-3 font-mono leading-snug text-black shadow-sm" style={{ maxWidth: f.ticketAncho === 58 ? 220 : 300, fontSize: f.ticketLetra }}>
                <div className="text-center font-bold">{f.farmaciaNombre || f.farmacia.nombre}</div>
                {(f.farmaciaRif || f.farmacia.rif) && <div className="text-center">RIF {f.farmaciaRif || f.farmacia.rif}</div>}
                {(f.farmaciaDireccion || f.farmacia.direccion) && <div className="text-center">{f.farmaciaDireccion || f.farmacia.direccion}</div>}
                <div className="my-1 border-t border-dashed border-black" />
                <div className="flex justify-between"><span>2 x Atamel 500 mg</span><span>3,60 $</span></div>
                {f.ticketMostrarBs && <div className="text-right text-[0.9em]">Bs {num2(3.6 * (tasa ?? 0))}</div>}
                <div className="flex justify-between"><span>1 x Losartán 50 mg</span><span>6,26 $</span></div>
                {f.ticketMostrarBs && <div className="text-right text-[0.9em]">Bs {num2(6.26 * (tasa ?? 0))}</div>}
                <div className="my-1 border-t border-dashed border-black" />
                <div className="flex justify-between font-bold"><span>TOTAL</span><span>9,86 $</span></div>
                {f.ticketMostrarBs && <div className="flex justify-between"><span>Total Bs</span><span>{num2(9.86 * (tasa ?? 0))}</span></div>}
                {f.ticketMostrarTasa && <div className="flex justify-between gap-2"><span className="truncate">Tasa ({f.tasaModo === 'MANUAL' ? 'Manual' : f.tasaCalculada?.fuente ?? 'BCV'})</span><span>{num2(tasa ?? 0)}</span></div>}
                <div className="mt-1 whitespace-pre-line text-center">{f.ticketPie || '¡Gracias por su compra!'}</div>
              </div>
            </div>
          </div>
        </div>
      </Seccion>
      <Seccion titulo="Privacidad" sub="Las fotos de récipes son datos de salud. Se borran solas al cumplirse el plazo; los datos de la venta se conservan.">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Guardar las fotos de récipes durante</span>
          <select value={f.recipeRetencionDias} onChange={(e) => { const n = Number(e.target.value); cambiar({ recipeRetencionDias: n }); void guardar({ recipeRetencionDias: n }, 'Plazo guardado'); }} className="h-9 rounded-lg border border-line bg-surface px-2" aria-label="Plazo para guardar las fotos">
            {[[180, '6 meses'], [365, '1 año'], [730, '2 años'], [1825, '5 años']].map(([d, t]) => <option key={d} value={d}>{t}</option>)}
          </select>
          <span className="text-xs text-muted">Se guarda al cambiarlo.</span>
        </div>
        <p className="text-xs text-muted">Pregúntale al regente cuánto tiempo exige guardar los récipes de controlados.</p>
      </Seccion>
      {prueba && <Ticket venta={{ ...PRUEBA, totalBs: String(9.86 * (tasa ?? 0)), tasa: String(tasa ?? 0) }} onCerrar={() => setPrueba(false)} />}
    </div>
  );
}
