-- Records the platform commission given up when a settlement is clawed back,
-- so athlete gross refund = payee clawback + commissionReversed.
-- Does not move wallet money. Historical full clawbacks (clawedBackAt set) are
-- marked with the snapshotted commission. Open partial clawbacks stay 0 until
-- a later clawback records its own slice; that under-count is not a payout.

ALTER TABLE "SettlementLedgerEntry"
  ADD COLUMN "commissionReversed" INTEGER NOT NULL DEFAULT 0;

UPDATE "SettlementLedgerEntry"
SET "commissionReversed" = "commission"
WHERE "clawedBackAt" IS NOT NULL
  AND "commissionReversed" = 0
  AND "commission" > 0;
