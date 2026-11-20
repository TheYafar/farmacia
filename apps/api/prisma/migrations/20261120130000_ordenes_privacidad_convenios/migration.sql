-- CreateEnum
CREATE TYPE "EstadoOrdenCompra" AS ENUM ('ABIERTA', 'RECIBIDA', 'ANULADA');

-- AlterTable
ALTER TABLE "Compra" ADD COLUMN     "anulada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "devueltoUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "recipeRetencionDias" INTEGER NOT NULL DEFAULT 730;

-- AlterTable
ALTER TABLE "Paciente" ADD COLUMN     "consentimientoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PedidoMayor" ADD COLUMN     "empleado" TEXT,
ADD COLUMN     "validaHasta" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "fotoBorradaEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrdenCompra" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "proveedor" TEXT NOT NULL,
    "estado" "EstadoOrdenCompra" NOT NULL DEFAULT 'ABIERTA',
    "compraId" UUID,
    "creadoPorId" UUID NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdenCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompraLinea" (
    "id" UUID NOT NULL,
    "ordenId" UUID NOT NULL,
    "productoId" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "recibido" INTEGER,

    CONSTRAINT "OrdenCompraLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevolucionProveedor" (
    "id" UUID NOT NULL,
    "compraId" UUID NOT NULL,
    "loteId" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "montoUsd" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevolucionProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCompra_numero_key" ON "OrdenCompra"("numero");

-- AddForeignKey
ALTER TABLE "OrdenCompraLinea" ADD CONSTRAINT "OrdenCompraLinea_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

