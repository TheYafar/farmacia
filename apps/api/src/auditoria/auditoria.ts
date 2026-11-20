import { Controller, Get, Global, Injectable, Module, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/seguridad';

type Cliente = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra una acción sensible. Acepta una transacción para que quede guardada junto con el cambio. */
  registrar(
    datos: { usuarioId?: string; accion: string; entidad: string; entidadId?: string; datos?: Prisma.InputJsonValue; ip?: string },
    cliente: Cliente = this.prisma,
  ) {
    return cliente.auditoria.create({ data: datos });
  }
}

@Controller('auditoria')
@Roles('ADMIN')
export class AuditoriaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  listar(@Query('entidad') entidad?: string, @Query('antesDe') antesDe?: string) {
    return this.prisma.auditoria.findMany({
      where: { entidad: entidad || undefined, creadaEn: antesDe ? { lt: new Date(antesDe) } : undefined },
      orderBy: { creadaEn: 'desc' },
      take: 100,
      include: { usuario: { select: { nombre: true, rol: true } } },
    });
  }
}

@Global()
@Module({ providers: [AuditoriaService], controllers: [AuditoriaController], exports: [AuditoriaService] })
export class AuditoriaModule {}
