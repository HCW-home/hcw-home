-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'WAITING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'TERMINATED_OPEN');

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

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('invite', 'login', 'password_reset');

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
    "acceptedAt" TIMESTAMP(3),
    "termId" INTEGER,
    "termVersion" DOUBLE PRECISION NOT NULL DEFAULT 0.00,

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
CREATE TABLE "language" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_language" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "languageId" INTEGER NOT NULL,

    CONSTRAINT "user_language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speciality" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "speciality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_speciality" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "specialityId" INTEGER NOT NULL,

    CONSTRAINT "user_speciality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_rating" (
    "id" SERIAL NOT NULL,
    "consultationId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultation_rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation" (
    "id" SERIAL NOT NULL,
    "scheduledDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdBy" INTEGER,
    "groupId" INTEGER,
    "ownerId" INTEGER,
    "specialityId" INTEGER,
    "symptoms" TEXT,
    "messageService" "MessageService",
    "waitingParticipants" INTEGER NOT NULL DEFAULT 0,
    "practitionerAdmitted" BOOLEAN NOT NULL DEFAULT false,
    "whatsappTemplateId" INTEGER,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'DRAFT',
    "deletionScheduledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "consultation_pkey" PRIMARY KEY ("id")
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mediasoup_routers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mediasoup_transports" (
    "id" TEXT NOT NULL,
    "consultationId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mediasoup_transports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mediasoup_producers" (
    "id" TEXT NOT NULL,
    "transportId" TEXT NOT NULL,
    "consultationId" INTEGER,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mediasoup_producers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mediasoup_consumers" (
    "id" TEXT NOT NULL,
    "transportId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mediasoup_consumers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant" (
    "id" SERIAL NOT NULL,
    "consultationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isBeneficiary" BOOLEAN NOT NULL DEFAULT false,
    "token" VARCHAR(255),
    "joinedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "language" VARCHAR(50),
    "lastActiveAt" TIMESTAMP(3),
    "inWaitingRoom" BOOLEAN NOT NULL DEFAULT true,
    "role" "UserRole" NOT NULL,

    CONSTRAINT "participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "senderRole" "UserRole",
    "consultationId" INTEGER NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "mediaUrl" VARCHAR(2048),
    "mediaType" TEXT,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_read_receipt" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_read_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_template" (
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

    CONSTRAINT "whatsapp_template_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "deleted_consultation_log" (
    "id" SERIAL NOT NULL,
    "consultationId" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "deleted_consultation_log_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "MediaPermissionStatus" (
    "id" SERIAL NOT NULL,
    "consultationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "cameraStatus" TEXT NOT NULL,
    "microphoneStatus" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaPermissionStatus_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "language_name_key" ON "language"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_language_userId_languageId_key" ON "user_language"("userId", "languageId");

-- CreateIndex
CREATE UNIQUE INDEX "speciality_name_key" ON "speciality"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_speciality_userId_specialityId_key" ON "user_speciality"("userId", "specialityId");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_rating_consultationId_key" ON "consultation_rating"("consultationId");

-- CreateIndex
CREATE INDEX "consultation_rating_patientId_idx" ON "consultation_rating"("patientId");

-- CreateIndex
CREATE INDEX "consultation_status_idx" ON "consultation"("status");

-- CreateIndex
CREATE INDEX "consultation_ownerId_idx" ON "consultation"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "mediasoup_servers_url_key" ON "mediasoup_servers"("url");

-- CreateIndex
CREATE UNIQUE INDEX "mediasoup_routers_consultationId_key" ON "mediasoup_routers"("consultationId");

-- CreateIndex
CREATE INDEX "mediasoup_routers_routerId_idx" ON "mediasoup_routers"("routerId");

-- CreateIndex
CREATE UNIQUE INDEX "mediasoup_routers_consultationId_serverId_key" ON "mediasoup_routers"("consultationId", "serverId");

-- CreateIndex
CREATE INDEX "mediasoup_transports_consultationId_idx" ON "mediasoup_transports"("consultationId");

-- CreateIndex
CREATE INDEX "mediasoup_producers_consultationId_idx" ON "mediasoup_producers"("consultationId");

-- CreateIndex
CREATE INDEX "participant_consultationId_isActive_idx" ON "participant"("consultationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "participant_consultationId_userId_key" ON "participant"("consultationId", "userId");

-- CreateIndex
CREATE INDEX "message_consultationId_idx" ON "message"("consultationId");

-- CreateIndex
CREATE UNIQUE INDEX "message_clientUuid_consultationId_userId_key" ON "message"("clientUuid", "consultationId", "userId");

-- CreateIndex
CREATE INDEX "message_read_receipt_messageId_idx" ON "message_read_receipt"("messageId");

-- CreateIndex
CREATE INDEX "message_read_receipt_userId_idx" ON "message_read_receipt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "message_read_receipt_messageId_userId_key" ON "message_read_receipt"("messageId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sms_providers_order_key" ON "sms_providers"("order");

-- CreateIndex
CREATE INDEX "deleted_consultation_log_consultationId_idx" ON "deleted_consultation_log"("consultationId");

-- CreateIndex
CREATE INDEX "practitioner_availability_practitionerId_idx" ON "practitioner_availability"("practitionerId");

-- CreateIndex
CREATE UNIQUE INDEX "time_slots_consultationId_key" ON "time_slots"("consultationId");

-- CreateIndex
CREATE INDEX "time_slots_practitionerId_date_idx" ON "time_slots"("practitionerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MediaPermissionStatus_consultationId_userId_key" ON "MediaPermissionStatus"("consultationId", "userId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "user_language" ADD CONSTRAINT "user_language_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_language" ADD CONSTRAINT "user_language_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_speciality" ADD CONSTRAINT "user_speciality_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_speciality" ADD CONSTRAINT "user_speciality_specialityId_fkey" FOREIGN KEY ("specialityId") REFERENCES "speciality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_rating" ADD CONSTRAINT "consultation_rating_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_rating" ADD CONSTRAINT "consultation_rating_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_specialityId_fkey" FOREIGN KEY ("specialityId") REFERENCES "speciality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mediasoup_routers" ADD CONSTRAINT "mediasoup_routers_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mediasoup_routers" ADD CONSTRAINT "mediasoup_routers_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mediasoup_servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mediasoup_transports" ADD CONSTRAINT "mediasoup_transports_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant" ADD CONSTRAINT "participant_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant" ADD CONSTRAINT "participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_receipt" ADD CONSTRAINT "message_read_receipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_receipt" ADD CONSTRAINT "message_read_receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deleted_consultation_log" ADD CONSTRAINT "deleted_consultation_log_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_availability" ADD CONSTRAINT "practitioner_availability_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaPermissionStatus" ADD CONSTRAINT "MediaPermissionStatus_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaPermissionStatus" ADD CONSTRAINT "MediaPermissionStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
