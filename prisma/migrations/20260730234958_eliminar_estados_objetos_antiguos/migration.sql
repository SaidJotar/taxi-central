/*
  Warnings:

  - The values [pendiente,entregado] on the enum `EstadoObjetoPerdido` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EstadoObjetoPerdido_new" AS ENUM ('con_taxista', 'en_central', 'entregado_cliente');
ALTER TABLE "public"."ObjetoPerdido" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "ObjetoPerdido" ALTER COLUMN "estado" TYPE "EstadoObjetoPerdido_new" USING ("estado"::text::"EstadoObjetoPerdido_new");
ALTER TYPE "EstadoObjetoPerdido" RENAME TO "EstadoObjetoPerdido_old";
ALTER TYPE "EstadoObjetoPerdido_new" RENAME TO "EstadoObjetoPerdido";
DROP TYPE "public"."EstadoObjetoPerdido_old";
ALTER TABLE "ObjetoPerdido" ALTER COLUMN "estado" SET DEFAULT 'con_taxista';
COMMIT;
