# Coach v1 Go / No-Go

Short checklist before setting **`PILOT_NO_COACH=false`** on Liara (`inbox` / inboxs.ir).

Related: [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) · [PAYMENTS.md](./PAYMENTS.md) · [LIARA_ENV_FILL_SHEET.md](./LIARA_ENV_FILL_SHEET.md)

---

## Freeze that stays OFF

| Surface | Gate |
|---------|------|
| Season / package / recurring | `isRecurringReserveEnabled() === false` → API `403` |
| Google OAuth product UI | hard-off |
| EN product UI | `defaultLocale: fa` |

Competitions (if enabled) stay pilot-scoped to `iust-tennis` — independent of coach flag.

---

## Money invariants

1. Coach wallet must cover **full listed** court charge; underfunded rejects via atomic `debitWallet` (same txn as slot claim — claim rolls back on shortfall).
2. Court payment metadata `source: coach-lesson-court` → owner settlement at **0 bps** (club gets full charge; no phantom platform skim). Covered by `server/utils/settlement.coach.test.ts`.
3. Athlete lesson fee PAID → coach user wallet credited **net after** `COACH_COMMISSION_BPS` / platform default **10%** (`SETTLEMENT_CREDIT`); club is not the lesson payee. Same test file.
4. Cancel either lesson or court unwinds the sibling: student lesson fee refunded once + coach settlement clawed; coach court fee credited once; slot `FREE`.
5. Wallet top-up requires `PAYMENTS_MODE=test|live` (production is `live`).
6. Public list / book APIs use `PUBLIC_COACH_WHERE` / `assertCoachApproved` — PENDING coaches are 404. Covered by `server/utils/coaches.test.ts`.

---

## Env (Liara)

| Variable | Go-live value |
|----------|----------------|
| `PILOT_NO_COACH` | `false` or unset |
| `NUXT_PUBLIC_PILOT_NO_COACH` | `false` or unset |
| `PAYMENTS_MODE` | `live` (already) or `test` — not `pay_at_club` alone |

Redeploy after flag change so client runtimeConfig matches.

Migrations required: `20260824120000_coach_marketplace_approval_and_club_links`, `20260824170000_coach_lesson_court_booking`.

---

## Functional checks

| ID | Check |
|----|--------|
| C-01 | Signup creates Coach `PENDING`; not listed on `/coaches` |
| C-02 | Admin `/admin/coach-applications` approve → bookable |
| C-03 | Coach books court at any ACTIVE club at **full listed price** (no owner affiliation / discount) |
| C-04 | `/coach/book` underfunded wallet rejected; funded book succeeds |
| C-05 | Cancel lesson → court FREE + coach wallet credited once |
| C-06 | Court MVP smoke still green; packages still `403` |

---

## Ops note

After enable: approve real coaches deliberately; do not auto-approve PENDING marketplace signups.

## Prompt 2 readiness (2026-08-30)

| Area | Status |
|------|--------|
| Coach lesson settlement + 0 bps court | unit tests `settlement.coach.test.ts` |
| Approval / public list gate | unit tests `coaches.test.ts` |
| Cancel lesson↔court unwind | unit tests `cancellations.coach.test.ts` |
| Underfunded wallet fail-fast | `lessons.post.ts` balance check + atomic debit |
| Class packages Phase 4 pay/cancel | athlete book + checkout + cancel APIs present |
| Package unpaid expiry | `expireStalePendingPackageBookings` + cron step + `packages.expire.test.ts` |
| `PACKAGES_ENABLED` on Liara | **still off** — turn on only after ops go-no-go |
