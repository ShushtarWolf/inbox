# inbox-external-calendar (ماژول آزمایشی)

ماژول **جداشده** برای نمای همپوشانی تقویم مالک: اسلات‌های اینباکس + اشغال عمومی سایت‌های دیگر (فقط خواندن).

## حذف کامل

اگر این آزمایش موفق نبود، کل ماژول را پاک کنید — بقیهٔ اپ بدون تغییر کار می‌کند:

```bash
rm -rf modules/inbox-external-calendar
```

تنها ویرایش بیرون از این پوشه در `nuxt.config.ts` است: ثبت ماژول فقط وقتی پوشه وجود دارد (`existsSync`). با حذف پوشه، همان خط دیگر ماژول را لود نمی‌کند و build مثل قبل است.

**تقویم‌های موجود (`/owner/calendar`, `/clubs/:slug`, …) دست نخورده‌اند.**

## باز کردن بعد از deploy

- URL (مالک لاگین‌شده): **`https://inboxs.ir/owner/calendar-sources`**
- لوکال: **`http://localhost:3000/owner/calendar-sources`**
- لینکی در منوی owner اضافه نشده — فقط با URL.

## mapping

- نمونه: `mappings/iust-tennis.json` برای باشگاه `iust-tennis`
- `clubId` عددی AloPlay عمداً `null` است (TODO) تا clubId اشتباه اختراع نشود.
- باشگاه بدون mapping: صفحه فقط اینباکس را نشان می‌دهد + پیام «فقط برای باشگاه‌های چندسایته».

## تست واحد

```bash
npx vitest run modules/inbox-external-calendar/lib/merge.test.ts
```

(فایل تست داخل ماژول است؛ runner پیش‌فرض repo فقط `shared/` و `server/` را اسکن می‌کند.)

## محدودیت‌ها

- بدون migration / Prisma / env جدید
- AloVarzesh و Courtic: stub «پشتیبانی نمی‌شود»
- AloPlay: فقط GET عمومی `ws.aloplay.io`؛ cache ~۴۵ث، rate-limit داخلی
- polling صفحه: ~۲۵ث
