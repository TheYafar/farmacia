import { Body, ConflictException, Controller, Get, HttpCode, Injectable, Logger, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { confirmarPagoSchema, crearEsperaSchema, ESTADOS_ESPERA, HORAS_RESERVA, type ConfirmarPagoInput, type CrearEsperaInput, type EstadoEspera, fechaVe } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { TasaModule, TasaService } from '../tasa/tasa';
import { Notificador, type ReservaLista } from '../notificaciones/notificador';
import { Modulo, Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';
import { alergiaQueChoca } from '../common/texto';
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
    // En modo manual la farmacia decide a quién apartarle (botón «Apartar» en Encargos).
    const conf = await tx.configuracion.findUnique({ where: { id: 1 }, select: { encargosAuto: true } });
    if (conf && !conf.encargosAuto) return [];
    const pendientes = await tx.solicitudEspera.findMany({
      where: { productoId, estado: 'EN_ESPERA' },
      orderBy: { solicitadaEn: 'asc' },
      include: { paciente: true, producto: true },
    });
    if (!pendientes.length) return [];
    const lotes = await bloquearLotes(tx, productoId);
    const avisos: ReservaLista[] = [];
    for (const s of pendientes) {
      const aviso = await this.apartarUno(tx, s, lotes);
      if (!aviso) break;
      avisos.push(aviso);
    }
    return avisos;
  }

  /**
   * Aparta una caja para un encargo. El tiempo para pagar no corre todavía: empieza cuando la farmacia
   * le avisa al cliente («Avisarle por WhatsApp»), así nadie pierde su turno sin haberse enterado.
   */
  private async apartarUno(tx: Tx, s: Prisma.SolicitudEsperaGetPayload<{ include: { paciente: true; producto: true } }>, lotes: { id: string; stockLibre: number }[]) {
    const lote = lotes.find((l) => l.stockLibre > 0);
    if (!lote) return null;
    lote.stockLibre -= 1;
    await tx.lote.update({ where: { id: lote.id }, data: { stockLibre: { decrement: 1 }, stockReservado: { increment: 1 } } });
    await tx.solicitudEspera.update({ where: { id: s.id }, data: { estado: 'NOTIFICADO', loteId: lote.id, notificadaEn: null, venceReserva: null } });
    const tasa = await this.tasa.actual(tx);
    return {
      telefono: s.paciente.telefono, nombre: s.paciente.nombre, producto: `${s.producto.nombreComercial} ${s.producto.concentracion}`,
      precioUsd: s.producto.precioUsd.toFixed(2), precioBs: s.producto.precioUsd.mul(tasa.valor).toFixed(2), venceReserva: new Date(Date.now() + HORAS_RESERVA * 3_600_000),
    } satisfies ReservaLista;
  }

  /** Modo manual: apartarle una caja a este cliente (si hay). */
  async apartar(id: string, u: UsuarioActual) {
    await this.prisma.$transaction(async (tx) => {
      const s = await tx.solicitudEspera.findUnique({ where: { id }, include: { paciente: true, producto: true } });
      if (!s) throw new NotFoundException('La solicitud no existe');
      if (s.estado !== 'EN_ESPERA') throw new ConflictException('Este encargo ya tiene su caja apartada o está cerrado');
      const ok = await this.apartarUno(tx, s, await bloquearLotes(tx, s.productoId));
      if (!ok) throw new ConflictException('Todavía no hay de este producto. Cárgalo en Inventario → «Llegó mercancía»');
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'ESPERA_APARTADA', entidad: 'SolicitudEspera', entidadId: id }, tx);
    });
  }

  /** La farmacia le avisó al cliente: desde ahora corre el tiempo para pagar (si está configurado). */
  async avisado(id: string, u: UsuarioActual) {
    const s = await this.prisma.solicitudEspera.findUnique({ where: { id } });
    if (!s || s.estado !== 'NOTIFICADO') throw new ConflictException('Solo se avisa cuando ya hay una caja apartada');
    const conf = await this.prisma.configuracion.findUnique({ where: { id: 1 }, select: { reservaHoras: true } });
    const horas = conf?.reservaHoras ?? HORAS_RESERVA;
    const ahora = new Date();
    await this.prisma.solicitudEspera.update({
      where: { id },
      // Si se vuelve a avisar, no se reinicia el tiempo.
      data: { notificadaEn: s.notificadaEn ?? ahora, venceReserva: s.venceReserva ?? (horas > 0 ? new Date(ahora.getTime() + horas * 3_600_000) : null) },
    });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'ESPERA_AVISADA', entidad: 'SolicitudEspera', entidadId: id });
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
    const libre = await this.prisma.lote.aggregate({ where: { productoId: b.productoId, vence: { gte: new Date(fechaVe()) } }, _sum: { stockLibre: true } });
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

      // Las mismas reglas que en Vender: récipe para lo que lo pide, y permiso del farmacéutico para controlados o alergias.
      const reglas = await this.revisarReglas(tx, s.cedula, s.productoId);
      const tasa = await this.tasa.actual(tx);
      // El cobro entra en la caja abierta de quien lo registra (si tiene una), para que salga en su cierre.
      const turno = await tx.turno.findFirst({ where: { cajeroId: u.id, estado: 'ABIERTO' }, select: { id: true } });
      const ivaUsd = s.producto.precioUsd.mul(s.producto.ivaPct).div(100).toDecimalPlaces(2);
      const totalUsd = s.producto.precioUsd.add(ivaUsd);
      const totalBs = totalUsd.mul(tasa.valor).toDecimalPlaces(2);
      await tx.lote.update({ where: { id: s.loteId }, data: { stockReservado: { decrement: 1 } } });
      const venta = await tx.venta.create({
        data: {
          cajeroId: u.id, cedula: s.cedula, metodoPago: 'PAGO_MOVIL', referenciaPago: b.referenciaPagoMovil, turnoId: turno?.id, tasaFuente: tasa.fuente,
          totalUsd, ivaUsd, tasa: tasa.valor, totalBs,
          lineas: { create: { productoId: s.productoId, loteId: s.loteId, cantidad: 1, precioUsd: s.producto.precioUsd, recipeId: reglas.recipeId, autorizacionId: reglas.autorizacionId } },
          pagos: { create: { metodo: 'PAGO_MOVIL', moneda: 'BS', monto: totalBs, montoUsd: totalUsd, referencia: b.referenciaPagoMovil } },
        },
      });
      const r = await tx.solicitudEspera.update({ where: { id }, data: { estado: 'PAGADO_CUSTODIA', referenciaPagoMovil: b.referenciaPagoMovil, gaveta: b.gaveta, ventaId: venta.id } });
      await this.auditoria.registrar({ usuarioId: u.id, accion: 'ESPERA_PAGADA', entidad: 'SolicitudEspera', entidadId: id, datos: { ventaId: venta.id } }, tx);
      return r;
    });
  }

  /** Récipe y permiso para cobrar un encargo de un producto delicado (las mismas reglas que en Vender). */
  private async revisarReglas(tx: Tx, cedula: string, productoId: string) {
    const [p, paciente] = await Promise.all([
      tx.producto.findUniqueOrThrow({ where: { id: productoId }, include: { principioActivo: true } }),
      tx.paciente.findUniqueOrThrow({ where: { cedula } }),
    ]);
    const controlado = p.principioActivo.riesgo !== 'NORMAL';
    const alergia = alergiaQueChoca(paciente.alergias, p.principioActivo);
    let recipeId: string | undefined, autorizacionId: string | undefined;
    if (controlado || p.requiereRecipe) {
      const rx = await tx.recipe.findFirst({ where: { cedula, estado: { not: 'RECHAZADO' }, creadoEn: { gte: new Date(Date.now() - 30 * 86_400_000) } }, orderBy: { creadoEn: 'desc' } });
      if (!rx) throw new ConflictException({ mensaje: 'Este producto necesita el récipe: tómale la foto en «Récipe» con la cédula del cliente', codigo: 'NECESITA_RECIPE' });
      if (rx.estado === 'PENDIENTE' && !controlado && !alergia) throw new ConflictException({ mensaje: 'El récipe está esperando que el farmacéutico lo revise (Por revisar)', codigo: 'RECIPE_PENDIENTE' });
      recipeId = rx.id;
    }
    if (controlado || alergia) {
      const a = await tx.autorizacion.findFirst({ where: { cedula, productoId, estado: 'APROBADA', usadaEn: null, expira: { gt: new Date() } }, orderBy: { respondidaEn: 'desc' } });
      if (!a) throw new ConflictException({ mensaje: alergia ? `El cliente es alérgico a ${alergia}: necesita el permiso del farmacéutico` : 'Es un producto controlado: necesita el permiso del farmacéutico', codigo: 'NECESITA_PERMISO' });
      const r = await tx.autorizacion.updateMany({ where: { id: a.id, usadaEn: null }, data: { usadaEn: new Date() } });
      if (!r.count) throw new ConflictException('Ese permiso ya se usó en otra venta');
      autorizacionId = a.id;
    }
    return { recipeId, autorizacionId };
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
  async listar(@Query('estado') estado?: string) {
    const e = ESTADOS_ESPERA.includes(estado as EstadoEspera) ? (estado as EstadoEspera) : undefined;
    const lista = await this.prisma.solicitudEspera.findMany({
      where: { estado: e },
      orderBy: { solicitadaEn: 'asc' },
      take: 300,
      include: { paciente: { select: { nombre: true, telefono: true } }, producto: { select: { nombreComercial: true, concentracion: true, precioUsd: true } } },
    });
    // Para los que esperan: cuántas hay libres (en modo manual, la farmacia ve que ya llegó y decide a quién apartar).
    const ids = [...new Set(lista.filter((s) => s.estado === 'EN_ESPERA').map((s) => s.productoId))];
    const libres = ids.length ? await this.prisma.lote.groupBy({ by: ['productoId'], where: { productoId: { in: ids }, vence: { gte: new Date(fechaVe()) } }, _sum: { stockLibre: true } }) : [];
    return lista.map((s) => ({ ...s, hay: s.estado === 'EN_ESPERA' ? libres.find((l) => l.productoId === s.productoId)?._sum.stockLibre ?? 0 : undefined }));
  }

  @Post(':id/apartar')
  @HttpCode(204)
  apartar(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.espera.apartar(id, u);
  }

  @Post(':id/avisado')
  @HttpCode(204)
  avisado(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    return this.espera.avisado(id, u);
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
