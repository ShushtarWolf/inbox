# FA/EN i18n, RTL, and UX Audit Checklist

| Route | File | FA issues | EN issues | RTL issues | Code issues | Status |
|-------|------|-----------|-----------|------------|-------------|--------|
| `/` | `app/pages/index.vue` | uppercase on eyebrow | — | — | — | Fixed |
| `/login` | `app/pages/login.vue` | — | — | — | — | OK |
| `/register` | `app/pages/register.vue` | — | — | — | — | OK |
| `/forgot-password` | `app/pages/forgot-password.vue` | — | — | — | — | OK |
| `/reset-password` | `app/pages/reset-password.vue` | — | — | — | — | OK |
| `/privacy` | `app/pages/privacy.vue` | — | — | — | — | OK |
| `/terms` | `app/pages/terms.vue` | — | — | — | — | OK |
| `/clubs/apply` | `app/pages/clubs/apply.vue` | — | — | — | — | OK |
| `/owner/setup` | `app/pages/owner/setup.vue` | — | — | — | wizard | OK |
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
| `/owner` | `app/pages/owner/index.vue` | Jalali hint via AppDateInput | — | modal actions inline | all slot actions in modal | Fixed |
| `/owner/finance` | `app/pages/owner/finance.vue` | Persian digits on stats | — | week labels LTR | loading/error states | Fixed |
| `/owner/equipments` | `app/pages/owner/equipments.vue` | — | — | — | add/edit/delete all categories | Fixed |
| `/owner/packages` | `app/pages/owner/packages.vue` | — | — | — | club-scoped coaches, loading/error | Fixed |
| `/owner/crm` | `app/pages/owner/crm.vue` | delivered, VIP | delivered, VIP | datetime-local | loading/error states | Fixed |
| `/owner/coaches` | `app/pages/owner/coaches.vue` | StaffRole i18n | StaffRole i18n | session times | loading/error states | Fixed |
| `/owner/support` | `app/pages/owner/support.vue` | WhatsApp label | — | phone LTR | club cookie refresh | OK |
| `/owner/settings` | `app/pages/owner/settings.vue` | editable bilingual fields | — | hours/phone LTR | PATCH API + save states | Fixed |
| `/owner/reserve/season` | `app/pages/owner/reserve/season.vue` | — | — | — | redirects to /owner | Repurposed |
| `/owner/reserve/package` | `app/pages/owner/reserve/package.vue` | — | — | — | redirects to /owner | Repurposed |
| `layout` | `app/layouts/dashboard-owner.vue` | bilingual club names | — | club selector top-right in FA | cookie refresh | Fixed |
| `layout` | `app/layouts/default.vue` | — | — | — | — | OK |
| `layout` | `app/layouts/dashboard-athlete.vue` | — | — | — | — | OK |
| `layout` | `app/layouts/dashboard-coach.vue` | — | — | — | — | OK |
| `component` | `app/components/DashboardShell.vue` | — | — | RTL sidebar desktop override | escape on overlay | Fixed |
| `component` | `app/composables/useAuth.ts` | — | — | — | profile locale overriding URL | Fixed |
| `component` | `app/components/AppModal.vue` | — | — | centered modal | shared modal a11y | OK |
| `component` | `app/components/AppDateInput.vue` | Jalali formatted hint (fa-IR) | — | dir=ltr | used on owner calendar | Fixed |
| Popup | `owner/index.vue` slot menu | — | — | time bidi | season/package/equipment inline | Fixed |
| Popup | `athlete/bookings/index.vue` reschedule | native date | — | time bidi | modal a11y | Fixed |
| API | `server/api/owner/settings.patch.ts` | — | — | — | new editable settings endpoint | Added |
| API | `server/api/owner/equipments/[id].patch.ts` | — | — | — | rename equipment | Added |
| API | `server/api/owner/equipments/[id].delete.ts` | — | — | — | delete equipment | Added |

## Remaining known limitations

- **Jalali date picker**: FA mode uses native Gregorian `<input type="date">` with `dir="ltr"` and a formatted Jalali hint via `AppDateInput` / `formatDate` (fa-IR calendar). A dedicated Jalali picker library is deferred.
- **Season/package reserve**: Owner calendar modal submits to `/api/owner/season` and `/api/owner/package-reserve` with `slotId`, which calls `generateRecurringCourtSlots` to create up to 8 weeks of calendar slots and bookings. Verified in `scripts/smoke.mjs` and CI.
- **CRM SMS**: Log-only in MVP; no real SMS gateway.
- **Finance `bookingsToday` stat**: API returns total reservation count, not strictly "today" — label kept as generic "Bookings".
- **Server `slotStatusLabel()`** in `server/utils/slots.ts` duplicates `fa.json` keys but is only used server-side for non-UI paths; UI uses i18n exclusively.
- **PwaInstallBanner** `deferredPrompt` typed as `any` (browser BeforeInstallPromptEvent has no stable TS type).
