# inbox — Sports Booking (v1)

Nuxt 4 app for padel & tennis court and coach booking. PWA, FA/EN, three role dashboards.

## Setup

```bash
nvm use
npm install
cp .env.example .env   # if needed
npm run db:push
npm run db:seed
npm run dev
```

Open http://localhost:3000 (FA) · http://localhost:3000/en (EN)

For production preview:

```bash
npm run build
node .output/server/index.mjs
```

Set `NUXT_SESSION_PASSWORD` in production to override the built-in demo fallback secret.

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Athlete | `athlete@inbox.local` | `demo1234` |
| Coach | `coach@inbox.local` | `demo1234` |
| Club owner | `owner@inbox.local` | `demo1234` |

## Routes

**Public:** `/` · `/clubs` · `/coaches` · `/book/court/:slug` · `/book/coach/:id`

**Athlete:** `/athlete` · `/athlete/bookings` · `/athlete/profile`

**Coach:** `/coach` · `/coach/schedule` · `/coach/clients` · `/coach/profile`

**Owner:** `/owner` (calendar) · `/owner/finance` · `/owner/equipments` · `/owner/packages` · `/owner/crm`

## Languages

- Default locale is Farsi with RTL layout at `/`
- English is available at `/en`
- Users can switch language from the header and their locale is saved on profile update
- Club, coach, court, and equipment names use bilingual DB fields and follow the active locale

## PWA

- Install prompt is enabled for public and athlete flows
- Offline fallback route is `/offline`
- Maskable icons are included in the manifest
- The client updates manifest `lang`, `dir`, and `start_url` based on the active locale before install

## Responsive layouts

- Public pages keep the mobile bottom tab bar and expand to a desktop top navigation on large screens
- Athlete and coach dashboards use a shared responsive shell with mobile bottom nav and desktop sidebar
- Owner pages keep the wider desktop workspace and now use a collapsible sidebar on mobile

## v1 scope

- Pay at club (no live IPG)
- Owner calendar with 7 slot statuses (from doodles)
- Manual reserve / cancel / season / package flows
- CRM logs SMS only (no gateway)
- Package creator saves drafts (public classes = phase 2)

## Brand assets

Original assets in `public/brand`, `public/icons`, `brand/palette.ts`. Planning doodles in `planning/doodles/`.

## Scripts

```bash
npm run db:reset    # reset + seed
npm run build       # production build
npm run smoke       # API smoke (needs server running)
```
