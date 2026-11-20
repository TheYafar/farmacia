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
  // Detrás de Caddy (y quizá del servidor web del VPS): leer la IP real del cliente sin confiar en lo que él mismo diga.
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  // Las respuestas tienen datos de clientes y ventas: que el navegador no las guarde en su memoria.
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  // 2 MB: alcanza para importar 5.000 filas de inventario; el resto de las rutas envía mucho menos.
  app.useBodyParser('json', { limit: '2mb' });
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
