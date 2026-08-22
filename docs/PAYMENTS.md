# Payments — inbox

## Why SEP (Saman)

We ship a **real SEP / سامان کیش** adapter (not a fake live stub). Reasons:

- Merchant registration is already on `merchant.sep.ir`
- Fits the existing `server/utils/payments` registry (`createIntent` / `confirm` / `refund`)
- Verify codes `0` / `2` (idempotent re-verify) + reverse for live refunds
- IDPay remains in the type union for a future adapter; not implemented here

**Do not** set `PAYMENTS_MODE=live` until the terminal is active in the SEP panel and the manual checklist below passes.

**`pay_at_club` is an OK MVP fallback** — launch without online IPG; desk mark-paid / walk-ins work. Prefer `test` on Liara until SEP is verified, then `live`.

## Modes

| `PAYMENTS_MODE` | Behavior |
|-----------------|----------|
| `pay_at_club` | Legacy / desk-only. Online checkout hidden; bookings `PAY_AT_CLUB`. **OK launch fallback.** Still supported for walk-ins and if someone toggles back. |
| `test` (recommended locally / pre-SEP on Liara) | Default provider **sep**. Without `SEP_TERMINAL_ID`, checkout redirects to `/payments/test-gateway` (simulate OK/NOK). With terminal id, uses real SEP request/verify (SEP has no public sandbox host). |
| `live` | Real SEP production API. Requires `SEP_TERMINAL_ID`. **Never** marks `PAID` without verify success (`0`/`2`). **Do not enable until checklist passes.** |

## Ops status (after secrets)

Never prints `SEP_TERMINAL_ID`:

```bash
npm run payments:status
# Against Liara (after your deploy):
curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  https://inboxs.ir/api/admin/payments-status
```

Expect `paymentsMode` + `hasSepTerminalId` + `liveReady` (true only when mode=`live` and terminal is set). Liara fill sheet: [LIARA_ENV_FILL_SHEET.md](./LIARA_ENV_FILL_SHEET.md).

## Env vars

Local (no secrets):

```bash
PAYMENTS_MODE=test
# PAYMENT_PROVIDER=sep   # default when mode is test|live
# PAYMENT_PROVIDER=log   # API-only; no redirect (unit/CI)
NUXT_PUBLIC_SITE_URL=http://localhost:3000
```

Liara **before SEP verified** (pick one):

| Variable | Value | Notes |
|----------|-------|--------|
| `PAYMENTS_MODE` | `pay_at_club` **or** `test` | Desk fallback OK; or test-gateway / SEP test |
| `SEP_TERMINAL_ID` | only if calling real SEP | Never commit |

Liara **live** (set only after terminal verified — never commit secrets):

| Variable | Required | Notes |
|----------|----------|-------|
| `PAYMENTS_MODE` | Yes | `live` only after verify |
| `PAYMENT_PROVIDER` | No | defaults to `sep` |
| `SEP_TERMINAL_ID` | Yes | Numeric terminal id from SEP merchant panel |
| `SEP_BASE_URL` | No | defaults to `https://sep.shaparak.ir` |
| `NUXT_PUBLIC_SITE_URL` | Yes | `https://inboxs.ir` (callback base) |

Callback URL registered with SEP (آدرس کال‌بک) / sent as `RedirectUrl` in token request:

`https://inboxs.ir/payments/callback/sep`

Server IP (آدرس آی‌پی سرور سایت) is the public A record for `inboxs.ir` (Liara).

## Toman vs rial

Stored prices, wallets, SMS, and the in-app test gateway are **toman**. SEP `Amount` is **rials** (`toman × 10`) at token request and verify only — never write rials back into `Payment.amount`.

Paid SEP rows from **before** that ×10 cutover (bank charged the stored integer as rials) are rewritten once to `rials ÷ 10` toman via `POST /api/admin/payments/correct-pre-rial-ipg` (`scripts/correct-pre-rial-ipg.mjs`). Catalog court prices stay listed toman.

## Checkout flow (athlete court)

1. Athlete books court → `Payment` row `PENDING_ONLINE` (when mode is `test`/`live`)
2. Confirmation SMS still fires on create (`notifyBookingConfirmed`) — soft-fail independent of payment
3. Athlete taps **Pay online** → `POST /api/payments/checkout` → SEP redirect
4. Return: `POST|GET /payments/callback/sep` with `ResNum`, `RefNum`, `State=OK|…`
5. `State=OK` → provider `confirm` (VerifyTransaction) → `PAID` + parent sync + `notifyBookingPaid` (SMS soft-fail)
6. Non-OK / verify failure → `FAILED` (never left `PAID` incorrectly). Double callback is idempotent (`2` / already `PAID`)
7. Athlete can **retry** after `FAILED` (Pay online creates a new intent). Desk **mark paid (cash)** still works for unpaid/`FAILED` rows
8. `/athlete/payments` lists real `Payment` rows (paid, pending, failed, pay_at_club / cash / wallet)

## Wallet top-up

Athletes can fund the wallet via the **same** online pipeline as court checkout (`PAYMENTS_MODE=test|live`):

1. `POST /api/wallet/topup` `{ amount }` → `Payment` with `purpose=topup` + `userId`
2. Redirect to SEP or `/payments/test-gateway`
3. Callback OK → verify → `PAID` → idempotent `TOPUP_CREDIT` wallet row
4. Spend: wallet must cover the **full** booking amount (`useWallet`) — no split with IPG

Rejected when `PAYMENTS_MODE=pay_at_club`. Refunds still credit wallet on cancel (unchanged).

## Desk collection

Owner **Mark paid (cash)** remains for walk-ins and unpaid online attempts (`PENDING_ONLINE` / `FAILED`). Public athlete flow offers **پرداخت آنلاین** when `PAYMENTS_MODE` is `test` or `live` (not when `pay_at_club`).

Owner desk **ارسال لینک پرداخت** (not shown in `pay_at_club` — that button is **رزرو بدون دریافت وجه**) creates an unpaid IPG booking, SMS a token10-safe pay pin, and shows a copy/WhatsApp URL to `https://inboxs.ir/p/{pin}` (opens the receipt Pay CTA). Checkout still requires `PAYMENTS_MODE=test` or `live`.

## Cancellation refunds

`refundPaymentForCancellation` (all cancel endpoints):

| Payment type | Refund path |
|--------------|-------------|
| IPG SEP **live** + stored `RefNum` | Gateway `ReverseTransaction` → `REFUNDED` |
| IPG SEP live **without** RefNum / gateway error | **Wallet credit** fallback for registered athlete |
| IPG test / simulated | Local `REFUNDED` (no real money) |
| Cash / wallet marked `PAID` | Wallet credit |
| Unpaid (`PAY_AT_CLUB` / `PENDING_ONLINE`) | No refund |

**Cash-out path after wallet credit:** athlete sets SHEBA on `/athlete/wallet`, submits a withdraw request; ops pays via manual bank transfer and marks paid in `/admin/withdrawals` (ورزشکار tab). Same manual rail as club settlement.

Cancel SMS still fires via `notifyBookingCancelled` (soft-fail).

## Club settlement / owner withdraw

Owner wallet credits on collected payments (`PLATFORM_COMMISSION_BPS`, default `1000` = 10%). Owner sets SHEBA and submits a **withdraw request**; ops pays via manual bank transfer, then marks **paid** (or **reject**) in `/admin/withdrawals`. No automated payout rail.

On Liara after deploy: ensure `prisma migrate deploy` has applied club settlement + `20260816160000_user_wallet_withdraw` (User.sheba, UserWithdrawRequest, wallet WITHDRAW_* types). Optional env: `PLATFORM_COMMISSION_BPS=1000`.

## Athlete wallet withdraw

Athlete wallet is closed-loop credit for bookings. Current athlete wallet sources
(top-ups, wallet-backed refunds, and manual balance adjustments) are **not**
bank-withdrawable. Keep the request flow dormant unless a future source of
cash-out-eligible athlete funds is introduced with explicit policy and ledger
rules.

## Webhooks

`POST /api/payments/webhook/[provider]` — optional and **disabled by default**. Requires `PAYMENT_WEBHOOK_SECRET` (header `x-webhook-secret` or `Authorization: Bearer …`, min 16 chars). Without the secret the route returns **501**. `pay_at_club` and SEP providers reject webhook confirm (`verifyWebhook` → false); browser callback remains the primary SEP path. The `log` provider may accept webhooks only in non-live modes **and** with a valid secret. Uses the same `confirmPaymentAndSync` path (idempotent confirm + parent sync + paid notify).

## `pay_at_club` migration note

`pay_at_club` is **not** removed. Toggling back hides online CTA and keeps desk mark-paid. Historical IPG rows still resolve their stored `provider` on refund/callback even if mode is `pay_at_club`.

## Manual verify before live (Liara)

Do **not** set `PAYMENTS_MODE=live` until all pass. Until then keep `pay_at_club` (OK) or `test`.

- [ ] Test-gateway: book → pay → `PAID`
- [ ] Cancel / NOK → booking **not** `PAID`; Pay online retry works after `FAILED`
- [ ] Double-hit callback (same ResNum) → still one `PAID`, no error storm
- [ ] Cancel paid online → gateway reverse **or** wallet fallback per env
- [ ] Confirm SMS soft-fails independently (booking still succeeds if SMS down)
- [ ] `SEP_TERMINAL_ID` set on Liara only — never in git
- [ ] Callback URL `https://inboxs.ir/payments/callback/sep` matches panel / request payload
- [ ] `npm run payments:status` / `GET /api/admin/payments-status` → `liveReady: true` only after mode=`live` + terminal (never prints terminal id)
- [ ] Unit tests: `npm test` (includes SEP client + provider resolution + callback field parsing)
- [ ] `/athlete/payments` shows the new payment row after book/pay
