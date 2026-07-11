# Operations Runbook — inbox

## Environment variables (production)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Railway: reference `${{Postgres.DATABASE_URL}}`) |
| `NUXT_SESSION_PASSWORD` | Yes | Session encryption secret (min 32 chars, not demo fallback) |
| `SEED_ON_EMPTY` | First deploy | Set `true` once to seed sports catalog on empty DB; remove after |
| `ADMIN_PROVISION_SECRET` | Yes | Header secret for `POST /api/admin/provision` and club approval |
| `PAYMENTS_MODE` | No | `pay_at_club` (default), `test`, or `live` |
| `EMAIL_ENABLED` | No | `true` to send password-reset emails (default: log only) |
| `SENTRY_DSN` | No | Server + client error tracking when set (uses `@sentry/node` / `@sentry/vue`) |

## Database backup (PostgreSQL)

### Backup

```bash
# From Railway Postgres service shell or with public URL
pg_dump "$DATABASE_URL" -Fc -f inbox-backup-$(date +%Y%m%d).dump
```

Railway dashboard: Postgres service → Backups (if enabled on plan).

### Restore

```bash
pg_restore -d "$DATABASE_URL" --clean --if-exists inbox-backup-YYYYMMDD.dump
```

**Warning:** restore replaces data. Take a fresh backup before restore.

## Deploy rollback

1. Railway dashboard → `shushzerv` service → Deployments
2. Select last successful deployment → Redeploy
3. If schema migration caused issues: restore DB backup, then redeploy previous build

Production start sequence (`scripts/start-production.mjs`):

1. `prisma migrate deploy`
2. Conditional seed if `SEED_ON_EMPTY=true` and zero users
3. Start Nuxt server

## Admin provisioning

### Create coach or club owner (no public UI)

```bash
curl -X POST https://shushzerv-production.up.railway.app/api/admin/provision \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  -d '{"type":"CLUB_ADMIN","email":"owner@club.ir","name":"Club Owner","clubName":"My Club"}'
```

### Approve club application

```bash
curl -X POST https://shushzerv-production.up.railway.app/api/admin/clubs/CLUB_ID/approve \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  -d '{"ownerEmail":"owner@club.ir"}'
```

## Local development

```bash
docker compose up -d
cp .env.example .env
npm run db:migrate
FORCE_SEED_RESET=true npm run db:seed   # demo data
npm run dev
```

Never set `FORCE_SEED_RESET=true` or demo passwords in production.
