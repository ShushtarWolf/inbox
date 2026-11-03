-- CreateEnum
CREATE TYPE "MoneyJobType" AS ENUM ('SETTLE', 'TOPUP_CREDIT');

-- CreateEnum
CREATE TYPE "MoneyJobStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'SUPERSEDED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "supersededByPaymentId" TEXT;

-- CreateTable
CREATE TABLE "MoneyJob" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" "MoneyJobType" NOT NULL,
    "status" "MoneyJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "MoneyJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MoneyJob_paymentId_type_key" ON "MoneyJob"("paymentId", "type");

-- CreateIndex
CREATE INDEX "MoneyJob_status_createdAt_idx" ON "MoneyJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_supersededByPaymentId_idx" ON "Payment"("supersededByPaymentId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_supersededByPaymentId_fkey" FOREIGN KEY ("supersededByPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyJob" ADD CONSTRAINT "MoneyJob_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
