import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronDown, HelpCircle, PhoneCall } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Button, Chip, Locked } from '@/components/ui';
import { choqueAlergia } from '@/data/catalog';
import { pacientes, productos } from '@/data/mock';
import type { LecturaItem, RecipeLeido } from '@/data/types';
import { cedula, initials, usd } from '@/lib/format';
import { semaforo, useApp, useRole } from '@/store/useApp';

// Tres estados que cualquiera entiende, sin porcentajes.
const ESTADO = {
  verde: { txt: 'Listo', icon: CheckCircle2, cls: 'border-l-ok', chip: 'ok' as const },
  amarillo: { txt: 'Pregúntale al cliente', icon: HelpCircle, cls: 'border-l-warn', chip: 'warn' as const },
  rojo: { txt: 'Llama al farmacéutico', icon: PhoneCall, cls: 'border-l-bad', chip: 'bad' as const },
};

function ItemCard({ rx, item }: { rx: RecipeLeido; item: LecturaItem }) {
  const role = useRole();
  const resolver = useApp((s) => s.resolverItem);
  const addToCart = useApp((s) => s.addToCart);
  const toast = useApp((s) => s.toast);
  const [open, setOpen] = useState(false);
  const paciente = pacientes.find((p) => p.cedula === rx.cedula);
  const elegido = item.resueltoCon ?? (item.candidatos.length === 1 && item.confianza >= 90 ? 0 : undefined);
  const sem = elegido !== undefined ? 'verde' : semaforo(item.confianza);
  const E = ESTADO[sem];
  const cand = elegido !== undefined ? item.candidatos[elegido] : undefined;
  const marcas = cand ? productos.filter((p) => p.principioActivoId === cand.principioActivoId).sort((a, b) => a.precioUsd - b.precioUsd) : [];
  const conStock = marcas.filter((m) => m.stockLibre > 0);
  const alergia = marcas[0] ? choqueAlergia(marcas[0], paciente) : null;
  const esFarmaceutico = role !== 'cajero';
  const puedeResolver = sem === 'rojo' ? esFarmaceutico : true;
  const parecidos = item.candidatos.length > 1;

  return (
    <div className={clsx('flex flex-col gap-3 rounded-xl border border-l-[6px] border-line bg-surface p-4', E.cls)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-lg font-semibold">
          {cand ? `${cand.nombre} ${cand.concentracion}` : parecidos ? 'Estos dos se parecen. ¿Cuál es?' : `¿Es ${item.candidatos[0]!.nombre} ${item.candidatos[0]!.concentracion}?`}
        </div>
        <Chip tone={E.chip} icon={<E.icon className="h-4 w-4" />} className="px-3 py-1 text-sm">{E.txt}</Chip>
      </div>

      {elegido === undefined && (
        <>
          <div className={clsx('grid gap-2', parecidos && 'sm:grid-cols-2')}>
            {item.candidatos.map((c, idx) => (
              <div key={c.principioActivoId} className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
                <b className="text-base">{c.nombre} {c.concentracion}</b>
                <span className="text-sm text-muted">Sirve para: {c.uso.replace(/^Benzodiazepina\.\s*/, '').replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}</span>
                {puedeResolver && (
                  <Button size="md" className="mt-1 self-start" onClick={() => { resolver(rx.id, item.id, idx); toast(`Confirmado: ${c.nombre}`, 'ok'); }}>
                    {parecidos ? 'Es este' : 'Sí, es este'}
                  </Button>
                )}
              </div>
            ))}
          </div>
          {sem === 'rojo' && (esFarmaceutico
            ? <p className="text-sm text-muted">Pregúntale al cliente para qué se lo mandaron antes de escoger.</p>
            : <Locked>Ya le avisamos al farmacéutico. Él decide cuál es.</Locked>)}
          {sem === 'amarillo' && <p className="text-sm text-muted">La letra no se ve muy clara. Confirma con el cliente.</p>}
        </>
      )}

      {cand && (
        <>
          {alergia && (
            <Alert tone="bad" icon={<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}>
              {paciente?.nombre.split(' ')[0]} es alérgica a la {alergia === 'penicilinas' ? 'penicilina' : alergia} y este medicamento la tiene. {esFarmaceutico ? 'Apruébalo solo si el médico lo confirmó.' : 'Llama al farmacéutico.'}
            </Alert>
          )}
          <button onClick={() => setOpen((o) => !o)} className="flex items-center justify-between rounded-lg bg-surface2 px-3 py-2.5 text-left">
            <span>{conStock.length ? <>Hay {conStock.length} {conStock.length === 1 ? 'opción' : 'opciones'} · desde <b className="font-mono">{usd(conStock[0]!.precioUsd)}</b></> : 'No hay en este momento'}</span>
            <ChevronDown className={clsx('h-5 w-5 transition', open && 'rotate-180')} />
          </button>
          {open && (
            <ul className="flex flex-col gap-2">
              {marcas.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="min-w-0"><b>{m.nombreComercial}</b> <span className="text-sm text-muted">· caja de {m.unidadesPorCaja}</span></span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono">{usd(m.precioUsd)}</span>
                    {m.stockLibre > 0 ? <Button size="sm" variant="primary" onClick={() => { addToCart(m); toast(`Agregado: ${m.nombreComercial}`, 'ok'); }}>Agregar</Button> : <Chip tone="bad">No hay</Chip>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default function RecipeReview({ rx, showPatient = true }: { rx: RecipeLeido; showPatient?: boolean }) {
  const paciente = pacientes.find((p) => p.cedula === rx.cedula);
  const navigate = useNavigate();
  const pendientes = rx.items.filter((i) => i.resueltoCon === undefined && !(i.candidatos.length === 1 && i.confianza >= 90)).length;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {showPatient && paciente && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-surface2 p-3">
          <Avatar text={initials(paciente.nombre)} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{paciente.nombre}</div>
            <div className="font-mono text-xs text-muted">{cedula(paciente.cedula)}</div>
          </div>
          {paciente.alergias.map((a) => <Chip key={a} tone="bad">Alérgica a {a === 'penicilinas' ? 'penicilina' : a}</Chip>)}
        </div>
      )}
      {rx.items.map((i) => <ItemCard key={i.id} rx={rx} item={i} />)}
      <Button variant="primary" size="lg" disabled={pendientes > 0} onClick={() => navigate('/mostrador')}>
        {pendientes > 0 ? `Falta confirmar ${pendientes} ${pendientes === 1 ? 'medicamento' : 'medicamentos'}` : 'Listo, ir a cobrar'}
      </Button>
    </div>
  );
}
