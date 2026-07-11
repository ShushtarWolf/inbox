# Launch Checklist — inbox

Status as of July 2026. Re-verify before each production release.

## Pre-launch

- [x] `NUXT_SESSION_PASSWORD` set (32+ chars) on Railway
- [x] `DATABASE_URL` points to Postgres (`${{Postgres.DATABASE_URL}}`)
- [x] `NUXT_PUBLIC_SITE_URL` set on Railway
- [x] `SEED_ON_EMPTY` removed / set to `false` after first deploy
- [x] `ADMIN_PROVISION_SECRET` set for club provisioning
- [x] `PAYMENTS_MODE=pay_at_club` (no live IPG until business approval)
- [ ] `SENTRY_DSN` set for production error tracking (add your Sentry project DSN in Railway)
- [ ] Railway S3 bucket created; `S3_*` vars set on app service
- [ ] Google OAuth client created; `NUXT_OAUTH_GOOGLE_*` vars set; redirect URI `https://<domain>/auth/google`
- [ ] `EMAIL_ENABLED=true` + SMTP vars configured on Railway (when ready to send live email)
- [x] Login page no longer pre-fills demo credentials
- [x] Demo seed gated behind `SEED_DEMO_DATA=true` (production default: sports catalog only)
- [x] Demo cleanup script: `CONFIRM=yes node scripts/cleanup-demo-accounts.mjs`
- [ ] Demo passwords removed from production (unset `SEED_DEMO_DATA`; run cleanup script if demo accounts present)
- [ ] Postgres backup verified (`pg_dump`)

## Automated QA

CI runs on every push/PR:

```bash
npm run build
npm test
node scripts/ci-smoke.mjs   # API + page smoke against seeded Postgres
```

Manual staging check:

```bash
BASE_URL=https://shushzerv-production.up.railway.app npm run smoke
BASE_URL=https://shushzerv-production.up.railway.app npm run smoke:pages
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
- [ ] Monitor Railway deploy logs + Sentry
- [x] Replace placeholder legal contact emails (`privacy@inbox.ir`, `support@inbox.ir`)
