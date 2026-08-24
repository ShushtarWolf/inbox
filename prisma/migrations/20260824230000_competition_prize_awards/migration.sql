-- AlterTable
ALTER TABLE "CompetitionEntry" ADD COLUMN "placement" INTEGER;

-- AlterTable
ALTER TABLE "DiscountCode" ADD COLUMN "boundUserId" TEXT;

-- CreateTable
CREATE TABLE "CompetitionPrizeAward" (
    "id" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,
    "prizeType" "CompetitionPrizeType" NOT NULL,
    "amount" INTEGER,
    "percent" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "walletTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competitionId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "discountCodeId" TEXT,

    CONSTRAINT "CompetitionPrizeAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionPrizeAward_idempotencyKey_key" ON "CompetitionPrizeAward"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionPrizeAward_competitionId_entryId_placement_key" ON "CompetitionPrizeAward"("competitionId", "entryId", "placement");

-- CreateIndex
CREATE INDEX "CompetitionPrizeAward_competitionId_createdAt_idx" ON "CompetitionPrizeAward"("competitionId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitionPrizeAward_athleteId_idx" ON "CompetitionPrizeAward"("athleteId");

-- CreateIndex
CREATE INDEX "CompetitionEntry_competitionId_placement_idx" ON "CompetitionEntry"("competitionId", "placement");

-- CreateIndex
CREATE INDEX "DiscountCode_boundUserId_idx" ON "DiscountCode"("boundUserId");

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_boundUserId_fkey" FOREIGN KEY ("boundUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionPrizeAward" ADD CONSTRAINT "CompetitionPrizeAward_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionPrizeAward" ADD CONSTRAINT "CompetitionPrizeAward_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionPrizeAward" ADD CONSTRAINT "CompetitionPrizeAward_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionPrizeAward" ADD CONSTRAINT "CompetitionPrizeAward_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
