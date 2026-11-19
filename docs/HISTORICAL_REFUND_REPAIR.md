# Historical cancel refund repair (Phase 3)

Guardrails / complaint path: [MONEY_GUARDRAILS.md](./MONEY_GUARDRAILS.md).

Dry-run by default. Nothing is deleted. Prior payment, booking, and ledger rows are not rewritten to hide a gap. A reviewed apply appends a wallet credit, a club clawback when a settlement is still open, and one `RefundReconciliation` row.

```bash
node --import tsx scripts/repair-historical-cancel-refunds.ts
TRACKING=1541908 node --import tsx scripts/repair-historical-cancel-refunds.ts
APPLY=yes node --import tsx scripts/repair-historical-cancel-refunds.ts
```

Prod (app has DB access):

```bash
gh workflow run money-repair-historical-cancel-refunds.yml -f apply=false
# After reviewing Actions logs (buckets / credits / seriesGaps / review samples):
gh workflow run money-repair-historical-cancel-refunds.yml -f apply=true \
  -f reviewPaymentId='pay_xxx,pay_yyy:booking_zzz'
```

## IB-13 / IB-14 (owner-approved 2026-11-17)

Unified dry-run / apply: stranded cancel wallet credits (**IB-13**) plus detached orphan payments (**IB-14**). Idempotent; **never** credits desk CASH to the athlete wallet. Every applied row is echoed in the API response as `appliedChanges` and in server logs.

```bash
# Local (needs DATABASE_URL)
npm run db:historical-money-corrections
APPLY=yes npm run db:historical-money-corrections

# Production (Actions — default dry-run)
gh workflow run money-historical-corrections-ib13-14.yml -f apply=false
gh workflow run money-historical-corrections-ib13-14.yml -f apply=true

# Read-only SQL (replica)
# BEGIN TRANSACTION READ ONLY; \\i scripts/sql/ib13-14-historical-corrections-dry-run.sql; ROLLBACK;
```

`APPLY=yes` / `apply=true` is **not** part of deploy. Run it only after a dry-run has been reviewed, and only against a database you intend to change. Re-run the dry-run afterward. `creditCount` should be 0.

## Phase-3 buckets

| Bucket | Meaning | Apply? |
|--------|---------|--------|
| `credit` | Proven owed, gap > 0 (wallet path / PAID / ledger shortfall) | Yes on apply |
| `series_gap` | Cancelled series sibling; session share missing on primary | Yes when auto-proven; else via `reviewPaymentId` |
| `skip` | Already credited / cash / not cancelled / card reversed | No |
| `review` | IPG + unknown/pending bank outcome, or no verified account | Only listed ids |

Also reported (never auto-healed):

- `ledgerShortfalls` — wallet debit rail still negative after cancel
- `overCredits` — `REFUND_CREDIT` sum > owed (optional later `ADJUSTMENT`, reviewed separately)
- `samples.review` — unresolved rows for ops

## Credit only when all of these are true

- The booking is `CANCELLED` or the payment is `REFUNDED` / `FAILED` / `SUPERSEDED`.
- The payment is not desk cash (`method` and booking method are not `CASH`).
- A verified `userId` is already on the payment, booking, or debited wallet. Guest phones are not matched.
- The card was not reversed: `gatewayReversed` / `gatewayRefund`, except split wallet rail restore, **or** a real wallet debit / `method=PAID` proves the closed-loop path (stale gateway flags ignored).
- `reversePending` without a wallet debit stays `review` (`bank_outcome_pending`).
- For an IPG row without wallet debit, the wallet path must be positively recorded (`refundChannel=wallet_closed_loop` or `reverseFailedAt`). Empty metadata → `review`, not a credit.
- Owed toman uses `cancelWalletCreditAmount` (`shared/owedCancelRefund.ts`): explicit amounts when present; series mid-pack → session share; last remaining session → full residual; else standalone × `refundBps`.
- Force/review still calls that helper — never blind `payment.amount` on a series primary for one sibling.
- Existing `REFUND_CREDIT` sums are subtracted. Recon keys:
  - standalone: `recon:historical-cancel:{paymentId}`
  - series session: `recon:historical-cancel:{paymentId}:{bookingId}`

## Ops complaint path

1. `GET /api/admin/money-audit/athlete-ledger?userId=…` (or phone lookup) — full timeline.
2. Dry-run repair → check `buckets`, `credits`, `seriesGaps`, `samples.review`.
3. If a `review` row is confirmed closed-loop (card never reversed), pass `reviewPaymentId` (optionally `paymentId:bookingId` for series).
4. Apply once. Re-dry-run → `creditCount = 0`.
5. Over-credits: do **not** silent-debit; schedule a reviewed `ADJUSTMENT` if needed.

## Left unresolved on purpose

- `bank_outcome_pending` — `reversePending` and no completed reverse flag / no wallet debit.
- `bank_outcome_unknown` — IPG cancel with no record of a wallet path or a card reverse.
- `no_verified_account` — no `userId`.
- `owed_amount_unknown` — cancel is visible but the owed share is not recorded.

Those rows are counted in the dry-run and are not credited until listed in `reviewPaymentId` / `forcePaymentId`.

## Receipt tracking code

`1541908` is `bookingTrackingCode(bookingId)` (`shared/receiptToken.ts`). It is not stored. The dry-run scans booking ids and prints the matching booking id, payment id, and decision. It does not print names or phone numbers.
