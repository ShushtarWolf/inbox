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
- [ ] Behnaz pilot: `NUXT_PUBLIC_PILOT_NO_COACH=true` on Liara (`inbox` app) — hides coach nav/URLs/APIs; also set `PILOT_NO_COACH=true` if server-only gate needed without rebuild
- [ ] Live SMS/OTP when ready: `SMS_ENABLED=true`, `SMS_PROVIDER=live` (or `kavenegar`), and `KAVENEGAR_API_KEY` on Liara (optional `KAVENEGAR_TEMPLATE` / `KAVENEGAR_SENDER`); until then SMS stays log/dry-run
- [ ] `SENTRY_DSN` + `SENTRY_ENVIRONMENT=production` on Liara — keep unchecked until verified:
  - Create Sentry project; copy DSN (never commit). See docs/OPERATIONS.md → "Sentry (error tracking)"
  - Local unset: `npm run sentry:status` → `sentryEnabled: false`; app works
  - Local set: restart after `.env` DSN; `POST /api/admin/sentry-test` with `x-admin-secret` → event in Sentry
  - Client: `/admin/sentry` → Test client capture (or `$sentryCaptureTest()`)
  - Prod: same admin test against `https://inboxs.ir` after Liara env + redeploy
- [ ] Object storage bucket created; `S3_*` vars set on Liara app — keep unchecked until verified
- [ ] Google OAuth — keep unchecked until verified on Liara:
  - Console: Web client; JS origins `http://localhost:3000` + `https://inboxs.ir`; redirect URIs `http://localhost:3000/auth/google` + `https://inboxs.ir/auth/google`
  - Liara env: `NUXT_OAUTH_GOOGLE_CLIENT_ID`, `NUXT_OAUTH_GOOGLE_CLIENT_SECRET`, `NUXT_OAUTH_GOOGLE_REDIRECT_URL=https://inboxs.ir/auth/google`, `NUXT_PUBLIC_SITE_URL=https://inboxs.ir`
  - Verify local fail-closed (vars unset): no Google button; `GET /auth/google` → `/login?error=google` (FA message)
  - Verify local optional (vars set): button visible; `/auth/google` redirects to Google
  - Verify prod: button on `https://inboxs.ir/login` → sign-in → ATHLETE session; error path `/login?error=google`
- [ ] Live email when ready — keep unchecked until verified on Liara:
  - Liara env: `EMAIL_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT` (587/465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (e.g. `inbox <noreply@inboxs.ir>`)
  - Until then leave `EMAIL_ENABLED` unset/`false` — flows log only; no SMTP required for local/CI
  - Verify log mode: `npm run email:status` → `emailMode: "log"`, `emailConfigured: false`
  - Verify live: `/admin` overview shows email mode `live` + configured yes; or `GET /api/admin/email-status` (never exposes `SMTP_PASS`)
  - Smoke: forgot-password and a booking confirm still succeed if SMTP is down (soft-fail)
- [x] Login page no longer pre-fills demo credentials
- [x] Demo seed gated behind `SEED_DEMO_DATA=true` (default: sports catalog only, even in dev)
- [x] Demo cleanup runs automatically on production startup
- [x] Demo login/registration blocked in production (`*@inbox.local`)
- [x] Demo passwords removed from production (unset `SEED_DEMO_DATA`; auto-cleanup on deploy)
- [ ] Postgres backup verified (`pg_dump`) — keep unchecked until verified

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
- [x] Replace placeholder legal contact emails (`privacy@inbox.ir`, `support@inbox.ir`)
