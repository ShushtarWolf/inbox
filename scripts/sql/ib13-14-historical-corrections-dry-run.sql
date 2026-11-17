-- IB-13 / IB-14 read-only inventory (prod replica safe).
--   BEGIN TRANSACTION READ ONLY;
--   \i scripts/sql/ib13-14-historical-corrections-dry-run.sql
--   ROLLBACK;

-- IB-13: cancelled online/wallet-paid bookings missing REFUND_CREDIT (sample)
SELECT
  p.id AS payment_id,
  p."bookingId" AS booking_id,
  b.status AS booking_status,
  p.method,
  p.status AS payment_status,
  p.amount,
  COALESCE(wt.refunded, 0) AS refund_credit_sum,
  COALESCE(wt.debited, 0) AS wallet_debit_abs
FROM "Payment" p
LEFT JOIN "Booking" b ON b.id = p."bookingId"
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE WHEN wt.type = 'REFUND_CREDIT' THEN wt.amount ELSE 0 END)::int AS refunded,
    SUM(CASE WHEN wt.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT') THEN ABS(wt.amount) ELSE 0 END)::int AS debited
  FROM "WalletTransaction" wt
  WHERE wt."paymentId" = p.id
) wt ON true
WHERE p.method IN ('IPG', 'PAID')
  AND (b.status = 'CANCELLED' OR p.status IN ('REFUNDED', 'FAILED', 'SUPERSEDED'))
  AND COALESCE(wt.debited, 0) > 0
  AND COALESCE(wt.refunded, 0) < LEAST(p.amount, COALESCE(wt.debited, 0))
ORDER BY p."updatedAt" DESC
LIMIT 50;

-- IB-14: detached payments (no booking FK) with wallet debit
SELECT
  p.id AS payment_id,
  p.method,
  p.status,
  p.amount,
  p."metadataJson"::jsonb->>'detachedFromBookingId' AS detached_booking_id,
  COALESCE(wt.refunded, 0) AS refund_credit_sum,
  COALESCE(wt.debited, 0) AS wallet_debit_abs,
  GREATEST(0, LEAST(p.amount, COALESCE(wt.debited, 0)) - COALESCE(wt.refunded, 0)) AS proposed_wallet_credit
FROM "Payment" p
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE WHEN wt.type = 'REFUND_CREDIT' THEN wt.amount ELSE 0 END)::int AS refunded,
    SUM(CASE WHEN wt.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT') THEN ABS(wt.amount) ELSE 0 END)::int AS debited
  FROM "WalletTransaction" wt
  WHERE wt."paymentId" = p.id
) wt ON true
WHERE p."bookingId" IS NULL
  AND p.purpose <> 'topup'
  AND p."metadataJson" LIKE '%detachedFromBookingId%'
  AND p.method IN ('IPG', 'PAID', 'CASH')
ORDER BY p."updatedAt" DESC
LIMIT 20;