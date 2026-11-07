import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { auditWalletBalance, naiveGapExplainedByNonDelta } from './walletBalanceAudit.ts'

const { decide } = createRequire(import.meta.url)('../scripts/audit-wallet-balances.cjs')

describe('auditWalletBalance', () => {
  it('does not treat the transcribed club naive sum as the balance', () => {
    const result = auditWalletBalance({
      walletId: 'club-wallet',
      kind: 'club',
      ownerId: 'club-1',
      storedBalance: 1_979_000,
      availableBalance: 1_979_000,
      lockedBalance: 0,
      withdrawPaidToman: 0,
      txs: [
        { type: 'BOOKING_CREDIT', amount: 1_979_000 },
        { type: 'LOCK', amount: 8_000_000 },
        { type: 'UNLOCK', amount: 5_195_500 },
      ],
    })
    expect(result.naiveSum).toBe(15_174_500)
    expect(result.naiveGap).toBe(13_195_500)
    expect(result.semanticExpected).toBe(1_979_000)
    expect(result.delta).toBe(0)
    expect(result.proposal).toBeNull()
    expect(naiveGapExplainedByNonDelta(result)).toBe(true)
  })

  it('proposes an append-only adjustment only for a semantic gap', () => {
    const result = auditWalletBalance({
      walletId: 'w1',
      kind: 'athlete',
      ownerId: 'u1',
      storedBalance: 40_000,
      availableBalance: 40_000,
      lockedBalance: 0,
      withdrawPaidToman: 0,
      txs: [{ type: 'TOPUP_CREDIT', amount: 50_000 }],
    })
    expect(result.semanticExpected).toBe(50_000)
    expect(result.delta).toBe(10_000)
    expect(result.proposal).toMatchObject({ appendAmount: 10_000, type: 'ADJUSTMENT', moves: 'balance_and_available' })
  })

  it('subtracts paid withdraw requests and ignores a zero WITHDRAW_PAID row', () => {
    const result = auditWalletBalance({
      walletId: 'club-wallet',
      kind: 'club',
      ownerId: 'club-1',
      storedBalance: 700_000,
      availableBalance: 700_000,
      lockedBalance: 0,
      withdrawPaidToman: 300_000,
      txs: [
        { type: 'BOOKING_CREDIT', amount: 1_000_000 },
        { type: 'WITHDRAW_HOLD', amount: 300_000 },
        { type: 'WITHDRAW_PAID', amount: 0 },
      ],
    })
    expect(result.semanticExpected).toBe(700_000)
    expect(result.proposal).toBeNull()
  })

  it('refuses a proposal when a counter or a type is unexplained', () => {
    const split = auditWalletBalance({
      walletId: 'w1',
      kind: 'athlete',
      ownerId: 'u1',
      storedBalance: 10_000,
      availableBalance: 4_000,
      lockedBalance: 0,
      withdrawPaidToman: 0,
      txs: [{ type: 'TOPUP_CREDIT', amount: 10_000 }],
    })
    expect(split.confidence).toBe('insufficient')
    expect(split.proposal).toBeNull()

    const unknown = auditWalletBalance({
      walletId: 'w1',
      kind: 'club',
      ownerId: 'c1',
      storedBalance: 0,
      availableBalance: 0,
      lockedBalance: 0,
      withdrawPaidToman: 0,
      txs: [{ type: 'MYSTERY', amount: 5_000 }],
    })
    expect(unknown.unknownTypes).toEqual(['MYSTERY'])
    expect(unknown.proposal).toBeNull()

    const paidRow = auditWalletBalance({
      walletId: 'w1',
      kind: 'club',
      ownerId: 'c1',
      storedBalance: 0,
      availableBalance: 0,
      lockedBalance: 0,
      withdrawPaidToman: 100,
      txs: [
        { type: 'BOOKING_CREDIT', amount: 100 },
        { type: 'WITHDRAW_PAID', amount: -100 },
      ],
    })
    expect(paidRow.proposal).toBeNull()
    expect(paidRow.insufficientReasons).toContain('withdraw_paid_row_amount_nonzero')
  })

  it('does not turn a card reversal or a missing guest into a wallet credit', () => {
    const athlete = auditWalletBalance({
      walletId: 'cmust3mdk0001mi3kq8kjco5y',
      kind: 'athlete',
      ownerId: 'cmszubaum002wp537lorvhjmp',
      storedBalance: 50_000,
      availableBalance: 50_000,
      lockedBalance: 0,
      withdrawPaidToman: 0,
      txs: [{ type: 'TOPUP_CREDIT', amount: 50_000 }],
    })
    expect(athlete.delta).toBe(0)
    expect(athlete.proposal).toBeNull()
  })

  it('matches the production audit script on the same aggregates', () => {
    const txs = [
      { type: 'BOOKING_CREDIT', amount: 1_979_000 },
      { type: 'LOCK', amount: 8_000_000 },
      { type: 'UNLOCK', amount: 5_195_500 },
    ]
    const audit = auditWalletBalance({
      walletId: 'club-wallet',
      kind: 'club',
      ownerId: 'club-1',
      storedBalance: 1_979_000,
      availableBalance: 1_979_000,
      lockedBalance: 0,
      withdrawPaidToman: 0,
      txs,
    })
    const script = decide({
      walletId: 'club-wallet',
      kind: 'club',
      ownerId: 'club-1',
      storedBalance: 1_979_000,
      availableBalance: 1_979_000,
      lockedBalance: 0,
      signedSum: 1_979_000,
      naiveSum: 15_174_500,
      nonDeltaSum: 13_195_500,
      withdrawPaidToman: 0,
      withdrawPaidNonZeroRows: 0,
      unknownTypes: '',
      txCount: 3,
    })
    expect(script.delta).toBe(audit.delta)
    expect(script.proposal).toBeNull()
    expect(script.naiveGapExplainedByNonDelta).toBe(true)
    expect(audit.naiveSum).toBe(15_174_500)
  })
})
