import { Body, ConflictException, Controller, Get, HttpCode, Injectable, Logger, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { confirmarPagoSchema, crearEsperaSchema, ESTADOS_ESPERA, HORAS_RESERVA, type ConfirmarPagoInput, type CrearEsperaInput, type EstadoEspera } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { TasaModule, TasaService } from '../tasa/tasa';
import { Notificador, type ReservaLista } from '../notificaciones/notificador';
import { Modulo, Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';
import { bloquearLotes } from '../inventario/stock';

type Tx = Prisma.TransactionClient;

/**
 * Lista de espera (sección 6 del documento):
 * EN_ESPERA → (llega mercancía) NOTIFICADO → (paga) PAGADO_CUSTODIA → ENTREGADO
 *                                     └→ (no paga a tiempo) EXPIRADO y la caja pasa al siguiente.
 */
@Injectable()
export class EsperaService {
  private readonly log = new Logger('Espera');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasa: TasaService,
    private readonly notificador: Notificador,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Separa cajas para quienes esperan este producto, en orden de llegada (FIFO).
   * Se llama dentro de la misma transacción que sube el stock. Devuelve los avisos a enviar después de guardar.
   */
  async asignar(tx: Tx, productoId: string): Promise<ReservaLista[]> {
    const pendientes = await tx.solicitudEspera.findMany({
      where: { productoId, estado: 'EN_ESPERA' },
      orderBy: { solicitadaEn: 'asc' },
      include: { paciente: true, producto: true },
    });
    if (!pendientes.length) return [];

    const lotes = await bloquearLotes(tx, productoId);
    const tasa = await this.tasa.actual(tx);
    const avisos: ReservaLista[] = [];
    for (const s of pendientes) {
      const lote = lotes.find((l) => l.stockLibre > 0);
      if (!lote) break;
      lote.stockLibre -= 1;
      const venceReserva = new Date(Date.now() + HORAS_RESERVA * 3_600_000);
      await tx.lote.update({ where: { id: lote.id }, data: { stockLibre: { decrement: 1 }, stockReservado: { increment: 1 } } });
      await tx.solicitudEspera.update({ where: { id: s.id }, data: { estado: 'NOTIFICADO', loteId: lote.id, notificadaEn: new Date(), venceReserva } });
      avisos.push({
        telefono: s.paciente.telefono,
        nombre: s.paciente.nombre,
        producto: `${s.producto.nombreComercial} ${s.producto.concentracion}`,
        precioUsd: s.producto.precioUsd.toFixed(2),
        precioBs: s.producto.precioUsd.mul(tasa.valor).toFixed(2),
        venceReserva,
      });
    }
    return avisos;
  }

  async enviar(avisos: ReservaLista[]) {
    for (const a of avisos) {
      try {
        await this.notificador.reservaLista(a);
      } catch (e) {
        // El aviso falló pero la reserva queda: el cajero puede llamar al cliente.
        this.log.error(`No se pudo avisar a un cliente: ${(e as Error).message}`);
      }
    }
  }

  async crear(b: CrearEsperaInput, u: UsuarioActual) {
    const libre = await this.prisma.lote.aggregate({ where: { productoId: b.productoId, vence: { gte: new Date(new Date().toISOString().slice(0, 10)) } }, _sum: { stockLibre: true } });
    if ((libre._sum.stockLibre ?? 0) > 0) throw new ConflictException('Este producto sí hay: véndelo directamente');
    const ya = await this.prisma.solicitudEspera.findFirst({ where: { cedula: b.cedula, productoId: b.productoId, estado: { in: ['EN_ESPERA', 'NOTIFICADO'] } } });
    if (ya) throw new ConflictException('Este cliente ya está esperando este producto');
    const s = await this.prisma.solicitudEspera.create({ data: b });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'ESPERA_ANOTADA', entidad: 'SolicitudEspera', entidadId: s.id });
    return s;
  }

  /** El cliente pagó por Pago Móvil: se factura la caja reservada y se guarda en la gaveta. */
  async confirmarPago(id: string, b: ConfirmarPagoInput, u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.solicitudEspera.findUnique({ where: { id }, include: { producto: true } });
      if (!s) throw new NotFoundException('La solicitud no existe');
      if (s.estado !== 'NOTIFICADO' || !s.loteId) throw new ConflictException('Esta solicitud no está esperando pago');
      if (s.venceReserva && s.venceReserva < new Date()) throw new ConflictException('El tiempo para pagar venció');

      const tasa = await this.tasa.actual(tx);
      await tx.lote.update({ where: { id: s.loteId }, data: { stockReservado: { decrement: 1 } } });
      const venta = await tx.venta.create({
        data: {
          cajeroId: u.id, cedula: s.cedula, metodoPago: 'PAGO_MOVIL', referenciaPago: b.referenciaPagoMovil,
          totalUsd: s.producto.precioUsd, tasa: tasa.valor, totalBs: s.producto.precioUsd.mul(tasa.valor).toDecimalPlaces(2),
          lineas: { create: { productoId: s.productoId, loteId: s.loteId, cantidad: 1, precioUsd: s.producto.precioUsd } },
          pagos: { create: { metodo: 'PAGO_MOVIL', moneda: 'BS', monto: s.producto.precioUsd.mul(tasa.valor).toDecimalPlaces(2), montoUsd: s.producto.precioUsd, referencia: b.referenciaPagoMovil } },
        },
      });
      const r = await tx.solicitudEspera.update({ where: { id }, data: { estado: 'PAGADO_CUSTODIA', referenciaPagoMovil: b.referenciaPagoMovil, gaveta: b.gaveta, ventaId: venta.id } });
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'ESPERA_PAGADA', entidad: 'SolicitudEspera', entidadId: id, datos: { ventaId: venta.id } }, tx);
      return r;
    });
  }

  async entregar(id: string, u: UsuarioActual) {
    const r = await this.prisma.solicitudEspera.updateMany({ where: { id, estado: 'PAGADO_CUSTODIA' }, data: { estado: 'ENTREGADO', cerradaEn: new Date() } });
    if (!r.count) throw new ConflictException('Solo se entrega lo que ya está pagado');
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'ESPERA_ENTREGADA', entidad: 'SolicitudEspera', entidadId: id });
  }

  /** El cliente ya no lo quiere. Si tenía una caja apartada, se libera y pasa al siguiente de la fila. */
  async cancelar(id: string, u: UsuarioActual) {
    const avisos = await this.prisma.$transaction(async (tx) => {
      const s = await tx.solicitudEspera.findUnique({ where: { id } });
      if (!s) throw new NotFoundException('La solicitud no existe');
      if (s.estado !== 'EN_ESPERA' && s.estado !== 'NOTIFICADO') throw new ConflictException(s.estado === 'PAGADO_CUSTODIA' ? 'Ya está pagado: haz una devolución desde Ventas' : 'Este encargo ya está cerrado');
      const r = await tx.solicitudEspera.updateMany({ where: { id, estado: s.estado }, data: { estado: 'CANCELADO', cerradaEn: new Date() } });
      if (!r.count) throw new ConflictException('El encargo cambió mientras tanto. Recarga');
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'ESPERA_CANCELADA', entidad: 'SolicitudEspera', entidadId: id }, tx);
      if (s.estado === 'NOTIFICADO' && s.loteId) {
        await tx.lote.update({ where: { id: s.loteId }, data: { stockReservado: { decrement: 1 }, stockLibre: { increment: 1 } } });
        return this.asignar(tx, s.productoId);
      }
      return [];
    });
    await this.enviar(avisos);
  }

  /** Cada 5 minutos: libera las reservas no pagadas y pasa la caja al siguiente de la fila. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirar() {
    const vencidas = await this.prisma.solicitudEspera.findMany({ where: { estado: 'NOTIFICADO', venceReserva: { lt: new Date() } }, select: { id: true } });
    for (const { id } of vencidas) {
      const avisos = await this.prisma.$transaction(async (tx) => {
        const s = await tx.solicitudEspera.findUnique({ where: { id } });
        if (!s || s.estado !== 'NOTIFICADO' || !s.loteId) return [];
        await tx.lote.update({ where: { id: s.loteId }, data: { stockReservado: { decrement: 1 }, stockLibre: { increment: 1 } } });
        await tx.solicitudEspera.update({ where: { id }, data: { estado: 'EXPIRADO', cerradaEn: new Date() } });
        await this.auditoria.registrar({ accion: 'ESPERA_EXPIRADA', entidad: 'SolicitudEspera', entidadId: id }, tx);
        return this.asignar(tx, s.productoId);
      });
      await this.enviar(avisos);
    }
    return vencidas.length;
  }
}

@Controller('espera')
@Modulo('encargos')
export class EsperaController {
  constructor(private readonly espera: EsperaService, private readonly prisma: PrismaService) {}

  @Post()
  crear(@Body(new Validar(crearEsperaSchema)) b: CrearEsperaInput, @Usuario() u: UsuarioActual) {
    return this.espera.crear(b, u);
  }

  @Get()
  listar(@Query('estado') estado?: string) {
    const e = ESTADOS_ESPERA.includes(estado as EstadoEspera) ? (estado as EstadoEspera) : undefined;
    return this.prisma.solicitudEspera.findMany({
      where: { estado: e },
      orderBy: { solicitadaEn: 'asc' },
      take: 300,
      include: { paciente: { select: { nombre: true, telefono: true } }, producto: { select: { nombreComercial: true, concentracion: true, precioUsd: true } } },
    });
  }

  @Post(':id/confirmar-pago')
  @Roles('REGENTE', 'ADMIN')
  confirmarPago(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(confirmarPagoSchema)) b: ConfirmarPagoInput, @Usuario() u: UsuarioActual) {
    return this.espera.confirmarPago(id, b, u);
  }

  @Post(':id/cancelar')
  @HttpCode(204)
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.espera.cancelar(id, u);
  }

  @Post(':id/entregar')
  @HttpCode(204)
  entregar(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.espera.entregar(id, u);
  }
}

@Module({ imports: [TasaModule], providers: [EsperaService], controllers: [EsperaController], exports: [EsperaService] })
export class EsperaModule {}
