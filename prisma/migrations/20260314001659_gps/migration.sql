/*
  Warnings:

  - You are about to drop the column `latitudRecogida` on the `SolicitudViaje` table. All the data in the column will be lost.
  - You are about to drop the column `longitudRecogida` on the `SolicitudViaje` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SolicitudViaje" DROP COLUMN "latitudRecogida",
DROP COLUMN "longitudRecogida",
ADD COLUMN     "latRecogida" DOUBLE PRECISION,
ADD COLUMN     "lngRecogida" DOUBLE PRECISION,
ADD COLUMN     "paradaSugeridaId" TEXT,
ALTER COLUMN "estado" DROP DEFAULT,
ALTER COLUMN "origen" DROP NOT NULL,
ALTER COLUMN "origen" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Taxista" ADD COLUMN     "enParadaDesde" TIMESTAMP(3),
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "paradaId" TEXT,
ADD COLUMN     "ubicacionActualizadaEn" TIMESTAMP(3),
ALTER COLUMN "estado" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Parada" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Parada_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Taxista" ADD CONSTRAINT "Taxista_paradaId_fkey" FOREIGN KEY ("paradaId") REFERENCES "Parada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudViaje" ADD CONSTRAINT "SolicitudViaje_paradaSugeridaId_fkey" FOREIGN KEY ("paradaSugeridaId") REFERENCES "Parada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
