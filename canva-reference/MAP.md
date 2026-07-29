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
| `home page (3).png` | `/clubs/[slug]` club detail (slots + calendar) | — |
| `home page (4).png` | Court booking **confirm sheet** on `/clubs/[slug]` | — |
| `login_sign up.png` | AuthFlow **gate** (`/login`) | capture: `localhost/app-auth-gate.png` |
| `4.png` | AuthFlow **role** picker | — |
| `5.png`–`16.png` (auth variants) | AuthFlow login/register/OTP sheets | — |
| `home page (8).png` | `/athlete/home` | `overlays/athlete-home.jpg` |
| `home page (6).png` | `/athlete/favorites` | `overlays/favorites.jpg` |
| `home page (5).png` | `/athlete` hub menu | capture: `localhost/app-athlete-hub.png` |
| `home page (7).png` | `/athlete/bookings` history | capture only |
| `home page (9|10|15).png` | `/owner/calendar` today (color bars, tabs, hero chrome, nav) | `overlays/owner-calendar.jpg` |
| `home page (12).png` | `/owner/calendar` walk-in reserve sheet | — |
| `home page (14).png` | `/owner/calendar` overview tab | — |
| `جزییات بازیکن.png` | `/owner/finance` (+ txn sheet) | `overlays/owner-finance.jpg` |
| `گزارش پیشرفته.png` | `/owner/finance/report` | `overlays/finance-report.jpg` |
| `home page (18).png` | `/owner/crm` | `overlays/owner-crm.jpg` |
| `کمپین پیامکی جدید*.png` | CRM SMS wizard sheet | — |
| `افزودن زمین.png` | owner add-court / settings court form | — |
| `home page (20).png` / `(21).png` | `/owner/equipments` (+ edit sheet) | — |
| `home page (29).png` | `/owner/support` | — |

### Routing notes (post Prompts 1–9 cleanup)

- **Primary court book UX** = `/clubs/[slug]` + confirm sheet (`(3)` / `(4)`). Do not send athletes through a standalone book page.
- **Legacy** `/book/court/:slug` → replace-redirect to `/clubs/:slug` (preserves `date` / `slot` / `court` query).
- **Athlete booking detail** `/athlete/bookings/[id]` (and coach variant) → `/athlete/bookings?booking=` / `?coachSession=` (list is primary; detail is deep-link only).
- **Coach / package** stay pilot-gated (`/book/coach`, `/book/package`, `/coaches`, …).

## Severity legend

- **blocker** — wrong screen / missing primary regions / broken flow
- **visual** — hierarchy, chrome, radius/pills, spacing, CTAs
- **copy** — placeholder / wrong labels
- **ok-enough** — same job, minor polish

## Gap summary (after Prompts 1–9 + cleanup)

### Fixed blockers (product / flow)

- Court booking lived on orphan `/book/court` → **fixed**: confirm sheet on club detail; legacy route redirects.
- Athlete booking detail as separate primary surface → **fixed**: redirect to history list + query highlight.
- Coach/package in primary court MVP paths → **fixed**: pilot middleware (+ `/book/package`); soft landings when reached.
- AuthFlow Canva gate / role / sheets square CTAs; CRM SMS schedule sheet shipped in prior prompts.

### Public home `/`
- **ok-enough**: Logo R / login L, hero rails, square red **جستجو** CTA + white field group (LOCKED search).
- **copy**: Live FA hero uses real marketing (`رزرو زمین، راحت و سریع`). Canva artboard + AuthFlow gate still show shared placeholder **“Check this box!”** — keep that string on AuthFlow only for frame parity; do not put it back on `/`.
- **visual (remaining)**: Public bottom nav / escape chrome even when Canva artboard omits them.

### `/clubs` + club detail `(3)` / confirm `(4)`
- **ok-enough**: List hero + cards; detail calendar/slots + square confirm sheet CTAs.
- **visual (remaining)**: Pixel polish vs Canva overlays (spacing, gallery chrome); app bottom nav vs full-bleed Canva.

### Auth gate
- **product**: No Google (intentional). Square gate CTAs + Athlete/Owner only.
- **copy**: Gate tagline stays Canva “Check this box!” for auth sheets.

### `/athlete/home` vs `(8)`
- **ok-enough**: Photo hero + curve + ۲۰٪ badge + greeting + text **جستجو** search row + 3 rails.
- **visual (remaining)**: Bottom-nav labels may still differ from icon-only Canva variants.

### `/athlete/favorites` vs `(6)`
- **ok-enough**: Photo header + sport chips + rich cards / empty + browse CTA.

### `/athlete` hub vs `(5)`
- **ok-enough**: Red curved hero, **circular** avatar (Canva), square stats, menu list.
- **product**: Wallet row kept (pay infrastructure); Canva list omits it.

### Athlete profile + notifications + bookings
- **ok-enough**: Square panels / CTAs; bookings calendar + cards / inline cancel–rebook–pay. History source of truth is `(7)` (not `(12)` — that frame is owner walk-in reserve).
- **visual (remaining)**: History card density vs `(7)`; avatar may be `rounded-full` (matches hub circle).

### `/owner/equipments` vs `(20)`/`(21)`
- **ok-enough**: Square gray amenity chips + price bars; green **+ افزودن** on section start (left in RTL); edit sheet black **ذخیره**.
- **visual (remaining)**: No red dash-hero band (Canva is title + subtitle only).

### `/owner/support` vs `(29)`
- **ok-enough**: Text ops guide + contact lines on cream; no soft TailAdmin cards / red hero band.

### `/owner/calendar` / finance / CRM
- **ok-enough for COURT-MVP**: Frames `(9)` / `(10)` / `(15)` at 375px — color bars, today/overview tabs, photo hero chrome, owner bottom nav. Sheet radius locked to ≤2px; season/package dead panels use square chips (not neo-pill).
- **settlement**: Finance payouts panel = real SHEBA + withdraw REQUEST (no `payoutsPlaceholder`).
- **flow fixes shipped**: guest confirm auth-gate; wallet CTA on confirm when balance covers; club slug alias `club-9208f4` → `iust-tennis`; pilot map pin fallback; wide viewport single login (Canva chrome ≤430 only).
- **visual (remaining)**: Pixel polish vs `(15)` / `(10)` only if new Canva frames land.

## Chrome consistency (product rule)

Phone frames in Canva often omit shared chrome. **Live app must keep escape hatches** even when a Canva artboard does not show them:

| Surface | Required chrome |
|---------|-----------------|
| Public (≤430px) | `CanvaPublicChrome` — INBOX logo → home, login / welcome; funnel pages also pass `backTo` |
| Athlete primary tabs | Bottom nav + (home/favorites/bookings) logo or `CanvaAthleteChrome` + profile shortcut |
| Athlete secondary | `CanvaSubpageHeader` → `/athlete` (notifications, wallet, payments, profile) |
| Owner primary tabs | Bottom nav (calendar / finance / settings / more) |
| Owner More destinations | `CanvaSubpageHeader` → `/owner/calendar?more=1` |

Components: `CanvaPublicChrome.vue`, `CanvaSubpageHeader.vue`, `CanvaAthleteChrome.vue`.

**Do not** strip bottom nav / logo / back to “match Canva” if that strands the user.

## Recommended fix order (remaining — visual only)

1. Club detail / confirm sheet pixel polish vs `(3)` / `(4)` overlays (optional)
2. Finance / CRM polish only if new frames land
3. Re-capture overlays after UI changes (latest: `public-home` + `owner-calendar` @ 375px)

## Clarity QA notes (Jul 2026)

- Script loads in prod (`data-clarity-project=xsyany4vpj`).
- Pre-fix dead-click cluster on `/`: date remnant, city placeholder, duplicate login, hero chevrons — addressed in UX friction ship; recheck after Liara deploy.
- Post-fix hotspots fixed here: owner promo badge, club «نقشه» empty (no lat/lng) → pilot pin + address OSM fallback.

## How to re-compare cheaply

```bash
# regenerate overlays after UI changes
# (script pattern already used: resize Canva+app to 180×390 side-by-side JPG)
open canva-reference/comparisons/overlays/
```

Do **not** open all 55 full PNGs in chat — use contact sheets + one overlay per task.
