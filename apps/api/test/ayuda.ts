/**
 * Utilidades de prueba: levantan la API completa contra una base de datos PostgreSQL de pruebas.
 * Variable: DATABASE_URL_TEST (por defecto, la base local farmacia_test).
 */
import 'reflect-metadata';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { cargarConfig } from '../src/config';
import { crearApp } from '../src/main';
import { cifrarClave } from '../src/auth/auth';
import { olvidarPlan } from '../src/common/plan';

export const DB = process.env.DATABASE_URL_TEST ?? 'postgresql://farmacia:farmacia@localhost:5433/farmacia_test?host=/tmp';
process.env.DATABASE_URL = DB;
// En producción son 5 intentos por minuto; las pruebas inician sesión muchas veces seguidas.
process.env.LIMITE_LOGIN_POR_MINUTO ??= '1000';

export const CLAVE = 'clave-de-prueba-123';
export const ORIGEN = 'http://app.test';

let migrada = false;
export async function levantar() {
  if (!migrada) {
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
    migrada = true;
  }
  const config = cargarConfig({
    NODE_ENV: 'test', DATABASE_URL: DB, JWT_SECRET: 'x'.repeat(48), COOKIE_SECURE: 'false',
    CORS_ORIGINS: ORIGEN, DEMO_CUPOS: '2', UPLOAD_DIR: mkdtempSync(join(tmpdir(), 'recipes-')),
  });
  const app = await crearApp(config);
  await app.init();
  return app;
}

export const prisma = new PrismaClient({ datasources: { db: { url: DB } } });

/** Deja la base vacía y carga un escenario conocido. */
export async function escenario() {
  olvidarPlan();
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);

  const hash = await cifrarClave(CLAVE);
  const [admin, regente, cajero] = await Promise.all([
    prisma.usuario.create({ data: { nombre: 'Dueño', usuario: 'admin', rol: 'ADMIN', claveHash: hash } }),
    prisma.usuario.create({ data: { nombre: 'Carlos', usuario: 'regente', rol: 'REGENTE', claveHash: hash } }),
    prisma.usuario.create({ data: { nombre: 'Ana', usuario: 'cajero', rol: 'CAJERO', claveHash: hash } }),
  ]);
  await prisma.tasaCambio.create({ data: { valor: 236.4, creadaPorId: admin.id } });
  // Cada usuario empieza con su caja abierta (sin fondo) para poder vender.
  await prisma.turno.createMany({ data: [admin, regente, cajero].map((u) => ({ cajeroId: u.id })) });

  const acetaminofen = await prisma.principioActivo.create({ data: { nombre: 'Acetaminofén' } });
  const amoxicilina = await prisma.principioActivo.create({ data: { nombre: 'Amoxicilina', familia: 'penicilinas', riesgo: 'ANTIBIOTICO' } });

  const generico = await prisma.producto.create({ data: { nombreComercial: 'Acetaminofén', laboratorio: 'Lab. Orinoco', principioActivoId: acetaminofen.id, concentracion: '500 mg', forma: 'Tabletas', unidadesPorCaja: 10, precioUsd: 0.85, nivel: 'GENERICO', codigoBarras: '7591000000011' } });
  const marca = await prisma.producto.create({ data: { nombreComercial: 'Tylenol', laboratorio: 'Importado', principioActivoId: acetaminofen.id, concentracion: '500 mg', forma: 'Tabletas', unidadesPorCaja: 24, precioUsd: 4.9, nivel: 'MARCA' } });
  const amoxil = await prisma.producto.create({ data: { nombreComercial: 'Amoxicilina', laboratorio: 'Genéricos Ávila', principioActivoId: amoxicilina.id, concentracion: '500 mg', forma: 'Cápsulas', unidadesPorCaja: 21, precioUsd: 2.2, nivel: 'GENERICO', requiereRecipe: true } });

  const dias = (n: number) => new Date(Date.now() + n * 86_400_000);
  await prisma.lote.createMany({ data: [
    { productoId: generico.id, numero: 'VENCIDO', vence: dias(-3), stockLibre: 50 },
    { productoId: generico.id, numero: 'PRONTO', vence: dias(20), stockLibre: 2 },
    { productoId: generico.id, numero: 'TARDE', vence: dias(300), stockLibre: 10 },
    { productoId: amoxil.id, numero: 'A1', vence: dias(200), stockLibre: 5 },
  ] });

  const paciente = await prisma.paciente.create({ data: { cedula: 'V-14582307', nombre: 'María Fernanda Rojas', telefono: '0414-5550192', alergias: ['Penicilinas'], condiciones: ['Hipertensa'] } });
  return { admin, regente, cajero, generico, marca, amoxil, amoxicilina, paciente };
}

export async function entrar(app: INestApplication, usuario: string) {
  const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ usuario, clave: CLAVE });
  if (r.status !== 200) throw new Error(`login ${usuario}: ${r.status} ${JSON.stringify(r.body)}`);
  return { token: r.body.accessToken as string, cookie: r.headers['set-cookie'] as unknown as string[] };
}

/** Cliente HTTP con el token de un usuario. */
export function como(app: INestApplication, token: string) {
  const s = () => request(app.getHttpServer());
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (u: string) => s().get(`/api/v1${u}`).set(auth),
    post: (u: string, b?: object) => s().post(`/api/v1${u}`).set(auth).send(b),
    patch: (u: string, b?: object) => s().patch(`/api/v1${u}`).set(auth).send(b),
    subir: (u: string) => s().post(`/api/v1${u}`).set(auth),
  };
}
