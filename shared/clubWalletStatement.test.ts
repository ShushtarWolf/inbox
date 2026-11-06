import assert from 'node:assert/strict'
import {
  attachClubWalletBalanceAfter,
  clubWalletBalanceDelta,
  clubWalletStatementSignedAmount,
} from './clubWalletStatement.ts'

assert.equal(clubWalletStatementSignedAmount({ type: 'BOOKING_CREDIT', amount: 100_000 }), 100_000)
assert.equal(clubWalletStatementSignedAmount({ type: 'CLAWBACK', amount: -40_000 }), -40_000)
assert.equal(clubWalletStatementSignedAmount({ type: 'WITHDRAW_HOLD', amount: 50_000 }), -50_000)
assert.equal(clubWalletStatementSignedAmount({ type: 'WITHDRAW_RELEASE', amount: 50_000 }), 50_000)
assert.equal(clubWalletStatementSignedAmount({ type: 'WITHDRAW_PAID', amount: 0, withdrawAmount: 50_000 }), -50_000)

assert.equal(clubWalletBalanceDelta({ type: 'WITHDRAW_HOLD', amount: 50_000 }), 0)
assert.equal(clubWalletBalanceDelta({ type: 'WITHDRAW_PAID', amount: 0, withdrawAmount: 50_000 }), -50_000)
assert.equal(clubWalletBalanceDelta({ type: 'BOOKING_CREDIT', amount: 100_000 }), 100_000)

// Newest first: paid withdraw then credit. Live balance 50k after credit 100k and paid 50k.
const withAfter = attachClubWalletBalanceAfter(
  [
    { type: 'WITHDRAW_PAID', amount: 0, withdrawAmount: 50_000 },
    { type: 'BOOKING_CREDIT', amount: 100_000 },
  ],
  50_000,
)
assert.equal(withAfter[0].balanceAfter, 50_000)
assert.equal(withAfter[1].balanceAfter, 100_000)

console.log('clubWalletStatement: ok')
