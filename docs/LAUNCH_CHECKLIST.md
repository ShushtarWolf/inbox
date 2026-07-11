# Launch Checklist — inbox

Status as of July 2026. Re-verify before each production release.

## Pre-launch

- [x] `NUXT_SESSION_PASSWORD` set (32+ chars) on Railway
- [x] `DATABASE_URL` points to Postgres (`${{Postgres.DATABASE_URL}}`)
- [x] `SEED_ON_EMPTY` removed / set to `false` after first deploy
- [x] `ADMIN_PROVISION_SECRET` set for club provisioning
- [x] `PAYMENTS_MODE=pay_at_club` (no live IPG until business approval)
- [ ] `SENTRY_DSN` set for production error tracking (add your Sentry project DSN in Railway)
- [ ] Demo passwords removed from production (unset `SEED_DEMO_DATA`; rotate or delete demo accounts if present)
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
| Forgot/reset password | | |
| Club apply form | | |
| Legal pages | | |

## Security

- [x] Register cannot escalate to CLUB_ADMIN/COACH
- [x] Rate limits on auth routes
- [x] Staff permissions enforced on owner APIs + nav
- [x] Session secret enforced at startup

## Post-launch

- [ ] Merge `cursor/booking-mvp-hardening` → `main`
- [ ] Monitor Railway deploy logs + Sentry
- [ ] Replace placeholder legal contact emails (`privacy@inbox.app`, `support@inbox.app`)
