import { Body, Controller, Get, Injectable, Module, Post, ServiceUnavailableException } from '@nestjs/common';
import { tasaSchema, type TasaInput } from '@farmacia/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';

@Injectable()
export class TasaService {
  constructor(private readonly prisma: PrismaService) {}

  async actual(cliente: Prisma.TransactionClient | PrismaService = this.prisma) {
    const t = await cliente.tasaCambio.findFirst({ orderBy: { creadaEn: 'desc' } });
    if (!t) throw new ServiceUnavailableException('Falta cargar la tasa del dólar de hoy');
    return t;
  }
}

@Controller('tasa')
export class TasaController {
  constructor(private readonly tasa: TasaService, private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  @Get()
  async actual() {
    const t = await this.tasa.actual();
    return { valor: t.valor.toFixed(4), fuente: t.fuente, creadaEn: t.creadaEn };
  }

  /** Cada cambio queda guardado: las ventas viejas conservan la tasa con la que se cobraron. */
  @Post()
  @Roles('ADMIN')
  async fijar(@Body(new Validar(tasaSchema)) b: TasaInput, @Usuario() yo: UsuarioActual) {
    const t = await this.prisma.tasaCambio.create({ data: { valor: b.valor, fuente: b.fuente, creadaPorId: yo.id } });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'TASA_CAMBIADA', entidad: 'TasaCambio', entidadId: t.id, datos: { valor: b.valor } });
    return { valor: t.valor.toFixed(4), fuente: t.fuente, creadaEn: t.creadaEn };
  }
}

@Module({ providers: [TasaService], controllers: [TasaController], exports: [TasaService] })
export class TasaModule {}
