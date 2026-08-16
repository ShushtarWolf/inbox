-- Athlete wallet cash-out: User SHEBA + withdraw hold ledger + UserWithdrawRequest

ALTER TYPE "WalletTransactionType" ADD VALUE 'WITHDRAW_HOLD';
ALTER TYPE "WalletTransactionType" ADD VALUE 'WITHDRAW_RELEASE';
ALTER TYPE "WalletTransactionType" ADD VALUE 'WITHDRAW_PAID';

ALTER TABLE "User" ADD COLUMN "sheba" TEXT;

ALTER TABLE "WalletTransaction" ADD COLUMN "withdrawRequestId" TEXT;

CREATE TABLE "UserWithdrawRequest" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "shebaSnapshot" TEXT NOT NULL,
    "status" "WithdrawRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserWithdrawRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserWithdrawRequest_userId_status_createdAt_idx" ON "UserWithdrawRequest"("userId", "status", "createdAt");
CREATE INDEX "UserWithdrawRequest_status_createdAt_idx" ON "UserWithdrawRequest"("status", "createdAt");

ALTER TABLE "UserWithdrawRequest" ADD CONSTRAINT "UserWithdrawRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
