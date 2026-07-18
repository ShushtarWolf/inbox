import { afterEach, describe, expect, it } from 'vitest'
import {
  countsTowardRevenue,
  initialPlatformPaymentFields,
  isOnlinePaymentsEnabled,
  isPaymentPayableOnline,
  isPaymentRefundable,
  isUnpaidPaymentStatus,
  isWalletPayableStatus,
  resolveParentPaymentMethod,
} from './bookingPayment.ts'

describe('isOnlinePaymentsEnabled', () => {
  const original = process.env.PAYMENTS_MODE

  afterEach(() => {
    process.env.PAYMENTS_MODE = original
  })

  it('is false for pay_at_club mode', () => {
    process.env.PAYMENTS_MODE = 'pay_at_club'
    expect(isOnlinePaymentsEnabled()).toBe(false)
  })

  it('is true for test mode', () => {
    process.env.PAYMENTS_MODE = 'test'
    expect(isOnlinePaymentsEnabled()).toBe(true)
  })
})

describe('initialPlatformPaymentFields', () => {
  const original = process.env.PAYMENTS_MODE

  afterEach(() => {
    process.env.PAYMENTS_MODE = original
  })

  it('defaults to pay at club', () => {
    process.env.PAYMENTS_MODE = 'pay_at_club'
    expect(initialPlatformPaymentFields(500_000)).toEqual({
      paymentStatus: 'PAY_AT_CLUB',
      payment: {
        amount: 500_000,
        method: 'CASH',
        status: 'PAY_AT_CLUB',
        provider: 'pay_at_club',
      },
    })
  })

  it('uses pending online in test mode', () => {
    process.env.PAYMENTS_MODE = 'test'
    const fields = initialPlatformPaymentFields(500_000)
    expect(fields.paymentStatus).toBe('PENDING_ONLINE')
    expect(fields.payment.status).toBe('PENDING_ONLINE')
    expect(fields.payment.method).toBe('NOT_PAID')
  })
})

describe('payment helpers', () => {
  it('detects refundable paid payments', () => {
    expect(isPaymentRefundable('PAID')).toBe(true)
    expect(isPaymentRefundable('PAY_AT_CLUB')).toBe(false)
  })

  it('detects payable online statuses', () => {
    expect(isPaymentPayableOnline('PENDING_ONLINE')).toBe(true)
    expect(isPaymentPayableOnline('PAID')).toBe(false)
  })

  it('detects unpaid desk statuses', () => {
    expect(isUnpaidPaymentStatus('PAY_AT_CLUB')).toBe(true)
    expect(isUnpaidPaymentStatus('PENDING_AT_CLUB')).toBe(true)
    expect(isUnpaidPaymentStatus('PAID')).toBe(false)
  })

  it('allows wallet settle for unpaid desk statuses', () => {
    expect(isWalletPayableStatus('PAY_AT_CLUB')).toBe(true)
    expect(isWalletPayableStatus('PAID')).toBe(false)
  })

  it('counts only paid non-cancelled bookings toward revenue', () => {
    expect(countsTowardRevenue('CONFIRMED', 'PAID')).toBe(true)
    expect(countsTowardRevenue('CANCELLED', 'PAID')).toBe(false)
    expect(countsTowardRevenue('CONFIRMED', 'PAY_AT_CLUB')).toBe(false)
  })
})

describe('resolveParentPaymentMethod (payment sync)', () => {
  it('maps cash desk mark-paid onto booking.paymentMethod', () => {
    expect(resolveParentPaymentMethod('CASH', 'PAID')).toBe('CASH')
  })

  it('maps wallet checkout method PAID onto booking.paymentMethod', () => {
    expect(resolveParentPaymentMethod('PAID', 'PAID')).toBe('PAID')
  })

  it('maps IPG paid onto booking.paymentMethod', () => {
    expect(resolveParentPaymentMethod('IPG', 'PAID')).toBe('IPG')
  })

  it('keeps method on refund', () => {
    expect(resolveParentPaymentMethod('CASH', 'REFUNDED')).toBe('CASH')
    expect(resolveParentPaymentMethod('PAID', 'REFUNDED')).toBe('PAID')
  })

  it('does not set parent method while still unpaid', () => {
    expect(resolveParentPaymentMethod('CASH', 'PAY_AT_CLUB')).toBeUndefined()
    expect(resolveParentPaymentMethod('NOT_PAID', 'PENDING_ONLINE')).toBeUndefined()
  })
})
