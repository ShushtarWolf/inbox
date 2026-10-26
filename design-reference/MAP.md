# HTML prototype ↔ App route map

**Source of truth (2026-10-26):** `design-reference/inbox-all-pages-html/prototype.html`  
(from Downloads `Inbox_—_همهی_صفحات_دسکتاپ_و_موبایل_5.html`).

Screen ids are `go('…')` / `pg-…` targets in the prototype. Nuxt routes are the
product. When IA conflicts, **follow the HTML** for structure/labels/hierarchy;
keep live APIs, auth, wallet, and real club photos.

Archived Canva frame map: `canva-reference/MAP.md` (do not use for new UI).

## Tokens (from prototype `:root`)

| Token | Value |
|-------|-------|
| `--crimson` | `#C41E1E` |
| `--charcoal` | `#2c2c2a` |
| `--mustard` | `#b68a3b` |
| `--silver` | `#8f8f8b` |
| `--off` | `#f4efe9` |
| `--green` | `#2e7d4f` |
| `--green-soft` | `#dcebe1` |
| `--mustard-soft` | `#f3e9d3` |
| `--line` | `rgba(44,44,42,.08)` |

**Radius:** the prototype forces **square corners** via
`*,*::before,*::after{border-radius:0 !important}` (and the same on `#m1`/`#m2`/`#m3`
shells). Soft 10/20px values elsewhere in the CSS lose to that rule. Product chrome
should stay square (`--sz-canva-radius: 0`) unless a specific HTML region visibly
overrides it. Proto sticky-nav pills are tooling only, not product UI.

**Icons:** HTML uses Tabler (`ti-*`). Live uses Material Symbols — map closest glyphs
or adopt Tabler for chrome; never raw ligature text; never permanent emoji stand-ins.

**Gap tracker:** [`GAPS.md`](./GAPS.md) · **Visual check:** `npm run check:html`

## Role nav (prototype `NAV`)

| Role | Label | Primary items (go) |
|------|-------|--------------------|
| athlete | ورزشکار | `athlete-home`, `athlete-bookings`, `athlete-coaches`, `athlete-wallet`, profile |
| coach | مربی | schedule / book / clients / packages (see coach screens) |
| coachp | مربی — در انتظار تایید | `coach-pending` |
| owner | مدیر مجموعه | calendar / finance / settings / CRM / staff |
| admin | ادمین | clubs / users / applications / tickets / withdrawals / calendar |

## Public & marketing

| Prototype `go()` | Nuxt route | Notes |
|------------------|------------|-------|
| `home` | `/` | Hero + search + club/coach rails |
| `clubs` | `/clubs` | Court/club list |
| `club` | `/clubs/[slug]` | Club detail + book widget |
| `confirm` | confirm sheet on `/clubs/[slug]` | Booking confirm |
| `pricing` | `/pricing` | |
| `about` | `/about` | |
| `contact` | `/contact` | |
| `terms` | `/terms` | |
| `privacy` | `/privacy` | |
| `cancellation` | `/cancellation` | |
| `complaints` | `/complaints` | |
| `clubs-apply` | `/clubs/apply` | Club apply |
| `apply` | coach/owner apply paths | Prefer `/register/coach`, `/register/owner` |
| `offline` | `/offline` | |
| `notfound` | Nuxt error page | |

## Auth

| Prototype `go()` | Nuxt route | Notes |
|------------------|------------|-------|
| `login` | `/login` | |
| `login-otp` | AuthFlow OTP (login) | Sheet/step, not always a route |
| `register` | `/register` | |
| `choose-role` | `/choose-role` | Athlete / Coach / Owner |
| `forgot-password` | `/forgot-password` | |
| `reset-password` | `/reset-password` | |

## Athlete

| Prototype `go()` | Nuxt route | Notes |
|------------------|------------|-------|
| `athlete-home` | `/athlete/home` | |
| `athlete-bookings` | `/athlete/bookings` | Detail via query / nested |
| `athlete-coaches` | `/coaches` or athlete coaches tab | Align to HTML IA |
| `athlete-coach` | `/coaches/[id]` | Coach profile from athlete |
| `athlete-wallet` | `/athlete/wallet` | |
| `m-athlete` | mobile athlete shell | chrome pattern, not a route |
| `book-coach` | `/book/coach/[id]` | |

Also in product (hub): `/athlete`, `/athlete/profile`, `/athlete/payments`, `/athlete/notifications`, `/athlete/support`.

## Coach

| Prototype `go()` | Nuxt route | Notes |
|------------------|------------|-------|
| `coach` | `/coach` | Dashboard |
| `coach-pending` | `/coach/pending` | Awaiting approval |
| `coach-profile` | `/coach/profile` | |
| `coach-schedule` | `/coach/schedule` | |
| `coach-book` | `/coach/book` | |

Also in product: `/coach/clients`, `/coach/packages`, `/coach/settings`.

## Owner

| Prototype `go()` | Nuxt route | Notes |
|------------------|------------|-------|
| `owner-calendar` | `/owner/calendar` | Primary desk |
| `owner-finance` | `/owner/finance` | |
| `owner-finance-report` | `/owner/finance/report` | |
| `owner-crm` | `/owner/crm` | |
| `owner-crm-detail` | `/owner/crm/[id]` | |
| `owner-settings` | `/owner/settings` | |
| `owner-setup` | `/owner/setup` | |
| `owner-staff` | `/owner/workers` | Staff/workers |
| `owner-support` | `/owner/support` | |
| `owner-pending` | `/owner/pending` | |

Also in product: equipments, packages, coaches, notifications, competitions — match HTML when those screens exist in the prototype; otherwise keep product chrome.

## Pay

| Prototype `go()` | Nuxt route | Notes |
|------------------|------------|-------|
| `pay` | payment / wallet top-up flows | |
| `pay-gateway` | gateway redirect | |
| `pay-gateway-test` | `/payments/test-gateway` | |
| `pay-ok` | success state | |
| `pay-fail` | failure state | |

## Admin

| Prototype `go()` | Nuxt route | Notes |
|------------------|------------|-------|
| `admin` | `/admin` | |
| `admin-clubs` | `/admin/clubs` | |
| `admin-users` | `/admin/users` | |
| `admin-applications` | `/admin/applications` | |
| `admin-tickets` | `/admin/tickets` | |
| `admin-withdrawals` | `/admin/withdrawals` | |
| `admin-calendar` | `/admin/calendar` | |
| `admin-calendar-sources` | admin calendar sources UI | may be tab/section |

Also in product: `/admin/coach-applications`, `/admin/sms`, `/admin/bookings`, etc.

## Product chrome (do not strip)

Live app must keep escape hatches even if a prototype crop omits them:

| Surface | Required chrome |
|---------|-----------------|
| Public (narrow) | Logo → home, login / welcome; funnel pages need back |
| Athlete primary | Bottom nav + home/profile shortcuts |
| Athlete secondary | Subpage header → `/athlete` |
| Owner primary | Bottom nav (calendar / finance / settings / more) |
| Owner More destinations | Subpage header → `/owner/calendar?more=1` |

## Fidelity gate

1. Open the matching screen in `prototype.html` (`go('…')`).
2. Hard-refresh the Nuxt route (375px for phone shells; desktop width for desk layouts).
3. Match regions, hierarchy, tokens, and IA from the **rendered** HTML (square corners).
4. Run `npm run check:html -- --screen <goId> --route <path>` and attach pairs from
   `design-reference/comparisons/`. Update `GAPS.md`.
5. `npm run check:canva` is **historical only** — not the visual gate.
