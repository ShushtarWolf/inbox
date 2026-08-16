-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "BookingEquipment" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
