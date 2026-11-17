-- scripts/audit/behnaz-booking-money-audit.sql
-- READ ONLY — booking + money trail for one athlete at one club (Behnaz-style QA).
--
-- Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/audit/behnaz-booking-money-audit.sql
--
-- Before running: edit audit_params in EACH section (search "audit_params AS").
-- Set athlete_user_id OR athlete_phone (98… without +), and club_id OR club_slug.
-- Output masks guest phones elsewhere in the repo; this script does not select full phones.
--
-- Wrapped in READ ONLY — no temp tables / writes.

BEGIN TRANSACTION READ ONLY;

-- ---- RESOLVE ----
WITH audit_params AS (
  SELECT
    NULL::text AS athlete_user_id,
    NULL::text AS athlete_phone,
    NULL::text AS club_id,
    'iust-tennis'::text AS club_slug
),
resolved_user AS (
  SELECT u.id, u.phone
  FROM "User" u
  CROSS JOIN audit_params p
  WHERE (p.athlete_user_id IS NOT NULL AND u.id = p.athlete_user_id)
     OR (p.athlete_user_id IS NULL AND p.athlete_phone IS NOT NULL AND u.phone = p.athlete_phone)
  LIMIT 1
),
resolved_club AS (
  SELECT c.id, c.slug
  FROM "Club" c
  CROSS JOIN audit_params p
  WHERE (p.club_id IS NOT NULL AND c.id = p.club_id)
     OR (p.club_id IS NULL AND p.club_slug IS NOT NULL AND c.slug = p.club_slug)
  LIMIT 1
)
SELECT
  'RESOLVE' AS section,
  ru.id AS athlete_user_id,
  rc.id AS club_id,
  rc.slug AS club_slug,
  CASE WHEN ru.id IS NULL THEN 'set athlete_user_id or athlete_phone in audit_params' END AS user_err,
  CASE WHEN rc.id IS NULL THEN 'set club_id or club_slug in audit_params' END AS club_err
FROM audit_params
LEFT JOIN resolved_user ru ON true
LEFT JOIN resolved_club rc ON true;

-- ---- BOOKINGS ----
WITH audit_params AS (
  SELECT NULL::text AS athlete_user_id, NULL::text AS athlete_phone, NULL::text AS club_id, 'iust-tennis'::text AS club_slug
),
resolved_user AS (
  SELECT u.id FROM "User" u CROSS JOIN audit_params p
  WHERE (p.athlete_user_id IS NOT NULL AND u.id = p.athlete_user_id)
     OR (p.athlete_user_id IS NULL AND p.athlete_phone IS NOT NULL AND u.phone = p.athlete_phone)
  LIMIT 1
),
resolved_club AS (
  SELECT c.id FROM "Club" c CROSS JOIN audit_params p
  WHERE (p.club_id IS NOT NULL AND c.id = p.club_id)
     OR (p.club_id IS NULL AND p.club_slug IS NOT NULL AND c.slug = p.club_slug)
  LIMIT 1
)
SELECT
  'BOOKINGS' AS section,
  b.id AS booking_id,
  b.status AS booking_status,
  b."paymentStatus" AS booking_payment_status,
  b."paymentMethod" AS booking_payment_method,
  b.source,
  b."cancellationReason",
  (b."createdAt"   AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  (b."cancelledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS cancelled_tehran,
  s.date AS slot_date,
  s."startTime",
  s."displayStatus" AS slot_display_status,
  co."nameFa" AS court,
  pay.id AS payment_id,
  pay.amount,
  pay.method AS payment_method,
  pay.status AS payment_status,
  pay."metadataJson" AS payment_meta
FROM "Booking" b
JOIN "Slot" s ON s.id = b."slotId"
JOIN "Court" co ON co.id = s."courtId"
JOIN resolved_club rc ON co."clubId" = rc.id
JOIN resolved_user ru ON b."userId" = ru.id
LEFT JOIN "Payment" pay ON pay."bookingId" = b.id
ORDER BY s.date DESC, s."startTime" DESC;

-- ---- WALLET LEDGER ----
WITH audit_params AS (
  SELECT NULL::text AS athlete_user_id, NULL::text AS athlete_phone, NULL::text AS club_id, 'iust-tennis'::text AS club_slug
),
resolved_user AS (
  SELECT u.id FROM "User" u CROSS JOIN audit_params p
  WHERE (p.athlete_user_id IS NOT NULL AND u.id = p.athlete_user_id)
     OR (p.athlete_user_id IS NULL AND p.athlete_phone IS NOT NULL AND u.phone = p.athlete_phone)
  LIMIT 1
),
resolved_club AS (
  SELECT c.id FROM "Club" c CROSS JOIN audit_params p
  WHERE (p.club_id IS NOT NULL AND c.id = p.club_id)
     OR (p.club_id IS NULL AND p.club_slug IS NOT NULL AND c.slug = p.club_slug)
  LIMIT 1
),
club_bookings AS (
  SELECT b.id AS booking_id
  FROM "Booking" b
  JOIN "Slot" s ON s.id = b."slotId"
  JOIN "Court" co ON co.id = s."courtId"
  JOIN resolved_club rc ON co."clubId" = rc.id
  JOIN resolved_user ru ON b."userId" = ru.id
)
SELECT
  'WALLET_LEDGER' AS section,
  wt.id,
  wt.type,
  wt.amount,
  wt.note,
  (wt."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  wt."paymentId",
  wt."bookingId"
FROM "WalletTransaction" wt
JOIN "Wallet" w ON w.id = wt."walletId"
JOIN resolved_user ru ON w."userId" = ru.id
WHERE wt."bookingId" IN (SELECT booking_id FROM club_bookings)
   OR wt."paymentId" IN (
     SELECT pay.id FROM "Payment" pay WHERE pay."bookingId" IN (SELECT booking_id FROM club_bookings)
   )
ORDER BY wt."createdAt", wt.id;

-- ---- CLUB WALLET LEDGER ----
WITH audit_params AS (
  SELECT NULL::text AS athlete_user_id, NULL::text AS athlete_phone, NULL::text AS club_id, 'iust-tennis'::text AS club_slug
),
resolved_user AS (
  SELECT u.id FROM "User" u CROSS JOIN audit_params p
  WHERE (p.athlete_user_id IS NOT NULL AND u.id = p.athlete_user_id)
     OR (p.athlete_user_id IS NULL AND p.athlete_phone IS NOT NULL AND u.phone = p.athlete_phone)
  LIMIT 1
),
resolved_club AS (
  SELECT c.id FROM "Club" c CROSS JOIN audit_params p
  WHERE (p.club_id IS NOT NULL AND c.id = p.club_id)
     OR (p.club_id IS NULL AND p.club_slug IS NOT NULL AND c.slug = p.club_slug)
  LIMIT 1
),
club_bookings AS (
  SELECT b.id AS booking_id
  FROM "Booking" b
  JOIN "Slot" s ON s.id = b."slotId"
  JOIN "Court" co ON co.id = s."courtId"
  JOIN resolved_club rc ON co."clubId" = rc.id
  JOIN resolved_user ru ON b."userId" = ru.id
)
SELECT
  'CLUB_WALLET_LEDGER' AS section,
  cwt.id,
  cwt.type,
  cwt.amount,
  cwt.note,
  (cwt."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  cwt."paymentId",
  cwt."bookingId"
FROM "ClubWalletTransaction" cwt
JOIN resolved_club rc ON cwt."clubId" = rc.id
WHERE cwt."bookingId" IN (SELECT booking_id FROM club_bookings)
   OR cwt."paymentId" IN (
     SELECT pay.id FROM "Payment" pay WHERE pay."bookingId" IN (SELECT booking_id FROM club_bookings)
   )
ORDER BY cwt."createdAt", cwt.id;

-- ---- FLAGS ----
WITH audit_params AS (
  SELECT NULL::text AS athlete_user_id, NULL::text AS athlete_phone, NULL::text AS club_id, 'iust-tennis'::text AS club_slug
),
resolved_user AS (
  SELECT u.id FROM "User" u CROSS JOIN audit_params p
  WHERE (p.athlete_user_id IS NOT NULL AND u.id = p.athlete_user_id)
     OR (p.athlete_user_id IS NULL AND p.athlete_phone IS NOT NULL AND u.phone = p.athlete_phone)
  LIMIT 1
),
resolved_club AS (
  SELECT c.id FROM "Club" c CROSS JOIN audit_params p
  WHERE (p.club_id IS NOT NULL AND c.id = p.club_id)
     OR (p.club_id IS NULL AND p.club_slug IS NOT NULL AND c.slug = p.club_slug)
  LIMIT 1
),
rows AS (
  SELECT
    b.id AS booking_id,
    b.status AS booking_status,
    b."paymentMethod" AS booking_payment_method,
    s."displayStatus" AS slot_display_status,
    pay.id AS payment_id,
    pay.status AS payment_status,
    pay.method AS payment_method,
    pay.amount AS payment_amount,
    pay."metadataJson" AS payment_meta,
    (regexp_match(COALESCE(pay."metadataJson", ''), '"coveredByBookingId"\s*:\s*"([^"]+)"'))[1] AS covered_by
  FROM "Booking" b
  JOIN "Slot" s ON s.id = b."slotId"
  JOIN "Court" co ON co.id = s."courtId"
  JOIN resolved_club rc ON co."clubId" = rc.id
  JOIN resolved_user ru ON b."userId" = ru.id
  LEFT JOIN "Payment" pay ON pay."bookingId" = b.id
),
refunds AS (
  SELECT
    wt."bookingId",
    wt."paymentId",
    COUNT(*) FILTER (WHERE wt.type = 'REFUND_CREDIT') AS refund_credit_count,
    COALESCE(SUM(wt.amount) FILTER (WHERE wt.type = 'REFUND_CREDIT'), 0) AS refund_credit_sum
  FROM "WalletTransaction" wt
  WHERE wt."bookingId" IN (SELECT booking_id FROM rows)
     OR wt."paymentId" IN (SELECT payment_id FROM rows WHERE payment_id IS NOT NULL)
  GROUP BY wt."bookingId", wt."paymentId"
)
SELECT 'FLAGS' AS section, booking_id, payment_id, flag, detail
FROM (
  SELECT r.booking_id, r.payment_id,
    'cancelled_but_paid_no_wallet_refund' AS flag,
    'CANCELLED + online PAID + zero REFUND_CREDIT for this row' AS detail
  FROM rows r
  LEFT JOIN refunds rf ON rf."bookingId" = r.booking_id
  WHERE r.booking_status = 'CANCELLED'
    AND r.payment_status = 'PAID'
    AND COALESCE(r.payment_method, r.booking_payment_method) IN ('IPG', 'PAID')
    AND COALESCE(rf.refund_credit_sum, 0) = 0

  UNION ALL

  SELECT r.booking_id, r.payment_id,
    'payment_refunded_booking_live',
    'Payment REFUNDED while Booking not CANCELLED'
  FROM rows r
  WHERE r.payment_status = 'REFUNDED' AND r.booking_status <> 'CANCELLED'

  UNION ALL

  SELECT r.booking_id, r.payment_id,
    'booking_cancelled_slot_not_free',
    'Booking CANCELLED but Slot displayStatus not FREE'
  FROM rows r
  WHERE r.booking_status = 'CANCELLED'
    AND r.slot_display_status NOT IN ('FREE', 'CANCELLED')

  UNION ALL

  SELECT r.booking_id, r.covered_by,
    'series_sibling_cancel_primary_still_paid',
    'Covered sibling cancelled; primary payment still PAID — owner single-slot cancel path?'
  FROM rows r
  JOIN "Payment" primary_pay ON primary_pay."bookingId" = r.covered_by
  WHERE r.booking_status = 'CANCELLED'
    AND r.covered_by IS NOT NULL
    AND primary_pay.status = 'PAID'
    AND COALESCE(
      (SELECT refund_credit_sum FROM refunds rf WHERE rf."paymentId" = primary_pay.id),
      0
    ) = 0

  UNION ALL

  SELECT rf."bookingId", rf."paymentId",
    'refund_credit_twice',
    'multiple REFUND_CREDIT rows for same booking+payment'
  FROM refunds rf
  WHERE rf.refund_credit_count > 1

  UNION ALL

  SELECT NULL::text, pay.id,
    'payment_without_booking',
    'Payment purpose=booking but bookingId IS NULL for this user'
  FROM "Payment" pay
  JOIN resolved_user ru ON pay."userId" = ru.id
  WHERE pay.purpose = 'booking' AND pay."bookingId" IS NULL
) x
ORDER BY flag, booking_id;

-- ---- EVENTS ----
WITH audit_params AS (
  SELECT NULL::text AS athlete_user_id, NULL::text AS athlete_phone, NULL::text AS club_id, 'iust-tennis'::text AS club_slug
),
resolved_user AS (
  SELECT u.id FROM "User" u CROSS JOIN audit_params p
  WHERE (p.athlete_user_id IS NOT NULL AND u.id = p.athlete_user_id)
     OR (p.athlete_user_id IS NULL AND p.athlete_phone IS NOT NULL AND u.phone = p.athlete_phone)
  LIMIT 1
),
resolved_club AS (
  SELECT c.id FROM "Club" c CROSS JOIN audit_params p
  WHERE (p.club_id IS NOT NULL AND c.id = p.club_id)
     OR (p.club_id IS NULL AND p.club_slug IS NOT NULL AND c.slug = p.club_slug)
  LIMIT 1
)
SELECT
  'EVENTS' AS section,
  re."createdAt",
  re.type,
  re."metadataJson",
  b.id AS booking_id,
  s.date,
  s."startTime"
FROM "ReservationEvent" re
JOIN "Booking" b ON b.id = re."bookingId"
JOIN "Slot" s ON s.id = b."slotId"
JOIN "Court" co ON co.id = s."courtId"
JOIN resolved_club rc ON co."clubId" = rc.id
JOIN resolved_user ru ON b."userId" = ru.id
ORDER BY re."createdAt" DESC
LIMIT 200;

-- ---- REFUND RECON ----
WITH audit_params AS (
  SELECT NULL::text AS athlete_user_id, NULL::text AS athlete_phone, NULL::text AS club_id, 'iust-tennis'::text AS club_slug
),
resolved_user AS (
  SELECT u.id FROM "User" u CROSS JOIN audit_params p
  WHERE (p.athlete_user_id IS NOT NULL AND u.id = p.athlete_user_id)
     OR (p.athlete_user_id IS NULL AND p.athlete_phone IS NOT NULL AND u.phone = p.athlete_phone)
  LIMIT 1
)
SELECT
  'REFUND_RECON' AS section,
  rr.id,
  rr."paymentId",
  rr.amount,
  rr.reason,
  (rr."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran
FROM "RefundReconciliation" rr
JOIN resolved_user ru ON rr."userId" = ru.id
ORDER BY rr."createdAt" DESC;

ROLLBACK;