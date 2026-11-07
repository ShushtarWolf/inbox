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

### Dual-rail books (UI)

Owner finance and athlete wallet expose **two separate books** — never one mixed balance:

| Book | Owner | Athlete |
|------|-------|---------|
| **نقد / صندوق** | `books.cash` (`inTill`, `returnsOwed`) + desk ack list | `cashDesk` (paid at club + returns owed/returned) — not spendable |
| **آنلاین / درگاه** | Settlement withdrawable + settlement ledger | Wallet `availableBalance` + wallet txs |

APIs: `GET /api/owner/finance` → `books`, `GET /api/wallet` → `online` + `cashDesk`. Admin guest IPG cancels needing bank transfer: `/admin/bookings?manualRefund=1`.

Owner desk **ارسال لینک پرداخت** (not shown in `pay_at_club` — that button is **رزرو بدون دریافت وجه**) creates an unpaid IPG booking, SMS a token10-safe pay pin, and shows a copy/WhatsApp URL to `https://inboxs.ir/p/{pin}` (opens the receipt Pay CTA). Checkout still requires `PAYMENTS_MODE=test` or `live`.

## Cancellation refunds

Money outcome from `resolveCancelMoneyDetail` / `resolveCancelMoneyOutcome` (`shared/cancelPolicy.ts`):

| Actor | When | Money |
|-------|------|-------|
| Owner / coach | Anytime | **100%** refund + settlement clawback |
| Athlete | Outside club `cancellationWindowHours` (default 12) | **100%** refund + clawback |
| Athlete | Inside window (until slot start) | Share = club `insideWindowRefundBps` (default **10000** = 100%). `0` = zero refund; `5000` = 50% partial, etc. |

`refundPaymentForCancellation` (mark `REFUNDED` + clawback; wallet credit when applicable):

| Payment type | Refund path |
|--------------|-------------|
| IPG `PAID` (SEP **live**, `refNum`, confirmed within **25 minutes**, **full** refund only) | Attempt SEP `ReverseTransaction` → `refundChannel=gateway_reverse` (no athlete wallet credit; full clawback). SEP reverses the whole charge, so **partial** refunds (`refundBps < 10000`) never reverse — they go closed-loop wallet. SEP `ResultCode` 2 (duplicate) / 5 (already reversed) count as reversed; matching is by code, never free text. On **definitive** reverse failure / outside window / test mode → closed-loop wallet. On **timeout/network** → leave `metadata.reversePending` and **do not** wallet-credit (avoids double refund); cancel rolls back; retry via `POST /api/admin/payments/resolve-reverse-pending`. A resolved reverse leaves the payment `PAID` (card refunded, booking + settlement live) — money-ops-summary lists it under `reversedStillPaid`; re-run the cancel to free the slot and claw back. |
| IPG / wallet `PAID` (fallback) | Athlete wallet credit (`refundChannel=wallet_closed_loop`) + clawback |
| Desk `CASH` | No athlete credit; `REFUNDED` + `deskCashReturn=owed` until owner acks via `POST /api/owner/payments/:id/ack-cash-return` (`isRefundOwed`) |
| Pay-link guest IPG (no athlete wallet) | `manualBankRefund=owed` until admin `POST /api/admin/payments/:id/ack-manual-refund` |
| Split pay (wallet + IPG) | Gateway reverse restores **wallet debit only**; wallet fallback credits **full promoted** amount (`splitCancelCreditAmount`) |
| Unpaid | No refund |

Partial athlete refunds stay `REFUNDED` with `metadata.refundBps` (no `PARTIALLY_REFUNDED` enum). Stale `PENDING_ONLINE` → `FAILED` + `metadata.expired` via `POST /api/admin/payments/expire-pending` (`PENDING_ONLINE_EXPIRE_MINUTES`, default 45; runs in `money-jobs-cron.yml`). `FAILED` stays payable.

Late SEP callback on a released hold (`FAILED`) or a `SUPERSEDED` row is **not** verified — SEP auto-reverses unverified charges within 30 minutes, so the money returns to the card (athlete sees a failure page first). Superseded rows keep the old bank ref in `metadata.supersededProviderRef` for support lookup.

**Cancel + refund are one transaction** (`cancelCourtBooking` / `cancelCoachSession` / `cancelPackageBooking`): the slot/session is not left FREE if wallet credit or clawback fails. Ambiguous SEP reverse throws `SEP_REVERSE_PENDING` so the booking stays occupied. Series athlete cancel runs pro-rata refund **before** freeing the slot.

Series session cancels credit one `REFUND_CREDIT` per cancelled `bookingId` and pro-rata clawback owner net (same atomic rule). The series payment row is locked (`FOR UPDATE`) and `sessionRefundsTotal` is re-read inside the transaction; a session already in `sessionRefundedBookingIds` (or with a prior credit/clawback row) moves no money on retry, and the running total is capped at the amount paid. A full clawback after partial session clawbacks only takes the remaining `ownerNet`, and claims the ledger row conditionally (`clawedBackAt IS NULL`) so concurrent cancels cannot debit the payee twice.

Cancel SMS still fires via `notifyBookingCancelled` (soft-fail).

## Club settlement / owner withdraw

Owner wallet credits on **IPG / wallet** collected payments (`PLATFORM_COMMISSION_BPS`, default `0` = 0% for now) including **competition entry fees** once PAID. Desk cash does **not** credit. Owner sets SHEBA and submits a **withdraw request** from **available** balance (moves to locked until admin paid/reject); ops pays via manual bank transfer. No automated payout rail.

**Available / locked:** `Wallet` / `ClubWallet` keep `balance = availableBalance + lockedBalance`. Class settlements with `classDate` credit **locked** until the Tehran day after class (lazy `UNLOCK`). **Season / multi-slot series** settle once on the primary payment (ledger `classDate` = last session) but **unlock progressively** — only each completed session’s share becomes withdrawable the day after that class; cancelled sessions are clawed and never unlock. **Packages** lock until `PackageDraft.startDate` (else `finishDate`); **competitions** lock until Tehran day of `eventAt` (ledger `classDate`). Legacy null `classDate` stays immediately eligible.

**Debt-aware ceiling:** withdrawable is also capped by `applyDebtAwareWithdrawCeiling` so underwater balances after clawback cannot pay out. Clawback may still go negative (`allowNegative`); there is no separate debt table.

**Rounding:** commission / refund BPS use `floor` (`splitSettlement`, `refundAmountFromBps`); leftover 1 toman on splits stays with platform net.

**Platform default commission:** admin sets the global rate at `/admin/platform-commission` (`GET/PATCH /api/admin/platform-commission`, bps 0–10000; bps > 0 requires `confirmRefundRisk`). Stored in `PlatformCommissionSetting` with append-only `PlatformCommissionChange` audit. Settlement reads DB first; `PLATFORM_COMMISSION_BPS` env is bootstrap/fallback only when the row is missing.

**Per-club commission:** admin sets `Club.commissionBps` on `/admin/clubs/:id` (`PATCH /api/admin/clubs/:id/commission`, bps 0–10000 or `null`). `null` → platform default above; `0` = launch-partner / promo club. Each `SettlementLedgerEntry` snapshots the rate it used, so changing a club's rate only affects payments settled afterwards. Coach lesson fees still use `COACH_COMMISSION_BPS` (env) when set; otherwise platform default.

**Commission refund:** the athlete gets back the **gross** they paid; the payee (club/coach) gives back only the **ownerNet** it was credited; the platform refunds its own commission from float. Partial refunds claw back `ownerNet × refund / gross` (floor), so the platform returns the same share of its commission. Clubs never go negative from commission on a cancellation.

**Internal transfer:** club ↔ coach record-keeping (`POST /api/owner/transfers`, `POST /api/coach/transfers`) from available only. Athletes never have this.

**Club suspension:** `SUSPENDED` rejects pending club withdraws, blocks new `requestClubWithdraw` / admin `markWithdrawPaid`, and owner APIs already gate on `ACTIVE`.

**Admin payout dual-control:** when `PAYMENTS_MODE=live`, `ADMIN_PAYOUT_CONFIRM` **must** be set and mark-paid requires header `x-admin-payout-confirm`. Non-live: soft dual-control via body `confirmPayout: true` (or the header when env is set).

On Liara after deploy: ensure `prisma migrate deploy` has applied through `20261104190000_platform_commission_setting` (admin default row; runtime does **not** use legacy env when the row exists). Optional env: `PLATFORM_COMMISSION_BPS=0` (diagnostics/bootstrap only), `COACH_COMMISSION_BPS=0`, `ATHLETE_WITHDRAW_*_TOMAN` (or legacy `*_IRR`), `ATHLETE_TOPUP_CASHOUT_HOLD_HOURS=24`, `ADMIN_PAYOUT_CONFIRM=…`.

## Signed intentional decisions (not bugs)

These are product laws — do not “fix” them by rewriting policy:

| Decision | Law |
|---|---|
| Commission on cancel | Platform returns its commission from float; payee returns only `ownerNet` |
| `coach-lesson-court` @ 0 bps | Coach already paid court from wallet; club gets 100% (only when linked coach session exists) |
| `PLATFORM_COMMISSION_BPS=0` | Pilot default; live warns but does not hard-fail |
| Rounding | `floor` on commission/refund BPS |
| Clawback negative | Allowed; withdraw blocked via debt-aware ceiling (no debt ledger) |
| Athlete SHEBA hold | Default 24h on top-up/refund credits |
| `SUSPENDED` club | Freezes withdraws only — no auto-cancel of bookings |
| `PaymentMethod.PAID` | Means **wallet rail** (not status); do not rename to `WALLET` without a migration plan |
| SEP reverse window | 25 minutes (conservative vs bank ~30m) |

## Coach lesson settlement

When an athlete pays a **coach session** fee (`Payment.coachSessionId`), settlement credits the **coach user wallet** with net after commission (`COACH_COMMISSION_BPS`, else same as `PLATFORM_COMMISSION_BPS`, default 0%) into **locked** until day after class. Athletes stay fee-free at checkout. Court charges paid by the coach (`metadata.source=coach-lesson-court`) still settle to the **club** at **0 bps**. Cancel/refund clawbacks debit the coach wallet (`SETTLEMENT_CLAWBACK`, may go negative).

## Athlete wallet withdraw / cash-out

- **Coach:** settlement credits (day after class) via `getWalletWithdrawableBalance`.
- **Athlete:** top-up + refund credit nets (`athleteCashOutFromTxs`), capped by available + env `ATHLETE_WITHDRAW_MIN_TOMAN` / `MAX` / `DAILY_MAX` (legacy `*_IRR` aliases still work — values are **toman**). Fresh `TOPUP_CREDIT` **and** `REFUND_CREDIT` are excluded until `ATHLETE_TOPUP_CASHOUT_HOLD_HOURS` (default 24) — otherwise card → booking → cancel → SHEBA skips the cool-down. Booking spend (`PAYMENT_DEBIT`) reduces withdrawable; it does not invent float. Both rails subtract `withdrawnViaRail` so mixed wallets cannot double-cash-out.
- **Prize** competition awards (`ADJUSTMENT`) are spendable in-app but **not** SHEBA-withdrawable.
- Ops pays SHEBA manually from the admin athlete withdrawals queue (same rail as coaches). SMS alert includes full name (نام + نام‌خانوادگی). No automated bank payout.
- **Coach + athlete:** users with a coach profile can withdraw settlement (coach rail) and, separately, top-up/refund credit (athlete rail). The wallet API sums both for the withdraw cap; **the server always picks the rail** (client `rail` is ignored). Chosen rail is stored on `UserWithdrawRequest.rail`.
- Withdraw create accepts optional `idempotencyKey` (body or `Idempotency-Key` header); same key returns the existing request. Fallback: same user/club + amount within 2 minutes. Dedupe runs **before** the balance gates.

## Payment method label

Prisma `PaymentMethod.PAID` means **wallet rail** (not “status paid”). UI/receipts map it to «کیف پول» / channel `WALLET`. Status remains the separate `PaymentStatus` enum.

## Split pay (wallet + IPG)

Checkout `useWallet: 'partial'` debits `min(available, price)` in the **same DB transaction** as the pending `Payment` row, then attaches the SEP intent. On `createIntent` failure, `releaseSplitWalletDebit` runs before surfacing the error. On PAID, payment amount is promoted to the full price for settlement (skipped when the wallet rail was already released; the money-job worker promotes before settling too). On IPG fail / hold abandon / pending expire / **checkout retry (SUPERSEDED)**, wallet debit is released (`REFUND_CREDIT` + `walletDebitReleased`). Competition split-pay supersedes the join-linked row (fresh idempotency key) so the wallet rail is released on retry.

## Money reliability (jobs / audit / CI)

- **`MoneyJob` outbox** — enqueued when `Payment` → `PAID` (SEP confirm txn + confirm path; `createMany skipDuplicates`, safe inside a txn). Types: `SETTLE`, `TOPUP_CREDIT`. Worker: `POST /api/admin/payments/process-money-jobs` (cron ~5 min). Idempotent with `SettlementLedgerEntry` / wallet partial uniques. The sync path closes a job **only when its effect exists** (ledger row / `TOPUP_CREDIT` line) — a repeat callback is a no-op and must not close it. Reconcile scans newest-first, skips `FAILED` jobs, and reopens `DONE` jobs whose effect is still missing.
- **Deploy pre-check for `20261103140000_club_booking_credit_idempotency`** — the unique index fails `migrate deploy` if duplicates exist. Run first; expect zero rows:
  `SELECT "paymentId", "bookingId", COUNT(*) FROM "ClubWalletTransaction" WHERE type = 'BOOKING_CREDIT' AND "paymentId" IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1;`
- **Checkout retry** — payable IPG rows are **`SUPERSEDED`** (not deleted); `supersededByPaymentId` links to the replacement intent.
- **`runMoneyAudit`** — balance drift = `balance ≠ Σ signed txs − PAID withdraw requests` (`WITHDRAW_PAID` rows carry amount 0) **or** `balance ≠ available + locked`; same formula as `walletBalanceDrift` / `audit-money-bugs.mjs`. Also `paidWithoutSettlement`, `paidTopUpWithoutCredit`, `openPlatformCommissionToman`, money-job, `reversePending` and `reversedStillPaid` counts. **`GET /api/admin/payments/money-ops-summary`** lists sample ids + action endpoints.
- **CI** — `npm run check:money-safety` blocks new `payment.delete` under `server/` (except catalog wipe utilities).

## Guest IPG refunds

Pay-link guests without a linked `userId` always queue **`manualBankRefund=owed`** until admin ack. Refunds never auto-credit a wallet via `guestMobile` phone match (shared/wrong numbers). Full guest-wallet product (mandatory login for IPG) remains a later decision.

## Desk mark-unpaid

IPG and wallet (`method=PAID`) desk mark-unpaid return **409** — cancel to refund. CASH → unpaid sets `metadata.markUnpaidCash` and clawbacks only if a ledger row exists. Series desk path has the same IPG/wallet 409.

## Webhooks

`POST /api/payments/webhook/[provider]` — optional and **disabled by default**. Requires `PAYMENT_WEBHOOK_SECRET` (header `x-webhook-secret` or `Authorization: Bearer …`, min 16 chars). Without the secret the route returns **501**. `pay_at_club` and SEP providers reject webhook confirm (`verifyWebhook` → false); browser callback remains the primary SEP path. The `log` provider may accept webhooks only in non-live modes **and** with a valid secret. Uses the same `confirmPaymentAndSync` path (idempotent confirm + parent sync + paid notify).

## `pay_at_club` migration note

`pay_at_club` is **not** removed. Toggling back hides online CTA and keeps desk mark-paid. Historical IPG rows still resolve their stored `provider` on refund/callback even if mode is `pay_at_club`.

## Manual verify before live (Liara)

Do **not** set `PAYMENTS_MODE=live` until all pass. Until then keep `pay_at_club` (OK) or `test`.

- [ ] Test-gateway: book → pay → `PAID`
- [ ] Cancel / NOK → booking **not** `PAID`; Pay online retry works after `FAILED`
- [ ] Double-hit callback (same ResNum) → still one `PAID`, no error storm
- [ ] **Live SEP buy** → verify → `PAID` + club settlement
- [ ] **Live SEP cancel within 25m** of confirm → `gateway_reverse` (card reverse; no athlete wallet credit) + club clawback
- [ ] **Live SEP cancel after 25m** → `wallet_closed_loop` athlete credit + clawback (never reverse + wallet)
- [ ] Confirm SMS soft-fails independently (booking still succeeds if SMS down)
- [ ] `SEP_TERMINAL_ID` set on Liara only — never in git
- [ ] Callback URL `https://inboxs.ir/payments/callback/sep` matches panel / request payload
- [ ] `npm run payments:status` / `GET /api/admin/payments-status` → `liveReady: true` only after mode=`live` + terminal (never prints terminal id)
- [ ] Unit tests: `npm test` (includes SEP client + provider resolution + callback field parsing + sep reverse window)
- [ ] `/athlete/payments` shows the new payment row after book/pay
