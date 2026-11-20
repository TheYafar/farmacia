-- AlterTable
ALTER TABLE "Turno" ADD COLUMN     "cajaId" UUID;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "correo" TEXT;

-- CreateTable
CREATE TABLE "Caja" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadaPorId" UUID,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigoHash" TEXT,
    "codigoVence" TIMESTAMP(3),

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CajaEquipo" (
    "id" UUID NOT NULL,
    "cajaId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "agente" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quitadoEn" TIMESTAMP(3),

    CONSTRAINT "CajaEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Caja_codigoHash_key" ON "Caja"("codigoHash");

-- CreateIndex
CREATE UNIQUE INDEX "CajaEquipo_tokenHash_key" ON "CajaEquipo"("tokenHash");

-- CreateIndex
CREATE INDEX "CajaEquipo_cajaId_idx" ON "CajaEquipo"("cajaId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correo_key" ON "Usuario"("correo");

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CajaEquipo" ADD CONSTRAINT "CajaEquipo_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

