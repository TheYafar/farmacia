import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ajusteSchema, compraSchema, existenciaSchema, type ExistenciaInput, devolucionProveedorSchema, importacionSchema, recibirOrdenSchema, type AjusteInput, type CompraInput, type DevolucionProveedorInput, type ImportacionInput, type RecibirOrdenInput } from '@farmacia/shared';
import { Prisma } from '@prisma/client';
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
  lotes(@Query('dias') dias?: string, @Query('productoId') productoId?: string) {
    const n = Number(dias);
    return this.prisma.lote.findMany({
      where: {
        OR: [{ stockLibre: { gt: 0 } }, { stockReservado: { gt: 0 } }], vence: Number.isFinite(n) && n > 0 ? { lte: new Date(Date.now() + n * 86_400_000) } : undefined,
        productoId: productoId && /^[0-9a-f-]{36}$/i.test(productoId) ? productoId : undefined,
      },
      orderBy: { vence: 'asc' },
      take: 500,
      include: { producto: { select: { nombreComercial: true, concentracion: true, laboratorio: true } } },
    });
  }

  /** Merma, roto, vencido o conteo físico. Nunca deja el lote en negativo. */
  @Post('ajustes')
  @Roles('REGENTE', 'ADMIN')
  async ajuste(@Body(new Validar(ajusteSchema)) b: AjusteInput, @Usuario() u: UsuarioActual) {
    let avisos: ReservaLista[] = [];
    const r = await this.prisma.$transaction(async (tx) => {
      const [l] = await tx.$queryRaw<{ stockLibre: number }[]>`SELECT "stockLibre" FROM "Lote" WHERE id = ${b.loteId}::uuid FOR UPDATE`;
      if (!l) throw new NotFoundException('Lote no encontrado');
      if (l.stockLibre + b.cantidad < 0) throw new ConflictException(`Solo hay ${l.stockLibre} libres en ese lote`);
      await tx.lote.update({ where: { id: b.loteId }, data: { stockLibre: { increment: b.cantidad } } });
      const a = await tx.ajusteInventario.create({ data: { ...b, usuarioId: u.id } });
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'AJUSTE_INVENTARIO', entidad: 'Lote', entidadId: b.loteId, datos: { cantidad: b.cantidad, motivo: b.motivo, nota: b.nota } }, tx);
      // Si entró mercancía, se aparta para los clientes que la estaban esperando.
      if (b.cantidad > 0) {
        const lote = await tx.lote.findUniqueOrThrow({ where: { id: b.loteId }, select: { productoId: true } });
        avisos = await this.espera.asignar(tx, lote.productoId);
      }
      return a;
    });
    await this.espera.enviar(avisos);
    return r;
  }

  /**
   * Mercancía sin factura: la existencia al empezar a usar el sistema, o lo que apareció al contar.
   * Si el lote ya existe se suma; si no, se crea. Queda como ajuste (entrada) en el historial.
   */
  @Post('existencia')
  @Roles('REGENTE', 'ADMIN')
  async existencia(@Body(new Validar(existenciaSchema)) b: ExistenciaInput, @Usuario() u: UsuarioActual) {
    let avisos: ReservaLista[] = [];
    const r = await this.prisma.$transaction(async (tx) => {
      const p = await tx.producto.findUnique({ where: { id: b.productoId }, select: { id: true } });
      if (!p) throw new NotFoundException('Producto no encontrado');
      const numero = b.numeroLote?.trim() || `S/L-${b.vence.replace(/-/g, '')}`;
      const ya = await tx.lote.findUnique({ where: { productoId_numero: { productoId: b.productoId, numero } } });
      const lote = ya
        ? await tx.lote.update({ where: { id: ya.id }, data: { stockLibre: { increment: b.cantidad } } })
        : await tx.lote.create({ data: { productoId: b.productoId, numero, vence: new Date(b.vence), stockLibre: b.cantidad } });
      const a = await tx.ajusteInventario.create({ data: { loteId: lote.id, cantidad: b.cantidad, motivo: b.motivo, nota: b.nota ?? 'Mercancía sin factura', usuarioId: u.id } });
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'AJUSTE_INVENTARIO', entidad: 'Lote', entidadId: lote.id, datos: { cantidad: b.cantidad, motivo: b.motivo, nota: b.nota, sinFactura: true } }, tx);
      avisos = await this.espera.asignar(tx, b.productoId);
      return a;
    });
    await this.espera.enviar(avisos);
    return r;
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
          // 0 días de crédito = se pagó de contado: no queda como deuda.
          ...(b.diasCredito > 0
            ? { venceEn: new Date(Date.now() + b.diasCredito * 86_400_000) }
            : { pagadoUsd: b.lineas.reduce((a, l) => a + l.cantidad * l.costoUsd, 0).toFixed(2) }),
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

  /** Compras recientes con sus líneas y lotes (para devolver a la droguería o anular). */
  @Get('compras')
  @Roles('ADMIN')
  async compras() {
    const lista = await this.prisma.compra.findMany({
      orderBy: { creadaEn: 'desc' }, take: 60,
      include: { lineas: { include: { producto: { select: { nombreComercial: true, concentracion: true } } } }, creadaPor: { select: { nombre: true } } },
    });
    return lista.map((c) => ({
      ...c, totalUsd: c.totalUsd.toFixed(2), pagadoUsd: c.pagadoUsd.toFixed(2), devueltoUsd: c.devueltoUsd.toFixed(2),
      lineas: c.lineas.map((l) => ({ ...l, costoUsd: l.costoUsd.toFixed(2) })),
    }));
  }

  /** Recibe una orden de compra: compara lo pedido con lo que llegó y carga la compra (con sus lotes) en una sola operación. */
  @Post('ordenes/:id/recibir')
  @Roles('ADMIN')
  async recibir(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(recibirOrdenSchema)) b: RecibirOrdenInput, @Usuario() u: UsuarioActual) {
    const o = await this.prisma.ordenCompra.findUnique({ where: { id }, include: { lineas: true } });
    if (!o) throw new NotFoundException('Orden no encontrada');
    if (o.estado !== 'ABIERTA') throw new ConflictException('Esta orden ya fue recibida o anulada');
    const llegaron = b.lineas.filter((l) => l.recibido > 0);
    if (!llegaron.length) throw new BadRequestException('No llegó nada: si la droguería no la mandó, anula la orden');
    const lineas = llegaron.map((l) => {
      const ol = o.lineas.find((x) => x.id === l.lineaId);
      if (!ol) throw new NotFoundException('Esa línea no es de la orden');
      if (!l.numeroLote || !l.vence) throw new BadRequestException('Cada producto recibido necesita lote y vencimiento');
      return { productoId: ol.productoId, numeroLote: l.numeroLote, vence: l.vence, cantidad: l.recibido, factorVenta: l.factorVenta, costoUsd: l.costoUsd };
    });
    // Se «toma» la orden antes de cargar: si alguien la recibe dos veces a la vez, la segunda no carga nada.
    const tomada = await this.prisma.ordenCompra.updateMany({ where: { id, estado: 'ABIERTA' }, data: { estado: 'RECIBIDA' } });
    if (!tomada.count) throw new ConflictException('Esta orden ya fue recibida o anulada');
    let compra: Awaited<ReturnType<InventarioController['compra']>>;
    try {
      compra = await this.compra({ proveedor: o.proveedor, numeroFactura: b.numeroFactura, diasCredito: b.diasCredito, lineas }, u);
    } catch (e) {
      await this.prisma.ordenCompra.update({ where: { id }, data: { estado: 'ABIERTA' } });
      throw e;
    }
    for (const l of b.lineas) await this.prisma.ordenCompraLinea.update({ where: { id: l.lineaId }, data: { recibido: l.recibido } });
    await this.prisma.ordenCompra.update({ where: { id }, data: { compraId: compra.id } });
    const faltas = o.lineas.map((ol) => ({ productoId: ol.productoId, pedido: ol.cantidad, llego: b.lineas.find((x) => x.lineaId === ol.id)?.recibido ?? 0 })).filter((x) => x.llego !== x.pedido);
    return { compraId: compra.id, clientesAvisados: compra.clientesAvisados, diferencias: faltas.length };
  }

  /** Devolver mercancía a la droguería: sale del lote y se descuenta de lo que se le debe. */
  @Post('devoluciones-proveedor')
  @Roles('ADMIN')
  async devolverProveedor(@Body(new Validar(devolucionProveedorSchema)) b: DevolucionProveedorInput, @Usuario() u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.compra.findUnique({ where: { id: b.compraId }, include: { lineas: true } });
      const l = c?.lineas.find((x) => x.id === b.compraLineaId);
      if (!c || !l) throw new NotFoundException('Compra no encontrada');
      if (c.anulada) throw new ConflictException('Esa compra está anulada');
      const lote = await tx.lote.findUnique({ where: { productoId_numero: { productoId: l.productoId, numero: l.numeroLote } } });
      if (!lote) throw new NotFoundException('No se encontró el lote');
      const [bloq] = await tx.$queryRaw<{ stockLibre: number }[]>`SELECT "stockLibre" FROM "Lote" WHERE id = ${lote.id}::uuid FOR UPDATE`;
      if (bloq!.stockLibre < b.cantidad) throw new ConflictException(`Solo quedan ${bloq!.stockLibre} libres de ese lote`);
      const ya = await tx.devolucionProveedor.aggregate({ where: { compraId: c.id, loteId: lote.id }, _sum: { cantidad: true } });
      const maximo = l.cantidad * l.factorVenta - (ya._sum.cantidad ?? 0);
      if (b.cantidad > maximo) throw new ConflictException(`De esa compra solo se pueden devolver ${maximo}`);
      // Costo por unidad de venta (la línea guarda el costo por caja de compra).
      const montoUsd = l.costoUsd.div(l.factorVenta).mul(b.cantidad).toDecimalPlaces(2);
      await tx.lote.update({ where: { id: lote.id }, data: { stockLibre: { decrement: b.cantidad } } });
      await tx.compra.update({ where: { id: c.id }, data: { devueltoUsd: { increment: montoUsd } } });
      const d = await tx.devolucionProveedor.create({ data: { compraId: c.id, loteId: lote.id, cantidad: b.cantidad, montoUsd, motivo: b.motivo, usuarioId: u.id } });
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'DEVOLUCION_PROVEEDOR', entidad: 'Compra', entidadId: c.id, datos: { cantidad: b.cantidad, montoUsd: montoUsd.toFixed(2), motivo: b.motivo } }, tx);
      return { ...d, montoUsd: montoUsd.toFixed(2) };
    });
  }

  /** Anula una compra cargada por error: saca su mercancía (si no se ha vendido) y deja de deberse. */
  @Post('compras/:id/anular')
  @Roles('ADMIN')
  async anularCompra(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.compra.findUnique({ where: { id }, include: { lineas: true } });
      if (!c) throw new NotFoundException('Compra no encontrada');
      if (c.anulada) throw new ConflictException('Ya estaba anulada');
      // Lo que cuenta son los abonos registrados (una compra de contado nace pagada y sí se puede anular).
      if (await tx.pagoProveedor.count({ where: { compraId: id } })) throw new ConflictException('Ya tiene pagos registrados: haz una devolución a la droguería en vez de anular');
      if (!c.devueltoUsd.isZero()) throw new ConflictException('Ya tiene devoluciones: no se puede anular');
      for (const l of c.lineas) {
        const unidades = l.cantidad * l.factorVenta;
        const [lote] = await tx.$queryRaw<{ id: string; stockLibre: number }[]>`
          SELECT id, "stockLibre" FROM "Lote" WHERE "productoId" = ${l.productoId}::uuid AND numero = ${l.numeroLote} FOR UPDATE`;
        if (!lote || lote.stockLibre < unidades) throw new ConflictException(`Ya se vendió o apartó parte del lote ${l.numeroLote}: corrige con un ajuste de inventario`);
        await tx.lote.update({ where: { id: lote.id }, data: { stockLibre: { decrement: unidades } } });
      }
      await tx.compra.update({ where: { id }, data: { anulada: true } });
      await tx.ordenCompra.updateMany({ where: { compraId: id }, data: { estado: 'ABIERTA', compraId: null } });
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'COMPRA_ANULADA', entidad: 'Compra', entidadId: id, datos: { proveedor: c.proveedor, factura: c.numeroFactura } }, tx);
      return { anulada: true };
    });
  }
}

@Module({ imports: [EsperaModule], providers: [ImportacionService], controllers: [InventarioController] })
export class InventarioModule {}
