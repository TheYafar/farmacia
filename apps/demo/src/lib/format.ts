const nf2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const usd = (v: number) => `$${nf2.format(v)}`;
export const bs = (v: number, tasa: number) => `Bs ${nf2.format(v * tasa)}`;
export const num2 = (v: number) => nf2.format(v);

/** Quita acentos y pasa a minúsculas para comparar búsquedas. */
export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export const daysUntil = (iso: string, from = new Date()) =>
  Math.ceil((new Date(iso).getTime() - from.getTime()) / 86_400_000);

/** "V-14582307" → "V-14.582.307" */
export const cedula = (c: string) => {
  const [l, d = ''] = c.split('-');
  return `${l}-${d.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
};
