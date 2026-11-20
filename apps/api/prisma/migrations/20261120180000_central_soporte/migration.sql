-- CreateEnum
CREATE TYPE "EstadoTicket" AS ENUM ('ABIERTO', 'RESPONDIDO', 'CERRADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Rol" ADD VALUE 'SUPERADMIN';
ALTER TYPE "Rol" ADD VALUE 'SOPORTE';

-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "centralClave" TEXT,
ADD COLUMN     "centralError" TEXT,
ADD COLUMN     "centralTelefono" TEXT,
ADD COLUMN     "centralUltimo" TIMESTAMP(3),
ADD COLUMN     "centralUrl" TEXT;

-- AlterTable
ALTER TABLE "Sesion" ADD COLUMN     "limite" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "sistema" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FarmaciaRegistrada" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "rif" TEXT,
    "contacto" TEXT,
    "telefono" TEXT,
    "url" TEXT,
    "notas" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "claveHash" TEXT NOT NULL,
    "ultimoReporte" TIMESTAMP(3),
    "version" TEXT,
    "estado" JSONB,
    "accesoToken" TEXT,
    "accesoVence" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmaciaRegistrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSoporte" (
    "id" UUID NOT NULL,
    "farmaciaId" UUID NOT NULL,
    "asunto" TEXT NOT NULL,
    "estado" "EstadoTicket" NOT NULL DEFAULT 'ABIERTO',
    "diagnostico" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketSoporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajeSoporte" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "de" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeSoporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccesoSoporte" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "vence" TIMESTAMP(3) NOT NULL,
    "creadoPor" UUID NOT NULL,
    "revocadoEn" TIMESTAMP(3),
    "usos" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccesoSoporte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FarmaciaRegistrada_claveHash_key" ON "FarmaciaRegistrada"("claveHash");

-- CreateIndex
CREATE INDEX "TicketSoporte_farmaciaId_actualizado_idx" ON "TicketSoporte"("farmaciaId", "actualizado");

-- CreateIndex
CREATE INDEX "MensajeSoporte_ticketId_creadoEn_idx" ON "MensajeSoporte"("ticketId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "AccesoSoporte_tokenHash_key" ON "AccesoSoporte"("tokenHash");

-- AddForeignKey
ALTER TABLE "TicketSoporte" ADD CONSTRAINT "TicketSoporte_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "FarmaciaRegistrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeSoporte" ADD CONSTRAINT "MensajeSoporte_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "TicketSoporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

