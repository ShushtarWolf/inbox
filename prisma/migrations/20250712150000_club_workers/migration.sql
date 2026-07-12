-- CreateTable
CREATE TABLE "ClubWorker" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "emergencyMobile" TEXT,
    "email" TEXT,
    "role" "StaffRole" NOT NULL DEFAULT 'FRONT_DESK',
    "workingHoursJson" TEXT,
    "permissionsJson" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,
    "membershipId" TEXT,

    CONSTRAINT "ClubWorker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubWorker_membershipId_key" ON "ClubWorker"("membershipId");

-- CreateIndex
CREATE INDEX "ClubWorker_clubId_active_idx" ON "ClubWorker"("clubId", "active");

-- AddForeignKey
ALTER TABLE "ClubWorker" ADD CONSTRAINT "ClubWorker_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubWorker" ADD CONSTRAINT "ClubWorker_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "StaffMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
