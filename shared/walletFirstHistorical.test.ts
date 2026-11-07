import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { planLiveWalletFirstIpg } from './walletFirstIpg.ts'
import { planWalletFirstHistorical } from './walletFirstHistorical.ts'

const { planWalletFirstHistorical: planFromCjs } = createRequire(import.meta.url)(
  '../scripts/dry-run-wallet-first-ipg.cjs',
)

const user = 'athlete-1'

describe('planLiveWalletFirstIpg', () => {
  it('pairs the captured card amount for an athlete booking', () => {
    expect(planLiveWalletFirstIpg({
      purpose: 'booking',
      method: 'IPG',
      provider: 'sep',
      amount: 2_500,
      metadata: {},
      paymentUserId: user,
      bookingUserId: user,
    })).toEqual({ action: 'pair', userId: user, amount: 2_500 })
  })

  it('uses only the card share after split promotion', () => {
    expect(planLiveWalletFirstIpg({
      purpose: 'booking',
      method: 'IPG',
      provider: 'sep',
      amount: 100_000,
      metadata: { splitPay: true, walletDebitAmount: 40_000, splitFullAmount: 100_000, ipgChargeAmount: 60_000 },
      paymentUserId: user,
    })).toMatchObject({ action: 'pair', amount: 60_000 })
  })

  it('leaves top-up and cash alone', () => {
    expect(planLiveWalletFirstIpg({
      purpose: 'topup', method: 'IPG', amount: 50_000, metadata: {}, paymentUserId: user,
    }).action).toBe('skip')
    expect(planLiveWalletFirstIpg({
      purpose: 'booking', method: 'CASH', amount: 50_000, metadata: {}, paymentUserId: user,
    })).toMatchObject({ action: 'skip', reason: 'cash' })
  })

  it('does not invent a wallet for a guest or a mismatched owner', () => {
    expect(planLiveWalletFirstIpg({
      purpose: 'booking', method: 'IPG', amount: 2_500, metadata: {}, paymentUserId: null, bookingUserId: null,
    })).toEqual({ action: 'unresolved', reason: 'no_account' })
    expect(planLiveWalletFirstIpg({
      purpose: 'booking', method: 'IPG', amount: 2_500, metadata: {}, paymentUserId: 'a', bookingUserId: 'b',
    })).toEqual({ action: 'unresolved', reason: 'owner_mismatch' })
  })
})

describe('planWalletFirstHistorical', () => {
  it('reconstructs an active IPG booking as a net-zero pair and does not refund it', () => {
    const plan = planWalletFirstHistorical({
      paymentId: 'pay-active',
      method: 'IPG',
      provider: 'sep',
      purpose: 'booking',
      paymentStatus: 'PAID',
      bookingStatus: 'CONFIRMED',
      amount: 2_500,
      paymentUserId: user,
      bookingUserId: user,
      metadata: {},
      walletTxs: [],
      refundCreditSum: 0,
    })
    expect(plan.reconstruction).toMatchObject({
      action: 'pair',
      kind: 'booking_ledger',
      amount: 2_500,
      debitType: 'IPG_BOOKING_DEBIT',
      netWalletToman: 0,
      netClubToman: 0,
    })
    expect(plan.refundCorrection).toMatchObject({ action: 'skip', reason: 'not_cancelled' })
    expect(plan.refundClubImpactToman).toBe(0)
  })

  it('does not wallet-credit tracking 1541908 card reversal', () => {
    const plan = planWalletFirstHistorical({
      paymentId: 'cmw6fj7n200mbqm30rearf7hd',
      method: 'IPG',
      provider: 'sep',
      purpose: 'booking',
      paymentStatus: 'REFUNDED',
      bookingStatus: 'CANCELLED',
      amount: 2_500,
      paymentUserId: user,
      bookingUserId: user,
      metadata: {
        refundChannel: 'gateway_reverse',
        gatewayReversed: true,
        gatewayRefund: true,
        reversePending: false,
        refundCreditAmount: 0,
        refundedAmount: 0,
      },
      walletTxs: [],
      refundCreditSum: 0,
      unclawedOwnerNet: 0,
    })
    expect(plan.reconstruction).toMatchObject({
      action: 'pair',
      kind: 'card_returned',
      debitType: 'IPG_RETURNED_TO_CARD',
      amount: 2_500,
      netWalletToman: 0,
    })
    expect(plan.refundCorrection).toMatchObject({ action: 'skip', reason: 'card_already_reversed' })
    expect(plan.refundClubImpactToman).toBe(0)
  })

  it('leaves bank_outcome_unknown and reversePending unresolved', () => {
    const unknown = planWalletFirstHistorical({
      paymentId: 'pay-unknown',
      method: 'IPG',
      paymentStatus: 'REFUNDED',
      bookingStatus: 'CANCELLED',
      amount: 10_000,
      paymentUserId: user,
      metadata: {},
      walletTxs: [],
      refundCreditSum: 0,
    })
    expect(unknown.reconstruction).toMatchObject({ action: 'none', reason: 'bank_outcome_unknown' })
    expect(unknown.refundCorrection).toMatchObject({ action: 'unresolved', reason: 'bank_outcome_unknown' })

    const pending = planWalletFirstHistorical({
      paymentId: 'pay-pending',
      method: 'IPG',
      paymentStatus: 'PAID',
      bookingStatus: 'CANCELLED',
      amount: 10_000,
      paymentUserId: user,
      metadata: { reversePending: true },
      walletTxs: [],
      refundCreditSum: 0,
    })
    expect(pending.reconstruction).toMatchObject({ action: 'none', reason: 'bank_outcome_pending' })
    expect(pending.refundCorrection).toMatchObject({ action: 'unresolved', reason: 'bank_outcome_pending' })
  })

  it('separates a proven cancel refund from the net-zero booking pair', () => {
    const plan = planWalletFirstHistorical({
      paymentId: 'pay-cancel',
      method: 'IPG',
      paymentStatus: 'REFUNDED',
      bookingStatus: 'CANCELLED',
      amount: 80_000,
      paymentUserId: user,
      metadata: { refundChannel: 'wallet_closed_loop', refundCreditAmount: 80_000 },
      walletTxs: [],
      refundCreditSum: 0,
      unclawedOwnerNet: 72_000,
    })
    expect(plan.reconstruction).toMatchObject({ action: 'pair', kind: 'booking_ledger', netWalletToman: 0 })
    expect(plan.refundCorrection).toMatchObject({ action: 'credit', amount: 80_000 })
    expect(plan.refundClubImpactToman).toBe(-72_000)
  })

  it('does not propose a second pair or relabel cash', () => {
    const done = planWalletFirstHistorical({
      paymentId: 'pay-done',
      method: 'IPG',
      paymentStatus: 'PAID',
      bookingStatus: 'CONFIRMED',
      amount: 2_500,
      paymentUserId: user,
      metadata: {},
      walletTxs: [
        { type: 'IPG_BOOKING_CREDIT', amount: 2_500 },
        { type: 'IPG_BOOKING_DEBIT', amount: -2_500 },
      ],
      refundCreditSum: 0,
    })
    expect(done.reconstruction).toMatchObject({ action: 'none', reason: 'already_reconstructed' })

    const cash = planWalletFirstHistorical({
      paymentId: 'pay-cash',
      method: 'CASH',
      paymentStatus: 'PAID',
      bookingStatus: 'CONFIRMED',
      amount: 2_500,
      paymentUserId: user,
      metadata: {},
      walletTxs: [],
      refundCreditSum: 0,
    })
    expect(cash.reconstruction).toMatchObject({ action: 'none', reason: 'cash_not_ipg' })
    expect(cash.refundCorrection.action).not.toBe('credit')
  })

  it('matches the standalone production dry-run planner', () => {
    const input = {
      paymentId: 'cmw6fj7n200mbqm30rearf7hd',
      method: 'IPG',
      provider: 'sep',
      purpose: 'booking',
      paymentStatus: 'REFUNDED',
      bookingStatus: 'CANCELLED',
      amount: 2_500,
      paymentUserId: user,
      bookingUserId: user,
      metadata: {
        refundChannel: 'gateway_reverse',
        gatewayReversed: true,
        gatewayRefund: true,
        reversePending: false,
        refundCreditAmount: 0,
        refundedAmount: 0,
      },
      walletTxs: [],
      refundCreditSum: 0,
      unclawedOwnerNet: 0,
    }
    expect(planFromCjs(input)).toEqual(planWalletFirstHistorical(input))
  })
})
