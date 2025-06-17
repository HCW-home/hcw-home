/*
  Warnings:

  - A unique constraint covering the columns `[order]` on the table `sms_providers` will be added. If there are existing duplicate values, this will fail.
  - Made the column `order` on table `sms_providers` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "sms_providers" ALTER COLUMN "order" SET NOT NULL,
ALTER COLUMN "isDisabled" SET DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "sms_providers_order_key" ON "sms_providers"("order");
