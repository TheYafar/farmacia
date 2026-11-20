import { create } from 'zustand';
import type { Bloqueo } from '@/lib/api';
import type { Opcion, Paciente, Principio } from '@/lib/tipos';

export interface Linea { producto: Opcion; principio: Principio; cantidad: number }

interface Venta {
  lineas: Linea[];
  cliente: Paciente | null;
  bloqueos: Bloqueo[];
  /** Solicitudes de permiso abiertas, por producto. */
  solicitudes: Record<string, string>;
  agregar: (producto: Opcion, principio: Principio) => void;
  cantidad: (id: string, n: number) => void;
  vaciar: () => void;
  ponerCliente: (p: Paciente | null) => void;
  ponerBloqueos: (b: Bloqueo[]) => void;
  ponerSolicitud: (productoId: string, id: string) => void;
}

export const useVenta = create<Venta>((set) => ({
  lineas: [],
  cliente: null,
  bloqueos: [],
  solicitudes: {},
  agregar: (producto, principio) =>
    set((s) => {
      const ya = s.lineas.find((l) => l.producto.id === producto.id);
      const lineas = ya
        ? s.lineas.map((l) => (l === ya ? { ...l, cantidad: Math.min(l.cantidad + 1, producto.stockLibre) } : l))
        : [...s.lineas, { producto, principio, cantidad: 1 }];
      return { lineas, bloqueos: s.bloqueos.filter((b) => b.productoId !== producto.id || b.motivo !== 'FALTA_CEDULA') };
    }),
  cantidad: (id, n) =>
    set((s) => ({
      lineas: n <= 0 ? s.lineas.filter((l) => l.producto.id !== id) : s.lineas.map((l) => (l.producto.id === id ? { ...l, cantidad: Math.min(n, l.producto.stockLibre) } : l)),
      bloqueos: n <= 0 ? s.bloqueos.filter((b) => b.productoId !== id) : s.bloqueos,
    })),
  vaciar: () => set({ lineas: [], bloqueos: [], solicitudes: {}, cliente: null }),
  ponerCliente: (cliente) => set({ cliente, bloqueos: [] }),
  ponerBloqueos: (bloqueos) => set({ bloqueos }),
  ponerSolicitud: (productoId, id) => set((s) => ({ solicitudes: { ...s.solicitudes, [productoId]: id } })),
}));
