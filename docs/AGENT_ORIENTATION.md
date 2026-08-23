# Agent orientation

This is the starting map for agents working on the current `main` branch. Prefer the code and migrations over older planning notes when they disagree.

## What this product is

`inbox` is a Farsi-first sports-booking application for discovering clubs and reserving padel and tennis courts. The current launch is an Iran/Tehran pilot (including pilot-specific Behnaz/IUST configuration), but the data model supports clubs in arbitrary cities. Athletes can discover a club, select one or more generated court slots, reserve and pay or choose pay-at-club, then manage the reservation. Club owners have calendar, customer, finance, equipment, staff, and settings tools.

The initial hypothesis is mostly correct:

- Court and club discovery and booking are implemented.
- Reservation follow-up is implemented through the athlete dashboard and signed receipt/payment links.
- Kavenegar is the implemented live SMS provider and phone OTP is the primary authentication path.
- There is no Cloudflare Tunnel or VPN setup in this repository. Cloudflare appears only as a transitive package and as one possible trusted proxy header source for rate limiting. Production hosting is Liara.

Coach discovery and booking code exists, but the current pilot defaults `PILOT_NO_COACH=true`, which redirects/hides coach surfaces. Packages and recurring/season reservations also exist, with parts of their public/owner UI intentionally frozen for the court-focused pilot.

## Stack and delivery

- **Runtime:** Node.js 22 (`.nvmrc`, `Dockerfile`).
- **Application:** Nuxt 4 / Vue 3 / TypeScript, with Nitro server routes.
- **UI:** Tailwind CSS, Farsi RTL, Canva-derived mobile frames. Nuxt i18n is configured as Farsi-only with no URL prefix; `_unused-en.json` is not an active locale.
- **Sessions/auth:** `nuxt-auth-utils` encrypted cookie sessions; phone OTP is primary.
- **Database:** PostgreSQL only, accessed through Prisma 6. Schema and migration history are under `prisma/`.
- **Package manager:** npm; `package-lock.json` is authoritative. Use `npm ci` in CI/reproducible installs and `npm install` for normal local setup.
- **Testing:** Vitest unit tests, Playwright browser tests, and custom smoke/security/SEO/performance/pilot scripts.
- **Other integrations:** Kavenegar SMS, optional SMTP, optional S3-compatible uploads, SEP/Saman payment gateway, optional Redis rate-limit storage, Sentry, and Microsoft Clarity.
- **Production:** Docker application `inbox` on Liara at `inboxs.ir`; PostgreSQL service is `inbox-db`. `scripts/start-production.mjs` applies Prisma migrations, ensures the sport catalog exists, removes demo accounts, then starts Nitro. `.github/workflows/deploy.yml` is a manually dispatched Liara deploy. There is no automatic deploy on push.

## Repository layout

| Path | Purpose |
| --- | --- |
| `app/` | Vue application: file-based pages, role layouts, middleware, components, composables, client plugins, and global CSS. |
| `server/api/` | Nitro JSON endpoints. Folders mirror URL paths and filenames encode HTTP methods. Major groups are auth, clubs/slots/bookings, payments/wallet, owner, coach, and admin. |
| `server/routes/` | Non-`/api` Nitro routes: Google OAuth callback, payment callback, sitemap, and local upload serving. |
| `server/utils/` | Server-side domain services for auth/OTP, slot generation, reservations, notifications, providers, storage, settlements, and authorization. |
| `server/plugins/`, `server/middleware/` | Runtime config synchronization, session validation, Sentry/logging, Enamad verification, and legacy locale redirects. |
| `shared/` | Framework-light domain helpers and types shared by client and server; most unit tests live beside these files. |
| `prisma/` | PostgreSQL schema, ordered migrations, and catalog/demo seed. |
| `e2e/` | Playwright critical-flow tests. |
| `scripts/` | Local server wrapper, diagnostics, CI orchestration, smoke suites, QA matrix, and narrowly scoped operational repair scripts. Treat destructive/correction scripts as operations, not normal development commands. |
| `public/` | Static brand, sport icons, placeholders, PWA assets, and local-development uploads. |
| `i18n/` | Active Farsi messages and an explicitly unused English file. |
| `brand/`, `canva-reference/` | Brand tokens/assets and design reference inventory; these are design inputs, not runtime routes. |
| `docs/` | Launch, operations, payments, Kavenegar, Enamad, audit, and historical status documentation. Some notes are snapshots and may lag code. |
| `ops/` | Auxiliary operations assets, currently a separate GlitchTip image/config. |
| `.github/workflows/` | PostgreSQL-backed CI and manual Liara deployment. |
| `nuxt.config.ts` | Modules, i18n, PWA, security/cache headers, public/private runtime config, and Nitro storage. |
| `docker-compose.yml`, `Dockerfile`, `liara.json` | Local PostgreSQL, production image, and Liara app metadata. |

Nuxt auto-imports many composables and server utilities, so an endpoint may call helpers such as `prisma`, `requireUser`, or `ensureSlotsForDate` without an explicit import.

## Route map

Routes come from `app/pages/`. This list emphasizes product entry points rather than every API endpoint.

### Public and booking routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page and discovery entry point. |
| `/clubs` | Search/filter active clubs. |
| `/clubs/:slug` | Primary club detail and court-booking UI. It loads courts and generated slots, supports multi-slot/equipment/discount selection, opens login when needed, and posts confirmed reservations to `/api/bookings/court`. |
| `/book/court/:slug` | Legacy deep link; preserves date/slot/court/time query parameters and redirects to `/clubs/:slug`. |
| `/r/:token` | Public signed reservation receipt. Shows booking/payment state and can initiate online checkout when enabled. |
| `/p/:pin` | Short desk pay-link resolver; exchanges a booking pay pin for a signed receipt token and redirects to `/r/:token`. |
| `/login`, `/register`, `/register/owner`, `/forgot-password`, `/reset-password` | Phone OTP login/registration/recovery surfaces. `/register/coach` exists but is pilot-gated. |
| `/clubs/apply` | Club application entry point. |
| `/about`, `/contact`, `/pricing`, `/terms`, `/privacy`, `/cancellation`, `/complaints` | Public informational/legal/support pages. |
| `/offline` | PWA fallback, although PWA is disabled unless explicitly enabled. |

`/coaches`, `/coaches/:id`, and `/book/coach/:id` are implemented but redirect to `/clubs` while the pilot no-coach flag is active. `/book/package/:id` is a soft-landing/frozen product surface in the current pilot.

### Authenticated follow-up and role routes

- **Athlete:** `/athlete`, `/athlete/home`, `/athlete/bookings`, `/athlete/payments`, `/athlete/wallet`, `/athlete/favorites`, `/athlete/notifications`, and `/athlete/profile`. The booking list is the primary reservation history/actions UI; `/athlete/bookings/:id` redirects back to it with a highlight query.
- **Owner (`CLUB_ADMIN`):** `/owner`, `/owner/calendar`, `/owner/finance`, `/owner/finance/report`, `/owner/crm`, `/owner/crm/:id`, `/owner/equipments`, `/owner/workers`, `/owner/coaches`, `/owner/packages`, `/owner/support`, `/owner/notifications`, `/owner/settings`, `/owner/setup`, and `/owner/pending`. Calendar is the operational center for desk booking, blocking, cancellation, payment state, and recurring reservation actions.
- **Coach:** `/coach`, `/coach/schedule`, `/coach/clients`, and `/coach/profile`; currently pilot-gated.

The `auth` and `role` middleware enforce session and role access. A user can have a primary and one secondary platform role.

### Admin routes

There is no `ADMIN` database role. Admin pages are client-side consoles gated by `ADMIN_PROVISION_SECRET`; requests send it in `x-admin-secret`, and the browser keeps it in memory only.

- `/admin` — overview and operational status
- `/admin/clubs`, `/admin/clubs/:id` — club review/status/detail
- `/admin/applications` — club applications
- `/admin/users` — user administration
- `/admin/bookings` — booking overview
- `/admin/tickets` — support tickets
- `/admin/withdrawals` — club and athlete cash-out operations
- `/admin/sms` — SMS status and manual scheduled/daily processing
- `/admin/sentry` — Sentry diagnostics
- `/admin/provision` — controlled account/club provisioning

Matching endpoints live under `server/api/admin/` and call `requireAdminSecret()`.

## Authentication, OTP, and SMS

1. The client requests `/api/auth/otp/request` with an Iranian mobile number, purpose (`login` or `register`), and optional registration role/profile payload.
2. `server/utils/otp.ts` normalizes the phone, applies IP and per-phone limits, invalidates older unconsumed codes, creates a six-digit code, hashes it into `PhoneOtp`, and gives it a five-minute expiry.
3. Login and password-recovery requests are anti-enumerating: an unknown phone still gets a success-shaped response but no OTP row/SMS.
4. The SMS provider registry resolves to safe `log` mode by default. In non-production/CI log mode the response includes `debugCode`, allowing the UI and E2E tests to complete without a gateway.
5. Live mode resolves to Kavenegar only when the live gate and API key are configured. OTP uses Kavenegar Verify Lookup when an OTP template is configured. Transactional/CRM notifications use a separate lookup template; SMS failures after successful booking mutations are generally soft failures.
6. `/api/auth/otp/verify` checks the hashed code, expiry, per-code attempt cap, and per-phone limit. It logs an existing user in or creates the requested athlete/owner/coach records. Owner registration creates a `PENDING` club, courts, membership, and club application for admin approval.
7. The server stores the session in the encrypted `inbox-session` cookie. `auth`/`role` route middleware and server `requireUser` checks protect dashboards and mutations.

Password recovery uses the same SMS OTP pipeline with purpose `password_reset`; a legacy email-token reset path remains for old links. Password-based athlete registration and web login also remain implemented, including phone-or-email identity handling, although phone OTP is the primary Farsi launch flow. Google OAuth code remains fail-closed and its product UI is deliberately disabled in runtime config.

## Clubs, courts, slots, and bookings

The source of truth is `prisma/schema.prisma`.

- `Sport` is the padel/tennis catalog parent.
- `Club` holds bilingual identity/address, city/district/coordinates, status, opening hours, session durations, policies, pricing, amenities, media, owner, settlement settings, and relations to courts and operational records. Only `ACTIVE` clubs are public/bookable.
- `Court` belongs to one club and one sport. It has base price, optional opening-hour overrides, facilities, images, and JSON pricing bands.
- `Slot` belongs to a court and is uniquely identified by `(courtId, date, startTime)`. Dates and times are stored as strings. `ensureSlotsForDate()` lazily creates missing rows from club/court hours and session duration, then reprices only free slots from current court pricing. Display states include free, reserved, blocked, closed, team/public/pending, and cancelled.
- `Booking` has a one-to-one slot relation (`slotId` is unique), optional registered user, guest snapshot fields, source (`PLATFORM` or `CLUB`), booking/payment states, cancellation/reschedule/check-in data, equipment, events, review, and one payment. Desk reservations may be linked later to a user by normalized phone.
- Athlete court booking claims one or more free slots transactionally, prevents cross-club groups and stale/past reservations, computes live court/equipment/discount totals, creates booking/payment/event rows, and sends follow-up notifications after commit. The first booking/payment is the payment anchor for online multi-slot groups.
- Owner desk and recurring flows use the same slot/booking records. Recurring reservations generate future slots/bookings without overwriting live platform or occupied holds.
- `ReservationEvent` is the booking audit trail; `Payment` is the provider/idempotency record; `BookingEquipment` snapshots equipment price and quantity.
- Related but separate products use `CoachSession`, `PackageDraft`/`PackageBooking`, `SeasonBooking`, and `WaitlistEntry`.
- Signed receipt tokens are HMAC-like opaque links derived from a booking ID and receipt/session secret. Short `payPin` values resolve to those receipts. They are follow-up links, not authentication sessions.

Amounts are integer values in the application/database. Payment code is explicit about converting toman-denominated application amounts to rials for SEP; preserve that boundary when changing money code.

## Environment and configuration

Names only are listed below. Start from `.env.example`; production guidance is in `docs/LIARA_ENV_FILL_SHEET.md` and `docs/OPERATIONS.md`.

### Core and runtime

`DATABASE_URL`, `NUXT_SESSION_PASSWORD`, `RECEIPT_SIGNING_SECRET`, `NUXT_PUBLIC_SITE_URL`, `ADMIN_PROVISION_SECRET`, `NODE_ENV`, `HOST`, `PORT`, `REDIS_URL`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`

### Product flags, seed, and local/CI controls

`PILOT_NO_COACH`, `NUXT_PUBLIC_PILOT_NO_COACH`, `NUXT_PUBLIC_ENABLE_PWA`, `SEED_ON_EMPTY`, `SEED_DEMO_DATA`, `FORCE_SEED_RESET`, `SKIP_MIGRATE`, `ALLOW_DEMO_AUTH`, `BASE_URL`, `SMOKE_SKIP_DEMO`, `CI`

`ALLOW_DEMO_AUTH`, destructive seed flags, debug flags, and `SKIP_MIGRATE` are not normal production settings.

### SMS and alerts

`SMS_ENABLED`, `SMS_PROVIDER`, `KAVENEGAR_API_KEY`, `KAVENEGAR_TEMPLATE`, `KAVENEGAR_TEMPLATE_NOTIFY`, `KAVENEGAR_TEMPLATE_PAY_LINK`, `KAVENEGAR_SENDER`, `OTP_PHONE_SEND_MAX`, `OTP_PHONE_SEND_WINDOW_MS`, `OTP_PHONE_VERIFY_MAX`, `OTP_PHONE_VERIFY_WINDOW_MS`, `SMS_OTP_DEBUG_FALLBACK`, `ADMIN_ALERT_SMS`, `ADMIN_ALERT_PHONE`

Old bypass names `AUTH_OTP_BYPASS_PHONES` and `ALLOW_OTP_BYPASS` may be detected for diagnostics, but bypass behavior has been removed and they must not be used.

### Payments and settlement

`PAYMENTS_MODE`, `NUXT_PUBLIC_PAYMENTS_MODE`, `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `SEP_TERMINAL_ID`, `SEP_BASE_URL`, `PLATFORM_COMMISSION_BPS`

### Email and uploads

`EMAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL`, `S3_REGION`

### OAuth, observability, and public business metadata

`NUXT_OAUTH_GOOGLE_CLIENT_ID`, `NUXT_OAUTH_GOOGLE_CLIENT_SECRET`, `NUXT_OAUTH_GOOGLE_REDIRECT_URL`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `GIT_COMMIT_SHA`, `GITHUB_SHA`, `NUXT_PUBLIC_CLARITY_ID`, `NUXT_PUBLIC_CONTACT_OWNER_NAME`, `NUXT_PUBLIC_CONTACT_ADDRESS`, `NUXT_PUBLIC_CONTACT_POSTAL_CODE`, `NUXT_PUBLIC_CONTACT_LANDLINE`, `NUXT_PUBLIC_CONTACT_MOBILE`, `NUXT_PUBLIC_CONTACT_EMAIL`, `NUXT_PUBLIC_ENAMAD_META_CONTENT`, `NUXT_PUBLIC_ENAMAD_VERIFY_FILE`, `NUXT_PUBLIC_ENAMAD_TITLE_OVERRIDE`, `NUXT_PUBLIC_ENAMAD_ID`, `NUXT_PUBLIC_ENAMAD_CODE`

### How values are loaded

- Nuxt loads local `.env` values and maps selected settings in `nuxt.config.ts` into private/public runtime config. `NUXT_PUBLIC_*` values may be serialized for the client and must never contain secrets.
- `server/plugins/public-runtime-env.ts` synchronizes selected server-only Liara flags into public runtime config at process startup because some public values are otherwise build-time frozen.
- Server utilities and operational scripts also read `process.env` directly. Prisma requires `DATABASE_URL` in both `schema.prisma` and `server/utils/prisma.ts`.
- `scripts/check-db.mjs` and smoke helpers explicitly parse `.env` without replacing variables already exported by the shell.
- Production variables are supplied by Liara/GitHub Actions; no secret values belong in source control.

## Known rough edges and intentional limitations

- The README still describes FA/EN behavior, but current `nuxt.config.ts` is Farsi-only. Treat the active Nuxt config as authoritative.
- The court-focused pilot hides coach discovery/registration/dashboard routes and owner coach navigation while retaining their code and schema.
- Package/public-class and some season/package navigation surfaces are frozen or soft-landed; recurring owner calendar APIs still exist.
- Live Kavenegar OTP is real, but non-OTP booking/CRM delivery depends on separately approved lookup templates. Default local mode is dry-run/log. Scheduled campaigns and daily owner reminders have no in-app worker and require manual admin action or an external Liara dashboard cron.
- PWA is disabled by default to avoid stale service-worker caches.
- Without all S3 variables, uploads use `public/uploads`; that is convenient locally but Liara container disk is ephemeral.
- Rate limiting falls back to in-memory Nitro storage without Redis, so limits are not shared across multiple instances.
- Farsi date inputs are not uniform: some use custom Jalali components, while older flows still use native Gregorian inputs plus Jalali hints.
- Several flexible properties are stored as JSON strings rather than normalized tables; parse them through existing helpers.
- Admin authorization is one shared header secret, not a user/role/audit session.
- Historical docs can be stale. For example, `docs/UNDEPLOYED.md` is a deployment snapshot, not proof that current `main` is live.
- There is no repository evidence for a Cloudflare Tunnel or VPN dependency.

Search for current operational warnings in `docs/LAUNCH_CHECKLIST.md`, `docs/OPERATIONS.md`, `docs/KAVENEGAR_SETUP.md`, `docs/PAYMENTS.md`, and `docs/AUDIT_CHECKLIST.md` before changing provider or production behavior.

## Test story

CI (`.github/workflows/ci.yml`) starts PostgreSQL 16, installs with `npm ci`, generates Prisma, applies migrations, seeds demo data, checks i18n, builds, runs Vitest, runs integration smoke checks, installs Chromium, and runs Playwright.

- `npm test` — colocated Vitest tests under `shared/`, `server/`, and `app/composables/`
- `npm run lint` — ESLint plus Vue accessibility rules
- `npm run typecheck` — Nuxt prepare and Vue/Nuxt type checking
- `npm run check:i18n` — message consistency
- `npm run build` — Prisma generation plus production Nuxt build
- `npm run smoke:ci` — PostgreSQL-backed API/integration smoke suite; orchestrates a server
- `npm run test:e2e:ci` — Playwright critical flows with a managed server
- `npm run test:e2e` — Playwright against the configured/default local base URL
- `npm run smoke`, `smoke:auth`, `smoke:security`, `smoke:seo`, `smoke:performance`, `smoke:pilot`, `smoke:dashboard`, and `smoke:pages` — targeted suites, generally requiring a running server and sometimes demo/admin configuration
- `node scripts/qa-matrix.mjs` — route/role QA matrix

The Playwright suite is intentionally small: guest club discovery, athlete OTP login/bookings, profile upload, and owner OTP login/finance. Most domain edge cases are covered by unit tests and custom smoke scripts rather than browser tests.

## Run locally

Prerequisites: Node 22, npm, Docker with Compose, and an available PostgreSQL port.

```bash
nvm use
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run db:seed:demo
npm run dev
```

Open `http://localhost:3000`. The default `.env.example` uses PostgreSQL from `docker-compose.yml`, test payments, log-mode SMS, and the court-only pilot. Demo seed provides local athlete/owner/coach accounts; log-mode OTP responses contain a debug code outside production.

Useful alternatives:

```bash
npm run dev:stable       # polling-based managed dev server
npm run dev:status
npm run dev:stop
npm run db:studio
npm run build
npm run preview
```

`npm run dev` invokes `scripts/check-db.mjs` through `predev` and refuses a missing/non-PostgreSQL `DATABASE_URL`. Do not use `npm run db:reset`, forced seed flags, catalog wipe scripts, or production correction scripts against a database whose loss has not been explicitly authorized and backed up.
