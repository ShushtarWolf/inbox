-- IB-13 dry-run (READ ONLY): classify cancelled paid bookings for missing athlete wallet refund.
-- Mirrors shared/historicalRefundRepair.ts buckets for ops review.
-- Apply only rows with class = refundable_now (use scripts/repair/ib13-cancel-refund-apply.ts).
--
-- Workflow: gh workflow run readonly-sql-reports.yml -f report=ib13-cancel-refund-classify

WITH base AS (
  SELECT
    p.id AS payment_id,
    p."bookingId" AS booking_id,
    b.status AS booking_status,
    b."paymentMethod" AS booking_payment_method,
    p.method,
    p.status AS payment_status,
    p.amount,
    p."userId" AS payment_user_id,
    p."gatewayRef",
    p."metadataJson",
    p."metadataJson"::jsonb AS meta,
    RIGHT(COALESCE(u.phone, ''), 4) AS user_phone_last4,
    COALESCE(wt.refunded, 0)::bigint AS refund_credit_sum,
    COALESCE(wt.debited, 0)::bigint AS wallet_debit_abs,
    wt.debited_wallet_user_id,
    EXISTS (
      SELECT 1 FROM "WalletTransaction" wtr
      WHERE wtr."paymentId" = p.id
        AND wtr.type = 'REFUND_CREDIT'
        AND wtr.note LIKE 'recon:historical-cancel:%'
    ) AS has_recon_refund_note,
    EXISTS (
      SELECT 1 FROM "RefundReconciliation" rr
      WHERE rr."idempotencyKey" IN (
        'recon:historical-cancel:' || p.id,
        'recon:historical-cancel:' || p.id || ':' || COALESCE(p."bookingId", '')
      )
    ) AS already_reconciled
  FROM "Payment" p
  LEFT JOIN "Booking" b ON b.id = p."bookingId"
  LEFT JOIN "User" u ON u.id = COALESCE(p."userId", b."userId")
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN wt.type = 'REFUND_CREDIT' THEN wt.amount ELSE 0 END)::bigint AS refunded,
      SUM(CASE WHEN wt.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT') THEN ABS(wt.amount) ELSE 0 END)::bigint AS debited,
      (
        SELECT w."userId"
        FROM "WalletTransaction" wtd
        JOIN "Wallet" w ON w.id = wtd."walletId"
        WHERE wtd."paymentId" = p.id
          AND wtd.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT')
        ORDER BY wtd."createdAt" ASC
        LIMIT 1
      ) AS debited_wallet_user_id
    FROM "WalletTransaction" wt
    WHERE wt."paymentId" = p.id
  ) wt ON true
  WHERE COALESCE(p.purpose, 'booking') <> 'topup'
    AND p.method IN ('IPG', 'PAID', 'CASH')
    AND (
      b.status = 'CANCELLED'
      OR p.status IN ('REFUNDED', 'FAILED', 'SUPERSEDED')
    )
),
scored AS (
  SELECT
    b.*,
    (b.method = 'CASH' OR b.booking_payment_method = 'CASH') AS is_cash,
    (
      b.payment_status = 'REFUNDED'
      OR b.payment_status = 'FAILED'
      OR b.payment_status = 'SUPERSEDED'
      OR b.booking_status = 'CANCELLED'
    ) AS is_cancelled,
    COALESCE((b.meta ->> 'gatewayReversed')::boolean, b."metadataJson" LIKE '%"gatewayReversed":true%') AS gateway_reversed,
    COALESCE((b.meta ->> 'gatewayRefund')::boolean, b."metadataJson" LIKE '%"gatewayRefund":true%') AS gateway_refund,
    COALESCE((b.meta ->> 'reversePending')::boolean, b."metadataJson" LIKE '%"reversePending":true%') AS reverse_pending,
    (b.meta ->> 'reverseFailedAt') AS reverse_failed_at,
    (b.meta ->> 'refundChannel') AS refund_channel,
    COALESCE(b.debited_wallet_user_id, b.payment_user_id) AS credit_user_id,
    (
      b.wallet_debit_abs > 0
      OR b.method = 'PAID'
      OR (b.meta ->> 'refundChannel') = 'wallet_closed_loop'
      OR (
        b.meta ? 'reverseFailedAt'
        AND NULLIF(TRIM(b.meta ->> 'reverseFailedAt'), '') IS NOT NULL
      )
    ) AS wallet_path_proven,
    LEAST(
      b.amount::bigint,
      CASE WHEN b.wallet_debit_abs > 0 THEN b.wallet_debit_abs ELSE b.amount::bigint END
    ) AS owed_cap
  FROM base b
),
classified AS (
  SELECT
    s.*,
    GREATEST(0, s.owed_cap - s.refund_credit_sum) AS refund_gap,
    CASE
      WHEN s.already_reconciled OR s.has_recon_refund_note THEN 'already_reconciled'
      WHEN s.is_cash THEN 'cash'
      WHEN NOT s.is_cancelled THEN 'not_cancelled'
      WHEN s.gateway_reversed AND s.method <> 'PAID' AND s.wallet_debit_abs = 0 THEN 'already_refunded_card'
      WHEN s.refund_credit_sum >= s.owed_cap AND s.owed_cap > 0 THEN 'already_refunded'
      WHEN s.reverse_pending AND s.method <> 'PAID' AND s.wallet_debit_abs = 0 THEN 'bank_outcome_pending'
      WHEN credit_user_id IS NULL THEN 'no_verified_account'
      WHEN NOT s.wallet_path_proven AND s.method = 'IPG' THEN 'bank_outcome_unknown'
      WHEN GREATEST(0, s.owed_cap - s.refund_credit_sum) > 0
        AND s.method = 'IPG'
        AND s.payment_status = 'PAID'
        AND s.booking_status = 'CANCELLED'
        AND s.refund_credit_sum = 0
        AND NOT s.is_cash
        THEN 'refundable_now'
      WHEN GREATEST(0, s.owed_cap - s.refund_credit_sum) > 0 AND s.wallet_path_proven THEN 'refundable_now_wallet_path'
      WHEN GREATEST(0, s.owed_cap - s.refund_credit_sum) > 0 THEN 'review_other_gap'
      ELSE 'skip_no_gap'
    END AS ib13_class
  FROM scored s
)
SELECT
  ib13_class,
  payment_id,
  booking_id,
  method,
  payment_status,
  booking_status,
  amount,
  refund_credit_sum,
  wallet_debit_abs,
  refund_gap AS proposed_wallet_credit,
  CASE
    WHEN ib13_class = 'refundable_now' OR ib13_class = 'refundable_now_wallet_path'
      THEN 'recon:historical-cancel:' || payment_id || COALESCE(':' || booking_id, '')
    ELSE NULL
  END AS repair_idempotency_key,
  user_phone_last4,
  CASE
    WHEN ib13_class IN ('bank_outcome_unknown', 'bank_outcome_pending')
      THEN "gatewayRef"
    ELSE NULL
  END AS gateway_ref_for_bank_check
FROM classified
WHERE ib13_class NOT IN ('skip_no_gap', 'not_cancelled')
ORDER BY
  CASE ib13_class
    WHEN 'refundable_now' THEN 1
    WHEN 'refundable_now_wallet_path' THEN 2
    WHEN 'bank_outcome_unknown' THEN 3
    WHEN 'bank_outcome_pending' THEN 4
    ELSE 9
  END,
  refund_gap DESC;

-- Rollup (per class)
WITH base AS (
  SELECT
    p.id AS payment_id,
    p."bookingId" AS booking_id,
    b.status AS booking_status,
    b."paymentMethod" AS booking_payment_method,
    p.method,
    p.status AS payment_status,
    p.amount,
    p."userId" AS payment_user_id,
    p."gatewayRef",
    p."metadataJson"::jsonb AS meta,
    COALESCE(wt.refunded, 0)::bigint AS refund_credit_sum,
    COALESCE(wt.debited, 0)::bigint AS wallet_debit_abs,
    wt.debited_wallet_user_id,
    EXISTS (
      SELECT 1 FROM "RefundReconciliation" rr
      WHERE rr."idempotencyKey" IN (
        'recon:historical-cancel:' || p.id,
        'recon:historical-cancel:' || p.id || ':' || COALESCE(p."bookingId", '')
      )
    ) AS already_reconciled
  FROM "Payment" p
  LEFT JOIN "Booking" b ON b.id = p."bookingId"
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN wt.type = 'REFUND_CREDIT' THEN wt.amount ELSE 0 END)::bigint AS refunded,
      SUM(CASE WHEN wt.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT') THEN ABS(wt.amount) ELSE 0 END)::bigint AS debited,
      (
        SELECT w."userId"
        FROM "WalletTransaction" wtd
        JOIN "Wallet" w ON w.id = wtd."walletId"
        WHERE wtd."paymentId" = p.id
          AND wtd.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT')
        ORDER BY wtd."createdAt" ASC
        LIMIT 1
      ) AS debited_wallet_user_id
    FROM "WalletTransaction" wt
    WHERE wt."paymentId" = p.id
  ) wt ON true
  WHERE COALESCE(p.purpose, 'booking') <> 'topup'
    AND p.method IN ('IPG', 'PAID', 'CASH')
    AND (b.status = 'CANCELLED' OR p.status IN ('REFUNDED', 'FAILED', 'SUPERSEDED'))
),
scored AS (
  SELECT
    b.*,
    (b.method = 'CASH' OR b.booking_payment_method = 'CASH') AS is_cash,
    (
      b.payment_status IN ('REFUNDED', 'FAILED', 'SUPERSEDED') OR b.booking_status = 'CANCELLED'
    ) AS is_cancelled,
    COALESCE((b.meta ->> 'gatewayReversed')::boolean, false) AS gateway_reversed,
    COALESCE((b.meta ->> 'reversePending')::boolean, false) AS reverse_pending,
    COALESCE(b.debited_wallet_user_id, b.payment_user_id) AS credit_user_id,
    (
      b.wallet_debit_abs > 0 OR b.method = 'PAID'
      OR (b.meta ->> 'refundChannel') = 'wallet_closed_loop'
      OR (b.meta ? 'reverseFailedAt' AND NULLIF(TRIM(b.meta ->> 'reverseFailedAt'), '') IS NOT NULL)
    ) AS wallet_path_proven,
    LEAST(b.amount::bigint, CASE WHEN b.wallet_debit_abs > 0 THEN b.wallet_debit_abs ELSE b.amount::bigint END) AS owed_cap
  FROM base b
),
classified AS (
  SELECT
    CASE
      WHEN already_reconciled THEN 'already_reconciled'
      WHEN is_cash THEN 'cash'
      WHEN gateway_reversed AND method <> 'PAID' AND wallet_debit_abs = 0 THEN 'already_refunded_card'
      WHEN refund_credit_sum >= owed_cap AND owed_cap > 0 THEN 'already_refunded'
      WHEN reverse_pending AND method <> 'PAID' AND wallet_debit_abs = 0 THEN 'bank_outcome_pending'
      WHEN credit_user_id IS NULL THEN 'no_verified_account'
      WHEN NOT wallet_path_proven AND method = 'IPG' THEN 'bank_outcome_unknown'
      WHEN GREATEST(0, owed_cap - refund_credit_sum) > 0
        AND method = 'IPG' AND payment_status = 'PAID' AND booking_status = 'CANCELLED'
        AND refund_credit_sum = 0 AND NOT is_cash THEN 'refundable_now'
      WHEN GREATEST(0, owed_cap - refund_credit_sum) > 0 AND wallet_path_proven THEN 'refundable_now_wallet_path'
      WHEN GREATEST(0, owed_cap - refund_credit_sum) > 0 THEN 'review_other_gap'
      ELSE 'skip_no_gap'
    END AS ib13_class,
    GREATEST(0, owed_cap - refund_credit_sum) AS refund_gap
  FROM scored
)
SELECT
  'ib13_summary' AS report,
  ib13_class,
  count(*)::int AS row_count,
  COALESCE(sum(refund_gap), 0)::bigint AS total_gap_toman
FROM classified
WHERE ib13_class <> 'skip_no_gap'
GROUP BY ib13_class
ORDER BY row_count DESC;