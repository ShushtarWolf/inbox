-- Mirror wallet partial uniques for club BOOKING_CREDIT (settlement still keyed on SettlementLedgerEntry).
CREATE UNIQUE INDEX "ClubWalletTransaction_paymentId_BOOKING_CREDIT_key"
ON "ClubWalletTransaction" ("paymentId", "type")
WHERE "type" = 'BOOKING_CREDIT' AND "paymentId" IS NOT NULL AND "bookingId" IS NULL;

CREATE UNIQUE INDEX "ClubWalletTransaction_paymentId_booking_BOOKING_CREDIT_key"
ON "ClubWalletTransaction" ("paymentId", "type", "bookingId")
WHERE "type" = 'BOOKING_CREDIT' AND "paymentId" IS NOT NULL AND "bookingId" IS NOT NULL;
