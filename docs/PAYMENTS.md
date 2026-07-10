# Payments — inbox

## Modes

| `PAYMENTS_MODE` | Behavior |
|-----------------|----------|
| `pay_at_club` (default) | No online checkout; payments marked `PENDING_AT_CLUB` |
| `test` | IPG adapters return sandbox redirect URLs |
| `live` | Real Zarinpal/IDPay charges (go-live only) |

## Env vars

- `PAYMENTS_MODE` — see above
- `ZARINPAL_MERCHANT_ID` — required for live Zarinpal
- `IDPAY_API_KEY` — optional alternative provider

## Checkout flow

1. Client calls `POST /api/payments/checkout` with `bookingId` or `coachSessionId`
2. Service creates `Payment` row via `server/utils/payments/service.ts`
3. In `pay_at_club` mode: returns intent without `redirectUrl`
4. In `live` mode: returns IPG redirect URL

## Webhooks

`POST /api/payments/webhook/[provider]` — idempotent status update. Verify provider signature before go-live.

## Go-live checklist

1. Set `PAYMENTS_MODE=live` on Railway
2. Configure merchant credentials
3. Register webhook URL with IPG
4. Test refund flow via `refund()` service method
5. Update athlete UI to show pay button (currently display-only)

## Refund policy hooks

Use `getPaymentService(provider).refund(paymentId)` from owner finance tools (future).
