import { AlertTriangle, MessageCircle, Plus, ShoppingCart, UserSearch } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Card, Cargando, Chip, EmptyState, ErrorCarga, PageHeader, SearchInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { cedula, fecha, initials, usd } from '@/lib/format';
import type { Paciente } from '@/lib/tipos';
import { useVenta } from '@/store/venta';
import { useCargar } from '@/lib/useCargar';
import { EditarCliente } from '@/features/gestion/Gestion';
import RegistrarCliente from './RegistrarCliente';

interface Fila { cedula: string; nombre: string; telefono: string; alergias: string[]; compras: number }

function ListaClientes({ titulo, filas, abrir }: { titulo: string; filas: Fila[]; abrir: (cedula: string) => void }) {
  return (
    <Card>
      <h2 className="text-sm font-bold text-muted">{titulo}</h2>
      <ul className="flex flex-col divide-y divide-line">
        {filas.map((f) => (
          <li key={f.cedula}>
            <button type="button" onClick={() => abrir(f.cedula)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface2">
              <Avatar text={initials(f.nombre)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{f.nombre}</span>
                <span className="block font-mono text-xs text-muted">{cedula(f.cedula)} · {f.telefono}</span>
              </span>
              {f.alergias.length > 0 && <Chip tone="bad" icon={<AlertTriangle className="h-3 w-3" />}>Alergias</Chip>}
              <span className="hidden text-xs text-muted sm:inline">{f.compras} {f.compras === 1 ? 'compra' : 'compras'}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function PacientesPage() {
  const [q, setQ] = useState('');
  const [p, setP] = useState<Paciente | null>(null);
  const [editar, setEditar] = useState(false);
  const [estado, setEstado] = useState<'inicio' | 'cargando' | 'no-existe' | 'error' | 'listo' | 'lista'>('inicio');
  const [lista, setLista] = useState<Fila[]>([]);
  const recientes = useCargar(() => api<Fila[]>('/pacientes'), []);
  const [error, setError] = useState('');
  const [registrar, setRegistrar] = useState(false);
  const ponerCliente = useVenta((s) => s.ponerCliente);
  const navigate = useNavigate();

  const abrir = async (ced: string) => {
    setEstado('cargando');
    try { setP(await api<Paciente>(`/pacientes/${encodeURIComponent(ced)}`)); setEstado('listo'); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'No se pudo abrir'); setEstado('error'); }
  };

  const buscar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setEstado('cargando');
    // Con letras (o pocos números) se busca por nombre o teléfono; con una cédula, la ficha directa.
    if (!/^[VEJvej]?[-.\s]?\d[\d.\s]{4,}$/.test(q.trim())) {
      try { setLista(await api<Fila[]>(`/pacientes?q=${encodeURIComponent(q.trim())}`)); setEstado('lista'); }
      catch (err) { setError(err instanceof ApiError ? err.message : 'No se pudo buscar'); setEstado('error'); }
      return;
    }
    try {
      setP(await api<Paciente>(`/pacientes/${encodeURIComponent(q)}`));
      setEstado('listo');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setEstado('no-existe');
      else { setError(err instanceof ApiError ? err.message : 'No se pudo buscar'); setEstado('error'); }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Clientes" subtitle="Busca por cédula, nombre o teléfono. Con la cédula se guardan sus alergias, récipes y compras."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setRegistrar(true)}>Nuevo cliente</Button>} />
      <form onSubmit={buscar} className="flex gap-2">
        <SearchInput id="buscar-cedula" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Cédula, nombre o teléfono y pulsa Enter" aria-label="Buscar cliente" className="flex-1" />
        <Button type="submit" variant="primary" size="lg">Buscar</Button>
      </form>

      {estado === 'inicio' && (recientes.datos?.length ? <ListaClientes titulo="Clientes registrados más recientes" filas={recientes.datos} abrir={abrir} /> : <EmptyState icon={<UserSearch className="h-8 w-8" />} title="Busca al cliente por cédula, nombre o teléfono">Así ves sus alergias y lo que siempre compra.</EmptyState>)}
      {estado === 'lista' && (lista.length ? <ListaClientes titulo={`${lista.length === 100 ? 'Más de 100' : lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'} con «${q.trim()}»`} filas={lista} abrir={abrir} /> : (
        <EmptyState icon={<UserSearch className="h-8 w-8" />} title={`Ningún cliente con «${q.trim()}»`}>
          <Button variant="primary" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => setRegistrar(true)}>Registrar cliente</Button>
        </EmptyState>
      ))}
      {estado === 'cargando' && <Cargando />}
      {estado === 'error' && <ErrorCarga mensaje={error} reintentar={() => buscar()} />}
      {estado === 'no-existe' && (
        <EmptyState icon={<UserSearch className="h-8 w-8" />} title="Este cliente no está registrado">
          <Button variant="primary" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => setRegistrar(true)}>Registrar cliente</Button>
        </EmptyState>
      )}
      {estado === 'listo' && p && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr]">
          <Card>
            <div className="flex items-center gap-3">
              <Avatar text={initials(p.nombre)} size="lg" />
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{p.nombre}</h2>
                <span className="font-mono text-sm text-muted">{cedula(p.cedula)}</span>
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">WhatsApp</dt><dd className="font-mono">{p.telefono}</dd>
              <dt className="text-muted">Cliente desde</dt><dd>{fecha(p.creadoEn)}</dd>
            </dl>
            <div className="flex flex-wrap gap-1.5">
              {p.alergias.length === 0 && p.condiciones.length === 0 && <Chip>Sin alergias registradas</Chip>}
              {p.alergias.map((a) => <Chip key={a} tone="bad" icon={<AlertTriangle className="h-3 w-3" />}>Alérgico a {a}</Chip>)}
              {p.condiciones.map((c) => <Chip key={c} tone="warn">{c}</Chip>)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<ShoppingCart className="h-4 w-4" />} onClick={() => { ponerCliente(p); navigate('/vender'); }}>Venderle</Button>
              <Button onClick={() => setEditar(true)}>Editar</Button>
              <a className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-semibold hover:bg-surface2" href={`https://wa.me/58${p.telefono.replace(/\D/g, '').replace(/^0/, '')}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a>
            </div>
          </Card>
          <Card>
            <h3 className="text-base font-bold">Lo que siempre compra</h3>
            {!p.habituales?.length ? <p className="text-sm text-muted">Todavía no tiene compras registradas.</p> : (
              <ul className="flex flex-col divide-y divide-dashed divide-line">
                {p.habituales.filter((h) => h.producto).map((h) => (
                  <li key={h.producto!.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-semibold">{h.producto!.nombreComercial} {h.producto!.concentracion}</div>
                      <div className="text-xs text-muted">{h.veces} {h.veces === 1 ? 'vez' : 'veces'}{h.ultimaVez ? ` · última ${fecha(h.ultimaVez)}` : ''}</div>
                    </div>
                    <span className="font-mono">{usd(h.producto!.precioUsd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="md:col-span-2 xl:col-span-1">
            <h3 className="text-base font-bold">Récipes y encargos</h3>
            {p.recipes?.length ? (
              <ul className="flex flex-col gap-1 text-sm">{p.recipes.map((r) => <li key={r.id} className="flex justify-between"><span>Récipe del {fecha(r.creadoEn)}</span><Chip tone={r.estado === 'VALIDADO' ? 'ok' : r.estado === 'RECHAZADO' ? 'bad' : 'warn'}>{r.estado === 'VALIDADO' ? 'Válido' : r.estado === 'RECHAZADO' ? 'Rechazado' : 'Por revisar'}</Chip></li>)}</ul>
            ) : <p className="text-sm text-muted">Sin récipes guardados.</p>}
            {p.esperas?.map((w) => (
              <div key={w.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="font-semibold">{w.producto.nombreComercial} {w.producto.concentracion}</div>
                <div className="text-xs text-muted">{w.estado === 'EN_ESPERA' ? 'Le avisamos cuando llegue' : w.estado === 'NOTIFICADO' ? 'Ya llegó, falta que pague' : `Pagado · gaveta ${w.gaveta ?? '—'}`}</div>
              </div>
            ))}
          </Card>
        </div>
      )}
      <EditarCliente p={editar ? p : null} onCerrar={() => setEditar(false)} onListo={setP} />
      <RegistrarCliente abierto={registrar} cedulaInicial={/^[VEJvej]?[-.\s]?\d/.test(q.trim()) ? q : ''} onCerrar={() => setRegistrar(false)} onListo={(n) => { setRegistrar(false); setP({ ...n, habituales: [], recipes: [], esperas: [] }); setEstado('listo'); }} />
    </div>
  );
}
