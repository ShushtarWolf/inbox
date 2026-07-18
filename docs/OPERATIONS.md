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
| `EMAIL_ENABLED` | No | `true` to send real emails via SMTP (default: log only — no SMTP required) |
| `SMTP_HOST` | For live email | SMTP server hostname (required with `EMAIL_ENABLED=true`) |
| `SMTP_PORT` | For live email | SMTP port (typically 587 or 465; default 587) |
| `SMTP_USER` | For live email | SMTP username |
| `SMTP_PASS` | For live email | SMTP password (never commit; never returned by admin APIs) |
| `SMTP_FROM` | For live email | From address (e.g. `inbox <noreply@yourdomain.com>`) |
| `SMS_ENABLED` | For live SMS | `true` to allow live sends (OTP + CRM + desk guest); default stays log/dry-run |
| `SMS_PROVIDER` | For live SMS | `live` or `kavenegar` for Kavenegar; unset/`log` = dry-run |
| `KAVENEGAR_API_KEY` | For live SMS | Required with `SMS_ENABLED` + live provider |
| `KAVENEGAR_TEMPLATE` | Strongly recommended for OTP | Panel-approved Verify Lookup template (e.g. `inbox-verify` with `%token%`). Without it, OTP uses free-text `sms/send`. |
| `KAVENEGAR_SENDER` | Required for free-text sends | Must match an approved Kavenegar line. Missing/invalid → `ارسال کننده نامعتبر است` (OTP 502 on prod). Needed for CRM + booking notify + OTP without template. |
| `NUXT_PUBLIC_PILOT_NO_COACH` | Pilot | `true` to hide coach nav/URLs in the client (runtime override; rebuild only if baked payload is wrong) |
| `PILOT_NO_COACH` | Pilot | Prefer this for Behnaz: server-only coach API/sitemap gate without rebuild |
| `SENTRY_DSN` | No | Server + client error tracking when set (`@sentry/node` / `@sentry/vue`). Unset = no-op |
| `SENTRY_ENVIRONMENT` | No | Sentry environment tag (default: `NODE_ENV` / `development`) |
| `GIT_COMMIT_SHA` | No | Optional release tag (also accepts `GITHUB_SHA`) |
| `S3_ENDPOINT` | For uploads (prod) | S3-compatible endpoint (Liara: `https://storage.iran.liara.space`) |
| `S3_BUCKET` | For uploads (prod) | Bucket name |
| `S3_ACCESS_KEY` | For uploads (prod) | Bucket access key (never commit) |
| `S3_SECRET_KEY` | For uploads (prod) | Bucket secret key (never commit) |
| `S3_PUBLIC_URL` | For uploads (prod) | Public base URL (Liara: `https://{bucket}.storage.iran.liara.space`) |
| `S3_REGION` | Optional | Default `us-east-1` (Liara-compatible) |
| `NUXT_OAUTH_GOOGLE_CLIENT_ID` | For Google login | Google Cloud OAuth client ID |
| `NUXT_OAUTH_GOOGLE_CLIENT_SECRET` | For Google login | Google Cloud OAuth client secret |
| `NUXT_OAUTH_GOOGLE_REDIRECT_URL` | For Google login | e.g. `https://inboxs.ir/auth/google` (preferred; else derived from `NUXT_PUBLIC_SITE_URL`) |

## Email (SMTP)

Log-by-default. Localhost and CI need **no** real SMTP when `EMAIL_ENABLED` is unset or `false` — password reset, booking confirm/cancel/paid, waitlist, and club-approval emails succeed and write `[notify:log]` / `[email:log]` lines.

**FA launch:** Prefer phone OTP for sign-in/recovery. Forgot-password always returns `ok: true` (soft-fail). When email mode is `log`, the UI does **not** claim “email sent” — it tells users to use mobile + SMS code. Live SMTP soft-fails on send errors the same way (auth never hard-fails).

Live send only when **both** are set:

| Variable | Value |
|----------|-------|
| `EMAIL_ENABLED` | `true` |
| `SMTP_HOST` | your SMTP hostname |
| `SMTP_PORT` | `587` or `465` (optional; default 587) |
| `SMTP_USER` / `SMTP_PASS` | SMTP credentials |
| `SMTP_FROM` | e.g. `inbox <noreply@inboxs.ir>` |

SMTP failures are soft-fail: booking and auth flows never hard-fail on mail errors.

### Ops visibility

- Admin overview (`/admin`) shows email mode (`log` \| `live`) and `emailConfigured` (host set + `EMAIL_ENABLED`) — never `SMTP_PASS`
- `GET /api/admin/email-status` (header `x-admin-secret`) — same safe snapshot (never returns `SMTP_PASS`)
- Local: `npm run email:status`

### Production (Liara `inbox` app) — live email checklist

Only enable when ops explicitly asks to go live (do not flip from this runbook casually):

1. Set in Liara dashboard: `EMAIL_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT` (587/465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and ensure `NUXT_PUBLIC_SITE_URL=https://inboxs.ir` for reset links
2. Confirm `/admin` or `GET /api/admin/email-status` → `emailMode: "live"`, `emailConfigured: true` (response must not contain `SMTP_PASS`)
3. Soft-fail check: with bad SMTP, `POST /api/auth/forgot-password` still returns `{ ok: true }`

Until then leave `EMAIL_ENABLED` unset/`false`. Verify with `/admin` or `npm run email:status` against a shell that has the same env.

## Object storage (S3 / Liara)

Uploads (avatars, club gallery, guest registration photos) go through `uploadImage` in `server/utils/storage.ts`, used by:

- `POST /api/uploads` — authenticated (owner/coach/athlete folders)
- `POST /api/uploads/guest` — rate-limited guest uploads (register owner/coach)

Limits (always enforced): JPEG/PNG/WebP only, max **5 MB**.

| Mode | When | Behavior |
|------|------|----------|
| `local` | Any of the five `S3_*` vars missing | Writes under `public/uploads/…`; returns `/uploads/…` paths (localhost OK). Partial config warns and stays local. In `NODE_ENV=production`, status also warns that local disk is **ephemeral** — set all five `S3_*` on Liara. |
| `s3` | All five set | `PutObject` with `forcePathStyle: true`; returned URL is `{S3_PUBLIC_URL}/{key}` |

ACL: PutObject tries `ACL: public-read` first. If the provider rejects ACLs (common on some S3-compatible / Liara setups), the upload retries **without** ACL. Make the Liara bucket **public** so objects remain readable via `S3_PUBLIC_URL`.

### Create a Liara bucket (inboxs.ir)

1. Liara dashboard → **Object Storage** → create a bucket (e.g. `inbox-uploads`).
2. Set bucket access to **public** (required for direct image URLs in the app).
3. Create an access key for the bucket; copy endpoint, bucket name, access key, secret key.
4. Public URL form: `https://{bucket}.storage.iran.liara.space` (confirm in bucket settings if your region differs).

### Local `.env`

Leave all `S3_*` commented for local disk uploads:

```bash
# S3 unset → local public/uploads
# npm run storage:status  → storageMode: "local"
```

### Production (Liara `inbox` app)

Set in the Liara dashboard (never commit real values):

| Variable | Example |
|----------|---------|
| `S3_ENDPOINT` | `https://storage.iran.liara.space` |
| `S3_BUCKET` | `inbox-uploads` |
| `S3_ACCESS_KEY` | from Liara key |
| `S3_SECRET_KEY` | from Liara key |
| `S3_PUBLIC_URL` | `https://inbox-uploads.storage.iran.liara.space` |

Optional: `S3_REGION=us-east-1` (default in code). Redeploy/restart after setting env.

### Verify checklist

1. **Local (no S3):** `npm run storage:status` → `storageMode: "local"`. Upload a photo on register or `/owner/settings` gallery — file appears under `public/uploads/` and loads via `/uploads/…`.
2. **Type/size:** guest upload of a non-image or >5 MB → `400` (also covered by `npm run smoke:security`).
3. **Partial S3:** setting only some `S3_*` vars → status warns and stays `local`.
4. **S3 ready:** all five set → `storageMode: "s3"`; status shows `bucket` + `publicUrlHost` only (never keys). Admin: `GET /api/admin/storage-status` with `x-admin-secret`, or `/admin` overview.
5. **Prod:** after Liara env + redeploy, upload an avatar/gallery image on `https://inboxs.ir` and confirm the returned URL starts with `S3_PUBLIC_URL` and loads in the browser.

## Sentry (error tracking)

Optional. When `SENTRY_DSN` is **unset**, both plugins no-op and the app runs normally. When set, Nitro captures server errors and the Vue client SDK captures browser/Vue errors. Cookies, `Authorization`, and `x-admin-secret` are scrubbed before send (`sendDefaultPii: false`). Prod trace sample rates: server `0.1`, client `0.05`.

### Create a Sentry project

1. Open [Sentry](https://sentry.io/) → create (or open) an organization.
2. **Projects** → **Create Project** → platform **Node.js** (or Vue) — one project is enough; the same DSN works for server + client.
3. Copy the **DSN** (looks like `https://…@….ingest.sentry.io/…`). Never commit it.
4. Optional: Settings → Projects → [project] → Client Keys to rotate later.

### Local `.env`

```bash
# Optional — leave commented for no-op
# SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
# SENTRY_ENVIRONMENT=development
# GIT_COMMIT_SHA=local-dev
```

Restart `npm run dev` after changing these (client reads DSN via Nuxt `runtimeConfig.public`).

### Production (Liara `inbox` app)

Set in the Liara dashboard (never commit real values):

| Variable | Value |
|----------|-------|
| `SENTRY_DSN` | Project DSN from Sentry |
| `SENTRY_ENVIRONMENT` | `production` |
| `GIT_COMMIT_SHA` | Optional deploy SHA / release label |

Redeploy or restart the app after setting env so both server and client pick up the DSN.

### Verify checklist

1. **Unset DSN:** `npm run sentry:status` → `sentryEnabled: false`. App boots; `/admin/sentry` shows DSN not set; POST test returns no-op.
2. **Set DSN locally:** put a real project DSN in `.env` (do not commit), restart, `npm run sentry:status` → `sentryEnabled: true`.
3. **Server capture:**  
   `curl -X POST -H "x-admin-secret: $ADMIN_PROVISION_SECRET" http://localhost:3000/api/admin/sentry-test`  
   → `sentryEnabled: true` + `eventId`. Confirm in Sentry → Issues (`SentryTestError` / tag `source=admin-sentry-test`).
4. **Client capture:** open `/admin/sentry` (admin secret) → **Test client capture**, or DevTools: `useNuxtApp().$sentryCaptureTest()`. Confirm a client-side event in Sentry.
5. **Prod (Liara):** set env vars above → redeploy → same curl against `https://inboxs.ir` with prod `ADMIN_PROVISION_SECRET`, or use `/admin/sentry`. Status endpoint never returns the DSN.

The test route is **not** public: missing/invalid `x-admin-secret` → `403`. Do not expose an ungated error endpoint.

Optional. When `NUXT_OAUTH_GOOGLE_CLIENT_ID`, `NUXT_OAUTH_GOOGLE_CLIENT_SECRET`, and a redirect URL (explicit or via `NUXT_PUBLIC_SITE_URL`) are **unset**, the app fails closed: the Google button is hidden and `GET /auth/google` redirects to `/login?error=google` (FA copy via `auth.googleFailed`). Provider errors (`?error=access_denied`) also land on that page. Do not commit real secrets; set Liara env in the dashboard when enabling prod.

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

Production DB: Liara service **`inbox-db`**. Preferred path is Liara managed backups (verified 2026-07-19).

### Backup (Liara — preferred)

```bash
# List existing backups (hourly / daily / manual)
liara db backup list --name inbox-db

# Create an on-demand backup (appears under manual/)
liara db backup create --name inbox-db

# Download a named backup locally if needed
liara db backup download --name inbox-db
```

Liara dashboard: `inbox-db` → Backups (same artifacts as CLI). Plan includes scheduled hourly + daily dumps.

### Backup (pg_dump — optional / local)

```bash
# Needs client tools + a reachable DATABASE_URL (not the internal inbox-db hostname)
pg_dump "$DATABASE_URL" -Fc -f inbox-backup-$(date +%Y%m%d).dump
```

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

Pilot (Behnaz): prefer `PILOT_NO_COACH=true` on Liara (server APIs/sitemap; no rebuild). Client nav/URL redirects need `NUXT_PUBLIC_PILOT_NO_COACH=true` or a build that already baked `public.pilotNoCoach` — set the public flag only if UI is still showing coach paths. Live OTP/SMS: set `SMS_ENABLED=true`, `SMS_PROVIDER=live` (or `kavenegar`), and `KAVENEGAR_API_KEY` when ready — check `/admin/sms` or `npm run sms:status`. Live email: `EMAIL_ENABLED=true` + `SMTP_*` — check `/admin` or `npm run email:status`. Do not flip Liara env from this runbook without an explicit ops step.

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
