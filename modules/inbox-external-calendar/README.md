# inbox-external-calendar (ماژول آزمایشی)

ماژول **جداشده** برای همپوشانی تقویم: اسلات‌های اینباکس + اشغال عمومی سایت‌های دیگر (فقط خواندن).

## دو مخاطب

### ورزشکار / عموم (`/clubs/:slug`)

- اگر اسلات **آزاد در اینباکس** باشد ولی در سایت دیگر اشغال به نظر برسد → حالت **زرد خط‌چین** با برچسب **«مشکوک به رزرو»** (فقط همین متن).
- **نام AloPlay / الوورزش / کورتیک یا نام باشگاه خارجی روی این تقویم نشان داده نمی‌شود.**
- اسلات **قابل انتخاب** می‌ماند (قفل سخت نیست).
- API عمومی: `GET /api/public/external-suspected?club=…&date=…` → `{ suspected: [{ slotId?, startTime, courtId, suspected: true }] }` — **بدون** شناسه پلتفرم.

### مالک / ادمین

| URL | نقش |
|-----|-----|
| `/owner/calendar` | تقویم اصلی مالک — اشغال الوپلی/الوورزش با **نام سایت** روی سلول‌های آزاد اینباکس |
| `/owner/calendar-sources` | نمای مرجع همپوشانی (همان داده) |
| `/admin/calendar-sources` | ادمین (`x-admin-secret`) — `clubSlug` در query/فرم |

تقویم اصلی مالک منبع را نشان می‌دهد: «الوپلی»، «الوورزش»، … (+ عنوان باشگاه در آن سایت در شیت جزئیات). ورزشکار همچنان فقط «مشکوک به رزرو» می‌بیند.

## حذف کامل

```bash
rm -rf modules/inbox-external-calendar
```

- تنها ویرایش بیرون از پوشه: `nuxt.config.ts` (`existsSync`) + **قلاب اختیاری** `useExternalSuspectedSlots` / `useOwnerExternalCalendarOverlay` و چند خط در `clubs/[slug].vue` و `owner/calendar.vue` که بدون ماژول no-op می‌شوند.
- تقویم مالک اصلی (`/owner/calendar`) بدون ماژول مثل قبل کار می‌کند؛ با ماژول، overlay منابع خارجی را با نام سایت نشان می‌دهد.

## mapping (`iust-tennis`)

| Source | Status |
|--------|--------|
| AloPlay | club **10887** — per-court `productId` via `/v1/Product/GetByTime` (`remainedCapacity===0`); genders **1+2** union |
| AloPlay courts | **56921** (زمین ۱), **317335** (زمین ۲), **112282** (زمین ۳ غیراستاندارد) |
| AloVarzesh | products **2796** (زمین ۱), **3335** (زمین ۲), **3336** (زمین ۳) — HTML timetable |
| Courtic | stub (`supported: false`) |

## تست

```bash
npx vitest run --config modules/inbox-external-calendar/vitest.config.ts
```

## محدودیت‌ها

- بدون migration / env جدید
- Courtic: stub
- AloPlay occupancy is per-court from GetByTime; a court missing from an hour is unknown (not marked occupied)
- polling ~۲۵ث؛ cache adapter ~۴۵ث
