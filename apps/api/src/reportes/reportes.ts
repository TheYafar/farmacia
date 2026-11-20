import { Controller, Get, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/seguridad';

/** Resumen del día para el dueño (pantalla «Resumen»). */
@Controller('reportes')
@Roles('ADMIN')
export class ReportesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('resumen')
  async resumen() {
    const inicioHoy = new Date(new Date().toISOString().slice(0, 10));
    const hace7 = new Date(inicioHoy.getTime() - 6 * 86_400_000);
    const hace30 = new Date(inicioHoy.getTime() - 30 * 86_400_000);
    const en30 = new Date(inicioHoy.getTime() + 30 * 86_400_000);

    const [hoy, semana, vencen, esperando, custodia, demanda] = await Promise.all([
      this.prisma.venta.aggregate({ where: { estado: 'COMPLETADA', creadaEn: { gte: inicioHoy } }, _sum: { totalUsd: true, totalBs: true }, _count: true }),
      this.prisma.$queryRaw<{ dia: Date; usd: Prisma.Decimal }[]>`
        SELECT date_trunc('day', "creadaEn") AS dia, sum("totalUsd") AS usd FROM "Venta"
        WHERE estado = 'COMPLETADA' AND "creadaEn" >= ${hace7} GROUP BY 1 ORDER BY 1`,
      this.prisma.lote.count({ where: { vence: { lte: en30 }, OR: [{ stockLibre: { gt: 0 } }, { stockReservado: { gt: 0 } }] } }),
      this.prisma.solicitudEspera.count({ where: { estado: 'EN_ESPERA' } }),
      this.prisma.solicitudEspera.count({ where: { estado: 'PAGADO_CUSTODIA' } }),
      this.prisma.solicitudEspera.groupBy({
        by: ['productoId'], where: { solicitadaEn: { gte: hace30 } }, _count: { _all: true },
        orderBy: { _count: { productoId: 'desc' } }, take: 10,
      }),
    ]);
    const productos = await this.prisma.producto.findMany({ where: { id: { in: demanda.map((d) => d.productoId) } }, select: { id: true, nombreComercial: true, concentracion: true } });

    return {
      hoy: { ventas: hoy._count, usd: (hoy._sum.totalUsd ?? new Prisma.Decimal(0)).toFixed(2), bs: (hoy._sum.totalBs ?? new Prisma.Decimal(0)).toFixed(2) },
      semana: semana.map((d) => ({ dia: d.dia, usd: new Prisma.Decimal(d.usd).toFixed(2) })),
      lotesVencen30Dias: vencen,
      clientesEsperando: esperando,
      enGaveta: custodia,
      demandaInsatisfecha: demanda.map((d) => ({ producto: productos.find((p) => p.id === d.productoId), veces: d._count._all })),
    };
  }
}

@Module({ controllers: [ReportesController] })
export class ReportesModule {}
