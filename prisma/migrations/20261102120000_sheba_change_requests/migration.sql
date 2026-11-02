-- Sheba change approval queue (club + user/coach payouts)

CREATE TYPE "ShebaChangeSubject" AS ENUM ('CLUB', 'USER');
CREATE TYPE "ShebaChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "ShebaChangeRequest" (
    "id" TEXT NOT NULL,
    "subject" "ShebaChangeSubject" NOT NULL,
    "proposedSheba" TEXT,
    "previousSheba" TEXT,
    "status" "ShebaChangeStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "clubId" TEXT,
    "userId" TEXT,

    CONSTRAINT "ShebaChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShebaChangeRequest_status_createdAt_idx" ON "ShebaChangeRequest"("status", "createdAt");
CREATE INDEX "ShebaChangeRequest_clubId_status_idx" ON "ShebaChangeRequest"("clubId", "status");
CREATE INDEX "ShebaChangeRequest_userId_status_idx" ON "ShebaChangeRequest"("userId", "status");

ALTER TABLE "ShebaChangeRequest" ADD CONSTRAINT "ShebaChangeRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShebaChangeRequest" ADD CONSTRAINT "ShebaChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grandfather existing live SHEBAs as approved (historical audit row).
INSERT INTO "ShebaChangeRequest" ("id", "subject", "proposedSheba", "previousSheba", "status", "createdAt", "reviewedAt", "clubId")
SELECT
  'legacy-club-' || "id",
  'CLUB'::"ShebaChangeSubject",
  "sheba",
  NULL,
  'APPROVED'::"ShebaChangeStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  "id"
FROM "Club"
WHERE "sheba" IS NOT NULL;

INSERT INTO "ShebaChangeRequest" ("id", "subject", "proposedSheba", "previousSheba", "status", "createdAt", "reviewedAt", "userId")
SELECT
  'legacy-user-' || "id",
  'USER'::"ShebaChangeSubject",
  "sheba",
  NULL,
  'APPROVED'::"ShebaChangeStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  "id"
FROM "User"
WHERE "sheba" IS NOT NULL;
