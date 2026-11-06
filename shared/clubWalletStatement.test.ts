import { describe, expect, it } from 'vitest'
import {
  attachClubWalletBalanceAfter,
  clubWalletBalanceDelta,
  clubWalletStatementSignedAmount,
} from './clubWalletStatement.ts'

describe('clubWalletStatementSignedAmount', () => {
  it('signs credits, clawbacks and withdraw rows for the owner statement', () => {
    expect(clubWalletStatementSignedAmount({ type: 'BOOKING_CREDIT', amount: 100_000 })).toBe(100_000)
    expect(clubWalletStatementSignedAmount({ type: 'CLAWBACK', amount: -40_000 })).toBe(-40_000)
    expect(clubWalletStatementSignedAmount({ type: 'WITHDRAW_HOLD', amount: 50_000 })).toBe(-50_000)
    expect(clubWalletStatementSignedAmount({ type: 'WITHDRAW_RELEASE', amount: 50_000 })).toBe(50_000)
    expect(clubWalletStatementSignedAmount({ type: 'WITHDRAW_PAID', amount: 0, withdrawAmount: 50_000 })).toBe(-50_000)
  })
})

describe('clubWalletBalanceDelta', () => {
  it('holds do not move balance; paid withdraw does', () => {
    expect(clubWalletBalanceDelta({ type: 'WITHDRAW_HOLD', amount: 50_000 })).toBe(0)
    expect(clubWalletBalanceDelta({ type: 'WITHDRAW_PAID', amount: 0, withdrawAmount: 50_000 })).toBe(-50_000)
    expect(clubWalletBalanceDelta({ type: 'BOOKING_CREDIT', amount: 100_000 })).toBe(100_000)
  })
})

describe('attachClubWalletBalanceAfter', () => {
  it('walks newest-first from the live balance', () => {
    const rows = attachClubWalletBalanceAfter(
      [
        { type: 'WITHDRAW_PAID', amount: 0, withdrawAmount: 50_000 },
        { type: 'BOOKING_CREDIT', amount: 100_000 },
      ],
      50_000,
    )
    expect(rows[0]!.balanceAfter).toBe(50_000)
    expect(rows[1]!.balanceAfter).toBe(100_000)
  })
})
