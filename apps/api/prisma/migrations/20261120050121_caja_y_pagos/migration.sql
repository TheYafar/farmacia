-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('USD', 'BS');

-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('ABIERTO', 'CERRADO');

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "turnoId" UUID,
ADD COLUMN     "vueltoMoneda" "Moneda",
ADD COLUMN     "vueltoMonto" DECIMAL(16,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Pago" (
    "id" UUID NOT NULL,
    "ventaId" UUID NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "monto" DECIMAL(16,2) NOT NULL,
    "montoUsd" DECIMAL(12,2) NOT NULL,
    "referencia" TEXT,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turno" (
    "id" UUID NOT NULL,
    "cajeroId" UUID NOT NULL,
    "estado" "EstadoTurno" NOT NULL DEFAULT 'ABIERTO',
    "fondoUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fondoBs" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradoEn" TIMESTAMP(3),
    "esperado" JSONB,
    "contado" JSONB,
    "diferencia" JSONB,
    "nota" TEXT,
    "revisadoPorId" UUID,
    "revisadoEn" TIMESTAMP(3),

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Turno_cajeroId_estado_idx" ON "Turno"("cajeroId", "estado");

-- CreateIndex
CREATE INDEX "Turno_abiertoEn_idx" ON "Turno"("abiertoEn");

-- CreateIndex
CREATE INDEX "Venta_turnoId_idx" ON "Venta"("turnoId");

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un cajero solo puede tener una caja abierta a la vez.
CREATE UNIQUE INDEX "turno_un_abierto_por_cajero" ON "Turno"("cajeroId") WHERE "estado" = 'ABIERTO';
ALTER TABLE "Pago" ADD CONSTRAINT "pago_monto_positivo" CHECK ("monto" > 0 AND "montoUsd" >= 0);
ALTER TABLE "Turno" ADD CONSTRAINT "turno_fondo_no_negativo" CHECK ("fondoUsd" >= 0 AND "fondoBs" >= 0);

-- Las ventas anteriores quedan con un pago igual a su total, en su método.
INSERT INTO "Pago" ("id", "ventaId", "metodo", "moneda", "monto", "montoUsd", "referencia")
SELECT gen_random_uuid(), v."id", v."metodoPago",
       CASE WHEN v."metodoPago" = 'EFECTIVO_USD' THEN 'USD'::"Moneda" ELSE 'BS'::"Moneda" END,
       CASE WHEN v."metodoPago" = 'EFECTIVO_USD' THEN v."totalUsd" ELSE v."totalBs" END,
       v."totalUsd", v."referenciaPago"
FROM "Venta" v WHERE v."totalUsd" > 0;
