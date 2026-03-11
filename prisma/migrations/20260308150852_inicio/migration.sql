-- CreateEnum
CREATE TYPE "EstadoTaxista" AS ENUM ('desc', 'disponible', 'ocupado');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('pendiente', 'ofertada', 'asignada', 'sin_taxista', 'cancelada', 'completada');

-- CreateEnum
CREATE TYPE "EstadoOferta" AS ENUM ('pendiente', 'aceptada', 'rechazada', 'expirada');

-- CreateEnum
CREATE TYPE "OrigenSolicitud" AS ENUM ('llamada_ia', 'operador', 'web');

-- CreateTable
CREATE TABLE "Taxista" (
    "id" TEXT NOT NULL,
    "nombreCompleto" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "estado" "EstadoTaxista" NOT NULL DEFAULT 'desc',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Taxista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehiculo" (
    "id" TEXT NOT NULL,
    "taxistaId" TEXT NOT NULL,
    "numeroTaxi" TEXT NOT NULL,
    "matricula" TEXT,
    "modelo" TEXT,
    "color" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionTaxista" (
    "id" TEXT NOT NULL,
    "taxistaId" TEXT NOT NULL,
    "socketId" TEXT,
    "conectado" BOOLEAN NOT NULL DEFAULT false,
    "ultimoAccesoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionTaxista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UbicacionTaxista" (
    "id" BIGSERIAL NOT NULL,
    "taxistaId" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "rumbo" DOUBLE PRECISION,
    "velocidad" DOUBLE PRECISION,
    "registradaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UbicacionTaxista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudViaje" (
    "id" TEXT NOT NULL,
    "nombreCliente" TEXT NOT NULL,
    "telefonoCliente" TEXT NOT NULL,
    "direccionRecogida" TEXT NOT NULL,
    "latitudRecogida" DOUBLE PRECISION,
    "longitudRecogida" DOUBLE PRECISION,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'pendiente',
    "origen" "OrigenSolicitud" NOT NULL DEFAULT 'llamada_ia',
    "confirmadaEn" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitudViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfertaSolicitud" (
    "id" TEXT NOT NULL,
    "solicitudViajeId" TEXT NOT NULL,
    "taxistaId" TEXT NOT NULL,
    "estado" "EstadoOferta" NOT NULL DEFAULT 'pendiente',
    "ofrecidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidaEn" TIMESTAMP(3),

    CONSTRAINT "OfertaSolicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionSolicitud" (
    "id" TEXT NOT NULL,
    "solicitudViajeId" TEXT NOT NULL,
    "taxistaId" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "asignadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsignacionSolicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoSolicitud" (
    "id" BIGSERIAL NOT NULL,
    "solicitudViajeId" TEXT NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "payload" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoSolicitud_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Taxista_telefono_key" ON "Taxista"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "Vehiculo_taxistaId_key" ON "Vehiculo"("taxistaId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehiculo_numeroTaxi_key" ON "Vehiculo"("numeroTaxi");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionSolicitud_solicitudViajeId_key" ON "AsignacionSolicitud"("solicitudViajeId");

-- AddForeignKey
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_taxistaId_fkey" FOREIGN KEY ("taxistaId") REFERENCES "Taxista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionTaxista" ADD CONSTRAINT "SesionTaxista_taxistaId_fkey" FOREIGN KEY ("taxistaId") REFERENCES "Taxista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UbicacionTaxista" ADD CONSTRAINT "UbicacionTaxista_taxistaId_fkey" FOREIGN KEY ("taxistaId") REFERENCES "Taxista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfertaSolicitud" ADD CONSTRAINT "OfertaSolicitud_solicitudViajeId_fkey" FOREIGN KEY ("solicitudViajeId") REFERENCES "SolicitudViaje"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfertaSolicitud" ADD CONSTRAINT "OfertaSolicitud_taxistaId_fkey" FOREIGN KEY ("taxistaId") REFERENCES "Taxista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionSolicitud" ADD CONSTRAINT "AsignacionSolicitud_solicitudViajeId_fkey" FOREIGN KEY ("solicitudViajeId") REFERENCES "SolicitudViaje"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionSolicitud" ADD CONSTRAINT "AsignacionSolicitud_taxistaId_fkey" FOREIGN KEY ("taxistaId") REFERENCES "Taxista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionSolicitud" ADD CONSTRAINT "AsignacionSolicitud_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoSolicitud" ADD CONSTRAINT "EventoSolicitud_solicitudViajeId_fkey" FOREIGN KEY ("solicitudViajeId") REFERENCES "SolicitudViaje"("id") ON DELETE CASCADE ON UPDATE CASCADE;
