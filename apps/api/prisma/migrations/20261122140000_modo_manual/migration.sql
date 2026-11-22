-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "encargosAuto" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reservaHoras" INTEGER NOT NULL DEFAULT 3;
-- CreateTable
CREATE TABLE "LibroManual" (
    "id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" TEXT NOT NULL,
    "productoId" UUID,
    "producto" TEXT NOT NULL,
    "lote" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "paciente" TEXT NOT NULL,
    "medico" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibroManual_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "LibroManual_fecha_idx" ON "LibroManual"("fecha");
