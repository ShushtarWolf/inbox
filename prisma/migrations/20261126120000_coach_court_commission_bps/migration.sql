-- Coach lesson-court commission: nullable overrides; default math is half of athlete rate (application layer).
ALTER TABLE "Club" ADD COLUMN "coachCourtCommissionBps" INTEGER;
ALTER TABLE "PlatformCommissionSetting" ADD COLUMN "coachCourtCommissionBps" INTEGER;