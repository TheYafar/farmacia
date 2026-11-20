-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "stockMinimo" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "descuentoMotivo" TEXT,
ADD COLUMN     "descuentoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "descuentoUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VentaLinea" ADD COLUMN     "devuelto" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Devolucion" (
    "id" UUID NOT NULL,
    "ventaId" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "montoUsd" DECIMAL(12,2) NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "monto" DECIMAL(16,2) NOT NULL,
    "turnoId" UUID,
    "lineas" JSONB NOT NULL,
    "usuarioId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Devolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteInventario" (
    "id" UUID NOT NULL,
    "loteId" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "nota" TEXT,
    "usuarioId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AjusteInventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Devolucion_turnoId_idx" ON "Devolucion"("turnoId");

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
