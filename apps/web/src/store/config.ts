import { create } from 'zustand';
import { api } from '@/lib/api';

export interface Configuracion {
  tasaModo: 'BCV_USD' | 'BCV_EUR' | 'MANUAL';
  tasaAjusteTipo: 'NINGUNO' | 'BS' | 'PCT';
  tasaAjusteValor: number;
  bcvUsd: number | null; bcvEur: number | null; bcvFecha: string | null; bcvConsultado: string | null; bcvOrigen: string | null;
  tasaCalculada: { valor: string; fuente: string } | null;
  igtfActivo: boolean; igtfPct: number;
  farmaciaNombre: string | null; farmaciaRif: string | null; farmaciaDireccion: string | null; farmaciaTelefono: string | null;
  farmacia: { nombre: string; rif: string; direccion: string; telefono: string };
  ticketPie: string | null; ticketAncho: 58 | 80; ticketLetra: number; ticketCopias: number;
  ticketAuto: boolean; ticketMostrarBs: boolean; ticketMostrarTasa: boolean;
  recipeRetencionDias: number;
}

/** Configuración de la farmacia (tasa, ticket, impresora). Se carga al entrar y al guardar. */
export const useConfig = create<{ config: Configuracion | null; cargar: () => Promise<void> }>((set) => ({
  config: null,
  cargar: async () => { try { set({ config: await api<Configuracion>('/configuracion') }); } catch { /* se usan los valores por defecto */ } },
}));
