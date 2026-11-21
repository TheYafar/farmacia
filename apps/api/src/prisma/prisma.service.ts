import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Demo: las peticiones de la demo usan otro esquema de la base de datos («demo»), con datos de ejemplo.
 * La farmacia real nunca se toca. Qué esquema usar se decide por petición (ver common/demo.ts).
 */
export const contextoDemo = new AsyncLocalStorage<{ demo: boolean; cupo?: number }>();
export const enDemo = () => contextoDemo.getStore()?.demo === true;
/** Cada visitante de la demo tiene su propia copia («cupo»): no ve ni cambia lo de los demás. */
export const cupoDemo = () => contextoDemo.getStore()?.cupo ?? 1;
export const esquemaDemo = (cupo: number) => (cupo <= 1 ? 'demo' : `demo${cupo}`);

/** La misma base, pero en el esquema de un cupo de la demo. */
export function urlDemo(url: string, cupo = 1) {
  const u = new URL(url);
  u.searchParams.set('schema', esquemaDemo(cupo));
  u.searchParams.set('connection_limit', '3');
  return u.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly clientesDemo = new Map<number, PrismaClient>();

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

  /** Cliente del esquema de un cupo de la demo (se crea la primera vez que se usa). */
  demo(cupo = cupoDemo()) {
    let c = this.clientesDemo.get(cupo);
    if (!c) this.clientesDemo.set(cupo, (c = new PrismaClient({ datasources: { db: { url: urlDemo(process.env.DATABASE_URL!, cupo) } } })));
    return c;
  }

  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
    await Promise.all([...this.clientesDemo.values()].map((c) => c.$disconnect()));
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
