-- CreateIndex
CREATE UNIQUE INDEX "Slot_courtId_date_startTime_key" ON "Slot"("courtId", "date", "startTime");
