-- AlterEnum
ALTER TYPE "EstadoEspera" ADD VALUE 'CANCELADO';

-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "redondeoBs" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "costoRefUsd" DECIMAL(12,4);

