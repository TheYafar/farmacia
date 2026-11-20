import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Request } from 'express';
import { cajaSchema, editarCajaSchema, vincularCajaSchema, type CajaInput } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Publico, Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';

/**
 * Cajas: cada equipo (computadora, tablet) puede ser una caja. Se crea en el mismo equipo
 * y se pasa a otro con un código de 6 letras. El dueño ve todas sus cajas y sus equipos.
 * El equipo se identifica con un token que guarda el navegador y envía en la cabecera x-caja.
 */
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
/** Sin letras que se confunden (0/O, 1/I/L). */
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODIGO_MIN = 30;

@Injectable()
export class CajasService {
  constructor(private readonly prisma: PrismaService) {}

  /** El equipo de esta petición, si es una caja activa. */
  async equipo(token: string | undefined) {
    if (!token || token.length < 20 || token.length > 100) return null;
    const e = await this.prisma.cajaEquipo.findUnique({ where: { tokenHash: sha256(token) }, include: { caja: true } });
    if (!e || e.quitadoEn || !e.caja.activa) return null;
    return e;
  }

  async nuevoEquipo(cajaId: string, agente?: string) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.cajaEquipo.create({ data: { cajaId, tokenHash: sha256(token), agente: agente?.slice(0, 200) } });
    return token;
  }
}

const hoyVe = () => new Date(Math.floor((Date.now() - 4 * 3_600_000) / 86_400_000) * 86_400_000 + 4 * 3_600_000);

@Controller('cajas')
export class CajasController {
  constructor(private readonly prisma: PrismaService, private readonly cajas: CajasService, private readonly auditoria: AuditoriaService) {}

  /** Qué caja es este equipo (se muestra también en la pantalla de entrada). */
  @Publico()
  @Get('este-equipo')
  async esteEquipo(@Headers('x-caja') token?: string) {
    const e = await this.cajas.equipo(token);
    if (!e) return { caja: null };
    await this.prisma.cajaEquipo.update({ where: { id: e.id }, data: { ultimoUso: new Date() } });
    return { caja: { id: e.caja.id, nombre: e.caja.nombre } };
  }

  /** Convertir este equipo en una caja que ya existe, con el código que se generó en otro equipo. */
  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('vincular')
  @HttpCode(200)
  async vincular(@Body(new Validar(vincularCajaSchema)) b: { codigo: string }, @Req() req: Request) {
    const caja = await this.prisma.caja.findUnique({ where: { codigoHash: sha256(b.codigo) } });
    if (!caja || !caja.activa || !caja.codigoVence || caja.codigoVence < new Date()) throw new BadRequestException('Código incorrecto o vencido. Genera uno nuevo en el otro equipo');
    // Un solo uso: el código se borra al usarlo.
    await this.prisma.caja.update({ where: { id: caja.id }, data: { codigoHash: null, codigoVence: null } });
    const token = await this.cajas.nuevoEquipo(caja.id, req.headers['user-agent']);
    await this.auditoria.registrar({ accion: 'CAJA_VINCULADA', entidad: 'Caja', entidadId: caja.id, ip: req.ip });
    return { caja: { id: caja.id, nombre: caja.nombre }, token };
  }

  /** Crear una caja. Normalmente en el mismo equipo donde se va a cobrar. */
  @Roles('CAJERO', 'REGENTE', 'ADMIN')
  @Post()
  async crear(@Body(new Validar(cajaSchema)) b: CajaInput, @Usuario() u: UsuarioActual, @Req() req: Request) {
    const caja = await this.prisma.caja.create({ data: { nombre: b.nombre, creadaPorId: u.id } });
    const token = b.enEsteEquipo ? await this.cajas.nuevoEquipo(caja.id, req.headers['user-agent']) : undefined;
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'CAJA_CREADA', entidad: 'Caja', entidadId: caja.id, datos: { nombre: caja.nombre } });
    return { caja: { id: caja.id, nombre: caja.nombre }, token };
  }

  /** Código para pasar la caja a otro equipo. Lo pide el dueño o alguien desde un equipo de esa caja. */
  @Roles('CAJERO', 'REGENTE', 'ADMIN')
  @Post(':id/codigo')
  @HttpCode(200)
  async codigo(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual, @Headers('x-caja') token?: string) {
    const caja = await this.prisma.caja.findUnique({ where: { id } });
    if (!caja || !caja.activa) throw new NotFoundException('La caja no existe o está desactivada');
    if (u.rol !== 'ADMIN' && (await this.cajas.equipo(token))?.cajaId !== id) throw new ForbiddenException('Solo el dueño o un equipo de esta caja pueden pasarla a otro equipo');
    const codigo = Array.from({ length: 6 }, () => LETRAS[randomInt(LETRAS.length)]).join('');
    const vence = new Date(Date.now() + CODIGO_MIN * 60_000);
    await this.prisma.caja.update({ where: { id }, data: { codigoHash: sha256(codigo), codigoVence: vence } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'CAJA_CODIGO', entidad: 'Caja', entidadId: id });
    return { codigo: `${codigo.slice(0, 3)}-${codigo.slice(3)}`, vence };
  }

  /** Este equipo deja de ser caja. */
  @Roles('CAJERO', 'REGENTE', 'ADMIN')
  @Post('salir')
  @HttpCode(204)
  async salir(@Headers('x-caja') token: string | undefined, @Usuario() u: UsuarioActual) {
    const e = await this.cajas.equipo(token);
    if (!e) return;
    await this.prisma.cajaEquipo.update({ where: { id: e.id }, data: { quitadoEn: new Date() } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'CAJA_EQUIPO_QUITADO', entidad: 'Caja', entidadId: e.cajaId });
  }

  /** Todas las cajas: equipos, quién la tiene abierta y lo vendido hoy. */
  @Roles('ADMIN')
  @Get()
  async listar() {
    const hoy = hoyVe();
    const cajas = await this.prisma.caja.findMany({
      orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
      include: {
        equipos: { where: { quitadoEn: null }, orderBy: { ultimoUso: 'desc' }, select: { id: true, agente: true, creadoEn: true, ultimoUso: true } },
        turnos: { where: { estado: 'ABIERTO' }, select: { id: true, abiertoEn: true, cajero: { select: { nombre: true } } } },
      },
    });
    const ventas = await this.prisma.venta.groupBy({
      by: ['turnoId'], where: { estado: 'COMPLETADA', creadaEn: { gte: hoy }, turno: { cajaId: { not: null } } }, _sum: { totalUsd: true }, _count: true,
    });
    const turnos = await this.prisma.turno.findMany({ where: { id: { in: ventas.map((v) => v.turnoId!).filter(Boolean) } }, select: { id: true, cajaId: true } });
    const cajaDe = new Map(turnos.map((t) => [t.id, t.cajaId]));
    const porCaja = new Map<string, { n: number; usd: number }>();
    for (const v of ventas) {
      const c = cajaDe.get(v.turnoId!);
      if (!c) continue;
      const a = porCaja.get(c) ?? { n: 0, usd: 0 };
      porCaja.set(c, { n: a.n + v._count, usd: a.usd + Number(v._sum.totalUsd ?? 0) });
    }
    return cajas.map(({ codigoHash: _h, ...c }) => ({
      ...c,
      codigoActivo: !!c.codigoVence && c.codigoVence > new Date(),
      abierta: c.turnos[0] ? { cajero: c.turnos[0].cajero.nombre, desde: c.turnos[0].abiertoEn } : null,
      turnos: undefined,
      ventasHoy: porCaja.get(c.id)?.n ?? 0,
      ventasHoyUsd: (porCaja.get(c.id)?.usd ?? 0).toFixed(2),
    }));
  }

  @Roles('ADMIN')
  @Patch(':id')
  async editar(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(editarCajaSchema)) b: { nombre?: string; activa?: boolean }, @Usuario() u: UsuarioActual) {
    const c = await this.prisma.caja.update({ where: { id }, data: { ...b, ...(b.activa === false ? { codigoHash: null, codigoVence: null } : {}) } });
    if (b.activa === false) await this.prisma.cajaEquipo.updateMany({ where: { cajaId: id, quitadoEn: null }, data: { quitadoEn: new Date() } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'CAJA_EDITADA', entidad: 'Caja', entidadId: id, datos: b });
    return { id: c.id, nombre: c.nombre, activa: c.activa };
  }

  @Roles('ADMIN')
  @Post('equipos/:id/quitar')
  @HttpCode(204)
  async quitarEquipo(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    const e = await this.prisma.cajaEquipo.update({ where: { id }, data: { quitadoEn: new Date() } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'CAJA_EQUIPO_QUITADO', entidad: 'Caja', entidadId: e.cajaId });
  }
}

@Module({ providers: [CajasService], controllers: [CajasController], exports: [CajasService] })
export class CajasModule {}
