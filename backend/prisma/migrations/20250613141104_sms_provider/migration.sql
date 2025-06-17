/*
  Warnings:

  - You are about to drop the `SMS_Providers` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "SMS_Providers";

-- CreateTable
CREATE TABLE "sms_providers" (
    "id" SERIAL NOT NULL,
    "order" INTEGER,
    "provider" TEXT,
    "prefix" TEXT,
    "isWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_providers_pkey" PRIMARY KEY ("id")
);
