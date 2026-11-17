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
   Series over-credits (fair-share shortfall vs ledger): dry-run  
   `POST /api/admin/money-audit/correct-series-over-credit?paymentId=…` then `apply=1` after review.

## Leftover review queue (by policy)

Historical repair dry-run may still show `review` / `bank_outcome_unknown` after auto credits are zero. That is **expected** when IPG cancel rows have no proven wallet path and no proven card reverse (token/`sepStatus:1` failures, empty meta, superseded holds, etc.).

- Do **not** auto-credit those rows.
- Credit only via `reviewPaymentId` when closed-loop is proven (`wallet_closed_loop` / `reverseFailedAt` / wallet debit).
- `cancelledOnlineWithoutRefundCredit` (money-audit cron) stays `0` for PAID/REFUNDED cancels without credit; the review bucket is a separate ops queue, not a cron-red guard by itself.
- Snapshot (2026-11-16): dry-run `review≈57` (`bank_outcome_unknown≈54`, `no_verified_account≈3`); all classified keep-in-review / never-charged — no force list.

Details: [HISTORICAL_REFUND_REPAIR.md](./HISTORICAL_REFUND_REPAIR.md), [PAYMENTS.md](./PAYMENTS.md).
