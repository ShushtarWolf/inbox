# FA/EN i18n, RTL, and UX Audit Checklist

| Route | File | FA issues | EN issues | RTL issues | Code issues | Status |
|-------|------|-----------|-----------|------------|-------------|--------|
| `/` | `app/pages/index.vue` | uppercase on eyebrow | — | — | — | Fixed |
| `/login` | `app/pages/login.vue` | — | — | — | — | OK |
| `/register` | `app/pages/register.vue` | — | — | — | — | OK |
| `/offline` | `app/pages/offline.vue` | — | — | — | — | OK |
| `/clubs` | `app/pages/clubs/index.vue` | English amenity labels | — | km suffix | hardcoded amenities | Fixed |
| `/clubs/[slug]` | `app/pages/clubs/[slug].vue` | — | — | — | — | OK |
| `/coaches` | `app/pages/coaches/index.vue` | English specialty labels | — | — | hardcoded specialties | Fixed |
| `/coaches/[id]` | `app/pages/coaches/[id].vue` | — | — | — | — | OK |
| `/book/court/[slug]` | `app/pages/book/court/[slug].vue` | UTC date, native date, `h` suffix | — | time range bidi | `any` catch | Fixed |
| `/book/coach/[id]` | `app/pages/book/coach/[id].vue` | UTC date, native date, `h` suffix | — | time in select | `any` catch | Fixed |
| `/athlete` | `app/pages/athlete/index.vue` | — | — | — | — | OK (has loading) |
| `/athlete/profile` | `app/pages/athlete/profile.vue` | — | — | — | — | OK |
| `/athlete/bookings` | `app/pages/athlete/bookings/index.vue` | UTC date, modal UX | — | time bidi | `any` types | Fixed |
| `/athlete/bookings/[id]` | `app/pages/athlete/bookings/[id].vue` | UTC date, `h` suffix | — | IDs/times | — | Fixed |
| `/athlete/bookings/coach/[id]` | `app/pages/athlete/bookings/coach/[id].vue` | UTC date, `h` suffix | — | time select | — | Fixed |
| `/coach` | `app/pages/coach/index.vue` | — | — | — | — | OK |
| `/coach/schedule` | `app/pages/coach/schedule.vue` | — | — | — | — | OK |
| `/coach/clients` | `app/pages/coach/clients.vue` | — | — | — | — | OK |
| `/coach/profile` | `app/pages/coach/profile.vue` | — | — | — | — | OK |
| `/owner` | `app/pages/owner/index.vue` | hardcoded EN, shape key, uppercase | hardcoded EN | time bidi, uppercase CSS | `any`, UTC date | Fixed |
| `/owner/finance` | `app/pages/owner/finance.vue` | — | — | — | club cookie refresh | Fixed |
| `/owner/equipments` | `app/pages/owner/equipments.vue` | — | — | — | club cookie refresh | Fixed |
| `/owner/packages` | `app/pages/owner/packages.vue` | — | — | — | club cookie refresh | Fixed |
| `/owner/crm` | `app/pages/owner/crm.vue` | delivered, VIP | delivered, VIP | datetime-local | club cookie refresh | Fixed |
| `/owner/coaches` | `app/pages/owner/coaches.vue` | — | — | session times | club cookie refresh | Fixed |
| `/owner/support` | `app/pages/owner/support.vue` | WhatsApp label | — | phone LTR | club cookie refresh | Fixed |
| `/owner/settings` | `app/pages/owner/settings.vue` | bilingual names, WhatsApp | — | hours/phone LTR | club cookie refresh | Fixed |
| `/owner/reserve/season` | `app/pages/owner/reserve/season.vue` | shape in title (locale) | shape in title | — | — | Fixed (locale keys) |
| `/owner/reserve/package` | `app/pages/owner/reserve/package.vue` | — | — | — | — | OK |
| `layout` | `app/layouts/dashboard-owner.vue` | bilingual club names | — | — | cookie refresh | Fixed |
| `layout` | `app/layouts/default.vue` | — | — | — | — | OK |
| `layout` | `app/layouts/dashboard-athlete.vue` | — | — | — | — | OK |
| `layout` | `app/layouts/dashboard-coach.vue` | — | — | — | — | OK |
| `component` | `app/components/DashboardShell.vue` | — | — | RTL sidebar desktop override | escape on overlay | Fixed |
| `component` | `app/composables/useAuth.ts` | — | — | — | profile locale overriding URL | Fixed |
| `component` | `app/pages/clubs/index.vue` | city labels, amenity cards, km | city labels | — | hardcoded km/amenities | Fixed |
| `component` | `app/pages/coaches/index.vue` | city/specialty labels | city/specialty labels | — | hardcoded cities/specialties | Fixed |
| `component` | `app/pages/owner/crm.vue` | segment/status labels | segment/status labels | phone/datetime LTR | English API strings | Fixed |
| `component` | `app/pages/owner/coaches.vue` | role enum | role enum | phone LTR | raw role strings | Fixed |
| `component` | `app/pages/owner/settings.vue` | role enum | — | — | raw role string | Fixed |
| `component` | `app/pages/owner/equipments.vue` | new item name | — | — | hardcoded جدید | Fixed |
| `component` | `app/pages/owner/index.vue` | letter-spacing on FA | — | — | tracking on eyebrow/day | Fixed |
| `component` | `app/pages/login.vue` | — | — | — | manual /en/register path | Fixed |
| `component` | `app/components/LocaleSwitcher.vue` | hardcoded EN | — | — | — | Fixed |
| `component` | `app/components/AppModal.vue` | — | — | centered modal | new shared component | Added |
| `component` | `app/components/AppDateInput.vue` | Gregorian picker | — | dir=ltr | new shared component | Added |
| Popup | `owner/index.vue` slot menu | — | — | time bidi | modal a11y | Fixed |
| Popup | `athlete/bookings/index.vue` reschedule | native date | — | time bidi | modal a11y | Fixed |
| Popup | `clubs/index.vue` filters/map | amenity labels | — | — | inline panels OK | Fixed |
| Popup | `coaches/index.vue` filters | specialty labels | — | — | inline panel OK | Fixed |
| Popup | `DashboardShell.vue` sidebar | — | — | RTL sidebar | escape key | Fixed |

## Remaining known limitations

- **Jalali date picker**: FA mode still uses native Gregorian `<input type="date">` with `dir="ltr"` and a formatted Jalali/Gregorian hint via `AppDateInput`. A true Jalali picker is deferred.
- **Server `slotStatusLabel()`** in `server/utils/slots.ts` duplicates `fa.json` keys but is only used server-side for non-UI paths; UI uses i18n exclusively.
- **PwaInstallBanner** `deferredPrompt` typed as `any` (browser BeforeInstallPromptEvent has no stable TS type).
