-- READ ONLY. Trace SEP card payments that the bank captured but the app left unpaid
-- (verify body had no ResNum -> reject_foreign, fixed in fix/sep-verify-no-resnum).
-- Phones masked. No writes. Run: psql "$DATABASE_URL" -f scripts/sql/trace-sep-verify-reject.sql
BEGIN TRANSACTION READ ONLY;

-- 1) Order with tracking code 9039168 (code = 1000000 + first 8 hex of sha256('track:'||bookingId) mod 9000000)
WITH b AS (
  SELECT b.id, b.status, b."paymentStatus", b."createdAt", b."userId", s.date, s."startTime", s."endTime",
         c."nameFa" AS court, cl."nameFa" AS club,
         1000000 + (('x' || lpad(substr(encode(sha256(('track:' || b.id)::bytea), 'hex'), 1, 8), 16, '0'))::bit(64)::bigint % 9000000) AS tracking
  FROM "Booking" b
  JOIN "Slot" s ON s.id = b."slotId"
  JOIN "Court" c ON c.id = s."courtId"
  JOIN "Club" cl ON cl.id = c."clubId"
  WHERE s.date BETWEEN '2026-11-13' AND '2026-11-15'
)
SELECT b.id AS booking_id, b.tracking, b.club, b.court, b.date, b."startTime", b."endTime",
       b.status, b."paymentStatus", b."createdAt" AT TIME ZONE 'Asia/Tehran' AS booked_tehran,
       left(u.phone, 4) || '****' || right(u.phone, 2) AS athlete_phone
FROM b LEFT JOIN "User" u ON u.id = b."userId"
WHERE b.tracking = 9039168;

-- 2) Every payment attempt on that booking (incl. superseded/detached), with what verify returned
SELECT p.id, p.status, p.method, p.provider, p.amount AS toman, p."providerRef" AS resnum, p."gatewayRef",
       p."createdAt" AT TIME ZONE 'Asia/Tehran' AS created_tehran, p."updatedAt" AT TIME ZONE 'Asia/Tehran' AS updated_tehran,
       p."metadataJson"::jsonb ->> 'refNum'              AS refnum,
       p."metadataJson"::jsonb ->> 'verifyPendingRefNum' AS verify_pending_refnum,
       p."metadataJson"::jsonb ->> 'verifyCode'          AS verify_code,
       p."metadataJson"::jsonb ->> 'verifyMessage'       AS verify_message,
       p."metadataJson"::jsonb ->  'verifyRejected'      AS verify_rejected,   -- only after the fix
       p."metadataJson"::jsonb ->> 'gatewayReversed'     AS gateway_reversed,
       p."metadataJson"::jsonb ->> 'failReason'          AS fail_reason,
       p."metadataJson"::jsonb ->> 'sepStatus'           AS token_status
FROM "Payment" p
WHERE p."bookingId" IN (
        SELECT b.id FROM "Booking" b JOIN "Slot" s ON s.id = b."slotId"
        WHERE s.date BETWEEN '2026-11-13' AND '2026-11-15'
          AND 1000000 + (('x' || lpad(substr(encode(sha256(('track:' || b.id)::bytea), 'hex'), 1, 8), 16, '0'))::bit(64)::bigint % 9000000) = 9039168)
   OR p."metadataJson"::jsonb ->> 'detachedFromBookingId' IN (
        SELECT b.id FROM "Booking" b JOIN "Slot" s ON s.id = b."slotId"
        WHERE s.date BETWEEN '2026-11-13' AND '2026-11-15'
          AND 1000000 + (('x' || lpad(substr(encode(sha256(('track:' || b.id)::bytea), 'hex'), 1, 8), 16, '0'))::bit(64)::bigint % 9000000) = 9039168)
ORDER BY p."createdAt";

-- 3) Blast radius: live SEP rows since #123 (2026-11-07 18:11 Tehran). If PAID = 0 with real
--    attempts, every live card payment since then hit the bug.
SELECT date_trunc('day', p."createdAt" AT TIME ZONE 'Asia/Tehran') AS day_tehran, p.status, count(*) AS n, sum(p.amount) AS toman
FROM "Payment" p
WHERE p.provider = 'sep' AND p."providerRef" LIKE 'INB%'
  AND p."createdAt" >= TIMESTAMPTZ '2026-11-01 00:00+03:30'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 4) Last real SEP payment that reached PAID (expect: before 2026-11-07 18:11 Tehran)
SELECT max(p."updatedAt") AT TIME ZONE 'Asia/Tehran' AS last_paid_tehran
FROM "Payment" p WHERE p.provider = 'sep' AND p."providerRef" LIKE 'INB%' AND p.status = 'PAID';

ROLLBACK;
