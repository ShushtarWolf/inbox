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

1. Coach wallet must cover discounted court charge **before** slot claim succeeds (`debitWallet` atomic).
2. Court payment metadata `source: coach-lesson-court` → owner settlement at **0 bps** (club gets full charge; no phantom platform skim).
3. Cancel either lesson or court unwinds the sibling: student lesson fee refunded once; coach court fee credited once; slot `FREE`.
4. Wallet top-up requires `PAYMENTS_MODE=test|live` (production is `live`).

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
| C-03 | Owner accepts `CoachClubLink` + sets `courtDiscountPercent` |
| C-04 | `/coach/book` underfunded wallet rejected; funded book succeeds |
| C-05 | Cancel lesson → court FREE + coach wallet credited once |
| C-06 | Court MVP smoke still green; packages still `403` |

---

## Ops note

After enable: approve real coaches deliberately; do not auto-approve PENDING marketplace signups.
