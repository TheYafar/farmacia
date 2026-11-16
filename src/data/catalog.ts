import { norm } from '@/lib/format';
import { principios, productos } from './mock';
import type { Paciente, Producto } from './types';

export const principioById = (id: string) => principios.find((p) => p.id === id);
export const productoById = (id: string) => productos.find((p) => p.id === id);

export interface GrupoBioequivalente {
  key: string;
  principio: string;
  concentracion: string;
  forma: string;
  opciones: Producto[];
}

/** Agrupa por molécula + concentración + forma y ordena de menor a mayor precio. */
export function buscar(q: string): GrupoBioequivalente[] {
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const hits = productos.filter((p) => {
    const hay = norm(`${p.nombreComercial} ${principioById(p.principioActivoId)?.nombre} ${p.concentracion} ${p.laboratorio} ${p.forma} ${p.codigoBarras}`);
    return tokens.every((t) => hay.includes(t));
  });
  const keys = new Set(hits.map((p) => `${p.principioActivoId}|${p.concentracion}|${p.forma}`));
  return [...keys].map((key) => {
    const [pa, conc, forma] = key.split('|');
    const opciones = productos
      .filter((p) => p.principioActivoId === pa && p.concentracion === conc && p.forma === forma)
      .sort((a, b) => a.precioUsd - b.precioUsd);
    return { key, principio: principioById(pa!)?.nombre ?? pa!, concentracion: conc!, forma: forma!, opciones };
  });
}

export function choqueAlergia(prod: Producto, paciente?: Paciente | null): string | null {
  if (!paciente) return null;
  const pa = principioById(prod.principioActivoId);
  const hit = paciente.alergias.find((a) => a === pa?.familia || a === pa?.id);
  return hit ?? null;
}
