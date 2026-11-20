-- IB-48: athlete self-cancel inside 24h window — iust-tennis, slot 2026-11-21 07:00 Tehran
-- READ ONLY. Phones masked to last 4.

-- Club settings
SELECT
  cl.id AS club_id,
  cl.slug,
  cl."nameFa",
  cl."cancellationWindowHours",
  cl."insideWindowRefundBps",
  cl."rescheduleWindowHours"
FROM "Club" cl
WHERE cl.slug = 'iust-tennis';

-- Bookings on 2026-11-21 around 07:00 at iust-tennis (guest name / user name Behnaz)
SELECT
  b.id AS booking_id,
  b.status,
  b.source,
  b."paymentMethod",
  b."paymentStatus",
  b."cancellationReason",
  b."cancelledByUserId",
  (b."createdAt"   AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  (b."cancelledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS cancelled_tehran,
  s.date AS slot_date,
  s."startTime",
  s."endTime",
  c."nameFa" AS court,
  u.id AS user_id,
  u.name AS user_name,
  u."nameFamily" AS user_family,
  RIGHT(COALESCE(u.phone, b."guestMobile", ''), 4) AS phone_last4,
  p.id AS payment_id,
  p.method AS payment_method,
  p.status AS payment_status,
  p.amount,
  p.provider
FROM "Booking" b
JOIN "Slot" s ON s.id = b."slotId"
JOIN "Court" c ON c.id = s."courtId"
JOIN "Club" cl ON cl.id = c."clubId"
LEFT JOIN "User" u ON u.id = b."userId"
LEFT JOIN "Payment" p ON p."bookingId" = b.id
WHERE cl.slug = 'iust-tennis'
  AND s.date = '2026-11-21'
  AND s."startTime" >= '06:00'
  AND s."startTime" <= '08:00'
  AND (
    LOWER(COALESCE(u.name, '')) LIKE '%behnaz%'
    OR LOWER(COALESCE(b."guestName", '')) LIKE '%behnaz%'
    OR LOWER(COALESCE(u."nameFamily", '')) LIKE '%behnaz%'
  )
ORDER BY s."startTime", b."createdAt";

-- If no name match: all iust bookings that morning (cancelled or not) on 2026-11-21 07:00
SELECT
  b.id AS booking_id,
  b.status,
  b.source,
  b."cancellationReason",
  b."cancelledByUserId",
  (b."createdAt"   AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  (b."cancelledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS cancelled_tehran,
  u.name,
  u."nameFamily",
  RIGHT(COALESCE(u.phone, b."guestMobile", ''), 4) AS phone_last4
FROM "Booking" b
JOIN "Slot" s ON s.id = b."slotId"
JOIN "Court" c ON c.id = s."courtId"
JOIN "Club" cl ON cl.id = c."clubId"
LEFT JOIN "User" u ON u.id = b."userId"
WHERE cl.slug = 'iust-tennis'
  AND s.date = '2026-11-21'
  AND s."startTime" = '07:00:00'
ORDER BY b."createdAt";

-- Wallet / payment trail for bookings from prior query (by id subquery)
WITH target AS (
  SELECT b.id AS booking_id
  FROM "Booking" b
  JOIN "Slot" s ON s.id = b."slotId"
  JOIN "Court" c ON c.id = s."courtId"
  JOIN "Club" cl ON cl.id = c."clubId"
  WHERE cl.slug = 'iust-tennis'
    AND s.date = '2026-11-21'
    AND s."startTime" = '07:00:00'
)
SELECT
  wt.id,
  wt.type,
  wt.amount,
  wt.note,
  (wt."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  wt."bookingId",
  wt."paymentId",
  w."userId" AS wallet_user_id
FROM "WalletTransaction" wt
JOIN "Wallet" w ON w.id = wt."walletId"
WHERE wt."bookingId" IN (SELECT booking_id FROM target)
   OR wt."paymentId" IN (
     SELECT p.id FROM "Payment" p WHERE p."bookingId" IN (SELECT booking_id FROM target)
   )
ORDER BY wt."createdAt";