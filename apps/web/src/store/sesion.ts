import { create } from 'zustand';
import { api, renovar, sesionToken } from '@/lib/api';
import type { UsuarioSesion } from '@/lib/tipos';

interface Sesion {
  usuario: UsuarioSesion | null;
  listo: boolean;
  tasa: number | null;
  restaurar: () => Promise<void>;
  entrar: (usuario: string, clave: string) => Promise<void>;
  salir: () => Promise<void>;
  cargarTasa: () => Promise<void>;
}

export const useSesion = create<Sesion>((set, get) => ({
  usuario: null,
  listo: false,
  tasa: null,

  /** Al abrir la app: si hay una sesión guardada en la cookie, se recupera sin pedir la clave. */
  restaurar: async () => {
    if (await renovar()) {
      try {
        set({ usuario: await api<UsuarioSesion>('/auth/yo') });
        await get().cargarTasa();
      } catch { /* sesión inválida */ }
    }
    set({ listo: true });
  },

  entrar: async (usuario, clave) => {
    const r = await api<{ accessToken: string; usuario: UsuarioSesion }>('/auth/login', { body: { usuario, clave } });
    sesionToken.poner(r.accessToken);
    set({ usuario: r.usuario });
    await get().cargarTasa();
  },

  salir: async () => {
    try { await api('/auth/salir', { method: 'POST' }); } catch { /* ya estaba cerrada */ }
    sesionToken.poner(null);
    set({ usuario: null });
  },

  cargarTasa: async () => {
    try {
      const t = await api<{ valor: string }>('/tasa');
      set({ tasa: Number(t.valor) });
    } catch {
      set({ tasa: null });
    }
  },
}));

sesionToken.alExpirar(() => {
  sesionToken.poner(null);
  useSesion.setState({ usuario: null });
});

export const useRol = () => useSesion((s) => s.usuario?.rol ?? 'CAJERO');
