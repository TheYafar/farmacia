import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  clienteEmpresaSchema, abonoSchema, ordenCompraSchema, pedidoMayorSchema,
  type ClienteEmpresaInput, type AbonoInput, type OrdenCompraInput, type PedidoMayorInput, fechaVe, inicioDiaVe, sumarDias, libroManualSchema, type LibroManualInput } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Modulo, Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';
import { descontarFefo } from '../inventario/stock';

const D = (v: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(v ?? 0);
const dia = 86_400_000;
const hoy0 = () => inicioDiaVe();
/** «AAAA-MM-DD» es un día de Venezuela; cualquier otro texto se lee tal cual. */
const diaVe = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? inicioDiaVe(s) : new Date(s));

/** Rango de fechas de los reportes: por defecto, los últimos 30 días. */
function rango(desde?: string, hasta?: string) {
  const h = hasta ? diaVe(hasta) : new Date();
  const d = desde ? diaVe(desde) : inicioDiaVe(sumarDias(fechaVe(), -29));
  if (Number.isNaN(h.getTime()) || Number.isNaN(d.getTime())) throw new BadRequestException('Fecha inválida');
  return { d, h: new Date(h.getTime() + (hasta ? dia : 0)) };
}

/* ───────────────── Compras a droguerías ───────────────── */

@Controller('proveedores')
@Modulo('compras')
@Roles('ADMIN')
export class ProveedoresController {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  /** Qué pedir: ventas de 30 días + clientes esperando − existencia. Sugiere la última droguería que lo trajo. */
  @Get('sugerido')
  async sugerido() {
    const hace30 = new Date(hoy0().getTime() - 30 * dia);
    const filas = await this.prisma.$queryRaw<{ id: string; nombre: string; vendidos: bigint; stock: bigint; espera: bigint; costo: Prisma.Decimal | null; proveedor: string | null }[]>`
      SELECT p.id, p."nombreComercial" || ' ' || p.concentracion AS nombre,
        COALESCE((SELECT sum(vl.cantidad) FROM "VentaLinea" vl JOIN "Venta" v ON v.id = vl."ventaId"
                  WHERE vl."productoId" = p.id AND v.estado = 'COMPLETADA' AND v."creadaEn" >= ${hace30}), 0) AS vendidos,
        COALESCE((SELECT sum(l."stockLibre" + l."stockReservado") FROM "Lote" l WHERE l."productoId" = p.id AND l.vence >= (now() AT TIME ZONE 'America/Caracas')::date), 0) AS stock,
        (SELECT count(*) FROM "SolicitudEspera" s WHERE s."productoId" = p.id AND s.estado = 'EN_ESPERA') AS espera,
        (SELECT cl."costoUsd" / GREATEST(cl."factorVenta", 1) FROM "CompraLinea" cl JOIN "Compra" c ON c.id = cl."compraId"
          WHERE cl."productoId" = p.id ORDER BY c."creadaEn" DESC LIMIT 1) AS costo,
        (SELECT c.proveedor FROM "CompraLinea" cl JOIN "Compra" c ON c.id = cl."compraId"
          WHERE cl."productoId" = p.id ORDER BY c."creadaEn" DESC LIMIT 1) AS proveedor
      FROM "Producto" p WHERE p.activo`;
    return filas
      .map((f) => {
        const vendidos = Number(f.vendidos), stock = Number(f.stock), espera = Number(f.espera);
        const pedir = Math.max(0, vendidos + espera - stock);
        return { productoId: f.id, nombre: f.nombre, vendidos30: vendidos, stock, espera, pedir, proveedor: f.proveedor, costoUnidadUsd: f.costo ? D(f.costo).toFixed(2) : null };
      })
      .filter((f) => f.pedir > 0)
      .sort((a, b) => (a.stock === 0 ? -1 : 0) - (b.stock === 0 ? -1 : 0) || b.pedir - a.pedir);
  }

  /** Droguerías a las que ya se les compró, para elegirlas al cargar una compra. */
  /** Nombres de droguerías: también lo usa «Cargar compra» de Inventario (que está en todos los planes). */
  @Modulo(false)
  @Get('lista')
  async lista() {
    const f = await this.prisma.compra.groupBy({ by: ['proveedor'], _count: true, orderBy: { _count: { proveedor: 'desc' } } });
    return f.map((x) => x.proveedor);
  }

  /** Cuentas por pagar: compras con saldo, de la que vence antes a la que vence después. */
  @Get('cuentas')
  async cuentas() {
    const compras = await this.prisma.compra.findMany({ where: { anulada: false }, orderBy: { venceEn: 'asc' }, take: 300, include: { pagos: { orderBy: { creadoEn: 'desc' } } } });
    const saldo = (c: { totalUsd: Prisma.Decimal; pagadoUsd: Prisma.Decimal; devueltoUsd: Prisma.Decimal }) => D(c.totalUsd).minus(c.pagadoUsd).minus(c.devueltoUsd);
    const lista = compras
      .filter((c) => saldo(c).gt(0))
      .map((c) => ({
        id: c.id, proveedor: c.proveedor, numeroFactura: c.numeroFactura, creadaEn: c.creadaEn, venceEn: c.venceEn,
        totalUsd: D(c.totalUsd).toFixed(2), pagadoUsd: D(c.pagadoUsd).toFixed(2), devueltoUsd: D(c.devueltoUsd).toFixed(2), saldoUsd: saldo(c).toFixed(2),
        vencida: !!c.venceEn && c.venceEn < hoy0(),
      }));
    const porProveedor = Object.entries(lista.reduce<Record<string, number>>((a, c) => ({ ...a, [c.proveedor]: (a[c.proveedor] ?? 0) + Number(c.saldoUsd) }), {}))
      .map(([proveedor, saldo]) => ({ proveedor, saldoUsd: saldo.toFixed(2) }));
    return { facturas: lista, porProveedor };
  }

  @Post('cuentas/:id/pagos')
  async pagar(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(abonoSchema)) b: AbonoInput, @Usuario() u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.compra.findUnique({ where: { id } });
      if (!c || c.anulada) throw new NotFoundException('Compra no encontrada');
      const saldo = D(c.totalUsd).minus(c.pagadoUsd).minus(c.devueltoUsd);
      if (D(b.montoUsd).gt(saldo)) throw new ConflictException(`El pago es mayor que el saldo (${saldo.toFixed(2)} $)`);
      await tx.pagoProveedor.create({ data: { compraId: id, montoUsd: b.montoUsd, metodo: b.metodo, referencia: b.referencia, usuarioId: u.id } });
      const act = await tx.compra.update({ where: { id }, data: { pagadoUsd: { increment: b.montoUsd } } });
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'PAGO_PROVEEDOR', entidad: 'Compra', entidadId: id, datos: { montoUsd: b.montoUsd, metodo: b.metodo } }, tx);
      return { saldoUsd: D(act.totalUsd).minus(act.pagadoUsd).minus(act.devueltoUsd).toFixed(2) };
    });
  }

  /** Órdenes de compra: lo que se le pidió a cada droguería y todavía no llega. */
  @Get('ordenes')
  async ordenes() {
    const lista = await this.prisma.ordenCompra.findMany({ orderBy: { creadaEn: 'desc' }, take: 60, include: { lineas: true } });
    const productos = await this.prisma.producto.findMany({ where: { id: { in: [...new Set(lista.flatMap((o) => o.lineas.map((l) => l.productoId)))] } }, select: { id: true, nombreComercial: true, concentracion: true, unidadesPorCaja: true } });
    const p = new Map(productos.map((x) => [x.id, x]));
    return lista.map((o) => ({ ...o, lineas: o.lineas.map((l) => ({ ...l, nombre: `${p.get(l.productoId)?.nombreComercial ?? '—'} ${p.get(l.productoId)?.concentracion ?? ''}` })) }));
  }

  @Post('ordenes')
  async crearOrden(@Body(new Validar(ordenCompraSchema)) b: OrdenCompraInput, @Usuario() u: UsuarioActual) {
    const o = await this.prisma.ordenCompra.create({ data: { proveedor: b.proveedor, creadoPorId: u.id, lineas: { create: b.lineas } } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'ORDEN_COMPRA', entidad: 'OrdenCompra', entidadId: o.id, datos: { proveedor: b.proveedor, productos: b.lineas.length } });
    return o;
  }

  @Post('ordenes/:id/anular')
  @HttpCode(200)
  async anularOrden(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    const r = await this.prisma.ordenCompra.updateMany({ where: { id, estado: 'ABIERTA' }, data: { estado: 'ANULADA' } });
    if (!r.count) throw new ConflictException('Solo se anulan órdenes abiertas');
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'ORDEN_COMPRA_ANULADA', entidad: 'OrdenCompra', entidadId: id });
    return { estado: 'ANULADA' };
  }
}

/* ───────────────── Venta al mayor ───────────────── */

const SIGUIENTE: Record<string, 'PEDIDO' | 'DESPACHADO' | 'ENTREGADO' | undefined> = { COTIZACION: 'PEDIDO', PEDIDO: 'DESPACHADO', DESPACHADO: 'ENTREGADO' };

@Controller('mayorista')
@Modulo('mayor')
@Roles('ADMIN')
export class MayoristaController {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  /** Deuda = pedidos despachados o entregados que no se han pagado completos. */
  private async deudas() {
    const filas = await this.prisma.pedidoMayor.groupBy({
      by: ['clienteId'], where: { estado: { in: ['DESPACHADO', 'ENTREGADO'] } }, _sum: { totalUsd: true, pagadoUsd: true },
    });
    return new Map(filas.map((f) => [f.clienteId, D(f._sum.totalUsd).minus(D(f._sum.pagadoUsd))]));
  }

  @Get('clientes')
  async clientes() {
    const [lista, deudas, vencidos] = await Promise.all([
      this.prisma.clienteEmpresa.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      this.deudas(),
      this.prisma.pedidoMayor.findMany({ where: { estado: { in: ['DESPACHADO', 'ENTREGADO'] }, venceEn: { lt: hoy0() } }, select: { clienteId: true, totalUsd: true, pagadoUsd: true } }),
    ]);
    return lista.map((c) => {
      const vencido = vencidos.filter((v) => v.clienteId === c.id).reduce((a, v) => a.plus(D(v.totalUsd).minus(v.pagadoUsd)), D(0));
      return { ...c, limiteUsd: D(c.limiteUsd).toFixed(2), descuentoPct: D(c.descuentoPct).toFixed(2), deudaUsd: (deudas.get(c.id) ?? D(0)).toFixed(2), vencidoUsd: vencido.toFixed(2) };
    });
  }

  @Post('clientes')
  async crearCliente(@Body(new Validar(clienteEmpresaSchema)) b: ClienteEmpresaInput, @Usuario() u: UsuarioActual) {
    const rif = b.rif.replace(/^([JGVEP])-?(\d{8})-?(\d)$/, '$1-$2-$3');
    if (await this.prisma.clienteEmpresa.findUnique({ where: { rif } })) throw new ConflictException('Ya existe un cliente con ese RIF');
    const c = await this.prisma.clienteEmpresa.create({ data: { ...b, rif } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'CLIENTE_EMPRESA_CREADO', entidad: 'ClienteEmpresa', entidadId: c.id });
    return c;
  }

  @Patch('clientes/:id')
  async editarCliente(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(clienteEmpresaSchema.partial().extend({ activo: z.boolean().optional() }))) b: Partial<ClienteEmpresaInput> & { activo?: boolean }, @Usuario() u: UsuarioActual) {
    if (!(await this.prisma.clienteEmpresa.findUnique({ where: { id } }))) throw new NotFoundException('Cliente no encontrado');
    const { rif: _rif, ...datos } = b; // el RIF no se cambia
    const c = await this.prisma.clienteEmpresa.update({ where: { id }, data: datos });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'CLIENTE_EMPRESA_EDITADO', entidad: 'ClienteEmpresa', entidadId: id, datos: datos as Prisma.InputJsonValue });
    return c;
  }

  @Get('pedidos')
  async pedidos() {
    const lista = await this.prisma.pedidoMayor.findMany({
      where: { OR: [{ estado: { in: ['COTIZACION', 'PEDIDO', 'DESPACHADO'] } }, { creadoEn: { gte: new Date(Date.now() - 60 * dia) } }] },
      orderBy: { creadoEn: 'desc' }, take: 100, include: { cliente: { select: { nombre: true, rif: true } }, lineas: true },
    });
    const productos = await this.prisma.producto.findMany({ where: { id: { in: [...new Set(lista.flatMap((p) => p.lineas.map((l) => l.productoId)))] } }, select: { id: true, nombreComercial: true, concentracion: true } });
    const nombre = new Map(productos.map((p) => [p.id, `${p.nombreComercial} ${p.concentracion}`]));
    return lista.map((p) => ({
      ...p, totalUsd: D(p.totalUsd).toFixed(2), pagadoUsd: D(p.pagadoUsd).toFixed(2), saldoUsd: D(p.totalUsd).minus(p.pagadoUsd).toFixed(2),
      lineas: p.lineas.map((l) => ({ ...l, nombre: nombre.get(l.productoId) ?? '—', precioUsd: D(l.precioUsd).toFixed(2) })),
    }));
  }

  /** Crea una cotización con el precio de mayor del cliente (precio de detal menos su descuento). */
  @Post('pedidos')
  async cotizar(@Body(new Validar(pedidoMayorSchema)) b: PedidoMayorInput, @Usuario() u: UsuarioActual) {
    const cliente = await this.prisma.clienteEmpresa.findUnique({ where: { id: b.clienteId } });
    if (!cliente?.activo) throw new NotFoundException('Cliente no encontrado');
    const productos = await this.prisma.producto.findMany({ where: { id: { in: b.lineas.map((l) => l.productoId) }, activo: true } });
    const factor = D(1).minus(D(cliente.descuentoPct).div(100));
    const lineas = b.lineas.map((l) => {
      const p = productos.find((x) => x.id === l.productoId);
      if (!p) throw new NotFoundException('Producto no encontrado');
      // Precio escrito a mano en la cotización, o el de mayor del cliente (detal menos su descuento).
      return { productoId: p.id, cantidad: l.cantidad, precioUsd: l.precioUsd ? D(l.precioUsd).toDecimalPlaces(2) : D(p.precioUsd).times(factor).toDecimalPlaces(2) };
    });
    const total = lineas.reduce((a, l) => a.plus(l.precioUsd.times(l.cantidad)), D(0));
    const p = await this.prisma.pedidoMayor.create({
      data: { clienteId: cliente.id, totalUsd: total, creadoPorId: u.id, lineas: { create: lineas }, empleado: b.empleado || null, validaHasta: new Date(Date.now() + b.validezDias * dia) },
    });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'COTIZACION_MAYOR', entidad: 'PedidoMayor', entidadId: p.id, datos: { totalUsd: total.toFixed(2) } });
    return { id: p.id, numero: p.numero, totalUsd: total.toFixed(2) };
  }

  /** Avanza el pedido. Al despachar descuenta el stock (FEFO) y revisa el límite de crédito. */
  @Post('pedidos/:id/avanzar')
  async avanzar(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.pedidoMayor.findUnique({ where: { id }, include: { lineas: true, cliente: true } });
      if (!p) throw new NotFoundException('Pedido no encontrado');
      const sig = SIGUIENTE[p.estado];
      if (!sig) throw new ConflictException('Este pedido ya no se puede avanzar');
      const data: Prisma.PedidoMayorUpdateInput = { estado: sig };
      if (sig === 'PEDIDO') {
        if (p.validaHasta && p.validaHasta < new Date()) throw new ConflictException('La cotización venció: haz una nueva con los precios de hoy');
        // Stock apartado: lo libre menos lo que ya está comprometido en otros pedidos sin despachar.
        for (const l of p.lineas) {
          const [r] = await tx.$queryRaw<{ libre: bigint; comprometido: bigint }[]>`
            SELECT COALESCE((SELECT sum("stockLibre") FROM "Lote" WHERE "productoId" = ${l.productoId}::uuid AND vence >= (now() AT TIME ZONE 'America/Caracas')::date), 0) AS libre,
                   COALESCE((SELECT sum(pl.cantidad) FROM "PedidoMayorLinea" pl JOIN "PedidoMayor" pm ON pm.id = pl."pedidoId"
                             WHERE pl."productoId" = ${l.productoId}::uuid AND pm.estado = 'PEDIDO' AND pm.id <> ${p.id}::uuid), 0) AS comprometido`;
          const disponible = Number(r!.libre) - Number(r!.comprometido);
          if (disponible < l.cantidad) {
            const prod = await tx.producto.findUnique({ where: { id: l.productoId }, select: { nombreComercial: true } });
            throw new ConflictException(`No alcanza ${prod?.nombreComercial ?? 'un producto'}: hay ${Math.max(disponible, 0)} disponibles (el resto está apartado para otros pedidos)`);
          }
        }
      }
      if (sig === 'DESPACHADO') {
        const deuda = (await this.deudas()).get(p.clienteId) ?? D(0);
        if (deuda.plus(p.totalUsd).gt(p.cliente.limiteUsd)) {
          throw new ConflictException(`Pasa el límite de crédito de ${p.cliente.nombre}: debe ${deuda.toFixed(2)} $ y el límite es ${D(p.cliente.limiteUsd).toFixed(2)} $`);
        }
        // Se guarda de qué lotes salió cada producto (va al libro de controlados).
        for (const l of p.lineas) {
          const partes = await descontarFefo(tx, l.productoId, l.cantidad, 'producto para el pedido');
          await tx.pedidoMayorLinea.update({ where: { id: l.id }, data: { lotes: partes } });
        }
        data.venceEn = new Date(Date.now() + p.cliente.diasCredito * dia);
        data.despachadoEn = new Date();
      }
      // Solo avanza si nadie lo avanzó mientras tanto (dos clics a la vez no descuentan el stock dos veces).
      const r = await tx.pedidoMayor.updateMany({ where: { id, estado: p.estado }, data: data as Prisma.PedidoMayorUpdateManyMutationInput });
      if (!r.count) throw new ConflictException('El pedido cambió mientras tanto. Recarga');
      await this.auditoria.registrar({ usuarioId: u.id, accion: `PEDIDO_MAYOR_${sig}`, entidad: 'PedidoMayor', entidadId: id }, tx);
      return { estado: sig };
    });
  }

  @Post('pedidos/:id/anular')
  async anular(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    const p = await this.prisma.pedidoMayor.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pedido no encontrado');
    if (!['COTIZACION', 'PEDIDO'].includes(p.estado)) throw new ConflictException('Solo se anula antes de despachar');
    await this.prisma.pedidoMayor.update({ where: { id }, data: { estado: 'ANULADO' } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'PEDIDO_MAYOR_ANULADO', entidad: 'PedidoMayor', entidadId: id });
    return { estado: 'ANULADO' };
  }

  @Post('pedidos/:id/abonos')
  async abonar(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(abonoSchema)) b: AbonoInput, @Usuario() u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.pedidoMayor.findUnique({ where: { id } });
      if (!p) throw new NotFoundException('Pedido no encontrado');
      if (!['DESPACHADO', 'ENTREGADO'].includes(p.estado)) throw new ConflictException('Solo se abona a pedidos despachados');
      const saldo = D(p.totalUsd).minus(p.pagadoUsd);
      if (D(b.montoUsd).gt(saldo)) throw new ConflictException(`El abono es mayor que el saldo (${saldo.toFixed(2)} $)`);
      await tx.abonoMayor.create({ data: { pedidoId: id, montoUsd: b.montoUsd, metodo: b.metodo, referencia: b.referencia, usuarioId: u.id } });
      const act = await tx.pedidoMayor.update({ where: { id }, data: { pagadoUsd: { increment: b.montoUsd } } });
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'ABONO_MAYOR', entidad: 'PedidoMayor', entidadId: id, datos: { montoUsd: b.montoUsd } }, tx);
      return { saldoUsd: D(act.totalUsd).minus(act.pagadoUsd).toFixed(2) };
    });
  }
}

/* ───────────────── WhatsApp y recompra ───────────────── */

@Controller('whatsapp')
@Modulo('whatsapp')
@Roles('REGENTE', 'ADMIN')
export class WhatsappController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Clientes a los que se les acaba un tratamiento: compraron el mismo producto 2 o más veces en 6 meses.
   * Se estima la próxima compra con el intervalo promedio y se avisa 5 días antes (o si ya pasó la fecha).
   */
  @Get('recompra')
  async recompra() {
    const hace180 = new Date(Date.now() - 180 * dia);
    const filas = await this.prisma.$queryRaw<{ cedula: string; nombre: string; telefono: string; productoId: string; producto: string; precio: Prisma.Decimal; veces: bigint; primera: Date; ultima: Date; cajas: bigint; uxc: number; riesgo: string }[]>`
      SELECT v.cedula, pa.nombre, pa.telefono, vl."productoId", p."nombreComercial" || ' ' || p.concentracion AS producto, p."precioUsd" AS precio,
        count(DISTINCT v.id) AS veces, min(v."creadaEn") AS primera, max(v."creadaEn") AS ultima,
        sum(vl.cantidad - vl.devuelto) FILTER (WHERE v."creadaEn" = (SELECT max(v2."creadaEn") FROM "VentaLinea" vl2 JOIN "Venta" v2 ON v2.id = vl2."ventaId" WHERE v2.cedula = v.cedula AND vl2."productoId" = vl."productoId" AND v2.estado = 'COMPLETADA')) AS cajas,
        p."unidadesPorCaja" AS uxc, pr.riesgo::text AS riesgo
      FROM "VentaLinea" vl JOIN "Venta" v ON v.id = vl."ventaId" JOIN "Paciente" pa ON pa.cedula = v.cedula JOIN "Producto" p ON p.id = vl."productoId" JOIN "PrincipioActivo" pr ON pr.id = p."principioActivoId"
      WHERE v.estado = 'COMPLETADA' AND v."creadaEn" >= ${hace180}
      GROUP BY 1, 2, 3, 4, 5, 6, p."unidadesPorCaja", pr.riesgo`;
    const enviados = await this.prisma.mensajeWhatsapp.findMany({ where: { tipo: 'RECOMPRA', creadoEn: { gte: new Date(Date.now() - 10 * dia) } }, select: { cedula: true, productoId: true } });
    return filas
      .map((f) => {
        // Con 2 o más compras: el intervalo promedio. Con una sola: se estima 1 unidad al día (cajas × unidades por caja),
        // solo para tabletas/cápsulas de tratamiento (10 o más por caja) y nunca antibióticos (son tratamientos cortos).
        const veces = Number(f.veces);
        const intervalo = veces >= 2
          ? (f.ultima.getTime() - f.primera.getTime()) / (veces - 1)
          : f.uxc >= 10 && f.riesgo === 'NORMAL' ? Math.min(90, Math.max(10, Number(f.cajas ?? 1) * f.uxc)) * dia : NaN;
        const proxima = new Date(f.ultima.getTime() + intervalo);
        const dias = Math.round((proxima.getTime() - Date.now()) / dia);
        const texto = `¡Hola ${f.nombre.split(' ')[0]}! Tu ${f.producto} ${dias > 0 ? `se termina en ${dias} día${dias === 1 ? '' : 's'}` : 'ya se debe haber terminado'}. ¿Te lo apartamos? Precio: ${D(f.precio).toFixed(2)} $. Responde SÍ y te lo tenemos listo.`;
        return { cedula: f.cedula, nombre: f.nombre, telefono: f.telefono, productoId: f.productoId, producto: f.producto, precio: D(f.precio).toFixed(2), dias, texto, estimado: veces < 2, enviado: enviados.some((e) => e.cedula === f.cedula && e.productoId === f.productoId) };
      })
      .filter((f) => Number.isFinite(f.dias) && intervaloValido(f.dias))
      .sort((a, b) => a.dias - b.dias);
  }

  /** Registra que se envió el mensaje (se abre WhatsApp en el equipo con el texto listo). */
  @Post('enviado')
  async enviado(@Body() b: { cedula?: string; productoId?: string }, @Usuario() u: UsuarioActual) {
    if (typeof b.cedula !== 'string' || b.cedula.length > 20) throw new BadRequestException('Cédula inválida');
    const productoId = typeof b.productoId === 'string' && /^[0-9a-f-]{36}$/.test(b.productoId) ? b.productoId : null;
    await this.prisma.mensajeWhatsapp.create({ data: { cedula: b.cedula, productoId, tipo: 'RECOMPRA', usuarioId: u.id } });
    return { ok: true };
  }

  @Get('estadisticas')
  async estadisticas() {
    const hace30 = new Date(Date.now() - 30 * dia);
    const mensajes = await this.prisma.mensajeWhatsapp.findMany({ where: { creadoEn: { gte: hace30 } }, select: { cedula: true, productoId: true, creadoEn: true } });
    // Volvió a comprar: compró ese producto después del mensaje.
    let volvieron = 0;
    for (const m of mensajes) {
      if (!m.productoId) continue;
      const v = await this.prisma.ventaLinea.findFirst({ where: { productoId: m.productoId, venta: { cedula: m.cedula, estado: 'COMPLETADA', creadaEn: { gte: m.creadoEn } } }, select: { id: true } });
      if (v) volvieron++;
    }
    return { enviados30: mensajes.length, volvieron };
  }
}
const intervaloValido = (dias: number) => dias <= 5 && dias >= -20;

/* ───────────────── Libro de psicotrópicos ───────────────── */

@Controller('libro')
@Roles('REGENTE', 'ADMIN')
export class LibroController {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  /**
   * Movimientos de productos psicotrópicos, armados solos: ventas, devoluciones de clientes, compras,
   * devoluciones a la droguería, ajustes (mermas, vencidos, conteos) y despachos al mayor.
   */
  @Get('controlados')
  async controlados(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const { d, h } = rango(desde, hasta);
    const controlado = { principioActivo: { riesgo: 'PSICOTROPICO' as const } };
    const nombreDe = (p: { nombreComercial: string; concentracion: string }) => `${p.nombreComercial} ${p.concentracion}`;
    const [salidas, entradas, devoluciones, devProveedor, ajustes, despachos] = await Promise.all([
      this.prisma.ventaLinea.findMany({
        where: { producto: controlado, venta: { estado: 'COMPLETADA', creadaEn: { gte: d, lt: h } } },
        include: {
          producto: { select: { nombreComercial: true, concentracion: true } }, lote: { select: { numero: true } },
          venta: { select: { creadaEn: true, numero: true, cedula: true, paciente: { select: { nombre: true } }, cajero: { select: { nombre: true } } } },
          recipe: { select: { medico: { select: { nombre: true, mpps: true } }, validadoPor: { select: { nombre: true } } } },
          autorizacion: { select: { regente: { select: { nombre: true } } } },
        },
      }),
      // Las compras anuladas no cuentan: su mercancía se sacó del inventario.
      this.prisma.compraLinea.findMany({
        where: { producto: controlado, compra: { anulada: false, creadaEn: { gte: d, lt: h } } },
        include: { producto: { select: { nombreComercial: true, concentracion: true } }, compra: { select: { creadaEn: true, proveedor: true, numeroFactura: true, creadaPor: { select: { nombre: true } } } } },
      }),
      this.prisma.devolucion.findMany({ where: { creadoEn: { gte: d, lt: h } }, include: { venta: { select: { numero: true, cedula: true, paciente: { select: { nombre: true } } } } } }),
      this.prisma.devolucionProveedor.findMany({ where: { creadoEn: { gte: d, lt: h } } }),
      this.prisma.ajusteInventario.findMany({ where: { creadoEn: { gte: d, lt: h } } }),
      this.prisma.pedidoMayorLinea.findMany({
        where: { productoId: { in: (await this.prisma.producto.findMany({ where: controlado, select: { id: true } })).map((p) => p.id) }, pedido: { estado: { in: ['DESPACHADO', 'ENTREGADO'] }, despachadoEn: { gte: d, lt: h } } },
        include: { pedido: { select: { numero: true, despachadoEn: true, cliente: { select: { nombre: true, rif: true } } } } },
      }),
    ]);

    // Datos que hacen falta para devoluciones, ajustes y despachos (lotes, productos y usuarios).
    const lineasDev = devoluciones.flatMap((dv) => (dv.lineas as { lineaId: string; cantidad: number }[]).map((x) => ({ ...x, dv })));
    const vls = await this.prisma.ventaLinea.findMany({
      where: { id: { in: lineasDev.map((x) => x.lineaId) }, producto: controlado },
      include: { producto: { select: { nombreComercial: true, concentracion: true } }, lote: { select: { numero: true } } },
    });
    const loteIds = [...devProveedor.map((x) => x.loteId), ...ajustes.map((x) => x.loteId), ...despachos.flatMap((x) => ((x.lotes ?? []) as { loteId: string }[]).map((l) => l.loteId))];
    const lotes = new Map((await this.prisma.lote.findMany({ where: { id: { in: loteIds }, producto: controlado }, include: { producto: { select: { nombreComercial: true, concentracion: true } } } })).map((l) => [l.id, l]));
    const usuarios = new Map((await this.prisma.usuario.findMany({ where: { id: { in: [...devoluciones.map((x) => x.usuarioId), ...devProveedor.map((x) => x.usuarioId), ...ajustes.map((x) => x.usuarioId)] } }, select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]));
    const compras = new Map((await this.prisma.compra.findMany({ where: { id: { in: devProveedor.map((x) => x.compraId) } }, select: { id: true, proveedor: true, numeroFactura: true } })).map((c) => [c.id, c]));

    const usuariosManual = new Map((await this.prisma.usuario.findMany({ select: { id: true, nombre: true } })).map((x) => [x.id, x.nombre]));
    type Fila = { fecha: Date; tipo: 'ENTRADA' | 'SALIDA'; producto: string; lote: string; cantidad: number; paciente: string; medico: string; documento: string; responsable: string };
    const filas: Fila[] = [
      ...salidas.map((x) => ({
        fecha: x.venta.creadaEn, tipo: 'SALIDA' as const, producto: nombreDe(x.producto), lote: x.lote.numero, cantidad: x.cantidad,
        paciente: x.venta.paciente ? `${x.venta.paciente.nombre} · ${x.venta.cedula}` : x.venta.cedula ?? '—',
        medico: x.recipe?.medico ? `${x.recipe.medico.nombre}${x.recipe.medico.mpps ? ` · MPPS ${x.recipe.medico.mpps}` : ''}` : '—',
        documento: `Venta #${x.venta.numero}`,
        responsable: x.recipe?.validadoPor?.nombre ?? x.autorizacion?.regente?.nombre ?? x.venta.cajero.nombre,
      })),
      ...entradas.map((x) => ({
        fecha: x.compra.creadaEn, tipo: 'ENTRADA' as const, producto: nombreDe(x.producto), lote: x.numeroLote, cantidad: x.cantidad * x.factorVenta,
        paciente: '—', medico: '—', documento: `Compra: ${x.compra.proveedor} · ${x.compra.numeroFactura}`, responsable: x.compra.creadaPor.nombre,
      })),
      ...lineasDev.flatMap((x) => {
        const vl = vls.find((v) => v.id === x.lineaId);
        return vl ? [{
          fecha: x.dv.creadoEn, tipo: 'ENTRADA' as const, producto: nombreDe(vl.producto), lote: vl.lote.numero, cantidad: x.cantidad,
          paciente: x.dv.venta.paciente ? `${x.dv.venta.paciente.nombre} · ${x.dv.venta.cedula}` : x.dv.venta.cedula ?? '—', medico: '—',
          documento: `Devolución de la venta #${x.dv.venta.numero}: ${x.dv.motivo}`, responsable: usuarios.get(x.dv.usuarioId) ?? '—',
        }] : [];
      }),
      ...devProveedor.flatMap((x) => {
        const l = lotes.get(x.loteId), c = compras.get(x.compraId);
        return l ? [{
          fecha: x.creadoEn, tipo: 'SALIDA' as const, producto: nombreDe(l.producto), lote: l.numero, cantidad: x.cantidad, paciente: '—', medico: '—',
          documento: `Devuelto a ${c?.proveedor ?? 'la droguería'}${c ? ` · ${c.numeroFactura}` : ''}: ${x.motivo}`, responsable: usuarios.get(x.usuarioId) ?? '—',
        }] : [];
      }),
      ...ajustes.flatMap((x) => {
        const l = lotes.get(x.loteId);
        return l ? [{
          fecha: x.creadoEn, tipo: x.cantidad > 0 ? 'ENTRADA' as const : 'SALIDA' as const, producto: nombreDe(l.producto), lote: l.numero, cantidad: Math.abs(x.cantidad),
          paciente: '—', medico: '—', documento: `Ajuste: ${x.motivo}${x.nota ? ` (${x.nota})` : ''}`, responsable: usuarios.get(x.usuarioId) ?? '—',
        }] : [];
      }),
      ...despachos.flatMap((x) => ((x.lotes ?? []) as { loteId: string; cantidad: number }[]).flatMap((parte) => {
        const l = lotes.get(parte.loteId);
        return l ? [{
          fecha: x.pedido.despachadoEn!, tipo: 'SALIDA' as const, producto: nombreDe(l.producto), lote: l.numero, cantidad: parte.cantidad,
          paciente: `${x.pedido.cliente.nombre} · ${x.pedido.cliente.rif}`, medico: '—', documento: `Despacho al mayor #${x.pedido.numero}`, responsable: '—',
        }] : [];
      })),
      // Lo escrito a mano (el libro anterior, correcciones): se marca para que se distinga.
      ...(await this.prisma.libroManual.findMany({ where: { fecha: { gte: d, lt: h } } })).map((x) => ({
        fecha: x.fecha, tipo: x.tipo as 'ENTRADA' | 'SALIDA', producto: x.producto, lote: x.lote, cantidad: x.cantidad,
        paciente: x.paciente, medico: x.medico, documento: `${x.documento} (anotado a mano)`, responsable: usuariosManual.get(x.usuarioId) ?? '—',
      })),
    ];
    return filas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }

  /**
   * Anotar un movimiento a mano: lo que no pasó por el sistema (el libro de antes, una compra sin factura cargada…).
   * No se puede editar ni borrar: si algo quedó mal, se anota el movimiento contrario.
   */
  @Post('manual')
  async manual(@Body(new Validar(libroManualSchema)) b: LibroManualInput, @Usuario() u: UsuarioActual) {
    const m = await this.prisma.libroManual.create({ data: { ...b, fecha: new Date(b.fecha), usuarioId: u.id } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'LIBRO_MANUAL', entidad: 'LibroManual', entidadId: m.id, datos: { tipo: b.tipo, producto: b.producto, cantidad: b.cantidad } });
    return m;
  }
}

/* ───────────────── Reportes ───────────────── */

@Controller('reportes')
@Modulo('reportes')
@Roles('ADMIN')
export class ReportesNegocioController {
  constructor(private readonly prisma: PrismaService) {}

  /** Ventas, costo y ganancia por laboratorio. El costo es el último costo de compra por unidad. */
  @Get('ganancia')
  async ganancia(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const { d, h } = rango(desde, hasta);
    const filas = await this.prisma.$queryRaw<{ laboratorio: string; producto: string; unidades: bigint; venta: Prisma.Decimal; costo: Prisma.Decimal | null }[]>`
      SELECT p.laboratorio, p."nombreComercial" || ' ' || p.concentracion AS producto, sum(vl.cantidad - vl.devuelto) AS unidades, sum((vl.cantidad - vl.devuelto) * vl."precioUsd" * (100 - v."descuentoPct") / 100) AS venta,
        sum((vl.cantidad - vl.devuelto) * COALESCE((SELECT cl."costoUsd" / GREATEST(cl."factorVenta", 1) FROM "CompraLinea" cl JOIN "Compra" c ON c.id = cl."compraId"
          WHERE cl."productoId" = p.id AND cl."costoUsd" > 0 ORDER BY c."creadaEn" DESC LIMIT 1), p."costoRefUsd")) AS costo
      FROM "VentaLinea" vl JOIN "Venta" v ON v.id = vl."ventaId" JOIN "Producto" p ON p.id = vl."productoId"
      WHERE v.estado = 'COMPLETADA' AND v."creadaEn" >= ${d} AND v."creadaEn" < ${h}
      GROUP BY 1, 2 ORDER BY venta DESC`;
    const productos = filas.map((f) => {
      const venta = D(f.venta), costo = f.costo === null ? null : D(f.costo);
      return { laboratorio: f.laboratorio, producto: f.producto, unidades: Number(f.unidades), ventaUsd: venta.toFixed(2), costoUsd: costo?.toFixed(2) ?? null, gananciaUsd: costo ? venta.minus(costo).toFixed(2) : null };
    });
    const conCosto = productos.filter((p) => p.costoUsd !== null);
    const totalVenta = productos.reduce((a, p) => a + Number(p.ventaUsd), 0);
    const ganancia = conCosto.reduce((a, p) => a + Number(p.gananciaUsd), 0);
    const ventaConCosto = conCosto.reduce((a, p) => a + Number(p.ventaUsd), 0);
    return { totalVentaUsd: totalVenta.toFixed(2), gananciaUsd: ganancia.toFixed(2), margenPct: ventaConCosto ? Math.round((ganancia / ventaConCosto) * 100) : null, sinCosto: productos.length - conCosto.length, productos };
  }

  /** Rotación: lo que más se vende y lo que tiene existencia pero no se ha movido. */
  @Get('rotacion')
  async rotacion(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const hace30 = rango(desde, hasta).d;
    const filas = await this.prisma.$queryRaw<{ producto: string; vendidos: bigint; stock: bigint; ultima: Date | null }[]>`
      SELECT p."nombreComercial" || ' ' || p.concentracion AS producto,
        COALESCE((SELECT sum(vl.cantidad - vl.devuelto) FROM "VentaLinea" vl JOIN "Venta" v ON v.id = vl."ventaId" WHERE vl."productoId" = p.id AND v.estado = 'COMPLETADA' AND v."creadaEn" >= ${hace30}), 0) AS vendidos,
        COALESCE((SELECT sum(l."stockLibre") FROM "Lote" l WHERE l."productoId" = p.id), 0) AS stock,
        (SELECT max(v."creadaEn") FROM "VentaLinea" vl JOIN "Venta" v ON v.id = vl."ventaId" WHERE vl."productoId" = p.id AND v.estado = 'COMPLETADA') AS ultima
      FROM "Producto" p WHERE p.activo`;
    const lista = filas.map((f) => ({ producto: f.producto, vendidos30: Number(f.vendidos), stock: Number(f.stock), diasSinVenta: f.ultima ? Math.floor((Date.now() - f.ultima.getTime()) / dia) : null }));
    return {
      masVendidos: lista.filter((l) => l.vendidos30 > 0).sort((a, b) => b.vendidos30 - a.vendidos30).slice(0, 15),
      sinMovimiento: lista.filter((l) => l.stock > 0 && l.vendidos30 === 0).sort((a, b) => (b.diasSinVenta ?? 9999) - (a.diasSinVenta ?? 9999)).slice(0, 30),
    };
  }

  /** Ventas por hora del día y por método de pago (netas de devoluciones). */
  @Get('ventas-detalle')
  async ventasDetalle(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const { d, h } = rango(desde, hasta);
    const [horas, metodos, devs] = await Promise.all([
      this.prisma.$queryRaw<{ hora: number; ventas: bigint; usd: Prisma.Decimal }[]>`
        SELECT extract(hour FROM ("creadaEn" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Caracas')::int AS hora, count(*) AS ventas, sum("totalUsd") AS usd
        FROM "Venta" WHERE estado = 'COMPLETADA' AND "creadaEn" >= ${d} AND "creadaEn" < ${h} GROUP BY 1 ORDER BY 1`,
      this.prisma.pago.groupBy({ by: ['metodo'], where: { venta: { estado: 'COMPLETADA', creadaEn: { gte: d, lt: h } } }, _sum: { montoUsd: true, monto: true }, _count: true }),
      this.prisma.devolucion.groupBy({ by: ['metodo'], where: { creadoEn: { gte: d, lt: h } }, _sum: { montoUsd: true } }),
    ]);
    return {
      porHora: horas.map((x) => ({ hora: x.hora, ventas: Number(x.ventas), usd: D(x.usd).toFixed(2) })),
      porMetodo: metodos.map((m) => ({ metodo: m.metodo, pagos: m._count, usd: D(m._sum.montoUsd).minus(devs.find((x) => x.metodo === m.metodo)?._sum.montoUsd ?? 0).toFixed(2), monto: D(m._sum.monto).toFixed(2) })),
      devueltoUsd: devs.reduce((a, x) => a.plus(D(x._sum.montoUsd)), D(0)).toFixed(2),
    };
  }

  /** ¿Cuánto vale la mercancía? A costo (último costo de compra o el del Excel) y a precio de venta. Lo vencido aparte. */
  @Get('inventario')
  async inventario() {
    const filas = await this.prisma.$queryRaw<{ id: string; producto: string; laboratorio: string; categoria: string; precio: Prisma.Decimal; costo: Prisma.Decimal | null; unidades: bigint; vencidas: bigint }[]>`
      SELECT p.id, p."nombreComercial" || ' ' || p.concentracion AS producto, p.laboratorio, p.categoria, p."precioUsd" AS precio,
        COALESCE((SELECT cl."costoUsd" / GREATEST(cl."factorVenta", 1) FROM "CompraLinea" cl JOIN "Compra" c ON c.id = cl."compraId"
          WHERE cl."productoId" = p.id AND cl."costoUsd" > 0 ORDER BY c."creadaEn" DESC LIMIT 1), p."costoRefUsd") AS costo,
        COALESCE(sum(l."stockLibre" + l."stockReservado") FILTER (WHERE l.vence >= (now() AT TIME ZONE 'America/Caracas')::date), 0) AS unidades,
        COALESCE(sum(l."stockLibre" + l."stockReservado") FILTER (WHERE l.vence < (now() AT TIME ZONE 'America/Caracas')::date), 0) AS vencidas
      FROM "Producto" p JOIN "Lote" l ON l."productoId" = p.id
      GROUP BY p.id HAVING sum(l."stockLibre" + l."stockReservado") > 0`;
    let costo = D(0), venta = D(0), vencido = D(0), unidades = 0, sinCosto = 0;
    const porCategoria = new Map<string, { costo: Prisma.Decimal; venta: Prisma.Decimal; unidades: number }>();
    const productos = filas.map((f) => {
      const u = Number(f.unidades), c = f.costo === null ? null : D(f.costo);
      const vCosto = c ? c.mul(u) : null, vVenta = D(f.precio).mul(u);
      if (u > 0) { unidades += u; venta = venta.plus(vVenta); if (vCosto) costo = costo.plus(vCosto); else sinCosto++; }
      if (Number(f.vencidas) && c) vencido = vencido.plus(c.mul(Number(f.vencidas)));
      const g = porCategoria.get(f.categoria) ?? { costo: D(0), venta: D(0), unidades: 0 };
      porCategoria.set(f.categoria, { costo: g.costo.plus(vCosto ?? 0), venta: g.venta.plus(vVenta), unidades: g.unidades + u });
      return { producto: f.producto, laboratorio: f.laboratorio, unidades: u, costoUsd: vCosto?.toFixed(2) ?? null, ventaUsd: vVenta.toFixed(2) };
    });
    return {
      unidades, costoUsd: costo.toFixed(2), ventaUsd: venta.toFixed(2), gananciaPotencialUsd: venta.minus(costo).toFixed(2), vencidoCostoUsd: vencido.toFixed(2), sinCosto,
      porCategoria: [...porCategoria].map(([categoria, g]) => ({ categoria, unidades: g.unidades, costoUsd: g.costo.toFixed(2), ventaUsd: g.venta.toFixed(2) })).sort((a, b) => Number(b.ventaUsd) - Number(a.ventaUsd)),
      productos: productos.filter((p) => p.unidades > 0).sort((a, b) => Number(b.ventaUsd) - Number(a.ventaUsd)).slice(0, 50),
    };
  }

  /** Compara el período elegido con el anterior del mismo largo (por ejemplo, este mes contra el mes pasado). */
  @Get('comparar')
  async comparar(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const { d, h } = rango(desde, hasta);
    const largo = h.getTime() - d.getTime();
    const medir = async (a: Date, b: Date) => {
      const [v, dev, cli] = await Promise.all([
        this.prisma.venta.aggregate({ where: { estado: 'COMPLETADA', creadaEn: { gte: a, lt: b } }, _sum: { totalUsd: true }, _count: true }),
        this.prisma.devolucion.aggregate({ where: { creadoEn: { gte: a, lt: b } }, _sum: { montoUsd: true } }),
        this.prisma.venta.findMany({ where: { estado: 'COMPLETADA', creadaEn: { gte: a, lt: b }, cedula: { not: null } }, distinct: ['cedula'], select: { cedula: true } }),
      ]);
      const usd = D(v._sum.totalUsd).minus(D(dev._sum.montoUsd));
      return { ventas: v._count, usd: usd.toFixed(2), ticketPromedio: v._count ? usd.div(v._count).toFixed(2) : '0.00', clientes: cli.length };
    };
    // Si empieza el día 1 («este mes»), se compara con el mes pasado hasta el mismo día.
    let ad = new Date(d.getTime() - largo), ah = d;
    if (d.getUTCDate() === 1) {
      ad = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
      ah = new Date(Math.min(ad.getTime() + largo, d.getTime()));
    }
    const [actual, anterior] = await Promise.all([medir(d, h), medir(ad, ah)]);
    return { desde: d, hasta: h, anteriorDesde: ad, anteriorHasta: ah, actual, anterior };
  }

  /** Ventas por cajero y diferencias de sus cierres de caja. */
  @Get('cajeros')
  async cajeros(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const { d, h } = rango(desde, hasta);
    const [ventas, usuarios] = await Promise.all([
      this.prisma.venta.groupBy({ by: ['cajeroId'], where: { estado: 'COMPLETADA', creadaEn: { gte: d, lt: h } }, _sum: { totalUsd: true }, _count: true }),
      this.prisma.usuario.findMany({ select: { id: true, nombre: true } }),
    ]);
    const devs = await this.prisma.$queryRaw<{ cajeroId: string; usd: Prisma.Decimal }[]>`
      SELECT v."cajeroId", sum(d."montoUsd") AS usd FROM "Devolucion" d JOIN "Venta" v ON v.id = d."ventaId"
      WHERE v."creadaEn" >= ${d} AND v."creadaEn" < ${h} GROUP BY 1`;
    const turnos = await this.prisma.turno.findMany({ where: { abiertoEn: { gte: d, lt: h }, estado: { not: 'ABIERTO' } }, select: { cajeroId: true, diferencia: true } });
    return ventas.map((v) => ({
      cajero: usuarios.find((u) => u.id === v.cajeroId)?.nombre ?? '—', ventas: v._count,
      totalUsd: D(v._sum.totalUsd).minus(devs.find((x) => x.cajeroId === v.cajeroId)?.usd ?? 0).toFixed(2),
      cierres: turnos.filter((t) => t.cajeroId === v.cajeroId).length,
      conDiferencia: turnos.filter((t) => t.cajeroId === v.cajeroId && conDif(t.diferencia)).length,
    })).sort((a, b) => Number(b.totalUsd) - Number(a.totalUsd));
  }
}

/** El cierre tuvo diferencia en algún método de pago. */
const conDif = (j: unknown) => !!j && typeof j === 'object' && Object.values(j as Record<string, unknown>).some((v) => Number(v) !== 0);

@Module({ controllers: [ProveedoresController, MayoristaController, WhatsappController, LibroController, ReportesNegocioController] })
export class NegocioModule {}
