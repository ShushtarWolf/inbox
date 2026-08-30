-- CreateEnum
CREATE TYPE "ExternalOccupancySource" AS ENUM ('ALOPLAY', 'ALOVARZESH', 'COURTIC');

-- CreateTable
CREATE TABLE "ExternalOccupancySnapshot" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "source" "ExternalOccupancySource" NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalOccupancySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalOccupancySnapshot_clubId_date_idx" ON "ExternalOccupancySnapshot"("clubId", "date");

-- CreateIndex
CREATE INDEX "ExternalOccupancySnapshot_courtId_date_idx" ON "ExternalOccupancySnapshot"("courtId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOccupancySnapshot_courtId_date_startTime_source_key" ON "ExternalOccupancySnapshot"("courtId", "date", "startTime", "source");

-- AddForeignKey
ALTER TABLE "ExternalOccupancySnapshot" ADD CONSTRAINT "ExternalOccupancySnapshot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOccupancySnapshot" ADD CONSTRAINT "ExternalOccupancySnapshot_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;
