import { Body, ConflictException, Controller, Get, Headers, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { abrirCajaSchema, cerrarCajaSchema, METODOS_PAGO, type AbrirCajaInput, type CerrarCajaInput, type MetodoPago, type MontosPorMetodo, fechaVe, inicioDiaVe, sumarDias } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';
import { CajasModule, CajasService } from '../cajas/cajas';

type Cliente = PrismaService | Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

@Injectable()
export class CajaService {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  turnoAbierto(cajeroId: string, cliente: Cliente = this.prisma) {
    return cliente.turno.findFirst({ where: { cajeroId, estado: 'ABIERTO' }, include: { caja: { select: { id: true, nombre: true } } } });
  }

  /**
   * Lo que debería haber en la caja, por método y en la moneda de cada uno:
   * efectivo = fondo + lo cobrado en efectivo − el vuelto dado en esa moneda; lo electrónico = lo cobrado.
   * Las ventas anuladas no cuentan.
   */
  async esperado(turnoId: string, cliente: Cliente = this.prisma): Promise<MontosPorMetodo & { ventas: number; totalUsd: string }> {
    const turno = await cliente.turno.findUniqueOrThrow({ where: { id: turnoId } });
    const [pagos, vueltos, ventas, devs] = await Promise.all([
      cliente.pago.groupBy({ by: ['metodo'], where: { venta: { turnoId, estado: 'COMPLETADA' } }, _sum: { monto: true } }),
      cliente.venta.groupBy({ by: ['vueltoMoneda'], where: { turnoId, estado: 'COMPLETADA', vueltoMoneda: { not: null } }, _sum: { vueltoMonto: true } }),
      cliente.venta.aggregate({ where: { turnoId, estado: 'COMPLETADA' }, _count: true, _sum: { totalUsd: true } }),
      cliente.devolucion.groupBy({ by: ['metodo'], where: { turnoId }, _sum: { monto: true } }),
    ]);
    const devuelto = (m: MetodoPago) => devs.find((d) => d.metodo === m)?._sum.monto ?? D(0);
    const cobrado = (m: MetodoPago) => pagos.find((p) => p.metodo === m)?._sum.monto ?? D(0);
    const vuelto = (mon: 'USD' | 'BS') => vueltos.find((v) => v.vueltoMoneda === mon)?._sum.vueltoMonto ?? D(0);
    return {
      EFECTIVO_USD: turno.fondoUsd.add(cobrado('EFECTIVO_USD')).sub(vuelto('USD')).sub(devuelto('EFECTIVO_USD')).toNumber(),
      EFECTIVO_BS: turno.fondoBs.add(cobrado('EFECTIVO_BS')).sub(vuelto('BS')).sub(devuelto('EFECTIVO_BS')).toNumber(),
      PAGO_MOVIL: cobrado('PAGO_MOVIL').sub(devuelto('PAGO_MOVIL')).toNumber(),
      PUNTO_DE_VENTA: cobrado('PUNTO_DE_VENTA').sub(devuelto('PUNTO_DE_VENTA')).toNumber(),
      ventas: ventas._count,
      totalUsd: (ventas._sum.totalUsd ?? D(0)).toFixed(2),
    };
  }
}

@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaService, private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService, private readonly cajas: CajasService) {}

  /** Abre el turno. Si este equipo es una caja, el turno queda en esa caja (una persona a la vez). */
  @Post('abrir')
  async abrir(@Body(new Validar(abrirCajaSchema)) b: AbrirCajaInput, @Usuario() u: UsuarioActual, @Headers('x-caja') token?: string) {
    if (await this.caja.turnoAbierto(u.id)) throw new ConflictException('Ya tienes una caja abierta');
    const equipo = await this.cajas.equipo(token);
    if (equipo) {
      const otro = await this.prisma.turno.findFirst({ where: { cajaId: equipo.cajaId, estado: 'ABIERTO' }, include: { cajero: { select: { nombre: true } } } });
      if (otro) throw new ConflictException(`${equipo.caja.nombre} ya está abierta por ${otro.cajero.nombre}. Que la cierre primero, o usa otra caja`);
      await this.prisma.cajaEquipo.update({ where: { id: equipo.id }, data: { ultimoUso: new Date() } });
    }
    const t = await this.prisma.turno.create({ data: { cajeroId: u.id, fondoUsd: b.fondoUsd, fondoBs: b.fondoBs, cajaId: equipo?.cajaId } });
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'CAJA_ABIERTA', entidad: 'Turno', entidadId: t.id, datos: { fondoUsd: b.fondoUsd, fondoBs: b.fondoBs } });
    return t;
  }

  /**
   * Mi caja abierta. El cajero NO ve cuánto debería haber (cierre a ciegas): así cuenta de verdad.
   * El Regente y el dueño sí lo ven.
   */
  @Get('actual')
  async actual(@Usuario() u: UsuarioActual) {
    const t = await this.caja.turnoAbierto(u.id);
    if (!t) return { turno: null };
    const e = await this.caja.esperado(t.id);
    return { turno: t, ventas: e.ventas, totalUsd: e.totalUsd, esperado: u.rol === 'CAJERO' ? undefined : e };
  }

  @Post('cerrar')
  async cerrar(@Body(new Validar(cerrarCajaSchema)) b: CerrarCajaInput, @Usuario() u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const t = await this.caja.turnoAbierto(u.id, tx);
      if (!t) throw new ConflictException('No tienes una caja abierta');
      return this.cerrarTurno(tx, t.id, b, u, b.nota);
    });
  }

  /** El dueño cierra la caja que otra persona dejó abierta (contando él lo que hay). Así esa caja se puede volver a usar. */
  @Post('turnos/:id/cerrar')
  @Roles('ADMIN')
  async cerrarDeOtro(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(cerrarCajaSchema)) b: CerrarCajaInput, @Usuario() u: UsuarioActual) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.turno.findUnique({ where: { id }, include: { cajero: { select: { nombre: true } } } });
      if (!t || t.estado !== 'ABIERTO') throw new ConflictException('Esa caja ya está cerrada');
      return this.cerrarTurno(tx, id, b, u, `Cerrada por ${u.nombre} (la había dejado abierta ${t.cajero.nombre})${b.nota ? `. ${b.nota}` : ''}`);
    });
  }

  private async cerrarTurno(tx: Prisma.TransactionClient, turnoId: string, b: CerrarCajaInput, u: UsuarioActual, nota?: string) {
    const { ventas, totalUsd, ...esperado } = await this.caja.esperado(turnoId, tx);
    const diferencia = Object.fromEntries(METODOS_PAGO.map((m) => [m, D(b.contado[m]).sub(esperado[m]).toNumber()]));
    // Solo cierra si sigue abierta (dos cierres a la vez no se pisan).
    const r = await tx.turno.updateMany({ where: { id: turnoId, estado: 'ABIERTO' }, data: { estado: 'CERRADO', cerradoEn: new Date(), esperado, contado: b.contado, diferencia, nota } });
    if (!r.count) throw new ConflictException('Esa caja ya está cerrada');
    const cerrado = await tx.turno.findUniqueOrThrow({ where: { id: turnoId } });
    const cuadra = Object.values(diferencia).every((x) => x === 0);
    await this.auditoria.registrar({ usuarioId: u.id, accion: cuadra ? 'CAJA_CERRADA' : 'CAJA_CERRADA_CON_DIFERENCIA', entidad: 'Turno', entidadId: turnoId, datos: { diferencia, ventas } }, tx);
    return { ...cerrado, ventas, totalUsd, cuadra };
  }

  @Get('turnos')
  @Roles('REGENTE', 'ADMIN')
  turnos(@Query('desde') desde?: string) {
    const inicio = desde ? inicioDiaVe(desde) : inicioDiaVe(sumarDias(fechaVe(), -14));
    return this.prisma.turno.findMany({
      where: { abiertoEn: { gte: Number.isNaN(inicio.getTime()) ? undefined : inicio } },
      orderBy: { abiertoEn: 'desc' },
      take: 200,
      include: { cajero: { select: { nombre: true } }, revisadoPor: { select: { nombre: true } }, _count: { select: { ventas: true } } },
    });
  }

  /** El dueño marca el cierre como revisado (por ejemplo, después de aclarar una diferencia). */
  @Post('turnos/:id/revisar')
  @Roles('ADMIN')
  @HttpCode(200)
  async revisar(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    const r = await this.prisma.turno.updateMany({ where: { id, estado: 'CERRADO', revisadoEn: null }, data: { revisadoPorId: u.id, revisadoEn: new Date() } });
    if (!r.count) throw new NotFoundException('El cierre no existe o ya fue revisado');
    await this.auditoria.registrar({ usuarioId: u.id, accion: 'CIERRE_REVISADO', entidad: 'Turno', entidadId: id });
    return this.prisma.turno.findUnique({ where: { id } });
  }
}

@Module({ imports: [CajasModule], providers: [CajaService], controllers: [CajaController], exports: [CajaService] })
export class CajaModule {}
