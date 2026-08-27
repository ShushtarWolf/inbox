# Production go / no-go (post P0/P1/P2)

Date: 2026-08-27. Host: Liara `inbox` / `inboxs.ir`.

Related: [PAYMENTS.md](./PAYMENTS.md) · [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) · [OPERATIONS.md](./OPERATIONS.md)

## Deploy status

| Check | Result |
|-------|--------|
| Deploy `a8bc6f4` (P0/P1 + phone invite) | **PASS** — run 33076760845 |
| Deploy `7556846` (P2 money) | **PASS** — run 33078244055 |
| `prisma migrate deploy` on boot | Via `start-production.mjs` |
| Local dump after first deploy | `/Users/siamakghodsi/Projects/inbox/backups/inbox-db-20260827-170843.dump` |
| Local dump after P2 deploy | `/Users/siamakghodsi/Projects/inbox/backups/inbox-db-20260827-172625.dump` |
| Public `GET /api/payments/mode` | `mode=live`, `onlineCheckoutEnabled=true` |
| Homepage | HTTP 200 |

## Money / payments

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| M-01 | Competition entry fees settle to club on PAID | **LIVE** | IPG/wallet + desk mark-paid |
| M-02 | Athlete withdraw only cash-backed settlement | **LIVE** | Top-up / refund / prize not bank-withdrawable |
| M-03 | SEP live on production | **LIVE** | Confirm `liveReady` via admin `payments-status` |
| M-04 | Manual SEP checklist in PAYMENTS.md | **OPS** | Spot-check cancel reverse, double callback, SMS |
| M-05 | Historical competition PAID rows | **OPS** | Pre-P2 PAID may lack ledger |

## SEP live verify (ops — mode already `live`)

```bash
curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  https://inboxs.ir/api/admin/payments-status
```

Expect: `paymentsMode=live`, `hasSepTerminalId=true`, `liveReady=true` (never prints terminal id).

Manual spots: book→pay→PAID; NOK retry; double callback; cancel reverse or wallet fallback; SMS soft-fail; callback `https://inboxs.ir/payments/callback/sep`.

## Role / product gates

| Check | Expect |
|-------|--------|
| Staff invite by phone | OTP login works for invited staff |
| Dual-role switcher | Athlete hub / coach profile / owner settings when 2 roles |
| Partner cancel | Doubles partner can cancel; refund to registrant |
| Competitions pilot | Only when `COMPETITIONS_ENABLED` + pilot slug |

## Residual (accept)

- Prize awards remain platform `ADJUSTMENT` (not escrowed from entry fees).
- Desk CASH competition settle credits club without IPG cash (same as desk court).
- Other chats may land more commits — redeploy after merge.
- “0 issues” means no known P0 money/access bugs after these deploys + SEP spot checks — not a lifetime warranty.
