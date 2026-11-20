import { create } from 'zustand';
import { api, renovar, sesionToken } from '@/lib/api';
import type { UsuarioSesion } from '@/lib/tipos';
import { useCaja } from './caja';

const olvidarCaja = () => useCaja.setState({ turno: null, cargada: false, ventas: 0, totalUsd: '0.00' });

interface Sesion {
  usuario: UsuarioSesion | null;
  listo: boolean;
  tasa: number | null;
  /** Error al entrar con un enlace de soporte (se muestra en la pantalla de entrada). */
  errorEntrada: string | null;
  restaurar: () => Promise<void>;
  entrar: (usuario: string, clave: string, codigo?: string) => Promise<void>;
  salir: () => Promise<void>;
  cargarTasa: () => Promise<void>;
}

export const useSesion = create<Sesion>((set, get) => ({
  usuario: null,
  listo: false,
  tasa: null,
  errorEntrada: null,

  /** Al abrir la app: si hay una sesión guardada en la cookie, se recupera sin pedir la clave. */
  restaurar: async () => {
    // Soporte remoto: llega con ?soporte=… desde el panel central (el dueño dio permiso).
    const token = new URLSearchParams(location.search).get('soporte');
    if (token) {
      history.replaceState(null, '', location.pathname);
      try {
        const r = await api<{ accessToken: string; usuario: UsuarioSesion }>('/auth/soporte', { body: { token } });
        sesionToken.poner(r.accessToken);
        olvidarCaja();
        set({ usuario: r.usuario, listo: true });
        await get().cargarTasa();
        return;
      } catch (e) {
        set({ errorEntrada: e instanceof Error ? e.message : 'No se pudo entrar como soporte' });
      }
    }
    if (await renovar()) {
      try {
        set({ usuario: await api<UsuarioSesion>('/auth/yo') });
        await get().cargarTasa();
      } catch { /* sesión inválida */ }
    }
    set({ listo: true });
  },

  entrar: async (usuario, clave, codigo) => {
    const r = await api<{ accessToken: string; usuario: UsuarioSesion }>('/auth/login', { body: { usuario, clave, codigo: codigo || undefined } });
    sesionToken.poner(r.accessToken);
    olvidarCaja();
    set({ usuario: r.usuario, errorEntrada: null });
    await get().cargarTasa();
  },

  salir: async () => {
    try { await api('/auth/salir', { method: 'POST' }); } catch { /* ya estaba cerrada */ }
    sesionToken.poner(null);
    olvidarCaja();
    set({ usuario: null });
  },

  cargarTasa: async () => {
    const rol = get().usuario?.rol;
    if (rol === 'SUPERADMIN' || rol === 'SOPORTE') return set({ tasa: null });
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
  olvidarCaja();
  useSesion.setState({ usuario: null });
});

export const useRol = () => useSesion((s) => s.usuario?.rol ?? 'CAJERO');
