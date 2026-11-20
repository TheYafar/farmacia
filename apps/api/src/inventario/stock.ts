import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface LoteBloqueado { id: string; stockLibre: number; vence: Date }

/**
 * Bloquea (FOR UPDATE) los lotes vendibles de un producto, del que vence antes al que vence después (FEFO).
 * Mientras dure la transacción, ninguna otra caja puede tocar esos lotes: así no se vende dos veces la última caja.
 * Los lotes vencidos nunca se venden.
 */
export function bloquearLotes(tx: Tx, productoId: string) {
  return tx.$queryRaw<LoteBloqueado[]>`
    SELECT id, "stockLibre", vence FROM "Lote"
    WHERE "productoId" = ${productoId}::uuid AND vence >= current_date AND "stockLibre" > 0
    ORDER BY vence ASC, "creadoEn" ASC
    FOR UPDATE`;
}

/** Descuenta `cantidad` del stock libre siguiendo FEFO. Devuelve de qué lote salió cada parte. */
export async function descontarFefo(tx: Tx, productoId: string, cantidad: number, nombre: string) {
  const lotes = await bloquearLotes(tx, productoId);
  const disponible = lotes.reduce((a, l) => a + l.stockLibre, 0);
  if (disponible < cantidad) {
    throw new ConflictException(`No hay suficiente ${nombre}: quedan ${disponible}`);
  }
  const partes: { loteId: string; cantidad: number }[] = [];
  let falta = cantidad;
  for (const l of lotes) {
    if (!falta) break;
    const toma = Math.min(falta, l.stockLibre);
    await tx.lote.update({ where: { id: l.id }, data: { stockLibre: { decrement: toma } } });
    partes.push({ loteId: l.id, cantidad: toma });
    falta -= toma;
  }
  return partes;
}
