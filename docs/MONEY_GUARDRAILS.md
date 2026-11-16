# Money guardrails (Phase 4)

Cancel refunds stay closed-loop wallet. These gates keep live cancel, historical heal, backups, and deploy from drifting apart again.

## Invariants

1. Ordinary cancel → athlete wallet only (`wallet_closed_loop`). No SEP reverse on cancel.
2. Desk cash → no wallet credit.
3. One session of a paid series → session share (capped by residual), never full primary.
4. Credits are idempotent (`REFUND_CREDIT` + recon key).
5. Cancel fails closed if a required wallet credit cannot complete.

## CI (money PRs)

Before merge / deploy of money changes:

```bash
npm run check:money-safety
npm run test:money-matrix
npm run check:backup-assert
```

CI runs the same three steps (then full `npm test` + `test:money`).

Matrix coverage lives in `shared/moneyCancelMatrix.test.ts` (plus owed / historical / wallet-rail unit tests).

## Deploy gate

- **Never** run historical repair `APPLY` / cash-correction `APPLY` inside `deploy.yml` (or any deploy path).
- `check:money-safety` fails if a deploy workflow invokes `repair-historical-cancel-refunds` or hard-codes `apply=true` / `APPLY=yes` for money repairs.
- Ship code first; heal data with the dedicated workflows after a reviewed dry-run.

## Prod money audit

- Cron: `.github/workflows/money-audit-cron.yml` → `POST /api/admin/money-audit/run`
- Alert includes `cancelledOnlineWithoutRefundCredit` (cancelled IPG/PAID, no `REFUND_CREDIT`, no proven card/desk/manual owe marker).
- Cron **fails the job** when that count is &gt; 0 so Actions stays red until healed.

## Backup health

```bash
./scripts/sql/assert-inbox-postgres-dump.sh path/to.dump
npm run check:backup-assert   # self-check
```

Refuses GlitchTip / wrong-DB artifacts. Requires Payment + WalletTransaction/Booking markers. Wired into `backup-db.yml`.

## Ops runbook (athlete complaint)

1. **Ledger** — `gh workflow run admin-athlete-snapshot.yml` or  
   `GET /api/admin/money-audit/athlete-ledger?phone=…` / `?userId=…`
2. **Owed** — same brain as live: `cancelWalletCreditAmount` (`shared/owedCancelRefund.ts`). Series → session share / last residual; never invent a second discount.
3. **Dry-run** —  
   `gh workflow run money-repair-historical-cancel-refunds.yml -f apply=false`  
   Read `buckets`, `credits`, `seriesGaps`, `samples.review`, `overCredits`.
4. **Apply** (only after review) —  
   `… -f apply=true` and optional `-f reviewPaymentId='payId'` or `payId:bookingId` for review-bucket rows.
5. **Re-dry-run** — `creditCount` must be `0`. Over-credits are listed only; use a reviewed `ADJUSTMENT` later, never silent debit.

Details: [HISTORICAL_REFUND_REPAIR.md](./HISTORICAL_REFUND_REPAIR.md), [PAYMENTS.md](./PAYMENTS.md).
