import { Controller, Get, Inject, Module, ServiceUnavailableException } from '@nestjs/common';
import { CONFIG, type Config } from '../config';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Publico } from '../common/seguridad';

/** Para el monitoreo y para Docker: responde si el servidor y la base de datos están vivos. */
@Controller()
export class SaludController {
  constructor(private readonly prisma: PrismaService, @Inject(CONFIG) private readonly config: Config) {}

  /** Datos públicos de la farmacia (nombre, RIF, dirección): para el ticket y la pantalla de inicio. */
  @Publico()
  @Get('farmacia')
  farmacia() {
    const c = this.config;
    return { nombre: c.FARMACIA_NOMBRE, rif: c.FARMACIA_RIF, direccion: c.FARMACIA_DIRECCION, telefono: c.FARMACIA_TELEFONO };
  }

  @Publico()
  @SkipThrottle()
  @Get('salud')
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
