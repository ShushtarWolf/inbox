-- Desk pay-link pin (alphanumeric) so athletes can open /p/:pin without a stripped URL.

ALTER TABLE "Booking" ADD COLUMN "payPin" TEXT;

CREATE UNIQUE INDEX "Booking_payPin_key" ON "Booking"("payPin");
