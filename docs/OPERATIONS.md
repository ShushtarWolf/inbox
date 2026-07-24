# Operations Runbook — inbox

Production runs on **Liara** (`inbox` app, `https://inboxs.ir`). Postgres is the Liara `inbox-db` service.

## Environment variables (production)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Liara database service) |
| `NUXT_SESSION_PASSWORD` | Yes | Session encryption secret (min 32 chars, not demo fallback) |
| `NUXT_PUBLIC_SITE_URL` | Yes (prod) | Public URL for password reset and booking confirmation links (`https://inboxs.ir`) |
| `NUXT_PUBLIC_CONTACT_ADDRESS` | Enamad | Physical address shown on `/contact` (set before Enamad review) |
| `NUXT_PUBLIC_CONTACT_LANDLINE` | Enamad | Landline shown on `/contact` when set |
| `NUXT_PUBLIC_CONTACT_MOBILE` | No | Defaults to `09124777927` |
| `NUXT_PUBLIC_CONTACT_EMAIL` | No | Defaults to `info@inboxs.ir` |
| `NUXT_PUBLIC_CONTACT_OWNER_NAME` | Enamad | Operator name on `/contact` and `/about` |
| `NUXT_PUBLIC_CONTACT_POSTAL_CODE` | Enamad | Postal code on `/contact` |
| `NUXT_PUBLIC_ENAMAD_*` | After signup | See [docs/ENAMAD.md](./ENAMAD.md) for meta/file/title/badge |
| `SEED_ON_EMPTY` | First deploy | Set `true` once to seed sports catalog on empty DB; remove after |
| `ADMIN_PROVISION_SECRET` | Yes | Header secret for admin APIs and `/admin/applications` |
| `PAYMENTS_MODE` | No | `pay_at_club` (desk-only), `test` (local/simulate), or `live` (SEP). Synced to client Pay CTA at runtime (also accepts `NUXT_PUBLIC_PAYMENTS_MODE`). Do **not** set `live` until terminal verified — see docs/PAYMENTS.md |
| `PAYMENT_PROVIDER` | No | Default `sep` when mode is `test`/`live`; `log` for API-only tests |
| `SEP_TERMINAL_ID` | For live IPG | SEP numeric terminal id (never commit) |
| `SEP_BASE_URL` | No | Defaults to `https://sep.shaparak.ir` |
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
| `NUXT_PUBLIC_PILOT_NO_COACH` | Pilot | Optional; `PILOT_NO_COACH` alone is synced to client at runtime via Nitro plugin |
| `PILOT_NO_COACH` | Pilot | Prefer this for Behnaz: server-only coach API/sitemap gate; also drives client redirects at runtime |
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

## SMS auth (Kavenegar OTP) — Iran MVP go-live

Primary sign-in for **ATHLETE** and **CLUB_ADMIN** is phone OTP (Iranian mobile `09…` / `+98…`). Email/password athlete registration is disabled (`POST /api/auth/register` → `410`). Google OAuth is hidden from product UI. Soft-fail for booking CRM SMS must not break booking APIs; auth OTP failures return clear FA errors (UI maps `400`/`429`/`502`).

### Liara env vars (`inbox` app)

Set in the Liara dashboard when cutting over live OTP (never commit secrets):

| Variable | Value | Notes |
|----------|-------|--------|
| `SMS_ENABLED` | `true` | Required for live sends |
| `SMS_PROVIDER` | `kavenegar` or `live` | Both resolve to Kavenegar |
| `KAVENEGAR_API_KEY` | from Kavenegar panel | Required with the two above |
| `KAVENEGAR_TEMPLATE` | e.g. `inbox-verify` | **Preferred for OTP** — panel-approved Verify Lookup template with `%token%` |
| `KAVENEGAR_SENDER` | approved line | Required for free-text `sms/send` (CRM + booking notify + OTP without template) |

Optional rate-limit tuning (defaults are fine for MVP):

| Variable | Default | Notes |
|----------|---------|--------|
| `OTP_PHONE_SEND_MAX` | `3` | Max OTP sends per phone per window |
| `OTP_PHONE_SEND_WINDOW_MS` | `600000` | 10 minutes |
| `OTP_PHONE_VERIFY_MAX` | `10` | Max verify attempts per phone per window |
| `OTP_PHONE_VERIFY_WINDOW_MS` | `600000` | 10 minutes |
| `REDIS_URL` | unset | IP + phone buckets use Redis when set (multi-instance) |

Until live cutover: leave `SMS_ENABLED` unset/`false` — OTP uses log/dry-run and returns `debugCode` + `smsMode: "log"`. UI must not claim live SMS delivery in log mode (`auth.otpLogModeHint` / `auth.debugOtpHint`). Check `/admin/sms` or `npm run sms:status`.

### Verify checklist

1. `npm run sms:status` (or `GET /api/admin/sms-status`) → `resolvedProvider: "log"` until keys are set; `"live"` after cutover.
2. Request OTP with a valid IR mobile → `200` + normalized `09…` phone; log mode includes `debugCode`.
3. Wrong OTP → `400` + FA `auth.invalidOtp` in UI.
4. Correct OTP register ATHLETE → session + `/athlete`.
5. Owner phone (User.phone or Club.phone on provisioned club) → OTP login → `/owner`.
6. Booking notify/CRM SMS soft-fail must not 500 booking endpoints.

### Transactional SMS (court booking MVP)

Same Kavenegar live/log gate as OTP (`SMS_ENABLED` + `SMS_PROVIDER` + `KAVENEGAR_API_KEY`; free-text needs `KAVENEGAR_SENDER`). Check mode via `/admin/sms`, `GET /api/admin/sms-status`, or `npm run sms:status` (`smsMode` / `resolvedProvider`: `live` vs `log`).

| Event | Path | Notes |
|-------|------|--------|
| Booking confirmed | `bookingNotify.notifyBookingConfirmed` | Athlete court book + owner desk reserve |
| Booking cancelled | `bookingNotify.notifyBookingCancelled` | Athlete cancel + owner cancel (registered or guest phone) |
| Waitlist slot available | `waitlistNotify.notifyWaitlistForFreedSlot` | After cancel frees a slot; matches `courtId` **or** any-court (`courtId` null); SMS + in-app; **always soft-fail** |

Log mode: booking/waitlist SMS are skipped and logged (`[bookingNotify:sms:skip]` / `[waitlistNotify:sms:skip]`) — no fake gateway send. Live failures never fail the HTTP booking/cancel after DB success. Pilot: `PILOT_NO_COACH` — no coach SMS product work. CRM campaigns keep using the same SMS pipeline; do not expand from this path.

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

## Google OAuth (retired from product UI)

Iran MVP uses phone OTP. Login/register UI does **not** show Google. `GET /api/auth/google-enabled` always returns `{ enabled: false }`. Keep OAuth env **unset** on Liara unless you intentionally revive the flow later.

When `NUXT_OAUTH_GOOGLE_*` are **unset**, `GET /auth/google` fails closed → `/login?error=google` (generic login error copy on `/login`; product pages do not advertise Google). Do not commit real secrets.

### Google Cloud Console (legacy — do not enable for MVP)

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

### Local `.env` (legacy)

```bash
# Leave unset for Iran MVP
# NUXT_OAUTH_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
# NUXT_OAUTH_GOOGLE_CLIENT_SECRET=GOCSPX-...
# NUXT_OAUTH_GOOGLE_REDIRECT_URL=http://localhost:3000/auth/google
```

Smoke: `npm run smoke:auth` expects no Google button on `/login` and fail-closed `/auth/google` when unset.

### Behavior reference (MVP)

| Condition | UI | `/auth/google` |
|-----------|----|----------------|
| Always (MVP) | No Google button | Fail-closed when unset; do not advertise in product |

Prefer phone OTP. Do not set Google OAuth on Liara for the Iran MVP.

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

## Production data wipe (clubs + users)

Use when prod must be empty but healthy (new signups/applications still allowed). **Never** run `FORCE_SEED_RESET=true` + `SEED_DEMO_DATA=true` on production — that recreates `*@inbox.local` demo junk.

### Keep vs delete

| Keep | Delete |
|------|--------|
| `Sport` catalog (padel/tennis/…) | All `User`, `Club`, bookings/payments/waitlists/reviews/CRM/media/slots/courts/coaches |
| Static assets (`public/hero/*`, `public/brand/*`, placeholders, icons) | Applications, OTPs, wallets/notifications, package bookings, workers |
| Liara env vars, S3 buckets (orphaned objects OK) | — |

### Procedure

1. Backup first: `liara db backup create --name inbox-db` then `liara db backup list --name inbox-db` (confirm a new `manual/…` entry).
2. Count before (users/clubs/bookings/sports) against prod `DATABASE_URL` (do not print the URL).
3. Run the one-shot wipe (transaction + FK order; re-upserts sports; no demo seed):

```bash
# Against prod DATABASE_URL only — never commit the URL
CONFIRM=WIPE_ALL_USERS_AND_CLUBS ALLOW_PROD_WIPE=yes NODE_ENV=production \
  node scripts/wipe-prod-catalog.mjs
```

4. Count after: users=0, clubs=0, bookings=0, sports≥1.
5. Smoke: `GET /api/health`, `/`, `/clubs`, `/login`, `/register`, hero `/hero/*.jpg` → 200; empty `/clubs` OK.

No deploy required for a remote DB wipe. Deploy only if you change the wipe script/docs and need them on the server.

### Pilot reset (wipe + single club owner)

Preferred when the app can reach the DB (Liara): wipe catalog and create one `CLUB_ADMIN` in one call.

```bash
curl -X POST https://inboxs.ir/api/admin/reset-pilot \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  -d '{"confirm":"WIPE_ALL_USERS_AND_CLUBS","phone":"09124777927","name":"بهناز","clubName":"باشگاه بهناز"}'
```

Then set `AUTH_OTP_BYPASS_PHONES=09124777927` on Liara so that phone logs in without SMS OTP (enter phone → continue → owner dashboard).

### Re-provision Behnaz (after wipe)

1. Open `https://inboxs.ir/admin` with `ADMIN_PROVISION_SECRET` (do not commit the secret).
2. Use **`/admin/provision`**: owner email, name, club name → creates `CLUB_ADMIN` + `ACTIVE` club + courts.
3. Owner logs in at `/login`; optional `/owner/setup` for hours/pricing.
4. Confirm public `/clubs` lists the new club.

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
