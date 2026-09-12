-- Prevent duplicate payment-backed wallet credits under concurrent callbacks.
CREATE UNIQUE INDEX "WalletTransaction_paymentId_type_key"
ON "WalletTransaction" ("paymentId", "type");
