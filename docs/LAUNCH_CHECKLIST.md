# Launch Checklist — inbox

## Pre-launch

- [ ] `NUXT_SESSION_PASSWORD` set (32+ chars) on Railway
- [ ] `DATABASE_URL` points to Postgres (`${{Postgres.DATABASE_URL}}`)
- [ ] `SEED_ON_EMPTY` removed after first deploy (or set false)
- [ ] `ADMIN_PROVISION_SECRET` set for club provisioning
- [ ] `PAYMENTS_MODE=pay_at_club` (no live IPG until business approval)
- [ ] Demo passwords not in production seed
- [ ] Postgres backup verified (`pg_dump`)

## Automated QA

```bash
npm run build
npm test
npm run smoke
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

- [ ] Register cannot escalate to CLUB_ADMIN/COACH
- [ ] Rate limits on auth routes
- [ ] Staff permissions enforced on owner APIs + nav
- [ ] Session secret enforced at startup

## Post-launch

- [ ] Merge `cursor/booking-mvp-hardening` → `main`
- [ ] Monitor Railway deploy logs
- [ ] Remove `SEED_ON_EMPTY` if still set
