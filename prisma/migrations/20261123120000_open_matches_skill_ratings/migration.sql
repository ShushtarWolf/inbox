-- CreateEnum
CREATE TYPE "SkillAssessmentStatus" AS ENUM ('UNASSESSED', 'ASSESSED');

-- CreateEnum
CREATE TYPE "OpenMatchStatus" AS ENUM ('OPEN', 'FULL', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OpenMatchPaymentMode" AS ENUM ('HOST_PAYS', 'SPLIT_ONLINE');

-- CreateEnum
CREATE TYPE "OpenMatchType" AS ENUM ('FRIENDLY', 'COMPETITIVE');

-- CreateEnum
CREATE TYPE "OpenMatchParticipantStatus" AS ENUM ('JOINED', 'LEFT', 'REFUNDED');

-- CreateTable
CREATE TABLE "UserSportSkillRating" (
    "id" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assessmentStatus" "SkillAssessmentStatus" NOT NULL DEFAULT 'UNASSESSED',
    "assessedAt" TIMESTAMP(3),
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,

    CONSTRAINT "UserSportSkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillRatingHistory" (
    "id" TEXT NOT NULL,
    "previousRating" DOUBLE PRECISION NOT NULL,
    "newRating" DOUBLE PRECISION NOT NULL,
    "previousConfidence" DOUBLE PRECISION NOT NULL,
    "newConfidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userSportSkillRatingId" TEXT NOT NULL,
    "openMatchId" TEXT,

    CONSTRAINT "SkillRatingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenMatch" (
    "id" TEXT NOT NULL,
    "status" "OpenMatchStatus" NOT NULL DEFAULT 'OPEN',
    "paymentMode" "OpenMatchPaymentMode" NOT NULL,
    "matchType" "OpenMatchType" NOT NULL DEFAULT 'FRIENDLY',
    "maxPlayers" INTEGER NOT NULL,
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "minLevel" DOUBLE PRECISION,
    "maxLevel" DOUBLE PRECISION,
    "slotTotalPrice" INTEGER NOT NULL,
    "note" TEXT,
    "fillCutoffAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,

    CONSTRAINT "OpenMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenMatchParticipant" (
    "id" TEXT NOT NULL,
    "status" "OpenMatchParticipantStatus" NOT NULL DEFAULT 'JOINED',
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "shareAmount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "openMatchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT,

    CONSTRAINT "OpenMatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenMatchResult" (
    "id" TEXT NOT NULL,
    "scoreJson" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opponentConfirmedAt" TIMESTAMP(3),
    "opponentUserId" TEXT,
    "openMatchId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,

    CONSTRAINT "OpenMatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenMatchPeerRating" (
    "id" TEXT NOT NULL,
    "perceivedLevel" DOUBLE PRECISION NOT NULL,
    "fairPlayScore" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openMatchId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,

    CONSTRAINT "OpenMatchPeerRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSportSkillRating_userId_sportId_key" ON "UserSportSkillRating"("userId", "sportId");

-- CreateIndex
CREATE INDEX "UserSportSkillRating_sportId_rating_idx" ON "UserSportSkillRating"("sportId", "rating");

-- CreateIndex
CREATE INDEX "SkillRatingHistory_userSportSkillRatingId_createdAt_idx" ON "SkillRatingHistory"("userSportSkillRatingId", "createdAt");

-- CreateIndex
CREATE INDEX "SkillRatingHistory_openMatchId_idx" ON "SkillRatingHistory"("openMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenMatch_slotId_key" ON "OpenMatch"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenMatch_bookingId_key" ON "OpenMatch"("bookingId");

-- CreateIndex
CREATE INDEX "OpenMatch_clubId_status_fillCutoffAt_idx" ON "OpenMatch"("clubId", "status", "fillCutoffAt");

-- CreateIndex
CREATE INDEX "OpenMatch_sportId_status_fillCutoffAt_idx" ON "OpenMatch"("sportId", "status", "fillCutoffAt");

-- CreateIndex
CREATE INDEX "OpenMatch_status_fillCutoffAt_idx" ON "OpenMatch"("status", "fillCutoffAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpenMatchParticipant_paymentId_key" ON "OpenMatchParticipant"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenMatchParticipant_openMatchId_userId_key" ON "OpenMatchParticipant"("openMatchId", "userId");

-- CreateIndex
CREATE INDEX "OpenMatchParticipant_openMatchId_status_idx" ON "OpenMatchParticipant"("openMatchId", "status");

-- CreateIndex
CREATE INDEX "OpenMatchParticipant_userId_joinedAt_idx" ON "OpenMatchParticipant"("userId", "joinedAt");

-- CreateIndex
CREATE INDEX "OpenMatchResult_openMatchId_idx" ON "OpenMatchResult"("openMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenMatchPeerRating_openMatchId_fromUserId_toUserId_key" ON "OpenMatchPeerRating"("openMatchId", "fromUserId", "toUserId");

-- CreateIndex
CREATE INDEX "OpenMatchPeerRating_toUserId_createdAt_idx" ON "OpenMatchPeerRating"("toUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserSportSkillRating" ADD CONSTRAINT "UserSportSkillRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSportSkillRating" ADD CONSTRAINT "UserSportSkillRating_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillRatingHistory" ADD CONSTRAINT "SkillRatingHistory_userSportSkillRatingId_fkey" FOREIGN KEY ("userSportSkillRatingId") REFERENCES "UserSportSkillRating"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillRatingHistory" ADD CONSTRAINT "SkillRatingHistory_openMatchId_fkey" FOREIGN KEY ("openMatchId") REFERENCES "OpenMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchParticipant" ADD CONSTRAINT "OpenMatchParticipant_openMatchId_fkey" FOREIGN KEY ("openMatchId") REFERENCES "OpenMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchParticipant" ADD CONSTRAINT "OpenMatchParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchParticipant" ADD CONSTRAINT "OpenMatchParticipant_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchResult" ADD CONSTRAINT "OpenMatchResult_openMatchId_fkey" FOREIGN KEY ("openMatchId") REFERENCES "OpenMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchResult" ADD CONSTRAINT "OpenMatchResult_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchPeerRating" ADD CONSTRAINT "OpenMatchPeerRating_openMatchId_fkey" FOREIGN KEY ("openMatchId") REFERENCES "OpenMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchPeerRating" ADD CONSTRAINT "OpenMatchPeerRating_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatchPeerRating" ADD CONSTRAINT "OpenMatchPeerRating_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;