import { AlertTriangle, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Chip } from '@/components/ui';
import { cedula, initials } from '@/lib/format';
import { useApp } from '@/store/useApp';

/** Paciente activo de la venta. F4 enfoca el campo de cédula. */
export default function PacienteBar({ compact }: { compact?: boolean }) {
  const paciente = useApp((s) => s.paciente);
  const setPaciente = useApp((s) => s.setPaciente);
  const buscarPaciente = useApp((s) => s.buscarPaciente);
  const toast = useApp((s) => s.toast);
  const [ced, setCed] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F4') { e.preventDefault(); setPaciente(null); setTimeout(() => ref.current?.focus(), 0); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaciente]);

  if (!paciente) {
    return (
      <form
        className="flex items-center gap-2 rounded-xl bg-surface2 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          const p = buscarPaciente(ced);
          if (p) { setPaciente(p); setCed(''); } else toast('No está registrado. Prueba 14582307', 'bad');
        }}
      >
        <input ref={ref} id="cedula-venta" value={ced} onChange={(e) => setCed(e.target.value)} inputMode="numeric" placeholder="Cédula del cliente" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 font-mono text-sm outline-none focus:border-accent" />
        <Button size="sm" variant="primary" type="submit" icon={<UserPlus className="h-4 w-4" />}>Agregar</Button>
      </form>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface2 p-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar text={initials(paciente.nombre)} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{paciente.nombre}</div>
          <div className="font-mono text-xs text-muted">{cedula(paciente.cedula)}</div>
        </div>
        <button onClick={() => setPaciente(null)} className="rounded p-1 text-muted hover:text-fg" aria-label="Quitar cliente"><X className="h-4 w-4" /></button>
      </div>
      {!compact && (paciente.alergias.length > 0 || paciente.condiciones.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {paciente.alergias.map((a) => <Chip key={a} tone="bad" icon={<AlertTriangle className="h-3 w-3" />}>Alérgica a {a === 'aines' ? 'AINEs' : a === 'penicilinas' ? 'penicilina' : a}</Chip>)}
          {paciente.condiciones.map((c) => <Chip key={c} tone="warn">{c}</Chip>)}
        </div>
      )}
    </div>
  );
}
