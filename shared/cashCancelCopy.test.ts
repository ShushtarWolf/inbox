import { describe, expect, it } from 'vitest'
import { athleteCancelConfirmKey, athleteCancelNoticeKey, isCashPaidBooking } from './cancelNotice.ts'
import { carriedDeskDiscount, requestHasNoDiscount } from './deskDiscountCarry.ts'
import fa from '../i18n/locales/fa.json'

describe('cash cancel copy never promises a wallet refund', () => {
  it('detects a cash-paid booking (payment method or booking method)', () => {
    expect(isCashPaidBooking({ paymentMethod: 'CASH', paymentStatus: 'PAID' })).toBe(true)
    expect(isCashPaidBooking({ paymentMethod: null, bookingPaymentMethod: 'CASH', paymentStatus: 'PAID' })).toBe(true)
    expect(isCashPaidBooking({ paymentMethod: 'IPG', bookingPaymentMethod: 'CASH', paymentStatus: 'PAID' })).toBe(false)
    expect(isCashPaidBooking({ paymentMethod: 'PAID', paymentStatus: 'PAID' })).toBe(false)
    expect(isCashPaidBooking({ paymentMethod: 'CASH', paymentStatus: 'PAY_AT_CLUB' })).toBe(false)
  })

  it('confirm: cash says settle with the club, whatever the refund window', () => {
    for (const refundBps of [10_000, 5_000, 0]) {
      expect(athleteCancelConfirmKey({ paymentMethod: 'CASH', paymentStatus: 'PAID', refundBps }))
        .toBe('booking.confirmCancelCash')
    }
  })

  it('confirm: unpaid never mentions a wallet refund; online/wallet keeps the wallet copy', () => {
    expect(athleteCancelConfirmKey({ paymentMethod: 'CASH', paymentStatus: 'PAY_AT_CLUB', refundBps: 10_000 }))
      .toBe('booking.confirmCancelUnpaid')
    expect(athleteCancelConfirmKey({ paymentMethod: 'IPG', paymentStatus: 'PENDING_ONLINE', refundBps: 10_000 }))
      .toBe('booking.confirmCancelUnpaid')
    expect(athleteCancelConfirmKey({ paymentMethod: 'IPG', paymentStatus: 'PAID', refundBps: 10_000 }))
      .toBe('booking.confirmCancel')
    expect(athleteCancelConfirmKey({ paymentMethod: 'PAID', paymentStatus: 'PAID', refundBps: 5_000 }))
      .toBe('booking.confirmCancelPartialRefund')
    expect(athleteCancelConfirmKey({ paymentMethod: 'IPG', paymentStatus: 'PAID', refundBps: 0 }))
      .toBe('booking.confirmCancelNoRefund')
  })

  it('result notice: desk cash wins over a zero-refund window', () => {
    expect(athleteCancelNoticeKey({ moneyOutcome: 'zero_refund', refundChannel: 'desk_cash' }))
      .toBe('booking.refundCashAtClub')
  })

  it('cash / unpaid copy has no wallet-refund promise; it names the club', () => {
    const b = fa.booking as unknown as Record<string, string>
    const o = fa.owner as unknown as Record<string, string>
    for (const text of [b.confirmCancelCash, b.cashSettleWithClub, b.refundCashAtClub, o.cancelPaidCashNoWallet, o.cancelCashDoneFlash]) {
      expect(text).toContain('نقدی')
      expect(text).toContain('باشگاه')
      expect(text).not.toMatch(/به کیف پول(?: شما| ورزشکار)? برمی‌گردد/)
    }
    expect(b.confirmCancelUnpaid).not.toMatch(/به کیف پول(?: شما)? برمی‌گردد/)
  })
})

describe('desk discount carry on re-save', () => {
  it('reads code / desk percent / complimentary from payment metadata', () => {
    expect(carriedDeskDiscount(JSON.stringify({ discountCode: 'HALF', discountPercent: 50, discountAmount: 240000 })))
      .toEqual({ kind: 'code', code: 'HALF', percent: 50 })
    expect(carriedDeskDiscount(JSON.stringify({ deskDiscountPercent: 20 }))).toEqual({ kind: 'percent', percent: 20 })
    expect(carriedDeskDiscount(JSON.stringify({ complimentary: true }))).toEqual({ kind: 'complimentary' })
    expect(carriedDeskDiscount('{}')).toBeNull()
    expect(carriedDeskDiscount('not json')).toBeNull()
    expect(carriedDeskDiscount(null)).toBeNull()
  })

  it('only carries when the request sends no discount of its own', () => {
    expect(requestHasNoDiscount({})).toBe(true)
    expect(requestHasNoDiscount({ complimentary: false, deskDiscountPercent: 0 })).toBe(true)
    expect(requestHasNoDiscount({ discountCode: 'X' })).toBe(false)
    expect(requestHasNoDiscount({ deskDiscountPercent: 10 })).toBe(false)
    expect(requestHasNoDiscount({ complimentary: true })).toBe(false)
  })
})
