import { create } from 'zustand';
import { RUTA_MODULO, MODULOS_PLAN, type ModuloPlan, type PlanFarmacia } from '@farmacia/shared';
import { api } from '@/lib/api';

/** El plan de esta farmacia (null = sin plan: todo disponible) y cuánto usa de él. */
interface Estado {
  plan: PlanFarmacia | null;
  uso: { cajas: number; usuarios: number } | null;
  cargar: () => Promise<void>;
}

export const usePlan = create<Estado>((set) => ({
  plan: null,
  uso: null,
  cargar: async () => {
    try { set(await api<{ plan: PlanFarmacia | null; uso: { cajas: number; usuarios: number } }>('/plan')); } catch { /* se queda como estaba */ }
  },
}));

/** ¿El plan trae este módulo? */
export const incluye = (plan: PlanFarmacia | null, m: ModuloPlan) => !plan || plan.modulos.includes(m);

/** El módulo de plan al que pertenece una ruta de la app (o null si está en todos los planes). */
export const moduloDeRuta = (ruta: string): ModuloPlan | null => MODULOS_PLAN.find((m) => RUTA_MODULO[m] === ruta) ?? null;

/** ¿Esta ruta está disponible con el plan? */
export const rutaIncluida = (plan: PlanFarmacia | null, ruta: string) => { const m = moduloDeRuta(ruta); return !m || incluye(plan, m); };
