# Canva ↔ App frame map (local)

Source of truth (Aug 27 sync): `canva-reference/inbox-website-2026-08-27/` and `canva-reference/pages/` (from `Downloads/inbox website (2).zip`). Prior Aug 12 export: `inbox-website-2026-08-12/`.

Prior overlays live in `comparisons/overlays/`; app captures in `comparisons/localhost/`. **Full pixel review:** `comparisons/report-full-2026-08-27.md` (`npm run check:canva`).

Behnaz court-booking MVP screen list (FA only): [`docs/MVP_SCREEN_INVENTORY.md`](../docs/MVP_SCREEN_INVENTORY.md).

## Inventory (Aug 12 export)

| Kind | Count |
|------|------:|
| Total PNGs | 80 |
| Blank / near-empty (&lt;20KB) | 14 |
| Real frames | 66 |

Blankish (ignore): `17,21,26,45,49,55,59,66,69,73,77–80.png` (numbered empties — not `home page (N)`).

Near-cream / thin frames (soft-land, not primary MVP): `home page (30|33|34|35|39|40|41|43).png` (high cream ratio). Note: `(30)` is still the **equipments** page (thin but real).

### Filename sync notes (pages/ vs July dump)

`pages/` now matches Aug 12 `raw/` (same 80 names + bytes). Vs the older July `pages/` dump:

| Change | Detail |
|--------|--------|
| Removed blanks | `34,38,44,48,58,62,67,68.png` |
| Added blanks | `45,49,59,73,77–80.png` |
| Added real | `changed.png`, `home page (35–44).png` |
| Renumbered content | Many `home page (N)` jobs moved (e.g. equipments → `(30)`, finance → `(26)`, CRM → `(28)`, desk sheets → `(10|17–21)`, list-day → `(22+)`) |

Do **not** trust July code comments that still say equipments = `(20)/(21)` — those frames are owner desk sheets in this export.

## Route map (needed product pages)

| Canva file(s) | App route / UI | Notes |
|---|---|---|
| `home page.png`, `home page (2).png` | `/` public home | Logo R / login L; hero; **3-field search** (sport · city · date); 3 rails |
| `Court list.png` | `/clubs` | Mustard square sport chips + court cards + **رزرو کن**; preserves `?date=` |
| `home page (3).png` | `/clubs/[slug]` club detail | Gallery · amenities · cal R / courts+slots L · confirm CTA; deep-link `?date=` |
| `home page (4).png` | Court booking **confirm sheet** on `/clubs/[slug]` | Green title · red club name · **پرداخت** (athlete) |
| `login_sign up.png` | AuthFlow **gate** | Square CTAs; **Google in Canva is OUT OF MVP** (product hard-off) |
| `4.png` | AuthFlow **role** picker | Athlete / Owner for Behnaz (`PILOT_NO_COACH`); Coach frame exists but gated |
| `5.png`–`16.png` (auth variants) | AuthFlow login/register/OTP sheets | Phone OTP; coach register path frozen for Behnaz |
| `home page (8).png` | `/athlete/home` | Photo hero + curve + ۲۰٪ + **3-field search** + rails + bottom nav |
| `home page (6).png` | `/athlete/favorites` | Not required for Behnaz MVP inventory |
| `home page (5).png` | `/athlete` hub menu | Circular avatar OK (Canva); links to profile / payments / wallet |
| `home page (7).png` | `/athlete/bookings` history | Cancel / rebook CTAs → `CanvaConfirmSheet` + club deep-link |
| — | `/athlete/profile`, `/athlete/wallet`, `/athlete/payments` | **In product**; no dedicated Canva page — entered from hub `(5)` |
| `home page (9).png` + `(13)` | `/owner/calendar` **Today GRID** | Closed Today = multi-court columns + time gutter + FABs; date picker on GRID |
| `home page (22\|23\|24\|25\|27\|42).png` | `/owner/calendar` overlay artboards | List-day is overlay-friendly restatement of Today — **not** the closed default |
| `home page (29\|32\|38).png` | Owner **More** sheet on calendar | CRM / equipments / support / workers; coaches+packages shown but OUT OF MVP |
| `home page (17).png` | Free-slot **action menu** sheet | رزرو حضوری / مسدود / یادداشت |
| `home page (10\|18).png` | Walk-in **reserve** desk sheet | Coach radio + recurring checkbox = OUT OF MVP UI in Canva |
| `home page (20).png` | **Note** desk sheet | — |
| `home page (21).png` | **Block** desk sheet | Daily/weekly/season steppers = OUT OF MVP |
| `home page (11).png` | Owner recurring / continue-book sheet | **OUT OF MVP** (season/package gated) |
| `home page (12\|19).png` | Owner desk confirm (**pay link / cash**) | Not athlete `(4)` |
| `home page (14\|22).png` | Booking **detail** desk sheet | Cancel + add note |
| `home page (15\|16).png` | Multi-cancel / cancel+wallet sheets | Owner desk |
| `changed.png` | `/owner/calendar` overview tab | Designer-marked |
| `home page (26).png` | `/owner/finance` | Photo hero + chart |
| `جزییات بازیکن.png` | `/owner/finance` txn sheet | — |
| `گزارش پیشرفته.png` | `/owner/finance/report` | — |
| `home page (28).png` | `/owner/crm` | Open-safe for Behnaz |
| `کمپین پیامکی جدید*.png` | CRM SMS wizard sheet | Optional; not launch-required |
| `افزودن زمین.png` | `/owner/settings` + court form sheet | Settings chrome in background |
| `home page (30).png` | `/owner/equipments` | Amenities + rental/sell/services |
| `home page (31).png` | Equipments **edit** sheet | — |
| More → پشتیبانی `(38)` | `/owner/support` | No dedicated full-page Canva ops guide in this export |

### Routing notes (Behnaz MVP freeze)

- **Primary court book UX** = `/clubs/[slug]` + confirm sheet (`(3)` / `(4)`). Do not send athletes through a standalone book page.
- **Legacy** `/book/court/:slug` → replace-redirect to `/clubs/:slug` (preserves `date` / `slot` / `court` query).
- **Athlete booking detail** `/athlete/bookings/[id]` → `/athlete/bookings?booking=` (list is primary).
- **Coach / package / Google / EN**: **OUT OF MVP** for Behnaz — `PILOT_NO_COACH=true`, recurring APIs `403`, Google UI hard-off, `defaultLocale: fa`.
- **Owner Today** = multi-court GRID (`(9)`): time rows × court columns, FABs, date chevrons. Overview tab = `changed.png`. List-day `(22+)` documents overlay states, not closed Today.

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
| `login_sign up` / `4` | AuthFlow | **ok-enough** | Athlete / Owner for Behnaz; no Google in product |
| `(8)` / `(5)` / `(7)` | athlete | **ok-enough** | Hub + bookings; wallet/profile via hub |
| `(9)` GRID | owner calendar Today | **blocker if list-day** | Closed Today is multi-court grid; list-day is overlay artboard only |
| `(22+)` + sheets | owner calendar overlays | **visual** | Detail / 3-action / More sit on list-day crops |
| `(11)` recurring | owner sheet | **out of MVP** | Season/package gated — soft-land |
| `(12\|19)` owner pay sheet | owner desk | **in MVP** | Cash / pay-link desk flow — not athlete `(4)` |
| `(30)` / `(31)` | equipments | **ok-enough** | Was mislabeled `(20)/(21)` in older notes |

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
2. Keep Behnaz freeze: `PILOT_NO_COACH=true` (do not flip coach on for this pilot)
3. Owner desk pay sheets `(12|19)` polish if needed
4. Refresh stale Canva comments in Vue files (`(20)/(21)` equipments → `(30)/(31)`)

## How to re-compare cheaply

```bash
# regenerate overlays after UI changes
open canva-reference/comparisons/overlays/
```

Do **not** open all 66 full PNGs in chat — use contact sheets + one overlay per task.
