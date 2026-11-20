import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  PLANES_INICIALES, planSchema, type PlanInput,
  farmaciaRegistradaSchema, mensajeSoporteSchema, miembroEquipoSchema, ticketNuevoSchema,
  type FarmaciaRegistradaInput, type MensajeSoporteInput, type MiembroEquipoInput, type TicketNuevoInput,
} from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { CONFIG, type Config } from '../config';
import { Publico, Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';
import { cifrar, descifrar } from '../common/totp';
import { cifrarClave } from '../auth/auth';

/**
 * Panel central: quien vende el sistema ve todas las farmacias, su estado y les da soporte.
 * Cada farmacia se enlaza con un código y se reporta sola cada 5 minutos.
 */
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
/** Si no se reporta en 15 minutos, se muestra «Sin conexión». */
const EN_LINEA_MS = 15 * 60_000;

const reporteSchema = z.object({
  version: z.string().max(120).optional(),
  estado: z.record(z.unknown()).optional(),
});
const ticketFarmaciaSchema = ticketNuevoSchema.extend({ autor: z.string().trim().min(1).max(80), diagnostico: z.record(z.unknown()).optional() });
const mensajeFarmaciaSchema = mensajeSoporteSchema.extend({ autor: z.string().trim().min(1).max(80) });
const accesoFarmaciaSchema = z.object({
  token: z.string().min(20).max(100).nullable(),
  vence: z.string().datetime().nullable(),
  url: z.string().url().max(200).optional(),
});

@Injectable()
export class CentralService {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService, @Inject(CONFIG) private readonly config: Config) {}

  /** La farmacia se identifica con su clave de enlace. */
  async porClave(clave: string | undefined) {
    if (!clave || clave.length < 20) throw new UnauthorizedException('Falta la clave de enlace');
    const f = await this.prisma.farmaciaRegistrada.findUnique({ where: { claveHash: sha256(clave) }, include: { plan: true } });
    if (!f) throw new UnauthorizedException('Código de enlace inválido');
    if (!f.activa) throw new UnauthorizedException('Esta farmacia está desactivada en el panel central');
    return f;
  }

  nuevaClave() {
    const clave = randomBytes(24).toString('base64url');
    return { clave, claveHash: sha256(clave) };
  }

  estadoConexion(f: { ultimoReporte: Date | null }) {
    if (!f.ultimoReporte) return 'NUNCA';
    return Date.now() - f.ultimoReporte.getTime() < EN_LINEA_MS ? 'EN_LINEA' : 'SIN_CONEXION';
  }

  accesoVigente(f: { accesoToken: string | null; accesoVence: Date | null }) {
    return !!f.accesoToken && !!f.accesoVence && f.accesoVence > new Date();
  }

  resumen<T extends { ultimoReporte: Date | null; accesoToken: string | null; accesoVence: Date | null; claveHash: string }>(f: T) {
    const { accesoToken: _t, claveHash: _c, ...resto } = f;
    return { ...resto, conexion: this.estadoConexion(f), acceso: this.accesoVigente(f) ? f.accesoVence : null };
  }

  async ticketsDe(farmaciaId: string) {
    return this.prisma.ticketSoporte.findMany({
      where: { farmaciaId },
      orderBy: { actualizado: 'desc' },
      take: 30,
      include: { mensajes: { orderBy: { creadoEn: 'asc' } } },
    });
  }

  async agregarMensaje(ticketId: string, de: 'FARMACIA' | 'SOPORTE', autor: string, b: MensajeSoporteInput) {
    const estado = b.cerrar ? 'CERRADO' : de === 'SOPORTE' ? 'RESPONDIDO' : 'ABIERTO';
    await this.prisma.$transaction([
      this.prisma.mensajeSoporte.create({ data: { ticketId, de, autor, texto: b.texto } }),
      this.prisma.ticketSoporte.update({ where: { id: ticketId }, data: { estado, actualizado: new Date() } }),
    ]);
  }

  /** Los planes; la primera vez se crean los 3 iniciales. */
  async planes() {
    if (!(await this.prisma.plan.count())) {
      await this.prisma.plan.createMany({ data: PLANES_INICIALES.map((p) => ({ ...p, modulos: [...p.modulos] })), skipDuplicates: true });
    }
    const lista = await this.prisma.plan.findMany({ orderBy: { orden: 'asc' }, include: { _count: { select: { farmacias: { where: { activa: true } } } } } });
    return lista.map(({ _count, ...p }) => ({ ...p, precioUsd: p.precioUsd.toFixed(2), farmacias: _count.farmacias }));
  }

  /** Lo que se le manda a la farmacia: qué módulos y límites tiene. */
  planParaFarmacia(plan: { nombre: string; modulos: string[]; maxCajas: number; maxUsuarios: number } | null) {
    return plan ? { nombre: plan.nombre, modulos: plan.modulos, maxCajas: plan.maxCajas, maxUsuarios: plan.maxUsuarios } : null;
  }

  telefono() {
    return this.config.SOPORTE_TELEFONO || null;
  }

  cifrarToken(t: string) {
    return cifrar(t, this.config.JWT_SECRET);
  }

  descifrarToken(t: string) {
    return descifrar(t, this.config.JWT_SECRET);
  }

  registrar(u: UsuarioActual, accion: string, entidadId?: string, datos?: Prisma.InputJsonValue) {
    return this.auditoria.registrar({ usuarioId: u.id, accion, entidad: 'Central', entidadId, datos });
  }
}

/** Lo que usa el equipo central (super admin y soporte). */
@Controller('central')
@Roles('SUPERADMIN', 'SOPORTE')
export class CentralController {
  constructor(private readonly prisma: PrismaService, private readonly central: CentralService) {}

  /** Todas las farmacias con su estado: en línea, ventas de hoy, errores y casos abiertos. */
  @Get('farmacias')
  async farmacias() {
    const [lista, abiertos] = await Promise.all([
      this.prisma.farmaciaRegistrada.findMany({ orderBy: { nombre: 'asc' }, include: { plan: { select: { id: true, nombre: true, precioUsd: true } } } }),
      this.prisma.ticketSoporte.groupBy({ by: ['farmaciaId'], where: { estado: 'ABIERTO' }, _count: true }),
    ]);
    const porFarmacia = new Map(abiertos.map((a) => [a.farmaciaId, a._count]));
    return lista.map((f) => ({ ...this.central.resumen(f), ticketsAbiertos: porFarmacia.get(f.id) ?? 0 }));
  }

  @Get('farmacias/:id')
  async farmacia(@Param('id', ParseUUIDPipe) id: string) {
    const f = await this.prisma.farmaciaRegistrada.findUnique({ where: { id }, include: { plan: { select: { id: true, nombre: true, precioUsd: true } } } });
    if (!f) throw new NotFoundException('La farmacia no existe');
    return { ...this.central.resumen(f), tickets: await this.central.ticketsDe(id) };
  }

  /** Registra una farmacia y devuelve la clave para armar su código de enlace (se muestra una sola vez). */
  @Roles('SUPERADMIN')
  @Post('farmacias')
  async crear(@Body(new Validar(farmaciaRegistradaSchema)) b: FarmaciaRegistradaInput, @Usuario() u: UsuarioActual) {
    const { clave, claveHash } = this.central.nuevaClave();
    const f = await this.prisma.farmaciaRegistrada.create({ data: { ...b, claveHash } });
    await this.central.registrar(u, 'FARMACIA_REGISTRADA', f.id, { nombre: f.nombre });
    return { farmacia: this.central.resumen(f), clave };
  }

  @Roles('SUPERADMIN')
  @Patch('farmacias/:id')
  async editar(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(farmaciaRegistradaSchema.partial())) b: Partial<FarmaciaRegistradaInput>, @Usuario() u: UsuarioActual) {
    const f = await this.prisma.farmaciaRegistrada.update({ where: { id }, data: b });
    await this.central.registrar(u, 'FARMACIA_EDITADA', id, b as Prisma.InputJsonValue);
    return this.central.resumen(f);
  }

  /** Código nuevo: el anterior deja de funcionar (por si se filtró). */
  @Roles('SUPERADMIN')
  @Post('farmacias/:id/codigo')
  @HttpCode(200)
  async nuevoCodigo(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    const { clave, claveHash } = this.central.nuevaClave();
    await this.prisma.farmaciaRegistrada.update({ where: { id }, data: { claveHash } });
    await this.central.registrar(u, 'FARMACIA_CODIGO_NUEVO', id);
    return { clave };
  }

  /** Entrar a la farmacia como soporte: solo si el dueño dio permiso y no ha vencido. */
  @Post('farmacias/:id/entrar')
  @HttpCode(200)
  async entrar(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    const f = await this.prisma.farmaciaRegistrada.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('La farmacia no existe');
    if (!this.central.accesoVigente(f)) throw new BadRequestException('El dueño no ha dado acceso o ya venció. Pídele que lo dé desde Soporte');
    if (!f.url) throw new BadRequestException('Falta la dirección web de la farmacia');
    await this.central.registrar(u, 'SOPORTE_ENTRA_A_FARMACIA', id);
    return { url: `${f.url.replace(/\/+$/, '')}/?soporte=${encodeURIComponent(this.central.descifrarToken(f.accesoToken!))}` };
  }

  /** Los planes que se venden, con cuántas farmacias tiene cada uno. */
  @Get('planes')
  planes() {
    return this.central.planes();
  }

  /** Cambiar qué trae un plan. Las farmacias lo reciben en su próximo reporte (máximo 5 minutos). */
  @Roles('SUPERADMIN')
  @Patch('planes/:id')
  async editarPlan(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(planSchema)) b: PlanInput, @Usuario() u: UsuarioActual) {
    const p = await this.prisma.plan.update({ where: { id }, data: { ...b, modulos: [...new Set(b.modulos)] } });
    await this.central.registrar(u, 'PLAN_EDITADO', id, b as unknown as Prisma.InputJsonValue);
    return { ...p, precioUsd: p.precioUsd.toFixed(2) };
  }

  /** Casos de soporte de todas las farmacias. */
  @Get('tickets')
  tickets(@Query('estado') estado?: string) {
    const e = ['ABIERTO', 'RESPONDIDO', 'CERRADO'].includes(estado ?? '') ? (estado as 'ABIERTO') : undefined;
    return this.prisma.ticketSoporte.findMany({
      where: e ? { estado: e } : { estado: { not: 'CERRADO' } },
      orderBy: { actualizado: 'desc' },
      take: 100,
      include: { farmacia: { select: { id: true, nombre: true } }, mensajes: { orderBy: { creadoEn: 'desc' }, take: 1 } },
    });
  }

  @Get('tickets/:id')
  async ticket(@Param('id', ParseUUIDPipe) id: string) {
    const t = await this.prisma.ticketSoporte.findUnique({ where: { id }, include: { farmacia: true, mensajes: { orderBy: { creadoEn: 'asc' } } } });
    if (!t) throw new NotFoundException('El caso no existe');
    return { ...t, farmacia: this.central.resumen(t.farmacia) };
  }

  @Post('tickets/:id/mensajes')
  @HttpCode(204)
  async responder(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(mensajeSoporteSchema)) b: MensajeSoporteInput, @Usuario() u: UsuarioActual) {
    await this.central.agregarMensaje(id, 'SOPORTE', u.nombre, b);
  }

  /** El equipo central (super admin y soporte). */
  @Roles('SUPERADMIN')
  @Get('equipo')
  equipo() {
    return this.prisma.usuario.findMany({
      where: { rol: { in: ['SUPERADMIN', 'SOPORTE'] } },
      select: { id: true, nombre: true, usuario: true, rol: true, activo: true, creadoEn: true },
      orderBy: { nombre: 'asc' },
    });
  }

  @Roles('SUPERADMIN')
  @Post('equipo')
  async agregarMiembro(@Body(new Validar(miembroEquipoSchema)) b: MiembroEquipoInput, @Usuario() u: UsuarioActual) {
    const m = await this.prisma.usuario.create({
      data: { nombre: b.nombre, usuario: b.usuario, rol: b.rol, claveHash: await cifrarClave(b.clave) },
      select: { id: true, nombre: true, usuario: true, rol: true, activo: true, creadoEn: true },
    });
    await this.central.registrar(u, 'EQUIPO_AGREGADO', m.id, { rol: m.rol });
    return m;
  }

  @Roles('SUPERADMIN')
  @Post('equipo/:id/activo')
  @HttpCode(204)
  async activoMiembro(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(z.object({ activo: z.boolean() }))) b: { activo: boolean }, @Usuario() u: UsuarioActual) {
    if (id === u.id) throw new BadRequestException('No puedes desactivarte a ti mismo');
    const m = await this.prisma.usuario.findUnique({ where: { id } });
    if (!m || !['SUPERADMIN', 'SOPORTE'].includes(m.rol)) throw new NotFoundException('No es del equipo central');
    await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id }, data: { activo: b.activo } }),
      ...(b.activo ? [] : [this.prisma.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date() } })]),
    ]);
    await this.central.registrar(u, b.activo ? 'EQUIPO_ACTIVADO' : 'EQUIPO_DESACTIVADO', id);
  }
}

/** Lo que llama cada farmacia (servidor a servidor), identificada con su clave de enlace. */
@Controller('central/enlace')
@Publico()
export class EnlaceController {
  constructor(private readonly prisma: PrismaService, private readonly central: CentralService) {}

  /** Reporte de estado cada 5 minutos. Responde con el teléfono de soporte. */
  @Post('reporte')
  @HttpCode(200)
  async reporte(@Headers('x-enlace') clave: string | undefined, @Body(new Validar(reporteSchema)) b: z.infer<typeof reporteSchema>) {
    const f = await this.central.porClave(clave);
    await this.prisma.farmaciaRegistrada.update({
      where: { id: f.id },
      data: { ultimoReporte: new Date(), version: b.version, estado: (b.estado ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    return { nombre: f.nombre, telefono: this.central.telefono(), plan: this.central.planParaFarmacia(f.plan) };
  }

  @Get('tickets')
  async tickets(@Headers('x-enlace') clave: string | undefined) {
    const f = await this.central.porClave(clave);
    return this.central.ticketsDe(f.id);
  }

  @Post('tickets')
  async nuevoTicket(@Headers('x-enlace') clave: string | undefined, @Body(new Validar(ticketFarmaciaSchema)) b: z.infer<typeof ticketFarmaciaSchema>) {
    const f = await this.central.porClave(clave);
    return this.prisma.ticketSoporte.create({
      data: {
        farmaciaId: f.id, asunto: b.asunto, diagnostico: b.diagnostico as Prisma.InputJsonValue | undefined,
        mensajes: { create: { de: 'FARMACIA', autor: b.autor, texto: b.texto } },
      },
      include: { mensajes: true },
    });
  }

  @Post('tickets/:id/mensajes')
  @HttpCode(204)
  async mensaje(@Headers('x-enlace') clave: string | undefined, @Param('id', ParseUUIDPipe) id: string, @Body(new Validar(mensajeFarmaciaSchema)) b: z.infer<typeof mensajeFarmaciaSchema>) {
    const f = await this.central.porClave(clave);
    const t = await this.prisma.ticketSoporte.findFirst({ where: { id, farmaciaId: f.id } });
    if (!t) throw new NotFoundException('El caso no existe');
    await this.central.agregarMensaje(id, 'FARMACIA', b.autor, b);
  }

  /** El dueño dio (o quitó) acceso remoto a soporte. */
  @Post('acceso')
  @HttpCode(204)
  async acceso(@Headers('x-enlace') clave: string | undefined, @Body(new Validar(accesoFarmaciaSchema)) b: z.infer<typeof accesoFarmaciaSchema>) {
    const f = await this.central.porClave(clave);
    await this.prisma.farmaciaRegistrada.update({
      where: { id: f.id },
      data: {
        accesoToken: b.token ? this.central.cifrarToken(b.token) : null,
        accesoVence: b.token && b.vence ? new Date(b.vence) : null,
        ...(b.url ? { url: b.url } : {}),
      },
    });
  }
}

@Module({ providers: [CentralService], controllers: [CentralController, EnlaceController] })
export class CentralModule {}
