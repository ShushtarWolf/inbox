-- Remove duplicate slots before adding the unique index.
DELETE FROM "Slot" a
USING "Slot" b
WHERE a.id > b.id
  AND a."courtId" = b."courtId"
  AND a.date = b.date
  AND a."startTime" = b."startTime";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Slot_courtId_date_startTime_key" ON "Slot"("courtId", "date", "startTime");
