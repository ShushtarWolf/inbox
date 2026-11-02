-- Soft-cancel season bookings so owner list shows «لغو شده».
ALTER TABLE "SeasonBooking" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
