/**
 * Reglas y validaciones compartidas entre la app (apps/web) y el servidor (apps/api).
 * Lo que se valida aquí se valida igual en los dos lados: el servidor nunca confía en la app.
 */
import { z } from 'zod';

/** Mensajes de validación en español para todo el sistema (app y servidor). */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Falta este dato' };
      if (issue.expected === 'number') return { message: 'Debe ser un número' };
      return { message: 'El dato no es válido' };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Debe ser uno de: ${issue.options.join(', ')}` };
    case z.ZodIssueCode.invalid_date:
      return { message: 'Fecha inválida. Usa el formato 2027-08-21 o 21/08/2027' };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'Falta este dato' : `Debe tener al menos ${issue.minimum} caracteres` };
      if (issue.type === 'number') return { message: issue.minimum === 0 ? 'No puede ser negativo' : 'Debe ser mayor que cero' };
      if (issue.type === 'array') return { message: `Debe tener al menos ${issue.minimum} elementos` };
      break;
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Máximo ${issue.maximum} caracteres` };
      if (issue.type === 'number') return { message: `No puede ser mayor que ${issue.maximum}` };
      if (issue.type === 'array') return { message: `Máximo ${issue.maximum} elementos` };
      break;
    case z.ZodIssueCode.not_multiple_of:
      return { message: 'Máximo 2 decimales' };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'uuid') return { message: 'Identificador inválido' };
      return { message: 'Formato inválido' };
  }
  return { message: ctx.defaultError };
});

// ---------- Enumeraciones ----------

/** Roles de una farmacia. */
export const ROLES = ['CAJERO', 'REGENTE', 'ADMIN'] as const;
/** Roles del panel central (quien vende el sistema): super admin y soporte. */
export const ROLES_CENTRAL = ['SUPERADMIN', 'SOPORTE'] as const;
export type Rol = (typeof ROLES)[number] | (typeof ROLES_CENTRAL)[number];
export const esRolCentral = (r: Rol) => r === 'SUPERADMIN' || r === 'SOPORTE';

export const NIVELES_PRECIO = ['GENERICO', 'NACIONAL', 'MARCA'] as const;
export type NivelPrecio = (typeof NIVELES_PRECIO)[number];

/** Riesgo del principio activo: define si la venta necesita récipe o autorización del Regente. */
export const CATEGORIAS_RIESGO = ['NORMAL', 'ANTIBIOTICO', 'PSICOTROPICO'] as const;
export type CategoriaRiesgo = (typeof CATEGORIAS_RIESGO)[number];

export const METODOS_PAGO = ['PAGO_MOVIL', 'PUNTO_DE_VENTA', 'EFECTIVO_USD', 'EFECTIVO_BS'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ESTADOS_ESPERA = ['EN_ESPERA', 'NOTIFICADO', 'PAGADO_CUSTODIA', 'ENTREGADO', 'EXPIRADO', 'CANCELADO'] as const;
export type EstadoEspera = (typeof ESTADOS_ESPERA)[number];

export const ESTADOS_RECIPE = ['PENDIENTE', 'VALIDADO', 'RECHAZADO'] as const;
export type EstadoRecipe = (typeof ESTADOS_RECIPE)[number];

// ---------- Reglas de negocio ----------

/** Días antes del vencimiento en que se avisa (documento, sección 2). */
export const ALERTAS_VENCIMIENTO_DIAS = [90, 60, 30] as const;

/** Semáforo de lectura de récipes. Por debajo de 75 % siempre decide el Regente (documento, sección 4). */
export const UMBRAL_VERDE = 90;
export const UMBRAL_ROJO = 75;
export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO';
export function semaforo(confianza: number, esLasa = false): Semaforo {
  if (esLasa || confianza < UMBRAL_ROJO) return 'ROJO';
  return confianza >= UMBRAL_VERDE ? 'VERDE' : 'AMARILLO';
}

/** Horas que tiene el cliente para pagar una reserva notificada por WhatsApp. */
export const HORAS_RESERVA = 3;

// ---------- Cédula ----------

const RE_CEDULA = /^([VEJ])-?(\d{6,9})$/;

/** "v 14.582.307" → "V-14582307". Devuelve null si no es válida. */
export function normalizarCedula(entrada: string): string | null {
  const limpia = entrada.toUpperCase().replace(/[\s.]/g, '');
  const conLetra = /^\d/.test(limpia) ? `V${limpia}` : limpia;
  const m = RE_CEDULA.exec(conLetra);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** "V-14582307" → "V-14.582.307" */
export function formatearCedula(cedula: string): string {
  const [letra, numero = ''] = cedula.split('-');
  return `${letra}-${numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export const cedulaSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizarCedula(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cédula inválida. Ejemplo: V-14582307' });
      return z.NEVER;
    }
    return n;
  });

// ---------- Validaciones de entrada ----------

const texto = (max: number) => z.string().trim().min(1).max(max);
/** Montos en dólares con máximo 2 decimales, siempre positivos. */
const montoUsd = z.number().positive().max(100_000).multipleOf(0.01);

export const loginSchema = z.object({
  /** Usuario o correo. */
  usuario: z.string().trim().toLowerCase().min(3).max(120),
  clave: z.string().min(6).max(128),
  /** Código de 6 números de la app de autenticación, si el usuario tiene la clave de dos pasos. */
  codigo: z.string().trim().regex(/^\d{6}$/).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const crearUsuarioSchema = z.object({
  nombre: texto(80),
  usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Solo letras, números, punto, guion y guion bajo'),
  clave: z.string().min(10, 'La clave debe tener al menos 10 caracteres').max(128),
  rol: z.enum(ROLES),
  correo: z.string().trim().toLowerCase().email('Correo inválido').max(120).optional().or(z.literal('').transform(() => undefined)),
});
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

export const pacienteSchema = z.object({
  cedula: cedulaSchema,
  nombre: texto(120),
  telefono: z.string().trim().regex(/^0(4\d{2}|2\d{2})-?\d{7}$/, 'Teléfono inválido. Ejemplo: 0414-5550192'),
  alergias: z.array(texto(60)).max(30).default([]),
  condiciones: z.array(texto(60)).max(30).default([]),
  /** El cliente aceptó el aviso de privacidad (sus datos de salud solo se usan para atenderlo). */
  consentimiento: z.boolean().optional(),
});
export type PacienteInput = z.infer<typeof pacienteSchema>;

export const productoSchema = z.object({
  codigoBarras: z.string().trim().regex(/^\d{8,14}$/).optional(),
  nombreComercial: texto(120),
  laboratorio: texto(120),
  principioActivoId: z.string().uuid(),
  concentracion: texto(40),
  forma: texto(40),
  unidadesPorCaja: z.number().int().positive().max(1000),
  precioUsd: montoUsd,
  nivel: z.enum(NIVELES_PRECIO),
  requiereRecipe: z.boolean().default(false),
  stockMinimo: z.number().int().min(0).max(100_000).default(0),
  ivaPct: z.number().min(0).max(30).default(0),
  categoria: z.string().trim().min(1).max(40).default('Medicamentos'),
  activo: z.boolean().default(true),
});
export type ProductoInput = z.infer<typeof productoSchema>;

export const tasaSchema = z.object({
  valor: z.number().positive().max(1_000_000),
  fuente: z.string().trim().max(40).default('BCV'),
});
export type TasaInput = z.infer<typeof tasaSchema>;

/** Factura de la droguería. `factorVenta` convierte una caja máster en unidades de venta (ej. 1 display = 10 blísteres). */
export const compraSchema = z.object({
  proveedor: texto(120),
  numeroFactura: texto(40),
  /** Días de crédito que da la droguería (0 = de contado). */
  diasCredito: z.number().int().min(0).max(180).default(0),
  lineas: z
    .array(
      z.object({
        productoId: z.string().uuid(),
        numeroLote: texto(40),
        vence: z.coerce.date(),
        cantidad: z.number().int().positive().max(100_000),
        factorVenta: z.number().int().positive().max(1000).default(1),
        costoUsd: z.number().nonnegative().max(1_000_000).default(0),
      }),
    )
    .min(1)
    .max(500),
});
export type CompraInput = z.infer<typeof compraSchema>;

export const abonoSchema = z.object({
  montoUsd: z.number().positive().max(1_000_000),
  metodo: texto(30),
  referencia: z.string().trim().max(60).optional(),
});
export type AbonoInput = z.infer<typeof abonoSchema>;

export const clienteEmpresaSchema = z.object({
  rif: z.string().trim().toUpperCase().regex(/^[JGVEP]-?\d{8}-?\d$/, 'RIF inválido (ej. J-12345678-9)'),
  nombre: texto(120),
  telefono: z.string().trim().max(20).optional(),
  limiteUsd: z.number().nonnegative().max(1_000_000),
  diasCredito: z.number().int().min(0).max(180).default(15),
  descuentoPct: z.number().min(0).max(60).default(10),
});
export type ClienteEmpresaInput = z.infer<typeof clienteEmpresaSchema>;

export const pedidoMayorSchema = z.object({
  clienteId: z.string().uuid(),
  lineas: z.array(z.object({ productoId: z.string().uuid(), cantidad: z.number().int().positive().max(100_000) })).min(1).max(200),
  /** Días que vale la cotización (precio y stock). */
  validezDias: z.number().int().min(1).max(60).default(7),
  /** Convenio: empleado de la empresa que retira. */
  empleado: z.string().trim().max(120).optional(),
});
export type PedidoMayorInput = z.infer<typeof pedidoMayorSchema>;

/** El Regente aprueba un producto para un paciente: la venta debe citar esta autorización. */
export const autorizacionSchema = z.object({
  cedula: cedulaSchema,
  productoId: z.string().uuid(),
  motivo: texto(300),
});
export type AutorizacionInput = z.infer<typeof autorizacionSchema>;

/** El cajero pide permiso al Regente desde la venta. */
export const solicitarAutorizacionSchema = z.object({
  cedula: cedulaSchema,
  productoId: z.string().uuid(),
  razon: z.enum(['ALERGIA', 'CONTROLADO']),
});
export type SolicitarAutorizacionInput = z.infer<typeof solicitarAutorizacionSchema>;

export const responderAutorizacionSchema = z.object({
  motivo: z.string().trim().max(300).optional(),
});
export type ResponderAutorizacionInput = z.infer<typeof responderAutorizacionSchema>;

export const MONEDAS = ['USD', 'BS'] as const;
export type Moneda = (typeof MONEDAS)[number];

/** En qué moneda se cuenta cada método: solo el efectivo en dólares es en USD. */
export const monedaDe = (m: MetodoPago): Moneda => (m === 'EFECTIVO_USD' ? 'USD' : 'BS');
/** Métodos que pueden dar vuelto (lo electrónico se cobra exacto). */
export const ES_EFECTIVO = (m: MetodoPago) => m === 'EFECTIVO_USD' || m === 'EFECTIVO_BS';

const referencia = z.string().trim().regex(/^\d{4,20}$/, 'La referencia son de 4 a 20 números');

export const pagoSchema = z
  .object({
    metodo: z.enum(METODOS_PAGO),
    /** En la moneda del método: dólares para efectivo $, bolívares para todo lo demás. */
    monto: z.number().positive().max(100_000_000).multipleOf(0.01),
    referencia: referencia.optional(),
  })
  .refine((p) => p.metodo !== 'PAGO_MOVIL' || !!p.referencia, { message: 'El Pago Móvil necesita el número de referencia', path: ['referencia'] });
export type PagoInput = z.infer<typeof pagoSchema>;

export const crearVentaSchema = z
  .object({
    cedula: cedulaSchema.optional(),
    lineas: z
      .array(
        z.object({
          productoId: z.string().uuid(),
          cantidad: z.number().int().positive().max(1000),
          autorizacionId: z.string().uuid().optional(),
          recipeId: z.string().uuid().optional(),
        }),
      )
      .min(1)
      .max(100),
    /** Uno o varios pagos. Si la suma pasa del total, la diferencia es vuelto (solo si hubo efectivo). */
    pagos: z.array(pagoSchema).min(1).max(10).optional(),
    /** En qué moneda se da el vuelto. */
    vueltoMoneda: z.enum(MONEDAS).default('BS'),
    /** Forma corta: un solo método por el monto exacto. */
    metodoPago: z.enum(METODOS_PAGO).optional(),
    referenciaPago: referencia.optional(),
    /** Descuento a toda la venta. El cajero puede dar hasta 10 %; más, solo el farmacéutico o el dueño. */
    descuentoPct: z.number().min(0).max(50).default(0),
    descuentoMotivo: z.string().trim().max(60).optional(),
    /** Identificador que genera la app por cada cobro: evita guardar dos veces la misma venta. */
    clave: z.string().uuid().optional(),
    /** Venta hecha sin internet: cuándo se cobró de verdad (se envía después). Máximo 3 días atrás. */
    hechaEn: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 60_000 && d.getTime() > Date.now() - 3 * 86_400_000, 'Fecha de venta sin conexión inválida').optional(),
  })
  .refine((v) => !v.descuentoPct || !!v.descuentoMotivo, { message: 'El descuento necesita un motivo', path: ['descuentoMotivo'] })
  .refine((v) => !!v.pagos?.length || !!v.metodoPago, { message: 'Falta el pago', path: ['pagos'] })
  .refine((v) => v.pagos?.length || v.metodoPago !== 'PAGO_MOVIL' || !!v.referenciaPago, {
    message: 'El Pago Móvil necesita el número de referencia',
    path: ['referenciaPago'],
  });
export type CrearVentaInput = z.infer<typeof crearVentaSchema>;

export const crearEsperaSchema = z.object({
  cedula: cedulaSchema,
  productoId: z.string().uuid(),
});
export type CrearEsperaInput = z.infer<typeof crearEsperaSchema>;

export const confirmarPagoSchema = z.object({
  referenciaPagoMovil: z.string().trim().regex(/^\d{4,20}$/),
  gaveta: z.string().trim().max(10).optional(),
});
export type ConfirmarPagoInput = z.infer<typeof confirmarPagoSchema>;

export const validarRecipeSchema = z.object({
  aprobado: z.boolean(),
  /** Principio activo confirmado por el Regente para cada línea leída. */
  confirmados: z.array(z.object({ linea: z.number().int().min(0), principioActivoId: z.string().uuid() })).max(30).default([]),
  nota: z.string().trim().max(500).optional(),
});
export type ValidarRecipeInput = z.infer<typeof validarRecipeSchema>;

// ---------- Importación desde Excel ----------

/** Una fila del Excel de inventario. Cada fila es un producto y, si trae lote, su existencia. */
export const filaImportacionSchema = z
  .object({
    codigoBarras: z.string().trim().regex(/^\d{8,14}$/, 'El código de barras debe tener de 8 a 14 números').optional(),
    nombreComercial: texto(120),
    laboratorio: texto(120),
    principioActivo: texto(120),
    concentracion: texto(40),
    forma: texto(40),
    unidadesPorCaja: z.number().int().positive().max(1000),
    precioUsd: z.number().positive().max(100_000),
    nivel: z.enum(NIVELES_PRECIO).default('GENERICO'),
    requiereRecipe: z.boolean().default(false),
    /** Si viene vacío, se deduce del principio activo (psicotrópicos y antibióticos conocidos). */
    riesgo: z.enum(CATEGORIAS_RIESGO).optional(),
    familia: z.string().trim().max(60).optional(),
    ivaPct: z.number().min(0).max(100).optional(),
    categoria: z.string().trim().max(60).optional(),
    costoUsd: z.number().min(0).max(100_000).optional(),
    stockMinimo: z.number().int().min(0).max(100_000).optional(),
    lote: z.string().trim().max(40).optional(),
    vence: z.coerce.date().optional(),
    cantidad: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((f) => !f.lote || (f.vence && f.cantidad !== undefined), { message: 'Si pones un lote, también van la fecha de vencimiento y la cantidad', path: ['lote'] });
export type FilaImportacion = z.infer<typeof filaImportacionSchema>;

export const MAX_FILAS_IMPORTACION = 5000;
export const importacionSchema = z.object({
  filas: z.array(z.unknown()).min(1, 'El archivo no tiene filas').max(MAX_FILAS_IMPORTACION, `Máximo ${MAX_FILAS_IMPORTACION} filas por archivo`),
  /** false: solo revisa y muestra qué haría. true: guarda. */
  confirmar: z.boolean().default(false),
});
export type ImportacionInput = z.infer<typeof importacionSchema>;

/** Columnas del Excel, en el orden de la plantilla. */
export const COLUMNAS_IMPORTACION: { clave: keyof FilaImportacion; titulo: string; ejemplo: string | number }[] = [
  { clave: 'codigoBarras', titulo: 'Código de barras', ejemplo: '7591000000011' },
  { clave: 'nombreComercial', titulo: 'Nombre comercial', ejemplo: 'Atamel' },
  { clave: 'laboratorio', titulo: 'Laboratorio', ejemplo: 'Calox' },
  { clave: 'principioActivo', titulo: 'Principio activo', ejemplo: 'Acetaminofén' },
  { clave: 'concentracion', titulo: 'Concentración', ejemplo: '500 mg' },
  { clave: 'forma', titulo: 'Forma', ejemplo: 'Tabletas' },
  { clave: 'unidadesPorCaja', titulo: 'Unidades por caja', ejemplo: 20 },
  { clave: 'precioUsd', titulo: 'Precio USD', ejemplo: 2.35 },
  { clave: 'nivel', titulo: 'Nivel', ejemplo: 'NACIONAL' },
  { clave: 'requiereRecipe', titulo: 'Requiere récipe', ejemplo: 'NO' },
  { clave: 'riesgo', titulo: 'Riesgo', ejemplo: 'NORMAL' },
  { clave: 'familia', titulo: 'Familia alergia', ejemplo: '' },
  { clave: 'ivaPct', titulo: 'IVA %', ejemplo: 0 },
  { clave: 'categoria', titulo: 'Categoría', ejemplo: 'Medicamentos' },
  { clave: 'costoUsd', titulo: 'Costo USD', ejemplo: 1.6 },
  { clave: 'stockMinimo', titulo: 'Stock mínimo', ejemplo: 5 },
  { clave: 'lote', titulo: 'Lote', ejemplo: 'L2405F' },
  { clave: 'vence', titulo: 'Vence', ejemplo: '2027-08-21' },
  { clave: 'cantidad', titulo: 'Cantidad', ejemplo: 18 },
];

// ---------- Caja ----------

export const abrirCajaSchema = z.object({
  fondoUsd: z.number().min(0).max(100_000).multipleOf(0.01).default(0),
  fondoBs: z.number().min(0).max(100_000_000).multipleOf(0.01).default(0),
});
export type AbrirCajaInput = z.infer<typeof abrirCajaSchema>;

/** Lo que cuenta el cajero al cerrar, por método, en la moneda de cada uno. */
export const cerrarCajaSchema = z.object({
  contado: z.object({
    EFECTIVO_USD: z.number().min(0).max(100_000_000).multipleOf(0.01),
    EFECTIVO_BS: z.number().min(0).max(100_000_000).multipleOf(0.01),
    PAGO_MOVIL: z.number().min(0).max(100_000_000).multipleOf(0.01),
    PUNTO_DE_VENTA: z.number().min(0).max(100_000_000).multipleOf(0.01),
  }),
  nota: z.string().trim().max(500).optional(),
});
export type CerrarCajaInput = z.infer<typeof cerrarCajaSchema>;
export type MontosPorMetodo = Record<MetodoPago, number>;

export const principioSchema = z.object({
  nombre: texto(120),
  familia: z.string().trim().max(60).optional(),
  riesgo: z.enum(['NORMAL', 'ANTIBIOTICO', 'PSICOTROPICO']).default('NORMAL'),
  uso: z.string().trim().max(200).optional(),
});
export type PrincipioInput = z.infer<typeof principioSchema>;

export const devolucionSchema = z.object({
  lineas: z.array(z.object({ lineaId: z.string().uuid(), cantidad: z.number().int().positive().max(1000) })).min(1).max(100),
  motivo: texto(120),
  /** Cómo se le devuelve el dinero al cliente. */
  metodo: z.enum(METODOS_PAGO),
});
export type DevolucionInput = z.infer<typeof devolucionSchema>;

export const MOTIVOS_AJUSTE = ['MERMA', 'ROTO', 'VENCIDO', 'CONTEO', 'OTRO'] as const;
export const ajusteSchema = z.object({
  loteId: z.string().uuid(),
  /** Positivo suma, negativo resta. Para un conteo, la diferencia contra el sistema. */
  cantidad: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0, 'La cantidad no puede ser 0'),
  motivo: z.enum(MOTIVOS_AJUSTE),
  nota: z.string().trim().max(200).optional(),
});
export type AjusteInput = z.infer<typeof ajusteSchema>;

export const medicoSchema = z.object({
  nombre: texto(120),
  mpps: z.string().trim().regex(/^\d{3,8}$/, 'MPPS: solo números').optional(),
  especialidad: z.string().trim().max(60).default('General'),
});
export type MedicoInput = z.infer<typeof medicoSchema>;

export const CATEGORIAS = ['Medicamentos', 'Cuidado personal', 'Bebé', 'Misceláneos'] as const;

export const configuracionSchema = z.object({ igtfActivo: z.boolean(), igtfPct: z.number().min(0).max(10) });
export type ConfiguracionInput = z.infer<typeof configuracionSchema>;

export const preciosMasivoSchema = z.object({
  laboratorio: z.string().trim().max(120).optional(),
  categoria: z.string().trim().max(40).optional(),
  productoIds: z.array(z.string().uuid()).max(2000).optional(),
  /** Porcentaje de cambio: 5 = +5 %, -10 = −10 %. */
  pct: z.number().min(-50).max(200).refine((n) => n !== 0, 'El cambio no puede ser 0'),
  /** Redondear el precio nuevo a múltiplos de 0,05 $. */
  redondear: z.boolean().default(true),
  vistaPrevia: z.boolean().default(true),
}).refine((b) => b.laboratorio || b.categoria || b.productoIds?.length, { message: 'Elige un laboratorio, una categoría o productos', path: ['laboratorio'] });
export type PreciosMasivoInput = z.infer<typeof preciosMasivoSchema>;

export const codigo2faSchema = z.object({ codigo: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 números') });

const opcional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v === '' ? null : v));
export const configuracionGeneralSchema = z.object({
  tasaModo: z.enum(['BCV_USD', 'BCV_EUR', 'MANUAL']).optional(),
  tasaAjusteTipo: z.enum(['NINGUNO', 'BS', 'PCT']).optional(),
  tasaAjusteValor: z.number().min(0).max(100_000).optional(),
  igtfActivo: z.boolean().optional(),
  igtfPct: z.number().min(0).max(10).optional(),
  farmaciaNombre: opcional(80),
  farmaciaRif: opcional(20),
  farmaciaDireccion: opcional(160),
  farmaciaTelefono: opcional(40),
  ticketPie: opcional(200),
  ticketAncho: z.union([z.literal(58), z.literal(80)]).optional(),
  ticketLetra: z.number().int().min(9).max(16).optional(),
  ticketCopias: z.number().int().min(1).max(3).optional(),
  ticketAuto: z.boolean().optional(),
  ticketMostrarBs: z.boolean().optional(),
  ticketMostrarTasa: z.boolean().optional(),
  recipeRetencionDias: z.number().int().min(30).max(3650).optional(),
  redondeoBs: z.union([z.literal(0), z.literal(1), z.literal(5), z.literal(10)]).optional(),
});
export type ConfiguracionGeneralInput = z.infer<typeof configuracionGeneralSchema>;

export const ordenCompraSchema = z.object({
  proveedor: texto(120),
  lineas: z.array(z.object({ productoId: z.string().uuid(), cantidad: z.number().int().positive().max(100_000) })).min(1).max(300),
});
export type OrdenCompraInput = z.infer<typeof ordenCompraSchema>;

export const recibirOrdenSchema = z.object({
  numeroFactura: texto(40),
  diasCredito: z.number().int().min(0).max(180).default(0),
  lineas: z.array(z.object({
    lineaId: z.string().uuid(),
    recibido: z.number().int().min(0).max(100_000),
    numeroLote: z.string().trim().max(40).optional(),
    vence: z.coerce.date().optional(),
    costoUsd: z.number().nonnegative().max(1_000_000).default(0),
    factorVenta: z.number().int().positive().max(1000).default(1),
  })).min(1).max(300),
});
export type RecibirOrdenInput = z.infer<typeof recibirOrdenSchema>;

export const devolucionProveedorSchema = z.object({
  compraId: z.string().uuid(),
  compraLineaId: z.string().uuid(),
  cantidad: z.number().int().positive().max(100_000),
  motivo: texto(120),
});
export type DevolucionProveedorInput = z.infer<typeof devolucionProveedorSchema>;

// ---------- Redondeo en bolívares ----------

/** Redondea un monto en Bs al múltiplo más cercano (0 = céntimos). Lo usan la app y el servidor. */
export function redondearBs(v: number, paso: number) {
  return paso > 0 ? Math.round(v / paso) * paso : Math.round(v * 100) / 100;
}

// ---------- Usuarios ----------

export const editarUsuarioSchema = z.object({
  nombre: texto(80).optional(),
  rol: z.enum(ROLES).optional(),
  /** Vacío = quitar el correo. */
  correo: z.string().trim().toLowerCase().email('Correo inválido').max(120).nullable().optional().or(z.literal('').transform(() => null)),
});
export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;

// ---------- Controlados conocidos ----------

const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Moléculas que en Venezuela se venden con récipe (psicotrópicos/estupefacientes) o son antibióticos. Sirve para avisar si alguien las cargó como «Normal». */
export const PSICOTROPICOS_CONOCIDOS = ['alprazolam', 'bromazepam', 'clonazepam', 'clobazam', 'diazepam', 'lorazepam', 'midazolam', 'flunitrazepam', 'triazolam', 'zolpidem', 'zopiclona', 'eszopiclona', 'tramadol', 'codeina', 'morfina', 'oxicodona', 'hidrocodona', 'fentanilo', 'metadona', 'buprenorfina', 'tapentadol', 'petidina', 'meperidina', 'metilfenidato', 'fenobarbital', 'ketamina', 'fentermina'];
export const ANTIBIOTICOS_CONOCIDOS = ['amoxicilina', 'ampicilina', 'penicilina', 'dicloxacilina', 'oxacilina', 'azitromicina', 'claritromicina', 'eritromicina', 'ciprofloxacina', 'levofloxacina', 'moxifloxacina', 'norfloxacina', 'ofloxacina', 'cefalexina', 'cefadroxilo', 'cefuroxima', 'cefixima', 'ceftriaxona', 'cefotaxima', 'cefepime', 'cefaclor', 'cefdinir', 'doxiciclina', 'tetraciclina', 'minociclina', 'clindamicina', 'lincomicina', 'metronidazol', 'secnidazol', 'tinidazol', 'trimetoprim', 'sulfametoxazol', 'nitrofurantoina', 'fosfomicina', 'gentamicina', 'amikacina', 'vancomicina', 'linezolid', 'rifampicina', 'isoniazida', 'cloranfenicol'];
/** Riesgo que corresponde por el nombre del principio activo, o null si no es una molécula conocida. */
export function riesgoSugerido(principio: string): CategoriaRiesgo | null {
  const n = sinTildes(principio);
  if (PSICOTROPICOS_CONOCIDOS.some((m) => n.includes(m))) return 'PSICOTROPICO';
  if (ANTIBIOTICOS_CONOCIDOS.some((m) => n.includes(m))) return 'ANTIBIOTICO';
  return null;
}


// ---------- Panel central y soporte en línea ----------

/** Solo direcciones web normales (https, o http en la propia máquina). Nunca javascript: ni data:. */
export const esUrlWeb = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));
  } catch { return false; }
};
const opc = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

export const farmaciaRegistradaSchema = z.object({
  nombre: texto(80),
  rif: opc(20),
  contacto: opc(80),
  telefono: opc(40),
  url: z.string().trim().max(200).refine(esUrlWeb, 'Dirección inválida. Ejemplo: https://mifarmacia.com').optional().or(z.literal('').transform(() => undefined)),
  notas: opc(1000),
  activa: z.boolean().optional(),
  /** Plan contratado (vacío = sin plan: todo disponible). */
  planId: z.string().uuid().nullable().optional().or(z.literal('').transform(() => null)),
});
export type FarmaciaRegistradaInput = z.infer<typeof farmaciaRegistradaSchema>;

export const miembroEquipoSchema = crearUsuarioSchema.extend({ rol: z.enum(ROLES_CENTRAL) });
export type MiembroEquipoInput = z.infer<typeof miembroEquipoSchema>;

export const ticketNuevoSchema = z.object({ asunto: texto(120), texto: texto(4000) });
export type TicketNuevoInput = z.infer<typeof ticketNuevoSchema>;
export const mensajeSoporteSchema = z.object({ texto: texto(4000), cerrar: z.boolean().optional() });
export type MensajeSoporteInput = z.infer<typeof mensajeSoporteSchema>;

/** El código que el panel central le da a cada farmacia para enlazarse. */
export const enlaceCentralSchema = z.object({ codigo: z.string().trim().min(20).max(600) });
/** Acceso remoto: el dueño deja entrar a soporte por unas horas. */
export const accesoSoporteSchema = z.object({ horas: z.number().int().min(1).max(24) });

// ---------- Cajas (equipos de cobro) ----------

export const cajaSchema = z.object({
  nombre: texto(40),
  /** true: este equipo queda como esa caja. false: solo se crea (para pasarla luego con un código). */
  enEsteEquipo: z.boolean().default(true),
});
export type CajaInput = z.infer<typeof cajaSchema>;
/** Código de 6 letras/números para pasar una caja a otro equipo (se aceptan guiones y minúsculas). */
export const vincularCajaSchema = z.object({
  codigo: z.string().transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '')).pipe(z.string().length(6, 'El código tiene 6 letras o números')),
});
export const editarCajaSchema = z.object({ nombre: texto(40).optional(), activa: z.boolean().optional() });

// ---------- Planes ----------

/**
 * Módulos que se pueden incluir o no en un plan. Los demás (vender, caja, récipes, controlados,
 * inventario, catálogo, usuarios…) vienen en todos los planes: sin ellos la farmacia no puede operar
 * ni cumplir con los controlados.
 */
export const MODULOS_PLAN = ['encargos', 'compras', 'reportes', 'whatsapp', 'mayor'] as const;
export type ModuloPlan = (typeof MODULOS_PLAN)[number];
export const NOMBRE_MODULO: Record<ModuloPlan, string> = {
  encargos: 'Encargos (lista de espera)',
  compras: 'Compras a droguerías (pedido sugerido, órdenes, cuentas por pagar)',
  reportes: 'Reportes (ganancia, rotación, cajeros, valor del inventario)',
  whatsapp: 'WhatsApp y recompra',
  mayor: 'Venta al mayor (clínicas y empresas a crédito)',
};
/** Ruta de la app de cada módulo de plan. */
export const RUTA_MODULO: Record<ModuloPlan, string> = { encargos: '/encargos', compras: '/compras', reportes: '/reportes', whatsapp: '/whatsapp', mayor: '/mayor' };

/** El plan que tiene la farmacia (lo envía el panel central). 0 = sin límite. */
export interface PlanFarmacia { nombre: string; modulos: ModuloPlan[]; maxCajas: number; maxUsuarios: number }

/** Los 3 planes con los que arranca el panel central (el super admin los puede cambiar). */
export const PLANES_INICIALES: (PlanFarmacia & { clave: string; precioUsd: number; orden: number })[] = [
  { clave: 'MOSTRADOR', nombre: 'Mostrador', precioUsd: 30, orden: 1, modulos: ['encargos'], maxCajas: 1, maxUsuarios: 4 },
  { clave: 'PROFESIONAL', nombre: 'Profesional', precioUsd: 50, orden: 2, modulos: ['encargos', 'compras', 'reportes', 'whatsapp'], maxCajas: 3, maxUsuarios: 10 },
  { clave: 'COMPLETO', nombre: 'Completo', precioUsd: 70, orden: 3, modulos: ['encargos', 'compras', 'reportes', 'whatsapp', 'mayor'], maxCajas: 0, maxUsuarios: 0 },
];

export const planSchema = z.object({
  nombre: texto(40),
  precioUsd: z.number().min(0).max(10_000),
  modulos: z.array(z.enum(MODULOS_PLAN)).max(MODULOS_PLAN.length),
  maxCajas: z.number().int().min(0).max(999),
  maxUsuarios: z.number().int().min(0).max(999),
});
export type PlanInput = z.infer<typeof planSchema>;
