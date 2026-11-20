import { AlertTriangle, MessageCircle, Plus, ShoppingCart, UserSearch } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Card, Chip, EmptyState, SearchInput } from '@/components/ui';
import { productoById } from '@/data/catalog';
import { pacientes } from '@/data/mock';
import { cedula, initials, usd } from '@/lib/format';
import { useApp } from '@/store/useApp';

export default function PacientesPage() {
  const [q, setQ] = useState('14582307');
  const buscarPaciente = useApp((s) => s.buscarPaciente);
  const setPaciente = useApp((s) => s.setPaciente);
  const addToCart = useApp((s) => s.addToCart);
  const espera = useApp((s) => s.espera);
  const toast = useApp((s) => s.toast);
  const navigate = useNavigate();
  const p = q.trim() ? buscarPaciente(q) : null;
  const encargos = p ? espera.filter((w) => w.cedula === p.cedula && ['en_espera', 'notificado', 'custodia'].includes(w.estado)) : [];

  return (
    <div className="flex flex-col gap-4">
      <SearchInput id="buscar-cedula" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} inputMode="numeric" placeholder="Escribe la cédula" aria-label="Buscar por cédula" shortcut="F4" className="font-mono" />
      <div className="flex flex-wrap gap-1.5 text-xs text-muted">
        <span>Ejemplos:</span>
        {pacientes.map((x) => <button key={x.cedula} onClick={() => setQ(x.cedula.slice(2))} className="rounded-full border border-dashed border-line px-2.5 py-1 font-mono hover:border-accent hover:text-accent">{cedula(x.cedula)}</button>)}
      </div>

      {!p ? (
        <EmptyState icon={<UserSearch className="h-8 w-8" />} title={q ? 'Este cliente no está registrado' : 'Busca al cliente por su cédula'}>
          {q ? <Button variant="primary" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => toast('Aquí se abre el registro rápido', 'info')}>Registrar cliente</Button> : 'Así ves sus alergias y lo que suele comprar.'}
        </EmptyState>
      ) : (
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
              <dt className="text-muted">Cliente desde</dt><dd>{p.clienteDesde}</dd>
              {p.medicoFrecuente && (<><dt className="text-muted">Médico</dt><dd>{p.medicoFrecuente}</dd></>)}
            </dl>
            <div className="flex flex-wrap gap-1.5">
              {p.alergias.length === 0 && p.condiciones.length === 0 && <Chip>Sin alergias</Chip>}
              {p.alergias.map((a) => <Chip key={a} tone="bad" icon={<AlertTriangle className="h-3 w-3" />}>Alérgica a {a === 'aines' ? 'AINEs' : a === 'penicilinas' ? 'penicilina' : a}</Chip>)}
              {p.condiciones.map((c) => <Chip key={c} tone="warn">{c}</Chip>)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<ShoppingCart className="h-4 w-4" />} onClick={() => { setPaciente(p); navigate('/mostrador'); }}>Venderle</Button>
              <Button icon={<MessageCircle className="h-4 w-4" />}>WhatsApp</Button>
            </div>
          </Card>

          <Card>
            <h3 className="text-base font-bold">Lo que siempre compra</h3>
            {p.habituales.length === 0 ? <p className="text-sm text-muted">Todavía no tiene compras registradas.</p> : (
              <ul className="flex flex-col divide-y divide-dashed divide-line">
                {p.habituales.map((h) => {
                  const prod = productoById(h.productoId)!;
                  return (
                    <li key={h.productoId} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0 text-sm">
                        <div className="font-semibold">{prod.nombreComercial} {prod.concentracion}</div>
                        <div className="text-xs text-muted">Caja de {prod.unidadesPorCaja} · última vez {h.ultima}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{usd(prod.precioUsd)}</span>
                        <Button size="sm" variant="primary" aria-label={`Agregar ${prod.nombreComercial}`} disabled={!prod.stockLibre} onClick={() => { setPaciente(p); addToCart(prod); toast(`Agregado: ${prod.nombreComercial}`, 'ok'); }}><Plus className="h-4 w-4" /></Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="md:col-span-2 xl:col-span-1">
            <h3 className="text-base font-bold">Récipes y encargos</h3>
            {p.recipes.length > 0 ? (
              <div className="flex gap-2">
                {p.recipes.map((r) => (
                  <figure key={r.fecha} className="flex flex-col items-center gap-1">
                    <div className="paper h-[76px] w-[58px] rounded-md border border-line" />
                    <figcaption className="text-[11px] text-muted">{r.fecha}</figcaption>
                  </figure>
                ))}
              </div>
            ) : <p className="text-sm text-muted">Sin récipes guardados.</p>}
            {encargos.map((w) => (
              <div key={w.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="font-semibold">{w.producto}</div>
                <div className="text-xs text-muted">{w.estado === 'en_espera' ? 'Le avisamos cuando llegue' : w.estado === 'notificado' ? 'Ya llegó, falta que pague' : `Pagado · está en la gaveta ${w.gaveta}`}</div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
