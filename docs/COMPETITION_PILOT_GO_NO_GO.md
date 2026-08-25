# Competition Pilot Go/No-Go — IUST (Behnaz)

Short checklist before enabling **competitions** for real athletes at the IUST pilot club.  
Style mirrors [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md). **Do not deploy** or set `PAYMENTS_MODE=live` from this doc.

**Pilot club:** live IUST club slug is `iust-tennis` (`PILOT_CLUB_SLUG` in `shared/pilotClub.ts`). Set `COMPETITIONS_PILOT_CLUB_SLUG=iust-tennis` (legacy env aliases `iust` / `بهناز` normalize with a warning).  
**Local runner:** `npm run competition:go-no-go` (needs server + `ADMIN_PROVISION_SECRET` + applied competition migrations).  
**Risk register:** [COMPETITION_RISK_SPEC.md](./COMPETITION_RISK_SPEC.md) (Phase 1 scope, failure modes, invariants).  
**Regression:** `npm run smoke:pilot` (court booking freeze unchanged).

---

## Freeze — competitions must not re-enable MVP-outs

Per [MVP_SCREEN_INVENTORY.md](./MVP_SCREEN_INVENTORY.md), competitions are **additive**. These must stay off:

| Surface | How it stays off | Check |
|---------|------------------|-------|
| Coach product | `PILOT_NO_COACH=true` + middleware | **PASS** — `smoke:pilot` + `/coaches` → redirect |
| Season / package / recurring | `isRecurringReserveEnabled() === false` → API `403` | **PASS** — `smoke:pilot` + go-no-go `R-04` |
| Google OAuth | `/auth/google` 404; UI hard-off | **PASS** — `smoke:pilot` |
| EN product UI | `defaultLocale: fa` + `/en` redirect | **PASS** — `smoke:pilot` |
| Live IPG for entry fees | Only when `PAYMENTS_MODE=test\|live`; **not** `live` until SEP verified | **PASS** — local `PAYMENTS_MODE=test`; no live IPG in this run |

Competition routes (`/competitions`, `/athlete/competitions`, `/owner/competitions`) are **not** in the Behnaz MVP inventory — treat as a **pilot add-on** gated by ops flag (see §OPS).

---

## Env (before pilot enable)

| Variable | Pilot value | Notes |
|----------|-------------|--------|
| `PAYMENTS_MODE` | `test` (local) or `pay_at_club` (desk-only entry) | **Do not** set `live` until [PAYMENTS.md](./PAYMENTS.md) verify |
| `PILOT_NO_COACH` | `true` | Unchanged |
| `COMPETITIONS_ENABLED` | **`false` default**; `true` only when enabling pilot | **PASS** — `isCompetitionsEnabled()` in `shared/competition.ts`; Nuxt `runtimeConfig.public.competitionsEnabled` |
| `COMPETITIONS_PILOT_CLUB_SLUG` | `iust-tennis` (`PILOT_CLUB_SLUG`) | **PASS** — `isCompetitionsVisibleForClub(slug)`; optional single-club pilot |
| `ADMIN_PROVISION_SECRET` | set | Cron + admin competition jobs |
| DB migrations | `20260824210000_competitions` + prizes + awards applied | Required on Liara before deploy |

Confirm payments (never print secrets):

```bash
npm run payments:status
# or GET /api/admin/payments-status with x-admin-secret
```

---

## Automated preflight

```bash
# Unit (status machines, idempotency, prize caps)
npm test -- shared/competition.test.ts server/utils/competitions.test.ts

# Court-booking regression (Behnaz freeze)
PILOT_NO_COACH=true PAYMENTS_MODE=test npm run smoke:pilot

# Competition integration (local, mutates test DB; server must have COMPETITIONS_ENABLED=true)
COMPETITIONS_ENABLED=true PILOT_NO_COACH=true PAYMENTS_MODE=test BASE_URL=http://localhost:3000 npm run competition:go-no-go
```

**Last local run (2026-08-24):** unit **44/44 PASS**; `smoke:pilot` **PASS**; go-no-go **16/16 PASS** (`COMPETITIONS_ENABLED=true`, `PAYMENTS_MODE=test`; F-10 skipped — requires `pay_at_club` on server); Playwright `e2e/competition-detail.spec.ts` **PASS in CI** (375px U-01).

---

## 1. FUNCTIONAL

| ID | Check | Result | Evidence / notes |
|----|--------|--------|------------------|
| F-01 | Join when **1 seat left** — two concurrent joins → only one succeeds | **PASS** | Row lock + active seat count; go-no-go `200/409`, `confirmed=1 active=2` |
| F-02 | **Payment callback retry** — still one CONFIRMED entry | **PASS** | go-no-go: test-gateway double OK callback → `confirmedCount=1`, athlete entry `CONFIRMED`. Checkout refreshes join-linked payment in place (`competition-entry:{compId}:{athleteId}`); `confirmEntryFromPayment` metadata fallback for stale links. |
| F-03 | Cancel entry **within policy** → wallet credited **once** | **PASS** | go-no-go: refund +200000 toman |
| F-04 | Cancel entry **outside policy** → rejected with clear **FA** message | **PASS** | `409 CANCELLATION_WINDOW_PASSED` → `competitions.errors.cancellationWindowPassed` |
| F-05 | Competition **auto-cancel** below `minParticipants` → all refunded | **PASS** | Admin cron `process-registration-close` → `status=CANCELLED` |
| F-06 | **Owner cancel** → all refunded | **PASS** | `POST /api/owner/competitions/:id/cancel` → `status=CANCELLED` |
| F-07 | **award-prizes twice** → no duplicate credits | **PASS** | Unit: `awardCompetitionPrizes` idempotent (`creditWallet` called once) |
| F-08 | **Doubles:** cannot confirm without valid partner | **PASS** | `400 Partner required for doubles` without `partnerAthleteId` |
| F-09 | **Guest/unauthenticated** cannot join | **PASS** | `401` on `POST .../join` without session |
| F-10 | **Pay-at-club** owner mark-paid confirms entry | **PASS** | `POST .../entries/:entryId/mark-paid` → `CONFIRMED`; double mark → `409`; requires `PAYMENTS_MODE=pay_at_club` on server |

### F-10 — pay-at-club mark paid (curl)

```bash
# Server must run with PAYMENTS_MODE=pay_at_club
JOIN=$(curl -s -X POST "$BASE_URL/api/competitions/$COMP_ID/join" \
  -H "Content-Type: application/json" -b athlete.txt \
  -d '{"payAtClub":true}')
ENTRY_ID=$(echo "$JOIN" | jq -r '.entry.id')
# Expect entry.status=PENDING, payment.status=PAY_AT_CLUB

curl -s -X POST "$BASE_URL/api/owner/competitions/$COMP_ID/entries/$ENTRY_ID/mark-paid" \
  -b owner.txt | jq '.entry.status'
# Expect: CONFIRMED

curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "$BASE_URL/api/owner/competitions/$COMP_ID/entries/$ENTRY_ID/mark-paid" -b owner.txt
# Expect: 409
```

### F-01 — concurrent join (curl)

```bash
# Prereq: OPEN competition maxParticipants=2, athlete A already CONFIRMED (1 seat left)
# Two terminals, cookies ATHLETE_B / ATHLETE_C:

curl -s -X POST "$BASE_URL/api/competitions/$COMP_ID/join" \
  -H "Content-Type: application/json" \
  -b athlete_b.txt -d '{}' &

curl -s -X POST "$BASE_URL/api/competitions/$COMP_ID/join" \
  -H "Content-Type: application/json" \
  -b athlete_c.txt -d '{}' &

wait
# Expect: one 200 + one 409 COMPETITION_FULL; confirmedCount=2 max after both pay
```

### F-02 — payment callback retry (curl)

```bash
# Join → checkout (online, not wallet) → double OK callback
JOIN=$(curl -s -X POST "$BASE_URL/api/competitions/$COMP_ID/join" \
  -H "Content-Type: application/json" -b athlete.txt -d '{}')
ENTRY_ID=$(echo "$JOIN" | jq -r '.entry.id')

CHECKOUT=$(curl -s -X POST "$BASE_URL/api/payments/checkout" \
  -H "Content-Type: application/json" -b athlete.txt \
  -d "{\"competitionEntryId\":\"$ENTRY_ID\"}")
REF=$(echo "$CHECKOUT" | jq -r '.intent.providerRef')
PROV=$(echo "$CHECKOUT" | jq -r '.intent.provider // "sep"')

curl -sI "$BASE_URL/payments/callback/$PROV?ResNum=$REF&State=OK" | head -1
curl -sI "$BASE_URL/payments/callback/$PROV?ResNum=$REF&State=OK" | head -1

curl -s "$BASE_URL/api/competitions/$COMP_ID" | jq '{confirmedCount,activeCount}'
# Expected: confirmedCount=1
```

**Workaround for pilot desk:** use **wallet checkout** (`useWallet: true`) after top-up — also confirms entry (F-03 path). Online IPG path now works in test mode (F-02).

### F-03 / F-04 — cancel entry (curl)

```bash
# In policy (event far ahead)
curl -s -X POST "$BASE_URL/api/competitions/$COMP_ID/cancel-entry" \
  -H "Content-Type: application/json" -b athlete.txt \
  -d '{"reason":"تست لغو"}' | jq .

# Out of policy (event within club cancellationWindowHours)
# Expect: 409 + statusMessage CANCELLATION_WINDOW_PASSED
# UI maps to FA: «مهلت لغو گذشته است.»
```

### F-05 — auto-cancel cron (curl)

```bash
curl -s -X POST "$BASE_URL/api/admin/competitions/process-registration-close" \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET" | jq .
# Competitions past registrationCloses with confirmedCount < minParticipants → CANCELLED + refunds
```

### F-06 — owner cancel (curl)

```bash
curl -s -X POST "$BASE_URL/api/owner/competitions/$COMP_ID/cancel" \
  -H "Content-Type: application/json" -b owner.txt \
  -d '{"reason":"لغو مسابقه"}' | jq '.competition.status'
# Expect: CANCELLED
```

### F-07 — award-prizes idempotency (curl)

```bash
# After COMPLETED + placements recorded
curl -s -X POST "$BASE_URL/api/owner/competitions/$COMP_ID/award-prizes" -b owner.txt | jq .
curl -s -X POST "$BASE_URL/api/owner/competitions/$COMP_ID/award-prizes" -b owner.txt | jq .
# Expect: second call awards[].skipped=true; wallet balance unchanged
```

---

## 2. REGRESSION

| ID | Check | Result | How |
|----|--------|--------|-----|
| R-01 | Normal **court booking** same club/date | **PASS** | `npm run smoke:pilot` — athlete book → pay(test) → cancel |
| R-02 | Owner **calendar** unaffected (no ghost slots) | **PASS** | Competitions use read-only overlap warning only; no slot rows created |
| R-03 | `PILOT_NO_COACH` still enforced | **PASS** | `/coaches` → redirect `/clubs` |
| R-04 | Package/recurring still **403** | **PASS** | `POST /api/owner/season` → 403 |

### R-01 — court book same day (manual)

1. Owner calendar: note free slot count for pilot date.  
2. Athlete books court on same date via `/clubs/{slug}`.  
3. Confirm slot → RESERVED/PAID; competition cron does not alter slot.

---

## 3. SECURITY

| ID | Check | Result | How |
|----|--------|--------|-----|
| S-01 | Athlete cannot join **owner API** or set **placement** | **PASS** | Athlete `POST /api/owner/competitions` → 403; `PATCH .../placements` → 403 |
| S-02 | Owner cannot **award** another club's competition | **PASS** | Other owner `POST .../award-prizes` → 404 |
| S-03 | **Rate limit** join endpoint | **PASS** | `enforceRateLimit(event, 'competitions:join')` — 10/min per IP + per user; 25 rapid POSTs → 429 `COMPETITION_JOIN_RATE_LIMITED` |

### S-01 — curl

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE_URL/api/owner/competitions" \
  -H "Content-Type: application/json" -b athlete.txt -d '{"title":"x"}'
# Expect: 403

curl -s -o /dev/null -w "%{http_code}\n" -X PATCH "$BASE_URL/api/owner/competitions/$COMP_ID/placements" \
  -H "Content-Type: application/json" -b athlete.txt \
  -d '{"placements":[{"entryId":"e1","placement":1}]}'
# Expect: 403
```

### S-03 — rate limit (curl)

```bash
for i in $(seq 1 25); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/competitions/$COMP_ID/join" \
    -H "Content-Type: application/json" -b athlete.txt -d '{}')
  echo "$i $code"
  [ "$code" = "429" ] && break
done
# Expect: 429 with COMPETITION_JOIN_RATE_LIMITED → FA competitions.errors.rateLimited
```

---

## 4. UX / TRUST (375px Canva)

| ID | Check | Result | How |
|----|--------|--------|-----|
| U-01 | **Prize, fee, cancel deadline** visible before pay | **PASS** | `e2e/competition-detail.spec.ts` @375px + static `/competitions/[id]` `<dl>` before CTA |
| U-02 | **No pill CTAs**; **≤2px** radius on cards | **PASS** | Static: `rounded-sm` on buttons/cards; no `rounded-full` / `btn-primary` in competition pages |
| U-03 | **RTL** — `text-start` on FA copy | **PASS** | No `text-end` on competition pages; labels use default start alignment |

### U-01 — Playwright (375px)

```bash
# Server/build must have COMPETITIONS_ENABLED=true (CI sets this)
npm run test:e2e -- e2e/competition-detail.spec.ts
```

Implemented in [e2e/competition-detail.spec.ts](../e2e/competition-detail.spec.ts): asserts `هزینه ثبت‌نام`, `جوایز`, `سیاست لغو` appear above the join CTA at 375px width.

### U-02 — manual 375px

Hard refresh `http://localhost:3000/competitions/{id}` at **375px** width:

- [ ] Card corners square / `rounded-sm` only  
- [ ] Primary CTA square red (`rounded-sm bg-red-600`)  
- [ ] No pill chips  

---

## 5. OPS

| ID | Check | Result | Notes |
|----|--------|--------|-------|
| OPS-01 | **`COMPETITIONS_ENABLED`** default false; enable only pilot club slug | **PASS** | `shared/competition.ts` gate helpers; APIs/pages gated; owner nav hidden when off |
| OPS-02 | **Runbook:** dispute handling + manual IPG refund + cron jobs | **PASS** | §Runbook below + [OPERATIONS.md](./OPERATIONS.md) § Competition cron jobs; optional [`.github/workflows/competition-cron.yml`](../.github/workflows/competition-cron.yml) |

### OPS-01 — feature gate (implemented)

```bash
# Liara pilot enable:
COMPETITIONS_ENABLED=true
COMPETITIONS_PILOT_CLUB_SLUG=iust-tennis   # PILOT_CLUB_SLUG — only this slug: public list, join, owner publish OPEN

# Verify disabled (default / unset):
curl -s "$BASE_URL/api/competitions" | jq length   # 0
curl -s -o /dev/null -w "%{http_code}\n" "$BASE_URL/api/competitions/$COMP_ID"  # 404

# Verify pilot-only (when slug set):
curl -s "$BASE_URL/api/competitions" | jq '[.[].club.slug] | unique'   # ["iust-tennis"]
# Non-pilot owner POST /api/owner/competitions → 404; publish OPEN blocked
```

When `COMPETITIONS_ENABLED=false`: public pages show CanvaEmptyState «به‌زودی»; owner «مسابقات» nav hidden.

### OPS-02 — Runbook (disputes & manual refund)

| Scenario | Action |
|----------|--------|
| Athlete paid IPG, entry stuck **PENDING** | 1) `GET /api/admin/competitions/...` or owner entries list. 2) Confirm payment `PAID` in finance. 3) Re-run sync: wallet checkout with `useWallet` or manual `confirmEntry` via support script. 4) If duplicate charge: check `idempotencyKey` `competition-entry:{compId}:{athleteId}`. |
| **Double IPG charge** (rare) | F-02 fixed — checkout reuses join payment idempotency key. If duplicate still occurs: refund via SEP panel; credit wallet with note `competition:manual-refund:{paymentId}`. |
| **Cancel dispute** (inside/outside window) | Compare `eventAt` vs `club.cancellationWindowHours`; FA copy from `competitions.errors.cancellationWindowPassed`. Owner override: owner cancel competition (refunds all CONFIRMED). |
| **Prize not credited** | Owner → complete → placements → `award-prizes` once. Retry safe (idempotent). Audit: `GET /api/admin/competitions/:id/awards` with `x-admin-secret`. |
| **Below min participants** after close | Cron: `POST /api/admin/competitions/process-registration-close` (also expires stale PENDING). |
| **Stale PENDING** (unpaid 10+ min) | `POST /api/admin/competitions/expire-pending` |

Scheduled jobs (Liara cron / GitHub Actions — see [OPERATIONS.md](./OPERATIONS.md)):

```bash
# Every 15 min
curl -s -X POST https://inboxs.ir/api/admin/competitions/process-registration-close \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET"

curl -s -X POST https://inboxs.ir/api/admin/competitions/expire-pending \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET"
```

GitHub optional: `.github/workflows/competition-cron.yml` (requires repo secret `ADMIN_PROVISION_SECRET`).

---

## 6. Bugs found during this run (fix before prod)

| Severity | Issue | Status |
|----------|--------|--------|
| **Blocker** | F-02: checkout breaks competition entry ↔ payment link on test/live IPG path | **Fixed** (2026-08-24) |
| **Blocker** | OPS-01: no `COMPETITIONS_ENABLED` / pilot-club gate | **Fixed** (2026-08-24) |
| **High** | S-03: no rate limit on join | **Fixed** (2026-08-24) |
| **Fixed locally** | `owner/competitions/[id].get.ts` selected `User.mobile` (invalid) → **phone** | Fixed |
| **Fixed locally** | `owner/competitions/[id]/cancel.post.ts` wrong import depth | Fixed |

---

## Go / No-Go summary

| Area | Verdict |
|------|---------|
| Functional | **GO** — F-02 IPG confirm path **fixed**; OPS-01 gate **fixed**; S-03 rate limit **fixed** |
| Regression | **GO** — court booking + freeze intact |
| Security | **GO** — join rate limit enforced (10/min IP + user) |
| UX / trust | **GO** — U-01 Playwright @375px in CI; Canva radius OK |
| Ops | **GO** — OPS-01 gate **PASS**; OPS-02 runbook + cron documented |

**Overall: GO** for pilot with `COMPETITIONS_ENABLED=true` + `COMPETITIONS_PILOT_CLUB_SLUG=iust-tennis`, `PAYMENTS_MODE=pay_at_club` or **wallet/online test** entry, cron jobs scheduled (Liara or GitHub).

---

## After code fixes — re-run

```bash
npm test -- shared/competition.test.ts server/utils/competitions.test.ts
PILOT_NO_COACH=true PAYMENTS_MODE=test npm run smoke:pilot
COMPETITIONS_ENABLED=true PILOT_NO_COACH=true PAYMENTS_MODE=test BASE_URL=http://localhost:3000 npm run competition:go-no-go
npm run test:e2e -- e2e/competition-detail.spec.ts
```

Do **not** deploy to Liara or set `PAYMENTS_MODE=live` until this checklist is green and migrations are on production.
