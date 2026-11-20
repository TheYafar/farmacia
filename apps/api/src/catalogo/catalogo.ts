import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { productoSchema, type ProductoInput } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';

const hoy = () => new Date(new Date().toISOString().slice(0, 10));

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Búsqueda por marca, principio activo, concentración, laboratorio o código de barras.
   * Agrupa por molécula + concentración + forma (bioequivalentes) y ordena de menor a mayor precio.
   */
  async buscar(q: string) {
    const palabras = q.trim().split(/\s+/).filter(Boolean).slice(0, 6);
    if (!palabras.length) return { grupos: [] };

    const condiciones = palabras.map(
      (p) => Prisma.sql`unaccent(lower(p."nombreComercial" || ' ' || pa."nombre" || ' ' || p."concentracion" || ' ' || p."forma" || ' ' || p."laboratorio" || ' ' || coalesce(p."codigoBarras", '')))
        LIKE '%' || unaccent(lower(${p})) || '%'`,
    );
    const claves = await this.prisma.$queryRaw<{ principioActivoId: string; concentracion: string; forma: string }[]>`
      SELECT DISTINCT p."principioActivoId", p."concentracion", p."forma"
      FROM "Producto" p JOIN "PrincipioActivo" pa ON pa.id = p."principioActivoId"
      WHERE p.activo AND ${Prisma.join(condiciones, ' AND ')}
      LIMIT 20`;
    if (!claves.length) return { grupos: [] };

    const productos = await this.prisma.producto.findMany({
      where: { activo: true, OR: claves.map((c) => ({ principioActivoId: c.principioActivoId, concentracion: c.concentracion, forma: c.forma })) },
      include: { principioActivo: true, lotes: { where: { vence: { gte: hoy() } }, select: { stockLibre: true, stockReservado: true } } },
      orderBy: { precioUsd: 'asc' },
    });

    const grupos = claves.map((c) => {
      const opciones = productos.filter((p) => p.principioActivoId === c.principioActivoId && p.concentracion === c.concentracion && p.forma === c.forma);
      const pa = opciones[0]!.principioActivo;
      return {
        principio: { id: pa.id, nombre: pa.nombre, familia: pa.familia, riesgo: pa.riesgo, uso: pa.uso },
        concentracion: c.concentracion,
        forma: c.forma,
        opciones: opciones.map(({ lotes, principioActivo: _pa, ...p }) => ({
          ...p,
          precioUsd: p.precioUsd.toFixed(2),
          precioUnidadUsd: p.precioUsd.div(p.unidadesPorCaja).toFixed(4),
          stockLibre: lotes.reduce((a, l) => a + l.stockLibre, 0),
          stockReservado: lotes.reduce((a, l) => a + l.stockReservado, 0),
        })),
      };
    });
    return { grupos };
  }
}

@Controller('catalogo')
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService, private readonly prisma: PrismaService, private readonly auditoria: AuditoriaService) {}

  @Get('buscar')
  buscar(@Query('q') q = '') {
    return this.catalogo.buscar(q.slice(0, 100));
  }

  /** Lector de código de barras: devuelve el producto exacto. */
  @Get('codigo/:codigo')
  async porCodigo(@Param('codigo') codigo: string) {
    const p = await this.prisma.producto.findUnique({ where: { codigoBarras: codigo }, include: { principioActivo: true } });
    if (!p || !p.activo) throw new NotFoundException('Código no registrado');
    return p;
  }

  @Get('principios')
  principios() {
    return this.prisma.principioActivo.findMany({ orderBy: { nombre: 'asc' } });
  }

  @Post('productos')
  @Roles('ADMIN')
  async crear(@Body(new Validar(productoSchema)) b: ProductoInput, @Usuario() yo: UsuarioActual) {
    const p = await this.prisma.producto.create({ data: b });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'PRODUCTO_CREADO', entidad: 'Producto', entidadId: p.id });
    return p;
  }

  /** Cambiar precio queda en la auditoría con el valor anterior. */
  @Patch('productos/:id')
  @Roles('ADMIN')
  async editar(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(productoSchema.partial())) b: Partial<ProductoInput>, @Usuario() yo: UsuarioActual) {
    const antes = await this.prisma.producto.findUniqueOrThrow({ where: { id } });
    const p = await this.prisma.producto.update({ where: { id }, data: b });
    await this.auditoria.registrar({
      usuarioId: yo.id, accion: 'PRODUCTO_EDITADO', entidad: 'Producto', entidadId: id,
      datos: { antes: { precioUsd: antes.precioUsd.toFixed(2) }, cambios: b as Prisma.InputJsonValue },
    });
    return p;
  }
}

@Module({ providers: [CatalogoService], controllers: [CatalogoController], exports: [CatalogoService] })
export class CatalogoModule {}
