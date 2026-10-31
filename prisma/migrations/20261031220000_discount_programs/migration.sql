-- CreateTable
CREATE TABLE "DiscountProgram" (
    "id" TEXT NOT NULL,
    "titleFa" TEXT NOT NULL,
    "titleEn" TEXT,
    "percent" INTEGER NOT NULL,
    "instructionsFa" TEXT,
    "instructionsEn" TEXT,
    "validityMonths" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "DiscountProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountApplication" (
    "id" TEXT NOT NULL,
    "proofUrlsJson" TEXT NOT NULL,
    "note" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "programId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewedById" TEXT,

    CONSTRAINT "DiscountApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountMembership" (
    "id" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "labelFa" TEXT NOT NULL,
    "labelEn" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "programId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DiscountMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscountProgram_clubId_active_idx" ON "DiscountProgram"("clubId", "active");

-- CreateIndex
CREATE INDEX "DiscountApplication_clubId_status_createdAt_idx" ON "DiscountApplication"("clubId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DiscountApplication_userId_status_idx" ON "DiscountApplication"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountApplication_programId_userId_key" ON "DiscountApplication"("programId", "userId");

-- CreateIndex
CREATE INDEX "DiscountMembership_clubId_userId_revokedAt_idx" ON "DiscountMembership"("clubId", "userId", "revokedAt");

-- CreateIndex
CREATE INDEX "DiscountMembership_userId_clubId_idx" ON "DiscountMembership"("userId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountMembership_programId_userId_key" ON "DiscountMembership"("programId", "userId");

-- AddForeignKey
ALTER TABLE "DiscountProgram" ADD CONSTRAINT "DiscountProgram_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountApplication" ADD CONSTRAINT "DiscountApplication_programId_fkey" FOREIGN KEY ("programId") REFERENCES "DiscountProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountApplication" ADD CONSTRAINT "DiscountApplication_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountApplication" ADD CONSTRAINT "DiscountApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountApplication" ADD CONSTRAINT "DiscountApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountMembership" ADD CONSTRAINT "DiscountMembership_programId_fkey" FOREIGN KEY ("programId") REFERENCES "DiscountProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountMembership" ADD CONSTRAINT "DiscountMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountMembership" ADD CONSTRAINT "DiscountMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
