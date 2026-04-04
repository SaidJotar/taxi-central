/*
  Warnings:

  - You are about to drop the column `color` on the `Vehiculo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Vehiculo" DROP COLUMN "color",
ADD COLUMN     "marca" TEXT;
