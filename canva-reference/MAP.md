# Canva ↔ App frame map (local)

Generated from `canva-reference/pages/` (69 files; 14 blankish skipped).
Side-by-side overlays live in `comparisons/overlays/`.
App captures (375×812) live in `comparisons/localhost/`.

## Inventory

| Kind | Count |
|------|------:|
| Total PNGs | 69 |
| Blank / near-empty (&lt;20KB) | 14 |
| Real frames | 55 |

Blankish (ignore): `17,21,26,34,38,44,48,55,58,62,66–69.png`

## Route map (needed product pages)

| Canva file(s) | App route / UI | Overlay |
|---|---|---|
| `home page.png`, `home page (2).png` | `/` public home | `overlays/public-home.jpg` |
| `Court list.png` | `/clubs` | `overlays/clubs-list.jpg` |
| `login_sign up.png` | AuthFlow **gate** (`/login`) | capture: `localhost/app-auth-gate.png` |
| `4.png` | AuthFlow **role** picker | — |
| `5.png`–`16.png` (auth variants) | AuthFlow login/register/OTP sheets | — |
| `home page (8).png` | `/athlete/home` | `overlays/athlete-home.jpg` |
| `home page (6).png` | `/athlete/favorites` | `overlays/favorites.jpg` |
| `home page (12).png` / bookings cards | `/athlete/bookings` | capture only |
| `home page (22)` / hub-like | `/athlete` profile hub | capture only |
| `home page (10|15).png` | `/owner/calendar` today | `overlays/owner-calendar.jpg` |
| `home page (14).png` | `/owner/calendar` overview tab | — |
| `جزییات بازیکن.png` | `/owner/finance` (+ txn sheet) | `overlays/owner-finance.jpg` |
| `گزارش پیشرفته.png` | `/owner/finance/report` | `overlays/finance-report.jpg` |
| `home page (18).png` | `/owner/crm` | `overlays/owner-crm.jpg` |
| `کمپین پیامکی جدید*.png` | CRM SMS wizard sheet | — |
| `افزودن زمین.png` | owner add-court / settings court form | — |

## Severity legend

- **blocker** — wrong screen / missing primary regions / broken flow
- **visual** — hierarchy, chrome, radius/pills, spacing, CTAs
- **copy** — placeholder / wrong labels
- **ok-enough** — same job, minor polish

## Gap summary (after 375px capture compare)

### Public home `/`
- **visual**: App adds red top promo strip + public bottom nav not in Canva home frame.
- **visual**: Search CTA taller / different field chrome vs Canva single-line group.
- **copy**: Hero still uses Canva placeholder “Check this box!” (both sides).
- **ok-enough**: Logo R / login L, hero, rails, square-ish red CTAs present.

### `/clubs`
- **ok-enough**: Hero + court cards + book CTA align.
- **visual**: App bottom nav; Canva frame often full public page without it.
- **visual**: Sport chips / sort denser in app than Canva list frame.

### Auth gate
- **blocker/product conflict**: Canva gate shows **Login with Google**; product rule is SMS-only / Google hard-off. Keep SMS-only; treat Google as intentional product deviation unless user re-enables.
- **visual**: Gate square CTAs vs soft modal chrome still diverge from LOCKED in places.

### `/athlete/home`
- **visual**: Canva has photo hero + curved cut + 20% badge; app is flatter text header.
- **visual**: Bottom nav labels differ (Canva sometimes icon-only).
- **ok-enough**: Greeting + search + 3 rails + book CTAs.

### `/athlete/favorites`
- **visual**: Canva rich photo header + yellow chip active; app emptier / simpler when no favorites.
- **flow**: Empty state must match Canva empty, not blank TailAdmin.

### `/owner/calendar`
- **blocker visual**: Biggest gap — Canva = photo header + Today/Overview tabs + full-width color status bars (red/yellow/black/grey). App = club switcher + day bubbles + court chips + grey free cards.
- **visual**: Bottom nav icons/order close but not identical (finance icon).

### `/owner/finance`
- **visual**: Canva black income hero card + method bar + 7-day chart; app panel stack is flatter.
- **ok-enough**: Day/month idea + stats present.

### `/owner/finance/report`
- **ok-enough**: Signal cards + LTV row + download CTA exist.
- **visual**: Funnel chart area empty in Canva too; polish cards/radius.

### `/owner/crm`
- **ok-enough**: Stats 12/12/12, filters, list badges, “کمپین پیامکی جدید”.
- **product**: Canva SMS wizard explicitly says MVP log-only — align with SINGLE/MULTI honesty.

## Recommended fix order (highest impact)

1. Owner calendar chrome + slot color bars (match `home page (15)` / `(10)`)
2. Athlete home hero band (match `home page (8)`)
3. Public home search row + remove/hide chrome Canva doesn’t show at 375
4. Favorites filled-card composition (`home page (6)`)
5. Auth gate (no Google) + role/OTP frames `4–16`
6. Finance / CRM / report polish

## How to re-compare cheaply

```bash
# regenerate overlays after UI changes
# (script pattern already used: resize Canva+app to 180×390 side-by-side JPG)
open canva-reference/comparisons/overlays/
```

Do **not** open all 55 full PNGs in chat — use contact sheets + one overlay per task.
