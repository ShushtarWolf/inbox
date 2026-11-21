-- IB-14 dry-run (READ ONLY): detached payments (booking FK cleared after cancel / re-book).
-- Classify wallet credit eligibility; never cash → wallet.
--
-- Workflow: gh workflow run readonly-sql-reports.yml -f report=ib14-orphan-payment-classify

WITH detached AS (
  SELECT
    p.id AS payment_id,
    p.method,
    p.status,
    p.amount,
    p."userId",
    p."gatewayRef",
    p."metadataJson",
    p."metadataJson"::jsonb AS meta,
    (p."metadataJson"::jsonb ->> 'detachedFromBookingId') AS detached_booking_id,
    RIGHT(COALESCE(u.phone, ''), 4) AS user_phone_last4,
    COALESCE(wt.refunded, 0)::bigint AS refund_credit_sum,
    COALESCE(wt.debited, 0)::bigint AS wallet_debit_abs,
    EXISTS (
      SELECT 1 FROM "RefundReconciliation" rr
      WHERE rr."idempotencyKey" = 'recon:historical-cancel:' || p.id
         OR rr."idempotencyKey" = 'recon:historical-cancel:' || p.id || ':'
           || COALESCE(p."metadataJson"::jsonb ->> 'detachedFromBookingId', '')
    ) AS already_reconciled
  FROM "Payment" p
  LEFT JOIN "User" u ON u.id = p."userId"
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN wt.type = 'REFUND_CREDIT' THEN wt.amount ELSE 0 END)::bigint AS refunded,
      SUM(CASE WHEN wt.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT') THEN ABS(wt.amount) ELSE 0 END)::bigint AS debited
    FROM "WalletTransaction" wt
    WHERE wt."paymentId" = p.id
  ) wt ON true
  WHERE p."bookingId" IS NULL
    AND COALESCE(p.purpose, 'booking') <> 'topup'
    AND p.method IN ('IPG', 'PAID', 'CASH')
    AND p.status IN ('PAID', 'REFUNDED', 'FAILED', 'SUPERSEDED')
    AND p."metadataJson"::jsonb ? 'detachedFromBookingId'
),
gap AS (
  SELECT
    d.*,
    LEAST(d.amount::bigint, d.wallet_debit_abs) AS owed_from_wallet_rail,
    GREATEST(0, LEAST(d.amount::bigint, d.wallet_debit_abs) - d.refund_credit_sum) AS proposed_wallet_credit
  FROM detached d
),
classified AS (
  SELECT
    g.*,
    CASE
      WHEN g.already_reconciled THEN 'already_reconciled'
      WHEN g.method = 'CASH' THEN 'cash_never_wallet'
      WHEN g.status NOT IN ('PAID', 'REFUNDED', 'FAILED', 'SUPERSEDED') THEN 'not_captured'
      WHEN g.wallet_debit_abs <= 0 THEN 'not_captured_no_wallet_debit'
      WHEN g.proposed_wallet_credit <= 0 AND g.refund_credit_sum > 0 THEN 'already_refunded'
      WHEN g.proposed_wallet_credit <= 0 THEN 'no_gap'
      WHEN g.wallet_debit_abs > 0 AND g.proposed_wallet_credit > 0 THEN 'refundable_wallet_credit_once'
      ELSE 'review'
    END AS ib14_class
  FROM gap g
)
SELECT
  ib14_class,
  payment_id,
  method,
  status,
  amount,
  detached_booking_id,
  wallet_debit_abs,
  refund_credit_sum,
  proposed_wallet_credit,
  'recon:historical-cancel:' || payment_id
    || CASE WHEN detached_booking_id IS NOT NULL AND detached_booking_id <> ''
      THEN ':' || detached_booking_id ELSE '' END AS repair_idempotency_key,
  user_phone_last4,
  CASE
    WHEN ib14_class = 'not_captured_no_wallet_debit' THEN "gatewayRef"
    ELSE NULL
  END AS gateway_ref_for_bank_check
FROM classified
ORDER BY
  CASE ib14_class
    WHEN 'refundable_wallet_credit_once' THEN 1
    WHEN 'not_captured_no_wallet_debit' THEN 2
    ELSE 9
  END,
  proposed_wallet_credit DESC;

SELECT
  'ib14_summary' AS report,
  ib14_class,
  count(*)::int AS row_count,
  COALESCE(sum(proposed_wallet_credit), 0)::bigint AS total_proposed_credit_toman
FROM (
  SELECT
    CASE
      WHEN p.method = 'CASH' THEN 'cash_never_wallet'
      WHEN p."bookingId" IS NOT NULL OR NOT (p."metadataJson"::jsonb ? 'detachedFromBookingId') THEN 'excluded'
      WHEN COALESCE(wt.debited, 0) <= 0 THEN 'not_captured_no_wallet_debit'
      WHEN GREATEST(0, LEAST(p.amount, COALESCE(wt.debited, 0)) - COALESCE(wt.refunded, 0)) > 0
        THEN 'refundable_wallet_credit_once'
      ELSE 'no_gap_or_already_refunded'
    END AS ib14_class,
    GREATEST(0, LEAST(p.amount, COALESCE(wt.debited, 0)) - COALESCE(wt.refunded, 0)) AS proposed_wallet_credit
  FROM "Payment" p
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN wt.type = 'REFUND_CREDIT' THEN wt.amount ELSE 0 END) AS refunded,
      SUM(CASE WHEN wt.type IN ('PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT') THEN ABS(wt.amount) ELSE 0 END) AS debited
    FROM "WalletTransaction" wt WHERE wt."paymentId" = p.id
  ) wt ON true
  WHERE p."bookingId" IS NULL
    AND COALESCE(p.purpose, 'booking') <> 'topup'
    AND p."metadataJson"::jsonb ? 'detachedFromBookingId'
) rollup
WHERE ib14_class <> 'excluded'
GROUP BY ib14_class
ORDER BY row_count DESC;