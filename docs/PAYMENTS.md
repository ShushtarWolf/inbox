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
| `pay_at_club` | Desk-only for **owner/coach** walk-ins and mark-paid. Athlete self-serve booking/join requires online (`test`/`live`) — gateway or wallet. **OK launch fallback for desk**; do not leave athletes on this mode alone. |
| `test` (recommended locally / pre-SEP on Liara) | Default provider **sep**. Without `SEP_TERMINAL_ID`, checkout redirects to `/payments/test-gateway` (simulate OK/NOK). With terminal id, uses real SEP request/verify (SEP has no public sandbox host). |
| `live` | Real SEP production API. Requires `SEP_TERMINAL_ID`. **Never** marks `PAID` without verify success (`0`/`2`). **Do not enable until checklist passes.** |

## Ops status (after secrets) — confirm liveReady without flipping env

Never prints `SEP_TERMINAL_ID`. **Do not** set or change `PAYMENTS_MODE` from this checklist — only read status.

```bash
npm run payments:status
# Against Liara (after your deploy):
curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  https://inboxs.ir/api/admin/payments-status
```

Expect JSON fields: `paymentsMode`, `hasSepTerminalId`, `liveReady`.

| Field | Meaning |
|-------|---------|
| `paymentsMode` | Current mode (`pay_at_club` / `test` / `live`) — already set on Liara for production |
| `hasSepTerminalId` | `true` when `SEP_TERMINAL_ID` is present (value never returned) |
| `liveReady` | `true` **only** when `paymentsMode=live` **and** terminal is set |

If production is already `live` and `liveReady=true`, no env change is needed — proceed with the manual SEP spot checks below. Liara fill sheet: [LIARA_ENV_FILL_SHEET.md](./LIARA_ENV_FILL_SHEET.md).

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

Owner **Mark paid (cash)** remains for walk-ins and unpaid online attempts (`PENDING_ONLINE` / `FAILED`). Public athlete flow offers **پرداخت آنلاین** and **wallet** when `PAYMENTS_MODE` is `test` or `live` — athletes cannot self-select pay-at-club.

**Desk cash / complimentary never settle** into club or coach withdrawable wallets (`creditOwnerForPaidPayment` skips `method=CASH`). `Payment` rows remain for ops reporting. Historical phantom CASH settlements: `node scripts/audit-money-bugs.mjs` then `APPLY=yes node scripts/correct-cash-settlements.mjs` (append-only clawback).

Owner desk **ارسال لینک پرداخت** (not shown in `pay_at_club` — that button is **رزرو بدون دریافت وجه**) creates an unpaid IPG booking, SMS a token10-safe pay pin, and shows a copy/WhatsApp URL to `https://inboxs.ir/p/{pin}` (opens the receipt Pay CTA). Checkout still requires `PAYMENTS_MODE=test` or `live`.

## Cancellation refunds

Money outcome from `resolveCancelMoneyOutcome` (`shared/cancelPolicy.ts`):

| Actor | When | Money |
|-------|------|-------|
| Owner / coach | Anytime | **100% wallet credit** + settlement clawback |
| Athlete | Outside club `cancellationWindowHours` (default 12) | **100% wallet credit** + clawback |
| Athlete | Inside window (until slot start) | Cancel allowed, **zero refund**, club/coach/platform keep nets |

`refundPaymentForCancellation`:

| Payment type | Refund path |
|--------------|-------------|
| IPG / wallet `PAID` | **Wallet credit** (closed-loop; no gateway reverse required) + clawback |
| Desk `CASH` | No athlete credit; clawback only if a (historical) settlement exists |
| Unpaid | No refund |

Series session cancels credit one `REFUND_CREDIT` per cancelled `bookingId` and pro-rata clawback owner net.

Cancel SMS still fires via `notifyBookingCancelled` (soft-fail).

## Club settlement / owner withdraw

Owner wallet credits on **IPG / wallet** collected payments (`PLATFORM_COMMISSION_BPS`, default `1000` = 10%) including **competition entry fees** once PAID. Desk cash does **not** credit. Owner sets SHEBA and submits a **withdraw request** from **available** balance (moves to locked until admin paid/reject); ops pays via manual bank transfer. No automated payout rail.

**Available / locked:** `Wallet` / `ClubWallet` keep `balance = availableBalance + lockedBalance`. Class settlements with `classDate` credit **locked** until the Tehran day after class (lazy `UNLOCK`). Packages/comps (`classDate` null) credit **available**.

**Internal transfer:** club ↔ coach record-keeping (`POST /api/owner/transfers`, `POST /api/coach/transfers`) from available only. Athletes never have this.

On Liara after deploy: ensure `prisma migrate deploy` has applied through `20261003180000_wallet_available_locked`. Optional env: `PLATFORM_COMMISSION_BPS=1000`, `COACH_COMMISSION_BPS=1000`.

## Coach lesson settlement

When an athlete pays a **coach session** fee (`Payment.coachSessionId`), settlement credits the **coach user wallet** with net after commission (`COACH_COMMISSION_BPS`, else same as `PLATFORM_COMMISSION_BPS`, default 10%) into **locked** until day after class. Athletes stay fee-free at checkout. Court charges paid by the coach (`metadata.source=coach-lesson-court`) still settle to the **club** at **0 bps**. Cancel/refund clawbacks debit the coach wallet (`SETTLEMENT_CLAWBACK`, may go negative).

## Athlete wallet withdraw

Athlete wallet is **closed-loop** (bookings only). `POST /api/wallet/withdraw` requires a **Coach** profile; plain athletes get **403**. Coach settlement credits remain cash-backed on the user-withdraw rail (`getWalletWithdrawableBalance` = eligible settlement net minus prior holds/paid, capped by **available**).

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
