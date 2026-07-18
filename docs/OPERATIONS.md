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
| `PAYMENTS_MODE` | No | `pay_at_club` (default / current prod), `test`, or `live`. Keep `pay_at_club` — Zarinpal live is not implemented yet |
| `EMAIL_ENABLED` | No | `true` to send real emails via SMTP (default: log only) |
| `SMTP_HOST` | If email | SMTP server hostname |
| `SMTP_PORT` | If email | SMTP port (typically 587 or 465) |
| `SMTP_USER` | If email | SMTP username |
| `SMTP_PASS` | If email | SMTP password |
| `SMTP_FROM` | If email | From address (e.g. `inbox <noreply@yourdomain.com>`) |
| `SMS_ENABLED` | For live SMS | `true` to allow live sends (OTP + CRM); default stays log/dry-run |
| `SMS_PROVIDER` | For live SMS | `live` or `kavenegar` for Kavenegar; unset/`log` = dry-run |
| `KAVENEGAR_API_KEY` | For live SMS | Required with `SMS_ENABLED` + live provider |
| `KAVENEGAR_TEMPLATE` | Optional | Kavenegar Verify Lookup template for OTP |
| `KAVENEGAR_SENDER` | Optional | Kavenegar sender line |
| `NUXT_PUBLIC_PILOT_NO_COACH` | Pilot | `true` on Liara to hide coach nav/URLs/APIs (Behnaz pilot) |
| `PILOT_NO_COACH` | Pilot | Server-only coach gate without rebuild (optional alongside public flag) |
| `SENTRY_DSN` | No | Server + client error tracking when set (uses `@sentry/node` / `@sentry/vue`) |
| `S3_ENDPOINT` | For uploads | S3-compatible object storage endpoint |
| `S3_BUCKET` | For uploads | Bucket name |
| `S3_ACCESS_KEY` | For uploads | Bucket access key |
| `S3_SECRET_KEY` | For uploads | Bucket secret key |
| `S3_PUBLIC_URL` | For uploads | Public base URL for uploaded images |
| `NUXT_OAUTH_GOOGLE_CLIENT_ID` | For Google login | Google Cloud OAuth client ID |
| `NUXT_OAUTH_GOOGLE_CLIENT_SECRET` | For Google login | Google Cloud OAuth client secret |
| `NUXT_OAUTH_GOOGLE_REDIRECT_URL` | For Google login | e.g. `https://inboxs.ir/auth/google` (required with client id/secret; fail-closed if missing) |

## Google OAuth (sign-in)

Optional. When `NUXT_OAUTH_GOOGLE_CLIENT_ID`, `NUXT_OAUTH_GOOGLE_CLIENT_SECRET`, and a redirect URL are **unset**, the app fails closed: the Google button is hidden and `GET /auth/google` redirects to `/login?error=google` (FA copy via `auth.googleFailed`). Do not commit real secrets; set Liara env in the dashboard when enabling prod.

### Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select (or create) the project for inbox.
2. **APIs & Services** → **OAuth consent screen** → configure (External or Internal). App name: inbox. Add scopes `email`, `profile`, `openid` if prompted.
3. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
4. Application type: **Web application**.
5. **Authorized JavaScript origins** (exact, no trailing slash):
   - `http://localhost:3000`
   - `https://inboxs.ir`
6. **Authorized redirect URIs**:
   - `http://localhost:3000/auth/google`
   - `https://inboxs.ir/auth/google`
7. Create → copy **Client ID** and **Client secret** (never commit them).

### Local `.env`

```bash
NUXT_PUBLIC_SITE_URL=http://localhost:3000
NUXT_OAUTH_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
NUXT_OAUTH_GOOGLE_CLIENT_SECRET=GOCSPX-...
NUXT_OAUTH_GOOGLE_REDIRECT_URL=http://localhost:3000/auth/google
```

Restart `npm run dev` after changing these. Smoke: `npm run smoke:auth` — with vars unset expects fail-closed; with vars set expects redirect toward Google.

### Production (Liara `inbox` app)

Set the same four vars (do not set from this runbook automatically):

| Variable | Value |
|----------|-------|
| `NUXT_PUBLIC_SITE_URL` | `https://inboxs.ir` |
| `NUXT_OAUTH_GOOGLE_CLIENT_ID` | from Console |
| `NUXT_OAUTH_GOOGLE_CLIENT_SECRET` | from Console |
| `NUXT_OAUTH_GOOGLE_REDIRECT_URL` | `https://inboxs.ir/auth/google` |

Redeploy or restart after env change. Verify: login page shows Google button → completes OAuth → new users land as `ATHLETE`; failure shows `/login?error=google`.

### Behavior reference

| Condition | UI | `/auth/google` |
|-----------|----|----------------|
| Client id/secret/redirect unset | Button hidden | → `/login?error=google` |
| All set | Button on login/register/auth modal | → Google consent, then session + `returnTo` |

New Google users are upserted as role `ATHLETE`. `oauth_return_to` cookie (sanitized) restores post-login path.

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

### Open the platform admin console (local)

1. Ensure Postgres is running (`docker compose up -d` or equivalent) and `DATABASE_URL` is set in `.env`
2. Set `ADMIN_PROVISION_SECRET` in `.env` (same value used for `x-admin-secret` on APIs)
3. `npm run db:migrate` then `npm run db:seed` (sports catalog; avoid `FORCE_SEED_RESET` unless you re-seed sports)
4. `npm run dev` → open **http://localhost:3000/admin**
5. Enter the admin secret (stored in tab `sessionStorage`; use **Lock admin** to clear)
6. Console sections: Overview (pilot checklist) · Clubs · Users · Bookings · Applications · Bug reports · Provision (CLUB_ADMIN)

### Provision Behnaz’s club (preferred local path)

One-step: creates `CLUB_ADMIN` + `ACTIVE` club + 2 priced courts (hours 8–22). No coach required.

1. `/admin/provision` → owner email, name, club name (e.g. Behnaz’s club)
2. Copy the temporary password from the success panel (do not commit secrets)
3. Log in at `/login` as the owner → optionally `/owner/setup` (profile, hours, courts/pricing; coaches optional)
4. Confirm Overview **Pilot checklist** shows bookable (ACTIVE, courts, hours, pricing; owner login after step 3)
5. Public catalog: `/clubs` · book: `/book/court/{slug}` (athlete account needed to complete a booking)

Pilot (Behnaz): set `NUXT_PUBLIC_PILOT_NO_COACH=true` on Liara when ready (optional `PILOT_NO_COACH=true` for server-only gate). Live OTP/SMS: set `SMS_ENABLED=true`, `SMS_PROVIDER=live` (or `kavenegar`), and `KAVENEGAR_API_KEY` when ready — check `/admin/sms` or `npm run sms:status`. Do not flip Liara env from this runbook without an explicit ops step.

### Review club applications

1. Open `/admin/applications` (create a pending application there, or use Provision instead)
2. Approve with the owner login email (or reject)
3. New owners receive a welcome email with login URL and temporary password (email may be log-only locally)

### Create club owner (UI or API)

Preferred: `/admin/provision` (CLUB_ADMIN only in the UI).

```bash
curl -X POST http://localhost:3000/api/admin/provision \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  -d '{"type":"CLUB_ADMIN","email":"owner@club.ir","name":"Club Owner","clubName":"My Club"}'
```

### Approve club application

```bash
curl -X POST http://localhost:3000/api/admin/clubs/APPLICATION_ID/approve \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  -d '{"ownerEmail":"owner@club.ir"}'
```

(`APPLICATION_ID` is the club application id, not the club id.)

## Local development

```bash
docker compose up -d
cp .env.example .env
npm run db:migrate
FORCE_SEED_RESET=true SEED_DEMO_DATA=true npm run db:seed   # demo data (local only)
npm run dev
```

Never set `FORCE_SEED_RESET=true` or demo passwords in production.
