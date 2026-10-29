-- CreateEnum
CREATE TYPE "CourtAudience" AS ENUM ('MIXED', 'MEN', 'WOMEN', 'FAMILY');

-- AlterTable
ALTER TABLE "Court" ADD COLUMN "audience" "CourtAudience" NOT NULL DEFAULT 'MIXED';
