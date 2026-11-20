-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "bcvConsultado" TIMESTAMP(3),
ADD COLUMN     "bcvEur" DECIMAL(14,4),
ADD COLUMN     "bcvFecha" TIMESTAMP(3),
ADD COLUMN     "bcvOrigen" TEXT,
ADD COLUMN     "bcvUsd" DECIMAL(14,4),
ADD COLUMN     "farmaciaDireccion" TEXT,
ADD COLUMN     "farmaciaNombre" TEXT,
ADD COLUMN     "farmaciaRif" TEXT,
ADD COLUMN     "farmaciaTelefono" TEXT,
ADD COLUMN     "tasaAjusteTipo" TEXT NOT NULL DEFAULT 'NINGUNO',
ADD COLUMN     "tasaAjusteValor" DECIMAL(10,4) NOT NULL DEFAULT 0,
ADD COLUMN     "tasaModo" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "ticketAncho" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "ticketAuto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ticketCopias" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "ticketLetra" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "ticketMostrarBs" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ticketMostrarTasa" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ticketPie" TEXT;

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "tasaFuente" TEXT;

