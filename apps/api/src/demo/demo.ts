import { Inject, Injectable, Logger, Module, type NestMiddleware, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { CONFIG, type Config } from '../config';
import { PrismaService, contextoDemo, esquemaDemo, urlDemo } from '../prisma/prisma.service';
import { sembrarDemo } from './datos';

/** Última vez que se usó cada cupo de la demo (lo anota el middleware en cada petición). */
const ultimoUso = new Map<number, number>();
/** Un cupo sin uso por este tiempo se limpia y queda listo para otra persona. */
const LIBRE_TRAS_MS = 30 * 60_000;

type EstadoCupo = 'cargando' | 'lista' | 'usada';

/**
 * Demo con datos de ejemplo, dentro de la misma instalación pero en otros esquemas de la base («demo», «demo2»…).
 * Cada visitante recibe su propio cupo con datos nuevos: no ve las ventas de otros ni puede dañarle la demo a nadie.
 * Los cupos se cargan de antemano; uno que nadie usa en 30 minutos se vuelve a cargar. Todo vuelve a cero cada noche.
 * La farmacia real nunca se toca.
 */
@Injectable()
export class DemoService implements OnApplicationBootstrap {
  private readonly log = new Logger('Demo');
  private lista?: Promise<void>;
  private readonly cupos = new Map<number, EstadoCupo>();
  private readonly cargas = new Map<number, Promise<void>>();

  constructor(private readonly prisma: PrismaService, @Inject(CONFIG) private readonly config: Config) {}

  onApplicationBootstrap() {
    if (this.config.DEMO && this.config.NODE_ENV !== 'test') void this.preparar().catch((e) => this.log.error(`No se pudo preparar la demo: ${e instanceof Error ? e.message : e}`));
  }

  /** Deja listo el primer cupo; los demás se cargan después, sin hacer esperar a nadie. */
  preparar() {
    this.lista ??= this.cargar(1).then(() => {
      void (async () => {
        for (let n = 2; n <= this.config.DEMO_CUPOS; n++) await this.cargar(n).catch((e) => this.log.error(`Cupo ${n} de la demo: ${e instanceof Error ? e.message : e}`));
      })();
    }).catch((e) => { this.lista = undefined; throw e; });
    return this.lista;
  }

  /** Le da a quien entra un cupo con datos nuevos. */
  async asignar(): Promise<number> {
    await this.preparar();
    let libre = [...this.cupos].find(([, e]) => e === 'lista')?.[0];
    // Si hay cupos cargándose (al arrancar el servidor), se espera unos segundos a que uno quede listo.
    while (!libre && this.cargas.size) {
      await Promise.race([...this.cargas.values()].map((p) => p.catch(() => undefined)));
      libre = [...this.cupos].find(([, e]) => e === 'lista')?.[0];
    }
    if (libre) return this.tomar(libre);
    const ahora = Date.now();
    // Todos ocupados: el que lleva más tiempo sin uso. Si ya está libre, se limpia antes de darlo.
    const usados = [...this.cupos].filter(([, e]) => e === 'usada').map(([n]) => n).sort((a, b) => (ultimoUso.get(a) ?? 0) - (ultimoUso.get(b) ?? 0));
    const n = usados[0] ?? 1;
    if (ahora - (ultimoUso.get(n) ?? 0) > LIBRE_TRAS_MS) await this.cargar(n);
    return this.tomar(n);
  }

  private tomar(n: number) {
    this.cupos.set(n, 'usada');
    ultimoUso.set(n, Date.now());
    return n;
  }

  /** Crea el esquema del cupo (la primera vez) y lo deja con los datos de ejemplo como nuevos. */
  private cargar(n: number) {
    const ya = this.cargas.get(n);
    if (ya) return ya;
    const p = this.hacerCarga(n).finally(() => this.cargas.delete(n));
    this.cargas.set(n, p);
    return p;
  }

  private async hacerCarga(n: number) {
    this.cupos.set(n, 'cargando');
    try {
      await promisify(execFile)('npx', ['prisma', 'migrate', 'deploy'], {
        cwd: join(__dirname, '../../..'),
        env: { ...process.env, DATABASE_URL: urlDemo(process.env.DATABASE_URL!, n) },
      });
      const c = this.prisma.demo(n);
      const esquema = esquemaDemo(n);
      // La extensión «unaccent» vive en el esquema público: la demo la usa con este atajo.
      await c.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "${esquema}".unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT public.unaccent($1) $$`);
      const tablas = await c.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = ${esquema} AND tablename <> '_prisma_migrations'`;
      if (tablas.length) await c.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${esquema}"."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
      await sembrarDemo(c);
      ultimoUso.delete(n);
      this.cupos.set(n, 'lista');
      this.log.log(`Datos de la demo cargados (cupo ${n})`);
    } catch (e) {
      this.cupos.delete(n);
      throw e;
    }
  }

  /** Cada 10 minutos: los cupos que nadie usa hace rato quedan como nuevos para la siguiente persona. */
  @Cron('*/10 * * * *')
  async liberar() {
    if (!this.config.DEMO || !this.lista) return;
    for (const [n, e] of this.cupos) {
      if (e === 'usada' && Date.now() - (ultimoUso.get(n) ?? 0) > LIBRE_TRAS_MS) await this.cargar(n).catch((err) => this.log.error(`Cupo ${n}: ${err instanceof Error ? err.message : err}`));
    }
  }

  /** A medianoche (hora de Venezuela) toda la demo vuelve a quedar como nueva (las fechas de ejemplo se mueven al día). */
  @Cron('0 4 * * *')
  async reiniciar() {
    if (!this.config.DEMO) return;
    await this.preparar();
    for (const n of [...this.cupos.keys()]) await this.cargar(n).catch((e) => this.log.error(`Cupo ${n}: ${e instanceof Error ? e.message : e}`));
  }
}

/** Lo que no se puede hacer en la demo (cuentas, fotos, enlaces con soporte). */
const BLOQUEADO: [RegExp, string][] = [
  [/^\/api\/v1\/usuarios/, 'En la demo no se pueden crear ni cambiar usuarios'],
  [/^\/api\/v1\/auth\/2fa/, 'En la demo no se activa la clave de dos pasos'],
  [/^\/api\/v1\/soporte/, 'En la demo no hay soporte en línea'],
  [/^\/api\/v1\/recipes\/?$/, 'En la demo no se suben fotos de récipes'],
];

/**
 * Decide si la petición es de la demo: el token de acceso lo dice (demo: true), o la cookie de sesión empieza por «d.».
 * Todo lo que pasa después (guardias, servicios) usa el esquema demo sin enterarse.
 */
@Injectable()
export class MiddlewareDemo implements NestMiddleware {
  constructor(private readonly jwt: JwtService, @Inject(CONFIG) private readonly config: Config) {}

  use(req: Request, res: Response, next: NextFunction) {
    // El token dice el cupo de la demo (demo: 2); los tokens viejos traen «demo: true» = cupo 1.
    let cupo = 0;
    const ruta = req.originalUrl.split('?')[0]!;
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo === 'Bearer' && token) {
      try {
        const d = this.jwt.verify<{ demo?: boolean | number }>(token, { algorithms: ['HS256'] }).demo;
        cupo = d === true ? 1 : typeof d === 'number' ? d : 0;
      } catch { /* la guardia lo rechaza */ }
    } else if (/\/auth\/(renovar|salir)$/.test(ruta)) {
      const m = /(?:^|;\s*)farm_rt=d(\d*)\./.exec(req.headers.cookie ?? '');
      if (m) cupo = Number(m[1] || 1);
    }
    if (!cupo) return next();
    if (cupo > this.config.DEMO_CUPOS) return void res.status(401).json({ mensaje: 'La demo se reinició. Vuelve a entrar' });
    if (!this.config.DEMO) return void res.status(403).json({ mensaje: 'La demo está apagada' });
    const bloqueo = req.method !== 'GET' && BLOQUEADO.find(([r]) => r.test(ruta));
    if (bloqueo) return void res.status(403).json({ mensaje: bloqueo[1] });
    ultimoUso.set(cupo, Date.now());
    contextoDemo.run({ demo: true, cupo }, () => next());
  }
}

@Module({ providers: [DemoService], exports: [DemoService] })
export class DemoModule {}
