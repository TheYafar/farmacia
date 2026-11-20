-- AlterTable
ALTER TABLE "PedidoMayor" ADD COLUMN     "despachadoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PedidoMayorLinea" ADD COLUMN     "lotes" JSONB;
