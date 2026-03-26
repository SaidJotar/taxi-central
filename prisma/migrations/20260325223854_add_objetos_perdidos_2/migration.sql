/*
  Warnings:

  - You are about to drop the column `fecha` on the `ObjetoPerdido` table. All the data in the column will be lost.
  - Made the column `taxistaId` on table `ObjetoPerdido` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ObjetoPerdido" DROP CONSTRAINT "ObjetoPerdido_taxistaId_fkey";

-- AlterTable
ALTER TABLE "ObjetoPerdido" DROP COLUMN "fecha",
ADD COLUMN     "fechaHallazgo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "observaciones" TEXT,
ALTER COLUMN "taxistaId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ObjetoPerdido" ADD CONSTRAINT "ObjetoPerdido_taxistaId_fkey" FOREIGN KEY ("taxistaId") REFERENCES "Taxista"("id") ON DELETE CASCADE ON UPDATE CASCADE;
