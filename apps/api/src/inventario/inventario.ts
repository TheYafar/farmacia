import { Body, Controller, Get, HttpCode, Module, Post, Query } from '@nestjs/common';
import { compraSchema, importacionSchema, type CompraInput, type ImportacionInput } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { EsperaModule, EsperaService } from '../espera/espera';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';
import type { ReservaLista } from '../notificaciones/notificador';
import { ImportacionService } from './importacion';

@Controller('inventario')
export class InventarioController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly espera: EsperaService,
    private readonly auditoria: AuditoriaService,
    private readonly importacion: ImportacionService,
  ) {}

  /** Carga del inventario desde Excel: con `confirmar: false` solo revisa, con `true` guarda (todo o nada). */
  @Post('importar')
  @Roles('ADMIN')
  @HttpCode(200)
  importar(@Body(new Validar(importacionSchema)) b: ImportacionInput, @Usuario() u: UsuarioActual) {
    return this.importacion.importar(b.filas, b.confirmar, u.id);
  }

  /** Lotes ordenados por vencimiento. `dias=30` muestra solo lo que vence en 30 días o menos. */
  @Get('lotes')
  @Roles('REGENTE', 'ADMIN')
  lotes(@Query('dias') dias?: string) {
    const n = Number(dias);
    return this.prisma.lote.findMany({
      where: { OR: [{ stockLibre: { gt: 0 } }, { stockReservado: { gt: 0 } }], vence: Number.isFinite(n) && n > 0 ? { lte: new Date(Date.now() + n * 86_400_000) } : undefined },
      orderBy: { vence: 'asc' },
      take: 500,
      include: { producto: { select: { nombreComercial: true, concentracion: true, laboratorio: true } } },
    });
  }

  /**
   * Carga la factura de la droguería: suma stock por lote (convirtiendo cajas máster en unidades de venta)
   * y, en la misma operación, separa cajas para los clientes en lista de espera.
   */
  @Post('compras')
  @Roles('ADMIN')
  async compra(@Body(new Validar(compraSchema)) b: CompraInput, @Usuario() u: UsuarioActual) {
    let avisos: ReservaLista[] = [];
    const compra = await this.prisma.$transaction(async (tx) => {
      const c = await tx.compra.create({
        data: { proveedor: b.proveedor, numeroFactura: b.numeroFactura, creadaPorId: u.id, lineas: { create: b.lineas } },
      });
      for (const l of b.lineas) {
        const unidades = l.cantidad * l.factorVenta;
        await tx.lote.upsert({
          where: { productoId_numero: { productoId: l.productoId, numero: l.numeroLote } },
          create: { productoId: l.productoId, numero: l.numeroLote, vence: l.vence, stockLibre: unidades },
          update: { stockLibre: { increment: unidades } },
        });
      }
      for (const productoId of new Set(b.lineas.map((l) => l.productoId))) {
        avisos = avisos.concat(await this.espera.asignar(tx, productoId));
      }
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'COMPRA_CARGADA', entidad: 'Compra', entidadId: c.id, datos: { lineas: b.lineas.length, reservas: avisos.length } }, tx);
      return c;
    });
    await this.espera.enviar(avisos);
    return { ...compra, clientesAvisados: avisos.length };
  }
}

@Module({ imports: [EsperaModule], providers: [ImportacionService], controllers: [InventarioController] })
export class InventarioModule {}
