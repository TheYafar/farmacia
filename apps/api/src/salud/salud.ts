import { Controller, Get, Inject, Module, ServiceUnavailableException } from '@nestjs/common';
import { CONFIG, type Config } from '../config';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Publico } from '../common/seguridad';
import { enDemo } from '../prisma/prisma.service';
import { DEMO_FARMACIA } from '../demo/datos';

/** Para el monitoreo y para Docker: responde si el servidor y la base de datos están vivos. */
@Controller()
export class SaludController {
  constructor(private readonly prisma: PrismaService, @Inject(CONFIG) private readonly config: Config) {}

  /** Datos públicos de la farmacia (nombre, RIF, dirección): para el ticket y la pantalla de inicio. */
  @Publico()
  @Get('farmacia')
  async farmacia() {
    const c = this.config;
    if (enDemo()) return { ...DEMO_FARMACIA, soporte: null, demo: true };
    const conf = await this.prisma.configuracion.findUnique({ where: { id: 1 }, select: { centralTelefono: true } }).catch(() => null);
    // El WhatsApp de soporte sale del panel central (si la farmacia está enlazada) o del propio panel central.
    const soporte = conf?.centralTelefono || c.SOPORTE_TELEFONO || null;
    return { nombre: c.FARMACIA_NOMBRE, rif: c.FARMACIA_RIF, direccion: c.FARMACIA_DIRECCION, telefono: c.FARMACIA_TELEFONO, soporte, hayDemo: c.DEMO };
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
