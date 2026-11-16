-- cancel-wallet-shortfalls.sql
-- READ ONLY. Platform-wide: cancelled / refunded online bookings where athlete wallet
-- still looks short, plus series sibling cancels (amount 0) with REFUNDED status.
--
-- Run: gh workflow run readonly-sql-reports.yml -f report=cancel-wallet-shortfalls

-- (1) Wallet rail shortfalls (debit without matching REFUND_CREDIT)
WITH payer AS (
  SELECT DISTINCT wt."paymentId" AS payment_id, wt."walletId" AS wallet_id
  FROM "WalletTransaction" wt
  WHERE wt."paymentId" IS NOT NULL
    AND wt.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT')
),
rail AS (
  SELECT
    pw.payment_id,
    MIN(w."userId") AS payer_user_id,
    SUM(wt.amount) FILTER (WHERE wt.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT')) AS debited,
    SUM(wt.amount) FILTER (WHERE wt.type = 'REFUND_CREDIT') AS refunded,
    SUM(wt.amount) FILTER (
      WHERE wt.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT', 'REFUND_CREDIT', 'IPG_BOOKING_CREDIT', 'ADJUSTMENT')
    ) AS net_wallet
  FROM payer pw
  JOIN "Wallet" w ON w.id = pw.wallet_id
  JOIN "WalletTransaction" wt ON wt."paymentId" = pw.payment_id AND wt."walletId" = pw.wallet_id
  GROUP BY pw.payment_id, pw.wallet_id
)
SELECT
  'wallet_shortfall' AS kind,
  cl.slug AS club,
  b.id AS booking_id,
  s.date,
  s."startTime",
  b.status AS booking_status,
  b."cancellationReason",
  p.id AS payment_id,
  p.method::text,
  p.status::text AS payment_status,
  p.amount::int,
  r.payer_user_id,
  r.debited::int,
  COALESCE(r.refunded, 0)::int AS refunded,
  r.net_wallet::int,
  (p."metadataJson" LIKE '%"gatewayReversed":true%' OR p."metadataJson" LIKE '%"gatewayRefund":true%') AS gateway_flag,
  (p."metadataJson" LIKE '%seasonBookingId%' OR p."metadataJson" LIKE '%groupPrimaryBookingId%') AS series_meta
FROM rail r
JOIN "Payment" p ON p.id = r.payment_id
LEFT JOIN "Booking" b ON b.id = p."bookingId"
LEFT JOIN "Slot" s ON s.id = b."slotId"
LEFT JOIN "Court" c ON c.id = s."courtId"
LEFT JOIN "Club" cl ON cl.id = c."clubId"
WHERE COALESCE(p.purpose, 'booking') <> 'topup'
  AND COALESCE(r.debited, 0) < 0
  AND r.net_wallet < 0
  AND (b.status = 'CANCELLED' OR p.status IN ('REFUNDED', 'FAILED', 'SUPERSEDED') OR p."bookingId" IS NULL)
ORDER BY b."cancelledAt" DESC NULLS LAST
LIMIT 100;

-- (2) Series-looking sibling cancels (payment amount 0, booking cancelled, status REFUNDED)
SELECT
  'series_sibling_cancel' AS kind,
  cl.slug AS club,
  b.id AS booking_id,
  s.date,
  s."startTime",
  b."cancellationReason",
  p.id AS payment_id,
  p.amount::int,
  p.method::text,
  p.status::text AS payment_status,
  (p."metadataJson" LIKE '%seasonBookingId%') AS has_season,
  (p."metadataJson" LIKE '%sessionPrice%') AS has_session_price,
  substring(p."metadataJson" from '"sessionPrice":([0-9]+)') AS session_price,
  substring(p."metadataJson" from '"seasonBookingId":"([^"]+)"') AS season_booking_id,
  substring(p."metadataJson" from '"refundCreditAmount":([0-9]+)') AS refund_credit_amount,
  RIGHT(COALESCE(b."userId", ''), 6) AS user_id_suffix
FROM "Booking" b
JOIN "Slot" s ON s.id = b."slotId"
JOIN "Court" c ON c.id = s."courtId"
JOIN "Club" cl ON cl.id = c."clubId"
JOIN "Payment" p ON p."bookingId" = b.id
WHERE b.status = 'CANCELLED'
  AND p.amount = 0
  AND p.method IN ('IPG', 'PAID')
  AND p.status = 'REFUNDED'
  AND (
    p."metadataJson" LIKE '%seasonBookingId%'
    OR p."metadataJson" LIKE '%groupPrimaryBookingId%'
    OR p."metadataJson" LIKE '%coveredByBookingId%'
    OR p."metadataJson" LIKE '%groupSiblingBookingIds%'
  )
ORDER BY b."cancelledAt" DESC NULLS LAST
LIMIT 100;

-- (3) IPG/PAID cancelled with gateway reverse flags (closed-loop review bucket)
SELECT
  'gateway_flag_cancel' AS kind,
  cl.slug AS club,
  b.id AS booking_id,
  s.date,
  s."startTime",
  p.id AS payment_id,
  p.amount::int,
  p.method::text,
  p.status::text AS payment_status,
  RIGHT(COALESCE(p."userId", b."userId", ''), 6) AS user_id_suffix,
  (p."metadataJson" LIKE '%"refundChannel":"wallet_closed_loop"%') AS marked_wallet_loop,
  (p."metadataJson" LIKE '%reconHistoricalCancel%') AS recon_historical
FROM "Booking" b
JOIN "Slot" s ON s.id = b."slotId"
JOIN "Court" c ON c.id = s."courtId"
JOIN "Club" cl ON cl.id = c."clubId"
JOIN "Payment" p ON p."bookingId" = b.id
WHERE b.status = 'CANCELLED'
  AND p.method IN ('IPG', 'PAID')
  AND p.amount > 0
  AND (
    p."metadataJson" LIKE '%"gatewayRefund":true%'
    OR p."metadataJson" LIKE '%"gatewayReversed":true%'
  )
ORDER BY b."cancelledAt" DESC NULLS LAST
LIMIT 100;
