-- AlterTable
ALTER TABLE "PackageDraft" ADD COLUMN "level" INTEGER;
ALTER TABLE "PackageDraft" ADD COLUMN "timesJson" TEXT;

-- CreateTable
CREATE TABLE "PackagePlayer" (
    "id" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestMobile" TEXT,
    "level" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "packageId" TEXT NOT NULL,
    "athleteId" TEXT,

    CONSTRAINT "PackagePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackagePlayer_packageId_idx" ON "PackagePlayer"("packageId");

-- AddForeignKey
ALTER TABLE "PackagePlayer" ADD CONSTRAINT "PackagePlayer_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PackageDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePlayer" ADD CONSTRAINT "PackagePlayer_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
