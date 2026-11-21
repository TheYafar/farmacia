import { AlertTriangle, MessageCircle, Pencil, Plus, ShoppingCart, UserSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Button, Card, Cargando, Chip, EmptyState, ErrorCarga, PageHeader, SearchInput, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { cedula, fecha, initials, usd } from '@/lib/format';
import type { Paciente } from '@/lib/tipos';
import { useCargar } from '@/lib/useCargar';
import { useVenta } from '@/store/venta';
import RegistrarCliente, { EditarCliente } from './RegistrarCliente';

interface Fila { cedula: string; nombre: string; telefono: string; alergias: string[]; compras: number }
interface Compra { id: string; numero: number; creadaEn: string; totalUsd: string; productos: string[] }
type Ficha = Paciente & { compras?: Compra[] };

/** ¿Lo que se escribió parece una cédula? (para ofrecer registrarla si no existe) */
const pareceCedula = (t: string) => /^[VEJvej]?[-.\s]?\d[\d.\s]{5,}$/.test(t.trim());

export default function PacientesPage() {
  const [q, setQ] = useState('');
  const [buscar, setBuscar] = useState('');
  // Busca solo mientras se escribe (espera un momento después de la última tecla).
  useEffect(() => { const t = setTimeout(() => setBuscar(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const lista = useCargar(() => api<Fila[]>(`/pacientes${buscar ? `?q=${encodeURIComponent(buscar)}` : ''}`), [buscar]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [registrar, setRegistrar] = useState(false);
  const filas = lista.datos ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Clientes" subtitle="Toca un cliente para ver sus alergias, lo que siempre compra y sus últimas compras."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setRegistrar(true)}>Nuevo cliente</Button>} />
      <SearchInput id="buscar-cedula" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Escribe nombre, cédula o teléfono" aria-label="Buscar cliente" />

      {lista.error && <ErrorCarga mensaje={lista.error} reintentar={lista.recargar} />}
      {lista.cargando && !lista.datos ? <Cargando /> : !filas.length ? (
        <EmptyState icon={<UserSearch className="h-8 w-8" />} title={buscar ? `Nadie con «${buscar}»` : 'Todavía no hay clientes'}>
          {buscar && pareceCedula(buscar) ? 'Esa cédula no está registrada.' : 'Registra a tus clientes para recordar sus alergias y avisarles por WhatsApp.'}
          <div><Button variant="primary" className="mt-3" icon={<Plus className="h-4 w-4" />} onClick={() => setRegistrar(true)}>Registrar cliente</Button></div>
        </EmptyState>
      ) : (
        <Card className="gap-0 p-0">
          <div className="border-b border-line px-4 py-2 text-xs font-semibold text-muted">
            {buscar ? `${filas.length === 100 ? 'Más de 100' : filas.length} ${filas.length === 1 ? 'cliente' : 'clientes'} con «${buscar}»` : 'Los más recientes'}
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {filas.map((f) => (
              <li key={f.cedula}>
                <button type="button" onClick={() => setAbierta(f.cedula)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface2">
                  <Avatar text={initials(f.nombre)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{f.nombre}</span>
                    <span className="block font-mono text-xs text-muted">{cedula(f.cedula)} · {f.telefono}</span>
                  </span>
                  {f.alergias.length > 0 && <Chip tone="bad" icon={<AlertTriangle className="h-3 w-3" />}>Alergias</Chip>}
                  <span className="hidden w-24 text-right text-xs text-muted sm:inline">{f.compras} {f.compras === 1 ? 'compra' : 'compras'}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FichaCliente ced={abierta} onCerrar={() => setAbierta(null)} onCambio={lista.recargar} />
      <RegistrarCliente abierto={registrar} cedulaInicial={pareceCedula(q) ? q.trim() : ''} onCerrar={() => setRegistrar(false)}
        onListo={(n) => { setRegistrar(false); setQ(''); lista.recargar(); setAbierta(n.cedula); }} />
    </div>
  );
}

function FichaCliente({ ced, onCerrar, onCambio }: { ced: string | null; onCerrar: () => void; onCambio: () => void }) {
  const ficha = useCargar(() => (ced ? api<Ficha>(`/pacientes/${encodeURIComponent(ced)}`) : Promise.resolve(null)), [ced]);
  const [editar, setEditar] = useState(false);
  const ponerCliente = useVenta((s) => s.ponerCliente);
  const navigate = useNavigate();
  if (!ced) return null;
  const p = ficha.datos;
  return (
    <Sheet grande open onClose={onCerrar} title={p?.nombre ?? 'Cliente'}>
      {ficha.error ? <ErrorCarga mensaje={ficha.error} reintentar={ficha.recargar} /> : !p ? <Cargando /> : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar text={initials(p.nombre)} size="lg" />
            <div className="min-w-0 text-sm">
              <div className="font-mono">{cedula(p.cedula)}</div>
              <div className="font-mono text-muted">WhatsApp {p.telefono}</div>
              <div className="text-xs text-muted">Cliente desde {fecha(p.creadoEn)}</div>
            </div>
          </div>

          {p.alergias.length > 0
            ? <Alert tone="bad" icon={<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}><b>Alérgico a: {p.alergias.join(', ')}</b>. El sistema avisa si le vas a vender algo que le hace daño.</Alert>
            : <p className="text-sm text-muted">Sin alergias registradas.</p>}
          {p.condiciones.length > 0 && <div className="flex flex-wrap gap-1.5">{p.condiciones.map((c) => <Chip key={c} tone="warn">{c}</Chip>)}</div>}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<ShoppingCart className="h-4 w-4" />} onClick={() => { ponerCliente(p); navigate('/vender'); }}>Venderle</Button>
            <a className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-semibold hover:bg-surface2" href={`https://wa.me/58${p.telefono.replace(/\D/g, '').replace(/^0/, '')}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />Escribirle</a>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditar(true)}>Cambiar datos</Button>
          </div>

          {!!p.esperas?.length && (
            <section className="flex flex-col gap-1.5">
              <h3 className="font-bold">Está esperando</h3>
              {p.esperas.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="font-semibold">{w.producto.nombreComercial} {w.producto.concentracion}</span>
                  <Chip tone={w.estado === 'EN_ESPERA' ? 'neutral' : w.estado === 'NOTIFICADO' ? 'warn' : 'ok'}>{w.estado === 'EN_ESPERA' ? 'Todavía no llega' : w.estado === 'NOTIFICADO' ? 'Llegó: falta que pague' : `Pagado · gaveta ${w.gaveta ?? '—'}`}</Chip>
                </div>
              ))}
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <section className="flex flex-col gap-1.5">
              <h3 className="font-bold">Lo que siempre compra</h3>
              {!p.habituales?.filter((h) => h.producto).length ? <p className="text-sm text-muted">Todavía no tiene compras con su cédula.</p> : (
                <ul className="flex flex-col divide-y divide-dashed divide-line text-sm">
                  {p.habituales.filter((h) => h.producto).map((h) => (
                    <li key={h.producto!.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0"><span className="block font-semibold">{h.producto!.nombreComercial} {h.producto!.concentracion}</span>
                        <span className="text-xs text-muted">{h.veces} {h.veces === 1 ? 'vez' : 'veces'}{h.ultimaVez ? ` · la última el ${fecha(h.ultimaVez)}` : ''}</span></span>
                      <span className="font-mono">{usd(h.producto!.precioUsd)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="flex flex-col gap-1.5">
              <h3 className="font-bold">Sus últimas compras</h3>
              {!p.compras?.length ? <p className="text-sm text-muted">Sin compras todavía.</p> : (
                <ul className="flex flex-col divide-y divide-dashed divide-line text-sm">
                  {p.compras.map((v) => (
                    <li key={v.id} className="flex items-start justify-between gap-2 py-2">
                      <span className="min-w-0"><span className="block text-xs text-muted">{fecha(v.creadaEn)} · venta #{v.numero}</span><span className="block">{v.productos.join(', ')}</span></span>
                      <span className="shrink-0 font-mono">{usd(v.totalUsd)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {!!p.recipes?.length && (
            <section className="flex flex-col gap-1.5">
              <h3 className="font-bold">Récipes</h3>
              <ul className="flex flex-col gap-1 text-sm">{p.recipes.map((r) => <li key={r.id} className="flex justify-between"><span>Récipe del {fecha(r.creadoEn)}</span><Chip tone={r.estado === 'VALIDADO' ? 'ok' : r.estado === 'RECHAZADO' ? 'bad' : 'warn'}>{r.estado === 'VALIDADO' ? 'Aprobado' : r.estado === 'RECHAZADO' ? 'Rechazado' : 'Por revisar'}</Chip></li>)}</ul>
            </section>
          )}
        </div>
      )}
      <EditarCliente p={editar ? p ?? null : null} onCerrar={() => setEditar(false)} onListo={() => { ficha.recargar(); onCambio(); }} />
    </Sheet>
  );
}
