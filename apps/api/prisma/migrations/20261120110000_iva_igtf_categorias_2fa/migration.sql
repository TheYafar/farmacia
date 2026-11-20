-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "categoria" TEXT NOT NULL DEFAULT 'Medicamentos',
ADD COLUMN     "ivaPct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "totpActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpSecreto" TEXT;

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "clave" TEXT,
ADD COLUMN     "igtfUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ivaUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "igtfActivo" BOOLEAN NOT NULL DEFAULT false,
    "igtfPct" DECIMAL(5,2) NOT NULL DEFAULT 3,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venta_clave_key" ON "Venta"("clave");

