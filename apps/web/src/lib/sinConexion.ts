import { create } from 'zustand';
import type { Grupo } from '@/lib/tipos';
import { api, ApiError } from '@/lib/api';
import { normalizar } from '@/lib/format';

/**
 * Vender sin internet:
 *  · cada 10 minutos se guarda en el equipo una copia del catálogo (para buscar sin conexión);
 *  · las ventas cobradas sin conexión quedan en una cola y se envían solas al volver el internet,
 *    con la misma clave, así que el servidor nunca las guarda dos veces.
 */
const CATALOGO = 'catalogo-sin-conexion';
const COLA = 'ventas-pendientes';
const RECHAZADAS = 'ventas-rechazadas';

export interface Pendiente { clave: string; body: Record<string, unknown>; totalUsd: number; resumen: string; hechaEn: string }
export interface Rechazada extends Pendiente { motivo: string }

const leer = <T,>(k: string, def: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return def; } };
const escribir = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const useSinConexion = create<{ pendientes: Pendiente[]; rechazadas: Rechazada[]; catalogoEn: string | null }>(() => ({
  pendientes: leer<Pendiente[]>(COLA, []),
  rechazadas: leer<Rechazada[]>(RECHAZADAS, []),
  catalogoEn: leer<{ fecha: string } | null>(CATALOGO, null)?.fecha ?? null,
}));

export async function guardarCatalogo() {
  const r = await api<{ grupos: Grupo[] }>('/catalogo/sin-conexion');
  const fecha = new Date().toISOString();
  if (escribir(CATALOGO, { fecha, grupos: r.grupos })) useSinConexion.setState({ catalogoEn: fecha });
}

/** La copia completa del catálogo guardada en este equipo (para mostrar el inventario sin internet). */
export const catalogoLocal = (): Grupo[] => leer<{ grupos: Grupo[] } | null>(CATALOGO, null)?.grupos ?? [];

/** Búsqueda en la copia guardada (misma lógica que el servidor: todas las palabras). */
export function buscarLocal(q: string): Grupo[] {
  const cat = leer<{ grupos: Grupo[] } | null>(CATALOGO, null);
  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  if (!cat || !palabras.length) return [];
  return cat.grupos.filter((g) => {
    const texto = normalizar([g.principio.nombre, g.concentracion, g.forma, ...g.opciones.map((o) => `${o.nombreComercial} ${o.laboratorio} ${o.codigoBarras ?? ''}`)].join(' '));
    return palabras.every((p) => texto.includes(p));
  }).slice(0, 20);
}

export function encolar(p: Pendiente) {
  const lista = [...useSinConexion.getState().pendientes, p];
  if (!escribir(COLA, lista)) throw new Error('No hay espacio en el equipo para guardar la venta');
  useSinConexion.setState({ pendientes: lista });
}

let enviando = false;
/** Envía la cola en orden. Si el servidor rechaza una (ej. ya no hay stock), queda en «rechazadas» para revisarla. */
export async function enviarPendientes() {
  if (enviando || !useSinConexion.getState().pendientes.length) return 0;
  enviando = true;
  let enviadas = 0;
  try {
    for (const p of [...useSinConexion.getState().pendientes]) {
      try {
        await api('/ventas', { body: { ...p.body, clave: p.clave, hechaEn: p.hechaEn } });
        enviadas++;
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break; // se volvió a caer: se reintenta luego
        const rech = [...useSinConexion.getState().rechazadas, { ...p, motivo: e instanceof ApiError ? e.message : 'Error' }];
        escribir(RECHAZADAS, rech);
        useSinConexion.setState({ rechazadas: rech });
      }
      const resto = useSinConexion.getState().pendientes.filter((x) => x.clave !== p.clave);
      escribir(COLA, resto);
      useSinConexion.setState({ pendientes: resto });
    }
  } finally { enviando = false; }
  return enviadas;
}

export function descartarRechazada(clave: string) {
  const rech = useSinConexion.getState().rechazadas.filter((r) => r.clave !== clave);
  escribir(RECHAZADAS, rech);
  useSinConexion.setState({ rechazadas: rech });
}
