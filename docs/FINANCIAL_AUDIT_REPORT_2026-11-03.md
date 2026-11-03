# Inboxs.ir — Financial System Audit Report (post PR #116 / #117)

**Date:** 2026-11-03  
**Branch:** `cursor/financial-audit-desk-cash-detached-86e7`  
**Baseline:** Uploaded audits + live `main` at `c1b9f174`  
**Scope:** Discovery, IPG + CASH rails, cross-system, DB, security review, tests, one confirmed CASH UX fix. No merge, deploy, or live SEP.

---

## Executive readiness: **YELLOW**

Launchable with documented restrictions: **desk-first or `PAYMENTS_MODE=test`** until live SEP checklist is signed; **`PLATFORM_COMMISSION_BPS` must stay 0** until commission refund float is product-approved; money integration tests require isolated Postgres (`MONEY_IT_DATABASE_URL`).

---

## A. Systems verified (main @ c1b9f174)

| Area | Status | Notes |
|------|--------|-------|
| Dual rail (CASH vs online) | **Verified** | `docs/PAYMENTS.md`, `shared/dualRailBooks.ts`, settlement skips `method=CASH` |
| SEP IPG | **Verified** | Verify-before-PAID, rials match, jobs enqueued in txn (`sep.ts`, `moneyJobs.ts`) |
| Money jobs / retry | **Fixed+retested** | Phases 1–6 (#116) + review commit `c1b9f174`; unit tests green |
| Payment supersede (no delete) | **Verified** | `SUPERSEDED` + `providerRef` cleared; `check:money-safety` gate |
| Split-pay | **Fixed+retested** | Release on supersede/fail/expire; promote before settle in worker |
| Wallet idempotency | **Verified** | Partial uniques + helper guards |
| Club settlement idempotency | **Verified** | `SettlementLedgerEntry.paymentId` unique + club BOOKING_CREDIT indexes |
| CASH desk returns | **Fixed+retested** | Detached-payment ack + finance list (this PR) |
| Commission > 0 refunds | **Known issue** | Documented Y4 asymmetry; defaults 0% — **Needs external verification** before enabling bps |
| Live SEP production | **Not tested** | Requires terminal + manual checklist |

---

## B. Finding fixed in this PR

### B.1 Desk cash return after slot re-book (Medium)

**Problem:** Cancelled desk CASH with `deskCashReturn=owed` could become undiscoverable and un-ackable after `deleteStaleCancelledBooking` detached the payment (`detachedClubId`) for a re-book. Owner finance queried only via `booking.slot.court.clubId`; `acknowledgeDeskCashReturn` did not read `detachedClubId`.

**Fix:**

- `resolvePaymentClubId()` in `server/utils/staleBooking.ts`
- `deskCashReturn.ts` uses it for authz
- `owner/finance.get.ts` OR-query + detached slot metadata for chips

**Tests:** `deskCashReturn.test.ts`, `staleBooking.test.ts`, `money.it.ts` (integration), `financialMatrix.test.ts`

---

## C. Residual risks (unchanged from baseline)

| Risk | Severity | Mitigation today | Label |
|------|----------|------------------|-------|
| PAID without settlement (crash) | Medium | Money jobs + `reconcilePaidPaymentsMissingLedger` cron | **Verified** mitigated; monitor FAILED jobs |
| Commission refund when bps > 0 | High when enabled | Docs + tests at bps=1000 in money.it | **Known issue** |
| Guest IPG cancel → manual bank | Ops | Admin ack queue | **Verified** by design |
| `reversePending` outside cancel txn | Low ops | Admin resolve | **Known issue** |
| Live SEP misconfig | High if live early | Do not set `PAYMENTS_MODE=live` | **Needs external verification** |

---

## D. Test matrix (automated)

| Group | Location | CI |
|-------|----------|-----|
| `IPG_PAYMENT_TESTS` | `financialMatrix.test.ts`, `sepClient.test.ts`, `paymentSync.latePay.test.ts`, `refunds.sepReverse.test.ts` | Vitest (default) |
| `CASH_ACCOUNTING_TESTS` | `financialMatrix.test.ts`, `deskCashReturn.test.ts`, `refunds.test.ts`, `dualRailBooks.test.ts` | Vitest |
| `FINANCIAL_CROSS_SYSTEM_TESTS` | `financialMatrix.test.ts`, `moneyJobs.test.ts`, `paymentSupersede.test.ts` | Vitest |
| Postgres integration | `money.it.ts` | `npm run test:money` (optional schema) |

**Commands run (this audit):**

```bash
npm run test -- --run server/utils/financialMatrix.test.ts server/utils/deskCashReturn.test.ts server/utils/staleBooking.test.ts server/utils/moneyJobs.test.ts server/utils/refunds.test.ts server/utils/paymentSupersede.test.ts server/utils/paymentSync.latePay.test.ts
npm run check:money-safety
```

---

## E. Security spot-check

| Check | Result |
|-------|--------|
| Checkout amount from server price, not client body | **Verified** (`checkout.post.ts`) |
| Booking ownership on checkout | **Verified** (`userId` on findFirst) |
| SEP PAID without verify | **Verified** blocked in live |
| Desk ack cross-club | **Verified** 403 (`deskCashReturn.test.ts`) |
| Payment delete in server | **Verified** gated (`check:money-safety`) |
| Public callback provider allowlist | **Verified** (`sep` only) |

---

## F. Recommendations before live IPG

1. Complete `docs/PAYMENTS.md` manual SEP checklist on staging with real terminal.
2. Keep `money-jobs-cron` + `money-audit-cron` enabled; alert on FAILED money jobs.
3. Product sign-off on commission refund policy before any bps > 0.
4. Run `MONEY_IT_DATABASE_URL=... npm run test:money` on release candidate.

---

*Prepared by Cloud Agent financial audit — PR contains code fix + tests only.*
