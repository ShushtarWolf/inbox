-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Club" ADD COLUMN "status" "ClubStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "ClubApplication" (
    "id" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "sportSlug" TEXT NOT NULL DEFAULT 'padel',
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT,

    CONSTRAINT "ClubApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubApplication_clubId_key" ON "ClubApplication"("clubId");

-- AddForeignKey
ALTER TABLE "ClubApplication" ADD CONSTRAINT "ClubApplication_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
