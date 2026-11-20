import { create } from 'zustand';
import { api, claveCaja, tokenCaja } from '@/lib/api';

/** La caja de ESTE equipo (computadora o tablet). Se guarda en el navegador con su token. */
export interface CajaEquipo { id: string; nombre: string }

interface Estado {
  caja: CajaEquipo | null;
  cargada: boolean;
  cargar: () => Promise<void>;
  guardar: (caja: CajaEquipo, token: string) => void;
  olvidar: () => Promise<void>;
}

const borrar = () => { try { localStorage.removeItem(claveCaja()); } catch { /* sin almacenamiento */ } };

export const useCajaEquipo = create<Estado>((set) => ({
  caja: null,
  cargada: false,
  /** Pregunta al servidor si el token de este equipo sigue siendo una caja activa. */
  cargar: async () => {
    if (!tokenCaja()) return set({ caja: null, cargada: true });
    try {
      const r = await api<{ caja: CajaEquipo | null }>('/cajas/este-equipo');
      if (!r.caja) borrar();
      set({ caja: r.caja, cargada: true });
    } catch { set({ cargada: true }); }
  },
  guardar: (caja, token) => {
    try { localStorage.setItem(claveCaja(), JSON.stringify({ ...caja, token })); } catch { /* sin almacenamiento */ }
    set({ caja, cargada: true });
  },
  olvidar: async () => {
    try { await api('/cajas/salir', { method: 'POST' }); } catch { /* igual se olvida aquí */ }
    borrar();
    set({ caja: null });
  },
}));
