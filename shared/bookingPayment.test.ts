import { afterEach, describe, expect, it } from 'vitest'
import {
  bookingPaymentChannelWhere,
  countActiveAthleteBookings,
  countsTowardRevenue,
  initialPlatformPaymentFields,
  initialStaffPaymentFields,
  isOnlinePaymentsEnabled,
  isPaymentChannel,
  isPaymentPayableOnline,
  isPaymentRefundable,
  isUnpaidPaymentStatus,
  isWalletPayableStatus,
  paymentRowChannelWhere,
  resolveParentPaymentMethod,
  resolvePaymentChannel,
  settledSpendAmount,
  sumAthleteSettledSpend,
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

  it('is true for live SEP mode (wallet top-up uses same checkout)', () => {
    process.env.PAYMENTS_MODE = 'live'
    expect(isOnlinePaymentsEnabled()).toBe(true)
  })
})

describe('initialPlatformPaymentFields', () => {
  const original = process.env.PAYMENTS_MODE

  afterEach(() => {
    process.env.PAYMENTS_MODE = original
  })

  it('requires online payments (no athlete pay-at-club)', () => {
    process.env.PAYMENTS_MODE = 'pay_at_club'
    expect(() => initialPlatformPaymentFields(500_000)).toThrow('ONLINE_PAYMENTS_REQUIRED')
  })

  it('uses pending online in test mode', () => {
    process.env.PAYMENTS_MODE = 'test'
    const fields = initialPlatformPaymentFields(500_000)
    expect(fields.paymentStatus).toBe('PENDING_ONLINE')
    expect(fields.payment.status).toBe('PENDING_ONLINE')
    expect(fields.payment.method).toBe('NOT_PAID')
  })
})

describe('initialStaffPaymentFields', () => {
  const original = process.env.PAYMENTS_MODE

  afterEach(() => {
    process.env.PAYMENTS_MODE = original
  })

  it('allows pay at club for coach/owner desk mode', () => {
    process.env.PAYMENTS_MODE = 'pay_at_club'
    expect(initialStaffPaymentFields(500_000)).toEqual({
      paymentStatus: 'PAY_AT_CLUB',
      payment: {
        amount: 500_000,
        method: 'CASH',
        status: 'PAY_AT_CLUB',
        provider: 'pay_at_club',
      },
    })
  })

  it('uses pending online when gateway is on', () => {
    process.env.PAYMENTS_MODE = 'test'
    const fields = initialStaffPaymentFields(500_000)
    expect(fields.paymentStatus).toBe('PENDING_ONLINE')
    expect(fields.payment.method).toBe('NOT_PAID')
  })
})

describe('payment helpers', () => {
  it('detects refundable paid payments', () => {
    expect(isPaymentRefundable('PAID')).toBe(true)
    expect(isPaymentRefundable('PAY_AT_CLUB')).toBe(false)
  })

  it('detects payable online statuses including FAILED for retry', () => {
    expect(isPaymentPayableOnline('PENDING_ONLINE')).toBe(true)
    expect(isPaymentPayableOnline('FAILED')).toBe(true)
    expect(isPaymentPayableOnline('PAID')).toBe(false)
  })

  it('detects unpaid desk statuses including FAILED', () => {
    expect(isUnpaidPaymentStatus('PAY_AT_CLUB')).toBe(true)
    expect(isUnpaidPaymentStatus('PENDING_AT_CLUB')).toBe(true)
    expect(isUnpaidPaymentStatus('FAILED')).toBe(true)
    expect(isUnpaidPaymentStatus('PAID')).toBe(false)
  })

  it('allows wallet settle for unpaid and failed statuses', () => {
    expect(isWalletPayableStatus('PAY_AT_CLUB')).toBe(true)
    expect(isWalletPayableStatus('FAILED')).toBe(true)
    expect(isWalletPayableStatus('PAID')).toBe(false)
  })

  it('counts only paid non-cancelled bookings toward revenue', () => {
    expect(countsTowardRevenue('CONFIRMED', 'PAID')).toBe(true)
    expect(countsTowardRevenue('CANCELLED', 'PAID')).toBe(false)
    expect(countsTowardRevenue('CONFIRMED', 'PAY_AT_CLUB')).toBe(false)
  })
})

describe('athlete hub settled spend', () => {
  it('sums only PAID non-cancelled payment amounts', () => {
    expect(sumAthleteSettledSpend([
      { status: 'CONFIRMED', payment: { amount: 500_000, status: 'PAID' } },
      { status: 'CONFIRMED', payment: { amount: 400_000, status: 'PAY_AT_CLUB' } },
      { status: 'CANCELLED', payment: { amount: 300_000, status: 'PAID' } },
      { status: 'CONFIRMED', paymentStatus: 'PAID', payment: { amount: 200_000, status: 'PAID' } },
    ])).toBe(700_000)
  })

  it('keeps multi-slot sibling amount 0 (never falls back to list price)', () => {
    expect(sumAthleteSettledSpend([
      { status: 'CONFIRMED', payment: { amount: 1_200_000, status: 'PAID' } },
      { status: 'CONFIRMED', payment: { amount: 0, status: 'PAID' } },
      { status: 'CONFIRMED', payment: { amount: 0, status: 'PAID' } },
    ])).toBe(1_200_000)
    expect(settledSpendAmount({ status: 'CONFIRMED', payment: { amount: 0, status: 'PAID' } })).toBe(0)
  })

  it('ignores unpaid desk and missing payment rows', () => {
    expect(settledSpendAmount({ status: 'CONFIRMED', paymentStatus: 'PAY_AT_CLUB' })).toBe(0)
    expect(settledSpendAmount({ status: 'CONFIRMED', payment: null })).toBe(0)
    expect(settledSpendAmount({
      status: 'CONFIRMED',
      paymentStatus: 'PAY_AT_CLUB',
      payment: { amount: 600_000, status: 'PAY_AT_CLUB' },
    })).toBe(0)
  })

  it('excludes cancelled from hub reservation count', () => {
    expect(countActiveAthleteBookings([
      { status: 'CONFIRMED' },
      { status: 'CANCELLED' },
      { status: 'PENDING' },
    ])).toBe(2)
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

describe('resolvePaymentChannel', () => {
  it('keeps IPG distinct from pay-on-site cash', () => {
    expect(resolvePaymentChannel('IPG', 'PAID')).toBe('IPG')
    expect(resolvePaymentChannel('CASH', 'PAID')).toBe('ON_SITE')
    expect(resolvePaymentChannel('CASH', 'PAY_AT_CLUB')).toBe('ON_SITE')
    expect(resolvePaymentChannel(null, 'PAY_AT_CLUB')).toBe('ON_SITE')
    expect(resolvePaymentChannel('PAID', 'PAID')).toBe('WALLET')
    expect(resolvePaymentChannel('NOT_PAID', 'PENDING_ONLINE')).toBeNull()
  })

  it('accepts only IPG and ON_SITE as admin channel filters', () => {
    expect(isPaymentChannel('IPG')).toBe(true)
    expect(isPaymentChannel('ON_SITE')).toBe(true)
    expect(isPaymentChannel('PAID')).toBe(false)
    expect(isPaymentChannel('CASH')).toBe(false)
  })

  it('builds booking where that does not mix IPG with cash', () => {
    expect(bookingPaymentChannelWhere('IPG')).toEqual({
      OR: [
        { paymentMethod: 'IPG' },
        { payment: { is: { method: 'IPG' } } },
      ],
    })
    expect(bookingPaymentChannelWhere('ON_SITE')?.OR).toEqual(
      expect.arrayContaining([
        { paymentMethod: 'CASH' },
        { payment: { is: { method: 'CASH' } } },
        { paymentStatus: { in: ['PAY_AT_CLUB', 'PENDING_AT_CLUB'] } },
      ]),
    )
    expect(paymentRowChannelWhere('IPG')).toEqual({ method: 'IPG' })
    expect(paymentRowChannelWhere('ON_SITE')).toEqual({ method: 'CASH' })
    expect(bookingPaymentChannelWhere('PAID')).toBeNull()
  })
})
