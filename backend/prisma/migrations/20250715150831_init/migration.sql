-- CreateEnum
CREATE TYPE "TimeSlotStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'BLOCKED');

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
CREATE INDEX "practitioner_availability_practitionerId_idx" ON "practitioner_availability"("practitionerId");

-- CreateIndex
CREATE UNIQUE INDEX "time_slots_consultationId_key" ON "time_slots"("consultationId");

-- CreateIndex
CREATE INDEX "time_slots_practitionerId_date_idx" ON "time_slots"("practitionerId", "date");

-- AddForeignKey
ALTER TABLE "practitioner_availability" ADD CONSTRAINT "practitioner_availability_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
