import { describe, expect, it } from 'vitest'
import {
  canSettleOwnerForPaidPayment,
  DESK_ONLINE_PAID_MUST_CANCEL,
  DESK_PAYMENT_METHOD_LOCKED,
  DESK_PAYMENT_VERIFY_PENDING,
  hasVerifiedIpgCapture,
  athleteAttemptedDeskCashConfirm,
  resolveDeskPaymentWrite,
} from './deskPaidGuard.ts'

describe('hasVerifiedIpgCapture', () => {
  it('accepts a bound gatewayRef', () => {
    expect(hasVerifiedIpgCapture({ gatewayRef: '9911' })).toBe(true)
  })

  it('rejects empty or whitespace gatewayRef', () => {
    expect(hasVerifiedIpgCapture({ gatewayRef: '' })).toBe(false)
    expect(hasVerifiedIpgCapture({ gatewayRef: '   ' })).toBe(false)
    expect(hasVerifiedIpgCapture({ gatewayRef: null })).toBe(false)
  })

  it('accepts simulated confirm metadata', () => {
    expect(hasVerifiedIpgCapture({
      metadataJson: JSON.stringify({ simulated: true, confirmedAt: '2026-11-11T10:00:00.000Z' }),
    })).toBe(true)
  })

  it('rejects simulated flag without confirm timestamp', () => {
    expect(hasVerifiedIpgCapture({
      metadataJson: JSON.stringify({ simulated: true }),
    })).toBe(false)
  })

  it('accepts gatewayCaptured flag', () => {
    expect(hasVerifiedIpgCapture({
      metadataJson: JSON.stringify({ gatewayCaptured: true }),
    })).toBe(true)
  })
})

describe('canSettleOwnerForPaidPayment', () => {
  it('never settles CASH', () => {
    expect(canSettleOwnerForPaidPayment({ method: 'CASH', gatewayRef: 'x' })).toBe(false)
  })

  it('settles wallet-rail PAID without a gatewayRef', () => {
    expect(canSettleOwnerForPaidPayment({ method: 'PAID' })).toBe(true)
  })

  it('settles IPG only after a verified capture', () => {
    expect(canSettleOwnerForPaidPayment({ method: 'IPG' })).toBe(false)
    expect(canSettleOwnerForPaidPayment({ method: 'IPG', gatewayRef: '9911' })).toBe(true)
  })
})

describe('resolveDeskPaymentWrite', () => {
  it('forces CASH when the desk marks an unpaid IPG pay-link paid', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'IPG',
      requestedPaid: true,
      previousMethod: 'IPG',
      previousStatus: 'PAY_AT_CLUB',
    })
    expect(decision).toMatchObject({
      method: 'CASH',
      status: 'PAID',
      forcedCashForManualPaid: true,
    })
    expect(decision.error).toBeUndefined()
  })

  it('forces CASH when creating a new desk booking as IPG+PAID', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'IPG',
      requestedPaid: true,
    })
    expect(decision).toMatchObject({
      method: 'CASH',
      status: 'PAID',
      forcedCashForManualPaid: true,
    })
  })

  it('keeps unpaid pay-links as IPG + PAY_AT_CLUB', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'IPG',
      requestedPaid: false,
      previousMethod: 'IPG',
      previousStatus: 'PENDING_ONLINE',
    })
    expect(decision).toEqual({
      method: 'IPG',
      status: 'PAY_AT_CLUB',
      forcedCashForManualPaid: false,
    })
  })

  it('keeps a verified paid IPG booking on IPG and rejects a switch to CASH', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'CASH',
      requestedPaid: true,
      previousMethod: 'IPG',
      previousStatus: 'PAID',
      gatewayRef: '9911',
    })
    expect(decision.method).toBe('IPG')
    expect(decision.status).toBe('PAID')
    expect(decision.error?.statusMessage).toBe(DESK_PAYMENT_METHOD_LOCKED)
  })

  it('rejects switching a paid CASH booking to IPG', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'IPG',
      requestedPaid: true,
      previousMethod: 'CASH',
      previousStatus: 'PAID',
    })
    expect(decision.method).toBe('CASH')
    expect(decision.error?.statusMessage).toBe(DESK_PAYMENT_METHOD_LOCKED)
  })

  it('rejects marking a verified or in-flight capture paid from the desk', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'IPG',
      requestedPaid: true,
      previousMethod: 'IPG',
      previousStatus: 'PENDING_ONLINE',
      gatewayRef: '9911',
    })
    expect(decision.error?.statusMessage).toBe(DESK_PAYMENT_VERIFY_PENDING)
    expect(decision.status).toBe('PAY_AT_CLUB')
  })

  it('rejects desk mark-unpaid on an online paid booking', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'IPG',
      requestedPaid: false,
      previousMethod: 'IPG',
      previousStatus: 'PAID',
      gatewayRef: '9911',
    })
    expect(decision.error?.statusMessage).toBe(DESK_ONLINE_PAID_MUST_CANCEL)
    expect(decision.status).toBe('PAID')
  })

  it('allows mark-unpaid on a paid CASH booking', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'CASH',
      requestedPaid: false,
      previousMethod: 'CASH',
      previousStatus: 'PAID',
    })
    expect(decision).toEqual({
      method: 'CASH',
      status: 'PAY_AT_CLUB',
      forcedCashForManualPaid: false,
    })
  })

  it('complimentary is always CASH+PAID', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'IPG',
      complimentary: true,
    })
    expect(decision).toMatchObject({ method: 'CASH', status: 'PAID' })
  })

  it('pay_at_club mode forces unpaid method to CASH', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'IPG',
      requestedPaid: false,
      paymentsMode: 'pay_at_club',
    })
    expect(decision).toEqual({
      method: 'CASH',
      status: 'PAY_AT_CLUB',
      forcedCashForManualPaid: false,
    })
  })

  it('locks wallet-rail PAID method', () => {
    const decision = resolveDeskPaymentWrite({
      requestedMethod: 'CASH',
      requestedPaid: true,
      previousMethod: 'PAID',
      previousStatus: 'PAID',
    })
    expect(decision.method).toBe('PAID')
    expect(decision.error?.statusMessage).toBe(DESK_PAYMENT_METHOD_LOCKED)
  })
})

describe('athleteAttemptedDeskCashConfirm', () => {
  it('flags a cash method, even without PAID', () => {
    expect(athleteAttemptedDeskCashConfirm({ paymentMethod: 'CASH' })).toBe(true)
  })

  it('flags CASH + PAID', () => {
    expect(athleteAttemptedDeskCashConfirm({ paymentMethod: 'CASH', paymentStatus: 'PAID' })).toBe(true)
  })

  it('flags a bare PAID status (self-mark paid)', () => {
    expect(athleteAttemptedDeskCashConfirm({ paymentStatus: 'PAID' })).toBe(true)
  })

  it('allows a normal athlete booking body with no payment fields', () => {
    expect(athleteAttemptedDeskCashConfirm({ slotId: 's1' } as never)).toBe(false)
    expect(athleteAttemptedDeskCashConfirm({})).toBe(false)
    expect(athleteAttemptedDeskCashConfirm(null)).toBe(false)
  })
})
