import { create } from 'zustand';
import { api } from '@/lib/api';
import type { Farmacia, Turno } from '@/lib/tipos';

interface EstadoCaja {
  turno: Turno | null;
  ventas: number;
  totalUsd: string;
  cargada: boolean;
  farmacia: Farmacia;
  cargar: () => Promise<void>;
  cargarFarmacia: () => Promise<void>;
}

export const useCaja = create<EstadoCaja>((set) => ({
  turno: null,
  ventas: 0,
  totalUsd: '0.00',
  cargada: false,
  farmacia: { nombre: 'Farmacia', rif: '', direccion: '', telefono: '' },
  cargar: async () => {
    try {
      const r = await api<{ turno: Turno | null; ventas?: number; totalUsd?: string }>('/caja/actual');
      set({ turno: r.turno, ventas: r.ventas ?? 0, totalUsd: r.totalUsd ?? '0.00', cargada: true });
    } catch {
      set({ cargada: true });
    }
  },
  cargarFarmacia: async () => {
    try { set({ farmacia: await api<Farmacia>('/farmacia') }); } catch { /* se queda el nombre genérico */ }
  },
}));
