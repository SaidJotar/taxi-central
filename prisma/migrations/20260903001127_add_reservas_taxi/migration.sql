-- CreateEnum
CREATE TYPE "TipoReserva" AS ENUM ('normal', 'especial');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('pendiente', 'aceptada', 'cancelada', 'en_servicio', 'completada');

-- CreateEnum
CREATE TYPE "TipoReservaEspecial" AS ENUM ('aeropuerto_tanger', 'aeropuerto_tetuan', 'boda_evento', 'otro');

-- CreateTable
CREATE TABLE "ReservaTaxi" (
    "id" TEXT NOT NULL,
    "tipo" "TipoReserva" NOT NULL DEFAULT 'normal',
    "tipoEspecial" "TipoReservaEspecial",
    "telefonoCliente" TEXT NOT NULL,
    "latRecogida" DOUBLE PRECISION,
    "lngRecogida" DOUBLE PRECISION,
    "direccionRecogida" TEXT NOT NULL,
    "direccionBase" TEXT,
    "referenciaRecogida" TEXT,
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "precioFinal" DOUBLE PRECISION,
    "precioAConvenir" BOOLEAN NOT NULL DEFAULT false,
    "detallesEspeciales" TEXT,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'pendiente',
    "taxistaId" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aceptadaEn" TIMESTAMP(3),
    "canceladaEn" TIMESTAMP(3),
    "completadaEn" TIMESTAMP(3),

    CONSTRAINT "ReservaTaxi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservaTaxi_estado_fechaHora_idx" ON "ReservaTaxi"("estado", "fechaHora");

-- CreateIndex
CREATE INDEX "ReservaTaxi_taxistaId_estado_idx" ON "ReservaTaxi"("taxistaId", "estado");

-- CreateIndex
CREATE INDEX "ReservaTaxi_telefonoCliente_fechaHora_idx" ON "ReservaTaxi"("telefonoCliente", "fechaHora");

-- AddForeignKey
ALTER TABLE "ReservaTaxi" ADD CONSTRAINT "ReservaTaxi_taxistaId_fkey" FOREIGN KEY ("taxistaId") REFERENCES "Taxista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
