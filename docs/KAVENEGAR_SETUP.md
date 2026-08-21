# Kavenegar setup (inbox)

OTP can work while booking/owner/admin SMS stay silent. You need **two** Verify Lookup templates (plus optional pay-link). Live SMS wording always comes from the **panel template**, not from the app.

Do **not** edit a template that is already **عملیاتی** — editing sends it back to review and OTP stops. Create a **new** template, wait for approval, then change the Liara env name.

## 1) OTP + password-reset SMS (login / register / فراموشی رمز)

1. Open [panel.kavenegar.com](https://panel.kavenegar.com) → **اعتبارسنجی** / Verify Lookup templates.
2. Create a **new** template (example name: `inbox-verify-fa`).
3. Set body to exactly:

```
کد تایید اینباکس: %token%
@inboxs.ir #%token2%
```

4. Submit and wait until status is **عملیاتی** (not فنی / test-only).
5. In Liara (`inbox` app) set:

```bash
SMS_ENABLED=true
SMS_PROVIDER=kavenegar
KAVENEGAR_API_KEY=<from Developers / API key>
KAVENEGAR_TEMPLATE=inbox-verify-fa
```

6. Redeploy / restart the app.
7. Test: request login OTP and forgot-password OTP — phone should show Persian text, not `code: …`.

Password reset uses the **same** OTP template (`purpose=password_reset`). No email path.

## 2) Booking / owner / admin / CRM SMS (why only OTP works today)

These messages use a **second** template. Without it, sends soft-fail and bookings still succeed.

1. Create Verify Lookup template named **`inbox-notify`** (or any name you prefer).
2. Body must be **exactly**:

```
%token10%
```

3. Wait until **عملیاتی**.
4. In Liara set:

```bash
KAVENEGAR_TEMPLATE_NOTIFY=inbox-notify
```

5. Redeploy / restart.
6. Test: create a desk booking with guest mobile, or mark a booking paid — guest + owner + admin phones should get a short Persian digest.

Common errors:

| Panel / API message | Meaning | Fix |
|---|---|---|
| قالب یافت نشد | Template name missing or wrong | Match `KAVENEGAR_TEMPLATE_NOTIFY` to panel name |
| ساختار کد صحیح نمی‌باشد (431) | `token10` rules | Keep panel body only `%token10%`; app already strips punctuation |
| ارسال کننده نامعتبر / 412 | Free-text `sms/send` on service line | Use lookup templates; do not rely on `KAVENEGAR_SENDER` for booking SMS |
| فقط امکان ارسال پیام تست | Template still in test mode | Wait for **عملیاتی** |

## 3) Optional — tappable pay link SMS

`token10` cannot carry `https://…`. For a tappable pay URL:

1. Create template e.g. `inbox-pay`.
2. Body must include: `https://inboxs.ir/p/%token%`
3. Set Liara: `KAVENEGAR_TEMPLATE_PAY_LINK=inbox-pay`

Without this, unpaid bookings still get a pay **pin** SMS via `inbox-notify`.

## 4) Confirm

```bash
npm run sms:status
# or
curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" https://inboxs.ir/api/admin/sms-status
```

Expect `resolvedProvider: "live"` and `smsPhase: "MULTI"`. Admin UI: `/admin/sms` — check warnings about `inbox-notify`.

## Env summary

| Variable | Required for |
|---|---|
| `SMS_ENABLED=true` | Any live send |
| `SMS_PROVIDER=kavenegar` | Live gateway |
| `KAVENEGAR_API_KEY` | Live gateway |
| `KAVENEGAR_TEMPLATE` | OTP + password reset |
| `KAVENEGAR_TEMPLATE_NOTIFY` | Booking / owner / admin / CRM |
| `KAVENEGAR_TEMPLATE_PAY_LINK` | Optional tappable pay URL |
| `ADMIN_ALERT_PHONE` | Admin alerts (default `09124777927`) |
