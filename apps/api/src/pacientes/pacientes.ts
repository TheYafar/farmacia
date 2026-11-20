import { BadRequestException, Body, Controller, Get, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizarCedula, pacienteSchema, type PacienteInput } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';

const editarSchema = pacienteSchema.omit({ cedula: true, consentimiento: true }).partial();

/** Ficha rápida por cédula (sección 5 del documento). */
@Controller('pacientes')
export class PacientesController {
  constructor(private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  /** Lista de clientes: busca por nombre, cédula o teléfono. Sin texto, los que compraron más recientemente. */
  @Get()
  async listar(@Query('q') q = '') {
    const t = q.trim().slice(0, 60);
    const digitos = t.replace(/\D/g, '');
    const palabras = t.split(/\s+/).filter((w) => w && !/^\d+$/.test(w)).slice(0, 4);
    // Sin importar tildes ni mayúsculas: «maria» encuentra a «María».
    const porNombre = palabras.length
      ? Prisma.join(palabras.map((w) => Prisma.sql`unaccent(lower(p.nombre)) LIKE '%' || unaccent(lower(${w})) || '%'`), ' AND ')
      : Prisma.sql`FALSE`;
    const porNumero = digitos.length >= 3 ? Prisma.sql`(p.cedula LIKE '%' || ${digitos} || '%' OR regexp_replace(p.telefono, '[^0-9]', '', 'g') LIKE '%' || ${digitos} || '%')` : Prisma.sql`FALSE`;
    const filas = await this.prisma.$queryRaw<{ cedula: string; nombre: string; telefono: string; alergias: string[]; compras: bigint }[]>`
      SELECT p.cedula, p.nombre, p.telefono, p.alergias, (SELECT count(*) FROM "Venta" v WHERE v.cedula = p.cedula) AS compras
      FROM "Paciente" p
      WHERE ${t ? Prisma.sql`(${porNombre}) OR ${porNumero}` : Prisma.sql`TRUE`}
      ORDER BY ${t ? Prisma.sql`p.nombre` : Prisma.sql`p."creadoEn" DESC`} LIMIT 100`;
    return filas.map((f) => ({ ...f, compras: Number(f.compras) }));
  }

  @Get(':cedula')
  async ficha(@Param('cedula') entrada: string) {
    const cedula = normalizarCedula(entrada);
    if (!cedula) throw new BadRequestException('Cédula inválida');
    const p = await this.prisma.paciente.findUnique({ where: { cedula } });
    if (!p) throw new NotFoundException('Este cliente no está registrado');

    // "¿Cuál fue la caja de la tensión que me llevé el mes pasado?"
    const habituales = await this.prisma.ventaLinea.groupBy({
      by: ['productoId'],
      where: { venta: { cedula, estado: 'COMPLETADA' } },
      _count: { _all: true },
      orderBy: { _count: { productoId: 'desc' } },
      take: 5,
    });
    const productos = await this.prisma.producto.findMany({ where: { id: { in: habituales.map((h) => h.productoId) } } });
    const ultimas = await this.prisma.venta.findMany({
      where: { cedula, estado: 'COMPLETADA' }, orderBy: { creadaEn: 'desc' }, take: 10,
      select: { creadaEn: true, lineas: { select: { productoId: true } } },
    });

    return {
      ...p,
      habituales: habituales.map((h) => ({
        producto: productos.find((x) => x.id === h.productoId),
        veces: h._count._all,
        ultimaVez: ultimas.find((v) => v.lineas.some((l) => l.productoId === h.productoId))?.creadaEn ?? null,
      })),
      recipes: await this.prisma.recipe.findMany({ where: { cedula }, orderBy: { creadoEn: 'desc' }, take: 10, select: { id: true, estado: true, creadoEn: true } }),
      esperas: await this.prisma.solicitudEspera.findMany({
        where: { cedula, estado: { in: ['EN_ESPERA', 'NOTIFICADO', 'PAGADO_CUSTODIA'] } },
        include: { producto: { select: { nombreComercial: true, concentracion: true } } },
      }),
    };
  }

  @Post()
  async crear(@Body(new Validar(pacienteSchema)) b: PacienteInput, @Usuario() yo: UsuarioActual) {
    const { consentimiento, ...datos } = b;
    const p = await this.prisma.paciente.create({ data: { ...datos, consentimientoEn: consentimiento ? new Date() : null } });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'PACIENTE_CREADO', entidad: 'Paciente', entidadId: p.cedula });
    return p;
  }

  /** Cambios en alergias quedan auditados: son datos clínicos. */
  @Patch(':cedula')
  async editar(@Param('cedula') entrada: string, @Body(new Validar(editarSchema)) b: Partial<PacienteInput>, @Usuario() yo: UsuarioActual) {
    const cedula = normalizarCedula(entrada);
    if (!cedula) throw new BadRequestException('Cédula inválida');
    const p = await this.prisma.paciente.update({ where: { cedula }, data: b });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'PACIENTE_EDITADO', entidad: 'Paciente', entidadId: cedula, datos: { campos: Object.keys(b) } });
    return p;
  }
}

@Module({ controllers: [PacientesController] })
export class PacientesModule {}
