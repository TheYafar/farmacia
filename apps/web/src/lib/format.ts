import { redondearBs } from '@farmacia/shared';
import { useConfig } from '@/store/config';
export { formatearCedula as cedula } from '@farmacia/shared';

const nf2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num2 = (v: number | string) => nf2.format(Number(v));
export const usd = (v: number | string) => `$${nf2.format(Number(v))}`;
/** Precio en bolívares con el redondeo de la farmacia (Configuración: 0, 1, 5 o 10 Bs). */
export const bs = (v: number | string, tasa: number | null) => (tasa ? `Bs ${nf2.format(redondearBs(Number(v) * tasa, useConfig.getState().config?.redondeoBs ?? 0))}` : 'Bs —');

export const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

export const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' });

/** ¿El cliente es alérgico a este principio activo? (misma regla que el servidor) */
export function alergiaQueChoca(alergias: string[], principio: { nombre: string; familia: string | null }) {
  const objetivo = [principio.nombre, principio.familia].filter(Boolean).map((x) => normalizar(x!));
  return alergias.find((a) => objetivo.includes(normalizar(a))) ?? null;
}
