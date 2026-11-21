import { useEffect } from 'react';
import { Check, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MODULOS_PLAN, NOMBRE_MODULO } from '@farmacia/shared';
import { Button, Card, EmptyState } from '@/components/ui';
import { incluye, moduloDeRuta, usePlan } from '@/store/plan';
import { useRol } from '@/store/sesion';

/** Pantalla cuando se entra a un módulo que el plan no trae. */
export function NoIncluido({ ruta }: { ruta: string }) {
  const plan = usePlan((s) => s.plan);
  const rol = useRol();
  const m = moduloDeRuta(ruta);
  return (
    <EmptyState icon={<Lock className="h-8 w-8" />} title={m ? `${NOMBRE_MODULO[m].split(' (')[0]} no está en tu plan` : 'No está en tu plan'}>
      <span className="flex flex-col items-center gap-3">
        <span>Tu plan {plan?.nombre ?? ''} no incluye este módulo. {rol === 'ADMIN' ? 'Para tenerlo, pide un plan mayor.' : 'Si lo necesitas, díselo al dueño.'}</span>
        {rol === 'ADMIN' && <Link to="/soporte"><Button variant="primary">Pedir un plan mayor</Button></Link>}
      </span>
    </EmptyState>
  );
}

const limite = (n: number, usado: number | undefined, cosa: string) => (n ? `${usado ?? '—'} de ${n} ${cosa}` : `${cosa} sin límite${usado !== undefined ? ` (usas ${usado})` : ''}`);

/** «Tu plan»: qué trae, qué no y cuánto se usa. Lo ve el dueño en Configuración. */
export function TuPlan() {
  const { plan, uso, cargar } = usePlan();
  useEffect(() => { void cargar(); }, [cargar]);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Tu plan{plan ? `: ${plan.nombre}` : ''}</h2>
        {plan && <span className="text-sm text-muted">{limite(plan.maxCajas, uso?.cajas, 'cajas')} · {limite(plan.maxUsuarios, uso?.usuarios, 'usuarios')}</span>}
      </div>
      {!plan ? (
        <p className="text-sm text-muted">Esta farmacia no tiene un plan asignado: todos los módulos están disponibles. El plan lo asigna quien te vendió el sistema, desde su panel.</p>
      ) : (
        <>
          <p className="text-sm text-muted">Vender, Caja, Ventas, Récipes, Por revisar, Controlados, Clientes, Inventario, Resumen, Cajas, Usuarios, Auditoría y Soporte vienen en todos los planes. Además:</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {MODULOS_PLAN.map((m) => (
              <li key={m} className={`flex items-start gap-2 text-sm ${incluye(plan, m) ? '' : 'text-muted'}`}>
                {incluye(plan, m) ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <Lock className="mt-0.5 h-4 w-4 shrink-0" />}{NOMBRE_MODULO[m]}
              </li>
            ))}
          </ul>
          {uso && ((plan.maxCajas && uso.cajas > plan.maxCajas) || (plan.maxUsuarios && uso.usuarios > plan.maxUsuarios)) ? (
            <p className="rounded-lg bg-warn-soft p-2 text-sm text-warn">{plan.maxCajas && uso.cajas > plan.maxCajas ? 'Tienes más cajas de las' : 'Tienes más usuarios de los'} que permite tu plan. Los que ya tienes siguen funcionando, pero no puedes agregar más.</p>
          ) : null}
          {MODULOS_PLAN.some((m) => !incluye(plan, m)) && <Link to="/soporte" className="self-start text-sm font-semibold text-accent underline">Pedir un plan mayor</Link>}
        </>
      )}
    </Card>
  );
}
