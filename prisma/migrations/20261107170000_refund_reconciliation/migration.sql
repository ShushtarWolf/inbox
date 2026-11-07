-- Append-only audit for historical cancel-refund repair. No backfill of wallet credits.
-- Applying the repair itself is a separate explicit APPLY=yes run, not this migration.

CREATE TABLE "RefundReconciliation" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "clubClawback" INTEGER NOT NULL DEFAULT 0,
    "commissionRecorded" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundReconciliation_idempotencyKey_key" ON "RefundReconciliation"("idempotencyKey");
CREATE INDEX "RefundReconciliation_paymentId_idx" ON "RefundReconciliation"("paymentId");
