-- AlterTable
ALTER TABLE "Club" ADD COLUMN "defaultSessionDurationMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Club" ADD COLUMN "sessionDurationsJson" TEXT;

-- AlterTable
ALTER TABLE "Court" ADD COLUMN "image" TEXT;
ALTER TABLE "Court" ADD COLUMN "openHour" INTEGER;
ALTER TABLE "Court" ADD COLUMN "closeHour" INTEGER;
ALTER TABLE "Court" ADD COLUMN "facilitiesJson" TEXT;
