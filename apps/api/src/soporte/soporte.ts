import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Inject, Injectable, Logger, Module, Param, ParseUUIDPipe, Post, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import { z } from 'zod';
import {
  accesoSoporteSchema, enlaceCentralSchema, esUrlWeb, mensajeSoporteSchema, ticketNuevoSchema,
  type MensajeSoporteInput, type TicketNuevoInput, inicioDiaVe } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { CONFIG, type Config } from '../config';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';
import { cifrar, descifrar } from '../common/totp';
import { ERRORES_RECIENTES } from '../common/errores';
import { olvidarPlan, planActual } from '../common/plan';
import { Prisma } from '@prisma/client';

/**
 * Soporte en línea, del lado de la farmacia: se enlaza con el panel central,
 * le reporta su estado cada 5 minutos, abre casos de ayuda y, si el dueño quiere,
 * deja entrar a soporte por unas horas.
 */
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const PREFIJO = 'FT1.';

/** El código de enlace es la dirección del panel central y la clave de la farmacia, juntas. */
export function leerCodigo(codigo: string): { url: string; clave: string } {
  try {
    if (!codigo.startsWith(PREFIJO)) throw new Error();
    const d = JSON.parse(Buffer.from(codigo.slice(PREFIJO.length), 'base64url').toString('utf8')) as { u?: string; c?: string };
    const url = new URL(d.u ?? '');
    const local = ['localhost', '127.0.0.1'].includes(url.hostname) && process.env.NODE_ENV !== 'production';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error();
    if (!d.c || d.c.length < 20) throw new Error();
    return { url: url.origin, clave: d.c };
  } catch {
    throw new BadRequestException('El código de enlace no es válido. Cópialo completo del panel central');
  }
}

const autorDe = (u: UsuarioActual) => (u.soporte ? 'Soporte técnico (dentro de la farmacia)' : u.nombre);

@Injectable()
export class SoporteService {
  private readonly log = new Logger('Soporte');

  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService, @Inject(CONFIG) private readonly config: Config) {}

  private async enlace() {
    const c = await this.prisma.configuracion.findUnique({ where: { id: 1 } });
    if (!c?.centralUrl || !c.centralClave) return null;
    return { url: c.centralUrl, clave: descifrar(c.centralClave, this.config.JWT_SECRET), c };
  }

  /** Llama al panel central (servidor a servidor). */
  async llamar<T>(ruta: string, body?: unknown, enlace?: { url: string; clave: string }): Promise<T> {
    const e = enlace ?? (await this.enlace());
    if (!e) throw new BadRequestException('Esta farmacia no está enlazada con soporte. El dueño lo hace en Soporte');
    let r: Response;
    try {
      r = await fetch(`${e.url}/api/v1/central/enlace/${ruta}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', 'x-enlace': e.clave },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('No hay conexión con soporte. Revisa el internet o escribe por WhatsApp');
    }
    const datos = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok) {
      const msj = (datos as { mensaje?: string } | null)?.mensaje ?? 'Soporte no respondió';
      throw r.status === 401 ? new BadRequestException(msj) : new ServiceUnavailableException(msj);
    }
    return datos as T;
  }

  /** El plan que mandó el panel central. Si no manda ninguno (respuesta vieja), se deja el que había. */
  private planDe(r: { plan?: unknown }) {
    if (r.plan === undefined) return undefined;
    return r.plan === null ? Prisma.JsonNull : (r.plan as Prisma.InputJsonValue);
  }

  /** Foto del estado de la farmacia: lo que soporte necesita ver cuando algo falla. */
  async diagnostico() {
    const ahora = Date.now();
    const hoy = inicioDiaVe();
    const [ventas, ultimaVenta, turnos, tasa, conf, usuarios, productos, sinStock, porVencer, recipes, permisos, migracion, tamano, disco] = await Promise.all([
      this.prisma.venta.aggregate({ where: { creadaEn: { gte: hoy }, estado: 'COMPLETADA' }, _count: true, _sum: { totalUsd: true } }),
      this.prisma.venta.findFirst({ orderBy: { creadaEn: 'desc' }, select: { creadaEn: true } }),
      this.prisma.turno.count({ where: { estado: 'ABIERTO' } }),
      this.prisma.tasaCambio.findFirst({ where: { creadaEn: { lte: new Date() } }, orderBy: { creadaEn: 'desc' }, select: { valor: true, creadaEn: true, fuente: true } }),
      this.prisma.configuracion.findUnique({ where: { id: 1 }, select: { tasaModo: true, bcvConsultado: true, bcvFecha: true, farmaciaNombre: true, farmaciaRif: true } }),
      this.prisma.usuario.count({ where: { activo: true, sistema: false } }),
      this.prisma.producto.count({ where: { activo: true } }),
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "Producto" p WHERE p.activo AND p."stockMinimo" > 0 AND COALESCE((SELECT SUM(l."stockLibre") FROM "Lote" l WHERE l."productoId" = p.id AND l.vence > NOW()), 0) < p."stockMinimo"`,
      this.prisma.lote.count({ where: { stockLibre: { gt: 0 }, vence: { gt: new Date(), lt: new Date(ahora + 30 * 86_400_000) } } }),
      this.prisma.recipe.count({ where: { estado: 'PENDIENTE' } }),
      this.prisma.autorizacion.count({ where: { estado: 'PENDIENTE' } }),
      this.prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1`.catch(() => []),
      this.prisma.$queryRaw<{ mb: number }[]>`SELECT (pg_database_size(current_database()) / 1048576)::int AS mb`.catch(() => []),
      statfs(this.config.UPLOAD_DIR).catch(() => statfs('.')).catch(() => null),
    ]);
    return {
      version: migracion[0]?.migration_name ?? 'desconocida',
      estado: {
        nombre: conf?.farmaciaNombre || this.config.FARMACIA_NOMBRE,
        rif: conf?.farmaciaRif || this.config.FARMACIA_RIF || null,
        horaServidor: new Date().toISOString(),
        encendidoHoras: Math.round(process.uptime() / 360) / 10,
        ventasHoy: ventas._count,
        ventasHoyUsd: Number(ventas._sum.totalUsd ?? 0).toFixed(2),
        ultimaVenta: ultimaVenta?.creadaEn ?? null,
        cajasAbiertas: turnos,
        tasa: tasa ? { valor: Number(tasa.valor), fecha: tasa.creadaEn, fuente: tasa.fuente, modo: conf?.tasaModo ?? 'MANUAL' } : null,
        bcvConsultado: conf?.bcvConsultado ?? null,
        usuariosActivos: usuarios,
        productos,
        bajoMinimo: Number(sinStock[0]?.n ?? 0),
        lotesPorVencer30: porVencer,
        recipesPendientes: recipes,
        permisosPendientes: permisos,
        baseDatosMb: tamano[0]?.mb ?? null,
        discoLibreGb: disco ? Math.round((disco.bavail * disco.bsize) / 1e8) / 10 : null,
        memoriaMb: Math.round(process.memoryUsage().rss / 1_048_576),
        errores: ERRORES_RECIENTES.slice(0, 10),
      },
    };
  }

  /** Cada 5 minutos la farmacia le dice al panel central que está viva y cómo está. */
  @Cron('*/5 * * * *')
  async reportar() {
    const e = await this.enlace();
    if (!e) return;
    try {
      const r = await this.llamar<{ telefono: string | null; plan?: unknown }>('reporte', await this.diagnostico(), e);
      await this.prisma.configuracion.update({ where: { id: 1 }, data: { centralUltimo: new Date(), centralError: null, centralTelefono: r.telefono, plan: this.planDe(r) } });
      olvidarPlan();
    } catch (err) {
      const msj = err instanceof Error ? err.message : String(err);
      this.log.warn(`No se pudo reportar al panel central: ${msj}`);
      await this.prisma.configuracion.update({ where: { id: 1 }, data: { centralError: msj.slice(0, 200) } });
    }
  }

  async estado() {
    const [c, acceso] = await Promise.all([
      this.prisma.configuracion.findUnique({ where: { id: 1 }, select: { centralUrl: true, centralUltimo: true, centralError: true, centralTelefono: true } }),
      this.prisma.accesoSoporte.findFirst({ where: { revocadoEn: null, vence: { gt: new Date() } }, orderBy: { vence: 'desc' }, select: { vence: true, usos: true } }),
    ]);
    return {
      enlazada: !!c?.centralUrl,
      central: c?.centralUrl ?? null,
      ultimoReporte: c?.centralUltimo ?? null,
      error: c?.centralError ?? null,
      // Aunque no esté enlazada, si la instalación tiene un WhatsApp de soporte se muestra.
      telefono: c?.centralTelefono || this.config.SOPORTE_TELEFONO || null,
      acceso,
    };
  }

  async enlazar(codigo: string, u: UsuarioActual) {
    const e = leerCodigo(codigo);
    // Primero se prueba: si el código no sirve, no se guarda nada.
    const r = await this.llamar<{ nombre: string; telefono: string | null; plan?: unknown }>('reporte', await this.diagnostico(), e);
    await this.prisma.configuracion.upsert({
      where: { id: 1 },
      update: { centralUrl: e.url, centralClave: cifrar(e.clave, this.config.JWT_SECRET), centralUltimo: new Date(), centralError: null, centralTelefono: r.telefono, plan: this.planDe(r) },
      create: { id: 1, centralUrl: e.url, centralClave: cifrar(e.clave, this.config.JWT_SECRET), centralUltimo: new Date(), centralTelefono: r.telefono, plan: this.planDe(r) },
    });
    olvidarPlan();
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'SOPORTE_ENLAZADO', entidad: 'Configuracion', datos: { central: e.url } });
    return this.estado();
  }

  async desenlazar(u: UsuarioActual) {
    await this.quitarAcceso(u).catch(() => {});
    await this.prisma.configuracion.update({ where: { id: 1 }, data: { centralUrl: null, centralClave: null, centralUltimo: null, centralError: null } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'SOPORTE_DESENLAZADO', entidad: 'Configuracion' });
  }

  /** El dueño deja entrar a soporte por unas horas. Se avisa al panel central con el enlace de entrada. */
  async darAcceso(horas: number, url: string | undefined, u: UsuarioActual) {
    const token = randomBytes(32).toString('base64url');
    const vence = new Date(Date.now() + horas * 3_600_000);
    await this.llamar('acceso', { token, vence: vence.toISOString(), url });
    await this.prisma.$transaction([
      this.prisma.accesoSoporte.updateMany({ where: { revocadoEn: null }, data: { revocadoEn: new Date() } }),
      this.prisma.accesoSoporte.create({ data: { tokenHash: sha256(token), vence, creadoPor: u.id } }),
    ]);
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'SOPORTE_ACCESO_DADO', entidad: 'AccesoSoporte', datos: { horas } });
    return this.estado();
  }

  /** Quita el acceso y saca a soporte al instante, aunque no haya internet para avisar al panel. */
  async quitarAcceso(u: UsuarioActual) {
    const sistema = await this.prisma.usuario.findUnique({ where: { usuario: 'soporte.remoto' }, select: { id: true } });
    await this.prisma.$transaction([
      this.prisma.accesoSoporte.updateMany({ where: { revocadoEn: null }, data: { revocadoEn: new Date() } }),
      ...(sistema ? [this.prisma.sesion.updateMany({ where: { usuarioId: sistema.id, revocadaEn: null }, data: { revocadaEn: new Date() } })] : []),
    ]);
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'SOPORTE_ACCESO_QUITADO', entidad: 'AccesoSoporte' });
    await this.llamar('acceso', { token: null, vence: null }).catch(() => {});
    return this.estado();
  }
}

const accesoBody = accesoSoporteSchema.extend({ url: z.string().max(200).refine(esUrlWeb, 'Dirección inválida').optional() });

@Controller('soporte')
export class SoporteController {
  constructor(private readonly soporte: SoporteService) {}

  @Get()
  estado() {
    return this.soporte.estado();
  }

  /** Lo mismo que se le envía a soporte: para que el dueño vea qué se comparte. */
  @Roles('ADMIN')
  @Get('diagnostico')
  diagnostico() {
    return this.soporte.diagnostico();
  }

  @Roles('ADMIN')
  @Post('enlazar')
  @HttpCode(200)
  enlazar(@Body(new Validar(enlaceCentralSchema)) b: { codigo: string }, @Usuario() u: UsuarioActual) {
    if (u.soporte) throw new ForbiddenException('Solo el dueño puede enlazar la farmacia');
    return this.soporte.enlazar(b.codigo, u);
  }

  @Roles('ADMIN')
  @Post('desenlazar')
  @HttpCode(204)
  async desenlazar(@Usuario() u: UsuarioActual) {
    if (u.soporte) throw new ForbiddenException('Solo el dueño puede quitar el enlace');
    await this.soporte.desenlazar(u);
  }

  @Get('tickets')
  tickets() {
    return this.soporte.llamar('tickets');
  }

  /** Pedir ayuda: se adjunta solo el estado de la farmacia para que soporte vea qué pasa. */
  @Post('tickets')
  async nuevo(@Body(new Validar(ticketNuevoSchema)) b: TicketNuevoInput, @Usuario() u: UsuarioActual) {
    const d = await this.soporte.diagnostico();
    return this.soporte.llamar('tickets', { ...b, autor: autorDe(u), diagnostico: { ...d.estado, version: d.version } });
  }

  @Post('tickets/:id/mensajes')
  @HttpCode(204)
  async mensaje(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(mensajeSoporteSchema)) b: MensajeSoporteInput, @Usuario() u: UsuarioActual) {
    await this.soporte.llamar(`tickets/${id}/mensajes`, { ...b, autor: autorDe(u) });
  }

  @Roles('ADMIN')
  @Post('acceso')
  @HttpCode(200)
  acceso(@Body(new Validar(accesoBody)) b: z.infer<typeof accesoBody>, @Usuario() u: UsuarioActual) {
    if (u.soporte) throw new ForbiddenException('Soporte no puede darse acceso a sí mismo');
    return this.soporte.darAcceso(b.horas, b.url, u);
  }

  @Roles('ADMIN')
  @Post('acceso/quitar')
  @HttpCode(200)
  quitar(@Usuario() u: UsuarioActual) {
    return this.soporte.quitarAcceso(u);
  }
}

/** El plan de esta farmacia y cuánto usa de él (lo ve cualquier usuario: el menú se arma con esto). */
@Controller('plan')
export class PlanController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async ver() {
    const [plan, cajas, usuarios] = await Promise.all([
      planActual(this.prisma),
      this.prisma.caja.count({ where: { activa: true } }),
      this.prisma.usuario.count({ where: { activo: true, sistema: false, rol: { in: ['CAJERO', 'REGENTE', 'ADMIN'] } } }),
    ]);
    return { plan, uso: { cajas, usuarios } };
  }
}

@Module({ providers: [SoporteService], controllers: [SoporteController, PlanController] })
export class SoporteModule {}
