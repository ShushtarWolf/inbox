-- AlterTable
ALTER TABLE "CoachSession" ADD COLUMN     "courtBookingId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CoachSession_courtBookingId_key" ON "CoachSession"("courtBookingId");

-- AddForeignKey
ALTER TABLE "CoachSession" ADD CONSTRAINT "CoachSession_courtBookingId_fkey" FOREIGN KEY ("courtBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
