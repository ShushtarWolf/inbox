# Production go / no-go (post competition late-pay)

Date: 2026-08-27. Host: Liara `inbox` / `inboxs.ir`.

Related: [PAYMENTS.md](./PAYMENTS.md) · [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) · [OPERATIONS.md](./OPERATIONS.md)

## Deploy status

| Check | Result |
|-------|--------|
| Deploy `a8bc6f4` (P0/P1 + phone invite) | **PASS** — run 33076760845 |
| Deploy `7556846` (P2 money) | **PASS** — run 33078244055 |
| Deploy `ce91d32` (competition late-pay + settlement backfill) | **PASS** — [run 33097654020](https://github.com/ShushtarWolf/inbox/actions/runs/33097654020) |
| `prisma migrate deploy` on boot | Via `start-production.mjs` |
| Local dump after this deploy | `/Users/siamakghodsi/Projects/inbox/backups/inbox-db-20260827-210944.dump` |
| Public `GET /api/payments/mode` | `mode=live`, `onlineCheckoutEnabled=true` |
| Homepage | HTTP 200 |

## Money / payments

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| M-01 | Competition entry fees settle to club on PAID | **LIVE** | IPG/wallet + desk mark-paid |
| M-02 | Athlete withdraw only cash-backed settlement | **LIVE** | Top-up / refund / prize not bank-withdrawable |
| M-03 | SEP live on production | **LIVE** | Confirm `liveReady` via admin `payments-status` — do **not** flip `PAYMENTS_MODE` |
| M-04 | Manual SEP checklist in PAYMENTS.md | **OPS** | Spot-check cancel reverse, double callback, SMS |
| M-05 | Historical competition PAID without ledger | **OPS** | `npm run db:backfill-competition-settlements` (idempotent) |
| M-06 | Competition late IPG after cancel/expire | **LIVE** | verify→refund; never revive entry / no settle |

## SEP live verify (ops — mode already `live`)

```bash
curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  https://inboxs.ir/api/admin/payments-status
```

Expect: `paymentsMode=live`, `hasSepTerminalId=true`, `liveReady=true` (never prints terminal id). **Do not** change `PAYMENTS_MODE` from this check.

Manual spots: book→pay→PAID; NOK retry; double callback; cancel reverse or wallet fallback; competition cancel/expire then late OK callback → REFUNDED; SMS soft-fail; callback `https://inboxs.ir/payments/callback/sep`.

## Competition cron

| Check | Expect |
|-------|--------|
| Liara cron `*/15` → `process-registration-close` | **OPS required** for reliable seat release |
| Optional GHA `competition-cron.yml` | Best-effort only (often delayed) |
| `expire-pending` | Bundled in `process-registration-close`; optional duplicate |

## Role / product gates

| Check | Expect |
|-------|--------|
| Staff invite by phone | OTP login works for invited staff |
| Dual-role switcher | Athlete hub / coach profile / owner settings when 2 roles |
| Partner cancel | Doubles partner can cancel; refund to registrant |
| Competitions pilot | Only when `COMPETITIONS_ENABLED` + pilot slug |

## Residual (ops-only / accept)

- Confirm Liara competition cron is actually scheduled every 15m (GHA alone is not enough).
- Run `db:backfill-competition-settlements` against prod after local dump if any pre-settle PAID rows remain.
- Manual SEP reverse for any `refundPending` metadata rows.
- Prize awards remain platform `ADJUSTMENT` (not escrowed from entry fees).
- Desk CASH competition settle credits club without IPG cash (same as desk court).
- Canva owner-frame / athlete home switcher polish — out of scope unless broken.
- “0 issues” means no known P0 money/access bugs after these deploys + SEP spot checks — not a lifetime warranty.
