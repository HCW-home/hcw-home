-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Patient', 'Practitioner', 'Admin');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('approved', 'not_approved');

-- CreateEnum
CREATE TYPE "MessageService" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP', 'MANUALLY');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Patient',
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "temporaryAccount" BOOLEAN NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "sex" "Sex" NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'not_approved',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" SERIAL NOT NULL,
    "scheduledDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdBy" INTEGER,
    "groupId" INTEGER,
    "owner" INTEGER,
    "messageService" "MessageService",
    "whatsappTemplateId" INTEGER,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Whatsapp_Template" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "approvalStatus" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,
    "sid" TEXT NOT NULL,
    "types" JSONB NOT NULL,
    "url" TEXT NOT NULL,
    "rejectionReason" TEXT NOT NULL,

    CONSTRAINT "Whatsapp_Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SMS_Providers" (
    "id" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,
    "order" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "isWhatsapp" BOOLEAN NOT NULL,
    "isDisabled" BOOLEAN NOT NULL,

    CONSTRAINT "SMS_Providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");
