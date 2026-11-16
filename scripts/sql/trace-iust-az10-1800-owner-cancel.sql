-- trace-iust-az10-1800-owner-cancel.sql
-- READ ONLY. Behnaz 2026-11-16 report: IUST court 3, ۱۴۰۵/۰۹/۱۰ ۱۸:۰۰ (Gregorian 2026-12-01), 5,000 toman IPG.
-- Run:
--   BEGIN TRANSACTION READ ONLY;
--   \i scripts/sql/trace-iust-az10-1800-owner-cancel.sql
--   ROLLBACK;

SELECT
  b.id                                   AS booking_id,
  s.date                                 AS slot_date,
  s."startTime"                          AS start_time,
  s."displayStatus"                      AS slot_display_status,
  c."nameFa"                             AS court,
  b.status                               AS booking_status,
  b."paymentStatus"                      AS booking_payment_status,
  b."paymentMethod"                      AS booking_payment_method,
  b."cancellationReason",
  (b."createdAt"   AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  (b."cancelledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS cancelled_tehran,
  p.id                                   AS payment_id,
  p.amount,
  p.method,
  p.status                               AS payment_status,
  p."metadataJson"                       AS payment_meta
FROM "Booking" b
JOIN "Slot" s   ON s.id = b."slotId"
JOIN "Court" c  ON c.id = s."courtId"
JOIN "Club" cl  ON cl.id = c."clubId"
LEFT JOIN "Payment" p ON p."bookingId" = b.id
WHERE cl.slug = 'iust-tennis'
  AND s.date = '2026-12-01'
  AND s."startTime" IN ('18:00', '18:00:00')
  AND c."nameFa" ILIKE '%زمین ۳%'
ORDER BY b."createdAt" DESC;

SELECT
  re."createdAt",
  re.type,
  re."metadataJson"
FROM "ReservationEvent" re
JOIN "Booking" b ON b.id = re."bookingId"
JOIN "Slot" s ON s.id = b."slotId"
JOIN "Court" c ON c.id = s."courtId"
JOIN "Club" cl ON cl.id = c."clubId"
WHERE cl.slug = 'iust-tennis'
  AND s.date = '2026-12-01'
  AND s."startTime" IN ('18:00', '18:00:00')
  AND c."nameFa" ILIKE '%زمین ۳%'
ORDER BY re."createdAt";