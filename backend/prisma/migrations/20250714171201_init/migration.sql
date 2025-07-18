-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('SCHEDULED', 'WAITING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'TERMINATED_OPEN');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'PRACTITIONER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserSex" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('APPROVED', 'NOT_APPROVED');

-- CreateEnum
CREATE TYPE "OrgMemberRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "MessageService" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP', 'MANUALLY');

-- CreateEnum
CREATE TYPE "TimeSlotStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'BLOCKED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "role" "UserRole" NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "temporaryAccount" BOOLEAN NOT NULL DEFAULT false,
    "phoneNumber" VARCHAR(20),
    "country" VARCHAR(100),
    "sex" "UserSex",
    "status" "UserStatus" NOT NULL DEFAULT 'NOT_APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "logo" TEXT,
    "primaryColor" TEXT,
    "footerMarkdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "OrgMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sharedOnlyIncomingConsultation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Language" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLanguage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "languageId" INTEGER NOT NULL,

    CONSTRAINT "UserLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Speciality" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Speciality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSpeciality" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "specialityId" INTEGER NOT NULL,

    CONSTRAINT "UserSpeciality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationRating" (
    "id" SERIAL NOT NULL,
    "consultationId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationRating_pkey" PRIMARY KEY ("id")
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
    "ownerId" INTEGER,
    "messageService" "MessageService",
    "whatsappTemplateId" INTEGER,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "deletionScheduledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mediasoup_servers" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "maxNumberOfSessions" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mediasoup_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mediasoup_routers" (
    "id" TEXT NOT NULL,
    "consultationId" INTEGER NOT NULL,
    "routerId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,

    CONSTRAINT "mediasoup_routers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" SERIAL NOT NULL,
    "consultationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isBeneficiary" BOOLEAN NOT NULL DEFAULT false,
    "token" VARCHAR(255),
    "joinedAt" TIMESTAMP(3),
    "language" VARCHAR(50),
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "consultationId" INTEGER,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "sms_providers" (
    "id" SERIAL NOT NULL,
    "order" INTEGER NOT NULL,
    "provider" TEXT,
    "prefix" TEXT,
    "isWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "isDisabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" SERIAL NOT NULL,
    "language" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" DOUBLE PRECISION NOT NULL DEFAULT 1.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" INTEGER NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletedConsultationLog" (
    "id" SERIAL NOT NULL,
    "consultationId" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "DeletedConsultationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practitioner_availability" (
    "id" SERIAL NOT NULL,
    "practitionerId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotDuration" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practitioner_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_slots" (
    "id" SERIAL NOT NULL,
    "practitionerId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" "TimeSlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "consultationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_name_key" ON "organizations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_groupId_userId_key" ON "group_members"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Language_name_key" ON "Language"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserLanguage_userId_languageId_key" ON "UserLanguage"("userId", "languageId");

-- CreateIndex
CREATE UNIQUE INDEX "Speciality_name_key" ON "Speciality"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserSpeciality_userId_specialityId_key" ON "UserSpeciality"("userId", "specialityId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationRating_consultationId_key" ON "ConsultationRating"("consultationId");

-- CreateIndex
CREATE INDEX "ConsultationRating_patientId_idx" ON "ConsultationRating"("patientId");

-- CreateIndex
CREATE INDEX "Consultation_status_idx" ON "Consultation"("status");

-- CreateIndex
CREATE INDEX "Consultation_ownerId_idx" ON "Consultation"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "mediasoup_servers_url_key" ON "mediasoup_servers"("url");

-- CreateIndex
CREATE UNIQUE INDEX "mediasoup_routers_consultationId_key" ON "mediasoup_routers"("consultationId");

-- CreateIndex
CREATE INDEX "mediasoup_routers_routerId_idx" ON "mediasoup_routers"("routerId");

-- CreateIndex
CREATE UNIQUE INDEX "mediasoup_routers_consultationId_serverId_key" ON "mediasoup_routers"("consultationId", "serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_consultationId_userId_key" ON "Participant"("consultationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sms_providers_order_key" ON "sms_providers"("order");

-- CreateIndex
CREATE INDEX "DeletedConsultationLog_consultationId_idx" ON "DeletedConsultationLog"("consultationId");

-- CreateIndex
CREATE INDEX "practitioner_availability_practitionerId_idx" ON "practitioner_availability"("practitionerId");

-- CreateIndex
CREATE UNIQUE INDEX "time_slots_consultationId_key" ON "time_slots"("consultationId");

-- CreateIndex
CREATE INDEX "time_slots_practitionerId_date_idx" ON "time_slots"("practitionerId", "date");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLanguage" ADD CONSTRAINT "UserLanguage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLanguage" ADD CONSTRAINT "UserLanguage_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSpeciality" ADD CONSTRAINT "UserSpeciality_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSpeciality" ADD CONSTRAINT "UserSpeciality_specialityId_fkey" FOREIGN KEY ("specialityId") REFERENCES "Speciality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationRating" ADD CONSTRAINT "ConsultationRating_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationRating" ADD CONSTRAINT "ConsultationRating_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mediasoup_routers" ADD CONSTRAINT "mediasoup_routers_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mediasoup_routers" ADD CONSTRAINT "mediasoup_routers_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mediasoup_servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedConsultationLog" ADD CONSTRAINT "DeletedConsultationLog_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_availability" ADD CONSTRAINT "practitioner_availability_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
