-- Soft-disable platform users from admin console
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
