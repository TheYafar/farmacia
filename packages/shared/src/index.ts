/**
 * Reglas y validaciones compartidas entre la app (apps/web) y el servidor (apps/api).
 * Lo que se valida aquí se valida igual en los dos lados: el servidor nunca confía en la app.
 */
import { z } from 'zod';

// ---------- Enumeraciones ----------

export const ROLES = ['CAJERO', 'REGENTE', 'ADMIN'] as const;
export type Rol = (typeof ROLES)[number];

export const NIVELES_PRECIO = ['GENERICO', 'NACIONAL', 'MARCA'] as const;
export type NivelPrecio = (typeof NIVELES_PRECIO)[number];

/** Riesgo del principio activo: define si la venta necesita récipe o autorización del Regente. */
export const CATEGORIAS_RIESGO = ['NORMAL', 'ANTIBIOTICO', 'PSICOTROPICO'] as const;
export type CategoriaRiesgo = (typeof CATEGORIAS_RIESGO)[number];

export const METODOS_PAGO = ['PAGO_MOVIL', 'PUNTO_DE_VENTA', 'EFECTIVO_USD', 'EFECTIVO_BS'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ESTADOS_ESPERA = ['EN_ESPERA', 'NOTIFICADO', 'PAGADO_CUSTODIA', 'ENTREGADO', 'EXPIRADO'] as const;
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
  usuario: z.string().trim().toLowerCase().min(3).max(40),
  clave: z.string().min(6).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const crearUsuarioSchema = z.object({
  nombre: texto(80),
  usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Solo letras, números, punto, guion y guion bajo'),
  clave: z.string().min(10, 'La clave debe tener al menos 10 caracteres').max(128),
  rol: z.enum(ROLES),
});
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

export const pacienteSchema = z.object({
  cedula: cedulaSchema,
  nombre: texto(120),
  telefono: z.string().trim().regex(/^0(4\d{2}|2\d{2})-?\d{7}$/, 'Teléfono inválido. Ejemplo: 0414-5550192'),
  alergias: z.array(texto(60)).max(30).default([]),
  condiciones: z.array(texto(60)).max(30).default([]),
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
  lineas: z
    .array(
      z.object({
        productoId: z.string().uuid(),
        numeroLote: texto(40),
        vence: z.coerce.date(),
        cantidad: z.number().int().positive().max(100_000),
        factorVenta: z.number().int().positive().max(1000).default(1),
      }),
    )
    .min(1)
    .max(500),
});
export type CompraInput = z.infer<typeof compraSchema>;

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

export const crearVentaSchema = z.object({
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
  metodoPago: z.enum(METODOS_PAGO),
  referenciaPago: z.string().trim().regex(/^\d{4,20}$/).optional(),
}).refine((v) => v.metodoPago !== 'PAGO_MOVIL' || !!v.referenciaPago, {
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
