# Launch Checklist — inbox

Status as of July 2026. Re-verify before each production release.

Production: **Liara** (`inbox` app) at `https://inboxs.ir` (fallback: `https://inbox.liara.run`).

## Pre-launch

- [x] `NUXT_SESSION_PASSWORD` set (32+ chars) on Liara
- [x] `DATABASE_URL` points to Liara Postgres (`inbox-db`)
- [x] `NUXT_PUBLIC_SITE_URL=https://inboxs.ir` on Liara
- [x] `SEED_ON_EMPTY` removed / set to `false` after first deploy
- [x] `ADMIN_PROVISION_SECRET` set for club provisioning
- [x] `PAYMENTS_MODE=pay_at_club` remains (pay at club only; Zarinpal live still not implemented — do not set `live` until a real IPG adapter ships)
- [x] Behnaz pilot: coach UX off on prod (`pilotNoCoach` in client payload; `/coaches` → `/clubs`; coach discovery APIs 404). Prefer `PILOT_NO_COACH=true` on Liara (server-only, no rebuild). Optional `NUXT_PUBLIC_PILOT_NO_COACH=true` if client flag needs a runtime override / rebuild.
- [ ] Live SMS/OTP when ready (primary auth for athletes + club owners) — Liara `inbox` app:
  - `SMS_ENABLED=true`
  - `SMS_PROVIDER=kavenegar` (or `live`)
  - `KAVENEGAR_API_KEY`
  - `KAVENEGAR_TEMPLATE` (Verify Lookup preferred for OTP) and/or `KAVENEGAR_SENDER` (free-text / CRM)
  - Until then SMS stays log/dry-run; UI shows `otpLogModeHint` / `debugOtpHint` (never claim live SMS)
  - See docs/OPERATIONS.md → "SMS auth (Kavenegar OTP)"
- [ ] `SENTRY_DSN` + `SENTRY_ENVIRONMENT=production` on Liara — keep unchecked until verified:
  - Create Sentry project; copy DSN (never commit). See docs/OPERATIONS.md → "Sentry (error tracking)"
  - Local unset: `npm run sentry:status` → `sentryEnabled: false`; app works
  - Local set: restart after `.env` DSN; `POST /api/admin/sentry-test` with `x-admin-secret` → event in Sentry
  - Client: `/admin/sentry` → Test client capture (or `$sentryCaptureTest()`)
  - Prod: same admin test against `https://inboxs.ir` after Liara env + redeploy
- [ ] Object storage (Liara bucket) — keep unchecked until verified:
  - Create public bucket + access key in Liara Object Storage. See docs/OPERATIONS.md → "Object storage (S3 / Liara)"
  - Liara `inbox` app env: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` (e.g. `https://{bucket}.storage.iran.liara.space`)
  - Local unset: `npm run storage:status` → `storageMode: "local"`; uploads write to `public/uploads`
  - Limits: JPEG/PNG/WebP, max 5 MB (guest oversized → 400)
  - Prod: after env + redeploy, upload avatar/gallery on `https://inboxs.ir` — URL uses `S3_PUBLIC_URL`; `/admin` shows storage mode `s3` (never prints keys)
- [x] Google OAuth retired from product UI (phone OTP primary). Keep `NUXT_OAUTH_GOOGLE_*` unset on Liara. `/auth/google` fail-closed when unset; no Google button on login/register.
- [ ] Live email when ready — keep unchecked until verified on Liara:
  - Liara env: `EMAIL_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT` (587/465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (e.g. `inbox <noreply@inboxs.ir>`)
  - Until then leave `EMAIL_ENABLED` unset/`false` — flows log only; no SMTP required for local/CI
  - Verify log mode: `npm run email:status` → `emailMode: "log"`, `emailConfigured: false`
  - Forgot-password UX in log mode: FA copy prefers phone OTP; does not claim “email sent” without recovery
  - Verify live: `/admin` overview shows email mode `live` + configured yes; or `GET /api/admin/email-status` (never exposes `SMTP_PASS`)
  - Smoke: forgot-password and a booking confirm still succeed if SMTP is down (soft-fail)
- [x] Login/register are phone-OTP primary (athlete email/password register → 410)
- [x] Login page no longer pre-fills demo credentials
- [x] Demo seed gated behind `SEED_DEMO_DATA=true` (default: sports catalog only, even in dev)
- [x] Demo cleanup runs automatically on production startup
- [x] Demo login/registration blocked in production (`*@inbox.local`)
- [x] Demo passwords removed from production (unset `SEED_DEMO_DATA`; auto-cleanup on deploy)
- [x] Postgres backup verified (`inbox-db`): Liara hourly/daily backups present; manual `liara db backup create --name inbox-db` succeeded (`manual/2026-07-19T01-45-22-….dump.tar.gz`). See docs/OPERATIONS.md → "Database backup"
- [x] Prod catalog wipe (2026-07-19): all users/clubs wiped; sports kept; static `/hero` assets kept. Re-provision clubs via `/admin/provision` (e.g. Behnaz). See docs/OPERATIONS.md → "Production data wipe"

## Automated QA

CI runs on every push/PR:

```bash
npm run build
npm test
node scripts/ci-smoke.mjs   # API + page smoke against seeded Postgres
```

Manual staging check:

```bash
BASE_URL=https://inboxs.ir npm run smoke
BASE_URL=https://inboxs.ir npm run smoke:pages
npm run qa:matrix
```

## Manual QA matrix

Run `node scripts/qa-matrix.mjs` against staging URL.

| Area | FA | EN |
|------|----|----|
| Public home, clubs, coaches | | |
| Athlete register/login/book/cancel | | |
| Owner calendar/finance/settings | | |
| Coach schedule | | |
| Forgot/reset password (email) | | |
| Club apply → admin approve | | |
| Athlete notifications | | |
| Legal pages | | |

## Security

- [x] Register cannot escalate to CLUB_ADMIN/COACH
- [x] Rate limits on auth routes
- [x] Staff permissions enforced on owner APIs + nav
- [x] Session secret enforced at startup

## Post-launch

- [ ] Merge `cursor/booking-mvp-hardening` → `main`
- [ ] Monitor Liara deploy logs + Sentry
- [x] Legal contact emails use production domain (`privacy@inboxs.ir`, `support@inboxs.ir`)
