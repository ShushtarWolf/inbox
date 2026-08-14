# Behnaz MVP screen inventory (FA)

Court-booking pilot only. Source Canva: `canva-reference/pages/` (= `inbox-website-2026-08-12/raw/`, synced from `Downloads/inbox website (1)`). Frame ↔ route detail: [`canva-reference/MAP.md`](../canva-reference/MAP.md).

**Locale:** FA only. **Desktop + laptop:** required **yes** for every in-MVP row below (phone Canva is reference; product must work at laptop/desktop widths with the same jobs).

**Ops freeze (this inventory):** do not enable live SMS or live IPG from this doc — keep local/log SMS and `PAYMENTS_MODE=test` or `pay_at_club` until an explicit cutover.

---

## OUT OF MVP (explicit)

| Surface | Why / how gated |
|---------|-----------------|
| **Coach** product (`/coaches`, `/coach/*`, `/book/coach`, `/owner/coaches`, `/register/coach`, AuthFlow Coach role) | `PILOT_NO_COACH=true` + middleware / API / nav |
| **Season / package / recurring** (`/owner/packages`, `/owner/reserve/season|package`, calendar recurring sheets `(11)`, block/recurring steppers on `(21)`, package frames `(36\|37)`) | `isRecurringReserveEnabled() === false` → API `403`; openers gated |
| **Google** OAuth (shown on Canva `login_sign up.png`) | Product hard-off; leave `NUXT_OAUTH_GOOGLE_*` unset |
| **EN** product UI (`/en`, English chrome) | `defaultLocale: fa` + `/en` redirect |

Also not in this Behnaz inventory (even if frames/routes exist): athlete favorites `(6)`, athlete home marketing `(8)` as a separate launch gate, admin console, workers (optional OWNER-only), CRM SMS campaign wizard (optional on open-safe CRM).

---

## Public

| Screen | Canva filename(s) | App route | Overlays | Desktop+laptop |
|--------|-------------------|-----------|----------|----------------|
| Home | `home page.png`, `home page (2).png` | `/` | AuthFlow (from login CTA) | yes |
| Clubs list | `Court list.png` | `/clubs` | — | yes |
| Club detail | `home page (3).png` | `/clubs/[slug]` | Slot picker → confirm | yes |
| Booking confirm | `home page (4).png` | `/clubs/[slug]` (sheet) | `CourtBookingConfirmSheet` (پرداخت / wallet); may open AuthFlow if guest | yes |
| Auth gate | `login_sign up.png` | AuthFlow on `/` or `/login` | Gate sheet (ثبت نام / ورود). **Ignore Google button in Canva** | yes |
| Auth role | `4.png` | AuthFlow | Role picker — **Athlete / Owner** only under Behnaz freeze | yes |
| Auth login / register / OTP | `5.png`–`16.png` | AuthFlow | Phone OTP + register variants; coach variants frozen | yes |

---

## Athlete

| Screen | Canva filename(s) | App route | Overlays | Desktop+laptop |
|--------|-------------------|-----------|----------|----------------|
| Hub | `home page (5).png` | `/athlete` | — (menu → profile / payments / wallet / logout) | yes |
| Bookings | `home page (7).png` | `/athlete/bookings` | Cancel → `CanvaConfirmSheet`; rebook → `/clubs/[slug]?…` | yes |
| Cancel / rebook overlays | CTAs on `(7)`; confirm via product sheets (no separate athlete cancel PNG required) | `/athlete/bookings` | `CanvaConfirmSheet` (cancel); success/result sheets as implemented | yes |
| Wallet | **No dedicated Canva** — hub `(5)` → کیف پول / هزینه | `/athlete/wallet` | Top-up flash / payment return query | yes |
| Payments | **No dedicated Canva** — hub `(5)` → روش‌های پرداخت | `/athlete/payments` | Link out to wallet | yes |
| Profile | **No dedicated Canva** — hub `(5)` → ویرایش پروفایل | `/athlete/profile` | — | yes |

---

## Owner

| Screen | Canva filename(s) | App route | Overlays | Desktop+laptop |
|--------|-------------------|-----------|----------|----------------|
| Calendar Today (list-day) | `home page (22\|23\|24\|25\|27\|42).png`; overview `changed.png`; legacy multi-court ref `(9\|13)` | `/owner/calendar` | More sheet; desk sheets below | yes |
| Desk — free-slot menu | `home page (17).png` | `/owner/calendar` | رزرو حضوری / مسدود / یادداشت | yes |
| Desk — reserve (walk-in) | `home page (10\|18).png` | `/owner/calendar` | Reserve form sheet (hide coach + recurring for Behnaz) | yes |
| Desk — block | `home page (21).png` | `/owner/calendar` | Block sheet (recurring steppers OUT OF MVP) | yes |
| Desk — note | `home page (20).png` | `/owner/calendar` | Note sheet | yes |
| Desk — booking detail | `home page (14\|22).png` | `/owner/calendar` | Detail sheet (cancel / note) | yes |
| Desk — multi-cancel / wallet refund | `home page (15\|16).png` | `/owner/calendar` | Cancel sheets | yes |
| Desk — cash / pay-link confirm | `home page (12\|19).png` | `/owner/calendar` | Owner confirm (ارسال لینک پرداخت / پرداخت نقدی) — **not** athlete `(4)` | yes |
| More menu | `home page (29\|32\|38).png` | `/owner/calendar?more=1` | Grid: CRM, equipments, support, workers; **coaches + packages OUT** | yes |
| Finance | `home page (26).png` | `/owner/finance` | Txn sheet `جزییات بازیکن.png` | yes |
| Finance report | `گزارش پیشرفته.png` | `/owner/finance/report` | — | yes |
| Equipments | `home page (30).png` | `/owner/equipments` | Edit sheet `home page (31).png` | yes |
| Settings (+ add/edit court) | `افزودن زمین.png` (settings chrome + court sheet) | `/owner/settings` | Court details sheet | yes |
| Support | More entry `(38)` (and siblings `(29\|32)`); **no dedicated full-page Canva** in export | `/owner/support` | — | yes |
| CRM (open-safe) | `home page (28).png` | `/owner/crm` | Optional SMS wizard `کمپین پیامکی جدید*.png` (not launch-required) | yes |

---

## Quick route checklist

```
/                         public home
/clubs                    clubs list
/clubs/[slug]             club detail + confirm sheet
AuthFlow                  gate / role / OTP (no Google)
/athlete                  hub
/athlete/bookings         bookings + cancel/rebook
/athlete/wallet           wallet (in product)
/athlete/payments         payments (in product)
/athlete/profile          profile (in product)
/owner/calendar           Today + desk + More
/owner/finance            finance
/owner/finance/report     advanced report
/owner/equipments         equipments
/owner/settings           settings / courts
/owner/support            support
/owner/crm                CRM open-safe
```
