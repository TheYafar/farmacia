import { Body, ConflictException, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { configuracionSchema, riesgoSugerido, preciosMasivoSchema, principioSchema, productoSchema, type ConfiguracionInput, type PreciosMasivoInput, type PrincipioInput, type ProductoInput, fechaVe } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { Roles, Usuario, type UsuarioActual } from '../common/seguridad';
import { Validar } from '../common/validacion';

const hoy = () => new Date(fechaVe());
const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Distancia de edición (cuántas letras hay que cambiar, quitar o poner). */
export function distancia(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length]!;
}

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  private vocabulario: { palabras: string[]; hasta: number } | null = null;

  /** Palabras del catálogo (marcas, principios, laboratorios) para corregir errores de escritura. Se renueva cada 5 minutos. */
  private async palabras() {
    if (this.vocabulario && this.vocabulario.hasta > Date.now()) return this.vocabulario.palabras;
    const filas = await this.prisma.$queryRaw<{ t: string }[]>`
      SELECT p."nombreComercial" || ' ' || pa.nombre || ' ' || p.laboratorio AS t FROM "Producto" p JOIN "PrincipioActivo" pa ON pa.id = p."principioActivoId" WHERE p.activo`;
    const set = new Set<string>();
    for (const f of filas) for (const w of sinTildes(f.t).split(/[^a-z0-9ñ]+/)) if (w.length >= 4) set.add(w);
    this.vocabulario = { palabras: [...set], hasta: Date.now() + 5 * 60_000 };
    return this.vocabulario.palabras;
  }

  /** «ibuprofemo» → «ibuprofeno». Devuelve null si ninguna palabra cambia. */
  async corregir(q: string) {
    const vocab = await this.palabras();
    let cambio = false;
    const salida = q.trim().split(/\s+/).map((orig) => {
      const w = sinTildes(orig);
      if (w.length < 4 || /\d/.test(w) || vocab.includes(w)) return orig;
      const max = w.length >= 7 ? 2 : 1;
      let mejor: string | null = null, md = max + 1;
      for (const v of vocab) {
        if (Math.abs(v.length - w.length) > max) continue;
        // También vale si lo escrito es el comienzo con un error («ibuprof» no, pero «ibuprpfeno» sí).
        const dd = distancia(w, v);
        if (dd < md) { md = dd; mejor = v; }
      }
      if (mejor) { cambio = true; return mejor; }
      return orig;
    });
    return cambio ? salida.join(' ') : null;
  }

  /**
   * Búsqueda por marca, principio activo, concentración, laboratorio o código de barras.
   * Agrupa por molécula + concentración + forma (bioequivalentes) y ordena de menor a mayor precio.
   */
  async buscar(q: string, todo = false) {
    const palabras = q.trim().split(/\s+/).filter(Boolean).slice(0, 6);
    if (!palabras.length && !todo) return { grupos: [] };

    const condiciones = palabras.map(
      (p) => Prisma.sql`unaccent(lower(p."nombreComercial" || ' ' || pa."nombre" || ' ' || p."concentracion" || ' ' || p."forma" || ' ' || p."laboratorio" || ' ' || coalesce(p."codigoBarras", '')))
        LIKE '%' || unaccent(lower(${p})) || '%'`,
    );
    const claves = await this.prisma.$queryRaw<{ principioActivoId: string; concentracion: string; forma: string }[]>`
      SELECT DISTINCT p."principioActivoId", p."concentracion", p."forma"
      FROM "Producto" p JOIN "PrincipioActivo" pa ON pa.id = p."principioActivoId"
      WHERE p.activo AND ${todo ? Prisma.sql`TRUE` : Prisma.join(condiciones, ' AND ')}
      LIMIT ${todo ? 20000 : 20}`;
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
  async buscar(@Query('q') q = '') {
    const r = await this.catalogo.buscar(q.slice(0, 100));
    if (r.grupos.length || q.trim().length < 4) return r;
    // Nada encontrado: se intenta corregir la escritura y se dice qué se buscó.
    const corregido = await this.catalogo.corregir(q.slice(0, 100));
    return corregido ? { ...(await this.catalogo.buscar(corregido)), corregido } : r;
  }

  /** Principios marcados «Normal» cuyo nombre corresponde a un psicotrópico o antibiótico conocido. */
  @Get('principios/revisar-riesgo')
  @Roles('REGENTE', 'ADMIN')
  async revisarRiesgo() {
    const normales = await this.prisma.principioActivo.findMany({ where: { riesgo: 'NORMAL', productos: { some: { activo: true } } }, select: { id: true, nombre: true } });
    return normales.map((p) => ({ ...p, sugerido: riesgoSugerido(p.nombre) })).filter((p) => p.sugerido);
  }

  /** Catálogo completo para vender sin internet (la app lo guarda en el equipo cada pocos minutos). */
  @Get('sin-conexion')
  sinConexion() {
    return this.catalogo.buscar('', true);
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
      SELECT p.id, COALESCE(sum(l."stockLibre") FILTER (WHERE l.vence >= (now() AT TIME ZONE 'America/Caracas')::date), 0) AS stock,
        COALESCE((SELECT cl."costoUsd" / GREATEST(cl."factorVenta", 1) FROM "CompraLinea" cl JOIN "Compra" c ON c.id = cl."compraId"
          WHERE cl."productoId" = p.id AND cl."costoUsd" > 0 ORDER BY c."creadaEn" DESC LIMIT 1), p."costoRefUsd") AS costo
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
