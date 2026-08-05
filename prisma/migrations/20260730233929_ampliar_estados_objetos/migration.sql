-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoObjetoPerdido" ADD VALUE 'con_taxista';
ALTER TYPE "EstadoObjetoPerdido" ADD VALUE 'en_central';
ALTER TYPE "EstadoObjetoPerdido" ADD VALUE 'entregado_cliente';

-- DropForeignKey
ALTER TABLE "ObjetoPerdido" DROP CONSTRAINT "ObjetoPerdido_taxistaId_fkey";

-- AlterTable
ALTER TABLE "ObjetoPerdido" ADD COLUMN     "entregadoCentralEn" TIMESTAMP(3),
ADD COLUMN     "entregadoClienteEn" TIMESTAMP(3),
ALTER COLUMN "estado" SET DEFAULT 'con_taxista';

-- CreateIndex
CREATE INDEX "ObjetoPerdido_estado_creadoEn_idx" ON "ObjetoPerdido"("estado", "creadoEn");

-- AddForeignKey
ALTER TABLE "ObjetoPerdido" ADD CONSTRAINT "ObjetoPerdido_taxistaId_fkey" FOREIGN KEY ("taxistaId") REFERENCES "Taxista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
