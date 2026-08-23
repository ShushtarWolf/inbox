# Kavenegar setup (inbox)

Live SMS wording comes from the **panel template**, not from the app. Do **not** edit a template that is already **عملیاتی** — create a new one, wait for approval, then change the Liara env name.

## 1) OTP + password-reset (approved: `inbox-verify-autofill`)

**Panel template name:** `inbox-verify-autofill`  
**Body:**

```
code: %token%
کد تایید اینباکس
@inboxs.ir #%token2%
```

**Liara env:**

```bash
SMS_ENABLED=true
SMS_PROVIDER=kavenegar
KAVENEGAR_API_KEY=<from Developers / API key>
KAVENEGAR_TEMPLATE=inbox-verify-autofill
```

Redeploy / restart after changing env.

Covers: login OTP, register OTP, forgot-password OTP. App sends the same 6-digit code as `token` and `token2`.

**Test:** request login OTP on iPhone Safari and Android Chrome — autofill should offer the code.

---

## 2) Booking / owner / admin / CRM (separate templates — one scenario each)

Kavenegar rejected a single generic `inbox-notify` template. Create **one approved template per scenario** (see product/agent checklist). App code must map each message type to its panel template name + tokens.

Until those are approved and wired in code, only OTP delivers live.

---

## 3) Optional — tappable pay link

Template e.g. `inbox-pay` with body including `https://inboxs.ir/p/%token%`  
Liara: `KAVENEGAR_TEMPLATE_PAY_LINK=inbox-pay`

---

## Confirm

```bash
npm run sms:status
```

Admin UI: `/admin/sms`

Expect `resolvedProvider: "live"` and `smsPhase: "MULTI"` when OTP template + key + `SMS_ENABLED` are set.
