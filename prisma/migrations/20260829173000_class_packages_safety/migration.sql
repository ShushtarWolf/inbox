-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'OPEN', 'CANCELLED');

-- AlterTable PackageDraft
ALTER TABLE "PackageDraft" ADD COLUMN "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "PackageDraft" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "PackageDraft" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "PackageDraft" ADD COLUMN "courtId" TEXT;

-- AlterTable Booking: link class-package court holds
ALTER TABLE "Booking" ADD COLUMN "packageDraftId" TEXT;

-- AlterTable PackageBooking: unpaid seats start PENDING
ALTER TABLE "PackageBooking" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AddForeignKey
ALTER TABLE "PackageDraft" ADD CONSTRAINT "PackageDraft_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_packageDraftId_fkey" FOREIGN KEY ("packageDraftId") REFERENCES "PackageDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PackageDraft_clubId_status_idx" ON "PackageDraft"("clubId", "status");
CREATE INDEX "PackageDraft_courtId_status_idx" ON "PackageDraft"("courtId", "status");
CREATE INDEX "PackageDraft_coachId_status_idx" ON "PackageDraft"("coachId", "status");
CREATE INDEX "Booking_packageDraftId_idx" ON "Booking"("packageDraftId");
CREATE INDEX "PackageBooking_status_createdAt_idx" ON "PackageBooking"("status", "createdAt");
