import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { Alert, Button, Campo, Sheet, claseInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { normalizar } from '@/lib/format';
import { avisar } from '@/store/avisos';
import type { Paciente } from '@/lib/tipos';

const msg = (e: unknown, def: string) => (e instanceof ApiError ? [e.message, ...e.errores.map((x) => x.mensaje)].join('. ') : def);

/** Alergias más comunes. El valor es el que usa el sistema para avisar al vender (la familia del medicamento). */
const ALERGIAS: [string, string][] = [
  ['penicilinas', 'Penicilina (amoxicilina…)'], ['aines', 'Ibuprofeno, diclofenac, aspirina'], ['sulfas', 'Sulfas'],
  ['cefalosporinas', 'Cefalosporinas (cefalexina…)'], ['Acetaminofén', 'Acetaminofén'],
];
const CONDICIONES = ['Hipertensión', 'Diabetes', 'Asma', 'Embarazada', 'Problemas de riñón', 'Gastritis'];

/** Elegir con un toque lo más común y escribir lo que no está. */
function Marcar({ titulo, ayuda, opciones, valor, onChange, otraEjemplo }: {
  titulo: string; ayuda: string; opciones: [string, string][]; valor: string[]; onChange: (v: string[]) => void; otraEjemplo: string;
}) {
  const [otra, setOtra] = useState('');
  const tiene = (k: string) => valor.some((v) => normalizar(v) === normalizar(k));
  const alternar = (k: string) => onChange(tiene(k) ? valor.filter((v) => normalizar(v) !== normalizar(k)) : [...valor, k]);
  const extras = valor.filter((v) => !opciones.some(([k]) => normalizar(k) === normalizar(v)));
  const agregar = () => { const t = otra.trim(); if (t && !tiene(t)) onChange([...valor, t]); setOtra(''); };
  return (
    <div className="flex flex-col gap-1.5 text-sm font-semibold">
      {titulo}
      <span className="-mt-1 text-xs font-normal text-muted">{ayuda}</span>
      <div className="flex flex-wrap gap-1.5">
        {[...opciones, ...extras.map((e) => [e, e] as [string, string])].map(([k, t]) => (
          <button key={k} type="button" aria-pressed={tiene(k)} onClick={() => alternar(k)}
            className={clsx('rounded-full border px-3 py-1.5 text-sm font-semibold', tiene(k) ? 'border-bad bg-bad-soft text-bad' : 'border-line bg-surface hover:bg-surface2')}>
            {tiene(k) ? '✓ ' : ''}{t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={otra} onChange={(e) => setOtra(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} placeholder={`Otra: ${otraEjemplo}`} className={clsx(claseInput, 'min-w-0 flex-1')} />
        <Button type="button" onClick={agregar} disabled={!otra.trim()}>Agregar</Button>
      </div>
    </div>
  );
}

export function DatosSalud({ alergias, condiciones, onAlergias, onCondiciones }: { alergias: string[]; condiciones: string[]; onAlergias: (v: string[]) => void; onCondiciones: (v: string[]) => void }) {
  return (
    <>
      <Marcar titulo="¿Es alérgico a algún medicamento?" ayuda="Toca los que apliquen. Al venderle algo que le hace daño, el sistema avisa." opciones={ALERGIAS} valor={alergias} onChange={onAlergias} otraEjemplo="escribe el nombre" />
      <Marcar titulo="¿Tiene alguna condición? (opcional)" ayuda="Ayuda al farmacéutico a recomendar." opciones={CONDICIONES.map((c) => [c, c])} valor={condiciones} onChange={onCondiciones} otraEjemplo="ej. tiroides" />
    </>
  );
}

/** Registro rápido de cliente: cédula, nombre, WhatsApp y alergias. */
export default function RegistrarCliente({ abierto, cedulaInicial, onCerrar, onListo }: { abierto: boolean; cedulaInicial?: string; onCerrar: () => void; onListo: (p: Paciente) => void }) {
  const vacio = () => ({ cedula: cedulaInicial ?? '', nombre: '', telefono: '', alergias: [] as string[], condiciones: [] as string[] });
  const [f, setF] = useState(vacio);
  const [error, setError] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);
  useEffect(() => { if (abierto) { setF(vacio()); setError(null); setAcepta(false); } }, [abierto, cedulaInicial]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={abierto} onClose={onCerrar} title="Nuevo cliente">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const p = await api<Paciente>('/pacientes', { body: { cedula: f.cedula, nombre: f.nombre, telefono: f.telefono, alergias: f.alergias, condiciones: f.condiciones, consentimiento: acepta } });
          onListo(p);
        } catch (err) { setError(msg(err, 'No se pudo registrar')); }
      }}>
        <Campo etiqueta="Cédula"><input id="rc-cedula" required value={f.cedula} onChange={(e) => setF({ ...f, cedula: e.target.value })} inputMode="numeric" placeholder="Ej.: 14582307" className={claseInput + ' font-mono'} /></Campo>
        <Campo etiqueta="Nombre y apellido"><input id="rc-nombre" required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={claseInput} /></Campo>
        <Campo etiqueta="WhatsApp" ayuda="Para avisarle cuando llegue lo que pidió"><input id="rc-tel" required value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} inputMode="tel" placeholder="Ej.: 0414-5550192" className={claseInput + ' font-mono'} /></Campo>
        <DatosSalud alergias={f.alergias} condiciones={f.condiciones} onAlergias={(v) => setF({ ...f, alergias: v })} onCondiciones={(v) => setF({ ...f, condiciones: v })} />
        <label className="flex items-start gap-2 rounded-xl bg-surface2 p-3 text-sm">
          <input type="checkbox" required checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
          <span>El cliente acepta que la farmacia guarde sus datos y su información de salud <b>solo para atenderlo</b>. No se comparten con nadie y puede pedir que se borren.</span>
        </label>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar cliente</Button>
      </form>
    </Sheet>
  );
}

/** Cambiar los datos de un cliente que ya existe. */
export function EditarCliente({ p, onCerrar, onListo }: { p: Paciente | null; onCerrar: () => void; onListo: (p: Paciente) => void }) {
  const [f, setF] = useState({ nombre: '', telefono: '', alergias: [] as string[], condiciones: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (p) setF({ nombre: p.nombre, telefono: p.telefono, alergias: [...p.alergias], condiciones: [...p.condiciones] }); setError(null); }, [p]);
  return (
    <Sheet open={!!p} onClose={onCerrar} title="Cambiar datos del cliente">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setError(null);
        try {
          const r = await api<Paciente>(`/pacientes/${encodeURIComponent(p!.cedula)}`, { method: 'PATCH', body: { nombre: f.nombre, telefono: f.telefono, alergias: f.alergias, condiciones: f.condiciones } });
          avisar('Datos guardados', 'ok'); onListo({ ...p!, ...r }); onCerrar();
        } catch (err) { setError(msg(err, 'No se pudo guardar')); }
      }}>
        <Campo etiqueta="Nombre y apellido"><input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={claseInput} /></Campo>
        <Campo etiqueta="WhatsApp"><input required value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} inputMode="tel" className={claseInput + ' font-mono'} /></Campo>
        <DatosSalud alergias={f.alergias} condiciones={f.condiciones} onAlergias={(v) => setF({ ...f, alergias: v })} onCondiciones={(v) => setF({ ...f, condiciones: v })} />
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg">Guardar</Button>
      </form>
    </Sheet>
  );
}
