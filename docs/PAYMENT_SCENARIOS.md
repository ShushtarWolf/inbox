# سناریوهای پولی — فهرست کامل از روی کد

این سند برای تست زنده (مثلاً حساب Siaamak، رزروهای ارزان ~۵٬۰۰۰ تومان) آماده شده است. **فقط ترکیب‌هایی که کد اجازه می‌دهد** فهرست شده‌اند. مرجع جزئیات عملیاتی: [PAYMENTS.md](./PAYMENTS.md)، [MONEY_GUARDRAILS.md](./MONEY_GUARDRAILS.md).

## راهنمای جدول

| ستون | معنی |
|------|------|
| **نوع رزرو** | تک اسلات، چند زمین، فصل/سری، مربی، پکیج، مسابقه، میز کار/لینک |
| **روش پرداخت** | کیف پول (`PAID`)، درگاه (`IPG`)، ترکیبی، نقد میز (`CASH`)، رایگان/۰، `PAY_AT_CLUB` ورزشکار |
| **تخفیف** | کد، عضویت، میز (درصد/رایگان)، جلسه تخفیف‌خورده داخل سری |
| **اقدام** | رزرو، پرداخت، لغو، جابجایی، … |
| **نتیجه پولی** | کیف ورزشکار، دفتر کل باشگاه/مربی، کانال بازپرداخت |
| **مسیر کد** | فایل‌های اصلی |
| **تست واحد** | پوشش در `*.test.ts` / `money.it.ts` (بله/جزئی/خیر) |
| **ریسک** | بالا / متوسط / پایین برای تولید |

**یادداشت‌های سراسری**

- لغو عادی **کارت را ریورس نمی‌کند**؛ سهم بازپرداخت → `REFUND_CREDIT` کیف ورزشکار + `SETTLEMENT_CLAWBACK` باشگاه/مربی (`server/utils/refunds.ts`).
- نقد میز → بازپرداخت ورزشکار ندارد؛ `deskCashReturn=owed` تا تأیید مالک (`POST /api/owner/payments/:id/ack-cash-return`).
- مهمان لینک پرداخت بدون `userId` → `manualBankRefund=owed` تا ادمین (`POST /api/admin/payments/:id/ack-manual-refund`).
- **عدم حضور (`noShowAt`)** فقط CRM/آمار است؛ در کد فعلی **جابه‌جایی پول خودکار ندارد** (`server/api/owner/finance.get.ts`).
- **تقویم خارجی (AloPlay / …)** فقط مانع رزرو است؛ پول فقط بعد از رزرو موفق اینباکس (`server/utils/externalBookingGuard.ts`).

---

## جدول سناریوها (شماره‌گذاری شده)

### A — رزرو تک اسلات زمین (ورزشکار / پلتفرم)

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| A01 | رزرو آنلاین → درگاه تمام مبلغ | تک اسلات | IPG | — | پرداخت SEP | ورزشکار: بدهکار موقت سپس `IPG_BOOKING_*` بدون افزایش موجودی؛ باشگاه: تسویه قفل‌دار | `bookings/court.post.ts`, `payments/checkout.post.ts`, `paymentSync.ts`, `settlement.ts` | جزئی (`paymentSync.*.test.ts`) | بالا |
| A02 | رزرو → کیف پول کامل | تک | Wallet `PAID` | — | checkout `useWallet: full` | `PAYMENT_DEBIT` ورزشکار؛ تسویه باشگاه | `checkout.post.ts`, `wallet.ts` | جزئی (`checkout.splitPay.test.ts`) | بالا |
| A03 | رزرو → ترکیب کیف + درگاه | تک | Split | — | `useWallet: partial` | بخش کیف قفل + بقیه IPG؛ در `PAID` مبلغ به کل قیمت | `splitPay.ts`, `splitPayWallet.ts`, `checkout.post.ts` | بله (`splitPay.test.ts`) | **بالا** |
| A04 | درگاه NOK / شکست | تک | IPG | — | callback ناموفق | `FAILED`؛ بدون تسویه؛ کیف split آزاد | `paymentFailure.ts`, `payments/callback/*` | بله (`paymentFailure.test.ts`) | بالا |
| A05 | شکست → پرداخت مجدد | تک | IPG | — | retry checkout | ردیف قبلی `SUPERSEDED`؛ intent جدید | `paymentSupersede.ts` | بله | بالا |
| A06 | `PAYMENT_VERIFY_PENDING` هنگام retry | تک | IPG | — | retry حین verify | 409؛ بدون دو بار پرداخت | `paymentSupersede.ts`, `checkout.post.ts` | جزئی | **بالا** |
| A07 | callback دیر هنگام `FAILED` | تک | IPG | — | پرداخت پس از decline | در صورت تطابق ResNum/مبلغ → `PAID`؛ جمع‌آوری مجدد split | `paymentSync.latePay.test.ts` | بله | **بالا** |
| A08 | callback تکراری OK | تک | IPG | — | دوبار OK | یک `PAID` idempotent | `payments/sepClient`, `paymentCallback.test.ts` | بله | متوسط |
| A09 | مبلغ ریال اشتباه در verify | تک | IPG | — | callback | reverse بانک؛ ردیف fail/reversePending | `sepClient.ts`, `refunds.ts` | جزئی (`sepVerifyBind.test.ts`) | **بالا** |
| A10 | رزرو با کد تخفیف → IPG | تک | IPG | کد باشگاه/پلتفرم | book+pay | مبلغ Payment = بعد تخفیف؛ تسویه روی مبلغ پرداختی | `discountCodes.ts`, `court.post.ts` | جزئی (`discountCodes.test.ts`) | متوسط |
| A11 | تخفیف ۱۰۰٪ → checkout صفر | تک | ۰ | کد | wallet/IPG صفر | `confirmZeroAmountCheckout`؛ بدون SEP | `zeroAmountCheckout.ts` | بله | متوسط |
| A12 | `payAtClub` ورزشکار (باشگاه فعال) | تک | CASH `PAY_AT_CLUB` | — | book | بدون تسویه آنلاین؛ نقد در باشگاه | `athletePayAtClub.ts`, `court.post.ts` | بله (`court.athletePayAtClub.test.ts`) | متوسط |
| A13 | hold آنلاین ۱۵ دقیقه منقضی | تک | pending | — | عدم پرداخت | آزاد شدن اسلات؛ `FAILED`/expire | `onlinePaymentHold.ts` | بله | متوسط |
| A14 | تجهیزات اضافه روی primary | تک | IPG/wallet | — | book | قیمت primary شامل equipment | `bookingTotal.ts`, `court.post.ts` | جزئی (`bookingTotal.test.ts`) | پایین |
| A15 | اسلات مسدود تقویم خارجی | تک | — | — | book رد شود | بدون Payment | `externalBookingGuard.ts` | جزئی | پایین |

### B — چند اسلات در یک تراکنش (ورزشکار آنلاین)

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| B01 | دو+ زمین؛ یک checkout | multi | IPG primary + sibling 0 | روی primary | pay | یک capture؛ خواهرها `coveredBy` metadata | `court.post.ts`, `paymentSync.siblings.test.ts` | بله | **بالا** |
| B02 | لغو یک جلسه از گروه آنلاین | multi | IPG paid | — | athlete cancel یک sibling | pro-rata `sessionPrice` → کیف؛ clawback جزئی | `seriesCancelRefund.ts`, `owedCancelRefund.ts` | بله (`moneyCancelMatrix.test.ts`) | **بالا** |
| B03 | لغو آخرین جلسه گروه (residual) | multi | IPG | — | cancel last | باقیمانده primary نه فقط sessionPrice | `owedCancelRefund.ts` | بله | **بالا** |
| B04 | مالک لغو یک اسلات گروه IPG | multi | IPG | — | owner cancel | مسیر `cancelSeriesSessionWithSlot` نه `cancelCourtBooking` تنها | `owner/cancel.post.ts`, `cancel.money-path.test.ts` | بله | **بالا** |
| B05 | pay-at-club multi: هر خط مبلغ جدا | multi | CASH | تخفیف خطی | book | چند Payment CASH | `court.post.ts` | جزئی | متوسط |

### C — فصل / سری (owner desk + ورزشکار)

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| C01 | ایجاد فصل نقد پرداخت‌شده | season | CASH PAID | — | owner season | بدون credit کیف باشگاه؛ فقط گزارش | `owner/season.post.ts`, `settlement.ts` | جزئی | متوسط |
| C02 | فصل unpaid desk / IPG pending | season | PAY_AT_CLUB / pending | — | create | بدون تسویه تا PAID | `owner/season.post.ts` | جزئی | پایین |
| C03 | فصل رایگان / complimentary | season | CASH 0 | complimentary | create | amount 0 | `owner/season.post.ts`, `deskCharge.ts` | جزئی (`deskCharge.test.ts`) | پایین |
| C04 | فصل با تخفیف درصد روی کل | season | CASH/IPG | desk % | create | metadata discount روی primary | `seasonDiscount.test.ts` | بله | متوسط |
| C05 | mint سری بعدی (`series-payment`) | season | یک primary | — | owner | sibling amount 0 | `owner/series-payment.post.ts` | جزئی | متوسط |
| C06 | ورزشکار لغو یک جلسه فصل IPG | season session | IPG paid | — | athlete cancel | refund session share قبل FREE slot | `bookings/[id]/cancel.patch.ts`, `seriesCancelRefund.ts` | جزئی (`ownerSeriesCancel.test.ts`) | **بالا** |
| C07 | ورزشکار لغو داخل پنجره جزئی (bps باشگاه) | season/تک | paid | — | athlete cancel | `partial_wallet_refund` | `cancelPolicy.ts`, `refunds.ts` | بله (`cancelPolicy.test.ts`) | **بالا** |
| C08 | ورزشکار لغو داخل پنجره ۰٪ بازپرداخت | season/تک | paid | — | athlete cancel | `zero_refund`؛ باشگاه نگه می‌دارد + ensure settle | `refunds.ts` | جزئی | **بالا** |
| C09 | مالک لغو تک جلسه فصل | season | paid | — | owner cancel | ۱۰۰٪ refund policy | `owner/cancel.post.ts` | جزئی | متوسط |
| C10 | مالک لغو کل سری (`scope=series`) | season | paid | — | owner series | چند cancel + یک payment | `ownerSeriesCancel.ts` | بله | **بالا** |
| C11 | کوتاه کردن بازه فصل | season | paid | — | `season-range` | جلسات حذف‌شده wallet refund | `owner/season-range.post.ts` | جزئی | بالا |
| C12 | حذف کل season booking | season | paid | — | delete | `full_wallet_refund` | `owner/seasons/[id].delete.ts` | جزئی | بالا |
| C13 | تسویه فصل: unlock تدریجی جلسات | season | IPG | — | پس از هر کلاس | locked → available روز بعد | `seasonSettlementUnlock.test.ts` | بله | متوسط |

### D — میز کار (owner / coach desk)

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| D01 | رزرو مهمان نقد mark paid | desk تک | CASH PAID | — | `reserve.post` | بدون settlement باشگاه withdrawable | `owner/reserve.post.ts`, `settlement.ts` | جزئی (`deskPaidGuard.test.ts`) | متوسط |
| D02 | رزرو unpaid نقد | desk | PAY_AT_CLUB | — | reserve | till open | `owner/reserve.post.ts` | جزئی | پایین |
| D03 | تخفیف کد روی میز | desk | CASH | code | reserve | amount کاهش؛ metadata | `reserve.post.ts`, `discountCodes.ts` | جزئی | متوسط |
| D04 | رایگان میز | desk | CASH 0 | complimentary | reserve | comp metadata | `reserve.post.ts` | جزئی | پایین |
| D05 | re-save میز بدون ارسال discount → حفظ تخفیف | desk | CASH | carried | mark paid دوباره | amount تخفیف‌خورده حفظ | `reserve.discountCarry.test.ts` | بله | متوسط |
| D06 | admin/owner discount بعد از پرداخت (IPG) | desk | IPG PAID | — | mark-unpaid | **409**؛ باید cancel | `reserve.post.ts`, `series-payment.post.ts` | جزئی (`deskPaidGuard`) | بالا |
| D07 | mark-unpaid فقط CASH با ledger | desk | CASH was PAID | — | mark unpaid | clawback اگر settlement بوده | `reserve.post.ts` | جزئی | متوسط |
| D08 | لینک پرداخت مهمان → IPG | desk/guest | IPG | — | pay link + callback | PAID؛ settle؛ بدون user → manual refund on cancel | `receipts/*`, `PAYMENTS.md` | جزئی (`manualBankRefund.test.ts`) | **بالا** |
| D09 | تأیید بازگشت نقد میز پس از لغو | desk | CASH refunded | — | owner ack | `deskCashReturn` cleared | `deskCashReturn.ts` | بله | متوسط |
| D10 | BLOCKED / desk hold | desk | — | — | hold slot | amount 0 در finance | `deskHoldBooking.ts` | جزئی | پایین |

### E — جلسه مربی (coach session)

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| E01 | ورزشکار حق‌الملاک مربی IPG | coach | IPG | — | pay | تسویه **کیف مربی** (locked) | `checkout.post.ts`, `settlement.ts` | بله (`settlement.coach.test.ts`) | بالا |
| E02 | حق‌الملاک از کیف پول | coach | Wallet | — | pay | debit athlete؛ credit coach net | `wallet.ts`, `settlement.ts` | جزئی | بالا |
| E03 | پلتفرم `pay_at_club` برای staff | coach | CASH pending | — | coach book | `initialStaffPaymentFields` | `bookingPayment.ts`, `bookings/coach.post.ts` | جزئی | پایین |
| E04 | درس + زمین لینک: مربی زمین از کیف | coach+court | coach wallet court | — | coach lesson book | club 0 bps `coach-lesson-court` | `coachLessonBook.ts`, `settlement.coach.test.ts` | بله | **بالا** |
| E05 | لغو درس → لغو متقابل زمین | coach+court | paid both | — | cancel one side | دو refund در یک txn | `cancellations.ts` | بله (`cancellations.coach.test.ts`) | **بالا** |
| E06 | لغو ورزشکار درس (پنجره زمانی) | coach | paid | — | cancel | همان `cancelPolicy` | `coach-sessions/[id]/cancel.patch.ts` | جزئی | متوسط |
| E07 | reschedule جلسه مربی | coach | paid | — | reschedule | بدون تغییر Payment (فقط slot/time) | `coach-sessions/[id]/reschedule.patch.ts` | خیر | پایین |

### F — پکیج (package booking)

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| F01 | خرید پکیج IPG/wallet | package | IPG/PAID | — | checkout | تسویه باشگاه؛ lock تا startDate | `checkout.post.ts`, `packages.expire.test.ts` | جزئی | متوسط |
| F02 | لغو پکیج ورزشکار | package | paid | — | cancel | `refundPaymentForCancellation` | `package-bookings/[id]/cancel.patch.ts` | جزئی | متوسط |
| F03 | لغو پکیج مالک/coach | package | paid | — | owner cancel | ۱۰۰٪ | `owner/packages/[id]/cancel.post.ts` | جزئی | متوسط |

### G — مسابقه (competition)

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| G01 | ثبت‌نام با حق ورودی IPG | competition | IPG | — | join+pay | تسویه باشگاه (commission) | `competitions/[id]/join.post.ts`, `settlement.competition.test.ts` | بله | متوسط |
| G02 | ثبت‌نام wallet / split | competition | PAID/split | — | checkout | همان مسیر court | `checkout.post.ts`, `competition.test.ts` | جزئی | بالا |
| G03 | حق ورودی ۰ | competition | ۰ | — | join | بدون Payment یا صفر | `join.post.ts` | جزئی | پایین |
| G04 | لغو ثبت‌نام / کنسل مسابقه | competition | paid | — | cancel entry | refund + clawback | `competitions/[id]/cancel-entry.post.ts` | جزئی (`competitions.test.ts`) | متوسط |
| G05 | جایزه (`ADJUSTMENT`) | competition | — | — | admin award | spendable؛ غیرقابل برداشت SHEBA | `PAYMENTS.md` | خیر | متوسط |

### H — لغو و بازپرداخت (مشترک)

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| H01 | لغو unpaid / pending | هر | NOT_PAID | — | cancel | بدون refund | `refunds.ts` | جزئی | پایین |
| H02 | لغو IPG paid کامل | هر | IPG | — | cancel | wallet credit + clawback | `refunds.ts`, `cancelRefund.ts` | بله (`cancelRefund*.test.ts`) | بالا |
| H03 | لغو wallet paid کامل | هر | PAID | — | cancel | باید کیف whole شود وگرنه txn fail | `refunds.ts` | جزئی | **بالا** |
| H04 | لغو split paid | هر | split | — | cancel | credit کل promoted amount | `splitPay.ts`, `refunds.ts` | بله | **بالا** |
| H05 | `reversePending` روی Payment | هر | IPG | — | cancel | **409 SEP_REVERSE_PENDING** | `refunds.ts`, `sepReverseWindow.ts` | بله | **بالا** |
| H06 | تاریخی `gatewayReversed` | هر | IPG | — | cancel | فقط restock rail کیف split | `cancelRefund.ts` | بله (`moneyCancelMatrix`) | **بالا** |
| H07 | لغو CASH paid | desk | CASH | — | cancel | REFUNDED؛ deskCashReturn owed | `refunds.ts` | بله (`financeDeskCash.test.ts`) | متوسط |
| H08 | لغو مالک/مربی همیشه ۱۰۰٪ | هر | paid | — | owner/coach cancel | refundBps=10000 | `cancelPolicy.ts` | بله | متوسط |
| H09 | retry refund پس از cancel موفق بدون credit | series | paid | — | cancel دوباره | idempotent session refund | `bookings/[id]/cancel.patch.ts` | جزئی | متوسط |
| H10 | cancel + refund یک transaction | هر | paid | — | cancel | slot FREE نشود اگر پول fail | `cancellations.ts` | جزئی (`money.it.ts`) | **بالا** |

### I — کیف پول / شارژ / برداشت

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| I01 | شارژ کیف IPG | topup | IPG | — | topup+callback | `TOPUP_CREDIT` | `wallet/topup`, `walletTopUp.test.ts` | بله | بالا |
| I02 | شارژ در `pay_at_club` mode | topup | — | — | topup | رد | `walletTopUp.ts` | بله | پایین |
| I03 | برداشت ورزشکار SHEBA | withdraw | — | — | request | available پس از hold 24h | `walletWithdraw.ts`, `athleteCashOut.test.ts` | بله | **بالا** |
| I04 | برداشت مالک باشگاه | withdraw | — | — | request | available/locked/debt ceiling | `club settlement`, `ownerWithdrawAmount.test.ts` | جزئی | **بالا** |
| I05 | برداشت مربی settlement | withdraw | — | — | request | rail coach | `walletWithdrawRail.test.ts` | بله | بالا |
| I06 | باشگاه `SUSPENDED` | withdraw | — | — | request | reject pending | `PAYMENTS.md` | خیر | متوسط |
| I07 | انتقال داخلی باشگاه↔مربی | transfer | — | — | POST transfers | فقط available | `walletTransfer.ts` | بله | پایین |

### J — callback / IPG edge

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| J01 | verify timeout → verifyPending | IPG | — | — | callback | PENDING؛ بدون آزاد split | `paymentSync.ts` | جزئی | **بالا** |
| J02 | owner_mismatch booking vs payer | IPG | — | — | callback OK | PAID بدون wallet rows | `PAYMENTS.md`, `paymentSync.ts` | جزئی | **بالا** |
| J03 | guest no_account | IPG | — | — | callback | walletFirstStatus | `paymentSync.ts` | جزئی | بالا |
| J04 | SUPSERSEDED callback دیر | IPG | — | — | callback | verify fail / auto-reverse SEP | `PAYMENTS.md` | جزئی | بالا |
| J05 | webhook (optional secret) | IPG | — | — | webhook | same confirm path | `payments/webhook/*` | جزئی | متوسط |
| J06 | admin expire pending | IPG | — | — | cron expire | FAILED + metadata.expired | `online-payment-hold.ts` | جزئی | متوسط |

### K — ادمین / اصلاح دستی

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| K01 | ack manual bank refund مهمان | guest IPG | — | — | admin ack | clear manualBankRefund | `admin/payments/*` | جزئی | متوسط |
| K02 | resolve reverse pending | IPG | — | — | admin POST | سپس cancel مجاز | `admin/payments/resolve-reverse-pending` | جزئی | **بالا** |
| K03 | money jobs worker SETTLE/TOPUP | — | — | — | cron | idempotent ledger/credit | `moneyJobs.ts`, `money.it.ts` | بله | بالا |
| K04 | ADJUSTMENT reviewed (series over-credit) | repair | — | — | admin apply | اصلاح دستی | `admin/money-audit/*` | جزئی | **بالا** |
| K05 | mark withdraw paid dual-control live | withdraw | — | — | admin + header | payout manual | `adminPayoutConfirm.test.ts` | بله | بالا |
| K06 | تغییر کمیسیون باشگاه / پلتفرم | — | — | — | admin patch | فقط پرداخت‌های بعدی | `platformCommission.ts` | جزئی | متوسط |

### L — جابجایی (reschedule)

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| L01 | جابجایی زمین در پنجره | تک | paid | — | reschedule | Payment بدون تغییر | `bookings/[id]/reschedule.patch.ts` | خیر | پایین |
| L02 | جابجایی خارج پنجره | تک | paid | — | reschedule | 403/400 | همان | خیر | پایین |

### M — حالت‌های PAYMENTS_MODE

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| M01 | `pay_at_club` ورزشکار self-serve book | تک | — | — | court.post | `ONLINE_PAYMENTS_REQUIRED` | `requireOnlinePayments.ts` | جزئی | پایین |
| M02 | test-gateway simulate OK/NOK | تک | test IPG | — | pay | PAID / FAILED | `payments/test-gateway` | manual | متوسط |
| M03 | live SEP با terminal | تک | live IPG | — | pay | verify 0/2 | `payments/sepClient.ts` | جزئی | **بالا** |

### N — مسیرهای تکمیلی (همان محورها، شاخه‌های کد)

| # | سناریو | نوع | پرداخت | تخفیف | اقدام | نتیجه پولی | مسیر کد | تست | ریسک |
|---|--------|-----|--------|-------|--------|------------|---------|-----|------|
| N01 | IPG تأیید‌شده ورزشکار لاگین: جفت CREDIT/DEBIT | تک | IPG | — | callback OK | موجودی خرج‌کردنی تغییر نکند | `walletFirstIpg.ts`, `paymentSync.ts` | جزئی (`walletFirstHistorical.test.ts`) | بالا |
| N02 | سقف ۳ رزرو `pay_at_club` باز همزمان | تک | PAY_AT_CLUB | — | book چهارم | `ATHLETE_PAY_AT_CLUB_LIMIT` | `athletePayAtClub.ts`, `assertAthletePayAtClubUnderLimit` | جزئی | پایین |
| N03 | رزرو تکراری owner (`package-reserve`) | recurring | CASH/IPG | — | owner | payment fields از `resolveRecurringPayment` | `owner/package-reserve.post.ts`, `recurringReserve.test.ts` | جزئی | متوسط |
| N04 | تخفیف عضویت (`discountMembership`) در book ورزشکار | تک | IPG | membership | book | `resolveDiscountForBooking` | `discountMemberships`, `discountCodes.ts` | جزئی (`discountMembership.test.ts`) | متوسط |
| N05 | split: آزاد شدن کیف قبل از PAID | تک | split | — | supersede/fail | `walletDebitReleased`؛ recollect یا reverse card | `splitPayWallet.ts`, `PAYMENTS.md` §split | جزئی | **بالا** |
| N06 | clawback جزئی با کمیسیون پلتفرم | هر | paid | — | partial cancel | payee فقط `ownerNet` سهم | `settlement.ts`, `splitSettlement` | جزئی (`settlement.test.ts`) | بالا |
| N07 | receipt/token checkout برای مهمان | guest | IPG | — | `receipts/.../checkout` | همان pipeline checkout | `receipts/[token]/checkout.post.ts` | خیر | متوسط |
| N08 | بازپرداخت کارمزد past class (admin repair) | repair | — | — | correct-zero-past-commission | ADJUSTMENT ledger + wallet | `admin/money-audit/correct-zero-past-commission.post.ts` | جزئی | متوسط |

---

**جمع سناریوهای جدول:** **100** (بخش‌های A–N)

---

## چک‌لیست تست زنده (اولویت‌دار)

پیشنهاد: باشگاه با کمیسیون و `insideWindowRefundBps` مشخص؛ قیمت اسلات ~۵٬۰۰۰ تومان؛ OTP روی خط Siaamak.

### فاز ۱ — حداکثر ریسک / کم‌هزینه (حدود ۱ ساعت)

1. **A03** — split pay: کیف کم + درگاه برای ~۵k.
2. **A01 + H02** — IPG تک اسلات؛ لغو ورزشکار خارج پنجره؛ تأیید `REFUND_CREDIT` و موجودی قابل برداشت پس از 24h.
3. **B02** — دو اسلات ارزان؛ پرداخت یکجا؛ لغو یکی؛ مبلغ refund = سهم `sessionPrice`.
4. **C07** — لغو داخل پنجره با `insideWindowRefundBps=5000` (نیاز تنظیم موقت باشگاه).
5. **A04–A05** — NOK test-gateway سپس retry موفق.
6. **D08** — لینک پرداخت مهمان (بدون لاگین)؛ پرداخت؛ لغو مالک؛ صف manual refund ادمین.
7. **I01 + A02** — شارژ کوچک کیف؛ رزرو کامل از کیف.
8. **E04 + E05** — درس مربی با زمین (در صورت دسترسی coach)؛ لغو یک طرف.

### فاز ۲ — سری و میز (حدود ۴۵ دقیقه)

9. **C06** — فصل ۳ جلسه ارزان desk/IPG؛ لغو وسط توسط ورزشکار.
10. **D01 + H07** — میز نقد mark paid؛ لغو؛ `deskCashReturn` و ack مالک.
11. **D05** — تخفیف میز؛ mark paid دوباره؛ مبلغ ثابت.
12. **C10** — مالک cancel series (۲ جلسه آینده).

### فاز ۳ — لبه‌ها و رگرسیون (اختیاری)

13. **A08** — دوبار باز کردن callback موفق (idempotent).
14. **A11** — کد ۱۰۰٪ (اگر موجود).
15. **G02** — مسابقه ارزان + wallet.
16. **J02** — عمداً mismatch (فقط در staging).
17. **I03** — درخواست برداشت کوچک پس از refund (بعد از 24h).
18. **L01** — reschedule بدون تغییر مانده.

### داده‌های پیش از تست

- [ ] `GET /api/admin/payments-status` — mode و `liveReady`
- [ ] موجودی اولیه کیف و دفتر باشگاه در finance
- [ ] اسکرین‌شات `/athlete/payments` و `/athlete/wallet` بعد از هر فاز

---

## ده سناریوی پرریسک **بدون** پوشش e2e / integration کامل

| رتبه | # | چرا پرریسک | پوشش تست فعلی |
|------|---|------------|----------------|
| 1 | A06 | دو intent همزمان حین verify بانک | فقط واحد supersede |
| 2 | B04 | مالک cancel اشتباه مسیر سری → refund غلط | mock API test فقط |
| 3 | H05 | پول دوبار اگر cancel زیر reversePending | واحد sepReverse |
| 4 | J02 | PAID بدون credit کیف (owner mismatch) | بدون e2e |
| 5 | A09 | reverse مبلغ اشتباه زنده | عمدتاً واحد SEP |
| 6 | C08 | باشگاه ۰٪ داخل پنجره — ورزشکار بدون refund | سیاست واحد |
| 7 | D08 | manual bank مهمان + ack انسان | واحد manualBankRefund |
| 8 | H10 | FREE slot با refund fail | money.it جزئی |
| 9 | I04 | برداشت مالک با locked season + clawback | واحد محدود |
| 10 | K02 | ops resolve reversePending قبل cancel | بدون e2e |

---

## نمایه فایل‌های پولی (مرجع سریع)

| حوزه | فایل‌ها |
|------|---------|
| رزرو ورزشکار | `server/api/bookings/court.post.ts` |
| checkout | `server/api/payments/checkout.post.ts`, `shared/splitPay.ts` |
| callback SEP | `server/routes/payments/callback/sep.*`, `shared/paymentCallback.ts` |
| همگام‌سازی | `server/utils/paymentSync.ts`, `server/utils/paymentClaim.ts` |
| تسویه | `server/utils/settlement.ts` |
| لغو | `server/utils/cancellations.ts`, `server/utils/seriesCancelRefund.ts` |
| refund | `server/utils/refunds.ts`, `shared/cancelPolicy.ts`, `shared/owedCancelRefund.ts` |
| کیف | `server/utils/wallet.ts`, `server/api/wallet/topup*.ts` |
| میز | `server/api/owner/reserve.post.ts`, `server/api/owner/season.post.ts` |
| سیاست تست CI | `shared/moneyCancelMatrix.test.ts`, `server/utils/money.it.ts`, `npm run test:money` |

---

*آخرین هم‌ترازی با `main` — تولید شده برای QA زنده Siaamak؛ برای deploy یا تغییر production استفاده نشود.*