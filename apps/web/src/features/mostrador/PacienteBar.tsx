import { AlertTriangle, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Chip } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { cedula, initials } from '@/lib/format';
import type { Paciente } from '@/lib/tipos';
import { avisar } from '@/store/avisos';
import { useVenta } from '@/store/venta';
import RegistrarCliente from '../pacientes/RegistrarCliente';

/** Cliente de la venta. F4 enfoca el campo de cédula. */
export default function PacienteBar() {
  const cliente = useVenta((s) => s.cliente);
  const ponerCliente = useVenta((s) => s.ponerCliente);
  const [ced, setCed] = useState('');
  const [registrar, setRegistrar] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F4') { e.preventDefault(); ponerCliente(null); setTimeout(() => ref.current?.focus(), 0); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ponerCliente]);

  if (!cliente) {
    return (
      <>
        <form
          className="flex items-center gap-2 rounded-xl bg-surface2 p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBuscando(true);
            try {
              ponerCliente(await api<Paciente>(`/pacientes/${encodeURIComponent(ced)}`));
              setCed('');
            } catch (err) {
              if (err instanceof ApiError && err.status === 404) setRegistrar(true);
              else avisar(err instanceof ApiError ? err.message : 'No se pudo buscar', 'bad');
            } finally {
              setBuscando(false);
            }
          }}
        >
          <input ref={ref} id="cedula-venta" value={ced} onChange={(e) => setCed(e.target.value)} inputMode="numeric" placeholder="Cédula del cliente" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 font-mono text-sm outline-none focus:border-accent" />
          <Button size="sm" variant="primary" type="submit" disabled={!ced.trim() || buscando} icon={<UserPlus className="h-4 w-4" />}>Buscar</Button>
        </form>
        <RegistrarCliente abierto={registrar} cedulaInicial={ced} onCerrar={() => setRegistrar(false)} onListo={(p) => { ponerCliente(p); setRegistrar(false); setCed(''); avisar('Cliente registrado', 'ok'); }} />
      </>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface2 p-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar text={initials(cliente.nombre)} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{cliente.nombre}</div>
          <div className="font-mono text-xs text-muted">{cedula(cliente.cedula)}</div>
        </div>
        <button onClick={() => ponerCliente(null)} className="rounded p-1 text-muted hover:text-fg" aria-label="Quitar cliente"><X className="h-4 w-4" /></button>
      </div>
      {(cliente.alergias.length > 0 || cliente.condiciones.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {cliente.alergias.map((a) => <Chip key={a} tone="bad" icon={<AlertTriangle className="h-3 w-3" />}>Alérgico a {a}</Chip>)}
          {cliente.condiciones.map((c) => <Chip key={c} tone="warn">{c}</Chip>)}
        </div>
      )}
    </div>
  );
}
