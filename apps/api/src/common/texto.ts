/** Minúsculas y sin acentos, para comparar alergias y búsquedas. */
export const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * ¿El paciente es alérgico a este principio activo?
 * Se compara contra la familia (ej. "penicilinas") y contra el nombre de la molécula.
 * Devuelve la alergia que choca, o null.
 */
export function alergiaQueChoca(alergias: string[], principio: { nombre: string; familia: string | null }): string | null {
  const objetivo = [principio.nombre, principio.familia].filter(Boolean).map((x) => normalizar(x!));
  return alergias.find((a) => objetivo.includes(normalizar(a))) ?? null;
}
