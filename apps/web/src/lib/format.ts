import { fechaVe, redondearBs } from '@farmacia/shared';
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

/** Días que faltan para una fecha, contando por días de Venezuela (0 = hoy, negativo = ya pasó). */
export const daysUntil = (iso: string) => Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fechaVe()}T00:00:00Z`)) / 86_400_000);

export const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' });

/** ¿El cliente es alérgico a este principio activo? (misma regla que el servidor) */
export function alergiaQueChoca(alergias: string[], principio: { nombre: string; familia: string | null }) {
  const objetivo = [principio.nombre, principio.familia].filter(Boolean).map((x) => normalizar(x!));
  return alergias.find((a) => objetivo.includes(normalizar(a))) ?? null;
}

/**
 * Lee un monto escrito a mano, con coma o con punto decimal:
 * «1.250,50» → 1250.5 · «1250,5» → 1250.5 · «264.52» → 264.52 · «0.85» → 0.85 · «1.250» → 1250 (punto de miles).
 * Vacío o inválido → NaN.
 */
export function leerMonto(texto: string): number {
  let s = texto.trim().replace(/\s|Bs|\$/gi, '');
  if (!s) return NaN;
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    // El que va de último es el decimal; el otro, de miles.
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (coma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (punto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // «1.250» o «12.345.678»: puntos de miles.
    s = s.replace(/\./g, '');
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** «1 venta», «3 ventas». */
export const nVentas = (n: number) => `${n} venta${n === 1 ? '' : 's'}`;
