# inbox-external-calendar (ماژول آزمایشی)

ماژول **جداشده** برای همپوشانی تقویم: اسلات‌های اینباکس + اشغال عمومی سایت‌های دیگر (فقط خواندن).

## دو مخاطب

### ورزشکار / عموم (`/clubs/:slug`)

- اگر اسلات **آزاد در اینباکس** باشد ولی در سایت دیگر اشغال به نظر برسد → حالت **زرد خط‌چین** با برچسب **«مشکوک به رزرو»** (فقط همین متن).
- **نام AloPlay / الوورزش / کورتیک یا نام باشگاه خارجی روی این تقویم نشان داده نمی‌شود.**
- اسلات **قابل انتخاب** می‌ماند (قفل سخت نیست).
- API عمومی: `GET /api/public/external-suspected?club=…&date=…` → `{ suspected: [{ slotId?, startTime, courtId, suspected: true }] }` — **بدون** شناسه پلتفرم.

### مالک / ادمین / مربی

| URL | نقش |
|-----|-----|
| `/owner/calendar` | تقویم اصلی مالک — اشغال الوپلی/الوورزش با **نام سایت** روی سلول‌های آزاد اینباکس |
| `/owner/calendar-sources` | نمای مرجع همپوشانی (همان داده) |
| `/admin/calendar-sources` | ادمین (`x-admin-secret`) — `clubSlug` در query/فرم |
| `/coach/book` | رزرو زمین مربی — سانس‌های اشغال در سایت دیگر با **نام سایت**، غیرقابل انتخاب |

API مربی: `GET /api/coach/calendar-sources?clubId=&date=` (COACH + لینک ACTIVE باشگاه).

تقویم اصلی مالک منبع را نشان می‌دهد: «الوپلی»، «الوورزش»، … (+ عنوان باشگاه در آن سایت در شیت جزئیات). ورزشکار همچنان فقط «مشکوک به رزرو» می‌بیند.

## حذف کامل

```bash
rm -rf modules/inbox-external-calendar
```

- تنها ویرایش بیرون از پوشه: `nuxt.config.ts` (`existsSync`) + **قلاب اختیاری** `useExternalSuspectedSlots` / `useOwnerExternalCalendarOverlay` / `useCoachExternalCalendarOverlay` و چند خط در `clubs/[slug].vue`، `owner/calendar.vue` و `coach/book.vue` که بدون ماژول no-op می‌شوند.
- تقویم مالک اصلی (`/owner/calendar`) بدون ماژول مثل قبل کار می‌کند؛ با ماژول، overlay منابع خارجی را با نام سایت نشان می‌دهد.

## mapping (`iust-tennis`)

| Source | Status |
|--------|--------|
| AloPlay | club **10887** — free slots from `/v1/PublicClub/GetAvailableTime` (`productId` + `fromTime`); genders **1+2** union |
| AloPlay courts | **56921** (زمین ۱), **317335** (زمین ۲), **112282** (زمین ۳ غیراستاندارد) |
| AloVarzesh | products **2796** (زمین ۱), **3335** (زمین ۲), **3336** (زمین ۳) — HTML timetable |
| Courtic | stub (`supported: false`) |

## تست

```bash
npx vitest run --config modules/inbox-external-calendar/vitest.config.ts
```

## AloPlay session

Public `GetAvailableTime` works **today-only** without login. When server credentials are set, the adapter uses a logged-in session for **whatever single date** the calendar request asks for (today or any future day). Without credentials, only today uses the public API; future dates degrade gracefully (empty overlay + adapter error).

Optional Liara env (never commit values):

| Variable | Description |
|----------|-------------|
| `ALOPLAY_MOBILE` or `NUXT_ALOPLAY_MOBILE` | Iranian mobile used for AloPlay password login |
| `ALOPLAY_PASSWORD` or `NUXT_ALOPLAY_PASSWORD` | Account password (SMS OTP not required when password is set) |
| `ALOPLAY_DIAL_CODE` or `NUXT_ALOPLAY_DIAL_CODE` | Optional; default `98` |

When unset, behavior is unchanged: public GetAvailableTime for today only; no crash. Passwords and tokens are never logged.

Login flow (from AloPlay Flutter client): `GET v1/User/IsExsist`, then `POST v1/Authentication` → `Authorization: Bearer {token}` on subsequent GETs. Session is cached ~30 minutes (or until token expiration); 401/403 triggers one re-login retry.

## محدودیت‌ها

- Courtic: stub
- AloPlay occupancy: slots **not** in GetAvailableTime for mapped `productId` are suspected occupied; `remainedCapacity` from GetByTime is ignored
- polling ~۲۵ث؛ cache adapter ~۴۵ث
