# Historical cancel refund repair

Dry-run by default. Nothing is deleted. Prior payment, booking, and ledger rows are not rewritten to hide a gap. A reviewed apply appends a wallet credit, a club clawback when a settlement is still open, and one `RefundReconciliation` row.

```bash
node --import tsx scripts/repair-historical-cancel-refunds.ts
TRACKING=1541908 node --import tsx scripts/repair-historical-cancel-refunds.ts
APPLY=yes node --import tsx scripts/repair-historical-cancel-refunds.ts
```

`APPLY=yes` is not part of deploy. Run it only after a dry-run has been reviewed, and only against a database you intend to change. Re-run the dry-run afterward. `creditCount` should be 0.

## Credit only when all of these are true

- The booking is `CANCELLED` or the payment is `REFUNDED`.
- The payment is not desk cash (`method` and booking method are not `CASH`).
- A verified `userId` is already on the payment or the booking. Guest phone numbers are not matched to accounts.
- The card was not reversed: `gatewayReversed` and `gatewayRefund` are not true, except a split payment may still restore `walletDebitAmount` when that wallet share was not already released or credited.
- `reversePending` is not set.
- For an IPG row, the wallet path is positively recorded (`refundChannel=wallet_closed_loop`, `method=PAID`, or `reverseFailedAt`). Empty metadata is unresolved, not a credit.
- Owed toman is taken from `refundCreditAmount`, `refundedAmount`, `refundBps`, or `sessionRefundsTotal` when present, otherwise the full amount only on a proven wallet path.
- Existing `REFUND_CREDIT` sums are subtracted. The stable key `recon:historical-cancel:{paymentId}` blocks a second apply.

## Left unresolved on purpose

- `bank_outcome_pending` — `reversePending` and no completed reverse flag.
- `bank_outcome_unknown` — IPG cancel with no record of a wallet path or a card reverse.
- `no_verified_account` — no `userId`.
- `owed_amount_unknown` — cancel is visible but the owed share is not recorded.

Those rows are counted in the dry-run and are not credited.

## Receipt tracking code

`1541908` is `bookingTrackingCode(bookingId)` (`shared/receiptToken.ts`). It is not stored. The dry-run scans booking ids and prints the matching booking id, payment id, and decision. It does not print names or phone numbers.
