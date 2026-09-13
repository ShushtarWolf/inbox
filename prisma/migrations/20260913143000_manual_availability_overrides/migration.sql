-- CreateEnum
CREATE TYPE "ManualAvailabilityOverrideType" AS ENUM ('RELEASE', 'BLOCK');

-- CreateTable
CREATE TABLE "ManualAvailabilityOverride" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "type" "ManualAvailabilityOverrideType" NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualAvailabilityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualAvailabilityOverride_clubId_date_idx" ON "ManualAvailabilityOverride"("clubId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ManualAvailabilityOverride_courtId_date_startTime_key" ON "ManualAvailabilityOverride"("courtId", "date", "startTime");

-- AddForeignKey
ALTER TABLE "ManualAvailabilityOverride" ADD CONSTRAINT "ManualAvailabilityOverride_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualAvailabilityOverride" ADD CONSTRAINT "ManualAvailabilityOverride_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualAvailabilityOverride" ADD CONSTRAINT "ManualAvailabilityOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualAvailabilityOverride" ADD CONSTRAINT "ManualAvailabilityOverride_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
