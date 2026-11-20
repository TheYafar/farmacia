import { create } from 'zustand';
import { esperaInicial, pacientes, recipesPendientes, TASA_BCV_EJEMPLO } from '@/data/mock';
import type { EstadoEspera, Paciente, Producto, RecipeLeido, Role, SolicitudEspera } from '@/data/types';

export interface CartLine { producto: Producto; cantidad: number; autorizado?: boolean }
export interface Toast { id: number; text: string; tone?: 'ok' | 'bad' | 'info' }

interface AppState {
  user: { nombre: string; role: Role } | null;
  tasa: number;
  tasaActualizada: string;
  paciente: Paciente | null;
  cart: CartLine[];
  espera: SolicitudEspera[];
  recipes: RecipeLeido[];
  toasts: Toast[];
  login: (nombre: string, role: Role) => void;
  logout: () => void;
  setTasa: (t: number) => void;
  setPaciente: (p: Paciente | null) => void;
  buscarPaciente: (cedula: string) => Paciente | null;
  addToCart: (p: Producto) => void;
  setQty: (id: string, q: number) => void;
  clearCart: () => void;
  autorizarLinea: (id: string) => void;
  anotarEspera: (producto: string, precioUsd: number) => void;
  moverEspera: (id: string, estado: EstadoEspera, extra?: Partial<SolicitudEspera>) => void;
  resolverItem: (rxId: string, itemId: string, idx: number) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
}

const cleanCed = (c: string) => c.toUpperCase().replace(/[^VEJ0-9]/g, '').replace(/^(\d)/, 'V$1').replace(/^([VEJ])/, '$1-');

let tid = 0;
export const useApp = create<AppState>((set, get) => ({
  user: null,
  tasa: TASA_BCV_EJEMPLO,
  tasaActualizada: '8:05 a. m.',
  paciente: pacientes[0]!,
  cart: [],
  espera: esperaInicial,
  recipes: recipesPendientes,
  toasts: [],
  login: (nombre, role) => set({ user: { nombre, role } }),
  logout: () => set({ user: null }),
  setTasa: (t) => set({ tasa: t, tasaActualizada: new Date().toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' }) }),
  setPaciente: (p) => set({ paciente: p }),
  buscarPaciente: (cedula) => pacientes.find((p) => p.cedula === cleanCed(cedula)) ?? null,
  addToCart: (p) =>
    set((s) => {
      const ex = s.cart.find((l) => l.producto.id === p.id);
      if (ex) return { cart: s.cart.map((l) => (l === ex ? { ...l, cantidad: Math.min(l.cantidad + 1, p.stockLibre) } : l)) };
      return { cart: [...s.cart, { producto: p, cantidad: 1 }] };
    }),
  setQty: (id, q) =>
    set((s) => ({ cart: q <= 0 ? s.cart.filter((l) => l.producto.id !== id) : s.cart.map((l) => (l.producto.id === id ? { ...l, cantidad: Math.min(q, l.producto.stockLibre) } : l)) })),
  clearCart: () => set({ cart: [] }),
  autorizarLinea: (id) => set((s) => ({ cart: s.cart.map((l) => (l.producto.id === id ? { ...l, autorizado: true } : l)) })),
  anotarEspera: (producto, precioUsd) => {
    const pac = get().paciente;
    if (!pac) return get().toast('Primero agrega la cédula del cliente', 'bad');
    set((s) => ({
      espera: [{ id: `w${Date.now()}`, cedula: pac.cedula, pacienteNombre: pac.nombre.split(' ').map((w, i) => (i === 0 ? w[0] + '.' : w)).slice(0, 2).join(' '), producto, precioUsd, estado: 'en_espera', fechaSolicitud: 'hoy' }, ...s.espera],
    }));
    get().toast(`Anotado en espera: ${producto}`, 'ok');
  },
  moverEspera: (id, estado, extra) => set((s) => ({ espera: s.espera.map((w) => (w.id === id ? { ...w, ...extra, estado } : w)) })),
  resolverItem: (rxId, itemId, idx) =>
    set((s) => ({ recipes: s.recipes.map((r) => (r.id !== rxId ? r : { ...r, items: r.items.map((i) => (i.id === itemId ? { ...i, resueltoCon: idx } : i)) })) })),
  toast: (text, tone = 'info') => {
    const id = ++tid;
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
  },
}));

export const useRole = () => useApp((s) => s.user?.role ?? 'cajero');
export const semaforo = (c: number): 'verde' | 'amarillo' | 'rojo' => (c >= 90 ? 'verde' : c >= 75 ? 'amarillo' : 'rojo');
