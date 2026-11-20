import { Body, ConflictException, Controller, Get, HttpCode, Module, NotFoundException, Post, Query } from '@nestjs/common';
import { ajusteSchema, compraSchema, importacionSchema, type AjusteInput, type CompraInput, type ImportacionInput } from '@farmacia/shared';
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

  /** Merma, roto, vencido o conteo físico. Nunca deja el lote en negativo. */
  @Post('ajustes')
  @Roles('REGENTE', 'ADMIN')
  async ajuste(@Body(new Validar(ajusteSchema)) b: AjusteInput, @Usuario() u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const [l] = await tx.$queryRaw<{ stockLibre: number }[]>`SELECT "stockLibre" FROM "Lote" WHERE id = ${b.loteId}::uuid FOR UPDATE`;
      if (!l) throw new NotFoundException('Lote no encontrado');
      if (l.stockLibre + b.cantidad < 0) throw new ConflictException(`Solo hay ${l.stockLibre} libres en ese lote`);
      await tx.lote.update({ where: { id: b.loteId }, data: { stockLibre: { increment: b.cantidad } } });
      const a = await tx.ajusteInventario.create({ data: { ...b, usuarioId: u.id } });
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'AJUSTE_INVENTARIO', entidad: 'Lote', entidadId: b.loteId, datos: { cantidad: b.cantidad, motivo: b.motivo, nota: b.nota } }, tx);
      return a;
    });
  }

  @Get('ajustes')
  @Roles('REGENTE', 'ADMIN')
  async ajustes() {
    const lista = await this.prisma.ajusteInventario.findMany({ orderBy: { creadoEn: 'desc' }, take: 100 });
    const lotes = await this.prisma.lote.findMany({ where: { id: { in: lista.map((a) => a.loteId) } }, include: { producto: { select: { nombreComercial: true, concentracion: true } } } });
    const usuarios = await this.prisma.usuario.findMany({ where: { id: { in: lista.map((a) => a.usuarioId) } }, select: { id: true, nombre: true } });
    return lista.map((a) => {
      const l = lotes.find((x) => x.id === a.loteId);
      return { ...a, producto: l ? `${l.producto.nombreComercial} ${l.producto.concentracion}` : '—', lote: l?.numero, usuario: usuarios.find((x) => x.id === a.usuarioId)?.nombre };
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
        data: {
          proveedor: b.proveedor, numeroFactura: b.numeroFactura, creadaPorId: u.id, lineas: { create: b.lineas },
          totalUsd: b.lineas.reduce((a, l) => a + l.cantidad * l.costoUsd, 0).toFixed(2),
          venceEn: new Date(Date.now() + b.diasCredito * 86_400_000),
        },
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
