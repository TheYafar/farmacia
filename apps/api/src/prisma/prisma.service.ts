import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Demo: las peticiones de la demo usan otro esquema de la base de datos («demo»), con datos de ejemplo.
 * La farmacia real nunca se toca. Qué esquema usar se decide por petición (ver common/demo.ts).
 */
export const contextoDemo = new AsyncLocalStorage<{ demo: boolean }>();
export const enDemo = () => contextoDemo.getStore()?.demo === true;

/** La misma base, pero en el esquema «demo». */
export function urlDemo(url: string) {
  const u = new URL(url);
  u.searchParams.set('schema', 'demo');
  return u.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private clienteDemo?: PrismaClient;

  constructor() {
    super();
    // Todos los servicios usan this.prisma sin cambios: si la petición es de la demo, se redirige al esquema demo.
    return new Proxy(this, {
      get(objetivo, prop, receptor) {
        if (prop === 'demo' || prop === 'onModuleInit' || prop === 'onModuleDestroy') return Reflect.get(objetivo, prop, receptor);
        const c: PrismaClient = enDemo() ? objetivo.demo() : objetivo;
        const v = Reflect.get(c, prop, c);
        return typeof v === 'function' ? v.bind(c) : v;
      },
    });
  }

  /** Cliente del esquema demo (se crea la primera vez que se usa). */
  demo() {
    this.clienteDemo ??= new PrismaClient({ datasources: { db: { url: urlDemo(process.env.DATABASE_URL!) } } });
    return this.clienteDemo;
  }

  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
    await this.clienteDemo?.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
