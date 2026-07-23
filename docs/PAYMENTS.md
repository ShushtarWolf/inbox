# Payments — inbox

## Why Zarinpal

We ship a **real Zarinpal** adapter (not a fake live stub). Reasons:

- Already the default `PAYMENT_PROVIDER` for `test` / `live` in `resolvePaymentProvider`
- Sandbox host + StartPay + verify codes `100` / `101` (idempotent re-verify)
- Fits the existing `server/utils/payments` registry (`createIntent` / `confirm` / `refund`)
- IDPay remains in the type union for a future adapter; not implemented here

**Do not** set `PAYMENTS_MODE=live` until merchant keys are verified in Zarinpal’s panel and the manual checklist below passes.

## Modes

| `PAYMENTS_MODE` | Behavior |
|-----------------|----------|
| `pay_at_club` | Legacy / desk-only. Online checkout hidden; bookings `PAY_AT_CLUB`. Still supported for walk-ins and if someone toggles back. Prefer migrating prod to `test` then `live`. |
| `test` (recommended locally) | Default provider **zarinpal**. Without `ZARINPAL_MERCHANT_ID`, checkout redirects to `/payments/test-gateway` (simulate OK/NOK). With merchant id, uses Zarinpal **sandbox** request/verify. |
| `live` | Real Zarinpal production API. Requires `ZARINPAL_MERCHANT_ID`. **Never** marks `PAID` without verify success (`100`/`101`). |

## Env vars

Local (no secrets):

```bash
PAYMENTS_MODE=test
# PAYMENT_PROVIDER=zarinpal   # default when mode is test|live
# PAYMENT_PROVIDER=log        # API-only; no redirect (unit/CI)
NUXT_PUBLIC_SITE_URL=http://localhost:3000
```

Liara **live** (set only after keys verified — never commit secrets):

| Variable | Required | Notes |
|----------|----------|-------|
| `PAYMENTS_MODE` | Yes | `live` (or `test` on Liara for sandbox). Runtime-synced to client; optional `NUXT_PUBLIC_PAYMENTS_MODE` mirror |
| `PAYMENT_PROVIDER` | No | defaults to `zarinpal` |
| `ZARINPAL_MERCHANT_ID` | Yes | Merchant UUID from Zarinpal panel |
| `ZARINPAL_ACCESS_TOKEN` | For gateway refunds | Personal access token (panel → sessions). Without it, cancel still credits **wallet** as safe fallback |
| `NUXT_PUBLIC_SITE_URL` | Yes | `https://inboxs.ir` (callback base) |

Callback URL registered with Zarinpal (or used as `callback_url` in request):

`https://inboxs.ir/payments/callback/zarinpal`

## Checkout flow (athlete court)

1. Athlete books court → `Payment` row `PENDING_ONLINE` (when mode is `test`/`live`)
2. Confirmation SMS still fires on create (`notifyBookingConfirmed`) — soft-fail independent of payment
3. Athlete taps **Pay online** → `POST /api/payments/checkout` → IPG redirect
4. Return: `GET /payments/callback/zarinpal?Authority=…&Status=OK|NOK`
5. `Status=OK` → provider `confirm` (verify) → `PAID` + parent sync + `notifyBookingPaid` (SMS soft-fail)
6. `Status=NOK` / verify failure → `FAILED` (never left `PAID` incorrectly). Double callback is idempotent (`101` / already `PAID`)

## Desk collection

Owner **Mark paid (cash)** remains for walk-ins (`pay_at_club` or unpaid desk rows). Public athlete flow offers online pay when `PAYMENTS_MODE` ≠ `pay_at_club`.

## Cancellation refunds

`refundPaymentForCancellation` (all cancel endpoints):

| Payment type | Refund path |
|--------------|-------------|
| IPG Zarinpal **live** + `ZARINPAL_ACCESS_TOKEN` | Gateway `refund()` → `REFUNDED` |
| IPG Zarinpal live **without** access token / gateway error | **Wallet credit** fallback for registered athlete |
| IPG test / simulated | Local `REFUNDED` (no real money) |
| Cash / wallet marked `PAID` | Wallet credit |
| Unpaid (`PAY_AT_CLUB` / `PENDING_ONLINE`) | No refund |

Cancel SMS still fires via `notifyBookingCancelled` (soft-fail).

## Webhooks

`POST /api/payments/webhook/[provider]` — optional; browser callback is the primary path for Zarinpal. Idempotent confirm + parent sync.

## `pay_at_club` migration note

`pay_at_club` is **not** removed. Toggling back hides online CTA and keeps desk mark-paid. Historical IPG rows still resolve their stored `provider` on refund/callback even if mode is `pay_at_club`.

## Manual verify before live (Liara)

Do **not** set `PAYMENTS_MODE=live` until all pass:

- [ ] Sandbox or test-gateway: book → pay → `PAID`
- [ ] Cancel / NOK → booking **not** `PAID`
- [ ] Double-hit callback (same Authority) → still one `PAID`, no error storm
- [ ] Cancel paid online → gateway refund **or** wallet fallback per env
- [ ] Confirm SMS soft-fails independently (booking still succeeds if SMS down)
- [ ] `ZARINPAL_MERCHANT_ID` (and refund token if needed) set on Liara only — never in git
- [ ] Callback URL `https://inboxs.ir/payments/callback/zarinpal` matches panel / request payload
- [ ] Unit tests: `npm test` (includes zarinpal client + provider resolution)
