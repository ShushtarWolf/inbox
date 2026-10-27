# HTML ↔ Live inventory

- **SoT file:** `design-reference/sot/inbox-all-pages.html`
- **SHA256:** `d7af0cd363542cbeabf46cef9dd3365395fa6d6c32d5e4057181cbffe6cf3dc2`
- **Placed:** 2026-10-26 (owner attachment; supersedes older incomplete HTML)
- **Do not** use GitHub HTML dumps as SoT for this pass.

## Route map (HTML id → suggested live route)

| Group | HTML id (`pg-…` / go id) | Live route (hypothesis) | Notes |
|---|---|---|---|
| عمومی | `home` — صفحه اصلی | `/` | |
| عمومی | `clubs` — باشگاه‌ها | `/clubs` | |
| عمومی | `club` — جزئیات باشگاه | `/clubs/[slug]` | |
| عمومی | `confirm` — تاییدیه رزرو | `confirm sheet on /clubs/[slug]` | |
| عمومی | `login` — ورود / ثبت‌نام | `AuthFlow gate` | |
| عمومی | `login-otp` — کد تایید | `AuthFlow OTP` | |
| عمومی | `clubs-apply` — ثبت نام مجموعه | `/clubs/apply or /apply` | |
| عمومی | `choose-role` — انتخاب نقش | `/choose-role` | |
| عمومی | `register` — ثبت‌نام (۳ نقش) | `/register` | |
| عمومی | `forgot-password` — فراموشی رمز | `forgot flow` | |
| عمومی | `reset-password` — رمز جدید | `reset flow` | |
| عمومی | `pay-link` — لینک پرداخت (رسید) | `/pay/[token] or receipt` | |
| عمومی | `offline` — آفلاین | `/offline` | |
| عمومی | `notfound` — ۴۰۴ | `/404` | |
| صفحه‌های حقوقی | `about` — درباره ما | `/about` | |
| صفحه‌های حقوقی | `contact` — تماس | `/contact` | |
| صفحه‌های حقوقی | `pricing` — قیمت‌ها | `/pricing` | |
| صفحه‌های حقوقی | `terms` — قوانین | `/terms` | |
| صفحه‌های حقوقی | `privacy` — حریم خصوصی | `/privacy` | |
| صفحه‌های حقوقی | `cancellation` — لغو و استرداد | `/cancellation` | |
| صفحه‌های حقوقی | `complaints` — ثبت شکایات | `/complaints` | |
| ورزشکار | `athlete-home` — خانه | `/athlete/home` | |
| ورزشکار | `athlete-bookings` — رزرو من | `/athlete/bookings` | |
| ورزشکار | `athlete-hub` — پروفایل | `/athlete` | |
| ورزشکار | `athlete-profile` — ویرایش پروفایل | `/athlete/profile` | |
| ورزشکار | `athlete-wallet` — کیف پول | `/athlete/wallet` | |
| ورزشکار | `athlete-payments` — پرداخت‌ها | `/athlete/payments` | |
| ورزشکار | `athlete-notifications` — اعلان‌ها | `/athlete/notifications` | |
| ورزشکار | `athlete-support` — پشتیبانی | `/athlete/support` | |
| ورزشکار | `athlete-coaches` — مربیان | `/athlete/coaches or /coaches` | |
| ورزشکار | `athlete-coach` — پروفایل مربی | `/coaches/[id]` | |
| ورزشکار | `book-coach` — رزرو مربی | `/book/coach/...` | |
| ورزشکار | `athlete-favorites` — علاقه‌مندی‌ها | `/athlete/favorites` | |
| ورزشکار | `athlete-competitions` — مسابقات من | `/athlete/competitions` | |
| ورزشکار | `competitions` — مسابقات | `/competitions` | |
| ورزشکار | `pay-gateway-test` — درگاه آزمایشی | `/pay/gateway-test` | |
| ورزشکار | `receipt-notfound` — رسید پیدا نشد | `receipt 404` | |
| فلوها | `mv` — جابه‌جایی رزرو | `move booking sheet` | flow:go('athlete-bookings');mvStart(1) |
| فلوها | `cn` — لغو رزرو | `cancel sheet` | flow:go('athlete-bookings');cnStart(1) |
| فلوها | `cn2` — لغو خارج از مهلت | `cancel late sheet` | flow:go('athlete-bookings');cnStart(4) |
| فلوها | `pay` — پرداخت (قبل از درگاه) | `pre-gateway pay` | flow:payStart(1) |
| فلوها | `pay-gateway` — درگاه بانک | `bank gateway mock` | flow:payStart(1);gwGo() |
| فلوها | `pay-ok` — پرداخت موفق | `pay success` | flow:payStart(1);payDone(true) |
| فلوها | `pay-fail` — پرداخت ناموفق | `pay fail` | flow:payStart(1);payDone(false,'bank') |
| مربی | `coach` — امروز | `/coach` | |
| مربی | `coach-schedule` — برنامه | `/coach/schedule` | |
| مربی | `coach-book` — رزرو | `/coach/book` | |
| مربی | `coach-students` — مشتریان | `/coach/students` | |
| مربی | `coach-packages` — پکیج‌ها | `/coach/packages` | |
| مربی | `coach-settings` — تنظیمات | `/coach/settings` | |
| مربی | `coach-profile` — پروفایل | `/coach/profile` | |
| مربی | `coach-pending` — در انتظار تایید | `/coach/pending` | |
| مربی | `apply` — درخواست مربی / مجموعه | `/apply` | |
| مدیر باشگاه | `owner-calendar` — تقویم | `/owner/calendar` | |
| مدیر باشگاه | `owner-finance` — مالی | `/owner/finance` | |
| مدیر باشگاه | `owner-finance-report` — گزارش پیشرفته | `/owner/finance/report` | |
| مدیر باشگاه | `owner-settings` — تنظیمات | `/owner/settings` | |
| مدیر باشگاه | `owner-crm` — CRM | `/owner/crm` | |
| مدیر باشگاه | `owner-equipment` — تجهیزات | `/owner/equipments` | |
| مدیر باشگاه | `owner-discount` — کد تخفیف | `/owner/discount` | |
| مدیر باشگاه | `owner-support` — پشتیبانی | `/owner/support` | |
| مدیر باشگاه | `owner-staff` — کارکنان | `/owner/staff` | |
| ادمین | `admin` — نمای کلی | `/admin` | |
| ادمین | `admin-calendar` — تقویم | `/admin/calendar` | |
| ادمین | `admin-tickets` — تیکت‌ها | `/admin/tickets` | |
| ادمین | `admin-withdrawals` — برداشت‌ها | `/admin/withdrawals` | |
| ادمین | `admin-clubs` — باشگاه‌ها | `/admin/clubs` | |
| ادمین | `admin-users` — کاربران | `/admin/users` | |
| ادمین | `admin-bookings` — رزروها | `/admin/bookings` | |
| ادمین | `admin-applications` — درخواست‌ها | `/admin/applications` | |
| ادمین | `admin-coach-applications` — درخواست‌های مربی | `/admin/coach-applications` | |
| ادمین | `admin-sms` — پیامک | `/admin/sms` | |
| ادمین | `admin-sentry` — Sentry | `/admin/sentry` | |
| ادمین | `admin-provision` — ایجاد مدیر | `/admin/provision` | |
| خارج از MVP اپ واقعی | `owner-season` — رزرو فصلی | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `owner-packages` — پکیج‌های مجموعه | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `owner-competitions` — مسابقات مالک | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `register-coach` — ثبت‌نام مربی | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `clubs-tehran-padel` — زمین پدل تهران (هاب) | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `clubs-tehran-tennis` — زمین تنیس تهران (هاب) | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `owner-crm-detail` — مشتری CRM | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `owner-pending` — مالک در انتظار تأیید | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `book-package` — پکیج (در دسترس نیست) | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `admin-club-detail` — جزئیات باشگاه (ادمین) | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `admin-calendar-sources` — منابع تقویم (ادمین) | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `owner-calendar-sources` — منابع تقویم | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `owner-reserve-package` — رزرو پکیج | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `owner-reserve-season` — رزرو فصلی (فرم) | `TBD — map in slice` | |
| خارج از MVP اپ واقعی | `owner-team` — مربیان و دسترسی | `TBD — map in slice` | |
| موبایل | `m-athlete` — اپ ورزشکار | `mobile shell athlete (m1)` | |
| موبایل | `m-club` — صفحه باشگاه (موبایل) | `mobile club (m7)` | |
| موبایل | `m-wallet` — کیف پول (موبایل) | `mobile wallet (m6)` | |
| موبایل | `m-coach` — اپ مربی | `mobile coach (m3)` | |
| موبایل | `m-owner` — اپ مالک | `mobile owner (m5)` | |
| موبایل | `m-coach-pending` — مربی — در انتظار تایید | `mobile coach pending (m4)` | |
| موبایل | `m-season` — صفحه فصل بازیکن | `mobile season (m2)` | |

## Suggested slice order

1. Public: home, clubs, club, confirm, legal pages
2. Auth: login, otp, choose-role, register, forgot/reset
3. Athlete: home, bookings, hub, profile, wallet, payments, support, coaches
4. Coach: today → schedule → students → settings → pending
5. Owner: calendar → finance/report → settings → crm/equipment/discount/support/staff
6. Pay flows: pay, gateway, ok/fail, pay-link
7. Admin: overview → tickets → withdrawals → clubs/users/bookings → apps → sms/sentry/provision
8. Mobile shells m1–m7
9. Modals/sheets family

## Hash verification

Attachment SHA256 matches repo SoT: `d7af0cd363542cbeabf46cef9dd3365395fa6d6c32d5e4057181cbffe6cf3dc2` (verified on place).
