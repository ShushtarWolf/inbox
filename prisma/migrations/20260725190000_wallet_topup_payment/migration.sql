-- AlterEnum
ALTER TYPE "WalletTransactionType" ADD VALUE 'TOPUP_CREDIT';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'booking';
ALTER TABLE "Payment" ADD COLUMN "userId" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Payment_userId_purpose_createdAt_idx" ON "Payment"("userId", "purpose", "createdAt");
