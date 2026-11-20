import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { crearVentaSchema, ES_EFECTIVO, monedaDe, type CrearVentaInput } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { TasaService, TasaModule } from '../tasa/tasa';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';
import { alergiaQueChoca } from '../common/texto';
import { descontarFefo } from '../inventario/stock';
import { CajaModule, CajaService } from '../caja/caja';

/** Motivo por el que una línea no se puede vender sin más. El mensaje lo lee el cajero. */
interface Bloqueo { productoId: string; motivo: 'ALERGIA' | 'CONTROLADO' | 'FALTA_RECIPE' | 'FALTA_CEDULA'; mensaje: string }

@Injectable()
export class VentasService {
  constructor(private readonly prisma: PrismaService, private readonly tasa: TasaService, private readonly auditoria: AuditoriaService, private readonly caja: CajaService) {}

  async crear(b: CrearVentaInput, cajero: UsuarioActual) {
    // Un producto por línea; siempre en el mismo orden para que dos ventas no se bloqueen entre sí.
    const ids = b.lineas.map((l) => l.productoId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Cada producto debe ir una sola vez');
    const lineas = [...b.lineas].sort((x, y) => x.productoId.localeCompare(y.productoId));

    return this.prisma.$transaction(async (tx) => {
      const turno = await this.caja.turnoAbierto(cajero.id, tx);
      if (!turno) throw new ConflictException({ mensaje: 'Abre la caja antes de vender', codigo: 'CAJA_CERRADA' });
      const productos = await tx.producto.findMany({ where: { id: { in: ids }, activo: true }, include: { principioActivo: true } });
      if (productos.length !== ids.length) throw new NotFoundException('Algún producto no existe o está inactivo');
      const paciente = b.cedula ? await tx.paciente.findUnique({ where: { cedula: b.cedula } }) : null;
      if (b.cedula && !paciente) throw new NotFoundException('El cliente no está registrado');

      // 1. Reglas clínicas: el servidor las aplica aunque la app no las muestre.
      const bloqueos: Bloqueo[] = [];
      const autorizacionesUsadas: string[] = [];
      const recipes = new Map<string, string>();
      const permisos = new Map<string, string>();
      for (const l of lineas) {
        const p = productos.find((x) => x.id === l.productoId)!;
        const nombre = `${p.nombreComercial} ${p.concentracion}`;
        const alergia = paciente ? alergiaQueChoca(paciente.alergias, p.principioActivo) : null;
        const controlado = p.principioActivo.riesgo !== 'NORMAL';

        if ((controlado || p.requiereRecipe) && !paciente) {
          bloqueos.push({ productoId: p.id, motivo: 'FALTA_CEDULA', mensaje: `${nombre} necesita la cédula del cliente` });
          continue;
        }
        if (p.requiereRecipe || controlado) {
          // Sin número explícito, se usa el récipe más reciente del cliente (últimos 30 días, no rechazado).
          const rx = l.recipeId
            ? await tx.recipe.findUnique({ where: { id: l.recipeId } })
            : await tx.recipe.findFirst({ where: { cedula: b.cedula, estado: { not: 'RECHAZADO' }, creadoEn: { gte: new Date(Date.now() - 30 * 86_400_000) } }, orderBy: { creadoEn: 'desc' } });
          if (rx) recipes.set(p.id, rx.id);
          if (!rx || rx.cedula !== b.cedula || rx.estado === 'RECHAZADO') {
            bloqueos.push({ productoId: p.id, motivo: 'FALTA_RECIPE', mensaje: `${nombre} necesita la foto del récipe del cliente` });
            continue;
          }
        }
        if (alergia || controlado) {
          // Sin número explícito, se busca un permiso aprobado y vigente para este cliente y producto.
          const a = l.autorizacionId
            ? await tx.autorizacion.findUnique({ where: { id: l.autorizacionId } })
            : await tx.autorizacion.findFirst({ where: { cedula: b.cedula, productoId: p.id, estado: 'APROBADA', usadaEn: null, expira: { gt: new Date() } }, orderBy: { respondidaEn: 'desc' } });
          const valida = a && a.estado === 'APROBADA' && !a.usadaEn && !!a.expira && a.expira > new Date() && a.cedula === b.cedula && a.productoId === p.id;
          if (!valida) {
            bloqueos.push(alergia
              ? { productoId: p.id, motivo: 'ALERGIA', mensaje: `El cliente es alérgico a ${alergia} y ${nombre} lo contiene. Llama al farmacéutico` }
              : { productoId: p.id, motivo: 'CONTROLADO', mensaje: `${nombre} es ${p.principioActivo.riesgo === 'PSICOTROPICO' ? 'psicotrópico' : 'antibiótico'}: necesita el permiso del farmacéutico` });
            continue;
          }
          autorizacionesUsadas.push(a!.id);
          permisos.set(p.id, a!.id);
        }
      }
      if (bloqueos.length) throw new UnprocessableEntityException({ mensaje: 'Hay productos que necesitan revisión', bloqueos });

      // 2. Precio y tasa del momento: la venta guarda ambos para siempre.
      const tasa = await this.tasa.actual(tx);
      const venta = await tx.venta.create({
        data: { cajeroId: cajero.id, cedula: b.cedula, metodoPago: b.pagos?.[0]?.metodo ?? b.metodoPago!, totalUsd: 0, tasa: tasa.valor, totalBs: 0, turnoId: turno.id },
      });

      // 3. Descontar stock (FEFO) con los lotes bloqueados.
      let total = new Prisma.Decimal(0);
      for (const l of lineas) {
        const p = productos.find((x) => x.id === l.productoId)!;
        const partes = await descontarFefo(tx, p.id, l.cantidad, `${p.nombreComercial} ${p.concentracion}`);
        for (const parte of partes) {
          await tx.ventaLinea.create({
            data: { ventaId: venta.id, productoId: p.id, loteId: parte.loteId, cantidad: parte.cantidad, precioUsd: p.precioUsd, autorizacionId: permisos.get(p.id), recipeId: recipes.get(p.id) ?? l.recipeId },
          });
        }
        total = total.add(p.precioUsd.mul(l.cantidad));
      }
      if (autorizacionesUsadas.length) {
        const r = await tx.autorizacion.updateMany({ where: { id: { in: autorizacionesUsadas }, usadaEn: null }, data: { usadaEn: new Date() } });
        if (r.count !== autorizacionesUsadas.length) throw new ConflictException('Una autorización ya fue usada en otra venta');
      }

      // 4. Pagos y vuelto. Todo se compara en bolívares con 2 decimales para no perder céntimos al convertir.
      const totalBs = total.mul(tasa.valor).toDecimalPlaces(2);
      const pagos = b.pagos?.length
        ? b.pagos
        : [{ metodo: b.metodoPago!, monto: (monedaDe(b.metodoPago!) === 'USD' ? total : totalBs).toNumber(), referencia: b.referenciaPago }];
      const enBs = (p: { metodo: typeof pagos[number]['metodo']; monto: number }) =>
        monedaDe(p.metodo) === 'USD' ? new Prisma.Decimal(p.monto).mul(tasa.valor).toDecimalPlaces(2) : new Prisma.Decimal(p.monto);
      const pagadoBs = pagos.reduce((a, p) => a.add(enBs(p)), new Prisma.Decimal(0));
      const faltaBs = totalBs.sub(pagadoBs);
      if (faltaBs.gt(0.01)) {
        throw new UnprocessableEntityException({ mensaje: `Falta por pagar Bs ${faltaBs.toFixed(2)} (${faltaBs.div(tasa.valor).toFixed(2)} $)`, codigo: 'PAGO_INCOMPLETO' });
      }
      const excesoBs = faltaBs.neg().gt(0.01) ? faltaBs.neg() : new Prisma.Decimal(0);
      if (excesoBs.gt(0)) {
        const efectivoBs = pagos.filter((p) => ES_EFECTIVO(p.metodo)).reduce((a, p) => a.add(enBs(p)), new Prisma.Decimal(0));
        if (efectivoBs.lt(excesoBs)) {
          throw new UnprocessableEntityException({ mensaje: 'Solo se da vuelto de lo pagado en efectivo. Ajusta el monto de los pagos electrónicos', codigo: 'VUELTO_INVALIDO' });
        }
      }
      const vueltoMonto = b.vueltoMoneda === 'USD' ? excesoBs.div(tasa.valor).toDecimalPlaces(2) : excesoBs;
      await tx.pago.createMany({
        data: pagos.map((p) => ({
          ventaId: venta.id, metodo: p.metodo, moneda: monedaDe(p.metodo), monto: p.monto, referencia: p.referencia,
          montoUsd: monedaDe(p.metodo) === 'USD' ? new Prisma.Decimal(p.monto) : new Prisma.Decimal(p.monto).div(tasa.valor).toDecimalPlaces(2),
        })),
      });
      const principal = [...pagos].sort((x, y) => enBs(y).cmp(enBs(x)))[0]!;

      const final = await tx.venta.update({
        where: { id: venta.id },
        data: {
          totalUsd: total, totalBs, metodoPago: principal.metodo,
          referenciaPago: pagos.find((p) => p.referencia)?.referencia,
          vueltoMoneda: excesoBs.gt(0) ? b.vueltoMoneda : null, vueltoMonto,
        },
        include: {
          lineas: { include: { producto: { select: { nombreComercial: true, concentracion: true } }, lote: { select: { numero: true, vence: true } } } },
          pagos: true,
          cajero: { select: { nombre: true } },
        },
      });
      await this.auditoria.registrar({ usuarioId: cajero.id, accion: 'VENTA', entidad: 'Venta', entidadId: venta.id, datos: { totalUsd: total.toFixed(2), autorizaciones: autorizacionesUsadas } }, tx);
      return final;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });
  }

  /** Solo el dueño anula. El stock vuelve a su lote y queda en la auditoría. */
  async anular(id: string, quien: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.venta.findUnique({ where: { id }, include: { lineas: true } });
      if (!v) throw new NotFoundException('La venta no existe');
      if (v.estado === 'ANULADA') throw new ConflictException('La venta ya estaba anulada');
      for (const l of v.lineas) await tx.lote.update({ where: { id: l.loteId }, data: { stockLibre: { increment: l.cantidad } } });
      await tx.venta.update({ where: { id }, data: { estado: 'ANULADA' } });
      await this.auditoria.registrar({ usuarioId: quien.id, accion: 'VENTA_ANULADA', entidad: 'Venta', entidadId: id, datos: { totalUsd: v.totalUsd.toFixed(2) } }, tx);
    });
  }
}

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasService, private readonly prisma: PrismaService) {}

  @Post()
  crear(@Body(new Validar(crearVentaSchema)) b: CrearVentaInput, @Usuario() u: UsuarioActual) {
    return this.ventas.crear(b, u);
  }

  /** El cajero ve solo sus ventas; Regente y dueño ven todas. */
  @Get()
  listar(@Usuario() u: UsuarioActual, @Query('desde') desde?: string) {
    const inicio = desde ? new Date(desde) : new Date(new Date().toISOString().slice(0, 10));
    if (Number.isNaN(inicio.getTime())) throw new BadRequestException('Fecha inválida');
    return this.prisma.venta.findMany({
      where: { creadaEn: { gte: inicio }, cajeroId: u.rol === 'CAJERO' ? u.id : undefined },
      orderBy: { creadaEn: 'desc' },
      take: 200,
      include: { cajero: { select: { nombre: true } }, pagos: true, lineas: { select: { cantidad: true, precioUsd: true, producto: { select: { nombreComercial: true } } } } },
    });
  }

  @Get(':id')
  async ver(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    const v = await this.prisma.venta.findUnique({ where: { id }, include: { lineas: { include: { producto: true, lote: true } }, pagos: true, cajero: { select: { nombre: true } } } });
    if (!v) throw new NotFoundException('La venta no existe');
    if (u.rol === 'CAJERO' && v.cajeroId !== u.id) throw new ForbiddenException('Solo puedes ver tus ventas');
    return v;
  }

  @Post(':id/anular')
  @Roles('ADMIN')
  @HttpCode(204)
  anular(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.ventas.anular(id, u);
  }
}

@Module({ imports: [TasaModule, CajaModule], providers: [VentasService], controllers: [VentasController] })
export class VentasModule {}
