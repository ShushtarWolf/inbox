-- AlterTable
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Deduplicate phones before unique constraint (keep earliest user)
UPDATE "User" AS u
SET "phone" = NULL
WHERE u."phone" IS NOT NULL
  AND u."id" NOT IN (
    SELECT DISTINCT ON ("phone") "id"
    FROM "User"
    WHERE "phone" IS NOT NULL
    ORDER BY "phone", "createdAt" ASC
  );

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "role" TEXT,
    "payloadJson" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_purpose_idx" ON "PhoneOtp"("phone", "purpose");

-- CreateIndex
CREATE INDEX "PhoneOtp_expiresAt_idx" ON "PhoneOtp"("expiresAt");
