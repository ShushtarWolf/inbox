-- Platform default commission (admin UI); safe pilot default 0 bps.
CREATE TABLE "PlatformCommissionSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "commissionBps" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformCommissionSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformCommissionChange" (
    "id" TEXT NOT NULL,
    "fromBps" INTEGER NOT NULL,
    "toBps" INTEGER NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'admin-secret',
    "ackRefundRisk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformCommissionChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformCommissionChange_createdAt_idx" ON "PlatformCommissionChange"("createdAt");

INSERT INTO "PlatformCommissionSetting" ("id", "commissionBps", "updatedAt")
VALUES ('default', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
