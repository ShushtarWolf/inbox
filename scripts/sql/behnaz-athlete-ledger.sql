-- behnaz-athlete-ledger.sql
-- READ ONLY. Full money + booking ledger for athlete Behnaz Taabodi (pilot).
-- Phone last digits only in output; no sheba/secrets.
--
-- Run via: gh workflow run readonly-sql-reports.yml -f report=behnaz-athlete-ledger

-- Identity
SELECT
  u.id AS user_id,
  u.name,
  u."nameFamily",
  RIGHT(COALESCE(u.phone, ''), 4) AS phone_last4,
  u.role::text,
  (u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran
FROM "User" u
WHERE u.id = 'cmszubaum002wp537lorvhjmp'
   OR u.phone LIKE '%9022900854%';

-- Wallet balance + recent txs
SELECT
  w.id AS wallet_id,
  w.balance::int AS balance,
  w."availableBalance"::int AS available_balance,
  wt.id AS tx_id,
  wt.type::text,
  wt.amount::int,
  left(COALESCE(wt.note, ''), 80) AS note,
  wt."paymentId",
  wt."bookingId",
  (wt."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran
FROM "Wallet" w
LEFT JOIN "WalletTransaction" wt ON wt."walletId" = w.id
WHERE w."userId" = 'cmszubaum002wp537lorvhjmp'
ORDER BY wt."createdAt" DESC NULLS LAST
LIMIT 100;

-- All court bookings (user + guest phone)
SELECT
  b.id AS booking_id,
  b.status::text AS booking_status,
  b."paymentStatus"::text AS booking_payment_status,
  b."paymentMethod"::text AS booking_payment_method,
  b.source::text,
  b."cancellationReason",
  (b."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  (b."cancelledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS cancelled_tehran,
  s.date AS slot_date,
  s."startTime",
  s.price::int AS slot_price,
  c."nameFa" AS court,
  cl.slug AS club,
  p.id AS payment_id,
  p.amount::int AS payment_amount,
  p.method::text AS payment_method,
  p.status::text AS payment_status,
  p.purpose,
  p."supersededByPaymentId",
  (p."metadataJson" LIKE '%seasonBookingId%') AS has_season,
  (p."metadataJson" LIKE '%groupPrimaryBookingId%'
    OR p."metadataJson" LIKE '%coveredByBookingId%'
    OR p."metadataJson" LIKE '%groupSiblingBookingIds%') AS has_group,
  (p."metadataJson" LIKE '%sessionPrice%') AS has_session_price,
  (p."metadataJson" LIKE '%discountAmount%' OR p."metadataJson" LIKE '%discountCode%') AS has_discount,
  (p."metadataJson" LIKE '%gatewayRefund":true%' OR p."metadataJson" LIKE '%gatewayReversed":true%') AS gateway_flag,
  (p."metadataJson" LIKE '%refundChannel%') AS has_refund_channel,
  left(COALESCE(p."metadataJson", ''), 500) AS meta_preview
FROM "Booking" b
JOIN "Slot" s ON s.id = b."slotId"
JOIN "Court" c ON c.id = s."courtId"
JOIN "Club" cl ON cl.id = c."clubId"
LEFT JOIN "Payment" p ON p."bookingId" = b.id
WHERE b."userId" = 'cmszubaum002wp537lorvhjmp'
   OR b."guestMobile" LIKE '%9022900854%'
ORDER BY s.date DESC, s."startTime" DESC;

-- Payments owned by user (incl. detached / superseded / no booking)
SELECT
  p.id AS payment_id,
  p."bookingId",
  p.amount::int,
  p.method::text,
  p.status::text,
  p.purpose,
  p."supersededByPaymentId",
  (p."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  (p."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS updated_tehran,
  (p."metadataJson" LIKE '%seasonBookingId%') AS has_season,
  (p."metadataJson" LIKE '%sessionPrice%') AS has_session_price,
  (p."metadataJson" LIKE '%discount%') AS has_discount,
  (p."metadataJson" LIKE '%gatewayRefund":true%' OR p."metadataJson" LIKE '%gatewayReversed":true%') AS gateway_flag,
  (p."metadataJson" LIKE '%reconHistoricalCancel%') AS recon_historical,
  left(COALESCE(p."metadataJson", ''), 600) AS meta_preview
FROM "Payment" p
WHERE p."userId" = 'cmszubaum002wp537lorvhjmp'
   OR p."bookingId" IN (
     SELECT id FROM "Booking"
     WHERE "userId" = 'cmszubaum002wp537lorvhjmp'
        OR "guestMobile" LIKE '%9022900854%'
   )
ORDER BY p."createdAt" DESC;

-- Package bookings (coach packages) if any
SELECT
  pb.id AS package_booking_id,
  pb.status::text,
  (pb."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  pd.title AS package_title,
  p.id AS payment_id,
  p.amount::int,
  p.method::text,
  p.status::text
FROM "PackageBooking" pb
LEFT JOIN "PackageDraft" pd ON pd.id = pb."packageId"
LEFT JOIN "Payment" p ON p."packageBookingId" = pb.id
WHERE pb."athleteId" = 'cmszubaum002wp537lorvhjmp'
ORDER BY pb."createdAt" DESC;

-- Season / series siblings linked from her payments' metadata
WITH hers AS (
  SELECT p.id, p."metadataJson"
  FROM "Payment" p
  WHERE p."userId" = 'cmszubaum002wp537lorvhjmp'
     OR p."bookingId" IN (
       SELECT id FROM "Booking"
       WHERE "userId" = 'cmszubaum002wp537lorvhjmp'
          OR "guestMobile" LIKE '%9022900854%'
     )
)
SELECT
  h.id AS payment_id,
  substring(h."metadataJson" from '"seasonBookingId":"([^"]+)"') AS season_booking_id,
  substring(h."metadataJson" from '"sessionPrice":([0-9]+)') AS session_price,
  substring(h."metadataJson" from '"refundCreditAmount":([0-9]+)') AS refund_credit_amount,
  substring(h."metadataJson" from '"refundedAmount":([0-9]+)') AS refunded_amount,
  substring(h."metadataJson" from '"discountAmount":([0-9]+)') AS discount_amount,
  substring(h."metadataJson" from '"refundChannel":"([^"]+)"') AS refund_channel,
  substring(h."metadataJson" from '"groupPrimaryBookingId":"([^"]+)"') AS group_primary
FROM hers h
WHERE h."metadataJson" IS NOT NULL
  AND (
    h."metadataJson" LIKE '%seasonBookingId%'
    OR h."metadataJson" LIKE '%sessionPrice%'
    OR h."metadataJson" LIKE '%groupPrimaryBookingId%'
    OR h."metadataJson" LIKE '%refundCreditAmount%'
  );

-- Per-payment wallet rail summary for her payments
WITH hers AS (
  SELECT p.id AS payment_id, p.amount, p.method::text, p.status::text, p."bookingId"
  FROM "Payment" p
  WHERE p."userId" = 'cmszubaum002wp537lorvhjmp'
     OR p."bookingId" IN (
       SELECT id FROM "Booking"
       WHERE "userId" = 'cmszubaum002wp537lorvhjmp'
          OR "guestMobile" LIKE '%9022900854%'
     )
)
SELECT
  h.payment_id,
  h."bookingId",
  h.amount::int AS payment_amount,
  h.method,
  h.status AS payment_status,
  COALESCE(SUM(wt.amount) FILTER (WHERE wt.type IN ('PAYMENT_DEBIT','IPG_BOOKING_DEBIT')), 0)::int AS wallet_debited,
  COALESCE(SUM(wt.amount) FILTER (WHERE wt.type = 'REFUND_CREDIT'), 0)::int AS wallet_refunded,
  COALESCE(SUM(wt.amount) FILTER (
    WHERE wt.type IN ('PAYMENT_DEBIT','IPG_BOOKING_DEBIT','REFUND_CREDIT','IPG_BOOKING_CREDIT','ADJUSTMENT')
  ), 0)::int AS wallet_net
FROM hers h
LEFT JOIN "WalletTransaction" wt ON wt."paymentId" = h.payment_id
GROUP BY h.payment_id, h."bookingId", h.amount, h.method, h.status
ORDER BY h.payment_id;

-- Athlete withdrawals
SELECT
  r.id,
  r.amount::int,
  r.status::text,
  (r."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran
FROM "UserWithdrawalRequest" r
WHERE r."userId" = 'cmszubaum002wp537lorvhjmp'
ORDER BY r."createdAt" DESC;
