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
| `/owner/calendar-sources` | مالک باشگاه (همان session مالک) |
| `/admin/calendar-sources` | ادمین (`x-admin-secret`) — `clubSlug` در query/فرم |

این صفحات **منبع** را نشان می‌دهند: «الوپلی»، «الوورزش»، «کورتیک» + **عنوان باشگاه در آن سایت** (از mapping). همپوشانی: «اینباکس + الوپلی».

## حذف کامل

```bash
rm -rf modules/inbox-external-calendar
```

- تنها ویرایش بیرون از پوشه: `nuxt.config.ts` (`existsSync`) + **قلاب اختیاری** `useExternalSuspectedSlots` و چند خط در `clubs/[slug].vue` که بدون ماژول no-op می‌شوند.
- تقویم مالک اصلی (`/owner/calendar`) و بقیهٔ اپ بدون ماژول مثل قبل build می‌شوند.

## mapping (`iust-tennis`)

| Source | Status |
|--------|--------|
| AloPlay | club **10887** (`/v1/PublicClub/GetAvailableTime`) |
| AloVarzesh | products **2796** (زمین ۱), **3335** (زمین ۲) — HTML timetable |
| Courtic | stub (`supported: false`) |

## تست

```bash
npx vitest run --config modules/inbox-external-calendar/vitest.config.ts
```

## محدودیت‌ها

- بدون migration / env جدید
- Courtic: stub
- AloPlay availability is club-level (not per-court) for the public time list
- polling ~۲۵ث؛ cache adapter ~۴۵ث
