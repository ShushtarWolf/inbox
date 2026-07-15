# Operations Runbook — inbox

Production runs on **Liara** (`inbox` app, `https://inboxs.ir`). Postgres is the Liara `inbox-db` service.

## Environment variables (production)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Liara database service) |
| `NUXT_SESSION_PASSWORD` | Yes | Session encryption secret (min 32 chars, not demo fallback) |
| `NUXT_PUBLIC_SITE_URL` | Yes (prod) | Public URL for password reset and booking confirmation links (`https://inboxs.ir`) |
| `SEED_ON_EMPTY` | First deploy | Set `true` once to seed sports catalog on empty DB; remove after |
| `ADMIN_PROVISION_SECRET` | Yes | Header secret for admin APIs and `/admin/applications` |
| `PAYMENTS_MODE` | No | `pay_at_club` (default), `test`, or `live` |
| `EMAIL_ENABLED` | No | `true` to send real emails via SMTP (default: log only) |
| `SMTP_HOST` | If email | SMTP server hostname |
| `SMTP_PORT` | If email | SMTP port (typically 587 or 465) |
| `SMTP_USER` | If email | SMTP username |
| `SMTP_PASS` | If email | SMTP password |
| `SMTP_FROM` | If email | From address (e.g. `inbox <noreply@yourdomain.com>`) |
| `SENTRY_DSN` | No | Server + client error tracking when set (uses `@sentry/node` / `@sentry/vue`) |
| `S3_ENDPOINT` | For uploads | S3-compatible object storage endpoint |
| `S3_BUCKET` | For uploads | Bucket name |
| `S3_ACCESS_KEY` | For uploads | Bucket access key |
| `S3_SECRET_KEY` | For uploads | Bucket secret key |
| `S3_PUBLIC_URL` | For uploads | Public base URL for uploaded images |
| `NUXT_OAUTH_GOOGLE_CLIENT_ID` | For Google login | Google Cloud OAuth client ID |
| `NUXT_OAUTH_GOOGLE_CLIENT_SECRET` | For Google login | Google Cloud OAuth client secret |
| `NUXT_OAUTH_GOOGLE_REDIRECT_URL` | For Google login | e.g. `https://inboxs.ir/auth/google` |

## Database backup (PostgreSQL)

### Backup

```bash
# From Liara database shell or with connection string
pg_dump "$DATABASE_URL" -Fc -f inbox-backup-$(date +%Y%m%d).dump
```

Liara dashboard: `inbox-db` → Backups (if enabled on plan).

### Restore

```bash
pg_restore -d "$DATABASE_URL" --clean --if-exists inbox-backup-YYYYMMDD.dump
```

**Warning:** restore replaces data. Take a fresh backup before restore.

## Deploy rollback

1. Liara dashboard → `inbox` app → Releases
2. Select last successful release → Rollback
3. If schema migration caused issues: restore DB backup, then redeploy previous build

Production start sequence (`scripts/start-production.mjs`):

1. `prisma migrate deploy`
2. Conditional seed if `SEED_ON_EMPTY=true` and zero users
3. Start Nuxt server

Deploy from repo:

```bash
liara deploy --app inbox
```

## Admin provisioning

### Review club applications (web UI)

1. Open `/admin/applications` on the production site
2. Enter `ADMIN_PROVISION_SECRET`
3. Review pending applications and approve with the owner login email
4. New owners receive a welcome email with login URL and temporary password

### Create coach or club owner (API)

```bash
curl -X POST https://inboxs.ir/api/admin/provision \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  -d '{"type":"CLUB_ADMIN","email":"owner@club.ir","name":"Club Owner","clubName":"My Club"}'
```

### Approve club application

```bash
curl -X POST https://inboxs.ir/api/admin/clubs/CLUB_ID/approve \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  -d '{"ownerEmail":"owner@club.ir"}'
```

## Local development

```bash
docker compose up -d
cp .env.example .env
npm run db:migrate
FORCE_SEED_RESET=true SEED_DEMO_DATA=true npm run db:seed   # demo data (local only)
npm run dev
```

Never set `FORCE_SEED_RESET=true` or demo passwords in production.
