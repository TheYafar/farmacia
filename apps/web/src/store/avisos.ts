import { create } from 'zustand';

export interface Aviso { id: number; texto: string; tono?: 'ok' | 'bad' | 'info' }

let n = 0;
export const useAvisos = create<{ lista: Aviso[]; avisar: (texto: string, tono?: Aviso['tono']) => void }>((set) => ({
  lista: [],
  avisar: (texto, tono = 'info') => {
    const id = ++n;
    set((s) => ({ lista: [...s.lista, { id, texto, tono }] }));
    setTimeout(() => set((s) => ({ lista: s.lista.filter((a) => a.id !== id) })), 3200);
  },
}));
export const avisar = (texto: string, tono?: Aviso['tono']) => useAvisos.getState().avisar(texto, tono);
