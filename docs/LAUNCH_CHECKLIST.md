# Launch Checklist — inbox

Status as of July 2026. Re-verify before each production release.

Production: **Liara** (`inbox` app) at `https://inboxs.ir` (fallback: `https://inbox.liara.run`).

## Pre-launch

- [x] `NUXT_SESSION_PASSWORD` set (32+ chars) on Liara
- [x] `DATABASE_URL` points to Liara Postgres (`inbox-db`)
- [x] `NUXT_PUBLIC_SITE_URL=https://inboxs.ir` on Liara
- [x] `SEED_ON_EMPTY` removed / set to `false` after first deploy
- [x] `ADMIN_PROVISION_SECRET` set for club provisioning
- [x] `PAYMENTS_MODE=pay_at_club` (no live IPG until business approval)
- [ ] `SENTRY_DSN` set for production error tracking (Liara env vars)
- [ ] Object storage bucket created; `S3_*` vars set on Liara app
- [ ] Google OAuth client created; `NUXT_OAUTH_GOOGLE_*` vars set; redirect URI `https://inboxs.ir/auth/google`
- [ ] `EMAIL_ENABLED=true` + SMTP vars configured on Liara (when ready to send live email)
- [x] Login page no longer pre-fills demo credentials
- [x] Demo seed gated behind `SEED_DEMO_DATA=true` (default: sports catalog only, even in dev)
- [x] Demo cleanup runs automatically on production startup
- [x] Demo login/registration blocked in production (`*@inbox.local`)
- [x] Demo passwords removed from production (unset `SEED_DEMO_DATA`; auto-cleanup on deploy)
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
