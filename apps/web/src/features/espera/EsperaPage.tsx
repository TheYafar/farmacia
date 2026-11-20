import { clsx } from 'clsx';
import { Check, Clock, Package, X } from 'lucide-react';
import { useState } from 'react';
import type { EstadoEspera } from '@farmacia/shared';
import { Button, Cargando, Chip, ErrorCarga, PageHeader } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { bs, cedula, fecha, usd } from '@/lib/format';
import type { Solicitud } from '@/lib/tipos';
import { useCargar } from '@/lib/useCargar';
import { avisar } from '@/store/avisos';
import { useSesion } from '@/store/sesion';

const COLS: { id: EstadoEspera[]; title: string; tone: 'neutral' | 'warn' | 'ok'; hint: string }[] = [
  { id: ['EN_ESPERA'], title: 'Esperando que llegue', tone: 'neutral', hint: 'Se avisa por WhatsApp en el orden en que se anotaron' },
  { id: ['NOTIFICADO'], title: 'Ya llegó, falta pagar', tone: 'warn', hint: 'Se le envió el precio y los datos de Pago Móvil' },
  { id: ['PAGADO_CUSTODIA'], title: 'Pagado, en la gaveta', tone: 'ok', hint: 'Guardado con su nombre hasta que lo busque' },
  { id: ['ENTREGADO', 'EXPIRADO', 'CANCELADO'], title: 'Terminados', tone: 'neutral', hint: 'Entregados, cancelados o que no pagaron a tiempo' },
];

function restante(iso: string | null) {
  if (!iso) return '';
  const m = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function Tarjeta({ w, recargar }: { w: Solicitud; recargar: () => void }) {
  const tasa = useSesion((s) => s.tasa);
  const [ref, setRef] = useState('');
  const [gaveta, setGaveta] = useState('');
  // Productos controlados o con alergia: hace falta el permiso del farmacéutico antes de cobrar el encargo.
  const [pidePermiso, setPidePermiso] = useState<'ALERGIA' | 'CONTROLADO' | null>(null);
  const accion = async (ruta: string, body?: object, msg?: string) => {
    try { await api(ruta, { method: 'POST', body }); if (msg) avisar(msg, 'ok'); setPidePermiso(null); recargar(); }
    catch (e) {
      avisar(e instanceof ApiError ? e.message : 'No se pudo guardar', 'bad');
      if (e instanceof ApiError && e.codigo === 'NECESITA_PERMISO') setPidePermiso(e.message.includes('alérgico') ? 'ALERGIA' : 'CONTROLADO');
    }
  };
  return (
    <li className={clsx('flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-3 text-sm', (w.estado === 'ENTREGADO' || w.estado === 'EXPIRADO' || w.estado === 'CANCELADO') && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0">{w.producto.nombreComercial} {w.producto.concentracion}</b>
        {w.estado === 'EXPIRADO' && <Chip>No pagó a tiempo</Chip>}
        {w.estado === 'ENTREGADO' && <Chip tone="ok">Entregado</Chip>}
        {w.estado === 'CANCELADO' && <Chip>Cancelado</Chip>}
      </div>
      <span className="text-xs text-muted">{w.paciente.nombre} · {cedula(w.cedula)}</span>
      {w.estado === 'EN_ESPERA' && <span className="text-xs text-muted">Lo pidió el {fecha(w.solicitadaEn)}</span>}
      {w.estado === 'NOTIFICADO' && (
        <>
          <Chip tone="warn" icon={<Clock className="h-3 w-3" />} className="self-start">Tiene {restante(w.venceReserva)} para pagar</Chip>
          <span className="font-mono text-xs">{usd(w.producto.precioUsd)} · {bs(w.producto.precioUsd, tasa)}</span>
          <div className="flex gap-1.5">
            <input value={ref} onChange={(e) => setRef(e.target.value.replace(/\D/g, '').slice(0, 20))} placeholder="Nº de referencia" inputMode="numeric" className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 font-mono text-xs outline-none focus:border-accent" aria-label="Referencia de Pago Móvil" />
            <input value={gaveta} onChange={(e) => setGaveta(e.target.value.slice(0, 10))} placeholder="Gaveta" className="h-8 w-20 rounded-md border border-line bg-bg px-2 text-xs outline-none focus:border-accent" aria-label="Gaveta" />
          </div>
          <Button size="sm" variant="primary" disabled={ref.length < 4} onClick={() => accion(`/espera/${w.id}/confirmar-pago`, { referenciaPagoMovil: ref, gaveta: gaveta || undefined }, 'Pago confirmado. Guárdalo en la gaveta')}>Ya pagó</Button>
          {pidePermiso && (
            <Button size="sm" onClick={async () => {
              try { await api('/autorizaciones/solicitudes', { body: { cedula: w.cedula, productoId: w.productoId, razon: pidePermiso } }); avisar('Permiso pedido. Cuando el farmacéutico lo apruebe, toca «Ya pagó» de nuevo', 'ok'); }
              catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo pedir', 'bad'); }
            }}>Pedir permiso al farmacéutico</Button>
          )}
        </>
      )}
      {(w.estado === 'EN_ESPERA' || w.estado === 'NOTIFICADO') && (
        <button type="button" className="flex items-center gap-1 self-start text-xs font-semibold text-muted underline hover:text-bad"
          onClick={() => { if (confirm(`¿Cancelar el encargo de ${w.paciente.nombre}?${w.estado === 'NOTIFICADO' ? ' La caja apartada pasa al siguiente de la fila.' : ''}`)) void accion(`/espera/${w.id}/cancelar`, undefined, 'Encargo cancelado'); }}>
          <X className="h-3.5 w-3.5" />Ya no lo quiere
        </button>
      )}
      {w.estado === 'PAGADO_CUSTODIA' && (
        <>
          <span className="text-xs">Gaveta <b>{w.gaveta ?? '—'}</b> · ref. <span className="font-mono">{w.referenciaPagoMovil}</span></span>
          <Button size="sm" variant="primary" className="self-start" icon={<Check className="h-4 w-4" />} onClick={() => accion(`/espera/${w.id}/entregar`, undefined, 'Entregado')}>Ya lo buscó</Button>
        </>
      )}
    </li>
  );
}

export default function EsperaPage() {
  const { datos, error, cargando, recargar } = useCargar(() => api<Solicitud[]>('/espera'), [], 30_000);
  const [tab, setTab] = useState(0);
  const lista = datos ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Encargos" subtitle="Medicamentos que los clientes pidieron y no había. Al cargar la compra se les avisa solos." />
      {error && <ErrorCarga mensaje={error} reintentar={recargar} />}
      {cargando ? <Cargando /> : (
        <>
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface2 p-1 md:hidden" role="tablist">
            {COLS.map((c, i) => (
              <button key={c.title} role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className={clsx('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold', tab === i ? 'bg-surface shadow-sm' : 'text-muted')}>
                {c.title}<span className="font-mono text-xs">{lista.filter((w) => c.id.includes(w.estado)).length}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {COLS.map((c, i) => {
              const items = lista.filter((w) => c.id.includes(w.estado));
              return (
                <section key={c.title} className={clsx('flex min-w-0 flex-col gap-2 rounded-xl bg-surface2 p-2.5', tab !== i && 'hidden md:flex')}>
                  <div className="flex items-center justify-between px-1"><h2 className="text-sm font-bold">{c.title}</h2><Chip tone={c.tone}>{items.length}</Chip></div>
                  <p className="px-1 text-xs text-muted">{c.hint}</p>
                  <ul className="flex flex-col gap-2">
                    {items.length ? items.map((w) => <Tarjeta key={w.id} w={w} recargar={recargar} />) : <li className="flex flex-col items-center gap-1 py-6 text-xs text-muted"><Package className="h-5 w-5" />Sin casos</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
