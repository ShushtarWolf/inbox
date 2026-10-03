-- Wallet available/locked split + series refund uniqueness + transfer/lock types.
-- Preserves historical rows; backfills available = balance, locked = 0.

-- Enum values (Postgres ADD VALUE cannot run in a transaction block on older PG;
-- Prisma wraps migrations in a transaction — use DO blocks where needed.)
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'LOCK';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'UNLOCK';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'INTERNAL_TRANSFER_OUT';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'INTERNAL_TRANSFER_IN';

ALTER TYPE "ClubWalletTransactionType" ADD VALUE IF NOT EXISTS 'LOCK';
ALTER TYPE "ClubWalletTransactionType" ADD VALUE IF NOT EXISTS 'UNLOCK';
ALTER TYPE "ClubWalletTransactionType" ADD VALUE IF NOT EXISTS 'INTERNAL_TRANSFER_OUT';
ALTER TYPE "ClubWalletTransactionType" ADD VALUE IF NOT EXISTS 'INTERNAL_TRANSFER_IN';

-- Available / locked columns
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "availableBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "lockedBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ClubWallet" ADD COLUMN IF NOT EXISTS "availableBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ClubWallet" ADD COLUMN IF NOT EXISTS "lockedBalance" INTEGER NOT NULL DEFAULT 0;

-- Preserve totals: everything currently spendable sits in available
UPDATE "Wallet" SET "availableBalance" = "balance", "lockedBalance" = 0;
UPDATE "ClubWallet" SET "availableBalance" = "balance", "lockedBalance" = 0;

-- Pending withdraw holds already reduced balance; treat that slice as locked
-- so available + locked = balance (funds held for payout are not spendable).
UPDATE "Wallet" w
SET
  "lockedBalance" = sub.pending,
  "availableBalance" = w.balance - sub.pending
FROM (
  SELECT uwr."userId", COALESCE(SUM(uwr.amount), 0)::int AS pending
  FROM "UserWithdrawRequest" uwr
  WHERE uwr.status = 'PENDING'
  GROUP BY uwr."userId"
) sub
WHERE w."userId" = sub."userId"
  AND w.balance >= sub.pending;

UPDATE "ClubWallet" w
SET
  "lockedBalance" = sub.pending,
  "availableBalance" = w.balance - sub.pending
FROM (
  SELECT wr."clubId", COALESCE(SUM(wr.amount), 0)::int AS pending
  FROM "WithdrawRequest" wr
  WHERE wr.status = 'PENDING'
  GROUP BY wr."clubId"
) sub
WHERE w."clubId" = sub."clubId"
  AND w.balance >= sub.pending;

-- Series refunds need one REFUND_CREDIT per booking; top-ups stay one per payment.
-- Postgres treats NULL bookingId as distinct in a 3-col unique, so use partial indexes.
DROP INDEX IF EXISTS "WalletTransaction_paymentId_type_key";
CREATE UNIQUE INDEX "WalletTransaction_paymentId_type_null_booking_key"
ON "WalletTransaction" ("paymentId", "type")
WHERE "paymentId" IS NOT NULL AND "bookingId" IS NULL;
CREATE UNIQUE INDEX "WalletTransaction_paymentId_type_bookingId_key"
ON "WalletTransaction" ("paymentId", "type", "bookingId")
WHERE "paymentId" IS NOT NULL AND "bookingId" IS NOT NULL;

-- Move not-yet-cashout-eligible settlement nets into locked (balance total unchanged).
-- Unlock at runtime via unlockEligible* using SettlementLedgerEntry.classDate.
-- Pending = classDate still today-or-future in Asia/Tehran.
WITH sums AS (
  SELECT s."clubId" AS club_id, SUM(s."ownerNet")::int AS total
  FROM "SettlementLedgerEntry" s
  WHERE s."clubId" IS NOT NULL
    AND s."clawedBackAt" IS NULL
    AND s."classDate" IS NOT NULL
    AND s."classDate" >= (CURRENT_DATE AT TIME ZONE 'Asia/Tehran')::date::text
    AND s."ownerNet" > 0
  GROUP BY s."clubId"
)
UPDATE "ClubWallet" w
SET
  "lockedBalance" = w."lockedBalance" + s.total,
  "availableBalance" = w."availableBalance" - s.total
FROM sums s
WHERE w."clubId" = s.club_id
  AND w."availableBalance" >= s.total;

WITH sums AS (
  SELECT c."userId" AS user_id, SUM(s."ownerNet")::int AS total
  FROM "SettlementLedgerEntry" s
  JOIN "Coach" c ON c.id = s."coachId"
  WHERE s."coachId" IS NOT NULL
    AND c."userId" IS NOT NULL
    AND s."clawedBackAt" IS NULL
    AND s."classDate" IS NOT NULL
    AND s."classDate" >= (CURRENT_DATE AT TIME ZONE 'Asia/Tehran')::date::text
    AND s."ownerNet" > 0
  GROUP BY c."userId"
)
UPDATE "Wallet" w
SET
  "lockedBalance" = w."lockedBalance" + s.total,
  "availableBalance" = w."availableBalance" - s.total
FROM sums s
WHERE w."userId" = s.user_id
  AND w."availableBalance" >= s.total;
