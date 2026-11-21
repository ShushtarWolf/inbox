-- IB-47 dry-run (READ ONLY): fully-cancelled season primary IPG payments where
-- sessionRefundsTotal < amount but no series-primary-residual REFUND_CREDIT yet.
-- Workflow wraps: BEGIN TRANSACTION READ ONLY; \i this file; ROLLBACK;
--
-- Anchor: payment cmwhw6oye00rsnr33m065fwhu — 360,000 paid, 144,000 session refunds, 216,000 residual.

-- (a) All candidates with proposed wallet credit (same guardrails as sweepSeasonPrimaryResidualIfFullyCancelled)
WITH series_pay AS (
  SELECT
    p.id AS payment_id,
    p.amount,
    p.method,
    p.status AS payment_status,
    p."bookingId" AS primary_booking_id,
    p."userId" AS payment_user_id,
    COALESCE(p."metadataJson"::jsonb ->> 'seasonBookingId', '') AS season_booking_id,
    COALESCE((p."metadataJson"::jsonb ->> 'sessionRefundsTotal')::bigint, 0) AS session_refunds_total,
    COALESCE(p."metadataJson"::jsonb ->> 'seriesResidualSettledAt', '') AS residual_settled_at,
    (p."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS paid_tehran,
    cl.id AS club_id,
    cl.slug AS club_slug,
    RIGHT(COALESCE(u.phone, ''), 4) AS user_phone_last4,
    COALESCE((
      SELECT SUM(wt.amount)::bigint
      FROM "WalletTransaction" wt
      WHERE wt."paymentId" = p.id AND wt.type = 'REFUND_CREDIT'
    ), 0) AS refund_credit_total,
    EXISTS (
      SELECT 1 FROM "WalletTransaction" wt
      WHERE wt."paymentId" = p.id
        AND wt.type = 'REFUND_CREDIT'
        AND wt.note LIKE '%series-primary-residual%'
    ) AS has_residual_refund_row
  FROM "Payment" p
  LEFT JOIN "User" u ON u.id = p."userId"
  LEFT JOIN "Booking" pb ON pb.id = p."bookingId"
  LEFT JOIN "Slot" s ON s.id = pb."slotId"
  LEFT JOIN "Court" c ON c.id = s."courtId"
  LEFT JOIN "Club" cl ON cl.id = c."clubId"
  WHERE p.amount > 0
    AND p.method = 'IPG'
    AND p.status IN ('PAID', 'REFUNDED')
    AND p."metadataJson"::jsonb ? 'seasonBookingId'
    AND COALESCE(p.purpose, 'booking') <> 'topup'
),
active AS (
  SELECT
    sp.payment_id,
    (
      SELECT count(DISTINCT b.id)::bigint
      FROM (
        SELECT e."bookingId" AS booking_id
        FROM "ReservationEvent" e
        WHERE sp.season_booking_id <> ''
          AND e."metadataJson" LIKE '%' || sp.season_booking_id || '%'
        UNION
        SELECT pay."bookingId"
        FROM "Payment" pay
        WHERE sp.season_booking_id <> ''
          AND pay."metadataJson" LIKE '%' || sp.season_booking_id || '%'
          AND pay."bookingId" IS NOT NULL
        UNION
        SELECT sp.primary_booking_id
        WHERE sp.primary_booking_id IS NOT NULL
      ) refs
      JOIN "Booking" b ON b.id = refs.booking_id
      WHERE b.status <> 'CANCELLED'
    ) AS active_sessions
  FROM series_pay sp
),
candidates AS (
  SELECT
    sp.*,
    COALESCE(a.active_sessions, 0) AS active_sessions,
    GREATEST(0, sp.amount - sp.session_refunds_total) AS residual_owed,
    GREATEST(0, sp.amount - sp.session_refunds_total - GREATEST(sp.refund_credit_total, sp.session_refunds_total)) AS would_credit_toman,
    ('series-primary-residual:' || sp.payment_id) AS repair_note,
    ('recon:ib47-season-residual:' || sp.season_booking_id) AS recon_key_hint
  FROM series_pay sp
  LEFT JOIN active a ON a.payment_id = sp.payment_id
  WHERE sp.session_refunds_total > 0
    AND sp.session_refunds_total < sp.amount
    AND COALESCE(a.active_sessions, 0) = 0
    AND sp.payment_status = 'PAID'
    AND NOT sp.has_residual_refund_row
    AND sp.residual_settled_at = ''
)
SELECT
  'ib47_proposed_residual' AS report,
  payment_id,
  primary_booking_id,
  season_booking_id,
  club_id,
  club_slug,
  amount,
  session_refunds_total,
  refund_credit_total,
  residual_owed AS proposed_wallet_credit,
  repair_note,
  recon_key_hint,
  payment_status,
  active_sessions,
  paid_tehran,
  user_phone_last4
FROM candidates
ORDER BY proposed_wallet_credit DESC;

-- (b) Rollup counts / toman
WITH series_pay AS (
  SELECT
    p.id AS payment_id,
    p.amount,
    p.status AS payment_status,
    COALESCE((p."metadataJson"::jsonb ->> 'sessionRefundsTotal')::bigint, 0) AS session_refunds_total,
    COALESCE(p."metadataJson"::jsonb ->> 'seasonBookingId', '') AS season_booking_id,
    COALESCE(p."metadataJson"::jsonb ->> 'seriesResidualSettledAt', '') AS residual_settled_at,
    EXISTS (
      SELECT 1 FROM "WalletTransaction" wt
      WHERE wt."paymentId" = p.id
        AND wt.type = 'REFUND_CREDIT'
        AND wt.note LIKE '%series-primary-residual%'
    ) AS has_residual_refund_row
  FROM "Payment" p
  WHERE p.amount > 0 AND p.method = 'IPG' AND p.status IN ('PAID', 'REFUNDED')
    AND p."metadataJson"::jsonb ? 'seasonBookingId'
),
active AS (
  SELECT
    sp.payment_id,
    (
      SELECT count(DISTINCT b.id)::bigint
      FROM (
        SELECT e."bookingId" AS booking_id
        FROM "ReservationEvent" e
        WHERE sp.season_booking_id <> ''
          AND e."metadataJson" LIKE '%' || sp.season_booking_id || '%'
        UNION
        SELECT pay."bookingId"
        FROM "Payment" pay
        WHERE sp.season_booking_id <> ''
          AND pay."metadataJson" LIKE '%' || sp.season_booking_id || '%'
          AND pay."bookingId" IS NOT NULL
      ) refs
      JOIN "Booking" b ON b.id = refs.booking_id
      WHERE b.status <> 'CANCELLED'
    ) AS active_sessions
  FROM series_pay sp
),
candidates AS (
  SELECT
    sp.payment_id,
    GREATEST(0, sp.amount - sp.session_refunds_total) AS residual_owed
  FROM series_pay sp
  LEFT JOIN active a ON a.payment_id = sp.payment_id
  WHERE sp.session_refunds_total > 0 AND sp.session_refunds_total < sp.amount
    AND COALESCE(a.active_sessions, 0) = 0
    AND sp.payment_status = 'PAID'
    AND NOT sp.has_residual_refund_row
    AND sp.residual_settled_at = ''
)
SELECT
  'ib47_summary' AS report,
  count(*)::int AS candidate_count,
  COALESCE(sum(residual_owed), 0)::bigint AS total_proposed_wallet_credit_toman
FROM candidates;

-- (c) Anchor payment cmwhw6oye00rsnr33m065fwhu (masked phone)
SELECT
  'ib47_anchor' AS report,
  p.id AS payment_id,
  p.amount,
  p.status,
  p."bookingId",
  (p."metadataJson"::jsonb ->> 'sessionRefundsTotal') AS session_refunds_total,
  (p."metadataJson"::jsonb ->> 'seasonBookingId') AS season_booking_id,
  GREATEST(0, p.amount - COALESCE((p."metadataJson"::jsonb ->> 'sessionRefundsTotal')::bigint, 0)) AS residual_owed,
  (
    SELECT count(DISTINCT b.id)
    FROM (
      SELECT e."bookingId" AS booking_id
      FROM "ReservationEvent" e
      WHERE e."metadataJson" LIKE '%' || (p."metadataJson"::jsonb ->> 'seasonBookingId') || '%'
      UNION
      SELECT pay."bookingId"
      FROM "Payment" pay
      WHERE pay."metadataJson" LIKE '%' || (p."metadataJson"::jsonb ->> 'seasonBookingId') || '%'
        AND pay."bookingId" IS NOT NULL
    ) refs
    JOIN "Booking" b ON b.id = refs.booking_id
    WHERE b.status <> 'CANCELLED'
  ) AS active_sessions,
  RIGHT(COALESCE(u.phone, ''), 4) AS user_phone_last4
FROM "Payment" p
LEFT JOIN "User" u ON u.id = p."userId"
WHERE p.id = 'cmwhw6oye00rsnr33m065fwhu';