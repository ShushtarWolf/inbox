# Coach product audit, scenario matrix, and commission model

**Branch:** `cursor/coach-audit-and-commission-94e4`  
**Status:** Coach remains **OFF by default** (`PILOT_NO_COACH=true` in `.env.example`). Turning coach on is an explicit ops step ([COACH_V1_GO_NO_GO.md](./COACH_V1_GO_NO_GO.md)).

## Executive summary

The coach vertical is largely built (Prisma, APIs, UI, settlement tests) but gated by `PILOT_NO_COACH`. Owners wanted **lower platform commission when a coach books a court** than for athlete court bookings. Previously, coach lesson-court settled at a hard **0 bps** skim (`server/utils/settlement.ts`). This branch implements **configurable coach-court commission** with default **half the athlete court rate** (`shared/settlement.ts` → `resolveCoachCourtCommissionBps`), overridable on `PlatformCommissionSetting.coachCourtCommissionBps` and `Club.coachCourtCommissionBps`.

Also fixed: atomic athlete coach booking session+payment (`bookings/coach.post.ts`), in-txn court settlement after coach wallet debit (`coachLessonBook.ts`), coach cannot drain club wallet via `club_to_coach` (`coach/transfers.post.ts`).

---

## Commission model (today after this branch)

| Payee / flow | Rate source | Files |
|--------------|-------------|--------|
| Athlete **court** booking (club wallet) | `Club.commissionBps` ?? platform default | `resolveClubCommissionBps`, `creditOwnerForPaidPayment` |
| Athlete **coach lesson** fee (coach user wallet) | `COACH_COMMISSION_BPS` env ?? platform default | `resolveCoachCommissionBps` |
| Coach **lesson-court** charge (club wallet) | `Club.coachCourtCommissionBps` ?? `PlatformCommissionSetting.coachCourtCommissionBps` ?? **floor(athleteBps/2)** | `resolveCoachCourtCommissionBps`, migration `20261126120000_coach_court_commission_bps` |
| Desk **cash** | Never credits wallets | `settlement.ts` (`method === 'CASH'`) |

**Configure:**

- Platform: `PATCH /api/admin/platform-commission` with `coachCourtCommissionBps` (null = half default).
- Per club: `PATCH /api/admin/clubs/:id/commission` with `coachCourtCommissionBps` (null = inherit platform/half chain).

**Pricing display:** Court list price unchanged; commission affects **club settlement net** only (coach wallet debited **gross** listed price in `coachLessonBook.ts`).

**Ledger:** `SettlementLedgerEntry.commissionBps` snapshots the rate used (same as athlete courts).

---

## Disable / enable

| Mechanism | Path |
|-----------|------|
| Env | `PILOT_NO_COACH`, `NUXT_PUBLIC_PILOT_NO_COACH` (`shared/pilot.ts`, `nuxt.config.ts`) |
| API 404 | `assertCoachProductEnabled` on coach routes |
| Client redirect | `app/middleware/pilot-no-coach.global.ts` |
| Ops workflow | `.github/workflows/set-pilot-no-coach.yml` |

---

## Scenario matrix (summary)

Full matrix from audit (Nov 2026). **Legend:** OK / Missing / Bug.

### Payment × booking

| ID | Scenario | Status | Notes |
|----|----------|--------|--------|
| A1–A4 | Athlete marketplace coach + IPG/wallet/split; no cash | OK | `bookings/coach.post.ts`, `checkout.post.ts` |
| A5–A8 | Coach lesson+court wallet; staff pay modes | OK | `coachLessonBook.ts`, `bookingPayment.ts` |
| A9–A10 | Owner desk tag coach | OK (metadata only) | `owner/reserve.post.ts` |

### Booking types

| ID | Scenario | Status |
|----|----------|--------|
| B1–B3 | Single / lesson+court / coach series | OK |
| B4 | Owner seasonal/recurring + coach | N/A (recurring frozen) |
| B5–B6 | Group package capacity | Missing until `PACKAGES_ENABLED` |
| B7 | Marketplace time vs court double commitment | Bug/gap (product) |

### Cancellation & refund-once

| ID | Scenario | Status |
|----|----------|--------|
| C1–C4 | Athlete/coach/owner cancel + linked court unwind | OK (`cancellations.ts`) |
| C5–C6 | Owner/admin cancel session-only | Missing |
| C7 | Idempotent refund/clawback | OK |
| C8–C9 | Unpaid / cash paths | OK |

### No-show, multi-club, suspend, price, double-book, IPG, withdraw, commission, cash, admin

| Area | Status | Key paths |
|------|--------|-----------|
| No-show | Missing (schema only) | `CoachSession.noShowAt` |
| Multi-club coach | OK book; finance attribution gap | `coachClubLinks.ts`, `owner/finance.get.ts` |
| Reject/suspend coach | OK new books; no mass cancel | `admin/coaches/*` |
| Price after book | OK snapshot on session | `CoachSession.price` |
| Double coach time | OK unique index | migration `20260822120000` |
| Partial/split IPG | OK | `checkout.post.ts` |
| Coach withdraw | OK settlement rail | `walletWithdraw.ts` |
| Commission coach court | **OK (this branch)** | `resolveCoachCourtCommissionBps` |
| Owner cash ack | OK courts; not coach-session-specific | `owner/payments/.../ack-cash-return` |
| Admin overrides | Partial | money-audit APIs; no coach-session cancel UI |

### Coach court commission scenarios (new)

| ID | Athlete bps | Platform coach court | Club coach court | Expected coach-court bps |
|----|-------------|----------------------|------------------|---------------------------|
| K-CC1 | 1000 (default) | null | null | 500 (half) |
| K-CC2 | 1000 | 300 | null | 300 |
| K-CC3 | 800 club | 300 platform | 150 club | 150 |
| K-CC4 | 0 | any | any | 0 |
| K-CC5 | Forged metadata, no linked session | — | — | Full athlete bps (`settlement.coach.test.ts`) |

---

## Implementation plan (remaining)

| Step | Effort | Description |
|------|--------|-------------|
| 1 | S | Ops: `PILOT_NO_COACH=false` + `COACH_V1_GO_NO_GO` |
| 2 | S | Fix register-coach takeover (BUG_TRIAGE S1) |
| 3 | **Done** | Coach court commission + settlement in txn |
| 4 | **Done** | Atomic athlete coach book; coach transfer guard |
| 5 | M | No-show / check-in APIs (if product requires) |
| 6 | M | Owner/admin cancel court-less sessions |
| 7 | L | Marketplace ↔ court conflict policy |
| 8 | M | `PACKAGES_ENABLED` for coach group classes |

---

## Product decisions for owner

1. **Launch gate:** Keep coach off until manual go-no-go vs enable on staging first.
2. **Coach court commission:** Default half-rate is implemented; confirm platform/club overrides before raising athlete commission above 0%.
3. **0% athlete commission:** Coach court stays 0% (half of 0) — intentional.
4. **Payout timing:** Still on payment PAID, not attendance.
5. **Packages/recurring:** Ship with coach v1 or phased.
6. **Account takeover on coach register:** Deferred — needs OTP proof (S1).

---

## Key file index

- Models: `prisma/schema.prisma` (`Coach`, `CoachSession`, commission fields)
- Settlement: `server/utils/settlement.ts`, `shared/settlement.ts`
- Coach book: `server/api/bookings/coach.post.ts`, `server/utils/coachLessonBook.ts`
- Gate: `server/utils/pilot.ts`, `app/middleware/pilot-no-coach.global.ts`
- Tests: `server/utils/settlement.coach.test.ts`, `shared/settlement.test.ts`