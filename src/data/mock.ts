import type { Lote, Paciente, PrincipioActivo, Producto, RecipeLeido, SolicitudEspera } from './types';

// Todos los datos son de ejemplo para la interfaz.
export const TASA_BCV_EJEMPLO = 236.4;

export const principios: PrincipioActivo[] = [
  { id: 'acetaminofen', nombre: 'Acetaminofén' },
  { id: 'losartan', nombre: 'Losartán potásico' },
  { id: 'amoxicilina', nombre: 'Amoxicilina', familia: 'penicilinas' },
  { id: 'ibuprofeno', nombre: 'Ibuprofeno', familia: 'aines' },
  { id: 'clonazepam', nombre: 'Clonazepam' },
  { id: 'clobazam', nombre: 'Clobazam' },
  { id: 'loratadina', nombre: 'Loratadina' },
  { id: 'metformina', nombre: 'Metformina' },
  { id: 'hidroclorotiazida', nombre: 'Hidroclorotiazida' },
];

let n = 0;
const p = (x: Omit<Producto, 'id' | 'codigoBarras'>): Producto => ({
  id: `p${++n}`,
  codigoBarras: `759${String(1000000000 + n * 7919).slice(0, 10)}`,
  ...x,
});

export const productos: Producto[] = [
  p({ nombreComercial: 'Acetaminofén', laboratorio: 'Lab. Orinoco', principioActivoId: 'acetaminofen', concentracion: '500 mg', forma: 'Tabletas', unidadesPorCaja: 10, precioUsd: 0.85, stockLibre: 12, stockReservado: 0, tier: 'Genérico' }),
  p({ nombreComercial: 'Acetaminofén', laboratorio: 'Genéricos Ávila', principioActivoId: 'acetaminofen', concentracion: '500 mg', forma: 'Tabletas', unidadesPorCaja: 20, precioUsd: 1.1, stockLibre: 34, stockReservado: 2, tier: 'Genérico' }),
  p({ nombreComercial: 'Atamel', laboratorio: 'Lab. nacional', principioActivoId: 'acetaminofen', concentracion: '500 mg', forma: 'Tabletas', unidadesPorCaja: 20, precioUsd: 2.35, stockLibre: 18, stockReservado: 0, tier: 'Nacional' }),
  p({ nombreComercial: 'Tylenol', laboratorio: 'Importado', principioActivoId: 'acetaminofen', concentracion: '500 mg', forma: 'Tabletas', unidadesPorCaja: 24, precioUsd: 4.9, stockLibre: 0, stockReservado: 0, tier: 'Marca' }),
  p({ nombreComercial: 'Acetaminofén', laboratorio: 'Genéricos Ávila', principioActivoId: 'acetaminofen', concentracion: '160 mg/5 ml', forma: 'Jarabe', unidadesPorCaja: 1, precioUsd: 1.9, stockLibre: 8, stockReservado: 0, tier: 'Genérico' }),
  p({ nombreComercial: 'Losartán potásico', laboratorio: 'Lab. Orinoco', principioActivoId: 'losartan', concentracion: '50 mg', forma: 'Tabletas', unidadesPorCaja: 30, precioUsd: 3.2, stockLibre: 22, stockReservado: 1, tier: 'Genérico' }),
  p({ nombreComercial: 'Losartán potásico', laboratorio: 'Farma Caribe', principioActivoId: 'losartan', concentracion: '50 mg', forma: 'Tabletas', unidadesPorCaja: 30, precioUsd: 4.1, stockLibre: 9, stockReservado: 0, tier: 'Nacional' }),
  p({ nombreComercial: 'Cozaar', laboratorio: 'Importado', principioActivoId: 'losartan', concentracion: '50 mg', forma: 'Tabletas', unidadesPorCaja: 30, precioUsd: 11.8, stockLibre: 0, stockReservado: 3, tier: 'Marca' }),
  p({ nombreComercial: 'Amoxicilina', laboratorio: 'Genéricos Ávila', principioActivoId: 'amoxicilina', concentracion: '500 mg', forma: 'Cápsulas', unidadesPorCaja: 21, precioUsd: 2.2, stockLibre: 14, stockReservado: 2, tier: 'Genérico', requiereRecipe: true }),
  p({ nombreComercial: 'Amoxicilina', laboratorio: 'Farma Caribe', principioActivoId: 'amoxicilina', concentracion: '500 mg', forma: 'Cápsulas', unidadesPorCaja: 21, precioUsd: 2.9, stockLibre: 30, stockReservado: 0, tier: 'Nacional', requiereRecipe: true }),
  p({ nombreComercial: 'Amoxil', laboratorio: 'Importado', principioActivoId: 'amoxicilina', concentracion: '500 mg', forma: 'Cápsulas', unidadesPorCaja: 21, precioUsd: 7.4, stockLibre: 6, stockReservado: 0, tier: 'Marca', requiereRecipe: true }),
  p({ nombreComercial: 'Ibuprofeno', laboratorio: 'Lab. Orinoco', principioActivoId: 'ibuprofeno', concentracion: '400 mg', forma: 'Tabletas', unidadesPorCaja: 10, precioUsd: 1.05, stockLibre: 40, stockReservado: 0, tier: 'Genérico' }),
  p({ nombreComercial: 'Ibuprofeno', laboratorio: 'Farma Caribe', principioActivoId: 'ibuprofeno', concentracion: '400 mg', forma: 'Tabletas', unidadesPorCaja: 20, precioUsd: 1.8, stockLibre: 25, stockReservado: 0, tier: 'Nacional' }),
  p({ nombreComercial: 'Advil', laboratorio: 'Importado', principioActivoId: 'ibuprofeno', concentracion: '400 mg', forma: 'Tabletas', unidadesPorCaja: 20, precioUsd: 5.6, stockLibre: 4, stockReservado: 0, tier: 'Marca' }),
  p({ nombreComercial: 'Clonazepam', laboratorio: 'Lab. nacional', principioActivoId: 'clonazepam', concentracion: '0,5 mg', forma: 'Tabletas', unidadesPorCaja: 30, precioUsd: 3.6, stockLibre: 10, stockReservado: 0, tier: 'Nacional', requiereRecipe: true, psicotropico: true }),
  p({ nombreComercial: 'Clobazam', laboratorio: 'Importado', principioActivoId: 'clobazam', concentracion: '10 mg', forma: 'Tabletas', unidadesPorCaja: 30, precioUsd: 9.2, stockLibre: 3, stockReservado: 0, tier: 'Marca', requiereRecipe: true, psicotropico: true }),
  p({ nombreComercial: 'Loratadina', laboratorio: 'Genéricos Ávila', principioActivoId: 'loratadina', concentracion: '10 mg', forma: 'Tabletas', unidadesPorCaja: 10, precioUsd: 0.95, stockLibre: 28, stockReservado: 0, tier: 'Genérico' }),
  p({ nombreComercial: 'Clarityne', laboratorio: 'Importado', principioActivoId: 'loratadina', concentracion: '10 mg', forma: 'Tabletas', unidadesPorCaja: 10, precioUsd: 4.3, stockLibre: 7, stockReservado: 0, tier: 'Marca' }),
  p({ nombreComercial: 'Glucophage XR', laboratorio: 'Importado', principioActivoId: 'metformina', concentracion: '750 mg', forma: 'Tabletas', unidadesPorCaja: 30, precioUsd: 6.8, stockLibre: 0, stockReservado: 1, tier: 'Marca' }),
  p({ nombreComercial: 'Metformina', laboratorio: 'Lab. Orinoco', principioActivoId: 'metformina', concentracion: '850 mg', forma: 'Tabletas', unidadesPorCaja: 30, precioUsd: 2.4, stockLibre: 19, stockReservado: 0, tier: 'Genérico' }),
  p({ nombreComercial: 'Hidroclorotiazida', laboratorio: 'Genéricos Ávila', principioActivoId: 'hidroclorotiazida', concentracion: '25 mg', forma: 'Tabletas', unidadesPorCaja: 20, precioUsd: 1.4, stockLibre: 15, stockReservado: 0, tier: 'Genérico' }),
];

export const pacientes: Paciente[] = [
  {
    cedula: 'V-14582307', nombre: 'María Fernanda Rojas', telefono: '0414-555-0192',
    alergias: ['penicilinas'], condiciones: ['Hipertensa'], clienteDesde: 'marzo 2025',
    medicoFrecuente: 'Dr. A. Ruiz · Cardiología',
    habituales: [{ productoId: 'p6', ultima: '14 oct' }, { productoId: 'p21', ultima: '14 oct' }],
    recipes: [{ fecha: '14 oct' }, { fecha: '02 sep' }, { fecha: '30 jul' }],
  },
  {
    cedula: 'V-9871220', nombre: 'José Peña', telefono: '0412-555-0148',
    alergias: ['aines'], condiciones: ['Diabético'], clienteDesde: 'enero 2024',
    habituales: [{ productoId: 'p20', ultima: '05 nov' }], recipes: [{ fecha: '05 nov' }],
  },
  {
    cedula: 'V-20114906', nombre: 'Andrea Silva', telefono: '0424-555-0110',
    alergias: [], condiciones: [], clienteDesde: 'agosto 2025',
    habituales: [], recipes: [],
  },
];

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

export const esperaInicial: SolicitudEspera[] = [
  { id: 'w1', cedula: 'V-14582307', pacienteNombre: 'M. Rojas', producto: 'Tylenol 500 mg', precioUsd: 4.9, estado: 'en_espera', fechaSolicitud: '02 nov' },
  { id: 'w2', cedula: 'V-9871220', pacienteNombre: 'J. Peña', producto: 'Concor 5 mg', precioUsd: 5.5, estado: 'en_espera', fechaSolicitud: '28 oct' },
  { id: 'w3', cedula: 'V-20114906', pacienteNombre: 'A. Silva', producto: 'Glucophage XR 750 mg', precioUsd: 6.8, estado: 'notificado', fechaSolicitud: '20 oct', venceReserva: inHours(1.7) },
  { id: 'w4', cedula: 'V-17450331', pacienteNombre: 'L. Gómez', producto: 'Eutirox 100 mcg', precioUsd: 7.1, estado: 'custodia', fechaSolicitud: '15 oct', refPagoMovil: '004521', gaveta: 'A-3' },
  { id: 'w5', cedula: 'V-11208774', pacienteNombre: 'R. Díaz', producto: 'Cozaar 50 mg', precioUsd: 11.8, estado: 'entregado', fechaSolicitud: '10 oct' },
  { id: 'w6', cedula: 'V-25330981', pacienteNombre: 'C. Mora', producto: 'Clarityne 10 mg', precioUsd: 4.3, estado: 'expirado', fechaSolicitud: '09 oct' },
];

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

export const lotes: Lote[] = [
  { id: 'l1', productoId: 'p9', numero: 'L2309A', vence: inDays(26), libre: 14, reservado: 2 },
  { id: 'l2', productoId: 'p9', numero: 'L2402C', vence: inDays(84), libre: 30, reservado: 0 },
  { id: 'l3', productoId: 'p9', numero: 'L2405F', vence: inDays(278), libre: 40, reservado: 4 },
  { id: 'l4', productoId: 'p2', numero: 'AV-118', vence: inDays(19), libre: 6, reservado: 0 },
  { id: 'l5', productoId: 'p6', numero: 'OR-552', vence: inDays(57), libre: 22, reservado: 1 },
  { id: 'l6', productoId: 'p12', numero: 'OR-610', vence: inDays(140), libre: 40, reservado: 0 },
  { id: 'l7', productoId: 'p17', numero: 'AV-201', vence: inDays(44), libre: 28, reservado: 0 },
  { id: 'l8', productoId: 'p15', numero: 'LN-077', vence: inDays(210), libre: 10, reservado: 0 },
];

export const recipesPendientes: RecipeLeido[] = [
  {
    id: 'rx1', cedula: 'V-14582307', medico: 'Dra. L. Paredes', especialidad: 'Neurología', fecha: 'hoy',
    enviadoPor: 'Ana P. (caja 1)', hace: 'hace 2 min',
    items: [
      { id: 'i1', texto: 'Amoxicilina 500', confianza: 94, candidatos: [{ principioActivoId: 'amoxicilina', nombre: 'Amoxicilina', concentracion: '500 mg', forma: 'Cápsulas', uso: 'Antibiótico (penicilina).' }] },
      { id: 'i2', texto: 'Clona… 0,5 / Clob… 10', confianza: 58, candidatos: [
        { principioActivoId: 'clonazepam', nombre: 'Clonazepam', concentracion: '0,5 mg', forma: 'Tabletas', uso: 'Benzodiazepina. Ansiedad, crisis de pánico, convulsiones.' },
        { principioActivoId: 'clobazam', nombre: 'Clobazam', concentracion: '10 mg', forma: 'Tabletas', uso: 'Benzodiazepina. Epilepsia como tratamiento añadido.' },
      ] },
      { id: 'i3', texto: 'Ibuprof. 400', confianza: 82, candidatos: [{ principioActivoId: 'ibuprofeno', nombre: 'Ibuprofeno', concentracion: '400 mg', forma: 'Tabletas', uso: 'Analgésico y antiinflamatorio (AINE).' }] },
    ],
  },
];

export const demandaInsatisfecha = [
  { producto: 'Tylenol 500 mg', veces: 14 },
  { producto: 'Cozaar 50 mg', veces: 11 },
  { producto: 'Glucophage XR 750 mg', veces: 9 },
  { producto: 'Concor 5 mg', veces: 6 },
  { producto: 'Eutirox 100 mcg', veces: 4 },
];

export const ventasSemana = [
  { dia: 'Lun', usd: 980 }, { dia: 'Mar', usd: 1120 }, { dia: 'Mié', usd: 1045 },
  { dia: 'Jue', usd: 1310 }, { dia: 'Vie', usd: 1490 }, { dia: 'Sáb', usd: 1620 }, { dia: 'Hoy', usd: 1284 },
];
