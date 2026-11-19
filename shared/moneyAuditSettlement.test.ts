import { describe, expect, it } from 'vitest'
import {
  isSeriesChargeSiblingRow,
  shouldExpectSettlementLedgerEntry,
} from './deskPaidGuard.ts'

describe('shouldExpectSettlementLedgerEntry', () => {
  it('excludes zero-amount series siblings with coveredByBookingId', () => {
    expect(shouldExpectSettlementLedgerEntry({
      status: 'PAID',
      method: 'IPG',
      amount: 0,
      gatewayRef: '9911',
      metadataJson: JSON.stringify({ coveredByBookingId: 'primary-pay-booking' }),
    })).toBe(false)
    expect(isSeriesChargeSiblingRow(JSON.stringify({ coveredByBookingId: 'b1' }))).toBe(true)
  })

  it('expects settlement for wallet-rail PAID with positive amount', () => {
    expect(shouldExpectSettlementLedgerEntry({
      status: 'PAID',
      method: 'PAID',
      amount: 50_000,
    })).toBe(true)
  })

  it('excludes desk IPG+PAID without verified capture', () => {
    expect(shouldExpectSettlementLedgerEntry({
      status: 'PAID',
      method: 'IPG',
      amount: 50_000,
      metadataJson: '{}',
    })).toBe(false)
  })

  it('expects zero-amount checkout with verified flag', () => {
    expect(shouldExpectSettlementLedgerEntry({
      status: 'PAID',
      method: 'IPG',
      amount: 0,
      metadataJson: JSON.stringify({ zeroAmountCheckout: true }),
    })).toBe(true)
  })
})