/*
  Warnings:

  - You are about to drop the `EventoSolicitud` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SesionTaxista` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UbicacionTaxista` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "EventoSolicitud" DROP CONSTRAINT "EventoSolicitud_solicitudViajeId_fkey";

-- DropForeignKey
ALTER TABLE "SesionTaxista" DROP CONSTRAINT "SesionTaxista_taxistaId_fkey";

-- DropForeignKey
ALTER TABLE "UbicacionTaxista" DROP CONSTRAINT "UbicacionTaxista_taxistaId_fkey";

-- DropTable
DROP TABLE "EventoSolicitud";

-- DropTable
DROP TABLE "SesionTaxista";

-- DropTable
DROP TABLE "UbicacionTaxista";
