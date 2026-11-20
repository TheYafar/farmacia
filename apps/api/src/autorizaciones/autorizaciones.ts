import { Body, ConflictException, Controller, Get, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  autorizacionSchema, responderAutorizacionSchema, solicitarAutorizacionSchema,
  type AutorizacionInput, type ResponderAutorizacionInput, type SolicitarAutorizacionInput,
} from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';

/** Minutos que dura un permiso aprobado antes de usarse en la venta. */
export const MINUTOS_AUTORIZACION = 30;
const vence = () => new Date(Date.now() + MINUTOS_AUTORIZACION * 60_000);

const detalle = {
  paciente: { select: { nombre: true, cedula: true, alergias: true, condiciones: true } },
  producto: { select: { id: true, nombreComercial: true, concentracion: true, forma: true, principioActivo: { select: { nombre: true, familia: true, riesgo: true, uso: true } } } },
  solicitadaPor: { select: { nombre: true } },
  regente: { select: { nombre: true } },
} as const;

/**
 * Permisos para vender productos delicados (alergia, antibiótico, psicotrópico):
 * el cajero los pide desde la venta y el Regente los aprueba o rechaza. El cajero nunca se los da a sí mismo.
 */
@Controller('autorizaciones')
export class AutorizacionesController {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  /** Cualquier usuario pide permiso. Si ya hay una solicitud abierta igual, devuelve esa. */
  @Post('solicitudes')
  async solicitar(@Body(new Validar(solicitarAutorizacionSchema)) b: SolicitarAutorizacionInput, @Usuario() u: UsuarioActual) {
    const abierta = await this.prisma.autorizacion.findFirst({
      where: { cedula: b.cedula, productoId: b.productoId, usadaEn: null, OR: [{ estado: 'PENDIENTE' }, { estado: 'APROBADA', expira: { gt: new Date() } }] },
      include: detalle,
    });
    if (abierta) return abierta;
    const a = await this.prisma.autorizacion.create({ data: { ...b, solicitadaPorId: u.id }, include: detalle });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'PERMISO_SOLICITADO', entidad: 'Autorizacion', entidadId: a.id, datos: { razon: b.razon } });
    return a;
  }

  /** El cajero consulta si ya le respondieron. */
  @Get(':id')
  ver(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.autorizacion.findUniqueOrThrow({ where: { id }, include: detalle });
  }

  @Get()
  @Roles('REGENTE', 'ADMIN')
  pendientes() {
    return this.prisma.autorizacion.findMany({ where: { estado: 'PENDIENTE' }, orderBy: { creadaEn: 'asc' }, include: detalle });
  }

  @Post(':id/aprobar')
  @Roles('REGENTE', 'ADMIN')
  async aprobar(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(responderAutorizacionSchema)) b: ResponderAutorizacionInput, @Usuario() u: UsuarioActual) {
    return this.responder(id, 'APROBADA', b, u);
  }

  @Post(':id/rechazar')
  @Roles('REGENTE', 'ADMIN')
  async rechazar(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(responderAutorizacionSchema)) b: ResponderAutorizacionInput, @Usuario() u: UsuarioActual) {
    return this.responder(id, 'RECHAZADA', b, u);
  }

  /** El Regente da el permiso directamente (por ejemplo, atendiendo él mismo en el mostrador). */
  @Post()
  @Roles('REGENTE', 'ADMIN')
  async crear(@Body(new Validar(autorizacionSchema)) b: AutorizacionInput, @Usuario() u: UsuarioActual) {
    const a = await this.prisma.autorizacion.create({
      data: { ...b, estado: 'APROBADA', regenteId: u.id, respondidaEn: new Date(), expira: vence() },
    });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'VENTA_AUTORIZADA', entidad: 'Autorizacion', entidadId: a.id, datos: { cedula: b.cedula, productoId: b.productoId, motivo: b.motivo } });
    return a;
  }

  private async responder(id: string, estado: 'APROBADA' | 'RECHAZADA', b: ResponderAutorizacionInput, u: UsuarioActual) {
    const r = await this.prisma.autorizacion.updateMany({
      where: { id, estado: 'PENDIENTE' },
      data: { estado, motivo: b.motivo, regenteId: u.id, respondidaEn: new Date(), expira: estado === 'APROBADA' ? vence() : null },
    });
    if (!r.count) throw new ConflictException('Esta solicitud ya fue respondida');
    await this.auditoria.registrar({ usuarioId: u.id, accion: estado === 'APROBADA' ? 'VENTA_AUTORIZADA' : 'PERMISO_RECHAZADO', entidad: 'Autorizacion', entidadId: id, datos: { motivo: b.motivo ?? null } });
    return this.prisma.autorizacion.findUniqueOrThrow({ where: { id }, include: detalle });
  }
}

@Module({ controllers: [AutorizacionesController] })
export class AutorizacionesModule {}
