# inbox — Sports Booking (v1)

Nuxt 4 app for padel & tennis court and coach booking. PWA, FA/EN, three role dashboards.

## Setup

**PostgreSQL is required** — SQLite is not supported. Use Docker Compose:

```bash
nvm use
npm install
cp .env.example .env   # set DATABASE_URL to postgresql://...
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` runs `check-db` automatically via `predev`.

Open http://localhost:3000 (FA) · http://localhost:3000/en (EN)

For production preview:

```bash
npm run build
node .output/server/index.mjs
```

Set `NUXT_SESSION_PASSWORD` in production (minimum 32 characters). The app will refuse to start in production without a valid secret.

### Production deploy

Liara runs [`scripts/start-production.mjs`](scripts/start-production.mjs) via `liara.json` (`npm run start:production`). By default **no seed runs on deploy**.

| Env var | Purpose |
|---------|---------|
| `SEED_ON_EMPTY=true` | Run seed only when the database has zero users (first deploy) |
| `FORCE_SEED_RESET=true` | Wipe and reseed — **dev/local only**; never set in production |

Production seed creates the sports catalog only (no demo accounts). For local demo data, run `SEED_DEMO_DATA=true npm run db:seed` or `npm run db:seed:demo`. Demo passwords (`demo1234`) must never be used in production.

### Database migrations

Schema changes use Prisma migrations (PostgreSQL). Local workflow:

```bash
docker compose up -d
npm run db:migrate        # prisma migrate dev — creates/applies migrations
npm run db:migrate:deploy # production: apply pending migrations only
```

Production (`start-production.mjs`) runs `prisma migrate deploy` before starting the server.

**Liara env vars:** `DATABASE_URL` (Liara Postgres), `NUXT_SESSION_PASSWORD`, `NUXT_PUBLIC_SITE_URL=https://inboxs.ir`, `SEED_ON_EMPTY=true` (first deploy only), `ADMIN_PROVISION_SECRET`, `PAYMENTS_MODE=pay_at_club`.

Deploy from repo root:

```bash
liara deploy --app inbox
```

See [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md), [docs/OPERATIONS.md](docs/OPERATIONS.md), [docs/PAYMENTS.md](docs/PAYMENTS.md).

## Demo accounts (local development only)

Requires `SEED_DEMO_DATA=true` (or `npm run db:seed:demo`):

| Role | Email | Password |
|------|-------|----------|
| Athlete | `athlete@inbox.local` | `demo1234` |
| Coach | `coach@inbox.local` | `demo1234` |
| Club owner | `owner@inbox.local` | `demo1234` |

Run `FORCE_SEED_RESET=true SEED_DEMO_DATA=true npm run db:seed` to wipe and recreate demo data locally.

## Routes

**Public:** `/` · `/clubs` · `/coaches` · `/book/court/:slug` · `/book/coach/:id`

**Athlete:** `/athlete` · `/athlete/bookings` · `/athlete/profile`

**Coach:** `/coach` · `/coach/schedule` · `/coach/clients` · `/coach/profile`

**Owner:** `/owner` (calendar) · `/owner/finance` · `/owner/equipments` · `/owner/packages` · `/owner/crm` · `/owner/coaches` · `/owner/support` · `/owner/settings`

Reserve sub-routes redirect to calendar guidance pages: `/owner/reserve/season` · `/owner/reserve/package` (season/package reserve opens from a calendar slot modal)

## Dashboard navigation

Three role dashboards share [`DashboardShell.vue`](app/components/DashboardShell.vue):

| Role | Layout | Nav items | Mobile | Desktop |
|------|--------|-----------|--------|---------|
| Owner (`CLUB_ADMIN`) | `dashboard-owner` | 8 sidebar items | Bottom nav (scroll when >5) + drawer | Dark sidebar with icons |
| Coach | `dashboard-coach` | 4 items | Bottom nav | Sidebar |
| Athlete | `dashboard-athlete` | 3 items | Bottom nav | Sidebar |

**IA decision:** Owner keeps 8 nav items (not the HTML prototype’s 9). Season/package reserve and cancel flows are reached from the calendar slot modal, not the sidebar.

Nav item type: [`shared/nav.ts`](shared/nav.ts) (`NavItem`).

## Languages

- Default locale is Farsi with RTL layout at `/`
- English is available at `/en`
- Users can switch language from the header and their locale is saved on profile update
- Club, coach, court, and equipment names use bilingual DB fields and follow the active locale

## PWA

PWA is **disabled by default**. Enable it with:

```bash
NUXT_PUBLIC_ENABLE_PWA=true npm run dev
```

When enabled:

- Install prompt is available for public and athlete flows
- Offline fallback route is `/offline` (see [`app/pages/offline.vue`](app/pages/offline.vue))
- Service worker uses `navigateFallback: '/offline'` for uncached navigations
- Maskable icons are included in the manifest
- The client updates manifest `lang`, `dir`, and `start_url` based on the active locale before install

To verify offline locally: enable PWA, load the app once online, then go offline in DevTools and navigate to a new route — you should land on `/offline` with a retry button.

## Responsive layouts

- Public pages keep the mobile bottom tab bar and expand to a desktop top navigation on large screens
- Athlete and coach dashboards use a shared responsive shell with mobile bottom nav and desktop sidebar
- Owner pages keep the wider desktop workspace and now use a collapsible sidebar on mobile

## v1 scope

- Pay at club (no live IPG)
- Owner calendar with 7 slot statuses (from doodles)
- Manual reserve / cancel / season / package flows
- CRM: contact list + stats; SMS logged via API only (no gateway / campaign composer)
- Package creator saves drafts (public classes = phase 2)
- Owner coaches page: read-only staff list (invite/edit flows = post-MVP)
- Staff `permissionsJson`: stored in DB; nav gating deferred to post-MVP (all `CLUB_ADMIN` see full owner nav)

## Brand assets

Original assets in `public/brand`, `public/icons`, `brand/palette.ts`. Planning doodles in `planning/doodles/`.

## Scripts

```bash
npm test            # 99 vitest unit tests
npm run smoke:ci    # full integration (Postgres + build required)
npm run test:e2e:ci # Playwright e2e (starts server automatically)
npm run lint        # ESLint + vuejs-accessibility
npm run analyze     # bundle analysis via nuxi analyze
npm run check:db    # verify DATABASE_URL is PostgreSQL

npm run db:reset    # reset + seed
npm run build       # production build
npm run smoke       # API smoke (needs server running)
npm run smoke:dashboard  # dashboard HTML routes (needs server running)
node scripts/qa-matrix.mjs  # role × locale route matrix (defaults to production)
```

### Provider architecture

- **Payments:** `PAYMENTS_MODE=pay_at_club|test|live`, `PAYMENT_PROVIDER=zarinpal|log`. Live gateways not implemented.
- **SMS:** `SMS_PROVIDER=log` (default dry-run; OTP returns `debugCode`). Live Kavenegar when `SMS_ENABLED=true`, `SMS_PROVIDER=live` (or `kavenegar`), and `KAVENEGAR_API_KEY` are set. Optional `KAVENEGAR_TEMPLATE` (Verify Lookup) and `KAVENEGAR_SENDER`. Check with `npm run sms:status`. Process due CRM campaigns: `POST /api/admin/sms/process-scheduled`.
