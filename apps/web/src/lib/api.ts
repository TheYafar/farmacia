import { create } from 'zustand';
/**
 * Cliente de la API. El token de acceso vive solo en memoria (nunca en localStorage);
 * la sesión se renueva con la cookie protegida que pone el servidor.
 */
const BASE = '/api/v1';
let token: string | null = null;
let renovando: Promise<boolean> | null = null;
let alExpirar: (() => void) | null = null;

export interface Bloqueo { productoId: string; motivo: 'FALTA_CEDULA' | 'FALTA_RECIPE' | 'ALERGIA' | 'CONTROLADO'; mensaje: string }

/** Estado de la conexión con el servidor: la barra roja «Sin conexión» lo usa. */
export const useConexion = create<{ enLinea: boolean }>(() => ({ enLinea: true }));
const marcar = (enLinea: boolean) => { if (useConexion.getState().enLinea !== enLinea) useConexion.setState({ enLinea }); };
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => marcar(false));
  window.addEventListener('online', () => { void fetch(`${BASE}/salud`).then((r) => marcar(r.ok)).catch(() => {}); });
}

export class ApiError extends Error {
  constructor(
    public status: number,
    mensaje: string,
    public errores: { campo: string; mensaje: string }[] = [],
    public bloqueos: Bloqueo[] = [],
    public codigo?: string,
  ) {
    super(mensaje);
  }
}

/** Demo: la caja del equipo se guarda aparte para no mezclarla con la de la farmacia real. */
let modoDemo = false;
export const ponerModoDemo = (v: boolean) => { modoDemo = v; };
export const esModoDemo = () => modoDemo;
export const claveCaja = () => (modoDemo ? 'cajaDemo' : 'caja');
/** Token de la caja de este equipo (se envía en cada petición para saber en qué caja se cobra). */
export function tokenCaja(): string | null {
  try { return (JSON.parse(localStorage.getItem(claveCaja()) ?? 'null') as { token?: string } | null)?.token ?? null; } catch { return null; }
}

export const sesionToken = {
  poner: (t: string | null) => { token = t; },
  alExpirar: (fn: () => void) => { alExpirar = fn; },
};

/** Pide un token nuevo con la cookie. Varias peticiones a la vez comparten una sola renovación. */
export function renovar(): Promise<boolean> {
  renovando ??= fetch(`${BASE}/auth/renovar`, { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) return false;
      const d = await r.json();
      token = d.accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => { renovando = null; });
  return renovando;
}

interface Opciones { method?: string; body?: unknown; form?: FormData; crudo?: boolean }

export async function api<T = unknown>(ruta: string, op: Opciones = {}, reintento = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const caja = tokenCaja();
  if (caja) headers['x-caja'] = caja;
  if (op.body !== undefined) headers['Content-Type'] = 'application/json';

  let r: Response;
  try {
    r = await fetch(`${BASE}${ruta}`, {
      method: op.method ?? (op.body !== undefined || op.form ? 'POST' : 'GET'),
      headers,
      credentials: 'include',
      body: op.form ?? (op.body !== undefined ? JSON.stringify(op.body) : undefined),
    });
  } catch {
    marcar(false);
    throw new ApiError(0, 'Sin conexión con el servidor. Revisa el internet e intenta de nuevo');
  }
  if (r.status >= 502 && r.status <= 504) {
    marcar(false);
    throw new ApiError(0, 'El servidor no responde. Intenta de nuevo en un momento');
  }
  marcar(true);

  if (r.status === 401 && reintento && !ruta.startsWith('/auth/')) {
    if (await renovar()) return api<T>(ruta, op, false);
    alExpirar?.();
  }
  if (op.crudo && r.ok) return r as unknown as T;
  if (r.status === 204) return undefined as T;

  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, datos.mensaje ?? 'Ocurrió un error', datos.errores, datos.bloqueos, datos.codigo);
  return datos as T;
}

/** Descarga una imagen protegida (foto de récipe) y devuelve una dirección local para mostrarla. */
export async function imagen(ruta: string): Promise<string> {
  const r = await api<Response>(ruta, { crudo: true });
  return URL.createObjectURL(await r.blob());
}
