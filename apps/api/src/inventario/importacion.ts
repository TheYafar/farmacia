import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { filaImportacionSchema, riesgoSugerido, type FilaImportacion } from '@farmacia/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria';
import { EsperaService } from '../espera/espera';
import type { ReservaLista } from '../notificaciones/notificador';
import { normalizar } from '../common/texto';

export interface ErrorFila { fila: number; campo?: string; mensaje: string }
export interface Reporte {
  filas: number;
  productosNuevos: number;
  productosActualizados: number;
  preciosCambiados: number;
  principiosNuevos: number;
  lotes: number;
  errores: ErrorFila[];
  guardado: boolean;
  clientesAvisados?: number;
  /** Principios nuevos marcados como controlados porque la columna Riesgo venía vacía y la molécula es conocida. */
  controladosDeducidos: string[];
}

const claveProducto = (f: FilaImportacion) => [f.nombreComercial, f.laboratorio, f.concentracion, f.forma].map(normalizar).join('|');

/**
 * Carga del inventario desde Excel. Primero revisa todo el archivo y dice qué haría;
 * solo guarda si se pide confirmar y no hay errores. Todo o nada: si algo falla, no se guarda ninguna fila.
 */
@Injectable()
export class ImportacionService {
  constructor(private readonly prisma: PrismaService, private readonly espera: EsperaService, private readonly auditoria: AuditoriaService) {}

  async importar(entrada: unknown[], confirmar: boolean, usuarioId: string): Promise<Reporte> {
    const errores: ErrorFila[] = [];
    const filas: { n: number; f: FilaImportacion }[] = [];
    const vistos = new Map<string, number>();

    entrada.forEach((cruda, i) => {
      const n = i + 2; // fila 1 = títulos
      const r = filaImportacionSchema.safeParse(cruda);
      if (!r.success) {
        for (const e of r.error.issues) errores.push({ fila: n, campo: String(e.path[0] ?? ''), mensaje: e.message });
        return;
      }
      if (r.data.lote) {
        const k = `${r.data.codigoBarras ?? claveProducto(r.data)}|${normalizar(r.data.lote)}`;
        if (vistos.has(k)) errores.push({ fila: n, campo: 'lote', mensaje: `El mismo producto y lote ya está en la fila ${vistos.get(k)}` });
        vistos.set(k, n);
      }
      filas.push({ n, f: r.data });
    });

    // Comparar contra lo que ya existe.
    const productos = await this.prisma.producto.findMany({ include: { principioActivo: true } });
    const porCodigo = new Map(productos.filter((p) => p.codigoBarras).map((p) => [p.codigoBarras!, p]));
    const porClave = new Map(productos.map((p) => [[p.nombreComercial, p.laboratorio, p.concentracion, p.forma].map(normalizar).join('|'), p]));
    const principios = new Map((await this.prisma.principioActivo.findMany()).map((p) => [normalizar(p.nombre), p]));

    let productosNuevos = 0, productosActualizados = 0, preciosCambiados = 0, lotes = 0;
    const principiosNuevos = new Set<string>();
    const controladosDeducidos = new Set<string>();
    for (const { n, f } of filas) {
      if (!f.riesgo && !principios.has(normalizar(f.principioActivo))) {
        const r = riesgoSugerido(f.principioActivo);
        if (r) controladosDeducidos.add(`${f.principioActivo} (${r === 'PSICOTROPICO' ? 'psicotrópico' : 'antibiótico'})`);
      }
      const existente = (f.codigoBarras && porCodigo.get(f.codigoBarras)) || porClave.get(claveProducto(f));
      if (existente) {
        productosActualizados++;
        if (!existente.precioUsd.equals(new Prisma.Decimal(f.precioUsd))) preciosCambiados++;
        if (f.codigoBarras && existente.codigoBarras && existente.codigoBarras !== f.codigoBarras) {
          errores.push({ fila: n, campo: 'codigoBarras', mensaje: `Ese producto ya tiene el código ${existente.codigoBarras}` });
        }
      } else productosNuevos++;
      if (!principios.has(normalizar(f.principioActivo))) principiosNuevos.add(normalizar(f.principioActivo));
      if (f.lote) lotes++;
    }

    const reporte: Reporte = {
      filas: entrada.length, productosNuevos, productosActualizados, preciosCambiados,
      principiosNuevos: principiosNuevos.size, lotes, errores: errores.slice(0, 200), guardado: false, controladosDeducidos: [...controladosDeducidos],
    };
    if (!confirmar || errores.length) return reporte;

    let avisos: ReservaLista[] = [];
    await this.prisma.$transaction(async (tx) => {
      const idsPrincipio = new Map<string, string>();
      const conStock = new Set<string>();
      for (const { f } of filas) {
        const kp = normalizar(f.principioActivo);
        let paId = idsPrincipio.get(kp) ?? principios.get(kp)?.id;
        if (!paId) {
          paId = (await tx.principioActivo.create({ data: { nombre: f.principioActivo, riesgo: f.riesgo ?? riesgoSugerido(f.principioActivo) ?? 'NORMAL', familia: f.familia || null } })).id;
        }
        idsPrincipio.set(kp, paId);

        const datos = {
          nombreComercial: f.nombreComercial, laboratorio: f.laboratorio, principioActivoId: paId,
          concentracion: f.concentracion, forma: f.forma, unidadesPorCaja: f.unidadesPorCaja,
          precioUsd: f.precioUsd, nivel: f.nivel, requiereRecipe: f.requiereRecipe, activo: true,
          ...(f.ivaPct !== undefined && { ivaPct: f.ivaPct }), ...(f.categoria && { categoria: f.categoria }),
          ...(f.stockMinimo !== undefined && { stockMinimo: f.stockMinimo }), ...(f.costoUsd !== undefined && { costoRefUsd: f.costoUsd }),
        };
        const existente = (f.codigoBarras && porCodigo.get(f.codigoBarras)) || porClave.get(claveProducto(f));
        const producto = existente
          ? await tx.producto.update({ where: { id: existente.id }, data: { ...datos, codigoBarras: existente.codigoBarras ?? f.codigoBarras } })
          : await tx.producto.create({ data: { ...datos, codigoBarras: f.codigoBarras } });
        porClave.set(claveProducto(f), { ...producto, principioActivo: undefined } as never);
        if (f.codigoBarras) porCodigo.set(f.codigoBarras, producto as never);

        // La cantidad del Excel es el conteo real del lote: reemplaza la existencia libre (lo apartado se respeta).
        if (f.lote) {
          await tx.lote.upsert({
            where: { productoId_numero: { productoId: producto.id, numero: f.lote } },
            create: { productoId: producto.id, numero: f.lote, vence: f.vence!, stockLibre: f.cantidad! },
            update: { vence: f.vence!, stockLibre: f.cantidad! },
          });
          if (f.cantidad! > 0) conStock.add(producto.id);
        }
      }
      for (const productoId of conStock) avisos = avisos.concat(await this.espera.asignar(tx, productoId));
      await this.auditoria.registrar({
        usuarioId, accion: 'INVENTARIO_IMPORTADO', entidad: 'Producto',
        datos: { filas: filas.length, productosNuevos, productosActualizados, preciosCambiados, lotes },
      }, tx);
    }, { timeout: 120_000, maxWait: 10_000 });

    await this.espera.enviar(avisos);
    return { ...reporte, guardado: true, clientesAvisados: avisos.length };
  }
}
