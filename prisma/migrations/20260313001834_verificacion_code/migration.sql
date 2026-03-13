-- AlterTable
ALTER TABLE "Taxista" ADD COLUMN     "codigoVerificacion" TEXT,
ADD COLUMN     "codigoVerificacionExpiraEn" TIMESTAMP(3),
ADD COLUMN     "telefonoVerificado" BOOLEAN NOT NULL DEFAULT false;
