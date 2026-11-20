-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "plan" JSONB;

-- AlterTable
ALTER TABLE "FarmaciaRegistrada" ADD COLUMN     "planId" UUID;

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precioUsd" DECIMAL(10,2) NOT NULL,
    "modulos" TEXT[],
    "maxCajas" INTEGER NOT NULL DEFAULT 0,
    "maxUsuarios" INTEGER NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_clave_key" ON "Plan"("clave");

-- AddForeignKey
ALTER TABLE "FarmaciaRegistrada" ADD CONSTRAINT "FarmaciaRegistrada_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

