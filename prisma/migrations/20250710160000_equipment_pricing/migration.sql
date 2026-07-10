-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN "price" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SeasonBooking" ADD COLUMN "equipmentId" TEXT,
ADD COLUMN "equipmentPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "coachId" TEXT;

-- CreateTable
CREATE TABLE "BookingEquipment" (
    "id" TEXT NOT NULL,
    "priceAtBooking" INTEGER NOT NULL DEFAULT 0,
    "bookingId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,

    CONSTRAINT "BookingEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingEquipment_bookingId_equipmentId_key" ON "BookingEquipment"("bookingId", "equipmentId");

-- AddForeignKey
ALTER TABLE "BookingEquipment" ADD CONSTRAINT "BookingEquipment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEquipment" ADD CONSTRAINT "BookingEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
