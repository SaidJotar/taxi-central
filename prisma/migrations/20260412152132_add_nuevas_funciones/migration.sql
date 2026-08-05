-- CreateEnum
CREATE TYPE "TipoEmisorMensaje" AS ENUM ('cliente', 'taxista');

-- AlterTable
ALTER TABLE "SolicitudViaje" ADD COLUMN     "comentarioRating" TEXT,
ADD COLUMN     "completadaEn" TIMESTAMP(3),
ADD COLUMN     "costoFinal" DOUBLE PRECISION,
ADD COLUMN     "distanciaMetrosEst" INTEGER,
ADD COLUMN     "duracionMinutos" INTEGER,
ADD COLUMN     "ratingCliente" INTEGER,
ADD COLUMN     "recogidaIniciadaEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MensajeSolicitud" (
    "id" TEXT NOT NULL,
    "solicitudViajeId" TEXT NOT NULL,
    "emisorTipo" "TipoEmisorMensaje" NOT NULL,
    "emisorTaxistaId" TEXT,
    "texto" TEXT NOT NULL,
    "leido" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeSolicitud_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MensajeSolicitud_solicitudViajeId_creadoEn_idx" ON "MensajeSolicitud"("solicitudViajeId", "creadoEn");

-- CreateIndex
CREATE INDEX "MensajeSolicitud_emisorTaxistaId_idx" ON "MensajeSolicitud"("emisorTaxistaId");

-- CreateIndex
CREATE INDEX "AsignacionSolicitud_taxistaId_idx" ON "AsignacionSolicitud"("taxistaId");

-- CreateIndex
CREATE INDEX "AsignacionSolicitud_vehiculoId_idx" ON "AsignacionSolicitud"("vehiculoId");

-- CreateIndex
CREATE INDEX "ObjetoPerdido_taxistaId_estado_idx" ON "ObjetoPerdido"("taxistaId", "estado");

-- CreateIndex
CREATE INDEX "OfertaSolicitud_solicitudViajeId_estado_idx" ON "OfertaSolicitud"("solicitudViajeId", "estado");

-- CreateIndex
CREATE INDEX "OfertaSolicitud_taxistaId_estado_idx" ON "OfertaSolicitud"("taxistaId", "estado");

-- CreateIndex
CREATE INDEX "SolicitudViaje_estado_idx" ON "SolicitudViaje"("estado");

-- CreateIndex
CREATE INDEX "SolicitudViaje_creadaEn_idx" ON "SolicitudViaje"("creadaEn");

-- CreateIndex
CREATE INDEX "SolicitudViaje_paradaSugeridaId_idx" ON "SolicitudViaje"("paradaSugeridaId");

-- AddForeignKey
ALTER TABLE "MensajeSolicitud" ADD CONSTRAINT "MensajeSolicitud_solicitudViajeId_fkey" FOREIGN KEY ("solicitudViajeId") REFERENCES "SolicitudViaje"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeSolicitud" ADD CONSTRAINT "MensajeSolicitud_emisorTaxistaId_fkey" FOREIGN KEY ("emisorTaxistaId") REFERENCES "Taxista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
