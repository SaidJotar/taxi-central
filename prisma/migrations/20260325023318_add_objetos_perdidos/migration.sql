-- CreateEnum
CREATE TYPE "EstadoObjetoPerdido" AS ENUM ('pendiente', 'entregado');

-- CreateTable
CREATE TABLE "ObjetoPerdido" (
    "id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoObjetoPerdido" NOT NULL DEFAULT 'pendiente',
    "taxistaId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjetoPerdido_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ObjetoPerdido" ADD CONSTRAINT "ObjetoPerdido_taxistaId_fkey" FOREIGN KEY ("taxistaId") REFERENCES "Taxista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
