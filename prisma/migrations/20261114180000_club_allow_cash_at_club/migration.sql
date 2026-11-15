-- Allow athletes to choose pay-at-club on paid self-serve bookings (per-club opt-in, default off).
ALTER TABLE "Club" ADD COLUMN "allowCashAtClub" BOOLEAN NOT NULL DEFAULT false;