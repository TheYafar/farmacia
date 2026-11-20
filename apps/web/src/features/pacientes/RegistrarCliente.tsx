import { useState } from 'react';
import { Alert, Button, Campo, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Paciente } from '@/lib/tipos';

/** Registro rápido de cliente: cédula, nombre, WhatsApp y alergias. */
export default function RegistrarCliente({ abierto, cedulaInicial, onCerrar, onListo }: { abierto: boolean; cedulaInicial?: string; onCerrar: () => void; onListo: (p: Paciente) => void }) {
  const [f, setF] = useState({ cedula: cedulaInicial ?? '', nombre: '', telefono: '', alergias: '', condiciones: '' });
  const [error, setError] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);
  const lista = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  return (
    <Sheet open={abierto} onClose={onCerrar} title="Registrar cliente">
      <form
        key={cedulaInicial}
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            const p = await api<Paciente>('/pacientes', { body: { cedula: f.cedula, nombre: f.nombre, telefono: f.telefono, alergias: lista(f.alergias), condiciones: lista(f.condiciones), consentimiento: acepta } });
            onListo(p);
          } catch (err) {
            setError(err instanceof ApiError ? [err.message, ...err.errores.map((x) => x.mensaje)].join('. ') : 'No se pudo registrar');
          }
        }}
      >
        <Campo etiqueta="Cédula"><input id="rc-cedula" required value={f.cedula} onChange={(e) => setF({ ...f, cedula: e.target.value })} inputMode="numeric" placeholder="V-14582307" className={claseInput} /></Campo>
        <Campo etiqueta="Nombre completo"><input id="rc-nombre" required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={claseInput} /></Campo>
        <Campo etiqueta="WhatsApp"><input id="rc-tel" required value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} inputMode="tel" placeholder="0414-5550192" className={claseInput} /></Campo>
        <Campo etiqueta="Alergias" ayuda="Separadas por coma. Ej: penicilinas, aines"><input id="rc-alergias" value={f.alergias} onChange={(e) => setF({ ...f, alergias: e.target.value })} className={claseInput} /></Campo>
        <Campo etiqueta="Condiciones" ayuda="Ej: hipertensa, diabético"><input id="rc-cond" value={f.condiciones} onChange={(e) => setF({ ...f, condiciones: e.target.value })} className={claseInput} /></Campo>
        <label className="flex items-start gap-2 rounded-xl bg-surface2 p-3 text-sm">
            <input type="checkbox" required checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>El cliente acepta que la farmacia guarde sus datos y su información de salud (alergias, récipes) <b>solo para atenderlo</b>. No se comparten con nadie y puede pedir que se borren.</span>
          </label>
          {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar cliente</Button>
      </form>
    </Sheet>
  );
}
