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
  stockBajo?: number;
  hoy: { ventas: number; usd: string; bs: string; devueltoUsd?: string };
  semana: { dia: string; usd: string }[];
  lotesVencen30Dias: number;
  clientesEsperando: number;
  enGaveta: number;
  demandaInsatisfecha: { producto?: { nombreComercial: string; concentracion: string }; veces: number }[];
}

export interface Usuario { id: string; nombre: string; usuario: string; rol: Rol; activo: boolean; bloqueadoHasta: string | null }

export interface Pago { id: string; metodo: import('@farmacia/shared').MetodoPago; moneda: 'USD' | 'BS'; monto: string; montoUsd: string; referencia: string | null }

export interface Venta {
  id: string;
  numero: number;
  creadaEn: string;
  cedula: string | null;
  totalUsd: string;
  totalBs: string;
  tasa: string;
  vueltoMoneda: 'USD' | 'BS' | null;
  vueltoMonto: string;
  pagos: Pago[];
  cajero?: { nombre: string };
  lineas: { cantidad: number; precioUsd: string; producto: { nombreComercial: string; concentracion?: string } }[];
}

export type Montos = Record<import('@farmacia/shared').MetodoPago, number>;

export interface Turno {
  id: string;
  estado: 'ABIERTO' | 'CERRADO';
  fondoUsd: string;
  fondoBs: string;
  abiertoEn: string;
  cerradoEn: string | null;
  esperado: Montos | null;
  contado: Montos | null;
  diferencia: Montos | null;
  nota: string | null;
  revisadoEn: string | null;
  cajero?: { nombre: string };
  revisadoPor?: { nombre: string } | null;
  _count?: { ventas: number };
}

export interface Farmacia { nombre: string; rif: string; direccion: string; telefono: string }
