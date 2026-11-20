-- CreateEnum
CREATE TYPE "EstadoPedidoMayor" AS ENUM ('COTIZACION', 'PEDIDO', 'DESPACHADO', 'ENTREGADO', 'ANULADO');

-- AlterTable
ALTER TABLE "Compra" ADD COLUMN     "pagadoUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "venceEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CompraLinea" ADD COLUMN     "costoUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PagoProveedor" (
    "id" UUID NOT NULL,
    "compraId" UUID NOT NULL,
    "montoUsd" DECIMAL(12,2) NOT NULL,
    "metodo" TEXT NOT NULL,
    "referencia" TEXT,
    "usuarioId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteEmpresa" (
    "id" UUID NOT NULL,
    "rif" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "limiteUsd" DECIMAL(12,2) NOT NULL,
    "diasCredito" INTEGER NOT NULL DEFAULT 15,
    "descuentoPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoMayor" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "clienteId" UUID NOT NULL,
    "estado" "EstadoPedidoMayor" NOT NULL DEFAULT 'COTIZACION',
    "totalUsd" DECIMAL(12,2) NOT NULL,
    "pagadoUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "venceEn" TIMESTAMP(3),
    "creadoPorId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoMayor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoMayorLinea" (
    "id" UUID NOT NULL,
    "pedidoId" UUID NOT NULL,
    "productoId" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUsd" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PedidoMayorLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbonoMayor" (
    "id" UUID NOT NULL,
    "pedidoId" UUID NOT NULL,
    "montoUsd" DECIMAL(12,2) NOT NULL,
    "metodo" TEXT NOT NULL,
    "referencia" TEXT,
    "usuarioId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbonoMayor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajeWhatsapp" (
    "id" UUID NOT NULL,
    "cedula" TEXT NOT NULL,
    "productoId" UUID,
    "tipo" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeWhatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClienteEmpresa_rif_key" ON "ClienteEmpresa"("rif");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoMayor_numero_key" ON "PedidoMayor"("numero");

-- CreateIndex
CREATE INDEX "PedidoMayor_clienteId_estado_idx" ON "PedidoMayor"("clienteId", "estado");

-- CreateIndex
CREATE INDEX "MensajeWhatsapp_cedula_creadoEn_idx" ON "MensajeWhatsapp"("cedula", "creadoEn");

-- AddForeignKey
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoMayor" ADD CONSTRAINT "PedidoMayor_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteEmpresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoMayorLinea" ADD CONSTRAINT "PedidoMayorLinea_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoMayor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoMayor" ADD CONSTRAINT "AbonoMayor_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoMayor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
