import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Publico } from '../common/seguridad';

/** Para el monitoreo y para Docker: responde si el servidor y la base de datos están vivos. */
@Controller('salud')
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Publico()
  @SkipThrottle()
  @Get()
  async salud() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible');
    }
  }
}

@Module({ controllers: [SaludController] })
export class SaludModule {}
