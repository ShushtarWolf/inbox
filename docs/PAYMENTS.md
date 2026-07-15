# Payments — inbox

## Modes

| `PAYMENTS_MODE` | Behavior |
|-----------------|----------|
| `pay_at_club` (default) | No online checkout; bookings marked `PAY_AT_CLUB` |
| `test` | IPG adapters return sandbox redirect URLs; bookings start `PENDING_ONLINE` |
| `live` | Real Zarinpal/IDPay charges (go-live only) |

## Env vars

- `PAYMENTS_MODE` — see above
- `ZARINPAL_MERCHANT_ID` — required for live Zarinpal
- `IDPAY_API_KEY` — optional alternative provider

## Checkout flow

1. Athlete books court/coach/package → `Payment` row created with mode-appropriate status
2. Athlete taps **Pay online** or **Pay with wallet** on booking screens
3. `POST /api/payments/checkout` creates IPG intent (or debits wallet)
4. Browser returns via `GET /payments/callback/[provider]` or webhook confirms payment
5. `Booking.paymentStatus` and `Payment.status` stay in sync via `paymentSync`

## Wallet

- Users have a `Wallet` balance (IRR)
- Cancelling a **paid** booking refunds to gateway (IPG) or credits wallet (cash / fallback)
- `GET /api/wallet` — balance + recent transactions
- Checkout accepts `useWallet: true` to pay from balance

## Cancellation refunds

All cancel endpoints (`/api/bookings/[id]/cancel`, coach, package, owner) call `refundPaymentForCancellation`:

| Payment type | Refund path |
|--------------|-------------|
| IPG (online) | Gateway `refund()` → wallet credit on failure |
| Cash / pay-at-club (marked PAID) | Wallet credit for registered athletes |
| Unpaid (`PAY_AT_CLUB`) | No refund |

## Webhooks

`POST /api/payments/webhook/[provider]` — idempotent status update + parent booking sync.

## Go-live checklist

1. Set `PAYMENTS_MODE=live` on Liara
2. Configure merchant credentials
3. Register webhook URL with IPG
4. Test cancel refund flow (gateway + wallet fallback)
5. Run `prisma migrate deploy` for wallet tables
