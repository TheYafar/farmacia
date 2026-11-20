import { z } from 'zod';

/**
 * Toda la configuración sale de variables de entorno y se valida al arrancar.
 * Si falta algo o es inseguro, el servidor no arranca (mejor que arrancar mal).
 */
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  /** Secreto para firmar los tokens. Mínimo 32 caracteres aleatorios: `openssl rand -base64 48` */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_MINUTOS: z.coerce.number().int().positive().default(15),
  SESION_DIAS: z.coerce.number().int().positive().default(7),
  /** Orígenes permitidos (la app web), separados por coma. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** En producción la cookie solo viaja por HTTPS. */
  COOKIE_SECURE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  /** Carpeta privada donde se guardan las fotos de récipes (fuera de cualquier carpeta pública). */
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_INTENTOS_LOGIN: z.coerce.number().int().positive().default(5),
  BLOQUEO_MINUTOS: z.coerce.number().int().positive().default(15),
  /** 'log' escribe los mensajes en el registro; 'whatsapp' usa la API de WhatsApp Business (fase 3). */
  NOTIFICADOR: z.enum(['log', 'whatsapp']).default('log'),
});

export type Config = z.infer<typeof esquema> & { corsOrigins: string[] };

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = esquema.safeParse(env);
  if (!r.success) {
    const errores = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${errores}`);
  }
  if (r.data.NODE_ENV === 'production' && !r.data.COOKIE_SECURE) {
    throw new Error('En producción COOKIE_SECURE debe ser true');
  }
  return { ...r.data, corsOrigins: r.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) };
}

export const CONFIG = Symbol('CONFIG');
