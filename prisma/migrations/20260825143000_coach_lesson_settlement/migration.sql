-- AlterEnum
ALTER TYPE "WalletTransactionType" ADD VALUE 'SETTLEMENT_CREDIT';
ALTER TYPE "WalletTransactionType" ADD VALUE 'SETTLEMENT_CLAWBACK';

-- AlterTable: club settlement rows keep clubId; coach lesson rows use coachId
ALTER TABLE "SettlementLedgerEntry" ALTER COLUMN "clubId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SettlementLedgerEntry" ADD COLUMN "coachId" TEXT;

-- AddForeignKey
ALTER TABLE "SettlementLedgerEntry" ADD CONSTRAINT "SettlementLedgerEntry_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "SettlementLedgerEntry_coachId_createdAt_idx" ON "SettlementLedgerEntry"("coachId", "createdAt");
