-- CreateEnum
CREATE TYPE "DiscountProgramVerificationKind" AS ENUM ('GENERIC', 'STUDENT');

-- AlterTable
ALTER TABLE "DiscountProgram" ADD COLUMN "verificationKind" "DiscountProgramVerificationKind" NOT NULL DEFAULT 'GENERIC';

-- AlterTable
ALTER TABLE "DiscountApplication" ADD COLUMN "fullName" TEXT,
ADD COLUMN "studentNumber" TEXT,
ADD COLUMN "ownershipConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "DiscountApplication_clubId_studentNumber_status_idx" ON "DiscountApplication"("clubId", "studentNumber", "status");
