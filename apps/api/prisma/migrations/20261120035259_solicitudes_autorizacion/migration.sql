-- CreateEnum
CREATE TYPE "EstadoAutorizacion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- DropForeignKey
ALTER TABLE "Autorizacion" DROP CONSTRAINT "Autorizacion_regenteId_fkey";

-- AlterTable
ALTER TABLE "Autorizacion" ADD COLUMN     "estado" "EstadoAutorizacion" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "razon" TEXT,
ADD COLUMN     "respondidaEn" TIMESTAMP(3),
ADD COLUMN     "solicitadaPorId" UUID,
ALTER COLUMN "regenteId" DROP NOT NULL,
ALTER COLUMN "motivo" DROP NOT NULL,
ALTER COLUMN "expira" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Autorizacion_estado_creadaEn_idx" ON "Autorizacion"("estado", "creadaEn");

-- CreateIndex
CREATE INDEX "Autorizacion_cedula_productoId_estado_idx" ON "Autorizacion"("cedula", "productoId", "estado");

-- AddForeignKey
ALTER TABLE "Autorizacion" ADD CONSTRAINT "Autorizacion_solicitadaPorId_fkey" FOREIGN KEY ("solicitadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autorizacion" ADD CONSTRAINT "Autorizacion_regenteId_fkey" FOREIGN KEY ("regenteId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los permisos dados antes de este cambio ya estaban aprobados.
UPDATE "Autorizacion" SET "estado" = 'APROBADA', "respondidaEn" = "creadaEn" WHERE "regenteId" IS NOT NULL;
