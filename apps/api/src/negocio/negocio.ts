import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  clienteEmpresaSchema, abonoSchema, ordenCompraSchema, pedidoMayorSchema,
  type ClienteEmpresaInput, type AbonoInput, type OrdenCompraInput, type PedidoMayorInput,
} from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';
import { descontarFefo } from '../inventario/stock';

const D = (v: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(v ?? 0);
const dia = 86_400_000;
const hoy0 = () => new Date(new Date().toISOString().slice(0, 10));

/** Rango de fechas de los reportes: por defecto, los últimos 30 días. */
function rango(desde?: string, hasta?: string) {
  const h = hasta ? new Date(hasta) : new Date();
  const d = desde ? new Date(desde) : new Date(hoy0().getTime() - 29 * dia);
  if (Number.isNaN(h.getTime()) || Number.isNaN(d.getTime())) throw new BadRequestException('Fecha inválida');
  return { d, h: new Date(h.getTime() + (hasta ? dia : 0)) };
}

/* ───────────────── Compras a droguerías ───────────────── */

@Controller('proveedores')
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
        COALESCE((SELECT sum(l."stockLibre" + l."stockReservado") FROM "Lote" l WHERE l."productoId" = p.id AND l.vence >= current_date), 0) AS stock,
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
      return { productoId: p.id, cantidad: l.cantidad, precioUsd: D(p.precioUsd).times(factor).toDecimalPlaces(2) };
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
            SELECT COALESCE((SELECT sum("stockLibre") FROM "Lote" WHERE "productoId" = ${l.productoId}::uuid AND vence >= current_date), 0) AS libre,
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
        for (const l of p.lineas) await descontarFefo(tx, l.productoId, l.cantidad, 'producto para el pedido');
        data.venceEn = new Date(Date.now() + p.cliente.diasCredito * dia);
      }
      await tx.pedidoMayor.update({ where: { id }, data });
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
    const filas = await this.prisma.$queryRaw<{ cedula: string; nombre: string; telefono: string; productoId: string; producto: string; precio: Prisma.Decimal; veces: bigint; primera: Date; ultima: Date }[]>`
      SELECT v.cedula, pa.nombre, pa.telefono, vl."productoId", p."nombreComercial" || ' ' || p.concentracion AS producto, p."precioUsd" AS precio,
        count(DISTINCT v.id) AS veces, min(v."creadaEn") AS primera, max(v."creadaEn") AS ultima
      FROM "VentaLinea" vl JOIN "Venta" v ON v.id = vl."ventaId" JOIN "Paciente" pa ON pa.cedula = v.cedula JOIN "Producto" p ON p.id = vl."productoId"
      WHERE v.estado = 'COMPLETADA' AND v."creadaEn" >= ${hace180}
      GROUP BY 1, 2, 3, 4, 5, 6 HAVING count(DISTINCT v.id) >= 2`;
    const enviados = await this.prisma.mensajeWhatsapp.findMany({ where: { tipo: 'RECOMPRA', creadoEn: { gte: new Date(Date.now() - 10 * dia) } }, select: { cedula: true, productoId: true } });
    return filas
      .map((f) => {
        const intervalo = (f.ultima.getTime() - f.primera.getTime()) / (Number(f.veces) - 1);
        const proxima = new Date(f.ultima.getTime() + intervalo);
        const dias = Math.round((proxima.getTime() - Date.now()) / dia);
        const texto = `¡Hola ${f.nombre.split(' ')[0]}! Tu ${f.producto} ${dias > 0 ? `se termina en ${dias} día${dias === 1 ? '' : 's'}` : 'ya se debe haber terminado'}. ¿Te lo apartamos? Precio: ${D(f.precio).toFixed(2)} $. Responde SÍ y te lo tenemos listo.`;
        return { cedula: f.cedula, nombre: f.nombre, telefono: f.telefono, productoId: f.productoId, producto: f.producto, dias, texto, enviado: enviados.some((e) => e.cedula === f.cedula && e.productoId === f.productoId) };
      })
      .filter((f) => intervaloValido(f.dias))
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
  constructor(private readonly prisma: PrismaService) {}

  /** Entradas (compras) y salidas (ventas) de productos psicotrópicos. Se arma solo con los movimientos. */
  @Get('controlados')
  async controlados(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const { d, h } = rango(desde, hasta);
    const controlado = { principioActivo: { riesgo: 'PSICOTROPICO' as const } };
    const [salidas, entradas] = await Promise.all([
      this.prisma.ventaLinea.findMany({
        where: { producto: controlado, venta: { estado: 'COMPLETADA', creadaEn: { gte: d, lt: h } } },
        include: {
          producto: { select: { nombreComercial: true, concentracion: true } }, lote: { select: { numero: true } },
          venta: { select: { creadaEn: true, numero: true, cedula: true, paciente: { select: { nombre: true } }, cajero: { select: { nombre: true } } } },
          recipe: { select: { medico: { select: { nombre: true, mpps: true } }, validadoPor: { select: { nombre: true } } } },
          autorizacion: { select: { regente: { select: { nombre: true } } } },
        },
      }),
      this.prisma.compraLinea.findMany({
        where: { producto: controlado, compra: { creadaEn: { gte: d, lt: h } } },
        include: { producto: { select: { nombreComercial: true, concentracion: true } }, compra: { select: { creadaEn: true, proveedor: true, numeroFactura: true, creadaPor: { select: { nombre: true } } } } },
      }),
    ]);
    return [
      ...salidas.map((s) => ({
        fecha: s.venta.creadaEn, tipo: 'SALIDA' as const, producto: `${s.producto.nombreComercial} ${s.producto.concentracion}`, lote: s.lote.numero, cantidad: s.cantidad,
        paciente: s.venta.paciente ? `${s.venta.paciente.nombre} · ${s.venta.cedula}` : s.venta.cedula ?? '—',
        medico: s.recipe?.medico ? `${s.recipe.medico.nombre}${s.recipe.medico.mpps ? ` · MPPS ${s.recipe.medico.mpps}` : ''}` : '—',
        documento: `Venta #${s.venta.numero}`,
        responsable: s.recipe?.validadoPor?.nombre ?? s.autorizacion?.regente?.nombre ?? s.venta.cajero.nombre,
      })),
      ...entradas.map((e) => ({
        fecha: e.compra.creadaEn, tipo: 'ENTRADA' as const, producto: `${e.producto.nombreComercial} ${e.producto.concentracion}`, lote: e.numeroLote, cantidad: e.cantidad * e.factorVenta,
        paciente: '—', medico: '—', documento: `${e.compra.proveedor} · ${e.compra.numeroFactura}`, responsable: e.compra.creadaPor.nombre,
      })),
    ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }
}

/* ───────────────── Reportes ───────────────── */

@Controller('reportes')
@Roles('ADMIN')
export class ReportesNegocioController {
  constructor(private readonly prisma: PrismaService) {}

  /** Ventas, costo y ganancia por laboratorio. El costo es el último costo de compra por unidad. */
  @Get('ganancia')
  async ganancia(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const { d, h } = rango(desde, hasta);
    const filas = await this.prisma.$queryRaw<{ laboratorio: string; producto: string; unidades: bigint; venta: Prisma.Decimal; costo: Prisma.Decimal | null }[]>`
      SELECT p.laboratorio, p."nombreComercial" || ' ' || p.concentracion AS producto, sum(vl.cantidad - vl.devuelto) AS unidades, sum((vl.cantidad - vl.devuelto) * vl."precioUsd" * (100 - v."descuentoPct") / 100) AS venta,
        sum((vl.cantidad - vl.devuelto) * (SELECT cl."costoUsd" / GREATEST(cl."factorVenta", 1) FROM "CompraLinea" cl JOIN "Compra" c ON c.id = cl."compraId"
          WHERE cl."productoId" = p.id AND cl."costoUsd" > 0 ORDER BY c."creadaEn" DESC LIMIT 1)) AS costo
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
        SELECT extract(hour FROM "creadaEn" AT TIME ZONE 'America/Caracas')::int AS hora, count(*) AS ventas, sum("totalUsd") AS usd
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
