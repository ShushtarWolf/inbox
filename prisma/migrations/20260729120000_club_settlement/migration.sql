-- Club settlement: owner wallet, ledger, SHEBA, withdraw requests

CREATE TYPE "ClubWalletTransactionType" AS ENUM ('BOOKING_CREDIT', 'CLAWBACK', 'WITHDRAW_HOLD', 'WITHDRAW_RELEASE', 'WITHDRAW_PAID', 'ADJUSTMENT');

CREATE TYPE "WithdrawRequestStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED');

ALTER TABLE "Club" ADD COLUMN "sheba" TEXT;

CREATE TABLE "ClubWallet" (
    "id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "ClubWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubWallet_clubId_key" ON "ClubWallet"("clubId");

ALTER TABLE "ClubWallet" ADD CONSTRAINT "ClubWallet_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClubWalletTransaction" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "ClubWalletTransactionType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "walletId" TEXT NOT NULL,
    "paymentId" TEXT,
    "bookingId" TEXT,
    "withdrawRequestId" TEXT,

    CONSTRAINT "ClubWalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClubWalletTransaction_walletId_createdAt_idx" ON "ClubWalletTransaction"("walletId", "createdAt");
CREATE INDEX "ClubWalletTransaction_paymentId_idx" ON "ClubWalletTransaction"("paymentId");

ALTER TABLE "ClubWalletTransaction" ADD CONSTRAINT "ClubWalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "ClubWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SettlementLedgerEntry" (
    "id" TEXT NOT NULL,
    "gross" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL,
    "ownerNet" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clawedBackAt" TIMESTAMP(3),
    "clubId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "bookingId" TEXT,

    CONSTRAINT "SettlementLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SettlementLedgerEntry_paymentId_key" ON "SettlementLedgerEntry"("paymentId");
CREATE INDEX "SettlementLedgerEntry_clubId_createdAt_idx" ON "SettlementLedgerEntry"("clubId", "createdAt");

ALTER TABLE "SettlementLedgerEntry" ADD CONSTRAINT "SettlementLedgerEntry_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WithdrawRequest" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "shebaSnapshot" TEXT NOT NULL,
    "status" "WithdrawRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "clubId" TEXT NOT NULL,

    CONSTRAINT "WithdrawRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WithdrawRequest_clubId_status_createdAt_idx" ON "WithdrawRequest"("clubId", "status", "createdAt");
CREATE INDEX "WithdrawRequest_status_createdAt_idx" ON "WithdrawRequest"("status", "createdAt");

ALTER TABLE "WithdrawRequest" ADD CONSTRAINT "WithdrawRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
