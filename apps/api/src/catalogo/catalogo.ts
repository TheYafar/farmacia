import { Body, ConflictException, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { configuracionSchema, preciosMasivoSchema, principioSchema, productoSchema, type ConfiguracionInput, type PreciosMasivoInput, type PrincipioInput, type ProductoInput } from '@farmacia/shared';
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

  @Post('principios')
  @Roles('REGENTE', 'ADMIN')
  async crearPrincipio(@Body(new Validar(principioSchema)) b: PrincipioInput, @Usuario() yo: UsuarioActual) {
    if (await this.prisma.principioActivo.findFirst({ where: { nombre: { equals: b.nombre, mode: 'insensitive' } } })) throw new ConflictException('Ya existe ese principio activo');
    const p = await this.prisma.principioActivo.create({ data: b });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'PRINCIPIO_CREADO', entidad: 'PrincipioActivo', entidadId: p.id, datos: { riesgo: b.riesgo } });
    return p;
  }

  /** Marcar un principio como psicotrópico o antibiótico cambia las reglas de venta: queda en la auditoría. */
  @Patch('principios/:id')
  @Roles('REGENTE', 'ADMIN')
  async editarPrincipio(@Param('id', ParseUUIDPipe) id: string, @Body(new Validar(principioSchema.partial())) b: Partial<PrincipioInput>, @Usuario() yo: UsuarioActual) {
    const antes = await this.prisma.principioActivo.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException('No existe');
    const p = await this.prisma.principioActivo.update({ where: { id }, data: b });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'PRINCIPIO_EDITADO', entidad: 'PrincipioActivo', entidadId: id, datos: { antes: { riesgo: antes.riesgo, familia: antes.familia }, cambios: b as Prisma.InputJsonValue } });
    return p;
  }

  /** Sube o baja precios de un laboratorio, una categoría o una selección. Con vistaPrevia no guarda nada. */
  @Post('precios/masivo')
  @Roles('ADMIN')
  async preciosMasivo(@Body(new Validar(preciosMasivoSchema)) b: PreciosMasivoInput, @Usuario() yo: UsuarioActual) {
    const lista = await this.prisma.producto.findMany({
      where: { activo: true, laboratorio: b.laboratorio || undefined, categoria: b.categoria || undefined, id: b.productoIds?.length ? { in: b.productoIds } : undefined },
      orderBy: { nombreComercial: 'asc' }, select: { id: true, nombreComercial: true, concentracion: true, laboratorio: true, precioUsd: true },
    });
    const factor = new Prisma.Decimal(100).add(b.pct).div(100);
    const cambios = lista.map((p) => {
      let nuevo = p.precioUsd.mul(factor);
      nuevo = b.redondear ? nuevo.div(0.05).toDecimalPlaces(0).mul(0.05) : nuevo;
      nuevo = Prisma.Decimal.max(nuevo.toDecimalPlaces(2), 0.01);
      return { id: p.id, nombre: `${p.nombreComercial} ${p.concentracion}`, laboratorio: p.laboratorio, antes: p.precioUsd.toFixed(2), despues: nuevo.toFixed(2) };
    });
    if (!b.vistaPrevia && cambios.length) {
      await this.prisma.$transaction(cambios.map((c) => this.prisma.producto.update({ where: { id: c.id }, data: { precioUsd: c.despues } })));
      await this.auditoria.registrar({ usuarioId: yo.id, accion: 'PRECIOS_MASIVO', entidad: 'Producto', datos: { pct: b.pct, laboratorio: b.laboratorio, categoria: b.categoria, productos: cambios.length } });
    }
    return { guardado: !b.vistaPrevia, cambios };
  }

  @Get('laboratorios')
  async laboratorios() {
    return (await this.prisma.producto.groupBy({ by: ['laboratorio'], where: { activo: true }, orderBy: { laboratorio: 'asc' } })).map((x) => x.laboratorio);
  }

  @Get('configuracion')
  async configuracion() {
    const c = await this.prisma.configuracion.upsert({ where: { id: 1 }, create: {}, update: {} });
    return { igtfActivo: c.igtfActivo, igtfPct: c.igtfPct.toNumber() };
  }

  @Post('configuracion')
  @Roles('ADMIN')
  @HttpCode(200)
  async guardarConfiguracion(@Body(new Validar(configuracionSchema)) b: ConfiguracionInput, @Usuario() yo: UsuarioActual) {
    await this.prisma.configuracion.upsert({ where: { id: 1 }, create: b, update: b });
    await this.auditoria.registrar({ usuarioId: yo.id, accion: 'CONFIGURACION', entidad: 'Configuracion', datos: b });
    return b;
  }

  /** Lista para administrar el catálogo: incluye inactivos, existencia y aviso de stock bajo. */
  @Get('productos')
  @Roles('REGENTE', 'ADMIN')
  async productos(@Query('q') q = '', @Query('bajo') bajo?: string) {
    const filas = await this.prisma.$queryRaw<{ id: string; stock: bigint; costo: Prisma.Decimal | null }[]>`
      SELECT p.id, COALESCE(sum(l."stockLibre") FILTER (WHERE l.vence >= current_date), 0) AS stock,
        (SELECT cl."costoUsd" / GREATEST(cl."factorVenta", 1) FROM "CompraLinea" cl JOIN "Compra" c ON c.id = cl."compraId"
          WHERE cl."productoId" = p.id AND cl."costoUsd" > 0 ORDER BY c."creadaEn" DESC LIMIT 1) AS costo
      FROM "Producto" p LEFT JOIN "Lote" l ON l."productoId" = p.id GROUP BY p.id`;
    const stock = new Map(filas.map((f) => [f.id, Number(f.stock)]));
    const costo = new Map(filas.map((f) => [f.id, f.costo === null ? null : new Prisma.Decimal(f.costo)]));
    const t = q.trim().slice(0, 60);
    const lista = await this.prisma.producto.findMany({
      where: t ? { OR: [{ nombreComercial: { contains: t, mode: 'insensitive' } }, { laboratorio: { contains: t, mode: 'insensitive' } }, { codigoBarras: t }, { principioActivo: { nombre: { contains: t, mode: 'insensitive' } } }] } : undefined,
      include: { principioActivo: { select: { id: true, nombre: true, riesgo: true } } }, orderBy: { nombreComercial: 'asc' }, take: 300,
    });
    const r = lista.map((p) => ({
      ...p, precioUsd: p.precioUsd.toFixed(2), ivaPct: p.ivaPct.toNumber(), stock: stock.get(p.id) ?? 0,
      costoUsd: costo.get(p.id)?.toFixed(2) ?? null,
      margenPct: costo.get(p.id) && p.precioUsd.gt(0) ? p.precioUsd.sub(costo.get(p.id)!).div(p.precioUsd).mul(100).toDecimalPlaces(0).toNumber() : null, bajo: p.activo && p.stockMinimo > 0 && (stock.get(p.id) ?? 0) <= p.stockMinimo }));
    return bajo ? r.filter((p) => p.bajo) : r;
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
