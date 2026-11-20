import { Inject, Injectable, Logger, Module, type NestMiddleware, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { CONFIG, type Config } from '../config';
import { PrismaService, contextoDemo, urlDemo } from '../prisma/prisma.service';
import { sembrarDemo } from './datos';

/**
 * Demo con datos de ejemplo, dentro de la misma instalación pero en otro esquema de la base («demo»).
 * La farmacia real nunca se toca. Los datos de la demo se borran y se vuelven a cargar cada noche.
 */
@Injectable()
export class DemoService implements OnApplicationBootstrap {
  private readonly log = new Logger('Demo');
  private lista?: Promise<void>;

  constructor(private readonly prisma: PrismaService, @Inject(CONFIG) private readonly config: Config) {}

  onApplicationBootstrap() {
    if (this.config.DEMO && this.config.NODE_ENV !== 'test') void this.preparar().catch((e) => this.log.error(`No se pudo preparar la demo: ${e instanceof Error ? e.message : e}`));
  }

  /** Crea el esquema de la demo (la primera vez) y carga los datos si está vacía. */
  preparar() {
    this.lista ??= this.hacer().catch((e) => { this.lista = undefined; throw e; });
    return this.lista;
  }

  private async hacer() {
    await promisify(execFile)('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: join(__dirname, '../../..'),
      env: { ...process.env, DATABASE_URL: urlDemo(process.env.DATABASE_URL!) },
    });
    const c = this.prisma.demo();
    // La extensión «unaccent» vive en el esquema público: la demo la usa con este atajo.
    await c.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION demo.unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT public.unaccent($1) $$`);
    // Cada vez que arranca el servidor (por ejemplo, al actualizar) la demo queda como nueva.
    await this.cargar();
  }

  private async cargar() {
    const c = this.prisma.demo();
    const tablas = await c.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'demo' AND tablename <> '_prisma_migrations'`;
    if (tablas.length) await c.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `demo."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
    await sembrarDemo(c);
    this.log.log('Datos de la demo cargados');
  }

  /** A medianoche (hora de Venezuela) la demo vuelve a quedar como nueva. */
  @Cron('0 4 * * *')
  async reiniciar() {
    if (!this.config.DEMO) return;
    await this.preparar();
    await this.cargar();
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
    let demo = false;
    const ruta = req.originalUrl.split('?')[0]!;
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo === 'Bearer' && token) {
      try { demo = (this.jwt.verify<{ demo?: boolean }>(token, { algorithms: ['HS256'] })).demo === true; } catch { /* la guardia lo rechaza */ }
    } else if (/\/auth\/(renovar|salir)$/.test(ruta) && /(?:^|;\s*)farm_rt=d\./.test(req.headers.cookie ?? '')) {
      demo = true;
    }
    if (!demo) return next();
    if (!this.config.DEMO) return void res.status(403).json({ mensaje: 'La demo está apagada' });
    const bloqueo = req.method !== 'GET' && BLOQUEADO.find(([r]) => r.test(ruta));
    if (bloqueo) return void res.status(403).json({ mensaje: bloqueo[1] });
    contextoDemo.run({ demo: true }, () => next());
  }
}

@Module({ providers: [DemoService], exports: [DemoService] })
export class DemoModule {}
