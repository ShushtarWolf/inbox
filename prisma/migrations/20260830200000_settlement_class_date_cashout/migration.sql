-- AlterTable
ALTER TABLE "SettlementLedgerEntry" ADD COLUMN "classDate" TEXT;

-- CreateIndex
CREATE INDEX "SettlementLedgerEntry_clubId_classDate_idx" ON "SettlementLedgerEntry"("clubId", "classDate");

-- CreateIndex
CREATE INDEX "SettlementLedgerEntry_coachId_classDate_idx" ON "SettlementLedgerEntry"("coachId", "classDate");

-- Backfill court booking class dates (club settlements)
UPDATE "SettlementLedgerEntry" AS e
SET "classDate" = s."date"
FROM "Payment" AS p
INNER JOIN "Booking" AS b ON b."id" = p."bookingId"
INNER JOIN "Slot" AS s ON s."id" = b."slotId"
WHERE e."paymentId" = p."id"
  AND e."classDate" IS NULL
  AND e."clawedBackAt" IS NULL;

-- Backfill coach lesson class dates
UPDATE "SettlementLedgerEntry" AS e
SET "classDate" = cs."date"
FROM "Payment" AS p
INNER JOIN "CoachSession" AS cs ON cs."id" = p."coachSessionId"
WHERE e."paymentId" = p."id"
  AND e."classDate" IS NULL
  AND e."clawedBackAt" IS NULL;
