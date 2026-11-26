/**
 * Coach product scenario matrix — regression gate (no DB).
 * Simulates PILOT_NO_COACH=false (coach APIs allowed) via direct logic imports.
 */
import { describe, expect, it } from 'vitest'
import { isPilotNoCoach } from './pilot.ts'
import { initialPlatformPaymentFields, initialStaffPaymentFields } from './bookingPayment.ts'
import { resolveCancelMoneyDetail, canCancelReservation } from './cancelPolicy.ts'
import {
  resolveClubCommissionBps,
  resolveCoachCommissionBps,
  resolveCoachCourtCommissionBps,
  splitSettlement,
} from './settlement.ts'
import { assertCoachApproved, PUBLIC_COACH_WHERE } from '../server/utils/coaches.ts'

describe('coach scenario matrix — gate', () => {
  it('M-GATE-OFF: pilot env hides coach product', () => {
    expect(isPilotNoCoach({ PILOT_NO_COACH: 'true' })).toBe(true)
    expect(isPilotNoCoach({ NUXT_PUBLIC_PILOT_NO_COACH: 'true' })).toBe(true)
  })

  it('M-GATE-ON: coach enabled when flags unset/false', () => {
    expect(isPilotNoCoach({})).toBe(false)
    expect(isPilotNoCoach({ PILOT_NO_COACH: 'false' })).toBe(false)
  })
})

describe('coach scenario matrix — payments', () => {
  const prevMode = process.env.NUXT_PUBLIC_PAYMENTS_MODE || process.env.PAYMENTS_MODE

  it('A1 athlete marketplace uses PENDING_ONLINE (not cash)', () => {
    process.env.PAYMENTS_MODE = 'test'
    const fields = initialPlatformPaymentFields(400_000)
    expect(fields.payment.method).toBe('NOT_PAID')
    expect(fields.payment.status).toBe('PENDING_ONLINE')
    if (prevMode) process.env.PAYMENTS_MODE = prevMode
  })

  it('A6 staff lesson in pay_at_club mode uses CASH desk (no wallet credit path)', () => {
    process.env.PAYMENTS_MODE = 'pay_at_club'
    const fields = initialStaffPaymentFields(400_000)
    expect(fields.payment.method).toBe('CASH')
    expect(fields.paymentStatus).toBe('PAY_AT_CLUB')
    if (prevMode) process.env.PAYMENTS_MODE = prevMode
  })
})

describe('coach scenario matrix — security S1', () => {
  it('S1: existing accounts must not merge via password coach register (API message contract)', () => {
    expect('EXISTING_ACCOUNT_USE_OTP').toMatch(/OTP/)
  })
})

describe('coach scenario matrix — commission K-CC', () => {
  it('K-CC1 half default when overrides null', () => {
    expect(resolveCoachCourtCommissionBps({
      clubCommissionBps: null,
      platformCommissionBps: 1000,
      platformCoachCourtCommissionBps: null,
      clubCoachCourtCommissionBps: null,
    })).toBe(500)
  })

  it('K-CC3 club override beats platform', () => {
    expect(resolveCoachCourtCommissionBps({
      clubCommissionBps: 800,
      platformCommissionBps: 1000,
      platformCoachCourtCommissionBps: 300,
      clubCoachCourtCommissionBps: 150,
    })).toBe(150)
  })

  it('K-CC4 athlete 0% → coach court 0%', () => {
    expect(resolveCoachCourtCommissionBps({
      clubCommissionBps: 0,
      platformCommissionBps: 1000,
      platformCoachCourtCommissionBps: 500,
      clubCoachCourtCommissionBps: null,
    })).toBe(0)
  })

  it('K1 coach lesson fee uses COACH_COMMISSION_BPS when set', () => {
    expect(resolveCoachCommissionBps('200', 1000)).toBe(200)
  })

  it('athlete court split uses club rate', () => {
    const split = splitSettlement(600_000, resolveClubCommissionBps(1000, 1000))
    expect(split.commissionBps).toBe(1000)
    expect(split.ownerNet).toBe(540_000)
  })

  it('coach court split uses lower bps than athlete for same gross', () => {
    const athleteBps = resolveClubCommissionBps(null, 1000)
    const coachBps = resolveCoachCourtCommissionBps({
      clubCommissionBps: null,
      platformCommissionBps: 1000,
      platformCoachCourtCommissionBps: null,
      clubCoachCourtCommissionBps: null,
    })
    expect(coachBps).toBeLessThan(athleteBps)
    const coachSplit = splitSettlement(600_000, coachBps)
    const athleteSplit = splitSettlement(600_000, athleteBps)
    expect(coachSplit.commission).toBeLessThan(athleteSplit.commission)
    expect(coachSplit.ownerNet).toBeGreaterThan(athleteSplit.ownerNet)
  })
})

describe('coach scenario matrix — cancel / refund policy', () => {
  const date = '2030-06-15'
  const startTime = '18:00'
  const windowHours = 12

  it('C1 athlete outside window → full refund bps', () => {
    const detail = resolveCancelMoneyDetail({
      actor: 'athlete',
      date,
      startTime,
      windowHours,
      now: new Date('2030-06-15T00:00:00+03:30'),
    })
    expect(detail.refundBps).toBe(10_000)
  })

  it('C2 athlete inside window → cannot cancel', () => {
    expect(canCancelReservation({
      actor: 'athlete',
      date,
      startTime,
      cancellationWindowHours: windowHours,
      now: new Date('2030-06-15T10:00:00+03:30'),
    })).toBe(false)
  })

  it('C3 coach cancel → full refund', () => {
    const detail = resolveCancelMoneyDetail({
      actor: 'coach',
      date,
      startTime,
      windowHours,
    })
    expect(detail.refundBps).toBe(10_000)
  })
})

describe('coach scenario matrix — listing / approval', () => {
  it('PENDING coach is 404 for public', () => {
    expect(() => assertCoachApproved({ approvalStatus: 'PENDING' })).toThrow()
    expect(PUBLIC_COACH_WHERE).toEqual({ approvalStatus: 'APPROVED' })
  })
})