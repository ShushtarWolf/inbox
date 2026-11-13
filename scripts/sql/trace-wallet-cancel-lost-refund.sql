-- trace-wallet-cancel-lost-refund.sql
-- READ ONLY. Finds wallet-paid court bookings that were cancelled while the athlete's wallet
-- debit was never returned and the club books show nothing either ("stranded" money).
--
-- Run (psql, production replica or prod — nothing is written):
--   BEGIN TRANSACTION READ ONLY;
--   \i scripts/sql/trace-wallet-cancel-lost-refund.sql
--   ROLLBACK;
--
-- Prisma stores DateTime as UTC "timestamp(3) without time zone"; *_tehran columns convert.
-- Amounts are toman (Payment.amount / WalletTransaction.amount as stored).
-- No secrets are selected (no sheba, no password hashes, phones masked to last 4 digits).

-- ---------------------------------------------------------------------------
-- (a) The reported case: club iust-tennis, booking for 2026-11-13 09:00, amount 5,000,
--     booked + cancelled on 2026-11-12 evening Tehran, cancelled from the owner side.
--     Widened to both days / any hour so a slightly different slot still shows up.
-- ---------------------------------------------------------------------------

-- a1. Candidate bookings (active or cancelled) on that club for Nov 12–13.
SELECT
  b.id                                   AS booking_id,
  s.date                                 AS slot_date,
  s."startTime"                          AS start_time,
  c."nameFa"                             AS court,
  b.status                               AS booking_status,
  b."paymentStatus"                      AS booking_payment_status,
  b."paymentMethod"                      AS booking_payment_method,
  b.source,
  b."cancellationReason",
  (b."createdAt"   AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  (b."cancelledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS cancelled_tehran,
  b."userId",
  RIGHT(COALESCE(b."guestMobile", ''), 4) AS guest_mobile_last4,
  p.id                                   AS payment_id,
  p.amount, p.method, p.status AS payment_status, p.provider, p."userId" AS payment_user_id,
  p."metadataJson"                       AS payment_meta
FROM "Booking" b
JOIN "Slot" s   ON s.id = b."slotId"
JOIN "Court" c  ON c.id = s."courtId"
JOIN "Club" cl  ON cl.id = c."clubId"
LEFT JOIN "Payment" p ON p."bookingId" = b.id
WHERE cl.slug = 'iust-tennis'
  AND s.date IN ('2026-11-12', '2026-11-13')
ORDER BY s.date, s."startTime", c."nameFa";

-- a2. Every athlete-wallet row of 5,000 on Nov 12–13 Tehran that points at an iust-tennis
--     booking or payment (also catches a booking row later deleted by a re-book).
WITH club AS (SELECT id FROM "Club" WHERE slug = 'iust-tennis')
SELECT
  wt.id, wt.type, wt.amount, wt.note,
  (wt."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
  w."userId"                 AS wallet_user_id,
  wt."paymentId", wt."bookingId",
  p.method, p.status AS payment_status, p.amount AS payment_amount,
  b.status AS booking_status, s.date AS slot_date, s."startTime" AS start_time
FROM "WalletTransaction" wt
JOIN "Wallet" w ON w.id = wt."walletId"
LEFT JOIN "Payment" p ON p.id = wt."paymentId"
LEFT JOIN "Booking" b ON b.id = COALESCE(wt."bookingId", p."bookingId")
LEFT JOIN "Slot" s ON s.id = b."slotId"
LEFT JOIN "Court" c ON c.id = s."courtId"
WHERE ABS(wt.amount) = 5000
  AND (wt."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') >= '2026-11-12 00:00'
  AND (wt."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') <  '2026-11-14 00:00'
  AND (
    c."clubId" = (SELECT id FROM club)
    OR p."metadataJson" LIKE '%"detachedClubId":"' || (SELECT id FROM club) || '"%'
    OR (b.id IS NULL AND COALESCE(p.purpose, '') <> 'topup'
        AND wt.type IN ('PAYMENT_DEBIT','REFUND_CREDIT','IPG_BOOKING_CREDIT','IPG_BOOKING_DEBIT'))  -- orphan: booking row gone; inspect by hand
  )
ORDER BY wt."createdAt";

-- a3. Full money trail for those bookings: payment rows (incl. superseded), wallet rows,
--     settlement ledger, club wallet rows, reservation events.
WITH target AS (
  SELECT b.id AS booking_id, p.id AS payment_id
  FROM "Booking" b
  JOIN "Slot" s  ON s.id = b."slotId"
  JOIN "Court" c ON c.id = s."courtId"
  JOIN "Club" cl ON cl.id = c."clubId"
  LEFT JOIN "Payment" p ON p."bookingId" = b.id
  WHERE cl.slug = 'iust-tennis'
    AND s.date IN ('2026-11-12', '2026-11-13')
    AND (p.amount = 5000 OR s.price = 5000)
)
SELECT 'payment' AS src, p.id, p."bookingId", NULL::text AS type, p.amount, p.method::text, p.status::text,
       (p."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS at_tehran, p."metadataJson" AS detail
FROM "Payment" p
WHERE p."bookingId" IN (SELECT booking_id FROM target)
   OR p."supersededByPaymentId" IN (SELECT payment_id FROM target)
UNION ALL
SELECT 'wallet_tx', wt.id, wt."bookingId", wt.type::text, wt.amount, w."userId", wt.note,
       (wt."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran'), NULL
FROM "WalletTransaction" wt JOIN "Wallet" w ON w.id = wt."walletId"
WHERE wt."paymentId" IN (SELECT payment_id FROM target) OR wt."bookingId" IN (SELECT booking_id FROM target)
UNION ALL
SELECT 'settlement', sle.id, sle."bookingId", NULL, sle.gross, sle."ownerNet"::text,
       CASE WHEN sle."clawedBackAt" IS NULL THEN 'open' ELSE 'clawed' END,
       (sle."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran'), 'commissionBps=' || sle."commissionBps"
FROM "SettlementLedgerEntry" sle
WHERE sle."paymentId" IN (SELECT payment_id FROM target)
UNION ALL
SELECT 'club_wallet_tx', cwt.id, cwt."bookingId", cwt.type::text, cwt.amount, NULL, cwt.note,
       (cwt."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran'), NULL
FROM "ClubWalletTransaction" cwt
WHERE cwt."paymentId" IN (SELECT payment_id FROM target) OR cwt."bookingId" IN (SELECT booking_id FROM target)
UNION ALL
SELECT 'event', re.id, re."bookingId", re.type::text, NULL, re."actorUserId", NULL,
       (re."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran'), re."metadataJson"
FROM "ReservationEvent" re
WHERE re."bookingId" IN (SELECT booking_id FROM target)
ORDER BY at_tehran;

-- ---------------------------------------------------------------------------
-- (b) Platform-wide (rows: one per payment × debited wallet): cancelled bookings whose payment took money from an athlete wallet
--     (full wallet checkout PAYMENT_DEBIT, or wallet-first IPG pair) and where the wallet
--     never got it back AND the club has no kept share on its books.
--     net_wallet < 0  → athlete still short
--     club_net   = 0  → club books show nothing (no BOOKING_CREDIT, or credit fully clawed)
-- ---------------------------------------------------------------------------
WITH payer AS (
  -- The wallet(s) money was actually taken from for this payment.
  SELECT DISTINCT wt."paymentId" AS payment_id, wt."walletId" AS wallet_id
  FROM "WalletTransaction" wt
  WHERE wt."paymentId" IS NOT NULL AND wt.type IN ('PAYMENT_DEBIT','IPG_BOOKING_DEBIT')
),
rail AS (
  SELECT
    pw.payment_id,
    MIN(w."userId")                                           AS payer_user_id,
    SUM(wt.amount) FILTER (WHERE wt.type IN ('PAYMENT_DEBIT','IPG_BOOKING_DEBIT'))      AS debited,
    SUM(wt.amount) FILTER (WHERE wt.type IN ('REFUND_CREDIT'))                          AS refunded,
    SUM(wt.amount) FILTER (WHERE wt.type IN ('PAYMENT_DEBIT','REFUND_CREDIT','IPG_BOOKING_CREDIT','IPG_BOOKING_DEBIT','ADJUSTMENT')) AS net_wallet,
    (SELECT COALESCE(SUM(o.amount), 0) FROM "WalletTransaction" o
      WHERE o."paymentId" = pw.payment_id AND o.type = 'REFUND_CREDIT' AND o."walletId" <> pw.wallet_id) AS refunded_to_other_wallet
  FROM payer pw
  JOIN "Wallet" w ON w.id = pw.wallet_id
  JOIN "WalletTransaction" wt ON wt."paymentId" = pw.payment_id AND wt."walletId" = pw.wallet_id
  GROUP BY pw.payment_id, pw.wallet_id
),
club_side AS (
  SELECT cwt."paymentId" AS payment_id,
         SUM(cwt.amount) FILTER (WHERE cwt.type = 'BOOKING_CREDIT') AS club_credit,
         SUM(cwt.amount) FILTER (WHERE cwt.type = 'CLAWBACK')       AS club_clawback,
         SUM(cwt.amount) FILTER (WHERE cwt.type IN ('BOOKING_CREDIT','CLAWBACK')) AS club_net
  FROM "ClubWalletTransaction" cwt
  WHERE cwt."paymentId" IS NOT NULL
  GROUP BY cwt."paymentId"
)
SELECT
  cl.slug                                   AS club,
  b.id                                      AS booking_id,
  s.date, s."startTime",
  b."cancellationReason",
  (b."cancelledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS cancelled_tehran,
  p.id                                      AS payment_id,
  p.method, p.status AS payment_status, p.amount,
  r.payer_user_id, b."userId" AS booking_user_id,
  (r.payer_user_id IS DISTINCT FROM b."userId") AS payer_differs_from_booking_user,
  r.debited, COALESCE(r.refunded, 0) AS refunded, r.net_wallet, r.refunded_to_other_wallet,
  COALESCE(cs.club_credit, 0) AS club_credit, COALESCE(cs.club_clawback, 0) AS club_clawback,
  COALESCE(cs.club_net, 0) AS club_net,
  (sle.id IS NOT NULL) AS has_settlement_row,
  (p."metadataJson" LIKE '%"gatewayReversed":true%' OR p."metadataJson" LIKE '%"gatewayRefund":true%') AS stale_gateway_flag,
  (p."metadataJson" LIKE '%"reversePending":true%') AS stale_reverse_pending,
  p."metadataJson" LIKE '%"refundChannel":"desk_cash"%' AS refunded_as_desk_cash
FROM rail r
JOIN "Payment" p           ON p.id = r.payment_id
LEFT JOIN "Booking" b      ON b.id = p."bookingId"
LEFT JOIN "Slot" s         ON s.id = b."slotId"
LEFT JOIN "Court" c        ON c.id = s."courtId"
LEFT JOIN "Club" cl        ON cl.id = c."clubId"
LEFT JOIN club_side cs     ON cs.payment_id = p.id
LEFT JOIN "SettlementLedgerEntry" sle ON sle."paymentId" = p.id
WHERE p.purpose <> 'topup'
  AND COALESCE(r.debited, 0) < 0
  AND r.net_wallet < 0                                   -- athlete still short
  AND (COALESCE(cs.club_net, 0) = 0                      -- club books show nothing kept
       OR r.refunded_to_other_wallet > 0)                -- or the refund went to someone else
  AND (b.status = 'CANCELLED' OR p.status IN ('REFUNDED','FAILED','SUPERSEDED'))  -- detached (re-booked) rows have bookingId NULL and land here via status
ORDER BY b."cancelledAt" DESC NULLS LAST;

-- b2. Same check for the opposite gap: booking cancelled, athlete refunded nothing,
--     but the club still holds the credit (a kept share) — expected only for athlete
--     cancels inside the deadline with insideWindowRefundBps < 10000. Listed for review.
-- (uncomment when needed)
-- ... see (b) with: AND COALESCE(cs.club_net,0) > 0 AND COALESCE(r.refunded,0) = 0

-- ---------------------------------------------------------------------------
-- (c) DRY-RUN PROPOSAL ONLY — nothing here writes. For each stranded row from (b), the
--     correction the code would now make on cancel: credit the payer wallet the missing
--     amount (owner/coach cancel, or athlete cancel outside the deadline = 100%), or, if the
--     club policy kept a share, record that share on the club books. Review with the user
--     before any apply; no apply script is provided.
-- ---------------------------------------------------------------------------
WITH payer AS (
  SELECT DISTINCT wt."paymentId" AS payment_id, wt."walletId" AS wallet_id
  FROM "WalletTransaction" wt
  WHERE wt."paymentId" IS NOT NULL AND wt.type IN ('PAYMENT_DEBIT','IPG_BOOKING_DEBIT')
),
rail AS (
  SELECT pw.payment_id, MIN(w."userId") AS payer_user_id,
         SUM(wt.amount) FILTER (WHERE wt.type IN ('PAYMENT_DEBIT','REFUND_CREDIT','IPG_BOOKING_CREDIT','IPG_BOOKING_DEBIT','ADJUSTMENT')) AS net_wallet,
         SUM(wt.amount) FILTER (WHERE wt.type IN ('PAYMENT_DEBIT','IPG_BOOKING_DEBIT')) AS debited
  FROM payer pw
  JOIN "Wallet" w ON w.id = pw.wallet_id
  JOIN "WalletTransaction" wt ON wt."paymentId" = pw.payment_id AND wt."walletId" = pw.wallet_id
  GROUP BY pw.payment_id, pw.wallet_id
),
club_side AS (
  SELECT "paymentId" AS payment_id, SUM(amount) AS club_net
  FROM "ClubWalletTransaction" WHERE type IN ('BOOKING_CREDIT','CLAWBACK') AND "paymentId" IS NOT NULL
  GROUP BY "paymentId"
)
SELECT
  p.id AS payment_id, b.id AS booking_id, cl.slug AS club,
  r.payer_user_id,
  -r.net_wallet AS proposed_wallet_refund_credit,
  CASE
    WHEN b."cancellationReason" LIKE 'athlete%' THEN 'check club insideWindowRefundBps (' || cl."insideWindowRefundBps" || ') vs cancel time'
    ELSE 'owner/coach/system cancel → 100% to payer wallet'
  END AS policy_note
FROM rail r
JOIN "Payment" p      ON p.id = r.payment_id
LEFT JOIN "Booking" b ON b.id = p."bookingId"
LEFT JOIN "Slot" s    ON s.id = b."slotId"
LEFT JOIN "Court" c   ON c.id = s."courtId"
LEFT JOIN "Club" cl   ON cl.id = c."clubId"
LEFT JOIN club_side cs ON cs.payment_id = p.id
WHERE p.purpose <> 'topup'
  AND COALESCE(r.debited, 0) < 0
  AND r.net_wallet < 0
  AND COALESCE(cs.club_net, 0) = 0
  AND (b.status = 'CANCELLED' OR p.status IN ('REFUNDED','FAILED','SUPERSEDED'))  -- detached (re-booked) rows have bookingId NULL and land here via status
ORDER BY b."cancelledAt" DESC NULLS LAST;
