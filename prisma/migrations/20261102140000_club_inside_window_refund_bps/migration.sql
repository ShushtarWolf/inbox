-- Athlete cancel inside window: refund share (bps). Default 10000 = 100%.
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "insideWindowRefundBps" INTEGER NOT NULL DEFAULT 10000;
