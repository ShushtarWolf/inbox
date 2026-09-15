# Kavenegar setup (inbox)

Live SMS wording for OTP comes from the **panel template**, not from the app. Do **not** edit a template that is already **عملیاتی** — create a new one, wait for approval, then change the Liara env name.

## Path A (prod) — non-OTP from dedicated line `9982007609`

OTP stays on Verify Lookup. Booking / owner / admin / CRM use free-text `sms/send` from your bought line.

**Liara env:**

```bash
SMS_ENABLED=true
SMS_PROVIDER=kavenegar
KAVENEGAR_API_KEY=<from Developers / API key>
KAVENEGAR_TEMPLATE=inbox-verify-autofill
KAVENEGAR_TEMPLATE_NOTIFY=off
KAVENEGAR_SENDER=9982007609
KAVENEGAR_TEMPLATE_PAY_LINK=payments
```

Unset nothing for pay-link — set `KAVENEGAR_TEMPLATE_PAY_LINK=payments` so desk «ارسال با پیامک اینباکس» works (Lookup; independent of Path A free-text notify).

Redeploy / restart after changing env. Kavenegar may append `لغو۱۱` on 998-line sends.

---

## 1) OTP + password-reset (approved: `inbox-verify-autofill`)

**Panel template name:** `inbox-verify-autofill`  
**Body:**

```
code: %token%
کد تایید اینباکس
@inboxs.ir #%token2%
```

**Liara env:** `KAVENEGAR_TEMPLATE=inbox-verify-autofill` (see Path A block above).

Covers: login OTP, register OTP, forgot-password OTP. App sends the same 6-digit code as `token` and `token2`.

**Test:** request login OTP on iPhone Safari and Android Chrome — autofill should offer the code.

---

## 2) Path B (optional) — booking via Verify Lookup

Only if you prefer Lookup instead of the dedicated line:

```bash
KAVENEGAR_TEMPLATE_NOTIFY=inbox-notify2
# omit or clear KAVENEGAR_SENDER for notify path
```

Panel template must include `%token%` (Kavenegar requirement) plus `%token10%` for the app body. App currently sends `token10` only for notify Lookup — may need a code tweak if `%token%` must be non-empty.

---

## 3) Tappable pay link (desk «ارسال با پیامک اینباکس»)

Template name: `payments`  
Body example:

```
لینک پرداخت اینباکس
https://inboxs.ir/p/%token%
```

Liara: `KAVENEGAR_TEMPLATE_PAY_LINK=payments`  
Works with Path A (`TEMPLATE_NOTIFY=off`) — pay-link uses Verify Lookup; other booking SMS use the 998 line.

---

## Confirm

```bash
npm run sms:status
```

Admin UI: `/admin/sms`

Expect `resolvedProvider: "live"` and `smsPhase: "MULTI"` when OTP template + key + `SMS_ENABLED` (+ sender on path A) are set.
