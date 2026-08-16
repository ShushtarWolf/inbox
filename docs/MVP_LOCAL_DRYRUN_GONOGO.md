# MVP local dry-run — go / no-go (inboxs.ir)

**Date:** 2026-08-14  
**Scope:** Section 4 of [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) — **local column** only  
**Agent constraint:** **Do not deploy.** Production cutover to Liara (`inbox` → `https://inboxs.ir`) is a **human** step after secrets are filled.

---

## Verdict

| Gate | Result |
|------|--------|
| **Local MVP dry-run (log SMS + test IPG)** | **GO** |
| **Production `inboxs.ir` live cutover** | **NO-GO** until human fills Liara secrets, deploys, and re-runs the live matrix column |

Local automated helpers and matrix coverage passed under `PILOT_NO_COACH=true`, `SMS_PROVIDER=log` / `SMS_ENABLED=false`, `PAYMENTS_MODE=test` (no `SEP_TERMINAL_ID`). Green local smoke is **not** a substitute for live OTP / live SEP on production.

---

## Environment used for this dry-run

| Setting | Value |
|---------|--------|
| Base URL | `http://127.0.0.1:3000` (dev-stable) |
| `PILOT_NO_COACH` / public mirror | `true` (process env for this run) |
| SMS | log / SINGLE (`resolvedProvider: log`, `smsMode: log`) |
| Payments | `test` → `/payments/test-gateway` (`hasSepTerminalId: false`) |
| `ADMIN_PROVISION_SECRET` | set (local `.env`) |
| DB | local Postgres (`npm run check:db` ok) |

Note: local `.env` had `PILOT_NO_COACH=false` by default; the dry-run started the server with `PILOT_NO_COACH=true NUXT_PUBLIC_PILOT_NO_COACH=true` so coach freeze rows were exercised. Runtime HTML confirmed `pilotNoCoach:true`, `googleAuthEnabled:false`.

---

## Automated helpers executed

| Command | Result |
|---------|--------|
| `npm run check:db` | PASS |
| `npm run sms:status` | PASS (log mode expected locally) |
| `npm run payments:status` | PASS (test gateway expected locally) |
| `npm run smoke:pilot` | **PASS** |
| `BASE_URL=http://localhost:3000 npm run qa:matrix` | **PASS** |
| `BASE_URL=http://localhost:3000 npm run smoke:pages` | **PASS** |
| `BASE_URL=http://localhost:3000 npm run smoke:security` | **PASS** |
| `npx vitest run shared/payments.test.ts` | **PASS** (11) |

`smoke:pilot` highlights: owner OTP login, desk reserve/pay/cancel, season/package `403`, athlete book→test-pay→`PAID`→cancel→slot `FREE`, waitlist on/off, legal shells, Google UI absent, coach redirects when pilot flag on.

---

## Section 4 matrix — local column

| # | Check | Local result | Evidence / notes |
|---|--------|--------------|------------------|
| 1 | Owner SMS login | **PASS** | `smoke:pilot`: provision + OTP `debugCode` → owner session; email+temp password fallback also ok |
| 2 | Athlete SMS register/login | **PASS** | `smoke:pilot`: athlete register (OTP) → `/athlete` path exercised |
| 3 | Book court → online pay → `PAID` → SMS confirm | **PASS** (test IPG) | `PAYMENTS_MODE=test` → test-gateway OK → `PAID`; SMS skipped/logged (not live) |
| 4 | Cancel → SMS + slot `FREE` | **PASS** | Desk cancel + athlete cancel → slot `FREE`; SMS log/skip |
| 5 | Waitlist OK or off | **PASS** | Join when enabled; clean fail when off |
| 6 | Season/package hidden | **PASS** | No packages create; APIs `403`; soft-land `/book/package`; `/owner/packages` stub |
| 7 | `/coaches` redirected/hidden | **PASS** | `302` → `/clubs`; `/register/coach` + `/owner/coaches` redirected; calendar without coach UI |
| 8 | Legal/contact load | **PASS** | `/contact` `/privacy` `/terms` HTTP 200 (also `qa:matrix` / `smoke:pages`) |
| 9 | No Google OAuth UI | **PASS** | `/login` has no Google button (`googleAuthEnabled:false`) |

**Liara (live) column:** not run — **blocked** until secrets + human deploy (see below).

---

## Remaining secrets the human must set on Liara

Fill in the Liara dashboard for app `inbox` using [LIARA_ENV_FILL_SHEET.md](./LIARA_ENV_FILL_SHEET.md). Do **not** commit real values. Agent does **not** deploy.

### Always required

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Liara Postgres `inbox-db` |
| `NUXT_SESSION_PASSWORD` | ≥32 chars (not demo fallback) |
| `NUXT_PUBLIC_SITE_URL` | `https://inboxs.ir` |
| `ADMIN_PROVISION_SECRET` | long random (provision + admin APIs) |
| `SEED_ON_EMPTY` | unset / `false` after first catalog seed |

### Pilot (coach OFF)

| Variable | Value |
|----------|--------|
| `PILOT_NO_COACH` | `true` |
| `NUXT_PUBLIC_PILOT_NO_COACH` | `true` (optional belt-and-suspenders) |

### SMS / OTP (Kavenegar) — required for real login

| Variable | Notes |
|----------|--------|
| `SMS_ENABLED` | `true` |
| `SMS_PROVIDER` | `kavenegar` or `live` |
| `KAVENEGAR_API_KEY` | from panel |
| `KAVENEGAR_TEMPLATE` | Verify Lookup (preferred for OTP) |
| `KAVENEGAR_SENDER` | approved line (free-text booking/CRM SMS) |

Until C is complete, OTP stays log/`debugCode` — **not** production-safe.  
Never set `AUTH_OTP_BYPASS_PHONES` / `ALLOW_OTP_BYPASS` (OTP phone bypass was removed).

### Payments — pick ONE path

**D1 — desk fallback (OK MVP without SEP):**

| Variable | Value |
|----------|--------|
| `PAYMENTS_MODE` | `pay_at_club` |
| `PAYMENT_PROVIDER` / `SEP_TERMINAL_ID` | leave unset |

**D2 — online later:**

| Variable | Value |
|----------|--------|
| `PAYMENTS_MODE` | `test` first; `live` **only** after SEP verify |
| `PAYMENT_PROVIDER` | omit or `sep` |
| `SEP_TERMINAL_ID` | numeric terminal |
| SEP panel callback | `https://inboxs.ir/payments/callback/sep` |

### Keep unset for this MVP

`NUXT_OAUTH_GOOGLE_*`, live SMTP / `S3_*` / `SENTRY_DSN` (optional polish).

---

## Exact manual steps AFTER human fills secrets and deploys

**Agent must NOT deploy.** Human only:

1. Confirm all required rows in [LIARA_ENV_FILL_SHEET.md](./LIARA_ENV_FILL_SHEET.md) are set in Liara.
2. Deploy yourself: `liara deploy --app inbox` (production host Liara / `inboxs.ir` only — not Railway).
3. Confirm SMS live:
   ```bash
   curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
     https://inboxs.ir/api/admin/sms-status
   ```
   Expect `resolvedProvider` / `smsMode` **live** (not log). UI: `https://inboxs.ir/admin/sms`.
4. Confirm payments mode:
   ```bash
   curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
     https://inboxs.ir/api/admin/payments-status
   ```
   Expect `pay_at_club` or `test` until SEP verified; **do not** use `live` until then.
5. Shell re-check:
   ```bash
   BASE_URL=https://inboxs.ir npm run qa:matrix
   ```
6. Provision Behnaz club ([LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) §2) — owner **phone** required for OTP.
7. Re-run **live column** of section 4 matrix on `https://inboxs.ir`:
   - Live owner OTP SMS → `/owner`
   - Live athlete OTP → `/athlete`
   - Book → pay (desk / `test` / live SEP only if enabled) → `PAID` + SMS confirm as applicable
   - Cancel → live cancel SMS + slot `FREE`
   - Waitlist / season-package freeze / coaches redirect / legal / no Google — same as local
8. Optional (creates throwaway club if secret available):
   ```bash
   BASE_URL=https://inboxs.ir npm run smoke:pilot
   ```
9. Monitor Liara logs for Kavenegar / SEP errors.

---

## Explicit non-actions

- **Agent did not deploy** and must not deploy for this cutover.
- Local GO does **not** authorize claiming production ready.
- Do **not** set `PAYMENTS_MODE=live` until SEP terminal verified ([PAYMENTS.md](./PAYMENTS.md)).

---

## Summary

Local section-4 matrix + `smoke:pilot` / `qa:matrix` / `smoke:pages` / `smoke:security` are green under log SMS + test IPG + pilot coach-off. **Production remains NO-GO** until the human sets Liara secrets, deploys to `inbox`, and completes the live OTP / payments matrix on `https://inboxs.ir`.
