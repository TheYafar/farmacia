import type { CategoriaRiesgo, EstadoEspera, NivelPrecio, Rol } from '@farmacia/shared';

export interface UsuarioSesion { id: string; nombre: string; usuario?: string; rol: Rol }

export interface Opcion {
  id: string;
  codigoBarras: string | null;
  nombreComercial: string;
  laboratorio: string;
  concentracion: string;
  forma: string;
  unidadesPorCaja: number;
  precioUsd: string;
  precioUnidadUsd: string;
  nivel: NivelPrecio;
  requiereRecipe: boolean;
  stockLibre: number;
  stockReservado: number;
}

export interface Principio { id: string; nombre: string; familia: string | null; riesgo: CategoriaRiesgo; uso: string | null }

export interface Grupo { principio: Principio; concentracion: string; forma: string; opciones: Opcion[] }

export interface Paciente {
  cedula: string;
  nombre: string;
  telefono: string;
  alergias: string[];
  condiciones: string[];
  creadoEn: string;
  habituales?: { producto?: { id: string; nombreComercial: string; concentracion: string; unidadesPorCaja: number; precioUsd: string }; veces: number; ultimaVez: string | null }[];
  recipes?: { id: string; estado: string; creadoEn: string }[];
  esperas?: { id: string; estado: EstadoEspera; producto: { nombreComercial: string; concentracion: string }; gaveta: string | null }[];
}

export interface Autorizacion {
  id: string;
  cedula: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  razon: string | null;
  motivo: string | null;
  creadaEn: string;
  paciente: { nombre: string; cedula: string; alergias: string[]; condiciones: string[] };
  producto: { id: string; nombreComercial: string; concentracion: string; forma: string; principioActivo: { nombre: string; familia: string | null; riesgo: CategoriaRiesgo; uso: string | null } };
  solicitadaPor: { nombre: string } | null;
  regente: { nombre: string } | null;
}

export interface Recipe {
  id: string;
  cedula: string | null;
  estado: 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO';
  creadoEn: string;
  lecturaIa: { texto: string; confianza: number; candidatos: string[] }[] | null;
  paciente: { nombre: string; alergias: string[] } | null;
  creadoPor?: { nombre: string };
}

export interface Solicitud {
  id: string;
  cedula: string;
  estado: EstadoEspera;
  solicitadaEn: string;
  venceReserva: string | null;
  referenciaPagoMovil: string | null;
  gaveta: string | null;
  paciente: { nombre: string; telefono: string };
  producto: { nombreComercial: string; concentracion: string; precioUsd: string };
}

export interface Lote {
  id: string;
  numero: string;
  vence: string;
  stockLibre: number;
  stockReservado: number;
  producto: { nombreComercial: string; concentracion: string; laboratorio: string };
}

export interface Resumen {
  hoy: { ventas: number; usd: string; bs: string };
  semana: { dia: string; usd: string }[];
  lotesVencen30Dias: number;
  clientesEsperando: number;
  enGaveta: number;
  demandaInsatisfecha: { producto?: { nombreComercial: string; concentracion: string }; veces: number }[];
}

export interface Usuario { id: string; nombre: string; usuario: string; rol: Rol; activo: boolean; bloqueadoHasta: string | null }
