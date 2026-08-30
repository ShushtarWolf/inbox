-- CreateTable
CREATE TABLE "OwnerExternalNote" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerExternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerExternalNote_clubId_date_idx" ON "OwnerExternalNote"("clubId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerExternalNote_courtId_date_startTime_key" ON "OwnerExternalNote"("courtId", "date", "startTime");

-- AddForeignKey
ALTER TABLE "OwnerExternalNote" ADD CONSTRAINT "OwnerExternalNote_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerExternalNote" ADD CONSTRAINT "OwnerExternalNote_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;
