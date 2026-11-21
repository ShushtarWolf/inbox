import { describe, expect, it } from 'vitest'
import {
  capCreditToPaymentHeadroom,
  creditWouldBeSeriesResidual,
  isIb47ResidualCanonicalPrimary,
  proposedResidualOwed,
} from './moneyRepairGuards.ts'

describe('moneyRepairGuards IB-47 mutual exclusion', () => {
  it('marks season primary with partial session refunds as IB-47 canonical', () => {
    expect(isIb47ResidualCanonicalPrimary({
      method: 'IPG',
      status: 'PAID',
      amount: 360_000,
      metadataJson: JSON.stringify({ seasonBookingId: 's1', sessionRefundsTotal: 144_000 }),
    })).toBe(true)
  })

  it('residual owed uses all REFUND_CREDIT rows (ledger headroom)', () => {
    expect(proposedResidualOwed({
      amount: 360_000,
      sessionRefundsTotal: 144_000,
      refundCreditSum: 144_000,
    })).toBe(216_000)
    expect(proposedResidualOwed({
      amount: 360_000,
      sessionRefundsTotal: 144_000,
      refundCreditSum: 200_000,
    })).toBe(160_000)
  })

  it('caps proposed credit to payment headroom after all REFUND_CREDIT', () => {
    expect(capCreditToPaymentHeadroom(360_000, 200_000, 216_000)).toBe(160_000)
    expect(capCreditToPaymentHeadroom(360_000, 360_000, 10_000)).toBe(0)
  })

  it('detects residual-sized IB-13 credit', () => {
    expect(creditWouldBeSeriesResidual({
      primaryAmount: 360_000,
      alreadyRefundedOnPrimary: 144_000,
      proposedCredit: 216_000,
    })).toBe(true)
    expect(creditWouldBeSeriesResidual({
      primaryAmount: 360_000,
      alreadyRefundedOnPrimary: 144_000,
      proposedCredit: 72_000,
    })).toBe(false)
  })
})