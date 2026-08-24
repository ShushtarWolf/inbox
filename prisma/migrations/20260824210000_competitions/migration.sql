-- CreateEnum
CREATE TYPE "CompetitionEnrollmentType" AS ENUM ('SINGLE', 'DOUBLE');

-- CreateEnum
CREATE TYPE "CompetitionPrizeType" AS ENUM ('WALLET', 'DISCOUNT');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompetitionEntryStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "enrollmentType" "CompetitionEnrollmentType" NOT NULL,
    "entryFee" INTEGER NOT NULL DEFAULT 0,
    "prizeType" "CompetitionPrizeType" NOT NULL,
    "prizeConfigJson" TEXT NOT NULL,
    "maxParticipants" INTEGER NOT NULL,
    "minParticipants" INTEGER NOT NULL DEFAULT 2,
    "registrationOpens" TIMESTAMP(3) NOT NULL,
    "registrationCloses" TIMESTAMP(3) NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "sponsorFunded" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionEntry" (
    "id" TEXT NOT NULL,
    "status" "CompetitionEntryStatus" NOT NULL DEFAULT 'PENDING',
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "competitionId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "partnerAthleteId" TEXT,
    "paymentId" TEXT,

    CONSTRAINT "CompetitionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competition_clubId_status_idx" ON "Competition"("clubId", "status");

-- CreateIndex
CREATE INDEX "Competition_status_registrationOpens_registrationCloses_idx" ON "Competition"("status", "registrationOpens", "registrationCloses");

-- CreateIndex
CREATE INDEX "CompetitionEntry_competitionId_status_idx" ON "CompetitionEntry"("competitionId", "status");

-- CreateIndex
CREATE INDEX "CompetitionEntry_athleteId_idx" ON "CompetitionEntry"("athleteId");

-- CreateIndex
CREATE INDEX "CompetitionEntry_partnerAthleteId_idx" ON "CompetitionEntry"("partnerAthleteId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEntry_paymentId_key" ON "CompetitionEntry"("paymentId");

-- Prevent double registration while entry is active (PENDING or CONFIRMED).
CREATE UNIQUE INDEX "CompetitionEntry_competitionId_athleteId_active_key"
ON "CompetitionEntry" ("competitionId", "athleteId")
WHERE "status" IN ('PENDING', 'CONFIRMED');

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_partnerAthleteId_fkey" FOREIGN KEY ("partnerAthleteId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
