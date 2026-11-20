import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { autorizacionSchema, type AutorizacionInput } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';

/** Minutos que dura una autorización antes de usarse en la venta. */
export const MINUTOS_AUTORIZACION = 30;

/**
 * El Regente aprueba vender un producto delicado (alergia, antibiótico, psicotrópico) a un paciente.
 * El cajero no puede crearlas: la venta solo cita el número de autorización.
 */
@Controller('autorizaciones')
@Roles('REGENTE', 'ADMIN')
export class AutorizacionesController {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  @Post()
  async crear(@Body(new Validar(autorizacionSchema)) b: AutorizacionInput, @Usuario() yo: UsuarioActual) {
    const a = await this.prisma.autorizacion.create({
      data: { ...b, regenteId: yo.id, expira: new Date(Date.now() + MINUTOS_AUTORIZACION * 60_000) },
    });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'VENTA_AUTORIZADA', entidad: 'Autorizacion', entidadId: a.id, datos: { cedula: b.cedula, productoId: b.productoId, motivo: b.motivo } });
    return a;
  }

  @Get('vigentes')
  vigentes() {
    return this.prisma.autorizacion.findMany({
      where: { usadaEn: null, expira: { gt: new Date() } },
      include: { producto: { select: { nombreComercial: true, concentracion: true } }, regente: { select: { nombre: true } } },
      orderBy: { creadaEn: 'desc' },
    });
  }
}

@Module({ controllers: [AutorizacionesController] })
export class AutorizacionesModule {}
