-- Payment receipts / transfer proofs for admin cash-out processing

CREATE TABLE "WithdrawPaymentDocument" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubWithdrawId" TEXT,
    "athleteWithdrawId" TEXT,

    CONSTRAINT "WithdrawPaymentDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WithdrawPaymentDocument_clubWithdrawId_createdAt_idx" ON "WithdrawPaymentDocument"("clubWithdrawId", "createdAt");
CREATE INDEX "WithdrawPaymentDocument_athleteWithdrawId_createdAt_idx" ON "WithdrawPaymentDocument"("athleteWithdrawId", "createdAt");

ALTER TABLE "WithdrawPaymentDocument" ADD CONSTRAINT "WithdrawPaymentDocument_clubWithdrawId_fkey" FOREIGN KEY ("clubWithdrawId") REFERENCES "WithdrawRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WithdrawPaymentDocument" ADD CONSTRAINT "WithdrawPaymentDocument_athleteWithdrawId_fkey" FOREIGN KEY ("athleteWithdrawId") REFERENCES "UserWithdrawRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WithdrawPaymentDocument" ADD CONSTRAINT "WithdrawPaymentDocument_one_parent_chk" CHECK (
  ("clubWithdrawId" IS NOT NULL AND "athleteWithdrawId" IS NULL)
  OR ("clubWithdrawId" IS NULL AND "athleteWithdrawId" IS NOT NULL)
);
