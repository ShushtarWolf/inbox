-- Wallet-first IPG ledger types and an append-time marker.
-- Does not credit wallets, rewrite old rows, or change stored balances.
-- originalEventAt stays null on existing transactions.

ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'IPG_BOOKING_CREDIT';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'IPG_BOOKING_DEBIT';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'IPG_RETURNED_TO_CARD';

ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "originalEventAt" TIMESTAMP(3);
