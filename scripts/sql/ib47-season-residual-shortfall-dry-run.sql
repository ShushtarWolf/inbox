-- IB-47 dry-run (READ ONLY): season primary IPG payments still PAID after all sessions cancelled
-- with sessionRefundsTotal < amount (residual wallet credit missing after owner-season-edit).
-- Run: BEGIN TRANSACTION READ ONLY; \i scripts/sql/ib47-season-residual-shortfall-dry-run.sql; ROLLBACK;

BEGIN TRANSACTION READ ONLY;

WITH series_pay AS (
  SELECT
    p.id AS payment_id,
    p.amount,
    p.method,
    p.status AS payment_status,
    p."bookingId" AS primary_booking_id,
    COALESCE((p."metadataJson"::jsonb ->> 'seasonBookingId'), '') AS season_booking_id,
    COALESCE((p."metadataJson"::jsonb ->> 'sessionRefundsTotal')::bigint, 0) AS session_refunds_total,
    COALESCE((p."metadataJson"::jsonb ->> 'seriesResidualSettledAt'), '') AS residual_settled_at,
  (p."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS paid_tehran,
    p."userId",
    RIGHT(COALESCE(u.phone, ''), 4) AS user_phone_last4
  FROM "Payment" p
  LEFT JOIN "User" u ON u.id = p."userId"
  WHERE p.amount > 0
    AND p.method = 'IPG'
    AND p.status = 'PAID'
    AND p."metadataJson"::jsonb ? 'seasonBookingId'
),
active AS (
  SELECT
    sp.payment_id,
    count(b.id) FILTER (WHERE b.status <> 'CANCELLED') AS active_sessions
  FROM series_pay sp
  JOIN "Booking" b ON b."paymentId" = sp.payment_id
     OR (b.id = sp.primary_booking_id)
     OR (sp.season_booking_id <> '' AND (
          b."metadataJson"::text LIKE '%' || sp.season_booking_id || '%'
          OR EXISTS (
            SELECT 1 FROM "ReservationEvent" e
            WHERE e."bookingId" = b.id AND e."metadataJson" LIKE '%' || sp.season_booking_id || '%'
          )
        ))
  GROUP BY sp.payment_id
)
SELECT
  sp.payment_id,
  sp.primary_booking_id,
  sp.season_booking_id,
  sp.amount,
  sp.session_refunds_total,
  (sp.amount - sp.session_refunds_total) AS residual_owed,
  sp.payment_status,
  sp.paid_tehran,
  sp.user_phone_last4,
  COALESCE(a.active_sessions, 0) AS active_sessions,
  sp.residual_settled_at
FROM series_pay sp
LEFT JOIN active a ON a.payment_id = sp.payment_id
WHERE sp.session_refunds_total > 0
  AND sp.session_refunds_total < sp.amount
  AND COALESCE(a.active_sessions, 0) = 0
ORDER BY residual_owed DESC;

-- IInboxSS / الهه ربیعی (phone …6923) anchor row
SELECT
  p.id AS payment_id,
  p.amount,
  p.status,
  p."bookingId",
  (p."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS paid_tehran,
  (p."metadataJson"::jsonb ->> 'sessionRefundsTotal') AS session_refunds_total,
  (p."metadataJson"::jsonb ->> 'seasonBookingId') AS season_booking_id
FROM "Payment" p
JOIN "User" u ON u.id = p."userId"
WHERE p.id = 'cmwhw6oye00rsnr33m065fwhu'
  AND RIGHT(u.phone, 4) = '6923';

ROLLBACK;