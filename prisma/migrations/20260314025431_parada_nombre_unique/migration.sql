/*
  Warnings:

  - A unique constraint covering the columns `[nombre]` on the table `Parada` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Parada_nombre_key" ON "Parada"("nombre");
