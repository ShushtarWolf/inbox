# Payments — inbox

## Why SEP (Saman)

We ship a **real SEP / سامان کیش** adapter (not a fake live stub). Reasons:

- Merchant registration is already on `merchant.sep.ir`
- Fits the existing `server/utils/payments` registry (`createIntent` / `confirm` / `refund`)
- Verify codes `0` / `2` (idempotent re-verify) + reverse for live refunds
- IDPay remains in the type union for a future adapter; not implemented here

**Do not** set `PAYMENTS_MODE=live` until the terminal is active in the SEP panel and the manual checklist below passes.

## Modes

| `PAYMENTS_MODE` | Behavior |
|-----------------|----------|
| `pay_at_club` | Legacy / desk-only. Online checkout hidden; bookings `PAY_AT_CLUB`. Still supported for walk-ins and if someone toggles back. Prefer migrating prod to `test` then `live`. |
| `test` (recommended locally) | Default provider **sep**. Without `SEP_TERMINAL_ID`, checkout redirects to `/payments/test-gateway` (simulate OK/NOK). With terminal id, uses real SEP request/verify (SEP has no public sandbox host). |
| `live` | Real SEP production API. Requires `SEP_TERMINAL_ID`. **Never** marks `PAID` without verify success (`0`/`2`). |

## Env vars

Local (no secrets):

```bash
PAYMENTS_MODE=test
# PAYMENT_PROVIDER=sep   # default when mode is test|live
# PAYMENT_PROVIDER=log   # API-only; no redirect (unit/CI)
NUXT_PUBLIC_SITE_URL=http://localhost:3000
```

Liara **live** (set only after terminal verified — never commit secrets):

| Variable | Required | Notes |
|----------|----------|-------|
| `PAYMENTS_MODE` | Yes | `live` (or `test` on Liara without terminal). Runtime-synced to client; optional `NUXT_PUBLIC_PAYMENTS_MODE` mirror |
| `PAYMENT_PROVIDER` | No | defaults to `sep` |
| `SEP_TERMINAL_ID` | Yes | Numeric terminal id from SEP merchant panel |
| `SEP_BASE_URL` | No | defaults to `https://sep.shaparak.ir` |
| `NUXT_PUBLIC_SITE_URL` | Yes | `https://inboxs.ir` (callback base) |

Callback URL registered with SEP (آدرس کال‌بک) / sent as `RedirectUrl` in token request:

`https://inboxs.ir/payments/callback/sep`

Server IP (آدرس آی‌پی سرور سایت) is the public A record for `inboxs.ir` (Liara).

## Checkout flow (athlete court)

1. Athlete books court → `Payment` row `PENDING_ONLINE` (when mode is `test`/`live`)
2. Confirmation SMS still fires on create (`notifyBookingConfirmed`) — soft-fail independent of payment
3. Athlete taps **Pay online** → `POST /api/payments/checkout` → SEP redirect
4. Return: `POST|GET /payments/callback/sep` with `ResNum`, `RefNum`, `State=OK|…`
5. `State=OK` → provider `confirm` (VerifyTransaction) → `PAID` + parent sync + `notifyBookingPaid` (SMS soft-fail)
6. Non-OK / verify failure → `FAILED` (never left `PAID` incorrectly). Double callback is idempotent (`2` / already `PAID`)

## Desk collection

Owner **Mark paid (cash)** remains for walk-ins (`pay_at_club` or unpaid desk rows). Public athlete flow offers online pay when `PAYMENTS_MODE` ≠ `pay_at_club`.

## Cancellation refunds

`refundPaymentForCancellation` (all cancel endpoints):

| Payment type | Refund path |
|--------------|-------------|
| IPG SEP **live** + stored `RefNum` | Gateway `ReverseTransaction` → `REFUNDED` |
| IPG SEP live **without** RefNum / gateway error | **Wallet credit** fallback for registered athlete |
| IPG test / simulated | Local `REFUNDED` (no real money) |
| Cash / wallet marked `PAID` | Wallet credit |
| Unpaid (`PAY_AT_CLUB` / `PENDING_ONLINE`) | No refund |

Cancel SMS still fires via `notifyBookingCancelled` (soft-fail).

## Webhooks

`POST /api/payments/webhook/[provider]` — optional; browser callback is the primary path for SEP. Idempotent confirm + parent sync.

## `pay_at_club` migration note

`pay_at_club` is **not** removed. Toggling back hides online CTA and keeps desk mark-paid. Historical IPG rows still resolve their stored `provider` on refund/callback even if mode is `pay_at_club`.

## Manual verify before live (Liara)

Do **not** set `PAYMENTS_MODE=live` until all pass:

- [ ] Test-gateway: book → pay → `PAID`
- [ ] Cancel / NOK → booking **not** `PAID`
- [ ] Double-hit callback (same ResNum) → still one `PAID`, no error storm
- [ ] Cancel paid online → gateway reverse **or** wallet fallback per env
- [ ] Confirm SMS soft-fails independently (booking still succeeds if SMS down)
- [ ] `SEP_TERMINAL_ID` set on Liara only — never in git
- [ ] Callback URL `https://inboxs.ir/payments/callback/sep` matches panel / request payload
- [ ] Unit tests: `npm test` (includes SEP client + provider resolution)
