-- Per-club platform commission override (null → PLATFORM_COMMISSION_BPS).
ALTER TABLE "Club" ADD COLUMN "commissionBps" INTEGER;
