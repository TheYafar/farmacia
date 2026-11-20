import { ForbiddenException } from '@nestjs/common';
import { NOMBRE_MODULO, type ModuloPlan, type PlanFarmacia } from '@farmacia/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { enDemo } from '../prisma/prisma.service';

/**
 * El plan de esta farmacia (lo manda el panel central y se guarda en Configuración).
 * Sin plan (farmacia no enlazada, o la demo) todo está disponible.
 * Se guarda en memoria unos segundos para no leer la base en cada petición.
 */
let cache: { hasta: number; plan: PlanFarmacia | null } | null = null;

export function olvidarPlan() { cache = null; }

export async function planActual(prisma: PrismaService): Promise<PlanFarmacia | null> {
  if (enDemo()) return null;
  if (cache && cache.hasta > Date.now()) return cache.plan;
  const c = await prisma.configuracion.findUnique({ where: { id: 1 }, select: { plan: true } }).catch(() => null);
  const plan = (c?.plan as PlanFarmacia | null) ?? null;
  cache = { hasta: Date.now() + 5_000, plan };
  return plan;
}

export const incluye = (plan: PlanFarmacia | null, m: ModuloPlan) => !plan || plan.modulos.includes(m);

export function noIncluido(plan: PlanFarmacia, m: ModuloPlan) {
  return new ForbiddenException({ mensaje: `Tu plan ${plan.nombre} no incluye ${NOMBRE_MODULO[m].split(' (')[0]}. Para tenerlo, pide un plan mayor en Soporte`, codigo: 'PLAN' });
}

/** Revisa el límite de cajas o usuarios del plan antes de crear o activar uno más. */
export async function revisarLimite(prisma: PrismaService, que: 'cajas' | 'usuarios') {
  const plan = await planActual(prisma);
  const max = plan ? (que === 'cajas' ? plan.maxCajas : plan.maxUsuarios) : 0;
  if (!plan || !max) return;
  const hay = que === 'cajas'
    ? await prisma.caja.count({ where: { activa: true } })
    : await prisma.usuario.count({ where: { activo: true, sistema: false, rol: { in: ['CAJERO', 'REGENTE', 'ADMIN'] } } });
  if (hay >= max) throw new ForbiddenException({ mensaje: `Tu plan ${plan.nombre} permite ${max} ${que === 'cajas' ? (max === 1 ? 'caja' : 'cajas') : 'usuarios activos'}. Desactiva ${que === 'cajas' ? 'una caja' : 'un usuario'} o pide un plan mayor en Soporte`, codigo: 'PLAN' });
}
