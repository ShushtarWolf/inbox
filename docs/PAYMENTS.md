# Payments — inbox

## Modes

| `PAYMENTS_MODE` | Behavior |
|-----------------|----------|
| `pay_at_club` (default / **current prod**) | No online checkout; bookings marked `PAY_AT_CLUB`. Athlete pays at the desk; owner marks cash paid. |
| `test` | IPG adapters return sandbox redirect URLs; bookings start `PENDING_ONLINE` |
| `live` | **Not ready.** Zarinpal/IDPay live adapters throw `501` — do **not** set `live` until a real IPG ships |

Keep production on `PAYMENTS_MODE=pay_at_club`. Do not implement or enable Zarinpal for the Behnaz pilot.

## Env vars

- `PAYMENTS_MODE` — see above (default `pay_at_club`)
- `ZARINPAL_MERCHANT_ID` — only when a real live Zarinpal adapter exists
- `IDPAY_API_KEY` — optional alternative provider (same constraint)

## Checkout flow

1. Athlete books court/coach/package → `Payment` row created with mode-appropriate status
2. In `pay_at_club`: athlete pays at the desk (or from wallet credits if balance > 0). **Pay online** is hidden. Confirmation UX says pay at club — never “online payment success”.
3. In `test`/`live`: athlete taps **Pay online** or **Pay with wallet** on booking screens
4. `POST /api/payments/checkout` creates IPG intent (or debits wallet). In `pay_at_club`, non-wallet checkout returns `400` (“pay at the club or use wallet”).
5. Browser returns via `GET /payments/callback/[provider]` or webhook confirms payment (online modes only)
6. `Booking.paymentStatus` and `Payment.status` stay in sync via `paymentSync` (including wallet method `PAID`)

## Desk collection (`pay_at_club`)

1. Owner calendar shows unpaid badge on reserved slots
2. **Mark paid (cash)** → `POST /api/owner/reserve` with `paymentStatus: PAID`, `method: CASH`
3. Athlete booking screens show **Paid** with copy that this is club/wallet collection — not online IPG success
4. Finance page buckets collected cash vs unpaid (collect at club); online payouts UI is hidden
5. **Mark unpaid** reverses a mistaken cash mark (and credits wallet if the booking was wallet-paid)
6. Cancelling a **PAID** cash/wallet booking credits the registered athlete’s wallet

## Wallet

- Users have a `Wallet` balance (IRR)
- Cancelling a **paid** booking refunds to gateway (IPG) or credits wallet (cash / fallback)
- `GET /api/wallet` — balance + recent transactions
- Checkout accepts `useWallet: true` to pay from balance (works in `pay_at_club` for refund credits)

## Cancellation refunds

All cancel endpoints (`/api/bookings/[id]/cancel`, coach, package, owner) call `refundPaymentForCancellation`:

| Payment type | Refund path |
|--------------|-------------|
| IPG (online) | Gateway `refund()` → wallet credit on failure |
| Cash / pay-at-club (marked PAID) | Wallet credit for registered athletes |
| Unpaid (`PAY_AT_CLUB`) | No refund |

## Webhooks

`POST /api/payments/webhook/[provider]` — idempotent status update + parent booking sync.

## Go-live checklist (online IPG — deferred)

Do **not** run this until a real gateway adapter is implemented and verified:

1. Implement live Zarinpal (or IDPay) create/confirm/refund — no fake `PAID` without verify
2. Set `PAYMENTS_MODE=live` on Liara only after step 1
3. Configure merchant credentials
4. Register webhook URL with IPG
5. Test cancel refund flow (gateway + wallet fallback)
6. Run `prisma migrate deploy` for wallet tables if needed
