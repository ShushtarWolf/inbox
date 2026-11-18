# PAID without `SettlementLedgerEntry` (money audit)

## Symptom (16–17 Nov 2026)

`runMoneyAudit().paidWithoutSettlement` stayed at **34** while money-audit cron / Actions logs were green on other guards. That count used to include every non-CASH, non-topup `PAID` row with no ledger row.

## Root cause (code, not missing club money)

Most of the 34 rows are **not** stranded club receivables:

| Bucket | Why no ledger is OK |
| --- | --- |
| **Series $0 siblings** | Multi-slot / season bookings charge once on the primary payment (`amount > 0`). Sibling payments stay `PAID` + `amount = 0` with `coveredByBookingId` — `creditOwnerForPaidPayment` settles **only the primary** (`SettlementLedgerEntry.paymentId` is unique per payment). Matches `scripts/audit-money-bugs.mjs` §9. |
| **Desk IPG+PAID without capture** | Desk force-cash leaves `method: 'IPG'`, `status: 'PAID'` without `gatewayRef` / capture meta. `canSettleOwnerForPaidPayment` is **false** → no `SETTLE` job (club cash accounting, not platform float). |
| **Zero-amount checkout** | `zeroAmountCheckout` may still expect a ledger row with `gross = 0` when capture is verified — kept in the **actionable** bucket. |

`reconcilePaidPaymentsMissingLedger` already skips rows where `canSettleOwnerForPaidPayment` is false; the audit counter did not, which inflated the alert.

## Fix (PR `cursor/paid-without-settlement-audit-fb0b`)

- `shouldExpectSettlementLedgerEntry` + `isSeriesChargeSiblingRow` in `shared/deskPaidGuard.ts` (same rules as `enqueueMoneyJobsForPaidPayment`).
- `runMoneyAudit()` now reports:
  - `paidWithoutSettlement` — actionable missing ledger rows
  - `paidWithoutSettlementExcluded` — expected gaps (noise)

After deploy, expect **`paidWithoutSettlement` ≪ 34** and most former rows under **`paidWithoutSettlementExcluded`**.

## How to verify on prod (read-only)

```bash
# Admin secret required — do not APPLY money jobs unless ops approves.
curl -sS -H "x-admin-secret: …" https://inboxs.ir/api/admin/money-audit/run
```

Compare `paidWithoutSettlement` vs `paidWithoutSettlementExcluded`. Sample ids: `GET /api/admin/payments/money-ops-summary` + SQL in `scripts/audit-money-bugs.mjs` §10 (payments with no settlement row).

## Open questions

- Exact bucket split (sibling vs desk-IPG) for the historical 34 needs one prod `run` after the PR is live; this doc is code-derived until then.
- If any **positive-amount** `PAID` row remains in the actionable bucket after the filter, treat as real `SETTLE` retry / failed money-job backlog (not series noise).