-- Money enforcement review: partial refund status, withdraw idempotency, commission audit.

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

ALTER TABLE "WithdrawRequest" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WithdrawRequest_clubId_idempotencyKey_key"
  ON "WithdrawRequest"("clubId", "idempotencyKey");

ALTER TABLE "UserWithdrawRequest" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "UserWithdrawRequest_userId_idempotencyKey_key"
  ON "UserWithdrawRequest"("userId", "idempotencyKey");

CREATE TABLE IF NOT EXISTS "ClubCommissionChange" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "fromBps" INTEGER,
  "toBps" INTEGER,
  "actor" TEXT NOT NULL DEFAULT 'admin-secret',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubCommissionChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClubCommissionChange_clubId_createdAt_idx"
  ON "ClubCommissionChange"("clubId", "createdAt");

ALTER TABLE "ClubCommissionChange"
  DROP CONSTRAINT IF EXISTS "ClubCommissionChange_clubId_fkey";
ALTER TABLE "ClubCommissionChange"
  ADD CONSTRAINT "ClubCommissionChange_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
