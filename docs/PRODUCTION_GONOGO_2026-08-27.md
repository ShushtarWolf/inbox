# Production go / no-go (post P0/P1/P2)

Date: 2026-08-27. Host: Liara `inbox` / `inboxs.ir`.

Related: [PAYMENTS.md](./PAYMENTS.md) · [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) · [OPERATIONS.md](./OPERATIONS.md)

## Deploy status

| Check | Result |
|-------|--------|
| GitHub Actions Deploy to Liara (`a8bc6f4`) | **PASS** — run 33076760845 green |
| `prisma migrate deploy` on boot | Expected via `start-production.mjs` (includes partner unique if pending) |
| Local post-deploy dump | `/Users/siamakghodsi/Projects/inbox/backups/inbox-db-20260827-170843.dump` |
| Public `GET /api/payments/mode` | `mode=live`, `onlineCheckoutEnabled=true` |

## Money / payments

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| M-01 | Competition entry fees settle to club on PAID | **CODE FIXED** (pending redeploy of P2) | `resolveClubIdForPayment` + desk `creditOwnerForPaidPayment` |
| M-02 | Athlete withdraw only cash-backed settlement | **CODE FIXED** (pending redeploy of P2) | Top-up / refund / prize not bank-withdrawable |
| M-03 | SEP live on production | **LIVE** | Confirm terminal + callback with admin `payments-status` |
| M-04 | Manual SEP checklist in PAYMENTS.md | **OPS** | Keep verifying cancel reverse, double callback, SMS soft-fail |
| M-05 | Historical competition PAID rows | **OPS** | Pre-P2 PAID entries may lack ledger; desk re-mark / one-off settle if needed |

## SEP live verify (ops — do not flip mode; already `live`)

Run with admin secret:

```bash
curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" \
  https://inboxs.ir/api/admin/payments-status
```

Expect: `paymentsMode=live`, `hasSepTerminalId=true`, `liveReady=true`, no terminal id in body.

Manual spots (from PAYMENTS.md): book→pay→PAID; NOK retry; double callback; cancel reverse or wallet fallback; SMS soft-fail; callback URL `https://inboxs.ir/payments/callback/sep`.

## Role / product gates

| Check | Expect |
|-------|--------|
| Staff invite by phone (a8bc6f4) | OTP login works for invited staff |
| Dual-role switcher | Visible on athlete hub / coach profile / owner settings when 2 roles |
| Partner cancel | Doubles partner can cancel; refund to registrant |
| Competitions pilot | Only when `COMPETITIONS_ENABLED` + pilot slug |

## Residual (accept — not zero forever)

- Prize awards are still platform `ADJUSTMENT` (not escrowed from entry fees).
- Desk CASH competition settle credits club without IPG cash (same class as desk court mark-paid).
- Another agent chat may land more commits — redeploy after merge.
- “0 issues” = no known P0 money/access bugs after P2 deploy + SEP spot checks above.

## Next ship

1. Merge/commit P2 money fixes.
2. `gh workflow run deploy.yml --ref main` + watch.
3. Post-deploy local backup again.
4. Spot-check: competition paid entry → club wallet ledger; athlete wallet withdrawable ≈ 0 without settlement.
