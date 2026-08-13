# Canva ↔ App frame map (local)

Source of truth (Aug 12): `canva-reference/inbox-website-2026-08-12/raw/` (80 PNGs).
Prior overlays live in `comparisons/overlays/`; app captures in `comparisons/localhost/`.

## Inventory (Aug 12 export)

| Kind | Count |
|------|------:|
| Total PNGs | 80 |
| Blank / near-empty (&lt;20KB) | 14 |
| Real frames | 66 |

Blankish (ignore): `17,21,26,45,49,55,59,66,69,73,77–80.png`

Near-cream / thin frames (soft-land, not primary MVP): `home page (30|33|34|35|39|40|41|43).png` (high cream ratio).

## Route map (needed product pages)

| Canva file(s) | App route / UI | Notes |
|---|---|---|
| `home page.png`, `home page (2).png` | `/` public home | Logo R / login L; hero; **3-field search** (sport · city · date); 3 rails |
| `Court list.png` | `/clubs` | Mustard square sport chips + court cards + **رزرو کن**; preserves `?date=` |
| `home page (3).png` | `/clubs/[slug]` club detail | Gallery · amenities · cal R / courts+slots L · confirm CTA; deep-link `?date=` |
| `home page (4).png` | Court booking **confirm sheet** on `/clubs/[slug]` | Green title · red club name · پرداخت |
| `login_sign up.png` | AuthFlow **gate** | Square CTAs; Google excluded |
| `4.png` | AuthFlow **role** picker | **Athlete / Coach / Owner** (coach product enabled) |
| `5.png`–`16.png` (auth variants) | AuthFlow login/register/OTP sheets | Coach register → `/api/auth/register-coach` |
| `home page (8).png` | `/athlete/home` | Photo hero + curve + ۲۰٪ + **3-field search** + rails + bottom nav |
| `home page (6).png` | `/athlete/favorites` | — |
| `home page (5).png` | `/athlete` hub menu | Circular avatar OK (Canva) |
| `home page (7).png` | `/athlete/bookings` history | Cancel / rebook CTAs |
| `home page (9).png` + `(13)` | `/owner/calendar` (legacy multi-court ref) | Superseded for Today by list-day `(22+)` |
| `home page (22\|23\|24\|25\|27\|32\|38\|42).png` | `/owner/calendar` **Today list-day** | Date bullet · court chips · color slot bars · desk sheets |
| `home page (10\|17\|18).png` | `/owner/calendar` walk-in / block+note sheets | — |
| `home page (11).png` | Owner recurring / continue-book sheet on calendar | Soft-land (season/package gated) |
| `home page (12\|19).png` | Owner desk confirm (pay link / cash) | Soft-land vs athlete confirm `(4)` |
| `home page (14\|15\|16).png` | Booking detail + multi-cancel sheet | — |
| `changed.png` | `/owner/calendar` overview tab | Designer-marked |
| `home page (26).png` | `/owner/finance` | Photo hero + chart |
| `جزییات بازیکن.png` | `/owner/finance` txn sheet | — |
| `گزارش پیشرفته.png` | `/owner/finance/report` | — |
| `home page (28).png` | `/owner/crm` | — |
| `کمپین پیامکی جدید*.png` | CRM SMS wizard sheet | — |
| `افزودن زمین.png` | owner add-court / settings court form | — |
| `home page (20\|21\|30).png` | `/owner/equipments` (+ edit) | `(30)` thin duplicate |
| `home page (29).png` | `/owner/support` | — |

### Routing notes (post Prompts 1–9 cleanup)

- **Primary court book UX** = `/clubs/[slug]` + confirm sheet (`(3)` / `(4)`). Do not send athletes through a standalone book page.
- **Legacy** `/book/court/:slug` → replace-redirect to `/clubs/:slug` (preserves `date` / `slot` / `court` query).
- **Athlete booking detail** `/athlete/bookings/[id]` → `/athlete/bookings?booking=` (list is primary).
- **Coach / package**: coach signup + `/coach` hub are **on** (`PILOT_NO_COACH=false`). Package stays soft-landed / gated where still flagged.
- **Owner Today** = list-day (`(22+)`): one court at a time, full-bleed status bars. Overview tab unchanged.

## Severity legend

- **blocker** — wrong screen / missing primary regions / broken flow
- **visual** — hierarchy, chrome, radius/pills, spacing, CTAs
- **copy** — placeholder / wrong labels
- **ok-enough** — same job, minor polish

## Gap summary (Aug 12 QA pass)

### Fixed this pass

| Frame | Route | Severity | What was wrong | Fix |
|---|---|---|---|---|
| `(3)` | `/clubs/[slug]` | **blocker** | Rating showed `0.0` when `reviewSummary.average=0` with empty reviews | Prefer `club.rating` when review count is 0 |
| `Court list` | `/clubs` | **copy** | Card CTA `رزرو آن` vs Canva `رزرو کن` | Use `home.bookNow` |
| `(3)` | `/clubs/[slug]` | **visual** | Court nums sat above book widget | Move court picker into slots column (cal R / courts+slots L) |
| `(4)` | confirm sheet | **visual** | Club name navy vs Canva red | `text-brand-primary` on confirm club title |

### High-traffic status

| Frame | Route | Severity | Notes |
|---|---|---|---|
| `home page` / `(2)` | `/` | **ok-enough** | 3-field search (sport · city · date → `?date=`), rails, bottom nav kept |
| `Court list` | `/clubs` | **ok-enough** | Square mustard chips; CTA **رزرو کن**; date query preserved |
| `(3)` / `(4)` | club detail + confirm | **ok-enough** | Interactive slots + sheet; product wallet/pay CTAs kept |
| `login_sign up` / `4` | AuthFlow | **ok-enough** | Athlete / Coach / Owner; no Google |
| `(8)` / `(5)` / `(7)` | athlete | **ok-enough** | Athlete home also has 3-field search |
| `(22+)` + sheets | owner calendar Today | **ok-enough** | List-day primary (court chips + color bars) |
| `(9)` multi-court | owner calendar | **legacy ref** | Export only; live Today uses list-day |
| `(11)` recurring | owner sheet | **out of MVP** | Season/package gated — soft-land |
| `(12\|19)` owner pay sheet | owner desk | **soft-land** | Cash / pay-link desk flow — not athlete `(4)` |

### Chrome consistency (product rule)

Phone frames in Canva often omit shared chrome. **Live app must keep escape hatches**:

| Surface | Required chrome |
|---------|-----------------|
| Public (≤430px) | `CanvaPublicChrome` — INBOX logo → home, login / welcome; funnel pages also pass `backTo` |
| Athlete primary tabs | Bottom nav + home/profile shortcuts |
| Athlete secondary | `CanvaSubpageHeader` → `/athlete` |
| Owner primary tabs | Bottom nav (calendar / finance / settings / more) |
| Owner More destinations | `CanvaSubpageHeader` → `/owner/calendar?more=1` |

**Do not** strip bottom nav / logo / back to “match Canva” if that strands the user.

## Recommended next

1. Re-capture overlays after UI changes
2. Liara: set `PILOT_NO_COACH=false` + `NUXT_PUBLIC_PILOT_NO_COACH=false` so coach routes match local
3. Owner desk pay sheets `(12|19)` polish if needed

## How to re-compare cheaply

```bash
# regenerate overlays after UI changes
open canva-reference/comparisons/overlays/
```

Do **not** open all 66 full PNGs in chat — use contact sheets + one overlay per task.
