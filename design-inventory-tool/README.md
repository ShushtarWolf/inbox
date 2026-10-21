# Design inventory tool

Offline UI/UX capture pipeline for the Inbox Nuxt app. Does **not** modify application source.

## Prerequisites

- PostgreSQL with demo seed (`SEED_DEMO_DATA=true`)
- App running at `http://127.0.0.1:3000` (or set `BASE_URL`)

## Run

```bash
npm run db:seed:demo   # from repo root, once
node design-inventory-tool/run.mjs
```

Outputs:

- `design-inventory.html` (repo root, self-contained base64 images)
- `design-inventory/desktop/*.png`
- `design-inventory/mobile/*.png`
- `design-inventory-tool/results/manifest.json`
- `design-inventory-tool/harness/components.html` (CSS class harness only)

Viewports: desktop **1440×900**; mobile **390×844**, touch, `deviceScaleFactor: 2`.
