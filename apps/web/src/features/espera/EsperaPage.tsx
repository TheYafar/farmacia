import { clsx } from 'clsx';
import { Check, Clock, MessageCircle, Package, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { EstadoEspera } from '@farmacia/shared';
import { Alert, Button, Campo, Cargando, Chip, ErrorCarga, PageHeader, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { bs, cedula, fecha, usd } from '@/lib/format';
import type { Opcion, Paciente, Solicitud } from '@/lib/tipos';
import { ElegirProducto } from '@/features/inventario/InventarioPage';
import RegistrarCliente from '@/features/pacientes/RegistrarCliente';
import { useCargar } from '@/lib/useCargar';
import { avisar } from '@/store/avisos';
import { useSesion } from '@/store/sesion';
import { useConfig } from '@/store/config';

const COLS: { id: EstadoEspera[]; title: string; tone: 'neutral' | 'warn' | 'ok'; hint: string }[] = [
  { id: ['EN_ESPERA'], title: 'Esperando que llegue', tone: 'neutral', hint: 'Cuando llegue, se le aparta una caja al primero de la fila' },
  { id: ['NOTIFICADO'], title: 'Ya llegó, falta pagar', tone: 'warn', hint: 'Tiene una caja apartada. Avísale por WhatsApp con el botón' },
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
  const horas = useConfig((s) => s.config?.reservaHoras) ?? 3;
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
      {/* Ya llegó y nadie se lo apartó (modo manual, o llegó para otro de la fila): la farmacia decide. */}
      {w.estado === 'EN_ESPERA' && (w.hay ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5 rounded-md bg-ok-soft p-2">
          <span className="text-xs font-semibold text-ok">¡Ya hay! {w.hay === 1 ? 'Queda 1' : `Quedan ${w.hay}`} en el estante</span>
          <Button size="sm" variant="primary" onClick={() => accion(`/espera/${w.id}/apartar`, undefined, 'Caja apartada. Ahora avísale por WhatsApp')}>Apartarle una caja</Button>
        </div>
      )}
      {w.estado === 'NOTIFICADO' && (
        <>
          {!w.notificadaEn
            ? <Chip tone="bad" className="self-start">Todavía no le has avisado</Chip>
            : w.venceReserva ? <Chip tone="warn" icon={<Clock className="h-3 w-3" />} className="self-start">Le avisaste. Tiene {restante(w.venceReserva)} para pagar</Chip>
            : <Chip tone="ok" className="self-start">Le avisaste el {fecha(w.notificadaEn)}</Chip>}
          <Button size="sm" variant={w.notificadaEn ? 'secondary' : 'primary'} icon={<MessageCircle className="h-4 w-4" />} onClick={() => {
            const tel = w.paciente.telefono.replace(/\D/g, '').replace(/^0/, '58');
            const plazo = horas > 0 ? ` Te la guardamos por ${horas} ${horas === 1 ? 'hora' : 'horas'}.` : '';
            const texto = `¡Hola ${w.paciente.nombre.split(' ')[0]}! Ya llegó tu ${w.producto.nombreComercial} ${w.producto.concentracion} y te apartamos una caja. Precio: ${usd(w.producto.precioUsd)} (${bs(w.producto.precioUsd, tasa)}).${plazo} Puedes pagar por Pago Móvil respondiendo este mensaje, o pasar por la farmacia.`;
            window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
            void accion(`/espera/${w.id}/avisado`);
          }}>{w.notificadaEn ? 'Avisarle otra vez' : 'Avisarle por WhatsApp'}</Button>
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

/** Anotar a mano lo que un cliente pidió y no había (también se puede desde Vender, con «Avisar cuando llegue»). */
function AnotarEncargo({ abierto, cerrar, listo }: { abierto: boolean; cerrar: () => void; listo: () => void }) {
  const [ced, setCed] = useState('');
  const [cliente, setCliente] = useState<Paciente | null>(null);
  const [producto, setProducto] = useState<Opcion | null>(null);
  const [registrar, setRegistrar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const limpiar = () => { setCed(''); setCliente(null); setProducto(null); };
  const buscar = async () => {
    if (!ced.trim()) return;
    setOcupado(true);
    try { setCliente(await api<Paciente>(`/pacientes/${encodeURIComponent(ced.trim())}`)); }
    catch (e) { if (e instanceof ApiError && e.status === 404) setRegistrar(true); else avisar(e instanceof ApiError ? e.message : 'No se pudo buscar', 'bad'); }
    finally { setOcupado(false); }
  };
  const guardar = async () => {
    if (!cliente || !producto) return;
    setOcupado(true);
    try {
      await api('/espera', { body: { cedula: cliente.cedula, productoId: producto.id } });
      avisar(`Anotado: le avisaremos a ${cliente.nombre.split(' ')[0]} cuando llegue ${producto.nombreComercial}`, 'ok');
      limpiar(); listo();
    } catch (e) { avisar(e instanceof ApiError ? e.message : 'No se pudo anotar', 'bad'); }
    finally { setOcupado(false); }
  };
  return (
    <Sheet open={abierto} onClose={() => { limpiar(); cerrar(); }} title="Anotar encargo">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">Un cliente pidió algo que no hay. Al cargar la compra le llega el aviso por WhatsApp, en el orden en que se anotaron.</p>
        {cliente ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface2 p-3">
            <div className="min-w-0"><div className="font-semibold">{cliente.nombre}</div><div className="font-mono text-xs text-muted">{cedula(cliente.cedula)} · {cliente.telefono}</div></div>
            <Button size="sm" variant="ghost" onClick={() => setCliente(null)}>Cambiar</Button>
          </div>
        ) : (
          <Campo etiqueta="Cédula del cliente">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void buscar(); }}>
              <input value={ced} onChange={(e) => setCed(e.target.value)} inputMode="numeric" placeholder="Ej.: 12345678" className={clsx(claseInput, 'flex-1 font-mono')} />
              <Button type="submit" disabled={ocupado || !ced.trim()}>Buscar</Button>
            </form>
          </Campo>
        )}
        <Campo etiqueta="Medicamento que pidió"><ElegirProducto valor={producto} onElegir={setProducto} /></Campo>
        {producto && producto.stockLibre > 0 && <Alert tone="info">De este producto sí hay {producto.stockLibre}: puedes vendérselo de una vez.</Alert>}
        <Button size="lg" variant="primary" disabled={!cliente || !producto || ocupado} onClick={guardar}>Anotar y avisarle cuando llegue</Button>
      </div>
      <RegistrarCliente abierto={registrar} cedulaInicial={ced} onCerrar={() => setRegistrar(false)} onListo={(p) => { setCliente(p); setRegistrar(false); avisar('Cliente registrado', 'ok'); }} />
    </Sheet>
  );
}

export default function EsperaPage() {
  const { datos, error, cargando, recargar } = useCargar(() => api<Solicitud[]>('/espera'), [], 30_000);
  const [tab, setTab] = useState(0);
  const [anotar, setAnotar] = useState(false);
  const encargosAuto = useConfig((st) => st.config?.encargosAuto);
  const lista = datos ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Encargos" subtitle="Lo que los clientes pidieron y no había. Cuando llegue, se le aparta una caja y tú le avisas por WhatsApp."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAnotar(true)}>Anotar encargo</Button>} />
      <AnotarEncargo abierto={anotar} cerrar={() => setAnotar(false)} listo={() => { setAnotar(false); recargar(); }} />
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
                  <p className="px-1 text-xs text-muted">{c.id[0] === 'EN_ESPERA' && encargosAuto === false ? 'Cuando llegue verás «¡Ya hay!» y tú decides a quién apartarle' : c.hint}</p>
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
