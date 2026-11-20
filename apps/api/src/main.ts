import 'reflect-metadata';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { cargarConfig, crearModulo } from './app.module';
import type { Config } from './config';

/** Arma la aplicación con todas las protecciones. Se usa igual en producción y en las pruebas. */
export async function crearApp(config: Config): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(crearModulo(config), {
    logger: config.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });
  // Detrás de Caddy: confiar en un solo proxy para leer la IP real del cliente.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '200kb' });
  app.enableCors({ origin: config.corsOrigins, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  return app;
}

async function arrancar() {
  const config = cargarConfig();
  const app = await crearApp(config);
  await app.listen(config.PORT, '0.0.0.0');
  new Logger('API').log(`Escuchando en el puerto ${config.PORT}`);
}

if (require.main === module) {
  arrancar().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
