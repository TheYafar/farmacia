-- Búsqueda sin importar acentos ("acetaminofen" encuentra "Acetaminofén").
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('CAJERO', 'REGENTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "CategoriaRiesgo" AS ENUM ('NORMAL', 'ANTIBIOTICO', 'PSICOTROPICO');

-- CreateEnum
CREATE TYPE "NivelPrecio" AS ENUM ('GENERICO', 'NACIONAL', 'MARCA');

-- CreateEnum
CREATE TYPE "EstadoRecipe" AS ENUM ('PENDIENTE', 'VALIDADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('PAGO_MOVIL', 'PUNTO_DE_VENTA', 'EFECTIVO_USD', 'EFECTIVO_BS');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('COMPLETADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoEspera" AS ENUM ('EN_ESPERA', 'NOTIFICADO', 'PAGADO_CUSTODIA', 'ENTREGADO', 'EXPIRADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "claveHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "revocadaEn" TIMESTAMP(3),
    "ip" TEXT,
    "agente" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrincipioActivo" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "familia" TEXT,
    "riesgo" "CategoriaRiesgo" NOT NULL DEFAULT 'NORMAL',
    "uso" TEXT,

    CONSTRAINT "PrincipioActivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParLasa" (
    "aId" UUID NOT NULL,
    "bId" UUID NOT NULL,
    "nota" TEXT,

    CONSTRAINT "ParLasa_pkey" PRIMARY KEY ("aId","bId")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" UUID NOT NULL,
    "codigoBarras" TEXT,
    "nombreComercial" TEXT NOT NULL,
    "laboratorio" TEXT NOT NULL,
    "principioActivoId" UUID NOT NULL,
    "concentracion" TEXT NOT NULL,
    "forma" TEXT NOT NULL,
    "unidadesPorCaja" INTEGER NOT NULL,
    "precioUsd" DECIMAL(12,2) NOT NULL,
    "nivel" "NivelPrecio" NOT NULL,
    "requiereRecipe" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lote" (
    "id" UUID NOT NULL,
    "productoId" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "vence" DATE NOT NULL,
    "stockLibre" INTEGER NOT NULL,
    "stockReservado" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" UUID NOT NULL,
    "proveedor" TEXT NOT NULL,
    "numeroFactura" TEXT NOT NULL,
    "creadaPorId" UUID NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraLinea" (
    "id" UUID NOT NULL,
    "compraId" UUID NOT NULL,
    "productoId" UUID NOT NULL,
    "numeroLote" TEXT NOT NULL,
    "vence" DATE NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "factorVenta" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CompraLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paciente" (
    "cedula" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "alergias" TEXT[],
    "condiciones" TEXT[],
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Paciente_pkey" PRIMARY KEY ("cedula")
);

-- CreateTable
CREATE TABLE "Medico" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "especialidad" TEXT NOT NULL,
    "mpps" TEXT,

    CONSTRAINT "Medico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" UUID NOT NULL,
    "cedula" TEXT,
    "medicoId" UUID,
    "archivo" TEXT NOT NULL,
    "tipoArchivo" TEXT NOT NULL,
    "lecturaIa" JSONB,
    "estado" "EstadoRecipe" NOT NULL DEFAULT 'PENDIENTE',
    "confirmados" JSONB,
    "nota" TEXT,
    "creadoPorId" UUID NOT NULL,
    "validadoPorId" UUID,
    "validadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Autorizacion" (
    "id" UUID NOT NULL,
    "cedula" TEXT NOT NULL,
    "productoId" UUID NOT NULL,
    "regenteId" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "usadaEn" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Autorizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "cajeroId" UUID NOT NULL,
    "cedula" TEXT,
    "totalUsd" DECIMAL(12,2) NOT NULL,
    "tasa" DECIMAL(14,4) NOT NULL,
    "totalBs" DECIMAL(16,2) NOT NULL,
    "metodoPago" "MetodoPago" NOT NULL,
    "referenciaPago" TEXT,
    "estado" "EstadoVenta" NOT NULL DEFAULT 'COMPLETADA',
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaLinea" (
    "id" UUID NOT NULL,
    "ventaId" UUID NOT NULL,
    "productoId" UUID NOT NULL,
    "loteId" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUsd" DECIMAL(12,2) NOT NULL,
    "autorizacionId" UUID,
    "recipeId" UUID,

    CONSTRAINT "VentaLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudEspera" (
    "id" UUID NOT NULL,
    "cedula" TEXT NOT NULL,
    "productoId" UUID NOT NULL,
    "estado" "EstadoEspera" NOT NULL DEFAULT 'EN_ESPERA',
    "solicitadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notificadaEn" TIMESTAMP(3),
    "venceReserva" TIMESTAMP(3),
    "loteId" UUID,
    "referenciaPagoMovil" TEXT,
    "gaveta" TEXT,
    "ventaId" UUID,
    "cerradaEn" TIMESTAMP(3),

    CONSTRAINT "SolicitudEspera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TasaCambio" (
    "id" UUID NOT NULL,
    "valor" DECIMAL(14,4) NOT NULL,
    "fuente" TEXT NOT NULL DEFAULT 'BCV',
    "creadaPorId" UUID NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TasaCambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" UUID NOT NULL,
    "usuarioId" UUID,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "datos" JSONB,
    "ip" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");

-- CreateIndex
CREATE INDEX "Sesion_usuarioId_idx" ON "Sesion"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "PrincipioActivo_nombre_key" ON "PrincipioActivo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_codigoBarras_key" ON "Producto"("codigoBarras");

-- CreateIndex
CREATE INDEX "Producto_principioActivoId_concentracion_forma_idx" ON "Producto"("principioActivoId", "concentracion", "forma");

-- CreateIndex
CREATE INDEX "Lote_productoId_vence_idx" ON "Lote"("productoId", "vence");

-- CreateIndex
CREATE UNIQUE INDEX "Lote_productoId_numero_key" ON "Lote"("productoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Compra_proveedor_numeroFactura_key" ON "Compra"("proveedor", "numeroFactura");

-- CreateIndex
CREATE UNIQUE INDEX "Medico_mpps_key" ON "Medico"("mpps");

-- CreateIndex
CREATE INDEX "Recipe_estado_creadoEn_idx" ON "Recipe"("estado", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_numero_key" ON "Venta"("numero");

-- CreateIndex
CREATE INDEX "Venta_creadaEn_idx" ON "Venta"("creadaEn");

-- CreateIndex
CREATE INDEX "SolicitudEspera_productoId_estado_solicitadaEn_idx" ON "SolicitudEspera"("productoId", "estado", "solicitadaEn");

-- CreateIndex
CREATE INDEX "TasaCambio_creadaEn_idx" ON "TasaCambio"("creadaEn");

-- CreateIndex
CREATE INDEX "Auditoria_entidad_entidadId_idx" ON "Auditoria"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "Auditoria_creadaEn_idx" ON "Auditoria"("creadaEn");

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParLasa" ADD CONSTRAINT "ParLasa_aId_fkey" FOREIGN KEY ("aId") REFERENCES "PrincipioActivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParLasa" ADD CONSTRAINT "ParLasa_bId_fkey" FOREIGN KEY ("bId") REFERENCES "PrincipioActivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_principioActivoId_fkey" FOREIGN KEY ("principioActivoId") REFERENCES "PrincipioActivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraLinea" ADD CONSTRAINT "CompraLinea_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraLinea" ADD CONSTRAINT "CompraLinea_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_cedula_fkey" FOREIGN KEY ("cedula") REFERENCES "Paciente"("cedula") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_validadoPorId_fkey" FOREIGN KEY ("validadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autorizacion" ADD CONSTRAINT "Autorizacion_cedula_fkey" FOREIGN KEY ("cedula") REFERENCES "Paciente"("cedula") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autorizacion" ADD CONSTRAINT "Autorizacion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autorizacion" ADD CONSTRAINT "Autorizacion_regenteId_fkey" FOREIGN KEY ("regenteId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_cajeroId_fkey" FOREIGN KEY ("cajeroId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_cedula_fkey" FOREIGN KEY ("cedula") REFERENCES "Paciente"("cedula") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaLinea" ADD CONSTRAINT "VentaLinea_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaLinea" ADD CONSTRAINT "VentaLinea_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaLinea" ADD CONSTRAINT "VentaLinea_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaLinea" ADD CONSTRAINT "VentaLinea_autorizacionId_fkey" FOREIGN KEY ("autorizacionId") REFERENCES "Autorizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaLinea" ADD CONSTRAINT "VentaLinea_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudEspera" ADD CONSTRAINT "SolicitudEspera_cedula_fkey" FOREIGN KEY ("cedula") REFERENCES "Paciente"("cedula") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudEspera" ADD CONSTRAINT "SolicitudEspera_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudEspera" ADD CONSTRAINT "SolicitudEspera_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudEspera" ADD CONSTRAINT "SolicitudEspera_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TasaCambio" ADD CONSTRAINT "TasaCambio_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- Protecciones a nivel de base de datos ----------

-- El stock nunca puede quedar negativo, aunque falle una validación en el código.
ALTER TABLE "Lote" ADD CONSTRAINT "lote_stock_no_negativo" CHECK ("stockLibre" >= 0 AND "stockReservado" >= 0);
ALTER TABLE "VentaLinea" ADD CONSTRAINT "venta_linea_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "Producto" ADD CONSTRAINT "producto_precio_positivo" CHECK ("precioUsd" > 0 AND "unidadesPorCaja" > 0);
ALTER TABLE "TasaCambio" ADD CONSTRAINT "tasa_positiva" CHECK ("valor" > 0);

-- La auditoría solo se agrega: no se puede editar ni borrar.
CREATE OR REPLACE FUNCTION auditoria_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría no se puede modificar ni borrar';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditoria_sin_cambios
  BEFORE UPDATE OR DELETE ON "Auditoria"
  FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();
