export type Role = 'cajero' | 'regente' | 'admin';
export type Tier = 'Genérico' | 'Nacional' | 'Marca';

export interface Producto {
  id: string;
  codigoBarras: string;
  nombreComercial: string;
  laboratorio: string;
  principioActivoId: string;
  concentracion: string; // "500 mg"
  forma: string; // "Tabletas"
  unidadesPorCaja: number;
  precioUsd: number;
  stockLibre: number;
  stockReservado: number;
  tier: Tier;
  requiereRecipe?: boolean;
  psicotropico?: boolean;
}

export interface PrincipioActivo {
  id: string;
  nombre: string;
  familia?: string; // para cruzar alergias, ej. "penicilinas"
}

export interface Paciente {
  cedula: string;
  nombre: string;
  telefono: string;
  alergias: string[]; // familias o moléculas
  condiciones: string[];
  clienteDesde: string;
  medicoFrecuente?: string;
  habituales: { productoId: string; ultima: string }[];
  recipes: { fecha: string }[];
}

export type EstadoEspera = 'en_espera' | 'notificado' | 'custodia' | 'entregado' | 'expirado';
export interface SolicitudEspera {
  id: string;
  cedula: string;
  pacienteNombre: string;
  producto: string;
  precioUsd: number;
  estado: EstadoEspera;
  fechaSolicitud: string;
  venceReserva?: string;
  refPagoMovil?: string;
  gaveta?: string;
}

export interface Lote {
  id: string;
  productoId: string;
  numero: string;
  vence: string;
  libre: number;
  reservado: number;
}

export type Semaforo = 'verde' | 'amarillo' | 'rojo';
export interface LecturaItem {
  id: string;
  texto: string;
  confianza: number;
  candidatos: { principioActivoId: string; nombre: string; concentracion: string; forma: string; uso: string }[];
  resueltoCon?: number;
}
export interface RecipeLeido {
  id: string;
  cedula: string;
  medico: string;
  especialidad: string;
  fecha: string;
  enviadoPor: string;
  hace: string;
  items: LecturaItem[];
}
