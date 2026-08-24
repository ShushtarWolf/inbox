-- CreateEnum
CREATE TYPE "CoachApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CoachClubLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- AlterTable
-- Existing coaches (seeded / owner-invited) stay listed; public signup writes PENDING explicitly.
ALTER TABLE "Coach" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvalStatus" "CoachApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CoachClubLink" (
    "id" TEXT NOT NULL,
    "status" "CoachClubLinkStatus" NOT NULL DEFAULT 'PENDING',
    "courtDiscountPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "coachId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "CoachClubLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachClubLink_clubId_status_idx" ON "CoachClubLink"("clubId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CoachClubLink_coachId_clubId_key" ON "CoachClubLink"("coachId", "clubId");

-- AddForeignKey
ALTER TABLE "CoachClubLink" ADD CONSTRAINT "CoachClubLink_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachClubLink" ADD CONSTRAINT "CoachClubLink_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
